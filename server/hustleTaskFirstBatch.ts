/** Server-private adapter for the EXISTING managed task/timer, never a native job UID.
 * No timer registration, campaign initialization, approval mutation, or alternate sender.
 * Parent CLI attests direct task provenance/release; parent maintenance owns every send.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from './_core/env';
import { notifyOwner } from './_core/notification';
import { getDb } from './db';
import { hustleCampaigns, hustleEvents, hustleMessages } from '../drizzle/schema';
import { JERISTOTLE_EMAIL, CHAMBER_GROWTH_URL } from '../shared/const';
import { getOutreachLocalMoment } from '../shared/outreachSchedule';
import { sponsoredCanonicalJson } from '../shared/hustleSponsoredReview';
import release from '../shared/outreachRepairRelease.json';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import {
  HUSTLE_MANAGED_OPERATOR_PINS as pins, isHustleManagedOperatorActor,
  verifyHustleManagedOperatorGrant, type HustleManagedOperatorActor,
} from './hustleManagedOperatorGrant';
import {
  HUSTLE_SPONSORED_SERVER_SOURCE_HASH, readHustleFirstBatchConsent,
  readHustleSponsoredKnownState, readHustleSponsoredAuthorization,
  type HustleFirstBatchConsent,
} from './hustleSponsoredReviewDb';
import { hasHustleCompleteInboxAnchor } from './hustleSponsoredRuntime';
import { hustleEmailTransportConfigured } from './hustleEmail';
import { sendJeristotleHtmlEmail } from './inquiryEmail';

import { checkHustleInbox } from './hustleInbox';
import { withOutreachDeadline, outreachDeadline, OUTREACH_PERSISTENCE_BUDGET_MS } from './outreachDeadline';
import { assertHustleTaskPreparationWindow, hustleTaskRegistrationWasAuthorized,
  hustleTaskWindow, HUSTLE_RENEWED_START_PINS } from './hustleLateStartAuthorization';
import { readHustleBeforeClaimRecoveryTaskManifest } from './hustleBeforeClaimRecovery';
import { readContinuationTaskManifest, readContinuationExecutionScope } from './hustlePartialContinuation';

export const HUSTLE_TASK_FIRST_BATCH_LABEL = 'managed-task:' + pins.executionTaskId;
export const HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY = 'hustle-first-batch-task-manifest:2026-11-18';
export const HUSTLE_RENEWED_TASK_FIRST_BATCH_MANIFEST_KEY = 'hustle-first-batch-task-manifest:2026-11-19';
export const HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY = 'hustle-first-batch-shared-attempt:2026-11-18';
const DAY = '2026-11-18';
const NOT_BEFORE = '2026-11-18T15:00:00Z';
const EXPIRES_AT = '2026-11-19T00:00:00Z';
const NATIVE_REGISTER_KEY = 'hustle-first-batch-register:' + DAY;
const FAILURE_KEY = 'hustle-first-batch-failure:' + DAY;
const FAILURE_SUBJECT = 'Corpus Christi Hustle first-batch failure: November18';
const RESULT_KEY = HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY + ':result';
const LATE_AUTH_KEY = 'hustle-first-batch-late-start:' + DAY;
const MODULE_PATH = 'server/hustleTaskFirstBatch.ts';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const reviewSchema = z.object({ reviewId: z.string().regex(/^[a-f0-9]{48}$/), reviewHash: sha }).strict();
const ids = z.array(z.number().int().safe().positive()).length(5).refine(v => new Set(v).size === 5);
const consentSchema = reviewSchema.extend({ campaignId: z.literal(1),
  canonicalSchedulerTaskUid: z.string().regex(/^[A-Za-z0-9_-]{1,65}$/),
  notBefore: z.enum([NOT_BEFORE, HUSTLE_RENEWED_START_PINS.notBefore]),
  expiresAt: z.enum([EXPIRES_AT, HUSTLE_RENEWED_START_PINS.expiresAt]), expected: z.literal(5),
  initialMessageIds: ids, prospectIds: ids,
  organizations: z.array(z.string().trim().min(1).max(220)).length(5),
}).strict();
const manifestSchema = z.object({ version: z.literal(1), kind: z.literal('hustle_first_batch_task_manifest'),
  executionKind: z.literal('managed-task-existing-timer-fallback'),
  executionTaskId: z.literal(pins.executionTaskId), originatingTaskId: z.literal(pins.originatingTaskId),
  projectId: z.literal(pins.projectId), taskLabel: z.literal(HUSTLE_TASK_FIRST_BATCH_LABEL),
  serverSourceHash: sha, moduleSourceHash: sha,
  registeredAt: z.number().int().safe().positive(),
  actor: z.custom<HustleManagedOperatorActor>(isHustleManagedOperatorActor), consent: consentSchema,
}).strict();
type Manifest = z.infer<typeof manifestSchema>;
type Row = Record<string, any>;
export type HustleTaskFirstBatchCounts = { expected: 5; attempted: number | null; accepted: number | null;
  failed: number | null; uncertain: number | null; affected: string[]; unavailable?: string };
const hash = (v: unknown) => createHash('sha256').update(sponsoredCanonicalJson(v)).digest('hex');
function clock(now: Date) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Trusted server clock required');
}
function inWindow(now: Date, window = { notBefore: NOT_BEFORE, expiresAt: EXPIRES_AT }) {
  clock(now);
  const day = window.notBefore === NOT_BEFORE ? DAY : HUSTLE_RENEWED_START_PINS.dateKey;
  return getOutreachLocalMoment(now).dateKey === day && now.getTime() >= Date.parse(window.notBefore) && now.getTime() < Date.parse(window.expiresAt);
}
function manifestKey(actor: HustleManagedOperatorActor) {
  return actor.approvedBy.renewedStart ? HUSTLE_RENEWED_TASK_FIRST_BATCH_MANIFEST_KEY : HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY;
}
function resultKey(actor: HustleManagedOperatorActor) { return manifestKey(actor) + ':result'; }
function authorizationKey(actor: HustleManagedOperatorActor) {
  return actor.approvedBy.renewedStart ? 'hustle-first-batch-renewed-start:2026-11-19' : LATE_AUTH_KEY;
}
function source() {
  return sha.parse((release.sourceHashes as Record<string, string>)[MODULE_PATH]);
}
function signature(value: unknown) {
  const secret = hustleExistingSigningAuthority(ENV.cookieSecret);
  return createHmac('sha256', secret).update('jeristotle/hustle-task-first-batch/v1\n')
    .update(sponsoredCanonicalJson(value)).digest('hex');
}
function signed(value: unknown) { return { payload: value, signature: signature(value) }; }
function unpack(row: Row | undefined, key: string, kind: string): Row {
  if (!row || row.campaignId !== 1 || row.eventKey !== key || row.eventType !== kind) throw new Error('Signed task event required');
  const envelope = z.object({ payload: z.record(z.string(), z.unknown()), signature: sha }).strict().parse(JSON.parse(row.detailJson));
  if (!timingSafeEqual(Buffer.from(envelope.signature, 'hex'), Buffer.from(signature(envelope.payload), 'hex')))
    throw new Error('Task event signature mismatch');
  return envelope.payload;
}
function admit(grant: unknown, now: Date) {
  clock(now); source();
  // Always use the REAL clock as well: a caller cannot resurrect an expired grant.
  const actual = new Date(); clock(actual);
  const options = { serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, requireProductionRelease: true };
  const actor = verifyHustleManagedOperatorGrant(grant, options, actual);
  verifyHustleManagedOperatorGrant(grant, options, now);
  return actor;
}
function provenance(actor: HustleManagedOperatorActor) {
  // Fresh CLI grants may have new IDs/API-read timestamps, but never new direct sources.
  const { grantId: _grantId, approvedBy, ...identity } = actor;
  const { verifiedAt: _verifiedAt, taskApiResponseSha256: _response, ...direct } = approvedBy;
  return { ...identity, approvedBy: direct };
}
async function database() { const db = await getDb(); if (!db) throw new Error('Authoritative task first-batch database unavailable'); return db; }
async function lockCampaign(tx: any) {
  const [c] = await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id, 1)).for('update');
  if (!c || c.id !== 1) throw new Error('Existing authoritative campaign1 required');
  return c;
}
async function event(tx: any, key: string) {
  const rows = await tx.select().from(hustleEvents).where(and(eq(hustleEvents.campaignId, 1), eq(hustleEvents.eventKey, key))).limit(1);
  return rows[0] as Row | undefined;
}
async function append(tx: any, key: string, type: string, payload: unknown, sign = true) {
  const detailJson = JSON.stringify(sign ? signed(payload) : payload);
  if (Buffer.byteLength(detailJson, 'utf8') >= 60_000) throw new Error('Bounded task event storage exceeded');
  await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: key, eventType: type, detailJson });
}
async function rejectNative(tx: any) {
  const rows = await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId, 1)).limit(100001);
  if (rows.length > 100000) throw new Error('Complete registration history unavailable');
  if (rows.some((e: Row) => e.eventKey === NATIVE_REGISTER_KEY || e.eventKey?.startsWith(NATIVE_REGISTER_KEY + ':') ||
    e.eventKey?.startsWith('hustle-first-batch-job:') || e.eventType?.startsWith('hustle_first_batch_registration_') ||
    e.eventType === 'hustle_first_batch_job_binding'))
    throw new Error('Native registration intent/binding exists or is ambiguous; task fallback held for inspection');
}
async function consent(tx: any, input: { reviewId: string; reviewHash: string }, now: Date, actor?: HustleManagedOperatorActor) {
  const plan = consentSchema.parse(await readHustleFirstBatchConsent(tx, { reviewId: input.reviewId, reviewHash: input.reviewHash }, now));
  const window = actor ? hustleTaskWindow(actor) : { notBefore: NOT_BEFORE, expiresAt: EXPIRES_AT };
  if (plan.reviewId !== input.reviewId || plan.reviewHash !== input.reviewHash ||
    plan.notBefore !== window.notBefore || plan.expiresAt !== window.expiresAt) throw new Error('Exact durable consent mapping mismatch');
  return plan;
}
async function manifest(tx: any, now: Date, actor?: HustleManagedOperatorActor) {
  const continuation = await readContinuationTaskManifest(tx, now, actor);
  if (continuation) {
    const m = manifestSchema.parse(continuation);
    const actual = await consent(tx, m.consent, now, m.actor);
    if (hash(actual) !== hash(m.consent)) throw new Error('Continuation durable consent mismatch');
    return m;
  }
  const recovered = await readHustleBeforeClaimRecoveryTaskManifest(tx, now, actor);
  if (recovered) {
    const m = manifestSchema.parse(recovered);
    if (m.registeredAt > now.getTime() || !hustleTaskRegistrationWasAuthorized(m.actor, m.registeredAt))
      throw new Error('Current recovery manifest registration time/proof mismatch');
    const actual = await consent(tx, { reviewId: m.consent.reviewId, reviewHash: m.consent.reviewHash }, now, m.actor);
    if (hash(actual) !== hash(m.consent)) throw new Error('Recovery manifest durable consent replay mismatch');
    return m;
  }
  const old = await event(tx, HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY);
  const renewed = await event(tx, HUSTLE_RENEWED_TASK_FIRST_BATCH_MANIFEST_KEY);
  if (old && renewed) throw new Error('Prior task manifest exists; no cross-date renewal replay');
  const key = actor ? manifestKey(actor) : renewed ? HUSTLE_RENEWED_TASK_FIRST_BATCH_MANIFEST_KEY : HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY;
  const m = manifestSchema.parse(unpack(key === HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY ? old : renewed,
    key, 'hustle_first_batch_task_manifest'));
  if (key !== manifestKey(m.actor)) throw new Error('Task manifest date/proof mismatch');
  if (m.serverSourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH || m.moduleSourceHash !== source() ||
    m.registeredAt > now.getTime() || !hustleTaskRegistrationWasAuthorized(m.actor, m.registeredAt) ||
    (actor && hash(provenance(m.actor)) !== hash(provenance(actor)))) throw new Error('Task manifest source/provenance replay mismatch');
  if (m.actor.approvedBy.lateStart || m.actor.approvedBy.renewedStart) {
    const authKey = authorizationKey(m.actor);
    const late = unpack(await event(tx, authKey), authKey, m.actor.approvedBy.renewedStart ?
      'hustle_first_batch_renewed_start_authorization' : 'hustle_first_batch_late_start_authorization');
    if (late.registeredAt !== m.registeredAt || late.serverSourceHash !== m.serverSourceHash ||
      late.reviewId !== m.consent.reviewId || late.reviewHash !== m.consent.reviewHash ||
      hash(late.authorization) !== hash(m.actor.approvedBy.renewedStart ?? m.actor.approvedBy.lateStart)) throw new Error('Signed late-start authority mismatch');
  }
  const actual = await consent(tx, m.consent, now, m.actor);
  if (hash(actual) !== hash(m.consent)) throw new Error('Task manifest durable consent replay mismatch');
  return m;
}
function publicScope(m: Manifest) {
  return { executionKind: m.executionKind, taskLabel: m.taskLabel, executionTaskId: m.executionTaskId,
    originatingTaskId: m.originatingTaskId, reviewId: m.consent.reviewId, reviewHash: m.consent.reviewHash,
    notBefore: m.consent.notBefore, expiresAt: m.consent.expiresAt, scheduleCreated: false as const, nativeJobRegistered: false as const };
}

/** Records fallback authority, NOT a new timer or an attestation that a timer was created. */
export async function registerHustleTaskFirstBatch(grant: unknown, input: { reviewId: string; reviewHash: string }, now = new Date()) {
  const actor = admit(grant, now), request = reviewSchema.parse(input);
  assertHustleTaskPreparationWindow(actor, now);
  const db = await database();
  return db.transaction(async tx => {
    await lockCampaign(tx); await rejectNative(tx);
    const actual = await consent(tx, request, now, actor);
    if (await event(tx, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY)) throw new Error('First-batch execution already fenced; no registration retry');
    if (actor.approvedBy.renewedStart && (await event(tx, HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY) ||
      await event(tx, RESULT_KEY) || await event(tx, LATE_AUTH_KEY))) throw new Error('Prior November18 intent/manifest exists; inspect, no renewal replay');
    if (await event(tx, manifestKey(actor))) {
      const prior = await manifest(tx, now, actor);
      if (hash(prior.consent) !== hash(actual)) throw new Error('Task manifest registration replay mismatch');
      return { ...publicScope(prior), registered: true, alreadyRecorded: true, noSends: true, noAutomaticRetry: true };
    }
    const m = manifestSchema.parse({ version: 1, kind: 'hustle_first_batch_task_manifest',
      executionKind: 'managed-task-existing-timer-fallback', executionTaskId: pins.executionTaskId,
      originatingTaskId: pins.originatingTaskId, projectId: pins.projectId, taskLabel: HUSTLE_TASK_FIRST_BATCH_LABEL,
      serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, moduleSourceHash: source(), registeredAt: now.getTime(), actor, consent: actual });
    assertHustleTaskPreparationWindow(actor, now);
    const authority = actor.approvedBy.renewedStart ?? actor.approvedBy.lateStart;
    if (authority) {
      const authKey = authorizationKey(actor);
      if (await event(tx, authKey)) throw new Error('Late-start authority already recorded without matching manifest; inspect, no retry');
      await append(tx, authKey, actor.approvedBy.renewedStart ? 'hustle_first_batch_renewed_start_authorization' : 'hustle_first_batch_late_start_authorization', {
        version: authority.version, authorization: authority,
        registeredAt: now.getTime(), reviewId: actual.reviewId, reviewHash: actual.reviewHash,
        serverSourceHash: m.serverSourceHash, initialMessageIds: actual.initialMessageIds,
        noBackdate: true, noSends: true, noNewTimer: true,
      });
    }
    await append(tx, manifestKey(actor), m.kind, m);
    return { ...publicScope(m), registered: true, alreadyRecorded: false, noSends: true, noAutomaticRetry: true };
  });
}

