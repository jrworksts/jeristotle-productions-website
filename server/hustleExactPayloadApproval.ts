/**
 * SERVER ONLY: pure source-stage primitives, NOT an activation or dispatch adapter.
 * Imports only Node crypto and shared pure configuration/formatting. No I/O or env keys.
 * Caller packets and source markers are provisional; a preview does not verify current
 * campaign/source identity, message mappings, an owned lease, inbox health or approval.
 * A future owner-authenticated adapter must resolve identity, read authoritative state,
 * atomically persist signed approval/nonce/attempt ledgers and retain every existing guard.
 * None of that adapter, persistence, publication or operation authority exists here.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { JERISTOTLE_EMAIL } from '../shared/const';
import {
  HUSTLE_SLUG, HUSTLE_VERSION, HUSTLE_LAUNCH_CONFIG_VERSION,
  HUSTLE_LAUNCH_COPY_VERSION, HUSTLE_RUNTIME_VERSION,
  HUSTLE_QUALIFICATION_POLICY_VERSION,
} from '../shared/hustleOutreach';
import { renderJeristotleOutreachEmail } from '../shared/outreachFormatting';
import { getOutreachLocalMoment, OUTREACH_TIME_ZONE } from '../shared/outreachSchedule';
import { normalizeTrainingEmail } from '../shared/trainingOutreach';

/** Immutable code fence, never environment- or caller-controlled. */
export const HUSTLE_EXACT_PAYLOAD_APPROVAL_ENABLED = false as const;
export const HUSTLE_EXACT_PAYLOAD_APPROVAL_BLOCKER =
  'Exact-payload approval is source-preview only and default-disabled pending explicit owner approval, authoritative final mappings, a trusted signed-ledger adapter and approved publication.';
export const HUSTLE_EXACT_PAYLOAD_APPROVAL_SOURCE_VERSION =
  'hustle-exact-payload-approval-source-2026-11-15-v1' as const;
export const HUSTLE_EXACT_PAYLOAD_PROPOSED_CONFIG_VERSION =
  'hustle-12-5-30-calendar-2026-11-15-proposed-held-v1' as const;
export const HUSTLE_EXACT_PAYLOAD_LEGACY_POLICY_VERSION =
  'hustle-24-10-50-4-5-policy-shape-v1' as const;
export const HUSTLE_EXACT_PAYLOAD_PROPOSED_POLICY_VERSION =
  'hustle-12-5-30-2-3-proposed-held-v1' as const;
export const HUSTLE_EXACT_PAYLOAD_INBOUND_MAX_AGE_MS = 8 * 60 * 1000;
export const HUSTLE_EXACT_PAYLOAD_APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const HUSTLE_APPROVED_FOLLOWUP_LOCAL_HOUR = 9 as const;
export const HUSTLE_EXACT_PAYLOAD_FOOTER =
  'Jeremy Wells\nJeristotle Productions\nMovie-level content production for small businesses.\n319 N Mesquite St, Corpus Christi, TX 78401\nTo opt out, reply unsubscribe.' as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const positiveId = z.number().int().positive().safe();
