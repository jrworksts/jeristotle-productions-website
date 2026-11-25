/** One authorized November 18 batch. No alternative sender, import capability, or schema.
 * Public registration input is reviewId/reviewHash only. Authority lives in the verified
 * sponsored-review adapter; cron bodies/names never select a batch or scheduler identity.
 * Deploy/mount this source before owner registration. Tests mock every external boundary.
 */
import { parse as parseCookie } from 'cookie';
import { and, eq, inArray } from 'drizzle-orm';
import type { Request, Response } from 'express';
import type { TrpcContext } from './_core/context';
import { ENV } from './_core/env';
import { sdk } from './_core/sdk';
import { createHeartbeatJob } from './_core/heartbeat';
import { notifyOwner } from './_core/notification';
import { COOKIE_NAME, JERISTOTLE_EMAIL, CHAMBER_GROWTH_URL } from '../shared/const';
import { getOutreachLocalMoment } from '../shared/outreachSchedule';
import { hustleCampaigns, hustleEvents, hustleMessages } from '../drizzle/schema';
import { getDb } from './db';
import { authenticateOutreach, withOutreachDeadline } from './outreachDeadline';
import { runHustleMaintenance } from './hustleAutomation';
import { sendJeristotleHtmlEmail } from './inquiryEmail';
import {
  readHustleFirstBatchConsent,
  writeHustleFirstBatchJobBinding,
  readHustleFirstBatchJobBinding,
} from './hustleSponsoredReviewDb';

export const HUSTLE_FIRST_BATCH_PATH = '/api/scheduled/hustle-first-batch';
export const HUSTLE_FIRST_BATCH_CRON = '0 0 15 18 11 *';
export const HUSTLE_FIRST_BATCH_FAILURE_SUBJECT = 'Corpus Christi Hustle first-batch failure: November18';
const NOT_BEFORE = '2026-11-18T15:00:00Z';
const EXPIRES_AT = '2026-11-19T00:00:00Z';
const DAY = '2026-11-18';
const REGISTRATION_KEY = 'hustle-first-batch-register:' + DAY;
const ALERT_KEY = 'hustle-first-batch-failure:' + DAY;
const JOB_KEY = (uid: string) => 'hustle-first-batch-job:' + uid;

type Plan = {
  reviewId: string; reviewHash: string; campaignId: 1;
  canonicalSchedulerTaskUid: string; notBefore: string; expiresAt: string;
  expected: 5; initialMessageIds: number[]; prospectIds: number[]; organizations: string[];
  taskUid?: string;
};
type Counts = { expected: 5; attempted: number | null; accepted: number | null;
  failed: number | null; uncertain: number | null; unavailable?: string; affected: string[] };
