/** Bounded owner review adapter. No setup, activation, provider, schedule or send operation.
 * All mutations use the existing authoritative campaign lock and existing event tables.
 * Router MUST pass authenticated ctx, not an OpenId/role from input. Runtime readers MUST
 * run inside the sender's campaign-lock transaction at both claim and attempt.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  hustleCampaigns, hustleProspects, hustleMessages, hustleEvents,
  chamberOutreachProspects, chamberOutreachSuppressions, creditUnionProspects,
  brandVideoProspects, trainingOutreachProspects, sectorOutreachProspects,
  chamberProspects, projectInquiries, users,
} from '../drizzle/schema';
import { getDb } from './db';
import { ENV } from './_core/env';
import type { TrpcContext } from './_core/context';
import { readHustleLaunchState } from './hustleDb';
import { hasHustleCompleteInboxAnchor } from './hustleSponsoredRuntime';
import release from '../shared/outreachRepairRelease.json';
import { hustleRecordedSecuritySourceHashes } from './hustleSourceIdentity';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import { readHustleSourceTransitionReceipt, hustleSourceTransitionAllowsEvent, readTransitionMessageGate } from './hustleSourceTransition';
import { assertHustleTaskPreparationWindow, assertHustleRenewedStartActor,
  HUSTLE_LATE_START_PINS, hustleTaskWindow } from './hustleLateStartAuthorization';
import { getOutreachLocalMoment } from '../shared/outreachSchedule';
import { HUSTLE_PARTIAL_CONTINUATION as continuationPins, HUSTLE_PARTIAL_HISTORICAL_EVENTS,
  assertPartialHistoricalEvents, assertContinuationRows, initialReceipt, assertContinuationDate,
  appendContinuationTaskEvent, continuationStepKey, HUSTLE_FINAL_ORIGINAL as finalPins,
  HUSTLE_FINAL_HISTORICAL_EVENTS, assertFinalOriginalHistoricalEvents, continuationTaskPayload } from './hustlePartialContinuation';
import { HUSTLE_BEFORE_CLAIM_RECOVERY as recoveryPins, HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS,
  assertRecoveryArchive, assertRecoveryHistoricalEvents, recoveryActorProvenance,
  recoveryHash, signRecoveryTaskEvent } from './hustleBeforeClaimRecovery';
import {
  HUSTLE_MANAGED_OPERATOR_PINS, isHustleManagedOperatorActor,
  verifyHustleManagedOperatorGrant,
  type HustleManagedOperatorActor,
} from './hustleManagedOperatorGrant';
import {
  HUSTLE_SPONSORED_CONFIG_VERSION, HUSTLE_SPONSORED_SOURCE_VERSION, HUSTLE_SPONSORED_SCHEMA_VERSION,
  HUSTLE_SPONSORED_MARKER, HUSTLE_SPONSORED_SLUG, HUSTLE_SPONSORED_POLICY,
  HUSTLE_SPONSORED_HEADERS, HUSTLE_SPONSORED_FROM_DISPLAY, HUSTLE_SPONSORED_MAX_AGE_MS,
  sponsoredReviewBatchSchema, sponsoredReviewApprovalSchema, sponsoredReviewRecordSchema,
  sponsoredCanonicalJson, sponsoredRecordBlockers, sponsoredIdentityAliases, sponsoredOrganizationKey,
  sponsoredAuthorizationMatches, sponsoredMessageIsSafe, sponsoredSourceIsFresh, isHustleSponsoredProspect,
  type SponsoredReviewRecord, type HustleSponsoredAuthorization,
} from '../shared/hustleSponsoredReview';

export const HUSTLE_SPONSORED_EVENT_TYPES = Object.freeze({
  record: 'hustle_sponsored_review_record', manifest: 'hustle_sponsored_review_manifest',
  approval: 'hustle_sponsored_exact_approval', policy: 'hustle_sponsored_policy_approval',
  receipt: 'hustle_sponsored_approval_receipt',
});
const EVENT_MAX_BYTES = 60_000;
const MAX_SNAPSHOT_ROWS = 100_000;
const hash = (value: unknown) => createHash('sha256').update(sponsoredCanonicalJson(value)).digest('hex');
const runtimeSourceHashes = hustleRecordedSecuritySourceHashes(release.sourceHashes);
/** Server derives release identity independently. Never accepts a client's checksum.
 * Complete recorded map covers the validated transitive security closure, including
 * dates, stop/manual state, normalization, schema and deadlines. Missing hashes fail
 * before any signing/admission. Runtime Function#toString is NOT build-independent: esbuild
 * changes identifiers/import aliases. Never put runtime function text in this hash.
 * Any intentional implementation/schema change must increment SOURCE/SCHEMA version. */
export const HUSTLE_SPONSORED_SERVER_SOURCE_HASH = hash({
  identityVersion: 'hustle-recorded-source-identity-v3',
  source: HUSTLE_SPONSORED_SOURCE_VERSION, schema: HUSTLE_SPONSORED_SCHEMA_VERSION,
  config: HUSTLE_SPONSORED_CONFIG_VERSION, policy: HUSTLE_SPONSORED_POLICY,
  runtimeSourceHashes,
  recordShape: Object.keys(sponsoredReviewRecordSchema.shape).sort(),
  headers: HUSTLE_SPONSORED_HEADERS, fromDisplay: HUSTLE_SPONSORED_FROM_DISPLAY,
});
export const HUSTLE_SPONSORED_POLICY_HASH = hash(HUSTLE_SPONSORED_POLICY);
type Row = Record<string, any>;
type OwnerActor = { userId: number; openId: string };
type ReviewActor = OwnerActor | HustleManagedOperatorActor;
type Signed = { version: 1; kind: string; schemaVersion: string; sourceVersion: string; sourceHash: string; actor: ReviewActor; payload: Row; signature: string };
function validActor(actor: ReviewActor, kind: string): boolean {
  if ('kind' in (actor || {})) return isHustleManagedOperatorActor(actor) &&
    [...Object.values(HUSTLE_SPONSORED_EVENT_TYPES), 'hustle_sponsored_operator_stage_receipt', 'hustle_sponsored_operator_approval_receipt', 'hustle_sponsored_before_claim_recovery_authority', 'hustle_sponsored_partial_continuation_authority'].includes(kind);
  const value = actor as OwnerActor;
  return Boolean(ENV.ownerOpenId && value?.openId === ENV.ownerOpenId && Number.isSafeInteger(value?.userId) && value.userId > 0);
}
function sameActor(a: ReviewActor, b: ReviewActor): boolean {
  if ('kind' in a || 'kind' in b) return isHustleManagedOperatorActor(a) && isHustleManagedOperatorActor(b) && hash(a) === hash(b);
  return a.userId === b.userId;
}
function owner(ctx: Pick<TrpcContext, 'user'>): OwnerActor {
  const user = ctx.user as (NonNullable<TrpcContext['user']> & { isCron?: boolean; taskUid?: string }) | null;
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.isCron || user.taskUid || user.openId.startsWith('cron_') || !ENV.ownerOpenId || user.openId !== ENV.ownerOpenId)
    throw new Error('Authenticated existing application owner required; cron/admin/caller identity is not approval');
  return { userId: user.id, openId: user.openId };
}
function signingKey(): Buffer {
  const secret = hustleExistingSigningAuthority(ENV.cookieSecret);
  return createHmac('sha256', secret).update('jeristotle/hustle-sponsored-review/signing-key/v1').digest();
}
function signature(unsigned: Omit<Signed, 'signature'>): string {
  return createHmac('sha256', signingKey()).update('jeristotle/hustle-sponsored-review/envelope/v1\n').update(sponsoredCanonicalJson(unsigned)).digest('hex');
}
function sign(kind: string, actor: ReviewActor, payload: Row): Signed {
  if (!validActor(actor, kind)) throw new Error('Verified review actor required');
  // Owner envelope format/key remain unchanged. The additional operator module must
  // be in the parent-updated release before any operator envelope can be signed.
  if (Object.entries(runtimeSourceHashes).some(([path, value]) =>
    (path !== 'server/hustleManagedOperatorGrant.ts' || isHustleManagedOperatorActor(actor)) &&
    (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)))) throw new Error('Complete recorded sender source release required');
  const unsigned = { version: 1 as const, kind, schemaVersion: HUSTLE_SPONSORED_SCHEMA_VERSION, sourceVersion: HUSTLE_SPONSORED_SOURCE_VERSION, sourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, actor, payload };
  return { ...unsigned, signature: signature(unsigned) };
}
function transition(events: Row[] | undefined, now: Date, campaign?: Row) {
  return events ? readHustleSourceTransitionReceipt(events, HUSTLE_SPONSORED_SERVER_SOURCE_HASH, runtimeSourceHashes, campaign, now) : null;
}
function verify(event: Row | undefined, kind: string, events?: Row[], now = new Date()): Signed | null {
  try {
    if (!event || event.campaignId !== 1 || event.eventType !== kind) return null;
    const signed = JSON.parse(event.detailJson) as Signed;
    if (Object.keys(signed).sort().join(',') !== 'actor,kind,payload,schemaVersion,signature,sourceHash,sourceVersion,version') return null;
    const { signature: supplied, ...unsigned } = signed;
    if (signed.version !== 1 || signed.kind !== kind || signed.schemaVersion !== HUSTLE_SPONSORED_SCHEMA_VERSION || signed.sourceVersion !== HUSTLE_SPONSORED_SOURCE_VERSION ||
      (signed.sourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH && !hustleSourceTransitionAllowsEvent(transition(events, now), event, signed.sourceHash)) || !validActor(signed.actor, kind) || !/^[a-f0-9]{64}$/.test(supplied)) return null;
    // Transition receipt is only an exact source-pair admission, never a replacement HMAC.
    if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(signature(unsigned), 'hex'))) return null;
    return signed;
  } catch { return null; }
}
function serialized(value: unknown): string {
  const detail = JSON.stringify(value);
  if (Buffer.byteLength(detail, 'utf8') >= EVENT_MAX_BYTES) throw new Error('Review event exceeds bounded 60KB storage; split/review before staging');
  return detail;
}
async function eventWrite(tx: any, key: string, kind: string, actor: ReviewActor, payload: Row, prospectId?: number) {
  await tx.insert(hustleEvents).values({ campaignId: 1, prospectId: prospectId ?? null, eventKey: key, eventType: kind, detailJson: serialized(sign(kind, actor, payload)) });
}
async function database() { const db = await getDb(); if (!db) throw new Error('Existing sponsored review database unavailable'); return db; }
function campaignBinding(c: Row) {
  return { id: c.id, slug: c.slug, status: c.status, configVersion: c.configVersion, episodeGoal: c.episodeGoal, launchApprovedAt: c.launchApprovedAt ?? null, schedulerTaskUid: c.schedulerTaskUid ?? null };
}
const sourceFields = ['campaignId', 'organizationKey', 'name', 'website', 'category', 'localEvidence', 'localSourceUrl', 'contactName', 'contactTitle', 'recipientType', 'email', 'emailSourceUrl', 'emailSourceQuote', 'roleSourceUrl', 'phone', 'phoneSourceUrl', 'evidenceJson'] as const;
function prospectBinding(p: Row) { return Object.fromEntries(sourceFields.map(k => [k, p[k] ?? null])); }
function targetBaseline(p: Row | null, messages: Row[], events: Row[]) {
  return hash({ prospect: p ? { ...prospectBinding(p), id: p.id, qualification: p.qualification, holdReason: p.holdReason ?? null, stage: p.stage, manualNotes: p.manualNotes ?? null, firstSentAt: p.firstSentAt ?? null, lastSentAt: p.lastSentAt ?? null, stoppedAt: p.stoppedAt ?? null } : null,
    messages: messages.slice().sort((a, b) => a.id - b.id).map(({ createdAt, updatedAt, ...m }) => m),
    history: events.filter(e => !Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType)).map(({ occurredAt, ...e }) => e).sort((a, b) => a.id - b.id),
  });
}
function researchHash(record: SponsoredReviewRecord) { const { messages, ...research } = record; return hash(research); }
function assertCampaign(c: Row) {
  if (c.id !== 1 || c.slug !== HUSTLE_SPONSORED_SLUG || !['active', 'review', 'paused'].includes(c.status)) throw new Error('Existing authoritative campaign ID1 required; no initialization or activation');
}
/** SELECT every identity, not the legacy filtered sector/qualified reservation helpers.
 * Locking reads use the current committed rows, not an old repeatable-read snapshot.
 * If a table/read fails, the complete snapshot fails closed. No per-source LIMIT/truncation. */
