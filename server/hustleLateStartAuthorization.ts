/** Pure fixed-batch timing extensions. No issuer, DB, provider, router or schedule.
 * Direct immutable instructions, never an editable cutoff or caller-selected date.
 */
import { z } from 'zod';
import { sponsoredCanonicalJson } from '../shared/hustleSponsoredReview';
import { getOutreachLocalMoment } from '../shared/outreachSchedule';
export const HUSTLE_LATE_START_PINS = Object.freeze({
  version: 'hustle-nov18-late-start-v1', campaignId: 1,
  packetSha256: '26c16286d74ff6797d51739d5a552ba42b3b48e4505594f88b4719f1263bf458',
  originatingTaskId: 'wYxXaeCb15BTQVjEmz9GMN', userId: '310519663569963942',
  authorizedMessageId: 'eLa85yq1jhVRPpS2vH4i77', authorizedTimestampMs: 1795021585046,
  contentSha256: '09eb5dbb4947289532ecb3c9986f47e99a430a67ea1185a3bd279abeb6114540',
  notBefore: '2026-11-18T15:00:00Z', expiresAt: '2026-11-19T00:00:00Z',
});
const pins = HUSTLE_LATE_START_PINS;
export const hustleLateStartAuthorizationSchema = z.object({
  version: z.literal(pins.version), campaignId: z.literal(1), packetSha256: z.literal(pins.packetSha256),
  notBefore: z.literal(pins.notBefore), expiresAt: z.literal(pins.expiresAt),
  authorizedBy: z.object({ taskId: z.literal(pins.originatingTaskId), messageId: z.literal(pins.authorizedMessageId),
    timestampMs: z.literal(pins.authorizedTimestampMs), userId: z.literal(pins.userId),
    role: z.literal('user'), contentSha256: z.literal(pins.contentSha256) }).strict(),
}).strict();
export type HustleLateStartAuthorization = z.infer<typeof hustleLateStartAuthorizationSchema>;
/** A distinct one-day renewal, not an extension of the old grant/window. Both exact
 * direct messages are mandatory, with no forwarded/source-task fields permitted. */
export const HUSTLE_RENEWED_START_PINS = Object.freeze({
  version: 'hustle-nov19-renewed-start-v1', campaignId: 1,
  packetSha256: pins.packetSha256,
  originalBatchHash: 'efdfd8935ea5dd904b01e74b7cbd5846afbdd7e44bc732a9390e0b828034b29b',
  originalProposalSha256: '6fe68a191456d1b514ff89fffd290f8d1f02d1e74488fff739374c948fe8652d',
  originatingTaskId: pins.originatingTaskId, userId: pins.userId,
  unblockMessageId: 'pitJXGgaMeHloZw9AZ4OoI', unblockTimestampMs: 1795107833331,
  unblockContentSha256: '14ccbea9a52686a5b11261f4dc8d226eb42a662dceb8ba70a18606573c11fbe5',
  sendMessageId: 'FmAQXCVJyAq6XYSmQoDd6D', sendTimestampMs: 1795107839247,
  sendContentSha256: 'a7b61dee61653e6cd63e463f1095cdd69324f64eeb03db96518a86e072034a8f',
  dateKey: '2026-11-19', notBefore: '2026-11-19T15:00:00Z', expiresAt: '2026-11-20T00:00:00Z',
});
const renewal = HUSTLE_RENEWED_START_PINS;
const renewedReference = (id: string, at: number, sha: string) => z.object({
  taskId: z.literal(renewal.originatingTaskId), messageId: z.literal(id), timestampMs: z.literal(at),
  userId: z.literal(renewal.userId), role: z.literal('user'), contentSha256: z.literal(sha),
}).strict();
export const hustleRenewedStartAuthorizationSchema = z.object({
  version: z.literal(renewal.version), campaignId: z.literal(1), packetSha256: z.literal(renewal.packetSha256),
  originalBatchHash: z.literal(renewal.originalBatchHash), originalProposalSha256: z.literal(renewal.originalProposalSha256),
  notBefore: z.literal(renewal.notBefore), expiresAt: z.literal(renewal.expiresAt),
  unblock: renewedReference(renewal.unblockMessageId, renewal.unblockTimestampMs, renewal.unblockContentSha256),
  sendNow: renewedReference(renewal.sendMessageId, renewal.sendTimestampMs, renewal.sendContentSha256),
}).strict();
export type HustleRenewedStartAuthorization = z.infer<typeof hustleRenewedStartAuthorizationSchema>;
type TimingActor = { packetSha256: string; originatingTaskId: string; batchHash?: string; originalProposalSha256?: string;
  approvedBy: { userId: string; verifiedAt: number; lateStart?: HustleLateStartAuthorization; renewedStart?: HustleRenewedStartAuthorization } };