const exactIdentifier = z.string().min(1).max(200).refine(v => v === v.trim());
const nonce = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const utcTimestamp = z.iso.datetime().refine(v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v));
const normalizedEmail = z.string().max(320).refine(v => normalizeTrainingEmail(v) === v, 'Exact normalized email required');
const noPricingOrDash = (v: string) => !/\u2014|&mdash;|&#(?:8212|x2014);|[$£€]|\b(?:pricing|prices?|costs?|fees?|USD|dollars?)\b/i.test(v);
const linkPattern = /https?:\/\/|www\.|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|co|edu|gov)\b/i;
const subject = z.string().min(1).max(240).refine(v => v === v.trim() && !/[\r\n]/.test(v) && noPricingOrDash(v));
const textBody = z.string().min(1).max(30000).refine(v => !v.includes('\r') && noPricingOrDash(v));
const policyCommon = {
  timezone: z.literal(OUTREACH_TIME_ZONE),
  followupBasis: z.literal('previous_actual_smtp_accepted'),
  sendLocalHour: z.literal(HUSTLE_APPROVED_FOLLOWUP_LOCAL_HOUR),
  followupsAdditional: z.literal(true),
  firstEmailLinkFree: z.literal(true),
};
/** Two whole offline policy shapes only. This does not change the legacy runtime cadence. */
export const hustleExactPayloadCadenceSchema = z.discriminatedUnion('policyVersion', [
  z.object({ ...policyCommon, policyVersion: z.literal(HUSTLE_EXACT_PAYLOAD_LEGACY_POLICY_VERSION), episodeGoal: z.literal(24), dailyNewLimit: z.literal(10), reserveTarget: z.literal(50), followupCalendarDays: z.tuple([z.literal(4), z.literal(5)]), weekendHandling: z.literal('roll_forward_to_weekday') }).strict(),
  z.object({ ...policyCommon, policyVersion: z.literal(HUSTLE_EXACT_PAYLOAD_PROPOSED_POLICY_VERSION), episodeGoal: z.literal(12), dailyNewLimit: z.literal(5), reserveTarget: z.literal(30), followupCalendarDays: z.tuple([z.literal(2), z.literal(3)]), weekendHandling: z.literal('include_weekends') }).strict(),
]);
export type HustleExactPayloadCadence = z.infer<typeof hustleExactPayloadCadenceSchema>;
const messageShape = { messageId: positiveId, subject, textBody, htmlBody: z.string().min(1).max(100000), footer: z.literal(HUSTLE_EXACT_PAYLOAD_FOOTER) };

export const hustleExactPayloadSchema = z.object({
  campaignId: z.literal(1),
  campaignSlug: z.literal(HUSTLE_SLUG),
  campaignVersion: z.literal(HUSTLE_VERSION),
  configVersion: z.union([z.literal(HUSTLE_LAUNCH_CONFIG_VERSION), z.literal(HUSTLE_EXACT_PAYLOAD_PROPOSED_CONFIG_VERSION)]),
  copyVersion: z.literal(HUSTLE_LAUNCH_COPY_VERSION),
  qualificationPolicyVersion: z.literal(HUSTLE_QUALIFICATION_POLICY_VERSION),
  runtimeVersion: z.literal(HUSTLE_RUNTIME_VERSION),
  sourceVersion: z.literal(HUSTLE_EXACT_PAYLOAD_APPROVAL_SOURCE_VERSION),
  // Supplied SHA256 markers are bound, not independently verified release/evidence proof.
  sourceHash: hex64,
  sourceQualificationHash: hex64,
  prospectId: positiveId,
  recipientEmail: normalizedEmail,
  from: z.literal(JERISTOTLE_EMAIL),
  replyTo: z.literal(JERISTOTLE_EMAIL),
  approvedSequence: z.tuple([
    z.object({ ...messageShape, sequenceStep: z.literal(0) }).strict(),
    z.object({ ...messageShape, sequenceStep: z.literal(1) }).strict(),
    z.object({ ...messageShape, sequenceStep: z.literal(2) }).strict(),
  ]),
  cadence: hustleExactPayloadCadenceSchema,
}).strict().superRefine((payload, ctx) => {
  const proposed = payload.cadence.policyVersion === HUSTLE_EXACT_PAYLOAD_PROPOSED_POLICY_VERSION;
  if (payload.configVersion !== (proposed ? HUSTLE_EXACT_PAYLOAD_PROPOSED_CONFIG_VERSION : HUSTLE_LAUNCH_CONFIG_VERSION))
    ctx.addIssue({ code: 'custom', path: ['configVersion'], message: 'Configuration and complete cadence policy must match; proposed policy remains held.' });
  if (new Set(payload.approvedSequence.map(m => m.messageId)).size !== 3)
    ctx.addIssue({ code: 'custom', path: ['approvedSequence'], message: 'Three distinct stable message mappings required.' });
  for (const [index, m] of Array.from(payload.approvedSequence.entries())) {
    if (!m.textBody.endsWith('\n\n' + m.footer))
      ctx.addIssue({ code: 'custom', path: ['approvedSequence', index, 'footer'], message: 'Exact compliance footer must terminate plaintext.' });
    if (index === 0 && linkPattern.test(m.subject + '\n' + m.textBody))
      ctx.addIssue({ code: 'custom', path: ['approvedSequence', index], message: 'First email must be link-free.' });
    try {
      const html = renderJeristotleOutreachEmail({ subject: m.subject, text: m.textBody, linkFree: index === 0 });
      if (m.htmlBody !== html || !noPricingOrDash(m.htmlBody)) throw new Error('HTML mismatch');
    } catch {
      ctx.addIssue({ code: 'custom', path: ['approvedSequence', index, 'htmlBody'], message: 'HTML must equal the actual white/gold renderer, with no copy repair or overrides.' });
    }
  }
});
export type HustleExactPayload = z.infer<typeof hustleExactPayloadSchema>;