export async function readHustleSponsoredKnownState(tx: any) {
  const state = await readHustleLaunchState(tx, true);
  assertCampaign(state.campaign);
  const read = async (table: any) => tx.select().from(table).for('update');
  const allHustle = await read(hustleProspects);
  const allMessages = await read(hustleMessages);
  const allEvents = await read(hustleEvents);
  const sources: Array<{ category: string; rows: Row[] }> = [];
  for (const [category, table] of [
    ['chamber', chamberOutreachProspects], ['credit_union', creditUnionProspects],
    ['brand_video', brandVideoProspects], ['training', trainingOutreachProspects],
    ['sector', sectorOutreachProspects], ['core_relationship', chamberProspects],
    ['inquiry_relationship', projectInquiries], ['application_owner', users],
  ] as const) sources.push({ category, rows: await read(table) });
  const suppressions = await read(chamberOutreachSuppressions);
  if ([allHustle, allMessages, allEvents, suppressions, ...sources.map(s => s.rows)].reduce((n, r) => n + r.length, 0) > MAX_SNAPSHOT_ROWS) throw new Error('Complete known history exceeds safe review bound; no partial approval');
  return { ...state, prospects: allHustle, messages: allMessages, events: allEvents, sources, suppressions, complete: true as const };
}
type KnownState = Awaited<ReturnType<typeof readHustleSponsoredKnownState>>;
function rowAliases(row: Row) {
  const aliases = sponsoredIdentityAliases({ organization: row.businessName || row.creditUnionName || row.company || row.name || '', website: row.website, email: row.email || row.primaryEmail || row.normalizedEmail, organizationKey: row.organizationKey || row.normalizedDomain });
  // Contacts arrays are retained cross-campaign identities, even if not the primary inbox.
  for (const field of ['contactsJson', 'researchJson', 'evidenceJson']) if (row[field]) {
    const tokens = String(row[field]).match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    for (const email of tokens) aliases.push(...sponsoredIdentityAliases({ email: email.toLowerCase() }));
  }
  // Core contacts can store multiple published addresses in a text column.
  for (const email of String(row.email || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) aliases.push(...sponsoredIdentityAliases({ email: email.toLowerCase() }));
  return Array.from(new Set(aliases));
}
function conflict(a: string[], b: string[]) { return a.some(v => b.includes(v)); }
/** Only known, exact, automatic source-only reasons are refreshable. Unknown/freeform
 * holds and coordination holds are never guessed away, even on an untouched row. */
const automaticSourceHolds = new Set([
  'Current unrestricted marketing email, role or local evidence is incomplete, stale or future-dated.',
  'Qualification verified under the November 15 policy. Exact recipient, message, footer and campaign approval remain required; no automatic preparation or sending.',
]);
const benignHistoryTypes = new Set(['research_import', 'research_verified', 'research_review']);
function unsafeMessage(m: Row) {
  return m.claimToken || m.attemptedAt || m.smtpAcceptedAt || m.scheduledAt || m.providerMessageId || m.error || !['draft'].includes(m.status);
}
function recordChecks(record: SponsoredReviewRecord, state: KnownState, now: Date) {
  const blocked = sponsoredRecordBlockers(record, now);
  const aliases = sponsoredIdentityAliases(record);
  const matches = state.prospects.filter((p: Row) => conflict(aliases, rowAliases(p)));
  let existing: Row | null = null;
  if (record.existingProspectId !== null) {
    existing = state.prospects.find((p: Row) => p.id === record.existingProspectId) || null;
    if (!existing || existing.campaignId !== 1 || !matches.some((p: Row) => p.id === existing!.id)) blocked.push('existing_id_identity_mismatch');
  } else if (matches.length) blocked.push('existing_identity_requires_exact_existing_id');
  if (matches.some((p: Row) => p.id !== existing?.id)) blocked.push('duplicate_hustle_alias_or_other_campaign');
  const messages = existing ? state.messages.filter((m: Row) => m.prospectId === existing!.id) : [];
  const events = existing ? state.events.filter((e: Row) => e.prospectId === existing!.id) : [];
  if (existing) {
    if (['bank', 'credit_union', 'business_lender'].includes(existing.category)) blocked.push('protected_existing_banking_category');
    if (existing.stoppedAt || existing.manualNotes || existing.firstSentAt || existing.lastSentAt || existing.stage !== 'identified' || !['review', 'verification_needed'].includes(existing.qualification)) blocked.push('existing_owner_stop_or_protected_disposition');
    if (existing.holdReason && !automaticSourceHolds.has(existing.holdReason)) blocked.push('genuine_or_unproven_coordination_hold');
    if (messages.some(unsafeMessage) || messages.some((m: Row) => m.campaignId !== 1 || ![0, 1, 2].includes(m.sequenceStep)) || new Set(messages.map((m: Row) => m.sequenceStep)).size !== messages.length) blocked.push('existing_claim_attempt_schedule_acceptance_or_message_hold');
    if (events.some((e: Row) => !benignHistoryTypes.has(e.eventType) && ![HUSTLE_SPONSORED_EVENT_TYPES.record].includes(e.eventType))) blocked.push('known_prior_contact_or_owner_history');
  }
  for (const source of state.sources) for (const row of source.rows) {
    // A passive source-only core roster is not a prior contact; real notes/contact/outcome
    // or a relationship/inquiry are protected. Other campaigns reserve ALL their rows.
    if (source.category === 'core_relationship' && ['identified', 'researching'].includes(row.stage) && !row.lastContact && !row.nextFollowup && !row.notes) continue;
    if (source.category === 'application_owner' && row.openId !== ENV.ownerOpenId) continue;
    if (conflict(aliases, rowAliases(row))) blocked.push('cross_campaign_' + source.category);
  }
  if (state.suppressions.some((s: Row) => String(s.email).toLowerCase() === record.email)) blocked.push('shared_suppression');
  return { existing, messages, events, baselineHash: targetBaseline(existing, messages, events), blocked: Array.from(new Set(blocked)) };
}
function localTransportConfigured() {
  // Match existing sender credential/account configuration locally; never probe/import SMTP.
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || '465');
  return Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS) && host === 'smtp.gmail.com' && Number.isInteger(port) && [465, 587].includes(port);
}
function inboxIdentity(c: Row, events: Row[], now: Date): Record<string, string> | null {
  if (!hasHustleCompleteInboxAnchor(c as any, events as any, now)) return null;
  const newest = events.filter(e => ['hustle_inbox_complete', 'hustle_inbox_failed'].includes(e.eventType)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id)[0];
  try { const a = JSON.parse(newest!.detailJson); return Object.fromEntries(a.folders.map((f: any) => [f.kind, f.uidValidity])); } catch { return null; }
}
function latest(events: Row[], type: string) { return events.filter(e => e.eventType === type && e.campaignId === 1).sort((a, b) => b.id - a.id)[0]; }

/** Execution metadata ONLY. The batch/records, original window and packet bytes are
 * never rewritten. Both the original canonical batch hash and this envelope hash
 * are signed into manifest/approvals and independently reconstructed by readers. */
export function deriveHustleRenewedExecutionEnvelope(actor: HustleManagedOperatorActor, originalBatchHash: string) {
  const authorization = assertHustleRenewedStartActor(actor);
  if (originalBatchHash !== actor.batchHash) throw new Error('Exact original renewed batch required');
  const payload = { version: authorization.version, packetSha256: actor.packetSha256,
    originalBatchHash, originalProposalSha256: actor.originalProposalSha256,
    originalWindow: { notBefore: HUSTLE_LATE_START_PINS.notBefore, expiresAt: HUSTLE_LATE_START_PINS.expiresAt },
    executionWindow: hustleTaskWindow(actor), authorization };
  return { ...payload, executionHash: hash(payload) };
}
function executionWindow(signed: Signed, originalBatchHash?: string) {
  if (!isHustleManagedOperatorActor(signed.actor) || !signed.actor.approvedBy.renewedStart) {
    if (signed.payload.executionEnvelope) throw new Error('Unsealed execution envelope');
    return signed.payload.initialSendWindow;
  }
  const expected = deriveHustleRenewedExecutionEnvelope(signed.actor, originalBatchHash ?? signed.actor.batchHash);
  if (hash(expected) !== hash(signed.payload.executionEnvelope) ||
    hash(expected.originalWindow) !== hash(signed.payload.initialSendWindow)) throw new Error('Renewed execution envelope replay mismatch');
  return expected.executionWindow;
}
function rejectPriorRenewalState(events: Row[], stageKey: string, ownReview?: Row, durableRead = false) {
  if (ownReview?.continuationVersion === continuationPins.version) {
    const authority = readHustlePartialContinuationAuthority(events);
    if (!authority || ownReview.reviewId !== authority.consent.reviewId || hash(ownReview) !== authority.consent.reviewHash)
      throw new Error('Exact signed current-source continuation pointer required');
    return;
  }
  if (ownReview?.recoveryVersion === recoveryPins.version) {
    const authority = readHustleBeforeClaimRecoveryAuthority(events);
    if (!authority || ownReview.reviewId !== authority.consent.reviewId || hash(ownReview) !== authority.consent.reviewHash)
      throw new Error('Exact current recovery pointer required; no source waiver');
    return;
  }
  const ownKeys = new Set<string>(ownReview ? [stageKey, ...ownReview.refs.map((r: Row) => r.eventKey),
    'hustle-sponsored-approved:' + ownReview.reviewId, 'hustle-sponsored-policy:' + ownReview.reviewId] : [stageKey]);
  // Even corrupt/old-source envelopes or refusal/intent records remain authoritative.
  // No migration/re-signing of prior approvals, manifests or ambiguous attempts.
  if (events.some(e => e.eventKey?.startsWith('hustle-first-batch-register:') ||
    e.eventKey?.startsWith('hustle-first-batch-job:') || (!durableRead && e.eventKey?.startsWith('hustle-first-batch-shared-attempt:')) ||
    e.eventKey?.startsWith('hustle-first-batch-task-manifest:2026-11-18') ||
    e.eventKey?.startsWith('hustle-first-batch-late-start:') ||
    e.eventType?.startsWith('hustle_first_batch_registration_') || e.eventType === 'hustle_first_batch_job_binding' ||
    (!ownKeys.has(e.eventKey) && !e.eventKey?.startsWith('hustle-sponsored-authorization:' + ownReview?.reviewId + ':') &&
      (e.eventKey?.startsWith('hustle-sponsored-stage:') ||
      Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType)))))
    throw new Error('Prior first-batch intent/review/approval state exists; inspect, no renewal overwrite or retry');
}

/** Owner staging writes record envelopes + manifest ONLY in one transaction. Blocked
 * research can be reviewed honestly; staging never clears a hold or implies approval. */