/** Parent maintenance calls under its campaign lock. Without a grant this is scope
 * discovery for exclusions ONLY, never dispatch authority; with a grant admission is
 * independently rechecked. Absence is null; corrupt/stale signed state throws held. */
export async function readHustleTaskFirstBatchManifest(tx: any, now = new Date(), grant?: unknown): Promise<(HustleFirstBatchConsent & {
  taskLabel: string; executionTaskId: string; originatingTaskId: string;
  executionKind: 'managed-task-existing-timer-fallback'; registeredAt: number;
}) | null> {
  clock(now); source();
  const actor = grant === undefined ? undefined : admit(grant, now);
  if (!(await event(tx, HUSTLE_TASK_FIRST_BATCH_MANIFEST_KEY)) && !(await event(tx, HUSTLE_RENEWED_TASK_FIRST_BATCH_MANIFEST_KEY))) return null;
  const m = await manifest(tx, now, actor);
  return { ...m.consent, taskLabel: m.taskLabel, executionTaskId: m.executionTaskId,
    originatingTaskId: m.originatingTaskId, executionKind: m.executionKind, registeredAt: m.registeredAt };
}

/** Dispatch-only scope for parent maintenance and EACH existing claim/attempt transaction.
 * A grant plus manifest is insufficient: only the committed shared task attempt may send.
 * Do not call the fence claimant from maintenance: the task executor owns that admission. */
