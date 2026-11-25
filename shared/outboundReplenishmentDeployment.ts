import {
  CREDIT_UNION_REPLENISHMENT_POLICY_VERSION,
  getOutboundReplenishmentPolicy,
  getCreditUnionReplenishmentPolicy,
  OUTREACH_REPLENISHMENT_POLICY_VERSION,
  type OutboundReplenishmentCampaign,
} from "./outboundReplenishmentPolicy";

/** Fixed public production readiness endpoint; this helper never sends secrets. */
export const CREDIT_UNION_OPERATIONS_ENDPOINT =
  "https://jeristotleproductions.com/api/trpc/creditUnion.operations";
export const BRAND_VIDEO_OPERATIONS_ENDPOINT =
  "https://jeristotleproductions.com/api/trpc/brandVideo.operations";

const CREDIT_UNION_RUNTIME_VERSION = "credit-union-sending-v1";

export type ReplenishmentReadFetch = (
  url: string,
  init: Readonly<{ method: "GET" }>
) => Promise<Readonly<{ ok: boolean; json: () => Promise<unknown> }>>;

export type CreditUnionReplenishmentDeployment = Readonly<{
  target: 20 | 50;
  policyVersion: string;
  refillThreshold: 20 | 30;
  /** Departmental recipients are usable only after the exact published marker. */
  departmentEnabled: boolean;
  /** True for legacy, unknown, unavailable, or malformed deployment evidence. */
  upgradePendingPublication: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads only the fixed public production operations response. A deployment is
 * proactive only when both the runtime and policy marker are exact; every
 * network or response-shape failure deliberately retains the legacy policy.
 */
export async function readCreditUnionReplenishmentDeployment(
  fetchImpl: ReplenishmentReadFetch = fetch as unknown as ReplenishmentReadFetch
): Promise<CreditUnionReplenishmentDeployment> {
  let proactivePublished = false;
  try {
    const response = await fetchImpl(CREDIT_UNION_OPERATIONS_ENDPOINT, {
      method: "GET",
    });
    if (!response.ok) throw new Error("Credit Union operations read failed");
    const body = await response.json();
    const result = isRecord(body) ? body.result : null;
    const data = isRecord(result) ? result.data : null;
    const json = isRecord(data) ? data.json : null;
    if (
      !isRecord(json) ||
      json.runtimeVersion !== CREDIT_UNION_RUNTIME_VERSION
    ) {
      throw new Error(
        "Credit Union operations response is not a valid runtime"
      );
    }
    proactivePublished =
      json.replenishmentPolicyVersion ===
      CREDIT_UNION_REPLENISHMENT_POLICY_VERSION;
  } catch {
    proactivePublished = false;
  }

  const policy = getCreditUnionReplenishmentPolicy(proactivePublished);
  return {
    target: policy.target as 20 | 50,
    policyVersion: policy.policyVersion,
    refillThreshold: policy.startRefillBelow as 20 | 30,
    departmentEnabled: proactivePublished,
    upgradePendingPublication: !proactivePublished,
  };
}

/**
 * Brand Video reads its OWN exact publication evidence, never CU state.
 * Legacy/unavailable/incorrectly capped operations stay20 pending publication.
 */
export async function readOutboundReplenishmentDeployment(
  campaign: OutboundReplenishmentCampaign,
  fetchImpl?: ReplenishmentReadFetch
): Promise<CreditUnionReplenishmentDeployment> {
  if (campaign === "credit_union")
    return readCreditUnionReplenishmentDeployment(fetchImpl);

  let published = false;
  try {
    const response = await (fetchImpl ?? fetch as unknown as ReplenishmentReadFetch)(BRAND_VIDEO_OPERATIONS_ENDPOINT, {method:"GET"});
    const body = await response.json();
    const json = isRecord(body) && isRecord(body.result) && isRecord(body.result.data) ? body.result.data.json : null;
    published = response.ok && isRecord(json) && json.runtimeVersion === "brand-video-sending-v1" && json.replenishmentPolicyVersion === OUTREACH_REPLENISHMENT_POLICY_VERSION && json.bufferTarget === 50 && json.refillThreshold === 30 && json.dailyNewLimit === 10;
  } catch { /* publication unknown: never broaden local preparation to50 */ }
  if (!published) return {target:20,policyVersion:"brand-video-reserve-v1",refillThreshold:20,departmentEnabled:false,upgradePendingPublication:true};
  const policy = getOutboundReplenishmentPolicy("brand_video");
  return {
    target: policy.target as 20 | 50,
    policyVersion: policy.policyVersion,
    refillThreshold: policy.startRefillBelow as 20 | 30,
    departmentEnabled: false,
    upgradePendingPublication: false,
  };
}

/** A pure finalization guard keeps a claim bound to its recorded reserve target. */
export function hasReachedReplenishmentTarget(
  readyCount: number,
  target: number
) {
  return (
    Number.isFinite(readyCount) &&
    Number.isFinite(target) &&
    readyCount >= target
  );
}