/** Same sorted JSON convention as hustleActivationHash, without its DB import chain. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  throw new Error('Canonical approval requires strict finite JSON, not undefined or class instances');
}
export function hashHustleExactPayload(payload: unknown): string {
  return createHash('sha256').update(canonical(hustleExactPayloadSchema.parse(payload))).digest('hex');
}
export function previewHustleExactPayload(payload: unknown) {
  return {
    payloadHash: hashHustleExactPayload(payload),
    previewOnly: true as const, operationalReady: false as const,
    enabled: HUSTLE_EXACT_PAYLOAD_APPROVAL_ENABLED,
    noSends: true as const, noActivation: true as const,
    blocker: HUSTLE_EXACT_PAYLOAD_APPROVAL_BLOCKER,
    verifiedCurrentCampaign: false as const, verifiedSourceIdentity: false as const,
    verifiedFinalMappings: false as const, verifiedOwnedLease: false as const,
    verifiedReplyHealth: false as const, persistedApproval: false as const,
  };
}

const approvalRecordShape = {
  payloadHash: hex64, approverOpenId: exactIdentifier,
  approvedAt: utcTimestamp, expiresAt: utcTimestamp, approvalId: nonce,
};
const unsignedApprovalSchema = z.object(approvalRecordShape).strict();
export const hustleExactPayloadApprovalRecordSchema = z.object({ ...approvalRecordShape, signature: hex64 }).strict();
export type HustleExactPayloadApprovalRecord = z.infer<typeof hustleExactPayloadApprovalRecordSchema>;
type ProofContext = { payload: unknown; expectedOwnerOpenId: string; secret: string | Uint8Array; now: Date };
const hmacDomain = 'hustle-exact-payload-approval-v1\n';
function secretBytes(secret: string | Uint8Array): Buffer {
  if (typeof secret !== 'string' && !(secret instanceof Uint8Array)) throw new Error('Trusted server secret required');
  const bytes = Buffer.from(secret);
  if (bytes.length < 32 || bytes.length > 4096) throw new Error('Trusted server secret must contain at least 32 bytes');
  return bytes;
}
function recordBlocker(record: z.infer<typeof unsignedApprovalSchema>, context: ProofContext): string | null {
  if (!exactIdentifier.safeParse(context.expectedOwnerOpenId).success || record.approverOpenId !== context.expectedOwnerOpenId) return 'owner_mismatch';
  if (!(context.now instanceof Date) || !Number.isFinite(context.now.getTime())) return 'unknown_clock';
  const approvedAt = Date.parse(record.approvedAt), expiresAt = Date.parse(record.expiresAt), now = context.now.getTime();
  if (approvedAt > now) return 'future_approval';
  if (expiresAt <= now || expiresAt <= approvedAt) return 'expired_approval';
  if (now - approvedAt > HUSTLE_EXACT_PAYLOAD_APPROVAL_MAX_AGE_MS || expiresAt - approvedAt > HUSTLE_EXACT_PAYLOAD_APPROVAL_MAX_AGE_MS) return 'stale_approval';
  if (record.payloadHash !== hashHustleExactPayload(context.payload)) return 'payload_hash_mismatch';
  return null;
}
/**
 * INTERNAL FUTURE SERVER ADAPTER ONLY; never expose this function to a router/client.
 * This signs data, does NOT authenticate an owner. expectedOwnerOpenId must already be
 * independently resolved by the trusted owner boundary. No current adapter/key exists.
 * Fake keys are used in tests only. Even a signature cannot bypass the hard code fence.
 */