export async function readHustleTaskFirstBatchExecutionScope(tx: any, grant: unknown, now = new Date(), continuationStepId?: number): Promise<HustleFirstBatchConsent | null> {
  const actor = admit(grant, now);
  const window = hustleTaskWindow(actor);
  if (!inWindow(now, window) || !inWindow(new Date(), window)) return null;
  if (await event(tx, 'hustle-first-batch-continuation:2026-11-19:v1')) {
    const m = await manifest(tx, now, actor);
    const scope = await readContinuationExecutionScope(tx, grant, actor, continuationStepId, now);
    if (scope && (scope.reviewId !== m.consent.reviewId || scope.reviewHash !== m.consent.reviewHash)) throw new Error('Continuation scope consent mismatch');
    return scope;
  }
  if (continuationStepId !== undefined) return null;
  const m = await manifest(tx, now, actor);
  const row = await event(tx, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY);
  if (!row || await event(tx, RESULT_KEY) || await event(tx, resultKey(actor))) return null;
  const p = unpack(row, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY, 'hustle_first_batch_shared_attempt');
  if (p.campaignId !== 1 || p.reviewId !== m.consent.reviewId || p.reviewHash !== m.consent.reviewHash ||
    p.executorLabel !== HUSTLE_TASK_FIRST_BATCH_LABEL || p.notBefore !== window.notBefore || p.expiresAt !== window.expiresAt ||
    p.serverSourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH || p.moduleSourceHash !== source() ||
    p.noAutomaticRetry !== true || !Number.isSafeInteger(p.claimedAt) || p.claimedAt > now.getTime() ||
    !inWindow(new Date(p.claimedAt), window) || (actor.approvedBy.renewedStart &&
      !hustleTaskRegistrationWasAuthorized(actor, p.claimedAt))) throw new Error('Committed shared task execution proof mismatch');
  return m.consent;
}

