/** Server-private CLI trust boundary. Never import this issuer into a router.
 * The parent CLI must obtain and inspect live direct records from list_task_messages,
 * and independently fetch the published version endpoint before attesting release proof.
 * This module does not query tasks, register timers, use providers, or impersonate a user.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ENV } from './_core/env';
import release from '../shared/outreachRepairRelease.json';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import { sponsoredCanonicalJson } from '../shared/hustleSponsoredReview';
import { hustleLateStartAuthorizationSchema, HUSTLE_LATE_START_PINS,
  hustleTaskRegistrationWasAuthorized, hustleLateStartAuthorizationFingerprint,
  hustleRenewedStartAuthorizationSchema, assertHustleRenewedStartActor, hustleTaskWindow } from './hustleLateStartAuthorization';

export const HUSTLE_MANAGED_OPERATOR_PINS = Object.freeze({
  executionTaskId: 'c56yJvFkzrx3K3dvrdOjiK',
  projectId: 'W4ntUZHSievw5UuCde7zzr',
  originatingTaskId: 'wYxXaeCb15BTQVjEmz9GMN',
  packetSha256: '26c16286d74ff6797d51739d5a552ba42b3b48e4505594f88b4719f1263bf458',
  batchHash: 'efdfd8935ea5dd904b01e74b7cbd5846afbdd7e44bc732a9390e0b828034b29b',
  originalProposalSha256: '6fe68a191456d1b514ff89fffd290f8d1f02d1e74488fff739374c948fe8652d',
  approvedByUserId: '310519663569963942',
  consentMessageId: 'NfnyLIiCOzU4u8CwKtm4gB', consentTimestampMs: 1794949504283,
  registrationMessageId: 'd2zXMLEWtmcLt3FVieGuX5', registrationTimestampMs: 1794951766417,
  operatorMessageId: 'cLmWMmtEQPdjZ1wAXzkLHb', operatorTimestampMs: 1794972544023,
});
const pins = HUSTLE_MANAGED_OPERATOR_PINS;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().safe().positive();
const reference = (messageId: string, timestampMs: number) => z.object({
  taskId: z.literal(pins.originatingTaskId), messageId: z.literal(messageId),
  timestampMs: z.literal(timestampMs), userId: z.literal(pins.approvedByUserId),
  role: z.literal('user'), contentSha256: sha256,
}).strict();
const approvedBySchema = z.object({
  userId: z.literal(pins.approvedByUserId),
  verificationSource: z.literal('manus-tasks.list_task_messages'),
  verifiedAt: time, taskApiResponseSha256: sha256,
  consent: reference(pins.consentMessageId, pins.consentTimestampMs),
  registration: reference(pins.registrationMessageId, pins.registrationTimestampMs),
  operator: reference(pins.operatorMessageId, pins.operatorTimestampMs),
  lateStart: hustleLateStartAuthorizationSchema.optional(),
  renewedStart: hustleRenewedStartAuthorizationSchema.optional(),
}).strict();
const actorSchema = z.object({
  kind: z.literal('managed_task_operator'), executionTaskId: z.literal(pins.executionTaskId),
  projectId: z.literal(pins.projectId), appId: z.string().min(1),
  originatingTaskId: z.literal(pins.originatingTaskId), grantId: z.string().regex(/^[a-f0-9]{48}$/),
  packetSha256: z.literal(pins.packetSha256), batchHash: z.literal(pins.batchHash),
  originalProposalSha256: z.literal(pins.originalProposalSha256), approvedBy: approvedBySchema,
  scopes: z.tuple([z.literal('stage_exact_batch'), z.literal('approve_exact_batch')]),
}).strict();
export type HustleManagedOperatorActor = z.infer<typeof actorSchema>;
const releaseProofSchema = z.object({
  verificationSource: z.literal('parent-cli-live-production-version'),
  url: z.literal('https://jeristotleproductions.com/api/trpc/outreachRepairs.version'),
  httpStatus: z.literal(200), production: z.literal(true),
  releaseId: z.string().min(1).max(200), sourceHashes: z.record(z.string(), sha256),
  serverSourceHash: sha256, verifiedAt: time,
}).strict();
export type HustleManagedOperatorProductionRelease = z.infer<typeof releaseProofSchema>;
const unsignedGrantSchema = z.object({
  version: z.literal(1), purpose: z.literal('hustle-nov18-exact-review-operator'),
  actor: actorSchema, issuedAt: time, expiresAt: time, serverSourceHash: sha256,
  productionRelease: releaseProofSchema.nullable(),
}).strict();
const grantSchema = unsignedGrantSchema.extend({ seal: sha256 }).strict();
export type HustleManagedOperatorGrant = z.infer<typeof grantSchema>;
const digest = (value: unknown) => createHash('sha256').update(sponsoredCanonicalJson(value)).digest('hex');
function seal(unsigned: z.infer<typeof unsignedGrantSchema>): string {
  const secret = hustleExistingSigningAuthority(ENV.cookieSecret);
  return createHmac('sha256', secret).update('jeristotle/hustle-managed-operator/grant/v1\n')
    .update(sponsoredCanonicalJson(unsigned)).digest('hex');
}
function managedEnvironment(actor: HustleManagedOperatorActor) {
  if (!ENV.appId || ENV.appId !== pins.projectId || actor.appId !== ENV.appId ||
    process.env.MANUS_WEBDEV_PROJECT_ID !== pins.projectId)
    throw new Error('Exact managed project/application binding required');
}
/** Durable actor validation deliberately does not expire consent when a CLI grant expires.
 * Envelope HMAC/source verification remains mandatory in the review adapter. */