const validUid = (uid: unknown): uid is string => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,65}$/.test(uid);
function assertPlan(plan: Plan | null | undefined): asserts plan is Plan {
  if (!plan || plan.campaignId !== 1 || plan.expected !== 5 || !validUid(plan.canonicalSchedulerTaskUid) ||
    plan.notBefore !== NOT_BEFORE || plan.expiresAt !== EXPIRES_AT ||
    typeof plan.reviewId !== 'string' || !/^[a-f0-9]{48}$/.test(plan.reviewId) || !/^[a-f0-9]{64}$/.test(plan.reviewHash) ||
    !Array.isArray(plan.initialMessageIds) || !Array.isArray(plan.prospectIds) || !Array.isArray(plan.organizations) ||
    plan.initialMessageIds.length !== 5 || plan.prospectIds.length !== 5 || plan.organizations.length !== 5 ||
    new Set(plan.initialMessageIds).size !== 5 || new Set(plan.prospectIds).size !== 5 ||
    [...plan.initialMessageIds, ...plan.prospectIds].some(id => !Number.isSafeInteger(id) || id <= 0) ||
    plan.organizations.some(name => typeof name !== 'string' || !name.trim() || name.length > 220))
    throw new Error('Verified exact original five-message November18 consent required');
}
function clock(now: Date) { if (!Number.isFinite(now.getTime())) throw new Error('Trusted server clock required'); }
function windowOpen(plan: Plan, now: Date) {
  clock(now);
  return getOutreachLocalMoment(now).dateKey === DAY && now.getTime() >= Date.parse(plan.notBefore) && now.getTime() < Date.parse(plan.expiresAt);
}
async function database() { const db = await getDb(); if (!db) throw new Error('Authoritative first-batch database unavailable'); return db; }
async function lockCampaign(tx: any) {
  const [campaign] = await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id, 1)).for('update');
  if (!campaign) throw new Error('Existing authoritative campaign1 required');
}
async function event(tx: any, key: string) {
  const rows = await tx.select().from(hustleEvents).where(and(eq(hustleEvents.campaignId, 1), eq(hustleEvents.eventKey, key))).limit(1);
  return rows[0] as typeof hustleEvents.$inferSelect | undefined;
}
async function append(tx: any, key: string, type: string, detail: unknown) {
  const detailJson = JSON.stringify(detail);
  if (Buffer.byteLength(detailJson) >= 60_000) throw new Error('First-batch event exceeds bounded storage');
  await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: key, eventType: type, detailJson });
}
function actualOwner(ctx: TrpcContext) {
  const user = ctx.user as (NonNullable<TrpcContext['user']> & { isCron?: boolean; taskUid?: string }) | null;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.isCron || user.taskUid ||
    user.openId.startsWith('cron_') || !ENV.ownerOpenId || user.openId !== ENV.ownerOpenId)
    throw new Error('Actual authenticated non-cron Jeremy application owner required');
  const token = parseCookie(ctx.req.headers.cookie ?? '')[COOKIE_NAME];
  // The SDK's empty-token project-owner fallback MUST NOT be used here.
  if (!token?.trim()) throw new Error('Current authenticated application session cookie required');
  return token;
}

/** Owner route must pass actual authenticated ctx, not body-derived user/actor fields.
 * Intent commits BEFORE SDK. Every creation/binding ambiguity remains held forever;
 * registration replay never calls the platform, even after a definitively failed create.
 */
export async function registerHustleFirstBatch(ctx: TrpcContext, input: { reviewId: string; reviewHash: string }, now = new Date()) {
  const token = actualOwner(ctx); clock(now);
  if (!input || Object.keys(input).sort().join(',') !== 'reviewHash,reviewId' ||
    !/^[a-f0-9]{48}$/.test(input.reviewId) || !/^[a-f0-9]{64}$/.test(input.reviewHash)) throw new Error('Exact reviewId/reviewHash input only');
  if (process.env.NODE_ENV !== 'production') throw new Error('Deployed production owner registration required; no development schedule creation');
  if (now.getTime() >= Date.parse(NOT_BEFORE)) throw new Error('Do not register a missed or late first-batch schedule');
  const db = await database();
  const reservation = await db.transaction(async tx => {
    await lockCampaign(tx);
    if (await event(tx, 'hustle-first-batch-task-manifest:2026-11-18') || await event(tx, 'hustle-first-batch-shared-attempt:2026-11-18'))
      throw new Error('First batch already reserved by the existing task or an execution intent; no second native schedule');
    const plan = await readHustleFirstBatchConsent(tx, input, now) as Plan | null;
    assertPlan(plan);
    const previous = await event(tx, REGISTRATION_KEY);
    if (previous) {
      const recorded = await event(tx, REGISTRATION_KEY + ':bound');
      if (recorded) {
        const uid = JSON.parse(recorded.detailJson).taskUid;
        if (validUid(uid)) {
          const binding = await readHustleFirstBatchJobBinding(tx, uid, now) as Plan | null;
          assertPlan(binding);
          if (binding.reviewId === input.reviewId && binding.reviewHash === input.reviewHash && binding.taskUid === uid)
            return { held: false as const, existingUid: uid, plan };
        }
      }
      return { held: true as const, plan };
    }
    await append(tx, REGISTRATION_KEY, 'hustle_first_batch_registration_intent', {
      reviewId: plan.reviewId, reviewHash: plan.reviewHash, notBefore: plan.notBefore,
      expiresAt: plan.expiresAt, expected: 5, state: 'held-before-platform', noAutomaticRetry: true,
    });
    return { held: false as const, plan };
  });
  if (reservation.held) return { registered: false, held: true, inspectionRequired: true, noAutomaticRetry: true, noSends: true };
  if ('existingUid' in reservation) return { registered: true, taskUid: reservation.existingUid, alreadyRecorded: true, noSends: true };
  let taskUid: string | undefined;
  try {
    const job = await createHeartbeatJob({
      name: 'hustle-first-batch-november18-2026', cron: HUSTLE_FIRST_BATCH_CRON,
      path: HUSTLE_FIRST_BATCH_PATH, method: 'POST', payload: {},
      description: 'Only the unchanged approved first five, Nov18 2026 09:00 America/Chicago. Signed one-day expiry; never annual/catch-up sends.',
    }, token);
    if (!validUid(job.taskUid)) throw new Error('Platform returned no valid task UID');
    taskUid = job.taskUid;
    await db.transaction(async tx => {
      await lockCampaign(tx);
      await writeHustleFirstBatchJobBinding(tx, ctx, reservation.plan, taskUid!, now);
      const bound = await readHustleFirstBatchJobBinding(tx, taskUid!, now) as Plan | null;
      assertPlan(bound);
      if (bound.taskUid !== taskUid || bound.reviewId !== input.reviewId || bound.reviewHash !== input.reviewHash || !(await event(tx, JOB_KEY(taskUid!))))
        throw new Error('Returned UID not durably bound to verified exact consent');
      await append(tx, REGISTRATION_KEY + ':bound', 'hustle_first_batch_registration_bound', { taskUid, reviewId: input.reviewId, reviewHash: input.reviewHash });
    });
    return { registered: true, taskUid, notBefore: NOT_BEFORE, expiresAt: EXPIRES_AT, nextExecutionAt: job.nextExecutionAt ?? null, noSends: true };
  } catch {
    // A committed intent is the fence even if recording this diagnostic also fails.
    try { await db.transaction(async tx => { await lockCampaign(tx); if (!(await event(tx, REGISTRATION_KEY + ':uncertain')))
      await append(tx, REGISTRATION_KEY + ':uncertain', 'hustle_first_batch_registration_uncertain', { taskUid: taskUid ?? null, inspectionRequired: true, noAutomaticRetry: true }); }); } catch { /* held original intent survives */ }
    return { registered: false, held: true, taskUid: taskUid ?? null, inspectionRequired: true, noAutomaticRetry: true, error: 'Platform creation or durable UID binding unconfirmed; inspect the existing intent/job, never create another automatically.', noSends: true };
  }
}