async function claimIn(tx: any, plan: HustleFirstBatchConsent, executorLabel: string, now: Date) {
  const prior = await event(tx, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY);
  if (prior) {
    const p = unpack(prior, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY, 'hustle_first_batch_shared_attempt');
    if (p.reviewId !== plan.reviewId || p.reviewHash !== plan.reviewHash || p.campaignId !== 1 ||
      p.serverSourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH || p.moduleSourceHash !== source())
      throw new Error('Shared first-batch execution fence replay mismatch');
    return { claimed: false as const, alreadyClaimed: true as const, executorLabel: String(p.executorLabel), noAutomaticRetry: true as const };
  }
  await append(tx, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY, 'hustle_first_batch_shared_attempt', {
    campaignId: 1, reviewId: plan.reviewId, reviewHash: plan.reviewHash, executorLabel,
    claimedAt: now.getTime(), notBefore: plan.notBefore, expiresAt: plan.expiresAt,
    serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, moduleSourceHash: source(), noAutomaticRetry: true,
  });
  return { claimed: true as const, alreadyClaimed: false as const, executorLabel, noAutomaticRetry: true as const };
}
/** Parent native path MUST claim this fence before its existing maintenance call.
 * Same-label replay also refuses to execute. Committed intent survives all ambiguities. */