export function isHustleManagedOperatorActor(value: unknown): value is HustleManagedOperatorActor {
  const parsed = actorSchema.safeParse(value);
  if (parsed.success && parsed.data.approvedBy.renewedStart) {
    try { assertHustleRenewedStartActor(parsed.data); } catch { return false; }
  }
  return parsed.success && ENV.appId === pins.projectId && parsed.data.appId === ENV.appId &&
    parsed.data.approvedBy.verifiedAt >= pins.operatorTimestampMs &&
    (!parsed.data.approvedBy.lateStart || parsed.data.approvedBy.verifiedAt >= HUSTLE_LATE_START_PINS.authorizedTimestampMs);
}
function validateRelease(proof: HustleManagedOperatorProductionRelease, sourceHash: string, now: number) {
  const required = ['server/hustleSponsoredReviewDb.ts', 'server/hustleManagedOperatorGrant.ts'];
  if (proof.releaseId !== release.releaseId || !release.production || proof.serverSourceHash !== sourceHash ||
    digest(proof.sourceHashes) !== digest(release.sourceHashes) ||
    required.some(path => !/^[a-f0-9]{64}$/.test((release.sourceHashes as Record<string, string>)[path] || '')) ||
    proof.verifiedAt > now || now - proof.verifiedAt >= 10 * 60_000)
    throw new Error('Fresh independently attested matching production source release required');
}
/** CLI-only issuer. Its input is an attestation by the trusted parent, NOT raw RPC JSON.
 * Only fixed direct-user references are accepted. No arbitrary task/project/hash scopes. */