export async function stageHustleSponsoredReview(ctx: Pick<TrpcContext, 'user'>, input: unknown, now = new Date()) {
  const actor = owner(ctx); signingKey();
  return stageHustleSponsoredReviewCore(actor, input, now);
}
/** Private actor-accepting implementation; never called with request-supplied actor JSON. */
async function stageHustleSponsoredReviewCore(actor: ReviewActor, input: unknown, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('Trusted server clock required');
  const batch = sponsoredReviewBatchSchema.parse(input), batchHash = hash(batch);
  if (isHustleManagedOperatorActor(actor) && batchHash !== actor.batchHash) throw new Error('Exact operator batch hash required');
  const renewed = isHustleManagedOperatorActor(actor) && actor.approvedBy.renewedStart;
  const executionEnvelope = renewed ? deriveHustleRenewedExecutionEnvelope(actor as HustleManagedOperatorActor, batchHash) : undefined;
  if (executionEnvelope && hash(batch.initialSendWindow) !== hash(executionEnvelope.originalWindow)) throw new Error('Unchanged original packet window required');
  const stageKey = (renewed ? 'hustle-sponsored-renewed-stage:' : 'hustle-sponsored-stage:') + batchHash;
  const db = await database();
  return db.transaction(async tx => {
    const state = await readHustleSponsoredKnownState(tx);
    if (renewed && !state.events.some((e: Row) => e.eventKey === stageKey)) rejectPriorRenewalState(state.events, stageKey);
    const checks = batch.records.map(r => recordChecks(r, state, now));
    const blocked = checks.flatMap((c, index) => c.blocked.map(category => ({ index, organization: batch.records[index]!.organization, category })));
    const healthBlockers = [!inboxIdentity(state.campaign, state.events, now) ? 'fresh_complete_all_junk_trash_inbox_required' : null, !localTransportConfigured() ? 'local_gmail_smtp_configuration_required' : null].filter(Boolean);
    const previous = state.events.find((e: Row) => e.eventKey === stageKey);
    if (previous) {
      const signed = verify(previous, HUSTLE_SPONSORED_EVENT_TYPES.manifest);
      if (!signed || signed.payload.batchHash !== batchHash ||
        (isHustleManagedOperatorActor(actor) && !sameActor(signed.actor, actor))) throw new Error('Existing stage provenance invalid or grant replay; no inferred approval');
      return { reviewId: signed.payload.reviewId as string, reviewHash: hash(signed.payload), batchHash, alreadyRecorded: true, approvalRecorded: false, noSends: true as const, blocked, healthBlockers, eligibleCount: checks.filter(c => !c.blocked.length).length, researchStockCount: batch.records.length };
    }
    const reviewId = randomBytes(24).toString('hex');
    const refs = batch.records.map((record, index) => ({ index, eventKey: `hustle-sponsored-review:${reviewId}:${index}`, recordHash: hash(record), baselineHash: checks[index]!.baselineHash, existingProspectId: record.existingProspectId }));
    const manifest = { reviewId, batchHash, stagedAt: now.getTime(), initialSendWindow: batch.initialSendWindow,
      ...(executionEnvelope ? { executionEnvelope } : {}), campaignBaselineHash: hash(campaignBinding(state.campaign)), policyHash: HUSTLE_SPONSORED_POLICY_HASH, refs, blocked, eligibleCount: checks.filter(c => !c.blocked.length).length, researchStockCount: batch.records.length, noSends: true };
    // Preflight all full metadata bytes before any insert; transaction still rolls back on failure.
    serialized(sign(HUSTLE_SPONSORED_EVENT_TYPES.manifest, actor, manifest));
    for (const ref of refs) {
      const record = batch.records[ref.index]!;
      await eventWrite(tx, ref.eventKey, HUSTLE_SPONSORED_EVENT_TYPES.record, actor, { reviewId, index: ref.index, record, recordHash: ref.recordHash, researchHash: researchHash(record), baselineHash: ref.baselineHash, policyHash: HUSTLE_SPONSORED_POLICY_HASH, headers: HUSTLE_SPONSORED_HEADERS, fromDisplay: HUSTLE_SPONSORED_FROM_DISPLAY }, record.existingProspectId ?? undefined);
    }
    await eventWrite(tx, stageKey, HUSTLE_SPONSORED_EVENT_TYPES.manifest, actor, manifest);
    return { reviewId, reviewHash: hash(manifest), batchHash, alreadyRecorded: false, approvalRecorded: false, noSends: true as const, blocked, healthBlockers, eligibleCount: manifest.eligibleCount, researchStockCount: batch.records.length };
  });
}
function sourceColumns(record: SponsoredReviewRecord, reviewId: string) {
  return { name: record.organization, website: record.website, category: 'other_sponsor',
    localEvidence: record.sponsorRecognition.recognitionEvidence, localSourceUrl: record.sponsorRecognition.url,
    contactName: null, contactTitle: null, recipientType: 'sponsored_general', email: record.email,
    emailSourceUrl: record.emailEvidence.url, emailSourceQuote: record.emailEvidence.quote,
    roleSourceUrl: null, phone: record.phone, phoneSourceUrl: record.phoneEvidence?.url ?? null,
    evidenceJson: JSON.stringify({ marker: HUSTLE_SPONSORED_MARKER, sourceVersion: HUSTLE_SPONSORED_SOURCE_VERSION, reviewId, researchHash: researchHash(record), record }),
  };
}
/** ONLY exact consolidated authenticated final approval can execute this operation.
 * Replay returns a recording receipt, never re-enrollment or new send permission.
 * All blocked records abort the whole transaction; never pad a batch to five. */
export async function approveHustleSponsoredReview(ctx: Pick<TrpcContext, 'user'>, input: unknown, now = new Date()) {
  const actor = owner(ctx); signingKey();
  if (process.env.NODE_ENV !== 'production') throw new Error('Published production owner approval required; local preview cannot approve or launch');
  return approveHustleSponsoredReviewCore(actor, input, now);
}
/** Private core. Owner admission or sealed operator+release admission occurs above it. */
async function approveHustleSponsoredReviewCore(actor: ReviewActor, input: unknown, now: Date) {
  const request = sponsoredReviewApprovalSchema.parse(input), db = await database();
  if (!Number.isFinite(now.getTime())) throw new Error('Trusted server clock required');
  return db.transaction(async tx => {
    const state = await readHustleSponsoredKnownState(tx);
    const manifestEvent = state.events.find((e: Row) => e.eventType === HUSTLE_SPONSORED_EVENT_TYPES.manifest && verify(e, e.eventType)?.payload.reviewId === request.reviewId);
    const manifestSigned = verify(manifestEvent, HUSTLE_SPONSORED_EVENT_TYPES.manifest);
    if (!manifestSigned || !sameActor(manifestSigned.actor, actor) || hash(manifestSigned.payload) !== request.reviewHash) throw new Error('Exact actor-owned signed review/hash required');
    const manifest = manifestSigned.payload;
    if (isHustleManagedOperatorActor(actor) && manifest.batchHash !== actor.batchHash) throw new Error('Exact approved operator batch required');
    executionWindow(manifestSigned, manifest.batchHash);
    if (isHustleManagedOperatorActor(actor) && actor.approvedBy.renewedStart)
      rejectPriorRenewalState(state.events, 'hustle-sponsored-renewed-stage:' + actor.batchHash, manifest);
    const receiptEvent = state.events.find((e: Row) => e.eventKey === 'hustle-sponsored-approved:' + request.reviewId);
    if (receiptEvent) {
      const receipt = verify(receiptEvent, HUSTLE_SPONSORED_EVENT_TYPES.receipt);
      if (!receipt || !sameActor(receipt.actor, actor) || receipt.payload.reviewHash !== request.reviewHash) throw new Error('Approval replay provenance mismatch');
      return { ...receipt.payload, alreadyRecorded: true, noSends: true as const, recordingOnly: true };
    }
    if (latest(state.events, HUSTLE_SPONSORED_EVENT_TYPES.manifest)?.id !== manifestEvent!.id || manifest.stagedAt > now.getTime() || now.getTime() - manifest.stagedAt >= HUSTLE_SPONSORED_MAX_AGE_MS || manifest.policyHash !== HUSTLE_SPONSORED_POLICY_HASH || manifest.campaignBaselineHash !== hash(campaignBinding(state.campaign))) throw new Error('Stage superseded, stale or current campaign policy baseline changed');
    if (!Array.isArray(manifest.refs) || manifest.refs.length < 1 || manifest.refs.length > 30) throw new Error('Complete bounded signed manifest required');
    const records = manifest.refs.map((ref: Row, index: number) => {
      const event = state.events.find((e: Row) => e.eventKey === ref.eventKey);
      const signed = verify(event, HUSTLE_SPONSORED_EVENT_TYPES.record);
      if (!signed || !sameActor(signed.actor, actor) || signed.payload.reviewId !== request.reviewId || signed.payload.index !== index || ref.index !== index || hash(signed.payload.record) !== ref.recordHash || signed.payload.recordHash !== ref.recordHash || signed.payload.policyHash !== HUSTLE_SPONSORED_POLICY_HASH || hash(signed.payload.headers) !== hash(HUSTLE_SPONSORED_HEADERS) || signed.payload.fromDisplay !== HUSTLE_SPONSORED_FROM_DISPLAY) throw new Error('Signed record mapping or payload changed');
      const record = sponsoredReviewRecordSchema.parse(signed.payload.record);
      if (signed.payload.researchHash !== researchHash(record)) throw new Error('Signed research binding changed');
      const current = recordChecks(record, state, now);
      if (current.blocked.length || current.baselineHash !== ref.baselineHash || signed.payload.baselineHash !== ref.baselineHash) throw new Error('Entire review refused: fresh source/recipient/hold/history conflict: ' + (current.blocked.join(',') || 'baseline_changed'));
      return { record, current };
    });
    // Reparse complete batch to reject signed duplicate aliases rather than relying on refs.
    const batch = sponsoredReviewBatchSchema.parse({ campaignId: 1, campaignSlug: HUSTLE_SPONSORED_SLUG, initialSendWindow: manifest.initialSendWindow, records: records.map((r: any) => r.record) });
    if (hash(batch) !== manifest.batchHash) throw new Error('Exact staged batch changed');
    const uidValidity = inboxIdentity(state.campaign, state.events, now);
    if (!uidValidity || !localTransportConfigured()) throw new Error('Fresh complete All/Junk/Trash inbox and existing local Gmail SMTP configuration required; no provider probe');
    const approvedCampaign = { ...state.campaign, configVersion: HUSTLE_SPONSORED_CONFIG_VERSION, episodeGoal: 12 };
    const campaignBindingHash = hash(campaignBinding(approvedCampaign));
    const approvals: Array<{ prospectId: number; messageIds: number[] }> = [];
    for (const { record, current } of records) {
      let prospectId = current.existing?.id;
      const columns = sourceColumns(record, request.reviewId);
      if (Buffer.byteLength(columns.evidenceJson, 'utf8') >= EVENT_MAX_BYTES) throw new Error('Research marker exceeds bounded existing column');
      if (prospectId) await tx.update(hustleProspects).set({ ...columns, qualification: 'qualified', holdReason: null, stage: 'ready' }).where(and(eq(hustleProspects.id, prospectId), eq(hustleProspects.campaignId, 1)));
      else {
        await tx.insert(hustleProspects).values({ campaignId: 1, organizationKey: sponsoredOrganizationKey(record), ...columns, qualification: 'qualified', holdReason: null, stage: 'ready', unsubscribeToken: randomBytes(24).toString('hex') });
        const [created] = await tx.select().from(hustleProspects).where(and(eq(hustleProspects.campaignId, 1), eq(hustleProspects.organizationKey, sponsoredOrganizationKey(record)))).for('update');
        if (!created) throw new Error('Exactly one newly persisted organization mapping required');
        prospectId = created.id;
      }
      for (const m of record.messages) {
        const prior = current.messages.find((old: Row) => old.sequenceStep === m.sequenceStep);
        const scheduledAt = m.sequenceStep === 0 && batch.initialSendWindow ?
          new Date(manifest.executionEnvelope ? now.getTime() : batch.initialSendWindow.notBefore) : null;
        if (prior) await tx.update(hustleMessages).set({ subject: m.subject, textBody: m.textBody, status: 'approved', scheduledAt }).where(and(eq(hustleMessages.id, prior.id), eq(hustleMessages.prospectId, prospectId)));
        else await tx.insert(hustleMessages).values({ campaignId: 1, prospectId, sequenceStep: m.sequenceStep, subject: m.subject, textBody: m.textBody, status: 'approved', scheduledAt });
      }
      const [p] = await tx.select().from(hustleProspects).where(eq(hustleProspects.id, prospectId)).for('update');
      const mappings = await tx.select().from(hustleMessages).where(eq(hustleMessages.prospectId, prospectId)).for('update');
      if (!p || mappings.length !== 3 || new Set(mappings.map((m: Row) => m.id)).size !== 3) throw new Error('Exact three stable message mappings required');
      const messages = record.messages.map(m => {
        const row = mappings.find((v: Row) => v.sequenceStep === m.sequenceStep);
        if (!row || row.campaignId !== 1 || row.subject !== m.subject || row.textBody !== m.textBody) throw new Error('Persisted exact mapping mismatch');
        return { ...m, messageId: row.id };
      });
      const payload = { reviewId: request.reviewId, reviewHash: request.reviewHash, campaignId: 1, prospectId,
        approvedAt: now.getTime(), expiresAt: now.getTime() + HUSTLE_SPONSORED_MAX_AGE_MS,
        sourceVersion: HUSTLE_SPONSORED_SOURCE_VERSION, sourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH,
        policyHash: HUSTLE_SPONSORED_POLICY_HASH, researchHash: researchHash(record),
        prospectBindingHash: hash(prospectBinding(p)), campaignBindingHash, priorBaselineHash: current.baselineHash,
        initialSendWindow: batch.initialSendWindow,
        ...(manifest.executionEnvelope ? { executionEnvelope: manifest.executionEnvelope } : {}),
        record, messages, uidValidity, headers: HUSTLE_SPONSORED_HEADERS, fromDisplay: HUSTLE_SPONSORED_FROM_DISPLAY,
        noSends: true, noAutomaticRetry: true, consolidatedFooterHomepageAndPolicyApproved: true,
      };
      await eventWrite(tx, `hustle-sponsored-authorization:${request.reviewId}:${prospectId}`, HUSTLE_SPONSORED_EVENT_TYPES.approval, actor, payload, prospectId);
      approvals.push({ prospectId, messageIds: messages.map(m => m.messageId) });
    }
    // Intentionally no status/launch/scheduler/episodes/history mutation.
    await tx.update(hustleCampaigns).set({ configVersion: HUSTLE_SPONSORED_CONFIG_VERSION, episodeGoal: 12 }).where(eq(hustleCampaigns.id, 1));
    await eventWrite(tx, 'hustle-sponsored-policy:' + request.reviewId, HUSTLE_SPONSORED_EVENT_TYPES.policy, actor, { reviewId: request.reviewId, reviewHash: request.reviewHash, policy: HUSTLE_SPONSORED_POLICY, policyHash: HUSTLE_SPONSORED_POLICY_HASH, campaignBindingHash, approvedAt: now.getTime(), prospectiveOnly: true, noSends: true });
    const receipt = { reviewId: request.reviewId, reviewHash: request.reviewHash, approvedAt: now.getTime(), approvals, noSends: true, noActivation: true };
    await eventWrite(tx, 'hustle-sponsored-approved:' + request.reviewId, HUSTLE_SPONSORED_EVENT_TYPES.receipt, actor, receipt);
    return { ...receipt, alreadyRecorded: false, recordingOnly: false };
  });
}
const operatorStageInputSchema = z.object({
  packetSha256: z.literal(HUSTLE_MANAGED_OPERATOR_PINS.packetSha256),
  packetJson: z.string().min(1).max(1_000_000),
}).strict();
const operatorApprovalInputSchema = sponsoredReviewApprovalSchema.extend({
  packetSha256: z.literal(HUSTLE_MANAGED_OPERATOR_PINS.packetSha256),
}).strict();
/** Server-private CLI path. Exact retained UTF-8 file bytes are hashed, not a caller's
 * claimed checksum. Signed receipt is not a timer permit and never contains a UID. */