export async function claimHustleFirstBatchExecution(campaignId: number, reviewId: string, reviewHash: string, executorLabel: string, now = new Date()) {
  clock(now); source(); reviewSchema.parse({ reviewId, reviewHash });
  if (campaignId !== 1 || typeof executorLabel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(executorLabel))
    throw new Error('Exact campaign1 and truthful executor label required');
  if (!inWindow(now) || !inWindow(new Date())) return { claimed: false as const, skipped: 'outside-fixed-November18-window', noSends: true, noAutomaticRetry: true };
  const db = await database();
  return db.transaction(async tx => { await lockCampaign(tx); return claimIn(tx, await consent(tx, { reviewId, reviewHash }, now), executorLabel, now); });
}

async function preflight(tx: any, plan: HustleFirstBatchConsent, now: Date, grant?: unknown): Promise<string | null> {
  const s = await readHustleSponsoredKnownState(tx), c = s.campaign;
  if (s.complete !== true || c.id !== 1 || c.status !== 'active' || c.schedulerTaskUid !== plan.canonicalSchedulerTaskUid ||
    !(c.launchApprovedAt instanceof Date) || !Number.isFinite(c.launchApprovedAt.getTime()) || c.launchApprovedAt > now)
    return 'current-campaign-health-or-launch-blocked';
  if (!hasHustleCompleteInboxAnchor(c, s.events as any, now) || !hustleEmailTransportConfigured())
    return 'fresh-complete-inbox-or-existing-smtp-configuration-blocked';
  if (s.episodes.filter((e: Row) => e.seasonYear === 2027 && e.sponsorProspectId !== null).length >= 12)
    return 'all-episode-sponsor-slots-reserved';
  const initial = s.messages.filter((m: Row) => plan.initialMessageIds.includes(m.id));
  if (initial.length !== 5 || new Set(initial.map((m: Row) => m.id)).size !== 5) return 'exact-five-current-message-rows-unavailable';
  for (let i = 0; i < 5; i++) {
    const m = initial.find((v: Row) => v.id === plan.initialMessageIds[i]);
    const p = s.prospects.find((v: Row) => v.id === plan.prospectIds[i]);
    if (!m || !p || m.campaignId !== 1 || m.prospectId !== p.id || m.sequenceStep !== 0 || m.status !== 'approved' ||
      ['claimToken', 'attemptedAt', 'smtpAcceptedAt', 'providerMessageId', 'error'].some(k => !(k in m) || m[k] !== null) ||
      !(m.scheduledAt instanceof Date) || m.scheduledAt > now ||
      (plan.notBefore === NOT_BEFORE ? m.scheduledAt.getTime() !== Date.parse(NOT_BEFORE) :
        m.scheduledAt.getTime() < HUSTLE_RENEWED_START_PINS.sendTimestampMs || m.scheduledAt.getTime() >= Date.parse(plan.expiresAt)) ||
      p.stage !== 'ready' || p.firstSentAt || p.lastSentAt || p.stoppedAt || p.holdReason || p.manualNotes || p.qualification !== 'qualified')
      return 'initial-message-or-prospect-has-claim-attempt-receipt-stop-or-noneligible-state';
    const authorization = await readHustleSponsoredAuthorization(tx, c, p, m, now, { taskGrant: grant });
    if (!authorization || authorization.reviewId !== plan.reviewId || authorization.reviewHash !== plan.reviewHash)
      return 'current-signed-exact-approval-source-or-suppression-blocked';
  }
  return null;
}
/** Actual five-row accounting only; aggregate maintenance counts never prove receipts. */
async function countsFor(plan: HustleFirstBatchConsent): Promise<HustleTaskFirstBatchCounts> {
  try {
    const db = await database();
    const rows = await db.select().from(hustleMessages).where(and(eq(hustleMessages.campaignId, 1), inArray(hustleMessages.id, plan.initialMessageIds))).limit(6);
    if (rows.length !== 5 || new Set(rows.map(m => m.id)).size !== 5) throw new Error('Exact rows unavailable');
    let attempted = 0, accepted = 0, failed = 0, uncertain = 0;
    const affected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = rows.find(r => r.id === plan.initialMessageIds[i]);
      if (!m || m.campaignId !== 1 || m.prospectId !== plan.prospectIds[i] || m.sequenceStep !== 0 ||
        !['approved', 'claimed', 'sent', 'failed', 'uncertain', 'cancelled'].includes(m.status) ||
        ['attemptedAt', 'smtpAcceptedAt', 'providerMessageId', 'claimToken'].some(k => !(k in m)) ||
        [m.attemptedAt, m.smtpAcceptedAt].some(v => v !== null && (!(v instanceof Date) || !Number.isFinite(v.getTime()))) ||
        (m.smtpAcceptedAt && (!m.attemptedAt || !m.providerMessageId)) ||
        (m.status === 'sent' && (!m.attemptedAt || !m.smtpAcceptedAt || !m.providerMessageId))) throw new Error('Actual receipt mapping unavailable');
      if (m.attemptedAt) attempted++;
      if (m.attemptedAt && m.smtpAcceptedAt && m.providerMessageId) accepted++;
      else {
        affected.push(plan.organizations[i]);
        if (m.status === 'failed') failed++;
        else if (m.status === 'uncertain' || m.claimToken || m.providerMessageId || m.attemptedAt) uncertain++;
      }
    }
    return { expected: 5, attempted, accepted, failed, uncertain, affected };
  } catch {
    return { expected: 5, attempted: null, accepted: null, failed: null, uncertain: null, affected: plan.organizations.slice(),
      unavailable: 'Actual signed-message accounting unavailable; no zero counts inferred.' };
  }
}
const escapeHtml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
async function failure(m: Manifest, counts: HustleTaskFirstBatchCounts, cause: string) {
  if (m.actor.approvedBy.renewedStart) return { emailAccepted: false, emailDeliveryVerified: false,
    notificationFallback: 'renewal-result-only-no-email-or-notification', noNewNotification: true,
    priorFailureKey: FAILURE_KEY, inspectionRequired: true, noAutomaticRetry: true };
  const description = [
    'Corpus Christi Hustle first-batch exception: November18', `Executor: ${m.taskLabel} (existing managed task fallback, NOT a native job UID).`,
    `Expected: 5; attempted: ${counts.attempted ?? 'unknown'}; SMTP accepted: ${counts.accepted ?? 'unknown'}; failed: ${counts.failed ?? 'unknown'}; uncertain: ${counts.uncertain ?? 'unknown'}.`,
    ...(counts.unavailable ? [counts.unavailable] : []), `Affected businesses: ${counts.affected.join(', ') || 'none identified in actual receipt rows'}.`, `Cause: ${cause}`,
    'Safe recovery: inspect dashboard, current health/auth/approval and actual provider receipts. Never resend attempted/uncertain email. No automatic task retry or additional timer; hold and report unless definitively unsent originals remain authorized within the exact Nov18 window and existing five-new-per-Chicago-day cap.',
    'SMTP acceptance is not proof of inbox delivery. This exception uses the existing internal SMTP helper, not an independent Gmail transport.',
    `Dashboard: ${CHAMBER_GROWTH_URL}#hustle`,
  ].join('\n\n');
  let db: Awaited<ReturnType<typeof database>>;
  try {
    db = await database();
    const reserved = await db.transaction(async tx => {
      await lockCampaign(tx);
      const actual = new Date();
      if (!inWindow(actual)) throw new Error('No failure SMTP outside authorized task day');
      const fresh = await manifest(tx, actual);
      if (hash(fresh) !== hash(m)) throw new Error('Notification requires actual verified task manifest');
      if (await event(tx, FAILURE_KEY)) return false;
      // EXACTLY the native incident key. Intent COMMIT precedes SMTP; never delete/retry.
      await append(tx, FAILURE_KEY, 'hustle_first_batch_failure_email_intent', {
        taskLabel: m.taskLabel, executionTaskId: m.executionTaskId, reviewId: m.consent.reviewId, reviewHash: m.consent.reviewHash,
        to: JERISTOTLE_EMAIL, subject: FAILURE_SUBJECT, counts, cause, noAutomaticRetry: true,
      }, false);
      return true;
    });
    if (!reserved) {
      const receipt = await event(db, FAILURE_KEY + ':accepted');
      return { emailAccepted: Boolean(receipt), emailDeliveryVerified: false, deduplicated: true,
        notificationFallback: receipt ? 'not-needed' : 'prior-intent-held-unverified', noAutomaticRetry: true };
    }
  } catch {
    return { emailAccepted: false, emailDeliveryVerified: false, notificationFallback: 'required-but-durable-intent-unavailable', inspectionRequired: true, noAutomaticRetry: true };
  }
  try {
    const sent = await sendJeristotleHtmlEmail({ to: JERISTOTLE_EMAIL, subject: FAILURE_SUBJECT, text: description,
      html: `<!doctype html><html><body><h1>First-batch exception</h1>${description.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('')}</body></html>` });
    if (!sent.configured || !sent.sent || !sent.messageId) throw new Error('Internal SMTP acceptance unconfirmed');
    await append(db, FAILURE_KEY + ':accepted', 'hustle_first_batch_failure_email_accepted', {
      taskLabel: m.taskLabel, executionTaskId: m.executionTaskId, messageId: sent.messageId, smtpAccepted: true, deliveryVerified: false,
    }, false);
    return { emailAccepted: true, emailDeliveryVerified: false, notificationFallback: 'not-needed', noAutomaticRetry: true };
  } catch {
    let notificationAccepted = false;
    try { notificationAccepted = await notifyOwner({ title: FAILURE_SUBJECT,
      content: description + '\n\nFailure email acceptance is UNVERIFIED. This is an app notification fallback, NOT an email.' }); } catch { /* truthful task result remains */ }
    try { await append(db, FAILURE_KEY + ':uncertain', 'hustle_first_batch_failure_email_uncertain', {
      taskLabel: m.taskLabel, emailAcceptanceUnverified: true, notificationAccepted, noAutomaticRetry: true,
    }, false); } catch { /* durable shared incident intent remains held */ }
    return { emailAccepted: false, emailAcceptanceUnverified: true, emailDeliveryVerified: false,
      notificationFallback: notificationAccepted ? 'app-notification-accepted-not-email' : 'app-notification-unverified', noAutomaticRetry: true };
  }
}