export function createHustleExactPayloadApprovalForTrustedAdapter(input: ProofContext & { record: unknown }): HustleExactPayloadApprovalRecord {
  const record = unsignedApprovalSchema.parse(input.record);
  const blocker = recordBlocker(record, input);
  if (blocker) throw new Error(blocker);
  return { ...record, signature: createHmac('sha256', secretBytes(input.secret)).update(hmacDomain).update(canonical(record)).digest('hex') };
}
/** Offline cryptographic integrity only; this never proves actual authentication or grants an operation. */
export function verifyApprovalIntegrity(input: ProofContext & { approval: unknown }):
  | { valid: true; proofOnly: true; operationalReady: false; payloadHash: string; approvalId: string }
  | { valid: false; proofOnly: true; operationalReady: false; reason: string } {
  const failure = (reason: string) => ({ valid: false as const, proofOnly: true as const, operationalReady: false as const, reason });
  try {
    const parsed = hustleExactPayloadApprovalRecordSchema.safeParse(input.approval);
    if (!parsed.success) return failure('invalid_signed_record');
    const { signature, ...record } = parsed.data;
    const expected = createHmac('sha256', secretBytes(input.secret)).update(hmacDomain).update(canonical(record)).digest();
    const supplied = Buffer.from(signature, 'hex'); // fixed 32-byte buffers after strict schema parsing
    if (!timingSafeEqual(expected, supplied)) return failure('signature_mismatch');
    const blocker = recordBlocker(record, input);
    if (blocker) return failure(blocker);
    return { valid: true, proofOnly: true, operationalReady: false, payloadHash: record.payloadHash, approvalId: record.approvalId };
  } catch { return failure('invalid_payload_or_trusted_context'); }
}

const stepSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const ledgerEntrySchema = z.object({
  campaignId: positiveId, prospectId: positiveId, messageId: positiveId,
  sequenceStep: stepSchema, approvalId: nonce, payloadHash: hex64,
  state: z.enum(['consumed', 'reserved', 'attempted', 'accepted', 'uncertain']), recordedAt: utcTimestamp,
}).strict();
const ledgerSchema = z.object({ complete: z.literal(true), entries: z.array(ledgerEntrySchema).max(100000) }).strict();
/**
 * Offline enrollment/replay inspection only (not dispatch eligibility). Any existing
 * attempt/reservation/acceptance/uncertainty for this prospect stops re-enrollment.
 * Prior accepted steps for follow-up timing belong to a future authoritative adapter.
 * An identical consumed nonce may be recorded idempotently, never dispatched again.
 */
export function inspectHustleExactPayloadReplay(input: { payload: unknown; approval: unknown; ledger: unknown }) {
  const blocked = (reason: string) => ({ clearForOfflineReview: false as const, recording: 'blocked' as const, canDispatch: false as const, reason });
  const p = hustleExactPayloadSchema.safeParse(input.payload), a = hustleExactPayloadApprovalRecordSchema.safeParse(input.approval), l = ledgerSchema.safeParse(input.ledger);
  if (!p.success || !a.success || !l.success) return blocked('unknown_approval_or_ledger');
  if (hashHustleExactPayload(p.data) !== a.data.payloadHash) return blocked('payload_hash_mismatch');
  let consumed = false;
  for (const entry of l.data.entries) {
    const sameNonce = entry.approvalId === a.data.approvalId;
    const sameProspect = entry.campaignId === 1 && entry.prospectId === p.data.prospectId;
    const sameMapping = sameProspect && p.data.approvedSequence[entry.sequenceStep].messageId === entry.messageId;
    if (sameNonce && (entry.payloadHash !== a.data.payloadHash || !sameMapping)) return blocked('conflicting_nonce_or_mapping');
    if (!sameProspect && !sameNonce) continue;
    if (entry.state !== 'consumed') return blocked('existing_attempt_acceptance_reservation_or_uncertainty');
    if (!sameNonce || entry.payloadHash !== a.data.payloadHash || !sameMapping) return blocked('conflicting_approval_or_hash');
    consumed = true;
  }
  if (consumed) return { clearForOfflineReview: false as const, recording: 'idempotent' as const, canDispatch: false as const, reason: 'nonce_consumed_recording_only' };
  return { clearForOfflineReview: true as const, recording: 'new' as const, canDispatch: false as const, reason: 'offline_ledger_clear_not_authorization' };
}