export function issueHustleManagedOperatorGrantForVerifiedTask(input: {
  approvedBy: HustleManagedOperatorActor['approvedBy'];
  serverSourceHash: string;
  productionRelease: HustleManagedOperatorProductionRelease | null;
  expiresAt: number;
}, now = new Date()): HustleManagedOperatorGrant {
  const issuedAt = now.getTime();
  const actor = actorSchema.parse({ kind: 'managed_task_operator', executionTaskId: pins.executionTaskId,
    projectId: pins.projectId, appId: ENV.appId, originatingTaskId: pins.originatingTaskId,
    grantId: randomBytes(24).toString('hex'), packetSha256: pins.packetSha256, batchHash: pins.batchHash,
    originalProposalSha256: pins.originalProposalSha256, approvedBy: input.approvedBy,
    scopes: ['stage_exact_batch', 'approve_exact_batch'] });
  const unsigned = unsignedGrantSchema.parse({ version: 1, purpose: 'hustle-nov18-exact-review-operator',
    actor, issuedAt, expiresAt: input.expiresAt, serverSourceHash: input.serverSourceHash,
    productionRelease: input.productionRelease });
  managedEnvironment(actor);
  validateTimes(unsigned, issuedAt);
  if (unsigned.productionRelease) validateRelease(unsigned.productionRelease, unsigned.serverSourceHash, issuedAt);
  return { ...unsigned, seal: seal(unsigned) };
}
function validateTimes(grant: z.infer<typeof unsignedGrantSchema>, now: number) {
  if (!Number.isFinite(now) || grant.issuedAt > now || grant.expiresAt <= now ||
    grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > 60 * 60_000 ||
    grant.expiresAt > Date.parse(hustleTaskWindow(grant.actor).expiresAt) ||
    grant.actor.approvedBy.verifiedAt < pins.operatorTimestampMs ||
    grant.actor.approvedBy.verifiedAt > grant.issuedAt ||
    grant.issuedAt - grant.actor.approvedBy.verifiedAt >= 10 * 60_000)
    throw new Error('Fresh direct provenance and bounded unexpired operator grant required');
  if (grant.actor.approvedBy.renewedStart) {
    const actual = Date.now();
    if (!hustleTaskRegistrationWasAuthorized(grant.actor, grant.issuedAt) ||
      !hustleTaskRegistrationWasAuthorized(grant.actor, now) ||
      !hustleTaskRegistrationWasAuthorized(grant.actor, actual) || grant.expiresAt <= actual ||
      grant.issuedAt > actual || Math.abs(actual - now) > 5_000)
      throw new Error('Renewed grant requires actual current November19 clock and bounded lifetime');
  }
  if (grant.actor.approvedBy.lateStart &&
    (!hustleTaskRegistrationWasAuthorized(grant.actor, grant.issuedAt) ||
     !hustleTaskRegistrationWasAuthorized(grant.actor, now)))
    throw new Error('Late-start grant is fixed to the actual authorized November18 window');
}
/** Admission before any database access. This is not a sender/scheduler execution permit. */
export function verifyHustleManagedOperatorGrant(value: unknown, options: {
  serverSourceHash: string; requireProductionRelease?: boolean;
}, now = new Date()): HustleManagedOperatorActor {
  const grant = grantSchema.parse(value), { seal: supplied, ...unsigned } = grant;
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(seal(unsigned), 'hex')))
    throw new Error('Invalid managed operator grant seal');
  managedEnvironment(grant.actor);
  validateTimes(grant, now.getTime());
  if (grant.serverSourceHash !== options.serverSourceHash) throw new Error('Operator source changed; fresh grant required');
  if (options.requireProductionRelease) {
    if (!grant.productionRelease) throw new Error('Attested production release required for operator approval');
    validateRelease(grant.productionRelease, options.serverSourceHash, now.getTime());
  }
  return grant.actor;
}
/** Code fingerprint included in the independently derived sponsored source identity. */
export function hustleManagedOperatorValidationFingerprint(): string {
  return sponsoredCanonicalJson(pins) + hustleLateStartAuthorizationFingerprint() + sponsoredCanonicalJson({
    actor: z.toJSONSchema(actorSchema), grant: z.toJSONSchema(grantSchema),
  }) + [seal, managedEnvironment, isHustleManagedOperatorActor, validateRelease,
    issueHustleManagedOperatorGrantForVerifiedTask, validateTimes, verifyHustleManagedOperatorGrant].map(f => f.toString()).join('\n');
}