function lateProof(actor: TimingActor): HustleLateStartAuthorization {
  const proof = hustleLateStartAuthorizationSchema.parse(actor.approvedBy.lateStart);
  if (actor.packetSha256 !== pins.packetSha256 || actor.originatingTaskId !== pins.originatingTaskId ||
    actor.approvedBy.userId !== pins.userId || !Number.isFinite(actor.approvedBy.verifiedAt) ||
    actor.approvedBy.verifiedAt < pins.authorizedTimestampMs) throw new Error('Fixed direct late-start authority required');
  return proof;
}
export function assertHustleRenewedStartActor(actor: TimingActor): HustleRenewedStartAuthorization {
  const proof = hustleRenewedStartAuthorizationSchema.parse(actor.approvedBy.renewedStart);
  if (actor.approvedBy.lateStart || actor.packetSha256 !== renewal.packetSha256 ||
    actor.batchHash !== renewal.originalBatchHash || actor.originalProposalSha256 !== renewal.originalProposalSha256 ||
    actor.originatingTaskId !== renewal.originatingTaskId || actor.approvedBy.userId !== renewal.userId ||
    !Number.isSafeInteger(actor.approvedBy.verifiedAt) || actor.approvedBy.verifiedAt < renewal.sendTimestampMs)
    throw new Error('Fixed two-direct-record renewal authority required');
  return proof;
}
/** Dates come only from the parsed fixed proof. No caller-selected window. */
export function hustleTaskWindow(actor: TimingActor) {
  const proof = actor.approvedBy.renewedStart ? assertHustleRenewedStartActor(actor) : pins;
  return { notBefore: proof.notBefore, expiresAt: proof.expiresAt };
}
/** Durable provenance remains valid for followups, but new grants/setup are NOW only. */
export function hustleTaskRegistrationWasAuthorized(actor: TimingActor, registeredAt: number): boolean {
  if (!Number.isSafeInteger(registeredAt) || registeredAt <= 0) return false;
  if (actor.approvedBy.renewedStart) {
    try {
      const proof = assertHustleRenewedStartActor(actor);
      return registeredAt >= renewal.sendTimestampMs && registeredAt >= Date.parse(proof.notBefore) &&
        registeredAt < Date.parse(proof.expiresAt) && getOutreachLocalMoment(new Date(registeredAt)).dateKey === renewal.dateKey;
    } catch { return false; }
  }
  if (registeredAt < Date.parse(pins.notBefore)) return !actor.approvedBy.lateStart;
  try {
    lateProof(actor);
    return registeredAt >= pins.authorizedTimestampMs && registeredAt < Date.parse(pins.expiresAt) &&
      getOutreachLocalMoment(new Date(registeredAt)).dateKey === '2026-11-18';
  } catch { return false; }
}
/** Actual clock checked separately from supplied clock; no backdated grant/setup. */
export function assertHustleTaskPreparationWindow(actor: TimingActor, now: Date, actual = new Date()): void {
  const supplied = now.getTime(), real = actual.getTime();
  if (!Number.isFinite(supplied) || !Number.isFinite(real)) throw new Error('Trusted server clock required');
  const opening = Date.parse(pins.notBefore);
  if (supplied < opening && real < opening && !actor.approvedBy.lateStart && !actor.approvedBy.renewedStart) return;
  const authorizedAt = actor.approvedBy.renewedStart ? renewal.sendTimestampMs : pins.authorizedTimestampMs;
  if (!hustleTaskRegistrationWasAuthorized(actor, supplied) || !hustleTaskRegistrationWasAuthorized(actor, real) ||
    supplied < authorizedAt || real < authorizedAt || Math.abs(real - supplied) > 5_000)
    throw new Error('No missed/late task setup without current fixed direct authorization');
}
export function hustleLateStartAuthorizationFingerprint(): string {
  return sponsoredCanonicalJson(pins) + sponsoredCanonicalJson(renewal) +
    sponsoredCanonicalJson(z.toJSONSchema(hustleLateStartAuthorizationSchema)) +
    sponsoredCanonicalJson(z.toJSONSchema(hustleRenewedStartAuthorizationSchema)) +
    [lateProof, assertHustleRenewedStartActor, hustleTaskWindow, hustleTaskRegistrationWasAuthorized,
      assertHustleTaskPreparationWindow].map(f => f.toString()).join('\n');
}
