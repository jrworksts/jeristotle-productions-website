/** Server-private, fixed November19 BEFORE-CLAIM recovery v1. No route, flag, sender,
 * source waiver, timer or automatic retry. Historical signatures are inspected only
 * for this exact immutable incident; they never become current send authorization. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hustleEvents } from '../drizzle/schema';
import { ENV } from './_core/env';
import release from '../shared/outreachRepairRelease.json';
import { sponsoredCanonicalJson } from '../shared/hustleSponsoredReview';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import { isHustleManagedOperatorActor, type HustleManagedOperatorActor } from './hustleManagedOperatorGrant';

export const HUSTLE_BEFORE_CLAIM_RECOVERY = Object.freeze({
  version: 'hustle-nov19-before-claim-recovery-v1',
  reviewId: '0b0fd6bf46dc1221c39a19d64685e2ef47eb556d19c0b9e7',
  reviewHash: '261ed42f5e903f6653b2bf123a3ac8be47750bcbc751971a0bee4c9f65aeaa74',
  sourceHash: 'bbad3becdde8ffdf832abcd8c900bb71f50dac1200a8360c0304c34d13b1e854',
  sourceMapHash: '9cc34a7c051ac18d1ec34a7a7d61e5d2eec4efa82eedc4daef81e0b01b6705fa',
  moduleHash: 'f4c83f00a77ad699195167048d307c3716f13473edfd60d6a546583e002e9ae3',
  auditKey: 'hustle-before-claim-recovery:2026-11-19:v1',
  taskKey: 'hustle-first-batch-task-manifest:2026-11-19:before-claim-recovery-v1',
  authorityKey: 'hustle-first-batch-renewed-start:2026-11-19:before-claim-recovery-v1',
  originalTaskKey: 'hustle-first-batch-task-manifest:2026-11-19',
  fenceKey: 'hustle-first-batch-shared-attempt:2026-11-18',
  prospectIds: [210001, 480001, 210010, 240001, 240003],
  messageIds: Array.from({ length: 15 }, (_, i) => 90001 + i),
  files: {
    'nov19-stage-receipt.json': '0d8404d46451b991493147f3825e267c8280b07f17618e95ce838c9242b978ca',
    'nov19-approval-receipt.json': '71c297bbd650122404f5bdbe4a01cb3d2207d201ce7f432491dc727151f68ad3',
    'nov19-task-registration-receipt.json': 'b30e0220fa53b3c01e9a12df05203ccb2ba306ba0b6b781390791867ad4d52c4',
    'nov19-execution-intent.json': 'ab82c5131f6eb5f14f75814afd46c7f1c11445cbe8445dbcaf84d0d59641cec8',
    'nov19-execution-receipt.json': 'c210b011567f96b3bea6d1e29c06fcd5c37a284944f76470fe7e48f01a22fea6',
  },
});
const p = HUSTLE_BEFORE_CLAIM_RECOVERY;
type Row = Record<string, any>;
export const recoveryHash = (v: unknown) => createHash('sha256').update(sponsoredCanonicalJson(v)).digest('hex');
export const recoveryByteHash = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const rid = p.reviewId;
export const HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS: Readonly<Record<string, string>> = Object.freeze({
  [`hustle-sponsored-review:${rid}:0`]: '0f4e5371d713cbb8bc1fc94d547aa2f4353bda4b9df066b70a3adb6936772460',
  [`hustle-sponsored-review:${rid}:1`]: 'd73680c10532478a4109f1b68c07137f33d4d96a81906e91af76f498962e4ad9',
  [`hustle-sponsored-review:${rid}:2`]: '9ad130646f52403813a9ca9f7ebaf6a1d063e49f7be394806723716258163af1',
  [`hustle-sponsored-review:${rid}:3`]: 'a6f531f9c4422fcc3340ddceac8a194a899070de97d1b84af2a1f7173d49f253',
  [`hustle-sponsored-review:${rid}:4`]: '50664d8b6cf5630c77e5e42d679ff1cee5a51d3c06fcacd9dd45a7b7ddbb0e54',
  'hustle-sponsored-renewed-stage:efdfd8935ea5dd904b01e74b7cbd5846afbdd7e44bc732a9390e0b828034b29b': '8216b7203282c0f9405ef6f9ae594a044b41b3db6cffff0cf98ee77eb1dac000',
  [`hustle-sponsored-authorization:${rid}:210001`]: '92cec147fdccfedbc70ad9649b6cd3701aa0dcd042577609d9f267fe177d0de0',
  [`hustle-sponsored-authorization:${rid}:480001`]: 'e672991e1b1ba870bb57d29603a302a9c60f21747354dc3c71dc4aeec964187b',
  [`hustle-sponsored-authorization:${rid}:210010`]: '9c88321ee7bd89b1707e7f3ee868e6150f2353c0a3f41c5fd2ce9eb7ad7ed819',
  [`hustle-sponsored-authorization:${rid}:240001`]: 'b498cda71803acb68c4cdf1f8f40e1f1bedd2e1b33ec15709e201cf1d19fc086',
  [`hustle-sponsored-authorization:${rid}:240003`]: 'dfb1a0cc9c01651ec5b1064535a58108297d15bba3321cc5d2a78c106163a683',
  [`hustle-sponsored-policy:${rid}`]: '65f19deb02fc2cab099ba5516b594af3551e770c8e10009b3adfdfa01b0c3dcc',
  [`hustle-sponsored-approved:${rid}`]: '5355f39300bea75cde439cea33be108a6cc6cd7607a9e6144fb596054e4eb5d5',
  'hustle-first-batch-renewed-start:2026-11-19': 'aafef13c2e92430a32d79ffa7160eadb6909a091ddfe968654eb433259da0121',
  [p.originalTaskKey]: '28c0e5983d345e28eda81f1fbdd1e9ba8a92c4137defc245638e45f19eb3941a',
  'hustle-first-batch-failure:2026-11-18': '88f127ca0928358f4fa2259fbac9ecebefd6c7ff23d245925da19fe14bc5a0f9',
  'hustle-first-batch-failure:2026-11-18:accepted': 'ab2092f421c874051e6cccf4cde1adfa749852c9fde1a07f94b8c65583e7b758',
});
function mac(domain: string, value: unknown) {
  return createHmac('sha256', hustleExistingSigningAuthority(ENV.cookieSecret)).update(domain).update(sponsoredCanonicalJson(value)).digest('hex');
}
const TASK_DOMAIN = 'jeristotle/hustle-task-first-batch/v1\n';
export function signRecoveryTaskEvent(payload: Row) { return { payload, signature: mac(TASK_DOMAIN, payload) }; }
function taskPayload(row: Row, key: string, type: string): Row {
  if (row?.campaignId !== 1 || row.eventKey !== key || row.eventType !== type) throw new Error('Exact signed task event required');
  const e = JSON.parse(row.detailJson);
  if (Object.keys(e).sort().join(',') !== 'payload,signature' || !/^[a-f0-9]{64}$/.test(e.signature) ||
    !timingSafeEqual(Buffer.from(e.signature, 'hex'), Buffer.from(mac(TASK_DOMAIN, e.payload), 'hex'))) throw new Error('Recovery task signature mismatch');
  return e.payload;
}
export function recoveryActorProvenance(actor: HustleManagedOperatorActor) {
  const { grantId: _, approvedBy, ...rest } = actor;
  const { verifiedAt: _time, taskApiResponseSha256: _response, ...direct } = approvedBy;
  return { ...rest, approvedBy: direct };
}
export function assertRecoveryArchive(files: Record<string, string>) {
  if (Object.keys(files).sort().join(',') !== Object.keys(p.files).sort().join(',')) throw new Error('Complete immutable original phase archive required');
  for (const [name, digest] of Object.entries(p.files)) if (typeof files[name] !== 'string' || recoveryByteHash(files[name]) !== digest)
    throw new Error('Original recovery incident file changed: ' + name);
  const refusal = JSON.parse(files['nov19-execution-receipt.json']);
  if (refusal.ok !== false || refusal.noSendsClaimed !== true || refusal.noAutomaticRetry !== true || refusal.failureEmail !== 'unverified-not-sent')
    throw new Error('Only exact retained before-claim refusal is recoverable');
}
/** Exact raw digests AND existing-key HMACs; never a general old-source verifier. */
export function assertRecoveryHistoricalEvents(events: Row[]) {
  for (const [key, digest] of Object.entries(HUSTLE_BEFORE_CLAIM_HISTORICAL_EVENTS)) {
    const matches = events.filter(e => e.eventKey === key);
    if (matches.length !== 1 || matches[0].campaignId !== 1 || recoveryByteHash(matches[0].detailJson) !== digest)
      throw new Error('Immutable historical recovery event changed/missing: ' + key);
    const row = matches[0];
    if (row.eventType.startsWith('hustle_sponsored_')) {
      const e = JSON.parse(row.detailJson), { signature, ...unsigned } = e;
      const keyBytes = createHmac('sha256', hustleExistingSigningAuthority(ENV.cookieSecret)).update('jeristotle/hustle-sponsored-review/signing-key/v1').digest();
      const expected = createHmac('sha256', keyBytes).update('jeristotle/hustle-sponsored-review/envelope/v1\n').update(sponsoredCanonicalJson(unsigned)).digest('hex');
      if (e.sourceHash !== p.sourceHash || e.kind !== row.eventType || !isHustleManagedOperatorActor(e.actor) || !/^[a-f0-9]{64}$/.test(signature) ||
        !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw new Error('Historical recovery review signature/source mismatch');
    } else if (key === p.originalTaskKey || key === 'hustle-first-batch-renewed-start:2026-11-19') taskPayload(row, key, row.eventType);
  }
  const original = taskPayload(events.find(e => e.eventKey === p.originalTaskKey)!, p.originalTaskKey, 'hustle_first_batch_task_manifest');
  if (original.serverSourceHash !== p.sourceHash || original.moduleSourceHash !== p.moduleHash ||
    original.consent.reviewId !== p.reviewId || original.consent.reviewHash !== p.reviewHash ||
    recoveryHash(original.consent.prospectIds) !== recoveryHash(p.prospectIds) ||
    recoveryHash(original.consent.initialMessageIds) !== recoveryHash([90001, 90004, 90007, 90010, 90013])) throw new Error('Original signed task mapping mismatch');
  return original;
}
/** Narrow discovery used inside the EXISTING task adapter lock, never caller selection. */
export async function readHustleBeforeClaimRecoveryTaskManifest(tx: any, now = new Date(), actor?: HustleManagedOperatorActor) {
  const events: Row[] = await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId, 1));
  const rows = events.filter(e => e.eventKey === p.auditKey || e.eventKey === p.taskKey || e.eventKey === p.authorityKey);
  if (!rows.length) return null;
  const { HUSTLE_SPONSORED_SERVER_SOURCE_HASH, readHustleBeforeClaimRecoveryAuthority } = await import('./hustleSponsoredReviewDb');
  const authority = readHustleBeforeClaimRecoveryAuthority(events, now);
  if (!authority) throw new Error('Recovery pointer missing/corrupt/stale source; held');
  const m = taskPayload(events.find(e => e.eventKey === p.taskKey)!, p.taskKey, 'hustle_first_batch_task_manifest');
  const a = taskPayload(events.find(e => e.eventKey === p.authorityKey)!, p.authorityKey, 'hustle_first_batch_renewed_start_authorization');
  if (m.version !== 1 || m.kind !== 'hustle_first_batch_task_manifest' || m.serverSourceHash !== HUSTLE_SPONSORED_SERVER_SOURCE_HASH ||
    m.moduleSourceHash !== (release.sourceHashes as Record<string, string>)['server/hustleTaskFirstBatch.ts'] ||
    m.registeredAt !== authority.registeredAt || m.registeredAt > now.getTime() ||
    recoveryHash(m.consent) !== recoveryHash(authority.consent) || !isHustleManagedOperatorActor(m.actor) ||
    recoveryHash(recoveryActorProvenance(m.actor)) !== recoveryHash(recoveryActorProvenance(authority.actor)) ||
    (actor && recoveryHash(recoveryActorProvenance(actor)) !== recoveryHash(recoveryActorProvenance(m.actor))) ||
    a.registeredAt !== m.registeredAt || a.reviewId !== m.consent.reviewId || a.reviewHash !== m.consent.reviewHash ||
    a.serverSourceHash !== m.serverSourceHash || recoveryHash(a.authorization) !== recoveryHash(m.actor.approvedBy.renewedStart))
    throw new Error('Recovery manifest/source/provenance mismatch');
  return m;
}