/** Admission is not sending authority; signed manifest, durable consent, live preflight,
 * shared committed fence and parent sender checks are all independently mandatory. */
export async function executeHustleTaskFirstBatch(grant: unknown, now = new Date()) {
  return withOutreachDeadline(() => executeBounded(grant, now));
}
async function executeBounded(grant: unknown, now: Date) {
  clock(now);
  let window = { notBefore: NOT_BEFORE, expiresAt: EXPIRES_AT };
  try {
    const candidate = (grant as { actor?: HustleManagedOperatorActor })?.actor;
    if (candidate?.approvedBy?.renewedStart) window = hustleTaskWindow(candidate);
  } catch { return { ok: false, noSends: true, inspectionRequired: true, noAutomaticRetry: true, failureEmail: 'unverified-not-sent' }; }
  if (!inWindow(now, window) || !inWindow(new Date(), window)) return { ok: true,
    skipped: window.notBefore === NOT_BEFORE ? 'outside-fixed-November18-window' : 'outside-fixed-November19-window', noSends: true, noAutomaticRetry: true };
  let reservation: { m: Manifest; claim: Awaited<ReturnType<typeof claimIn>>; cause: string | null };
  try {
    const actor = admit(grant, now), db = await database();
    reservation = await db.transaction(async tx => {
      await lockCampaign(tx); await rejectNative(tx);
      const m = await manifest(tx, now, actor);
      const claim = await claimIn(tx, m.consent, HUSTLE_TASK_FIRST_BATCH_LABEL, now);
      return { m, claim, cause: null };
    });
  } catch {
    return { ok: false, inspectionRequired: true, noSendsClaimed: true, failureEmail: 'unverified-not-sent',
      notificationFallback: 'requires-existing-owner-audit', noAutomaticRetry: true,
      error: 'Task grant/source/manifest/consent/native ambiguity or database unavailable; no verified task means no SMTP alert authority.' };
  }
  const { m, claim } = reservation;
  if (!claim.claimed) return { ...publicScope(m), ok: true, skipped: 'shared-attempt-already-held',
    inspectionRequired: true, noSends: true, noAutomaticRetry: true };
  let cause = reservation.cause;
  try {
    admit(grant, new Date());
    // Existing checker ONLY, inside the existing deadline and AFTER committed fence.
    // Stale pre-09:00 inbox coverage cannot make an otherwise valid batch unstartable.
    await checkHustleInbox(new Date(), outreachDeadline() - OUTREACH_PERSISTENCE_BUDGET_MS);
    const db = await database();
    cause = await db.transaction(async tx => {
      await lockCampaign(tx); await rejectNative(tx);
      const scope = await readHustleTaskFirstBatchExecutionScope(tx, grant, new Date());
      if (!scope || hash(scope) !== hash(m.consent)) return 'current-task-execution-proof-blocked';
      return preflight(tx, scope, new Date(), grant);
    });
  } catch { cause = 'current-bounded-inbox-or-preflight-unavailable-no-send-authority'; }
  if (!cause) {
    try {
      const actual = new Date(); admit(grant, actual);
      if (!inWindow(actual, m.consent)) throw new Error('Window closed after preflight');
      // Lazy import avoids the native module -> shared fence -> maintenance import cycle.
      const { runHustleTaskApprovedMaintenance } = await import('./hustleAutomation');
      const result = await runHustleTaskApprovedMaintenance({ grant, reviewId: m.consent.reviewId,
        reviewHash: m.consent.reviewHash, initialMessageIds: m.consent.initialMessageIds.slice() });
      if ('skipped' in result && result.skipped) cause = 'Existing task-approved sender blocked: ' + result.skipped;
      else if ('uncertain' in result && result.uncertain) cause = 'Existing sender reported uncertain SMTP/persistence; inspect, never retry.';
    } catch { cause = 'Existing task-approved maintenance blocked or uncertain; inspect actual receipts, never automatically resend.'; }
  }
  const counts = await countsFor(m.consent);
  const complete = counts.attempted === 5 && counts.accepted === 5 && counts.failed === 0 && counts.uncertain === 0;
  const result = { ...publicScope(m), ok: complete, counts, noAutomaticRetry: true,
    ...(complete ? { noSuccessEmail: true } : { partial: counts.accepted !== null && counts.accepted > 0, inspectionRequired: true,
      cause: cause || 'Existing sender did not confirm all five actual initial-message receipts.',
      failureNotification: await failure(m, counts, cause || 'Existing sender did not confirm all five actual initial-message receipts.') }) };
  try {
    const db = await database();
    const key = resultKey(m.actor);
    await db.transaction(async tx => { await lockCampaign(tx); if (!(await event(tx, key)))
      await append(tx, key, 'hustle_first_batch_task_result', { manifestHash: hash(m), result, recordedAt: new Date().getTime() }); });
  } catch { return { ...result, resultPersistenceUnverified: true, inspectionRequired: true }; }
  return result;
}