export async function stageHustleSponsoredReviewAsOperator(grant: unknown, input: unknown, now = new Date()) {
  const actor = verifyHustleManagedOperatorGrant(grant, { serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH }, now);
  assertHustleTaskPreparationWindow(actor, now);
  const request = operatorStageInputSchema.parse(input);
  if (createHash('sha256').update(request.packetJson, 'utf8').digest('hex') !== actor.packetSha256)
    throw new Error('Exact pinned packet bytes required');
  const result = await stageHustleSponsoredReviewCore(actor, JSON.parse(request.packetJson), now);
  return { ...result, signedReceipt: sign('hustle_sponsored_operator_stage_receipt', actor,
    { ...result, packetSha256: actor.packetSha256, recordedAt: now.getTime() }) };
}
/** Does not set NODE_ENV or impersonate Jeremy. Requires the parent's fresh HMAC-bound
 * attestation of the independently observed matching published production release. */
export async function approveHustleSponsoredReviewAsOperator(grant: unknown, input: unknown, now = new Date()) {
  const actor = verifyHustleManagedOperatorGrant(grant, {
    serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, requireProductionRelease: true,
  }, now);
  assertHustleTaskPreparationWindow(actor, now);
  const { packetSha256, ...request } = operatorApprovalInputSchema.parse(input);
  const result = await approveHustleSponsoredReviewCore(actor, request, now);
  return { ...result, signedReceipt: sign('hustle_sponsored_operator_approval_receipt', actor,
    { ...result, packetSha256, recordedAt: now.getTime() }) };
}
/** Signed policy verification is independent of legacy campaign approval. Missing events
 * means unknown, NOT configured/approved. Pass complete DB event rows, never RPC JSON. */
export function getHustleSponsoredCampaignPolicy(c: Row, events?: Row[], now = new Date()) {
  if (!events || c.id !== 1 || c.slug !== HUSTLE_SPONSORED_SLUG || c.configVersion !== HUSTLE_SPONSORED_CONFIG_VERSION || c.episodeGoal !== 12) return null;
  const signed = verify(latest(events, HUSTLE_SPONSORED_EVENT_TYPES.policy), HUSTLE_SPONSORED_EVENT_TYPES.policy, events, now);
  if (!signed || signed.payload.policyHash !== HUSTLE_SPONSORED_POLICY_HASH || hash(signed.payload.policy) !== HUSTLE_SPONSORED_POLICY_HASH || signed.payload.campaignBindingHash !== hash(campaignBinding(c))) return null;
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(signed.payload.approvedAt) || signed.payload.approvedAt > now.getTime()) return null;
  return { ...HUSTLE_SPONSORED_POLICY, verified: true as const, policyHash: HUSTLE_SPONSORED_POLICY_HASH, sourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH };
}
/** This read never signs, applies or dispatches. Fail-closed on any missing signature,
 * source change, exact mapping change, new suppression/cross-campaign conflict or UID reset.
 * Sender still owns actual reply/stop/claim/quota/attempt/no-retry guards inside c lock. */
export async function readHustleSponsoredAuthorization(tx: any, c: Row, p: Row, m: Row, now = new Date(), options: { requireInbox?: boolean; taskGrant?: unknown } = {}): Promise<HustleSponsoredAuthorization | null> {
  try {
    const state = await readHustleSponsoredKnownState(tx);
    const result = authorizationFromState(state, c, p, m, now, options.requireInbox !== false);
    const signed = verify(state.events.filter((e: Row) => e.eventType === HUSTLE_SPONSORED_EVENT_TYPES.approval && e.prospectId === p.id).sort((a: Row, b: Row) => b.id - a.id)[0], HUSTLE_SPONSORED_EVENT_TYPES.approval, state.events, now);
    if (result && m.sequenceStep === 0 && signed && isHustleManagedOperatorActor(signed.actor) && signed.actor.approvedBy.renewedStart) {
      const actor = verifyHustleManagedOperatorGrant(options.taskGrant, {
        serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, requireProductionRelease: true }, now);
      assertHustleTaskPreparationWindow(actor, now);
      if (!actor.approvedBy.renewedStart || hash(actor.approvedBy.renewedStart) !== hash(signed.actor.approvedBy.renewedStart)) return null;
    }
    return result;
  }
  catch { return null; }
}
/** Internal reuse for non-dispatch stock reads; a snapshot is never supplied by RPC. */
function authorizationFromState(state: KnownState, c: Row, p: Row, m: Row, now: Date, requireInbox: boolean): HustleSponsoredAuthorization | null {
  try {
    if (!isHustleSponsoredProspect(p) || p.campaignId !== 1 || p.stoppedAt || p.manualNotes || p.holdReason || p.qualification !== 'qualified') return null;
    if (hash(campaignBinding(state.campaign)) !== hash(campaignBinding(c))) return null;
    const currentProspect = state.prospects.find((v: Row) => v.id === p.id);
    if (!currentProspect || hash(prospectBinding(currentProspect)) !== hash(prospectBinding(p))) return null;
    if (currentProspect.stoppedAt || currentProspect.manualNotes || currentProspect.holdReason || currentProspect.qualification !== 'qualified' || !['ready', 'contacted'].includes(currentProspect.stage)) return null;
    if (!getHustleSponsoredCampaignPolicy(c, state.events, now)) return null;
    const event = state.events.filter((e: Row) => e.eventType === HUSTLE_SPONSORED_EVENT_TYPES.approval && e.prospectId === p.id).sort((a: Row, b: Row) => b.id - a.id)[0];
    const signed = verify(event, HUSTLE_SPONSORED_EVENT_TYPES.approval, state.events, now);
    if (!signed) return null;
    if (signed.sourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH && !readTransitionMessageGate(transition(state.events, now, c), m, { ownedClaimToken: m.claimToken || undefined })) return null;
    const a = signed.payload;
    const record = sponsoredReviewRecordSchema.parse(a.record);
    if (a.prospectId !== p.id || a.campaignId !== 1 || a.sourceVersion !== HUSTLE_SPONSORED_SOURCE_VERSION || a.sourceHash !== signed.sourceHash || a.policyHash !== HUSTLE_SPONSORED_POLICY_HASH || a.researchHash !== researchHash(record) || a.prospectBindingHash !== hash(prospectBinding(p)) || a.campaignBindingHash !== hash(campaignBinding(c)) || hash(a.headers) !== hash(HUSTLE_SPONSORED_HEADERS) || a.fromDisplay !== HUSTLE_SPONSORED_FROM_DISPLAY || !a.consolidatedFooterHomepageAndPolicyApproved) return null;
    if (a.expiresAt - a.approvedAt > HUSTLE_SPONSORED_MAX_AGE_MS || !sponsoredSourceIsFresh(record, now) || sponsoredRecordBlockers(record, now).length) return null;
    const marker = JSON.parse(p.evidenceJson);
    const recovery = a.continuationVersion === continuationPins.version ? readHustlePartialContinuationAuthority(state.events, now) :
      a.recoveryOriginalReviewId === recoveryPins.reviewId ? readHustleBeforeClaimRecoveryAuthority(state.events, now) : null;
    const markerReviewId = recovery && recovery.consent.reviewId === a.reviewId && recovery.consent.reviewHash === a.reviewHash &&
      recovery.consent.prospectIds.includes(p.id) ? recoveryPins.reviewId : a.reviewId;
    if (a.recoveryOriginalReviewId && !recovery) return null;
    if (marker.marker !== HUSTLE_SPONSORED_MARKER || marker.reviewId !== markerReviewId || marker.researchHash !== a.researchHash || hash(marker.record) !== hash(record)) return null;
    const uidValidity = inboxIdentity(c, state.events, now);
    if (requireInbox && (!uidValidity || hash(uidValidity) !== hash(a.uidValidity))) return null;
    const aliases = sponsoredIdentityAliases(record);
    if (state.suppressions.some((s: Row) => String(s.email).toLowerCase() === record.email)) return null;
    if (state.prospects.some((v: Row) => v.id !== p.id && conflict(aliases, rowAliases(v)))) return null;
    for (const source of state.sources) for (const row of source.rows) {
      if (source.category === 'core_relationship' && ['identified', 'researching'].includes(row.stage) && !row.lastContact && !row.nextFollowup && !row.notes) continue;
      if (source.category === 'application_owner' && row.openId !== ENV.ownerOpenId) continue;
      if (conflict(aliases, rowAliases(row))) return null;
    }
    const messages = state.messages.filter((v: Row) => v.prospectId === p.id);
    if (messages.length !== 3 || !Array.isArray(a.messages) || a.messages.length !== 3) return null;
    if (messages.some((row: Row) => row.error || ['uncertain', 'cancelled', 'failed'].includes(row.status) ||
      (row.status === 'sent' && (!row.attemptedAt || !row.smtpAcceptedAt || !row.providerMessageId)) ||
      (row.attemptedAt && !row.smtpAcceptedAt) ||
      (row.id !== m.id && row.status !== 'sent' && (row.claimToken || row.providerMessageId)))) return null;
    for (const exact of a.messages) {
      const row = messages.find((v: Row) => v.id === exact.messageId);
      const proposed = record.messages[exact.sequenceStep as 0 | 1 | 2];
      const { messageId, ...content } = exact;
      if (!row || row.campaignId !== 1 || row.sequenceStep !== exact.sequenceStep || row.subject !== exact.subject || row.textBody !== exact.textBody || hash(content) !== hash(proposed)) return null;
    }
    const authorization = { ...a, initialSendWindow: executionWindow(signed), record, verified: true as const } as HustleSponsoredAuthorization;
    return sponsoredAuthorizationMatches({ authorization, campaign: c, prospect: p, message: m, now }) ? authorization : null;
  } catch { return null; }
}
/** Read-only owner review handoff, complete event records rather than dashboard last100. */
export async function readHustleSponsoredReview(ctx: Pick<TrpcContext, 'user'>, reviewId: string) {
  owner(ctx); const db = await database();
  return db.transaction(async tx => {
    const state = await readHustleSponsoredKnownState(tx);
    const signed = verify(state.events.find((e: Row) => verify(e, HUSTLE_SPONSORED_EVENT_TYPES.manifest)?.payload.reviewId === reviewId), HUSTLE_SPONSORED_EVENT_TYPES.manifest);
    if (!signed) throw new Error('Signed existing review required');
    const records = signed.payload.refs.map((ref: Row) => {
      const record = verify(state.events.find((e: Row) => e.eventKey === ref.eventKey), HUSTLE_SPONSORED_EVENT_TYPES.record);
      if (!record) throw new Error('Complete signed review record required');
      return record.payload.record;
    });
    const receipt = verify(state.events.find((e:Row)=>e.eventKey==='hustle-sponsored-approved:'+reviewId),HUSTLE_SPONSORED_EVENT_TYPES.receipt);
    const approvalRecorded = Boolean(receipt && receipt.payload.reviewHash===hash(signed.payload));
    return { reviewId, reviewHash: hash(signed.payload), manifest: signed.payload, records, approvalRecorded, noSends: true as const };
  });
}

