/** Pure recorded source-map validation. No file, DB, network, signing or caller scope.
 * The closure covers the existing private operator/sender local imports, including
 * timing, stops, normalization, persistence and internal exception dependencies.
 * Bind the entire canonical map, not merely the required projection, so additions
 * and any recorded transitive guard-only change invalidate durable old envelopes.
 */
export const HUSTLE_SECURITY_SOURCE_DEPENDENCIES = Object.freeze([
  'drizzle/schema.ts',
  'scripts/hustle-task-first-batch.ts',
  'scripts/hustle-task-first-batch-continuation.ts',
  'scripts/hustle-task-first-batch-recovery.ts',
  'scripts/hustle-source-transition.ts',
  'server/_core/context.ts',
  'server/_core/env.ts',
  'server/_core/heartbeat.ts',
  'server/_core/index.ts',
  'server/_core/notification.ts',
  'server/_core/sdk.ts',
  'server/_core/types/manusTypes.ts',
  'server/db.ts',
  'server/hustleAutomation.ts',
  'server/hustleBeforeClaimRecovery.ts',
  'server/hustleDb.ts',
  'server/hustleEmail.ts',
  'server/hustleFirstBatch.ts',
  'server/hustleInbox.ts',
  'server/hustleLateStartAuthorization.ts',
  'server/hustleManagedOperatorGrant.ts',
  'server/hustlePartialContinuation.ts',
  'server/hustleSigningAuthority.ts',
  'server/hustleSourceIdentity.ts',
  'server/hustleSourceTransition.ts',
  'server/hustleSponsoredReviewDb.ts',
  'server/hustleSponsoredRuntime.ts',
  'server/hustleTaskFirstBatch.ts',
  'server/inquiryEmail.ts',
  'server/outreachDeadline.ts',
  'server/routers/hustle.ts',
  'server/sectorCrossCampaignGuard.ts',
  'server/sectorEmail.ts',
  'shared/blueprintGrowthPlan.ts',
  'shared/chamberChecklist.ts',
  'shared/chamberPlan.ts',
  'shared/chamberProspects.ts',
  'shared/const.ts',
  'shared/conversationOfferPlan.ts',
  'shared/growthChecklist.ts',
  'shared/growthDailyPlan.ts',
  'shared/growthPlan.ts',
  'shared/hustleOutreach.ts',
  'shared/hustleSponsoredReview.ts',
  'shared/linkedinPriorityPlan.ts',
  'shared/localAuthorityTasks.ts',
  'shared/outboundReplenishmentPolicy.ts',
  'shared/outreachFormatting.ts',
  'shared/outreachResearchWindow.ts',
  'shared/outreachReserveRefill.ts',
  'shared/outreachSchedule.ts',
  'shared/personnelPolicy.ts',
  'shared/trainingOutreach.ts',
] as const);
export function hustleRecordedSecuritySourceHashes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Complete recorded security source map required');
  const entries = Object.entries(value);
  if (entries.length < HUSTLE_SECURITY_SOURCE_DEPENDENCIES.length || entries.length > 1000 ||
    entries.some(([path, hash]) => !/^(?:server|shared|scripts|drizzle|client|research)\/[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|md)$/.test(path) ||
      path.includes('..') || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
    throw new Error('Valid bounded recorded security source hashes required');
  const hashes = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) as Record<string, string>;
  for (const required of HUSTLE_SECURITY_SOURCE_DEPENDENCIES) {
    if (!hashes[required]) throw new Error('Missing recorded security dependency: ' + required);
  }
  return hashes;
}
