export const OUTREACH_REPLENISHMENT_POLICY_VERSION =
  "outreach-reserve-50-30-nightly-2026-11-05-v1" as const;
/** Five days of NEW contacts at ten/day; follow-ups are never reserve inventory. */
export const OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET = 50 as const;
/** Strictly below thirty: a three-day runway, not a guarantee of public supply. */
export const OUTREACH_INITIAL_REFILL_START_BELOW = 30 as const;
export const OUTREACH_NEW_CONTACTS_PER_CAMPAIGN_DAY = 10 as const;
export const OUTREACH_RESEARCH_START_HOUR = 1 as const;
export const OUTREACH_RESEARCH_END_HOUR = 5 as const;
export const OUTREACH_RESEARCH_MAX_COMPANY_CALLS = Object.freeze({
  credit_union: 18, brand_video: 18, training: 15, hustle: 18, sectors: 18,
});
export const OUTREACH_PUBLIC_SUPPLY_NOTICE =
  "Qualified, source-verified public contact supply is finite; reserve and daily new-contact targets are not guaranteed.";

export type OutboundReplenishmentCampaign = "credit_union" | "brand_video";
export type OutboundReplenishmentPolicy = Readonly<{
  policyVersion: string;
  target: number;
  startRefillBelow: number;
  detectionStartHour: number;
  detectionEndHour: number;
}>;
/** Existing hard request/cooldown limits: never increase these from payloads. */
export const OUTBOUND_REPLENISHMENT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const OUTBOUND_REPLENISHMENT_MAX_REQUESTS_PER_DAY = 3;
/** Preserve the existing exact CU recipient-qualification publication marker. */
export const CREDIT_UNION_REPLENISHMENT_POLICY_VERSION = "credit-union-proactive-v1" as const;
export const CREDIT_UNION_LEGACY_READY_TARGET = 20 as const;
export const CREDIT_UNION_LEGACY_REFILL_START_BELOW = 20 as const;
export const CREDIT_UNION_LEGACY_DETECTION_START_HOUR = 8 as const;
export const CREDIT_UNION_LEGACY_DETECTION_END_HOUR = 17 as const;
export const CREDIT_UNION_READY_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
export const CREDIT_UNION_REFILL_START_BELOW = OUTREACH_INITIAL_REFILL_START_BELOW;
export const CREDIT_UNION_DETECTION_START_HOUR = OUTREACH_RESEARCH_START_HOUR;
export const CREDIT_UNION_DETECTION_END_HOUR = OUTREACH_RESEARCH_END_HOUR;
export const CREDIT_UNION_PROACTIVE_RESERVE_TARGET = CREDIT_UNION_READY_TARGET;
export const CREDIT_UNION_PROACTIVE_REFILL_THRESHOLD = CREDIT_UNION_REFILL_START_BELOW;
export const BRAND_VIDEO_READY_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
export const BRAND_VIDEO_REFILL_START_BELOW = OUTREACH_INITIAL_REFILL_START_BELOW;
export const BRAND_VIDEO_DETECTION_START_HOUR = OUTREACH_RESEARCH_START_HOUR;
export const BRAND_VIDEO_DETECTION_END_HOUR = OUTREACH_RESEARCH_END_HOUR;
const CREDIT_UNION_LEGACY_POLICY: OutboundReplenishmentPolicy = Object.freeze({
  policyVersion: "credit-union-legacy-v1", target: 20, startRefillBelow: 20,
  detectionStartHour: 8, detectionEndHour: 17,
});
const CREDIT_UNION_PROACTIVE_POLICY: OutboundReplenishmentPolicy = Object.freeze({
  policyVersion: CREDIT_UNION_REPLENISHMENT_POLICY_VERSION,
  target: CREDIT_UNION_READY_TARGET, startRefillBelow: CREDIT_UNION_REFILL_START_BELOW,
  detectionStartHour: CREDIT_UNION_DETECTION_START_HOUR,
  detectionEndHour: CREDIT_UNION_DETECTION_END_HOUR,
});
const BRAND_VIDEO_POLICY: OutboundReplenishmentPolicy = Object.freeze({
  policyVersion: OUTREACH_REPLENISHMENT_POLICY_VERSION,
  target: BRAND_VIDEO_READY_TARGET, startRefillBelow: BRAND_VIDEO_REFILL_START_BELOW,
  detectionStartHour: BRAND_VIDEO_DETECTION_START_HOUR,
  detectionEndHour: BRAND_VIDEO_DETECTION_END_HOUR,
});
export function getOutboundReplenishmentPolicy(
  campaign: OutboundReplenishmentCampaign,
  options: Readonly<{ creditUnionProactivePublished?: boolean }> = {}
): OutboundReplenishmentPolicy {
  if (campaign === "credit_union")
    return options.creditUnionProactivePublished ? CREDIT_UNION_PROACTIVE_POLICY : CREDIT_UNION_LEGACY_POLICY;
  if (campaign === "brand_video") return BRAND_VIDEO_POLICY;
  throw new Error("Unknown trusted replenishment campaign");
}
export function getCreditUnionReplenishmentPolicy(proactivePublished = false): OutboundReplenishmentPolicy {
  return getOutboundReplenishmentPolicy("credit_union", { creditUnionProactivePublished: proactivePublished });
}
/** Unknown or capped legacy counts cannot be asserted to represent fifty-ready supply. */
export function requiresInitialReserveRefill(readyInitialCount: number): boolean {
  return Number.isInteger(readyInitialCount) && readyInitialCount >= 0 && readyInitialCount < OUTREACH_INITIAL_REFILL_START_BELOW;
}