/** Maintenance can verify policy before refreshing inbox; this does not require health. */
export async function readHustleSponsoredCampaignPolicy(tx: any, c: Row, _now = new Date()) {
  const events = await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId, 1));
  return getHustleSponsoredCampaignPolicy(c, events, _now);
}
/** Integration compatibility: complete current projection. Does not assert owner-approved
 * payload/source or replace readHustleSponsoredAuthorization at claim/attempt. */
export async function getHustleSponsoredExclusions(tx: any) {
  const state = await readHustleSponsoredKnownState(tx);
  return {
    complete: true as const,
    blockersFor(input: { organization: string; website: string; email: string | null }, existingProspectId: number | null = null) {
      const aliases = sponsoredIdentityAliases(input), blockers: string[] = [];
      if (state.suppressions.some((s: Row) => String(s.email).toLowerCase() === input.email)) blockers.push('shared_suppression');
      if (state.prospects.some((p: Row) => p.id !== existingProspectId && conflict(aliases, rowAliases(p)))) blockers.push('duplicate_hustle_alias_or_other_campaign');
      for (const source of state.sources) for (const row of source.rows) {
        if (source.category === 'core_relationship' && ['identified', 'researching'].includes(row.stage) && !row.lastContact && !row.nextFollowup && !row.notes) continue;
        if (source.category === 'application_owner' && row.openId !== ENV.ownerOpenId) continue;
        if (conflict(aliases, rowAliases(row))) blockers.push('cross_campaign_' + source.category);
      }
      return Array.from(new Set(blockers));
    },
  };
}

/** Read-only stock, NOT dispatch readiness. One complete snapshot reused across records.
 * Inbox can be stale between callbacks without misreporting approved research as empty.
 * Never use this count/envelope to claim/send; sender always uses default requireInbox. */
export async function readHustleSponsoredReadyStock(db: any, c: Row, _prospects?: Row[], _messages?: Row[], now = new Date()) {
  return db.transaction(async (tx: any) => {
    const state = await readHustleSponsoredKnownState(tx);
    if (hash(campaignBinding(state.campaign)) !== hash(campaignBinding(c)) || !getHustleSponsoredCampaignPolicy(c, state.events, now))
      return { readyInitialCount: 0, target: 30, verified: false, dispatchBlocked: true, noSends: true as const };
    let readyInitialCount = 0;
    for (const p of state.prospects) {
      if (p.campaignId !== 1 || !isHustleSponsoredProspect(p) || p.stage !== 'ready' || p.firstSentAt || p.lastSentAt || p.stoppedAt || p.holdReason || p.manualNotes || p.qualification !== 'qualified') continue;
      const messages = state.messages.filter((m: Row) => m.prospectId === p.id);
      if (messages.length !== 3 || messages.some((m: Row) => m.status !== 'approved' || m.claimToken || m.attemptedAt || m.smtpAcceptedAt || m.providerMessageId || m.error || (m.scheduledAt && m.scheduledAt.getTime() > now.getTime()))) continue;
      const initial = messages.find((m: Row) => m.sequenceStep === 0);
      const authorization = initial ? authorizationFromState(state, c, p, initial, now, false) : null;
      if (authorization && (!authorization.initialSendWindow || now.getTime() >= Date.parse(authorization.initialSendWindow.notBefore) && now.getTime() < Date.parse(authorization.initialSendWindow.expiresAt))) readyInitialCount++;
    }
    return { readyInitialCount, target: 30, verified: true, dispatchBlocked: !inboxIdentity(c, state.events, now) || !localTransportConfigured(), noSends: true as const };
  });
}

export type HustleFirstBatchConsent = {
  reviewId:string; reviewHash:string; campaignId:1; canonicalSchedulerTaskUid:string;
  notBefore:string; expiresAt:string; expected:5; initialMessageIds:number[];
  prospectIds:number[]; organizations:string[];
};
/** Server-private lookup of unchanged durable owner consent, not an execution permit.
 * It deliberately returns the original scope even after an SMTP outcome/recipient stop,
 * so failure accounting can be truthful. The sender still checks every current stop. */
export async function readHustleFirstBatchConsent(tx:any,input:{reviewId:string;reviewHash:string},now=new Date()):Promise<HustleFirstBatchConsent|null>{
  try{
    const request=sponsoredReviewApprovalSchema.parse({...input,confirmExactRecipientsMessagesFooterAndPolicy:true});
    const state=await readHustleLaunchState(tx,true), c=state.campaign as Row;
    if(state.events.length>MAX_SNAPSHOT_ROWS||!getHustleSponsoredCampaignPolicy(c,state.events,now)||!c.schedulerTaskUid)return null;
    const receipt=verify(state.events.find((e:Row)=>e.eventKey==='hustle-sponsored-approved:'+request.reviewId),HUSTLE_SPONSORED_EVENT_TYPES.receipt);
    if(!receipt||receipt.payload.reviewHash!==request.reviewHash||receipt.payload.approvedAt>now.getTime()||!Array.isArray(receipt.payload.approvals)||receipt.payload.approvals.length!==5)return null;
    const manifest=state.events.map((e:Row)=>verify(e,HUSTLE_SPONSORED_EVENT_TYPES.manifest)).find((s:Signed|null)=>s?.payload.reviewId===request.reviewId);
    if(!manifest||!sameActor(manifest.actor,receipt.actor)||hash(manifest.payload)!==request.reviewHash||manifest.payload.refs?.length!==5||manifest.payload.initialSendWindow?.notBefore!=='2026-11-18T15:00:00Z'||manifest.payload.initialSendWindow?.expiresAt!=='2026-11-19T00:00:00Z')return null;
    if(isHustleManagedOperatorActor(manifest.actor)&&manifest.payload.batchHash!==manifest.actor.batchHash)return null;
    const window = executionWindow(manifest, manifest.payload.batchHash);
    if (isHustleManagedOperatorActor(manifest.actor) && manifest.actor.approvedBy.renewedStart)
      // Durable lookup is not a dispatch permit. The task module independently verifies
      // the one original shared fence; registration/approval still reject ANY prior fence.
      rejectPriorRenewalState(state.events, 'hustle-sponsored-renewed-stage:' + manifest.actor.batchHash, manifest.payload, true);
    const expectedEmails=new Set<string>([]);
    const initialMessageIds:number[]=[],prospectIds:number[]=[],organizations:string[]=[];
    for(const mapping of receipt.payload.approvals){
      const signed=verify(state.events.find((e:Row)=>e.eventKey===`hustle-sponsored-authorization:${request.reviewId}:${mapping.prospectId}`),HUSTLE_SPONSORED_EVENT_TYPES.approval);
      const a=signed?.payload;
      if (signed && hash(executionWindow(signed)) !== hash(window)) return null;
      if(!signed||!sameActor(signed.actor,manifest.actor)||!a||a.reviewHash!==request.reviewHash||a.expiresAt<=now.getTime()||a.campaignBindingHash!==hash(campaignBinding(c))||a.researchHash!==researchHash(sponsoredReviewRecordSchema.parse(a.record))||a.initialSendWindow?.notBefore!==manifest.payload.initialSendWindow.notBefore||a.initialSendWindow?.expiresAt!==manifest.payload.initialSendWindow.expiresAt||!expectedEmails.delete(a.record.email))return null;
      if(!Array.isArray(a.messages)||a.messages.length!==3||a.messages.some((m:Row)=>m.to!==a.record.email)||!Array.isArray(mapping.messageIds)||mapping.messageIds.length!==3||hash(mapping.messageIds)!==hash(a.messages.map((m:Row)=>m.messageId)))return null;
      const initial=a.messages.find((m:Row)=>m.sequenceStep===0);
      if(!initial||!Number.isSafeInteger(initial.messageId))return null;
      initialMessageIds.push(initial.messageId);prospectIds.push(mapping.prospectId);organizations.push(a.record.organization);
    }
    if(expectedEmails.size||new Set(initialMessageIds).size!==5||new Set(prospectIds).size!==5)return null;
    return {reviewId:request.reviewId,reviewHash:request.reviewHash,campaignId:1,canonicalSchedulerTaskUid:c.schedulerTaskUid,notBefore:window.notBefore,expiresAt:window.expiresAt,expected:5,initialMessageIds,prospectIds,organizations};
  }catch{return null;}
}
/** Only the authenticated owner may bind a real returned native SDK UID. */
export async function writeHustleFirstBatchJobBinding(tx:any,ctx:Pick<TrpcContext,'user'>,consent:HustleFirstBatchConsent,taskUid:string,now=new Date()){
  const actor=owner(ctx);
  if(process.env.NODE_ENV!=='production'||!taskUid||!/^[-A-Za-z0-9_]{8,65}$/.test(taskUid))throw new Error('Production owner and actual native job UID required');
  const actual=await readHustleFirstBatchConsent(tx,{reviewId:consent.reviewId,reviewHash:consent.reviewHash},now);
  if(!actual||hash(actual)!==hash(consent))throw new Error('Current durable exact five-batch consent required');
  const key='hustle-first-batch-job:'+taskUid;
  const [existing]=await tx.select().from(hustleEvents).where(eq(hustleEvents.eventKey,key)).for('update');
  if(existing){const signed=verify(existing,'hustle_first_batch_job_binding');if(!signed||hash(signed.payload)!==hash({...actual,taskUid}))throw new Error('Native binding mismatch');return {taskUid,alreadyRecorded:true,noSends:true};}
  await eventWrite(tx,key,'hustle_first_batch_job_binding',actor,{...actual,taskUid});
  return {taskUid,alreadyRecorded:false,noSends:true};
}
/** Authenticated cron taskUid is the sole lookup key; never trust request-body IDs. */
export async function readHustleFirstBatchJobBinding(tx:any,taskUid:string,now=new Date()):Promise<(HustleFirstBatchConsent&{taskUid:string})|null>{
  const [event]=await tx.select().from(hustleEvents).where(eq(hustleEvents.eventKey,'hustle-first-batch-job:'+taskUid));
  const signed=verify(event,'hustle_first_batch_job_binding');
  if(!signed||signed.payload.taskUid!==taskUid)return null;
  const actual=await readHustleFirstBatchConsent(tx,{reviewId:signed.payload.reviewId,reviewHash:signed.payload.reviewHash},now);
  return actual&&hash({...actual,taskUid})===hash(signed.payload)?{...actual,taskUid}:null;
}

/** This signed pointer is the ONLY exception to renewal coexistence. Old signatures
 * are evidence of the fixed incident, never current-source authorization. */