/** CLI-compatible explicit review selector; it cannot substitute another batch. */
export async function runHustleTaskFirstBatch(grant: unknown, input: { reviewId: string; reviewHash: string }, now = new Date()) {
  const actor = admit(grant, now), request = reviewSchema.parse(input), db = await database();
  await db.transaction(async tx => {
    await lockCampaign(tx);
    const m = await manifest(tx, now, actor);
    if (m.consent.reviewId !== request.reviewId || m.consent.reviewHash !== request.reviewHash)
      throw new Error('CLI execution review does not match signed task manifest');
  });
  return executeHustleTaskFirstBatch(grant, now);
}

/** Private CLI audit. Does not claim/send/schedule and does not invent zero counts. */
export async function readHustleTaskFirstBatch(grant: unknown, now = new Date()) {
  const actor = admit(grant, now), db = await database();
  return db.transaction(async tx => {
    await lockCampaign(tx);
    if (!(await event(tx, manifestKey(actor)))) return { registered: false, noSends: true, scheduleCreated: false, noAutomaticRetry: true };
    const m = await manifest(tx, now, actor), attempt = await event(tx, HUSTLE_FIRST_BATCH_SHARED_ATTEMPT_KEY);
    const key = resultKey(actor), outcome = await event(tx, key);
    let result: unknown = null;
    if (outcome) {
      const p = unpack(outcome, key, 'hustle_first_batch_task_result');
      if (p.manifestHash !== hash(m)) throw new Error('Task result manifest replay mismatch');
      result = p.result;
    }
    const alert = await event(tx, FAILURE_KEY), accepted = await event(tx, FAILURE_KEY + ':accepted'), uncertain = await event(tx, FAILURE_KEY + ':uncertain');
    return { ...publicScope(m), registered: true, state: outcome ? 'result-recorded' : attempt ? 'attempt-intent-held-unverified' : 'registered-awaiting-existing-task',
      failureEmail: accepted ? 'smtp-accepted-delivery-unverified' : uncertain ? 'acceptance-uncertain-do-not-retry' : alert ? 'intent-pending-do-not-retry' : 'not-recorded',
      result, noSends: true, noAutomaticRetry: true };
  });
}