const guardState = z.enum(['clear', 'blocked', 'unknown']);
const trustedSafetySnapshotSchema = z.object({
  campaignId: z.literal(1), prospectId: positiveId, recipientEmail: normalizedEmail,
  currentPayloadHash: hex64,
  guards: z.object({
    suppression: guardState, ownerHold: guardState, crossCampaignContact: guardState,
    crossCampaignPhoneResponse: guardState, reply: guardState, automaticReply: guardState,
    outOfOffice: guardState, bounce: guardState, optOut: guardState,
    existingStop: guardState, qualification: guardState, sourceMapping: guardState,
  }).strict(),
  inboundHealth: z.object({
    status: z.literal('complete'),
    scannerAnchor: z.object({
      mailboxIdentity: z.literal(JERISTOTLE_EMAIL), scannerRunId: exactIdentifier,
      uidValidity: positiveId, throughUid: z.number().int().nonnegative().safe(),
      scanStartedAt: utcTimestamp, scanCompletedAt: utcTimestamp, coveredThroughAt: utcTimestamp,
    }).strict(),
  }).strict(),
  ledger: ledgerSchema,
}).strict();
/**
 * Pure diagnostics on a structured snapshot from a future TRUSTED read-side adapter.
 * Schema validation is NOT provenance authentication; never wire caller checkboxes to
 * this input. Its result is only offline review, not source/lease/inbox verification.
 */
export function getHustleExactPayloadSafetyBlockers(input: { payload: unknown; approval: unknown; trustedState: unknown; now: Date }): string[] {
  const p = hustleExactPayloadSchema.safeParse(input.payload), s = trustedSafetySnapshotSchema.safeParse(input.trustedState);
  if (!p.success || !s.success) return ['unknown_or_invalid_trusted_snapshot'];
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return ['unknown_clock'];
  const blockers: string[] = [];
  if (s.data.prospectId !== p.data.prospectId || s.data.recipientEmail !== p.data.recipientEmail || s.data.currentPayloadHash !== hashHustleExactPayload(p.data)) blockers.push('current_binding_mismatch');
  for (const [guard, status] of Object.entries(s.data.guards)) if (status !== 'clear') blockers.push(`${guard}_${status}`);
  const anchor = s.data.inboundHealth.scannerAnchor;
  const start = Date.parse(anchor.scanStartedAt), end = Date.parse(anchor.scanCompletedAt), covered = Date.parse(anchor.coveredThroughAt), now = input.now.getTime();
  if (start > covered || covered > end || end > now || now - end > HUSTLE_EXACT_PAYLOAD_INBOUND_MAX_AGE_MS || now - covered > HUSTLE_EXACT_PAYLOAD_INBOUND_MAX_AGE_MS) blockers.push('inbound_health_stale_future_or_incomplete');
  if (s.data.ledger.entries.some(entry => Date.parse(entry.recordedAt) > now)) blockers.push('future_ledger_record');
  const replay = inspectHustleExactPayloadReplay({ payload: p.data, approval: input.approval, ledger: s.data.ledger });
  if (!replay.clearForOfflineReview) blockers.push(replay.reason);
  return blockers;
}
/** Disabled FIRST, before even touching input; a valid offline signature is never operation authority. */
export function evaluateHustleExactPayloadAuthorization(_input: unknown) {
  return {
    enabled: HUSTLE_EXACT_PAYLOAD_APPROVAL_ENABLED,
    authorized: false as const, canDispatch: false as const, operationalReady: false as const,
    noSends: true as const, noActivation: true as const,
    blocker: HUSTLE_EXACT_PAYLOAD_APPROVAL_BLOCKER,
  };
}