export function readHustleBeforeClaimRecoveryAuthority(events: Row[], now = new Date()): Row | null {
  try {
    if (events.length > MAX_SNAPSHOT_ROWS || !Number.isFinite(now.getTime())) return null;
    const pointers = events.filter((e: Row) => e.eventKey === recoveryPins.auditKey);
    if (pointers.length !== 1) return null;
    const signed = verify(pointers[0], 'hustle_sponsored_before_claim_recovery_authority');
    if (!signed || !isHustleManagedOperatorActor(signed.actor)) return null;
    const a = signed.payload;
    if (a.version !== recoveryPins.version || a.oldReviewId !== recoveryPins.reviewId || a.oldReviewHash !== recoveryPins.reviewHash ||
      a.oldSourceHash !== recoveryPins.sourceHash || a.oldSourceMapHash !== recoveryPins.sourceMapHash ||
      hash(a.originalFiles) !== hash(recoveryPins.files) || a.zeroEvidence?.complete !== true || a.zeroEvidence.claims !== 0 ||
      a.zeroEvidence.attempts !== 0 || a.zeroEvidence.receipts !== 0 || a.zeroEvidence.uncertain !== 0 ||
      a.zeroEvidence.sharedFenceAbsent !== true || a.zeroEvidence.messages !== 15 || a.noAutomaticRetry !== true ||
      a.registeredAt > now.getTime() || !Number.isSafeInteger(a.registeredAt) || a.taskKey !== recoveryPins.taskKey ||
      a.authorityKey !== recoveryPins.authorityKey || !signed.actor.approvedBy.renewedStart ||
      hash(a.consent.prospectIds) !== hash(recoveryPins.prospectIds) ||
      hash(a.consent.initialMessageIds) !== hash([90001, 90004, 90007, 90010, 90013]) ||
      a.consent.notBefore !== '2026-11-19T15:00:00Z' || a.consent.expiresAt !== '2026-11-20T00:00:00Z') return null;
    const old = assertRecoveryHistoricalEvents(events);
    if (hash(recoveryActorProvenance(old.actor)) !== hash(recoveryActorProvenance(signed.actor))) return null;
    const manifest = verify(events.find((e: Row) => e.eventKey === a.stageKey), HUSTLE_SPONSORED_EVENT_TYPES.manifest);
    if (!manifest || !sameActor(manifest.actor, signed.actor) || manifest.payload.recoveryVersion !== recoveryPins.version ||
      manifest.payload.reviewId !== a.consent.reviewId || hash(manifest.payload) !== a.consent.reviewHash ||
      manifest.payload.batchHash !== HUSTLE_MANAGED_OPERATOR_PINS.batchHash ||
      hash(manifest.payload.refs.map((r: Row) => r.existingProspectId)) !== hash(recoveryPins.prospectIds)) return null;
    const permitted = new Set([...Object.keys(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS), recoveryPins.auditKey,
      recoveryPins.taskKey, recoveryPins.authorityKey, recoveryPins.fenceKey, 'hustle-first-batch-task-manifest:2026-11-19:result',
      a.stageKey, ...manifest.payload.refs.map((r: Row) => r.eventKey),
      'hustle-sponsored-policy:' + a.consent.reviewId, 'hustle-sponsored-approved:' + a.consent.reviewId,
      ...recoveryPins.prospectIds.map(id => `hustle-sponsored-authorization:${a.consent.reviewId}:${id}`)]);
    if (events.some((e: Row) => !permitted.has(e.eventKey) && (e.eventKey?.startsWith('hustle-sponsored-') ||
      e.eventKey?.startsWith('hustle-first-batch-') || Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType) ||
      e.eventType?.startsWith('hustle_first_batch_registration_') || e.eventType === 'hustle_first_batch_job_binding'))) return null;
    return { ...a, actor: signed.actor };
  } catch { return null; }
}
function assertRecoveryZero(state: KnownState, now: Date) {
  const old = assertRecoveryHistoricalEvents(state.events);
  if (state.complete !== true || state.events.some((e: Row) => e.eventKey === recoveryPins.fenceKey ||
    e.eventKey?.startsWith('hustle-first-batch-register:') || e.eventKey?.startsWith('hustle-first-batch-job:') ||
    e.eventKey?.startsWith('hustle-first-batch-task-manifest:2026-11-18') ||
    e.eventKey?.endsWith(':result') && e.eventKey?.startsWith('hustle-first-batch-') ||
    e.eventType?.startsWith('hustle_first_batch_registration_') || e.eventType === 'hustle_first_batch_job_binding'))
    throw new Error('Recovery requires complete authoritative absence of shared fence/native/result uncertainty');
  const c = state.campaign;
  if (c.status !== 'active' || c.schedulerTaskUid !== old.consent.canonicalSchedulerTaskUid ||
    !(c.launchApprovedAt instanceof Date) || c.launchApprovedAt > now || c.configVersion !== HUSTLE_SPONSORED_CONFIG_VERSION ||
    c.episodeGoal !== 12 || !inboxIdentity(c, state.events, now) || !localTransportConfigured() ||
    state.episodes.filter((e: Row) => e.seasonYear === 2027 && e.sponsorProspectId !== null).length >= 12)
    throw new Error('Recovery requires current campaign/source/reply/inbox/config health');
  const target = state.messages.filter((m: Row) => recoveryPins.prospectIds.includes(m.prospectId));
  if (target.length !== 15 || hash(target.map((m: Row) => m.id).sort((a: number,b: number) => a-b)) !== hash(recoveryPins.messageIds))
    throw new Error('Recovery requires exact complete fifteen original message IDs');
  for (let i = 0; i < 5; i++) {
    const p = state.prospects.find((p: Row) => p.id === recoveryPins.prospectIds[i]);
    if (!p || p.campaignId !== 1 || p.stage !== 'ready' || p.qualification !== 'qualified' ||
      ['firstSentAt','lastSentAt','stoppedAt','holdReason','manualNotes'].some(k => !(k in p) || p[k] !== null))
      throw new Error('Recovery cannot clear any current stop/hold/contact/disposition');
    for (let step = 0; step < 3; step++) {
      const m = target.find((m: Row) => m.id === recoveryPins.messageIds[i * 3 + step]);
      if (!m || m.prospectId !== p.id || m.campaignId !== 1 || m.sequenceStep !== step || m.status !== 'approved' ||
        ['claimToken','attemptedAt','smtpAcceptedAt','providerMessageId','error'].some(k => !(k in m) || m[k] !== null) ||
        (step === 0 ? !(m.scheduledAt instanceof Date) || m.scheduledAt > now ||
          m.scheduledAt.getTime() < Date.parse(old.consent.notBefore) || m.scheduledAt.getTime() >= Date.parse(old.consent.expiresAt) : m.scheduledAt !== null))
        throw new Error('Recovery refuses claimed/attempted/accepted/uncertain/missing or rescheduled message');
    }
  }
  const day = getOutreachLocalMoment(now).dateKey;
  const used = state.messages.filter((m: Row) => m.campaignId === 1 && m.sequenceStep === 0 &&
    ((m.attemptedAt && getOutreachLocalMoment(m.attemptedAt).dateKey === day) ||
      (m.smtpAcceptedAt && getOutreachLocalMoment(m.smtpAcceptedAt).dateKey === day) || (!m.attemptedAt && m.claimToken))).length;
  if (used !== 0 || HUSTLE_SPONSORED_POLICY.dailyNewLimit !== 5) throw new Error('Full exact-five global Chicago daily capacity unavailable');
  return old;
}
/** Fresh grant admission + one transaction, append-only exact source reauthorization.
 * No existing message/prospect/campaign/event is updated. Packet copy stays byte-identical. */