/** SELECT only the five signed message IDs. Unavailable/partial projection is UNKNOWN,
 * not zero. Accepted means actual attemptedAt+smtpAcceptedAt+provider ID, not inbox delivery.
 */
async function countsFor(plan: Plan): Promise<Counts> {
  try {
    const db = await database();
    const rows = await db.select().from(hustleMessages).where(and(eq(hustleMessages.campaignId, 1), inArray(hustleMessages.id, plan.initialMessageIds))).limit(6);
    if (rows.length !== 5 || new Set(rows.map(m => m.id)).size !== 5) throw new Error('Five actual signed message rows not available');
    let attempted = 0, accepted = 0, failed = 0, uncertain = 0;
    const affected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = rows.find(row => row.id === plan.initialMessageIds[i]);
      if (!m || m.campaignId !== 1 || m.prospectId !== plan.prospectIds[i] || m.sequenceStep !== 0 ||
        typeof m.status !== 'string' || ['attemptedAt', 'smtpAcceptedAt', 'providerMessageId'].some(key => !(key in m)) ||
        [m.attemptedAt, m.smtpAcceptedAt].some(at => at !== null && (!(at instanceof Date) || !Number.isFinite(at.getTime()))) ||
        (m.smtpAcceptedAt && (!m.attemptedAt || !m.providerMessageId)) ||
        (m.status === 'sent' && (!m.attemptedAt || !m.smtpAcceptedAt || !m.providerMessageId))) throw new Error('Exact mapping or actual SMTP receipt incomplete');
      if (m.attemptedAt) attempted++;
      const receipt = Boolean(m.attemptedAt && m.smtpAcceptedAt && m.providerMessageId);
      if (receipt) accepted++;
      else {
        affected.push(plan.organizations[i]);
        if (m.status === 'uncertain' || (m.attemptedAt && m.status !== 'failed')) uncertain++;
        else if (m.status === 'failed') failed++;
      }
    }
    return { expected: 5, attempted, accepted, failed, uncertain, affected };
  } catch {
    return { expected: 5, attempted: null, accepted: null, failed: null, uncertain: null,
      unavailable: 'Actual signed-message accounting unavailable; no zero counts inferred.', affected: plan.organizations.slice() };
  }
}
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
async function failure(plan: Plan & { taskUid: string }, counts: Counts, cause: string) {
  const description = [
    'Corpus Christi Hustle first-batch exception: November18',
    `Expected: 5; attempted: ${counts.attempted ?? 'unknown'}; SMTP accepted: ${counts.accepted ?? 'unknown'}; failed: ${counts.failed ?? 'unknown'}; uncertain: ${counts.uncertain ?? 'unknown'}.`,
    ...(counts.unavailable ? [counts.unavailable] : []),
    `Affected businesses: ${counts.affected.join(', ') || 'none identified in actual receipt rows'}.`,
    `Cause: ${cause}`,
    'Safe recovery: inspect dashboard, health/auth/approval and actual provider receipts. Never resend any attempted/uncertain email. Only definitively unsent eligible originals may proceed under the existing sender within Nov18 window and five-new-per-Chicago-day cap; otherwise hold and report.',
    'SMTP acceptance is not proof of inbox delivery. This exception uses the existing internal SMTP helper, not an independent Gmail transport.',
    `Dashboard: ${CHAMBER_GROWTH_URL}#hustle`,
  ].join('\n\n');
  let db: Awaited<ReturnType<typeof database>>;
  try {
    db = await database();
    const reserved = await db.transaction(async tx => {
      await lockCampaign(tx);
      const fresh = await readHustleFirstBatchJobBinding(tx, plan.taskUid) as Plan | null;
      assertPlan(fresh);
      if (fresh.taskUid !== plan.taskUid || fresh.reviewId !== plan.reviewId || fresh.reviewHash !== plan.reviewHash) throw new Error('Notification requires actual verified job binding');
      if (await event(tx, ALERT_KEY)) return false;
      // Transaction COMMIT is awaited before SMTP; intent is never deleted on ambiguity.
      await append(tx, ALERT_KEY, 'hustle_first_batch_failure_email_intent', {
        taskUid: plan.taskUid, reviewId: plan.reviewId, reviewHash: plan.reviewHash,
        to: JERISTOTLE_EMAIL, subject: HUSTLE_FIRST_BATCH_FAILURE_SUBJECT, counts, cause, noAutomaticRetry: true,
      });
      return true;
    });
    if (!reserved) {
      const receipt = await event(db, ALERT_KEY + ':accepted');
      return { emailAccepted: Boolean(receipt), emailDeliveryVerified: false, deduplicated: true,
        notificationFallback: receipt ? 'not-needed' : 'prior-intent-held-unverified', noAutomaticRetry: true };
    }
  } catch {
    // Never open SMTP without durable intent. No fabricated independent transport.
    return { emailAccepted: false, emailDeliveryVerified: false, notificationFallback: 'required-but-durable-intent-unavailable', inspectionRequired: true };
  }
  try {
    const sent = await sendJeristotleHtmlEmail({ to: JERISTOTLE_EMAIL, subject: HUSTLE_FIRST_BATCH_FAILURE_SUBJECT,
      text: description, html: `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#171717"><table role="presentation" style="max-width:600px;margin:24px auto;border-top:6px solid #ffb627"><tr><td style="padding:24px"><h1 style="font-size:22px">First-batch exception</h1>${description.split('\n\n').map(p => `<p style="font-size:14px;line-height:1.6">${escape(p)}</p>`).join('')}</td></tr></table></body></html>` });
    if (!sent.configured || !sent.sent || !sent.messageId) throw new Error('Internal SMTP acceptance unconfirmed');
    await append(db, ALERT_KEY + ':accepted', 'hustle_first_batch_failure_email_accepted', { taskUid: plan.taskUid, messageId: sent.messageId, smtpAccepted: true, deliveryVerified: false });
    return { emailAccepted: true, emailDeliveryVerified: false, notificationFallback: 'not-needed' };
  } catch {
    // Possible SMTP acceptance or receipt-persistence loss never repeats the email.
    let notificationAccepted = false;
    try { notificationAccepted = await notifyOwner({ title: HUSTLE_FIRST_BATCH_FAILURE_SUBJECT,
      content: description + '\n\nFailure email acceptance is UNVERIFIED. This is an app notification fallback, NOT an email.' }); } catch { /* report unverified */ }
    try { await append(db, ALERT_KEY + ':uncertain', 'hustle_first_batch_failure_email_uncertain', {
      taskUid: plan.taskUid, emailAcceptanceUnverified: true, notificationAccepted, noAutomaticRetry: true,
    }); } catch { /* intent remains held */ }
    return { emailAccepted: false, emailAcceptanceUnverified: true, emailDeliveryVerified: false,
      notificationFallback: notificationAccepted ? 'app-notification-accepted-not-email' : 'app-notification-unverified', noAutomaticRetry: true };
  }
}