/**
 * PROPOSED POLICY ONLY: pass the actual preceding SMTP-accepted timestamp, not a
 * scheduled/attempted time. Step 1: initial acceptance +2 Chicago calendar days;
 * step 2: actual FIRST follow-up acceptance +3. Includes weekends; always 09:00 CT.
 * Not used by the current runtime and deliberately does not call getNextFollowupAt.
 */
export function getHustleApprovedFollowupAt(previousAcceptedAt: Date, step: 1 | 2): Date {
  if (!(previousAcceptedAt instanceof Date) || !Number.isFinite(previousAcceptedAt.getTime()) || (step !== 1 && step !== 2)) throw new Error('Actual preceding SMTP acceptance and follow-up step 1 or 2 required');
  const local = getOutreachLocalMoment(previousAcceptedAt, OUTREACH_TIME_ZONE);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  target.setUTCDate(target.getUTCDate() + (step === 1 ? 2 : 3));
  const desired = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), HUSTLE_APPROVED_FOLLOWUP_LOCAL_HOUR);
  let guess = desired;
  // Re-evaluate offset at the TARGET calendar date; handles either DST transition.
  for (let i = 0; i < 3; i++) {
    const represented = getOutreachLocalMoment(new Date(guess), OUTREACH_TIME_ZONE);
    const representedUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute);
    guess += desired - representedUtc;
  }
  const result = new Date(guess), represented = getOutreachLocalMoment(result, OUTREACH_TIME_ZONE);
  if (represented.year !== target.getUTCFullYear() || represented.month !== target.getUTCMonth() + 1 || represented.day !== target.getUTCDate() || represented.hour !== HUSTLE_APPROVED_FOLLOWUP_LOCAL_HOUR || represented.minute !== 0) throw new Error('Unresolvable Chicago calendar date');
  return result;
}

const quotaHistorySchema = z.object({
  complete: z.literal(true),
  entries: z.array(z.object({
    campaignId: positiveId, prospectId: positiveId, sequenceStep: stepSchema,
    state: z.enum(['reserved', 'attempted', 'accepted', 'uncertain']), at: utcTimestamp,
  }).strict()).max(100000),
}).strict();
/** Offline policy calculation only; all actual initial attempts/uncertainty/reservations
 * consume the day cap. Follow-ups are additional, never new-contact reserve inventory.
 * Duplicate history consumes conservatively; the trusted future ledger must be complete.
 */
export function hustleExactPayloadQuotaAvailable(input: { policy: unknown; candidate: unknown; history: unknown; now: Date }) {
  const policy = hustleExactPayloadCadenceSchema.safeParse(input.policy);
  const candidate = z.object({ campaignId: z.literal(1), sequenceStep: stepSchema }).strict().safeParse(input.candidate);
  const history = quotaHistorySchema.safeParse(input.history);
  const blocked = (reason: string) => ({ available: false, initialAttemptCount: null, dailyNewLimit: null, remaining: null, policyOnly: true as const, operationalReady: false as const, reason });
  if (!policy.success || !candidate.success || !history.success || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return blocked('unknown_policy_scope_history_or_clock');
  if (history.data.entries.some(e => e.state !== 'reserved' && Date.parse(e.at) > input.now.getTime())) return blocked('future_attempt_history');
  const day = getOutreachLocalMoment(input.now).dateKey;
  const count = history.data.entries.filter(e => e.campaignId === 1 && e.sequenceStep === 0 && getOutreachLocalMoment(new Date(e.at)).dateKey === day).length;
  const cap = policy.data.dailyNewLimit, remaining = Math.max(0, cap - count);
  return { available: candidate.data.sequenceStep !== 0 || count < cap, initialAttemptCount: count, dailyNewLimit: cap, remaining, policyOnly: true as const, operationalReady: false as const, reason: 'offline_quota_only_not_authorization' };
}