export async function reauthorizeHustleBeforeClaimRecovery(grant: unknown, input: {
  packetJson: string; originalFiles: Record<string, string>; oldSourceMetadata: { sourceHash: string; sourceHashes: Record<string,string> };
}, now = new Date()) {
  const actor = verifyHustleManagedOperatorGrant(grant, { serverSourceHash: HUSTLE_SPONSORED_SERVER_SOURCE_HASH, requireProductionRelease: true }, new Date());
  assertHustleTaskPreparationWindow(actor, now); assertRecoveryArchive(input.originalFiles);
  if (!actor.approvedBy.renewedStart || Math.abs(Date.now() - now.getTime()) > 5000 ||
    createHash('sha256').update(input.packetJson, 'utf8').digest('hex') !== actor.packetSha256 ||
    input.oldSourceMetadata.sourceHash !== recoveryPins.sourceHash ||
    // Exact old-map digest is incident evidence, never current source permission.
    hash(input.oldSourceMetadata.sourceHashes) !== recoveryPins.sourceMapHash ||
    Object.keys(input.oldSourceMetadata.sourceHashes).length !== 90 ||
    ['server/hustleBeforeClaimRecovery.ts','scripts/hustle-task-first-batch-recovery.ts'].some(path =>
      !/^[a-f0-9]{64}$/.test((release.sourceHashes as Record<string,string>)[path] || '')))
    throw new Error('Exact fixed recovery incident, actual renewed grant and complete current source release required');
  const batch = sponsoredReviewBatchSchema.parse(JSON.parse(input.packetJson));
  if (hash(batch) !== actor.batchHash || batch.records.length !== 5 ||
    hash(batch.records.map((r, index) => r.existingProspectId ?? recoveryPins.prospectIds[index])) !== hash(recoveryPins.prospectIds))
    throw new Error('Immutable original five packet/mapping required');
  const db = await database();
  return db.transaction(async tx => {
    const state = await readHustleSponsoredKnownState(tx), old = assertRecoveryZero(state, now);
    if (state.events.some((e: Row) => e.eventKey === recoveryPins.auditKey || e.eventKey === recoveryPins.taskKey || e.eventKey === recoveryPins.authorityKey))
      throw new Error('Existing recovery intent/authority; inspect, no recovery reauthorization retry');
    if (hash(recoveryActorProvenance(old.actor)) !== hash(recoveryActorProvenance(actor))) throw new Error('Exact original direct renewal provenance required');
    if (state.events.some((e: Row) => !Object.hasOwn(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS, e.eventKey) &&
      (e.eventKey?.startsWith('hustle-sponsored-') || e.eventKey?.startsWith('hustle-first-batch-') ||
      Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType)))) throw new Error('Additional first-batch authority ambiguity');
    const reviewId = randomBytes(24).toString('hex'), executionEnvelope = deriveHustleRenewedExecutionEnvelope(actor, actor.batchHash);
    const checks = batch.records.map((record, index) => {
      // The immutable original packet used null for its one newly created prospect.
      // Its actual allocated ID comes only from the pinned, HMAC-verified incident mapping.
      const p = state.prospects.find((p: Row) => p.id === recoveryPins.prospectIds[index])!;
      const oldApproval = JSON.parse(state.events.find((e: Row) => e.eventKey === `hustle-sponsored-authorization:${recoveryPins.reviewId}:${p.id}`)!.detailJson).payload;
      const messages = state.messages.filter((m: Row) => m.prospectId === p.id);
      if (hash(oldApproval.record) !== hash(record) || oldApproval.prospectBindingHash !== hash(prospectBinding(p)) ||
        oldApproval.campaignBindingHash !== hash(campaignBinding(state.campaign)) ||
        oldApproval.messages.some((exact: Row) => { const m = messages.find((m: Row) => m.id === exact.messageId);
          const {messageId: _id, ...body} = exact;
          return !m || m.subject !== exact.subject || m.textBody !== exact.textBody ||
            hash(body) !== hash(record.messages[exact.sequenceStep as 0|1|2]); })) throw new Error('Original exact source/content baseline changed');
      // Only the independently proved unsent target disposition and exact signed incident
      // history are projected for existing generic exclusions. Real rows are never reset.
      const projected = { ...state, prospects: state.prospects.map((v: Row) => v.id === p.id ? {...v, stage:'identified', qualification:'review'} : v),
        messages: state.messages.map((v: Row) => v.prospectId === p.id ? {...v, status:'draft', scheduledAt:null} : v),
        events: state.events.filter((e: Row) => !Object.hasOwn(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS, e.eventKey)) };
      const check = recordChecks({ ...record, existingProspectId: p.id }, projected, now);
      if (check.blocked.length) throw new Error('Current recovery source/exclusion/history conflict: ' + check.blocked.join(','));
      return { p, messages, baselineHash: targetBaseline(p, messages, state.events.filter((e: Row) => e.prospectId === p.id)), record, index };
    });
    const refs = checks.map(c => ({ index:c.index, eventKey:`hustle-sponsored-review:${reviewId}:${c.index}`,
      recordHash:hash(c.record), baselineHash:c.baselineHash, existingProspectId:c.p.id }));
    const manifest = { reviewId, batchHash:actor.batchHash, stagedAt:now.getTime(), initialSendWindow:batch.initialSendWindow,
      executionEnvelope, campaignBaselineHash:hash(campaignBinding(state.campaign)), policyHash:HUSTLE_SPONSORED_POLICY_HASH,
      refs, blocked:[], eligibleCount:5, researchStockCount:5, noSends:true, recoveryVersion:recoveryPins.version };
    const reviewHash = hash(manifest), stageKey = `hustle-sponsored-before-claim-stage:${recoveryPins.version}:${actor.batchHash}`;
    for (const c of checks) await eventWrite(tx, refs[c.index]!.eventKey, HUSTLE_SPONSORED_EVENT_TYPES.record, actor,
      {reviewId,index:c.index,record:c.record,recordHash:hash(c.record),researchHash:researchHash(c.record),baselineHash:c.baselineHash,
        policyHash:HUSTLE_SPONSORED_POLICY_HASH,headers:HUSTLE_SPONSORED_HEADERS,fromDisplay:HUSTLE_SPONSORED_FROM_DISPLAY},c.p.id);
    await eventWrite(tx, stageKey, HUSTLE_SPONSORED_EVENT_TYPES.manifest, actor, manifest);
    const approvals = [];
    const uidValidity = inboxIdentity(state.campaign,state.events,now)!;
    for (const c of checks) {
      const messages = c.record.messages.map((m: Row) => ({...m,messageId:recoveryPins.messageIds[c.index * 3 + m.sequenceStep]}));
      const payload = {reviewId,reviewHash,campaignId:1,prospectId:c.p.id,approvedAt:now.getTime(),expiresAt:now.getTime()+HUSTLE_SPONSORED_MAX_AGE_MS,
        sourceVersion:HUSTLE_SPONSORED_SOURCE_VERSION,sourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,policyHash:HUSTLE_SPONSORED_POLICY_HASH,
        researchHash:researchHash(c.record),prospectBindingHash:hash(prospectBinding(c.p)),campaignBindingHash:hash(campaignBinding(state.campaign)),
        priorBaselineHash:c.baselineHash,initialSendWindow:batch.initialSendWindow,executionEnvelope,record:c.record,messages,uidValidity,
        headers:HUSTLE_SPONSORED_HEADERS,fromDisplay:HUSTLE_SPONSORED_FROM_DISPLAY,noSends:true,noAutomaticRetry:true,
        consolidatedFooterHomepageAndPolicyApproved:true,recoveryOriginalReviewId:recoveryPins.reviewId};
      await eventWrite(tx,`hustle-sponsored-authorization:${reviewId}:${c.p.id}`,HUSTLE_SPONSORED_EVENT_TYPES.approval,actor,payload,c.p.id);
      approvals.push({prospectId:c.p.id,messageIds:messages.map((m: Row) =>m.messageId)});
    }
    await eventWrite(tx,'hustle-sponsored-policy:'+reviewId,HUSTLE_SPONSORED_EVENT_TYPES.policy,actor,
      {reviewId,reviewHash,policy:HUSTLE_SPONSORED_POLICY,policyHash:HUSTLE_SPONSORED_POLICY_HASH,campaignBindingHash:hash(campaignBinding(state.campaign)),approvedAt:now.getTime(),prospectiveOnly:true,noSends:true});
    const receipt = {reviewId,reviewHash,approvedAt:now.getTime(),approvals,noSends:true,noActivation:true};
    await eventWrite(tx,'hustle-sponsored-approved:'+reviewId,HUSTLE_SPONSORED_EVENT_TYPES.receipt,actor,receipt);
    const consent = {...old.consent,reviewId,reviewHash};
    const task = {...old,actor,registeredAt:now.getTime(),serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,
      moduleSourceHash:(release.sourceHashes as Record<string,string>)['server/hustleTaskFirstBatch.ts'],consent};
    await tx.insert(hustleEvents).values({campaignId:1,eventKey:recoveryPins.authorityKey,eventType:'hustle_first_batch_renewed_start_authorization',
      detailJson:serialized(signRecoveryTaskEvent({version:actor.approvedBy.renewedStart!.version,authorization:actor.approvedBy.renewedStart,
        registeredAt:now.getTime(),reviewId,reviewHash,serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,initialMessageIds:consent.initialMessageIds,noBackdate:true,noSends:true,noNewTimer:true}))});
    await tx.insert(hustleEvents).values({campaignId:1,eventKey:recoveryPins.taskKey,eventType:'hustle_first_batch_task_manifest',detailJson:serialized(signRecoveryTaskEvent(task))});
    await eventWrite(tx,recoveryPins.auditKey,'hustle_sponsored_before_claim_recovery_authority',actor,
      {version:recoveryPins.version,oldReviewId:recoveryPins.reviewId,oldReviewHash:recoveryPins.reviewHash,
        oldSourceHash:recoveryPins.sourceHash,oldSourceMapHash:recoveryPins.sourceMapHash,originalFiles:recoveryPins.files,
        historicalEventHashes:HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS,stageKey,taskKey:recoveryPins.taskKey,authorityKey:recoveryPins.authorityKey,
        consent,registeredAt:now.getTime(),zeroEvidence:{complete:true,messages:15,claims:0,attempts:0,receipts:0,uncertain:0,sharedFenceAbsent:true},
        globalChicagoNewDailyCapacity:5,noAutomaticRetry:true,noSends:true,noNewNotification:true});
    if (!readHustleBeforeClaimRecoveryAuthority([...state.events,...await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId,1))]
      .filter((e,index,all)=>all.findIndex(v=>v.eventKey===e.eventKey)===index),now)) throw new Error('Fresh signed recovery pointer failed verification');
    return {...receipt,stage:{reviewId,reviewHash,stagedAt:now.getTime()},registeredAt:now.getTime(),taskKey:recoveryPins.taskKey,
      noAutomaticRetry:true,noNewNotification:true,signedReceipt:sign('hustle_sponsored_operator_approval_receipt',actor,receipt),
      signedStageReceipt:sign('hustle_sponsored_operator_stage_receipt',actor,{reviewId,reviewHash,batchHash:actor.batchHash,
        packetSha256:actor.packetSha256,recordedAt:now.getTime(),noSends:true}), signedTaskManifestReceipt:signRecoveryTaskEvent(task)};
  });
}
/** Last fresh zero-state gate before the EXISTING task executor claims its shared fence.
 * Intent is retained by the recovery CLI before calling this; any failure is not retried. */
export async function assertHustleBeforeClaimRecoveryExecution(grant: unknown, now = new Date()) {
  const actor = verifyHustleManagedOperatorGrant(grant,{serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,requireProductionRelease:true},new Date());
  assertHustleTaskPreparationWindow(actor,now);
  const db = await database();
  return db.transaction(async tx => {
    const state = await readHustleSponsoredKnownState(tx); assertRecoveryZero(state,now);
    const authority = readHustleBeforeClaimRecoveryAuthority(state.events,now);
    if (!authority || hash(recoveryActorProvenance(actor)) !== hash(recoveryActorProvenance(authority.actor))) throw new Error('Exact signed current-source recovery authority required');
    for (const id of recoveryPins.prospectIds) {
      const p=state.prospects.find((p: Row) =>p.id===id)!,m=state.messages.find((m: Row) =>m.prospectId===id&&m.sequenceStep===0)!;
      if (!authorizationFromState(state,state.campaign,p,m,now,true)) throw new Error('Fresh current source/reply/stop/exclusions blocked recovery execution');
    }
    return authority.consent as HustleFirstBatchConsent;
  });
}

/** Current-source pointer for exactly the retained one-accepted/four-untouched incident.
 * Readable after Nov19 for ordinary accepted followups; dispatch date is enforced
 * separately. This reader NEVER signs, resets rows, or treats partial result as absent. */