/** Only invoked with server-verified durable metadata, never a raw cron payload.
 * canonicalSchedulerTaskUid delegates to the SAME existing sender; its claim/attempt,
 * exact approval/reply/stop/lease/quota/budget guards remain authoritative and unchanged.
 */
async function runVerified(plan: Plan & { taskUid: string }, now: Date) {
  if (!windowOpen(plan, now)) return { ok: true, skipped: now.getTime() < Date.parse(plan.notBefore) ? 'not-before-November18-09Central' : 'expired-November18-only-no-anniversary', noSends: true };
  const { claimHustleFirstBatchExecution } = await import('./hustleTaskFirstBatch');
  const fence = await claimHustleFirstBatchExecution(1, plan.reviewId, plan.reviewHash, `native:${plan.taskUid}`, now);
  if (!fence.claimed) return { ok: true, skipped: 'shared-first-batch-attempt-held', noSends: true, inspectionRequired: true, noAutomaticRetry: true };
  let cause = 'Existing sender did not confirm all five actual initial-message receipts.';
  try {
    const result = await runHustleMaintenance({ taskUid: plan.canonicalSchedulerTaskUid, now, initialMessageIds: plan.initialMessageIds });
    if ('skipped' in result && result.skipped) cause = 'Existing sender blocked: ' + result.skipped;
    else if ('uncertain' in result && result.uncertain) cause = 'Existing sender reported uncertain SMTP/persistence; reconcile before any recovery.';
  } catch { cause = 'Existing maintenance could not safely finish: health/auth/approval, bounded runtime or SMTP/persistence failure. Inspect actual receipts; no automatic resend.'; }
  const counts = await countsFor(plan);
  if (counts.accepted === 5 && counts.attempted === 5 && counts.failed === 0 && counts.uncertain === 0)
    return { ok: true, counts, noSuccessEmail: true };
  return { ok: false, partial: counts.accepted !== null && counts.accepted > 0, inspectionRequired: true,
    counts, cause, failureNotification: await failure(plan, counts, cause) };
}

