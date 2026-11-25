import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { createConnection, type Connection } from "mysql2";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Duplex } from "node:stream";

// Actual native activity is 30s. Reserve 3s for ingress/serialization/platform overhead.
export const OUTREACH_CALLBACK_BUDGET_MS = 27_000;
export const OUTREACH_AUTH_BUDGET_MS = 3_000;
export const OUTREACH_INBOX_BUDGET_MS = 8_000;
export const OUTREACH_SMTP_BUDGET_MS = 5_000;
export const OUTREACH_PERSISTENCE_BUDGET_MS = 4_000;
const scope = new AsyncLocalStorage<Runtime>();
type Runtime = {
  deadline: number;
  monotonicDeadline: number;
  startedAt: number;
  phase: OutreachPhase;
  controller: AbortController;
  disposers: Set<() => void>;
  expiry: Promise<never>;
  abort: (error: Error) => void;
  database?: Promise<MySql2Database>;
};
type OutreachPhase = 'callback' | 'authentication' | 'hustle-inbox' | 'hustle-claim' | 'hustle-attempt' | 'hustle-smtp' | 'hustle-persistence';
const phases: OutreachPhase[] = ['callback','authentication','hustle-inbox','hustle-claim','hustle-attempt','hustle-smtp','hustle-persistence'];
const failureCodes = ['absolute-deadline','stage-deadline','callback-closed','imap-no-connection','imap-authentication','imap-error','sql-handshake'] as const;
function runtimeFailure(code: typeof failureCodes[number], message: string, active = scope.getStore()) {
  return Object.assign(new Error(message), { outreachCode: code, outreachPhase: active?.phase ?? 'callback', outreachElapsedMs: active ? Math.max(0, Math.round(performance.now()-active.startedAt)) : 0 });
}
/** Diagnostic fields are allowlisted; never serialize provider errors, messages, commands or credentials. */
export function outreachFailureDiagnostic(error: unknown) {
  const e = error as { outreachCode?: unknown; outreachPhase?: unknown; outreachElapsedMs?: unknown } | null;
  return { code: failureCodes.includes(e?.outreachCode as any) ? String(e?.outreachCode) : 'unknown', phase: phases.includes(e?.outreachPhase as any) ? String(e?.outreachPhase) : 'unknown', elapsedMs: typeof e?.outreachElapsedMs === 'number' && Number.isFinite(e.outreachElapsedMs) ? Math.max(0, Math.round(e.outreachElapsedMs)) : null };
}
export function outreachPhase(phase: OutreachPhase) { const active = scope.getStore(); if (active) active.phase = phase; }
export function outreachRuntimeActive() { return Boolean(scope.getStore()); }
export function outreachDeadline() {
  return scope.getStore()?.deadline ?? Date.now() + OUTREACH_CALLBACK_BUDGET_MS;
}
export function outreachDeadlineCheck(reserveMs = 0) {
  const active = scope.getStore();
  if (active && (active.controller.signal.aborted || Date.now() + reserveMs >= active.deadline || performance.now() + reserveMs >= active.monotonicDeadline))
    throw runtimeFailure('absolute-deadline', "Outreach absolute deadline reached; attempted messages never retry");
}
export function outreachHasSendBudget() {
  try { outreachDeadlineCheck(OUTREACH_SMTP_BUDGET_MS + OUTREACH_PERSISTENCE_BUDGET_MS); return true; }
  catch { return false; }
}
/** Register the raw handle before handshake. No graceful flush is used for cancellation. */
export function ownOutreachResource(dispose: () => void) {
  const active = scope.getStore();
  outreachDeadlineCheck();
  active?.disposers.add(dispose);
  return () => active?.disposers.delete(dispose);
}
export function ownOutreachImap(client: { close: () => void; on?: (event: 'error', listener: (error: unknown) => void) => unknown }) {
  const active = scope.getStore();
  let released = false;
  // Install before handshake or raw-socket disposal. Keep this listener on the owned
  // client after release: close may emit asynchronously after the callback has ended.
  // An active error aborts ALL owned work; a late teardown error cannot authorize work.
  client.on?.('error', error => {
    const e = error as { code?: unknown; authenticationFailed?: unknown } | null;
    const code = e?.code === 'NoConnection' ? 'imap-no-connection' : e?.authenticationFailed === true ? 'imap-authentication' : 'imap-error';
    const failure = runtimeFailure(code, 'Owned IMAP connection failed; sending blocked', active);
    console.warn('[Outreach owned IMAP]', outreachFailureDiagnostic(failure));
    if (!released) active?.abort(failure);
  });
  const dispose = () => {
    const raw = client as typeof client & { socket?: Duplex; _socket?: Duplex; tlsSocket?: Duplex };
    for (const socket of [raw.socket, raw._socket, raw.tlsSocket]) { try { socket?.destroy(); } catch {} }
    try { client.close(); } catch {}
  };
  const release = ownOutreachResource(dispose);
  return () => { released = true; release(); };
}
/** A race is only settlement; abort destroys every owned socket and blocks later DB work. */
export async function withOutreachDeadline<T>(run: () => Promise<T>, deadline?: number): Promise<T> {
  const parent = scope.getStore();
  if (parent) { outreachDeadlineCheck(); return run(); }
  const end = Math.min(deadline ?? Infinity, Date.now() + OUTREACH_CALLBACK_BUDGET_MS);
  let rejectExpiry!: (error: Error) => void;
  const expiry = new Promise<never>((_, reject) => { rejectExpiry = reject; });
  void expiry.catch(() => {});
  const active: Runtime = {
    deadline: end, monotonicDeadline: performance.now() + Math.max(0, end - Date.now()),
    startedAt: performance.now(), phase: 'callback',
    controller: new AbortController(), disposers: new Set(), expiry,
    abort: error => {
      if (active.controller.signal.aborted) return;
      active.controller.abort();
      for (const dispose of Array.from(active.disposers)) { try { dispose(); } catch {} }
      rejectExpiry(error);
    },
  };
  const timer = setTimeout(() => active.abort(runtimeFailure('absolute-deadline', "Outreach 27s absolute callback deadline; inspect, never resend attempts", active)), Math.max(1, end - Date.now()));
  try {
    return await scope.run(active, async () => {
      outreachDeadlineCheck();
      const result = await Promise.race([run(), expiry]);
      // Timer delivery can lag a blocked event loop; late completion is never success.
      outreachDeadlineCheck();
      return result;
    });
  } finally {
    clearTimeout(timer);
    active.abort(runtimeFailure('callback-closed', "Outreach callback closed; no detached work permitted", active));
  }
}
export async function withOutreachStage<T>(budgetMs: number, run: () => Promise<T>): Promise<T> {
  const active = scope.getStore();
  if (!active) return withOutreachDeadline(() => withOutreachStage(budgetMs, run));
  outreachDeadlineCheck();
  const stageEnd = Math.min(active.deadline, Date.now() + budgetMs);
  const monotonicEnd = Math.min(active.monotonicDeadline, performance.now() + budgetMs);
  const timer = setTimeout(() => active.abort(runtimeFailure('stage-deadline', "Outreach stage deadline exceeded; sending blocked", active)), Math.max(1, Math.min(budgetMs, active.deadline - Date.now())));
  try {
    const result = await Promise.race([run(), active.expiry]);
    if (Date.now() >= stageEnd || performance.now() >= monotonicEnd) {
      active.abort(runtimeFailure('stage-deadline', "Outreach completed stage exceeded absolute deadline; sending blocked"));
      throw runtimeFailure('stage-deadline', "Outreach stage deadline exceeded; sending blocked");
    }
    outreachDeadlineCheck();
    return result;
  }
  finally { clearTimeout(timer); }
}
/** Only callback SQL uses an owned connection; the unrelated application pool is never destroyed. */
export async function getOutreachScopedDb(): Promise<MySql2Database | undefined> {
  const active = scope.getStore();
  if (!active) return undefined;
  outreachDeadlineCheck();
  if (!process.env.DATABASE_URL) throw new Error("Outreach database unavailable");
  if (!active.database) active.database = withOutreachStage(3_000, async () => {
    let connection: Connection | undefined;
    ownOutreachResource(() => {
      try { (connection as (Connection & { stream?: Duplex }) | undefined)?.stream?.destroy(); } catch {}
      try { connection?.destroy(); } catch {}
    });
    connection = createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 3_000 });
    await new Promise<void>((resolve, reject) => connection!.connect(error => error ? reject(runtimeFailure('sql-handshake', "Outreach SQL handshake failed")) : resolve()));
    outreachDeadlineCheck();
    return drizzle(connection.promise());
  });
  return active.database;
}
export async function authenticateOutreach<T>(authenticate: (options: { signal: AbortSignal }) => Promise<T>): Promise<T> {
  outreachPhase('authentication');
  return withOutreachStage(OUTREACH_AUTH_BUDGET_MS, async () => {
    const active = scope.getStore()!;
    const result = await authenticate({ signal: active.controller.signal });
    outreachDeadlineCheck();
    return result;
  });
}

export function outreachUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let depth = 0; error && typeof error === "object" && depth < 6 && !seen.has(error); depth++) {
    seen.add(error);
    const current = error as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (current.code === "ER_DUP_ENTRY" || current.errno === 1062 ||
      (typeof current.message === "string" && /duplicate(?: entry| unique)|unique constraint|\b1062\b/i.test(current.message))) return true;
    error = current.cause;
  }
  return false;
}