export function readHustlePartialContinuationAuthority(events:Row[],now=new Date()):Row|null {
  try {
    if(events.some(e=>e.eventKey?.startsWith(finalPins.key)))return readHustleFinalOriginalAuthority(events,now);
    const p=continuationPins;
    if(events.length>MAX_SNAPSHOT_ROWS||!Number.isFinite(now.getTime()))return null;
    const rows=events.filter(e=>e.eventKey===p.key);
    if(rows.length!==1)return null;
    const signed=verify(rows[0],'hustle_sponsored_partial_continuation_authority');
    if(!signed||!isHustleManagedOperatorActor(signed.actor))return null;
    const a=signed.payload,old=assertPartialHistoricalEvents(events);
    if(a.version!==p.version||a.oldReviewId!==p.reviewId||a.oldReviewHash!==p.reviewHash||a.oldSourceHash!==p.sourceHash||
      a.oldSourceMapHash!==p.sourceMapHash||a.noAutomaticRetry!==true||a.noSends!==true||!Number.isSafeInteger(a.registeredAt)||a.registeredAt>now.getTime()||
      !signed.actor.approvedBy.renewedStart||hash(recoveryActorProvenance(old.actor))!==hash(recoveryActorProvenance(signed.actor))||
      hash(a.consent.prospectIds)!==hash(recoveryPins.prospectIds)||hash(a.consent.initialMessageIds)!==hash([90001,90004,90007,90010,90013])||
      hash(a.remaining)!==hash(p.remaining)||a.accepted?.length!==1||a.accepted[0].messageId!==90001||
      a.consent.notBefore!==old.consent.notBefore||a.consent.expiresAt!==old.consent.expiresAt)return null;
    const manifest=verify(events.find(e=>e.eventKey===a.stageKey),HUSTLE_SPONSORED_EVENT_TYPES.manifest);
    if(!manifest||!sameActor(manifest.actor,signed.actor)||manifest.payload.continuationVersion!==p.version||
      manifest.payload.reviewId!==a.consent.reviewId||hash(manifest.payload)!==a.consent.reviewHash||manifest.payload.batchHash!==HUSTLE_MANAGED_OPERATOR_PINS.batchHash)return null;
    const permitted=new Set([...Object.keys(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS),...Object.keys(HUSTLE_PARTIAL_HISTORICAL_EVENTS),
      p.key,p.key+':manifest',a.stageKey,...manifest.payload.refs.map((r:Row)=>r.eventKey),
      'hustle-sponsored-policy:'+a.consent.reviewId,'hustle-sponsored-approved:'+a.consent.reviewId,
      ...recoveryPins.prospectIds.map(id=>`hustle-sponsored-authorization:${a.consent.reviewId}:${id}`),
      ...p.remaining.flatMap(id=>[continuationStepKey(id),continuationStepKey(id)+':result'])]);
    if(events.some(e=>!permitted.has(e.eventKey)&&(e.eventKey?.startsWith('hustle-sponsored-')||e.eventKey?.startsWith('hustle-first-batch-')||
      Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType)||e.eventType?.startsWith('hustle_first_batch_registration_')||e.eventType==='hustle_first_batch_job_binding')))return null;
    return {...a,actor:signed.actor};
  }catch{return null;}
}
export async function reauthorizeHustlePartialContinuation(grant:unknown,input:{packetJson:string;oldSourceMetadata:{sourceHash:string;sourceHashes:Record<string,string>}},now=new Date()) {
  return reauthorizeOriginalContinuation(grant,input,now,false);
}
export async function reauthorizeHustleFinalOriginal(grant:unknown,input:{packetJson:string;oldSourceMetadata:{sourceHash:string;sourceHashes:Record<string,string>}},now=new Date()) {
  return reauthorizeOriginalContinuation(grant,input,now,true);
}
async function reauthorizeOriginalContinuation(grant:unknown,input:{packetJson:string;oldSourceMetadata:{sourceHash:string;sourceHashes:Record<string,string>}},now:Date,finalOriginal:boolean) {
  const p=finalOriginal?finalPins:continuationPins;
  const actor=verifyHustleManagedOperatorGrant(grant,{serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,requireProductionRelease:true},new Date());
  assertHustleTaskPreparationWindow(actor,now);assertContinuationDate(now);
  if(!actor.approvedBy.renewedStart||createHash('sha256').update(input.packetJson,'utf8').digest('hex')!==actor.packetSha256||
    input.oldSourceMetadata.sourceHash!==p.sourceHash||hash(input.oldSourceMetadata.sourceHashes)!==p.sourceMapHash||Object.keys(input.oldSourceMetadata.sourceHashes).length!==(finalOriginal?94:92)||
    ['server/hustlePartialContinuation.ts','scripts/hustle-task-first-batch-continuation.ts'].some(path=>!/^[a-f0-9]{64}$/.test((release.sourceHashes as Record<string,string>)[path]||'')))throw new Error('Exact fixed historical source evidence and complete current published source required');
  const batch=sponsoredReviewBatchSchema.parse(JSON.parse(input.packetJson));
  if(hash(batch)!==actor.batchHash||batch.records.length!==5||hash(batch.records.map((r,i)=>r.existingProspectId??recoveryPins.prospectIds[i]))!==hash(recoveryPins.prospectIds))throw new Error('Unchanged original packet and actual signed allocation required');
  const db=await database();
  return db.transaction(async tx=>{
    const state=await readHustleSponsoredKnownState(tx),old=finalOriginal?assertFinalOriginalHistoricalEvents(state.events):assertPartialHistoricalEvents(state.events);
    if(state.events.some((e:Row)=>e.eventKey?.startsWith(p.key)))throw new Error('Continuation already committed; no preparation retry');
    if(hash(recoveryActorProvenance(old.actor))!==hash(recoveryActorProvenance(actor)))throw new Error('Same original3/renewal2 direct provenance required');
    const permitted=new Set([...Object.keys(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS),...Object.keys(HUSTLE_PARTIAL_HISTORICAL_EVENTS),...(finalOriginal?Object.keys(HUSTLE_FINAL_HISTORICAL_EVENTS):[])]);
    if(state.events.some((e:Row)=>!permitted.has(e.eventKey)&&(e.eventKey?.startsWith('hustle-sponsored-')||e.eventKey?.startsWith('hustle-first-batch-')||Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType))))throw new Error('Competing first-batch authority held');
    if(finalOriginal&&state.events.some((e:Row)=>e.prospectId===240003&&!permitted.has(e.eventKey)&&!['research_import','research_verified','research_review'].includes(e.eventType)))throw new Error('Unknown final-original claim/provider/contact history held');
    const accepted=finalOriginal?old.accepted:[initialReceipt(state.messages.find((m:Row)=>m.id===90001)!)];
    assertContinuationRows(state,accepted,p.remaining,now);
    const c=state.campaign,uidValidity=inboxIdentity(c,state.events,now);
    if(c.status!=='active'||c.schedulerTaskUid!==old.consent.canonicalSchedulerTaskUid||!uidValidity||!localTransportConfigured()||state.episodes.filter((e:Row)=>e.seasonYear===2027&&e.sponsorProspectId!==null).length>=12)throw new Error('Current inbox/campaign/config/episode health required');
    const reviewId=randomBytes(24).toString('hex');
    // A new review envelope, not a new batch. All raw packet records and IDs stay unchanged.
    const previous=batch.records.map((record,index)=>{
      const prospectId=recoveryPins.prospectIds[index];
      const envelope=JSON.parse(state.events.find((e:Row)=>e.eventKey===`hustle-sponsored-authorization:${p.reviewId}:${prospectId}`)!.detailJson);
      const a=envelope.payload,prospect=state.prospects.find((v:Row)=>v.id===prospectId)!;
      if(hash(a.record)!==hash(record)||a.reviewHash!==p.reviewHash||a.expiresAt<=now.getTime()||sponsoredRecordBlockers(record,now).length||
        a.prospectBindingHash!==hash(prospectBinding(prospect))||a.campaignBindingHash!==hash(campaignBinding(c))||hash(a.uidValidity)!==hash(uidValidity)||
        hash(a.messages.map((m:Row)=>m.messageId))!==hash(recoveryPins.messageIds.slice(index*3,index*3+3))||
        a.messages.some((exact:Row)=>{const row=state.messages.find((m:Row)=>m.id===exact.messageId);const {messageId:_,...body}=exact;return !row||row.subject!==exact.subject||row.textBody!==exact.textBody||hash(body)!==hash(record.messages[exact.sequenceStep as 0|1|2]);}))throw new Error('Historical content/source/consent expiry binding changed');
      const aliases=sponsoredIdentityAliases(record);
      if(state.suppressions.some((s:Row)=>String(s.email).toLowerCase()===record.email)||state.prospects.some((v:Row)=>v.id!==prospectId&&conflict(aliases,rowAliases(v))))throw new Error('Current suppression or duplicate identity');
      for(const source of state.sources)for(const row of source.rows){
        if(source.category==='core_relationship'&&['identified','researching'].includes(row.stage)&&!row.lastContact&&!row.nextFollowup&&!row.notes)continue;
        if(source.category==='application_owner'&&row.openId!==ENV.ownerOpenId)continue;
        if(conflict(aliases,rowAliases(row)))throw new Error('Current cross-campaign exclusion');
      }
      return {a,prospectId,record,index};
    });
    const refs=previous.map(({record,index,prospectId})=>({index,eventKey:`hustle-sponsored-review:${reviewId}:${index}`,recordHash:hash(record),existingProspectId:prospectId,baselineHash:hash({prospectId,originalReviewId:p.reviewId})}));
    const oldManifest=JSON.parse(state.events.find((e:Row)=>finalOriginal?e.eventKey===continuationPins.key+':stage':e.eventKey?.startsWith('hustle-sponsored-before-claim-stage:'))!.detailJson).payload;
    const manifest={...oldManifest,reviewId,stagedAt:now.getTime(),refs,continuationVersion:continuationPins.version,...(finalOriginal?{finalOriginalVersion:p.version}:{}),recoveryVersion:undefined};
    delete manifest.recoveryVersion;
    const reviewHash=hash(manifest),stageKey=p.key+':stage';
    for(const r of previous)await eventWrite(tx,refs[r.index]!.eventKey,HUSTLE_SPONSORED_EVENT_TYPES.record,actor,{reviewId,index:r.index,record:r.record,recordHash:hash(r.record),researchHash:researchHash(r.record),baselineHash:refs[r.index]!.baselineHash,policyHash:HUSTLE_SPONSORED_POLICY_HASH,headers:HUSTLE_SPONSORED_HEADERS,fromDisplay:HUSTLE_SPONSORED_FROM_DISPLAY},r.prospectId);
    await eventWrite(tx,stageKey,HUSTLE_SPONSORED_EVENT_TYPES.manifest,actor,manifest);
    for(const r of previous)await eventWrite(tx,`hustle-sponsored-authorization:${reviewId}:${r.prospectId}`,HUSTLE_SPONSORED_EVENT_TYPES.approval,actor,
      {...r.a,reviewId,reviewHash,sourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,continuationVersion:continuationPins.version,...(finalOriginal?{finalOriginalVersion:p.version}:{})},r.prospectId);
    const oldPolicy=JSON.parse(state.events.find((e:Row)=>e.eventKey==='hustle-sponsored-policy:'+p.reviewId)!.detailJson).payload;
    await eventWrite(tx,'hustle-sponsored-policy:'+reviewId,HUSTLE_SPONSORED_EVENT_TYPES.policy,actor,{...oldPolicy,reviewId,reviewHash});
    const receipt={reviewId,reviewHash,approvedAt:now.getTime(),approvals:previous.map(r=>({prospectId:r.prospectId,messageIds:r.a.messages.map((m:Row)=>m.messageId)})),noSends:true,noActivation:true};
    await eventWrite(tx,'hustle-sponsored-approved:'+reviewId,HUSTLE_SPONSORED_EVENT_TYPES.receipt,actor,receipt);
    const consent={...old.consent,reviewId,reviewHash};
    const {accepted:_accepted,...task}=old;
    await appendContinuationTaskEvent(tx,p.key+':manifest','hustle_first_batch_task_manifest',{...task,actor,registeredAt:now.getTime(),serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,moduleSourceHash:(release.sourceHashes as Record<string,string>)['server/hustleTaskFirstBatch.ts'],consent});
    await eventWrite(tx,p.key,'hustle_sponsored_partial_continuation_authority',actor,{version:p.version,oldReviewId:p.reviewId,oldReviewHash:p.reviewHash,oldSourceHash:p.sourceHash,oldSourceMapHash:p.sourceMapHash,registeredAt:now.getTime(),stageKey,consent,accepted,remaining:p.remaining,noAutomaticRetry:true,noSends:true,noNewTimer:true,noNewNotification:true});
    return {...receipt,remaining:p.remaining,accepted:accepted.length,noAutomaticRetry:true,noSends:true,noNewNotification:true};
  });
}

/** Fixed append-only bridge. Historical HMACs are evidence, never current execution authority. */
export function readHustleFinalOriginalAuthority(events:Row[],now=new Date()):Row|null {
  try {
    const p=finalPins,rows=events.filter(e=>e.eventKey===p.key);
    if(events.length>MAX_SNAPSHOT_ROWS||rows.length!==1||!Number.isFinite(now.getTime()))return null;
    const signed=verify(rows[0],'hustle_sponsored_partial_continuation_authority',events,now);
    if(!signed||!isHustleManagedOperatorActor(signed.actor))return null;
    const a=signed.payload,old=assertFinalOriginalHistoricalEvents(events);
    if(a.version!==p.version||a.oldReviewId!==p.reviewId||a.oldReviewHash!==p.reviewHash||a.oldSourceHash!==p.sourceHash||a.oldSourceMapHash!==p.sourceMapHash||a.noAutomaticRetry!==true||a.noSends!==true||a.noNewTimer!==true||!Number.isSafeInteger(a.registeredAt)||a.registeredAt>now.getTime()||!signed.actor.approvedBy.renewedStart||hash(recoveryActorProvenance(old.actor))!==hash(recoveryActorProvenance(signed.actor))||hash(a.accepted)!==hash(old.accepted)||hash(a.remaining)!==hash([90013])||hash(a.consent.prospectIds)!==hash(recoveryPins.prospectIds)||hash(a.consent.initialMessageIds)!==hash([90001,90004,90007,90010,90013])||a.consent.notBefore!==old.consent.notBefore||a.consent.expiresAt!==old.consent.expiresAt)return null;
    const manifest=verify(events.find(e=>e.eventKey===a.stageKey),HUSTLE_SPONSORED_EVENT_TYPES.manifest,events,now);
    if(!manifest||!sameActor(manifest.actor,signed.actor)||manifest.payload.continuationVersion!==continuationPins.version||manifest.payload.finalOriginalVersion!==p.version||manifest.payload.reviewId!==a.consent.reviewId||hash(manifest.payload)!==a.consent.reviewHash||manifest.payload.batchHash!==HUSTLE_MANAGED_OPERATOR_PINS.batchHash)return null;
    const taskEvent=events.find(e=>e.eventKey===p.key+':manifest');
    const task=continuationTaskPayload(taskEvent,p.key+':manifest','hustle_first_batch_task_manifest');
    if((task.serverSourceHash!==HUSTLE_SPONSORED_SERVER_SOURCE_HASH&&!hustleSourceTransitionAllowsEvent(transition(events,now),taskEvent,task.serverSourceHash))||task.moduleSourceHash!==(release.sourceHashes as Record<string,string>)['server/hustleTaskFirstBatch.ts']||task.registeredAt!==a.registeredAt||hash(task.consent)!==hash(a.consent)||!sameActor(task.actor,signed.actor))return null;
    const permitted=new Set([...Object.keys(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS),...Object.keys(HUSTLE_PARTIAL_HISTORICAL_EVENTS),...Object.keys(HUSTLE_FINAL_HISTORICAL_EVENTS),p.key,p.key+':manifest',p.key+':intent',p.key+':result',a.stageKey,...manifest.payload.refs.map((r:Row)=>r.eventKey),'hustle-sponsored-policy:'+a.consent.reviewId,'hustle-sponsored-approved:'+a.consent.reviewId,...recoveryPins.prospectIds.map(id=>`hustle-sponsored-authorization:${a.consent.reviewId}:${id}`)]);
    if(events.some(e=>!permitted.has(e.eventKey)&&(e.eventKey?.startsWith('hustle-sponsored-')||e.eventKey?.startsWith('hustle-first-batch-')||Object.values(HUSTLE_SPONSORED_EVENT_TYPES).includes(e.eventType)||e.eventType?.startsWith('hustle_first_batch_registration_')||e.eventType==='hustle_first_batch_job_binding')))return null;
    return {...a,actor:signed.actor};
  }catch{return null;}
}