/** Parent mounts at HUSTLE_FIRST_BATCH_PATH. No body, job name, or owner flag is read.
 * 2xx on uncertain execution prevents platform error retries of consequential work.
 */
export async function hustleFirstBatchScheduledHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await withOutreachDeadline(() => authenticateOutreach(options => sdk.authenticateRequest(req, options)));
    if (!user.isCron || !validUid(user.taskUid) || !user.openId.startsWith('cron_')) return res.status(403).json({ error: 'authenticated-cron-only' });
    taskUid = user.taskUid;
    const db = await database();
    // Explicit indexed lookup, then adapter verifies its signature and original consent.
    if (!(await event(db, JOB_KEY(taskUid)))) return res.json({ ok: true, skipped: 'unbound-taskUID', noSends: true });
    const plan = await readHustleFirstBatchJobBinding(db, taskUid, new Date()) as Plan | null;
    assertPlan(plan);
    if (plan.taskUid !== taskUid) throw new Error('Authenticated taskUID does not match verified binding');
    return res.json(await runVerified(plan as Plan & { taskUid: string }, new Date()));
  } catch {
    return res.status(200).json({ ok: false, inspectionRequired: true, noSendsClaimed: true,
      error: 'First-batch auth/binding/database unavailable; sending held. No verified metadata means no SMTP alert authority.',
      failureEmail: 'unverified-not-sent', notificationFallback: 'requires-existing-owner-audit', context: { taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
  }
}
