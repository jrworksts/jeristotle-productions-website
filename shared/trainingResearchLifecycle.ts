import { TRAINING_OUTREACH_CAMPAIGN_SLUG } from "./trainingOutreach";
import { getOutreachLocalMoment } from "./outreachSchedule";
import { isOutreachResearchWindow } from "./outreachResearchWindow";

export const TRAINING_RESEARCH_LIFECYCLE_VERSION =
  "training-research-owned-v1" as const;
export const TRAINING_RESEARCH_CAMPAIGN_ID = 1 as const;
export const TRAINING_RESEARCH_COOLDOWN_MS = 90 * 60 * 1000;
export const TRAINING_RESEARCH_UNCERTAIN_LEASE_MS = 24 * 60 * 60 * 1000;
export const TRAINING_RESEARCH_MAX_REQUESTS_PER_DATE = 3;
export const TRAINING_RESEARCH_OUTCOMES = [
  "partial",
  "complete",
  "exhausted",
  "failed",
  "skipped",
] as const;
export type TrainingResearchOutcome =
  (typeof TRAINING_RESEARCH_OUTCOMES)[number];
export type TrainingResearchRequest = { requestedAt: string };
export type TrainingResearchOwner = TrainingResearchRequest & {
  campaignId: 1;
  campaignSlug: typeof TRAINING_OUTREACH_CAMPAIGN_SLUG;
  requestKey: string;
  requestEventId: number;
  ownerToken: string;
  leaseExpiresAt: string;
  target: 50;
};
export type TrainingResearchLedgerEvent = {
  id: number;
  campaignId: number;
  eventType: string;
  metadataJson: string | null;
};
export function trainingResearchMetadata(
  event: TrainingResearchLedgerEvent
): Record<string, any> {
  try {
    const m = JSON.parse(event.metadataJson ?? "null");
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}
export function exactTrainingResearchTimestamp(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw new Error(
      "Original requestedAt must be an exact UTC ISO timestamp including milliseconds"
    );
  return date;
}
/** MySQL TIMESTAMP(0) rounds fractional seconds, it does not truncate them. */
export function trainingResearchDbTimestamp(value: string | Date): Date {
  const date =
    typeof value === "string" ? exactTrainingResearchTimestamp(value) : value;
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid research timestamp");
  return new Date(Math.round(date.getTime() / 1000) * 1000);
}
export function trainingResearchRequestKey(requestedAt: string) {
  exactTrainingResearchTimestamp(requestedAt);
  return `training:1:${requestedAt}`;
}
export function assertTrainingResearchCampaign(
  campaign: any,
  approvals = true
) {
  if (
    !campaign ||
    campaign.id !== 1 ||
    campaign.slug !== TRAINING_OUTREACH_CAMPAIGN_SLUG
  )
    throw new Error("Fixed Training campaign identity mismatch");
  if (
    approvals &&
    (campaign.status !== "active" ||
      campaign.autoEnroll !== 1 ||
      campaign.autoApproveQualifiedProspects !== 1 ||
      !campaign.launchApprovedAt ||
      !campaign.listApprovedAt)
  )
    throw new Error("Active Training research approvals are required");
}
const REQUEST_EVENTS = new Set([
  "research_request_reserved",
  "research_webhook_requested",
  "research_webhook_uncertain",
  "research_webhook_failed",
]);
export function trainingResearchRequestLedger(
  events: TrainingResearchLedgerEvent[]
) {
  const requests = new Map<
    string,
    { event: TrainingResearchLedgerEvent; metadata: Record<string, any> }
  >();
  for (const event of events) {
    const m = trainingResearchMetadata(event);
    if (
      event.campaignId !== 1 ||
      !REQUEST_EVENTS.has(event.eventType) ||
      typeof m.requestedAt !== "string"
    )
      continue;
    try {
      exactTrainingResearchTimestamp(m.requestedAt);
    } catch {
      continue;
    }
    if (m.target !== 50) continue;
    if (
      m.requestKey &&
      m.requestKey !== trainingResearchRequestKey(m.requestedAt)
    )
      continue;
    if (!requests.has(m.requestedAt))
      requests.set(m.requestedAt, { event, metadata: m });
  }
  return requests;
}
export function trainingResearchEventOwned(
  event: TrainingResearchLedgerEvent,
  owner: TrainingResearchOwner
) {
  const m = trainingResearchMetadata(event);
  return (
    event.campaignId === 1 &&
    m.lifecycleVersion === TRAINING_RESEARCH_LIFECYCLE_VERSION &&
    m.requestKey === owner.requestKey &&
    m.requestedAt === owner.requestedAt &&
    m.requestEventId === owner.requestEventId &&
    m.ownerToken === owner.ownerToken
  );
}
export function assertTrainingResearchOwner(
  owner: TrainingResearchOwner,
  events: TrainingResearchLedgerEvent[]
) {
  if (
    owner.campaignId !== 1 ||
    owner.campaignSlug !== TRAINING_OUTREACH_CAMPAIGN_SLUG ||
    owner.target !== 50 ||
    owner.requestKey !== trainingResearchRequestKey(owner.requestedAt) ||
    !/^[a-f0-9]{48}$/.test(owner.ownerToken)
  )
    throw new Error("Invalid original research owner");
  const request = trainingResearchRequestLedger(events).get(owner.requestedAt);
  if (!request || request.event.id !== owner.requestEventId)
    throw new Error("Original request ledger does not match owner");
  const claims = events.filter(
    e =>
      e.eventType === "research_owned_claim" &&
      trainingResearchEventOwned(e, owner)
  );
  if (
    claims.length !== 1 ||
    trainingResearchMetadata(claims[0]).leaseExpiresAt !== owner.leaseExpiresAt
  )
    throw new Error("Original durable owner claim does not match");
}
export function trainingResearchLeaseMatches(
  campaign: any,
  owner: TrainingResearchOwner
) {
  return (
    campaign.researchLastRequestedAt?.getTime() ===
      trainingResearchDbTimestamp(owner.requestedAt).getTime() &&
    campaign.researchLeaseExpiresAt?.getTime() ===
      exactTrainingResearchTimestamp(owner.leaseExpiresAt).getTime()
  );
}
export function trainingResearchRequestGate(input: {
  now: Date;
  readyCount: number;
  campaign: any;
  events: TrainingResearchLedgerEvent[];
}): { allowed: boolean; reason?: string; retryAfter?: Date } {
  const { now, readyCount, campaign, events } = input;
  if (!isOutreachResearchWindow(now))
    return { allowed: false, reason: "outside-central-research-window" };
  if (!Number.isInteger(readyCount) || readyCount < 0)
    return { allowed: false, reason: "ready-count-invalid" };
  // Expiry alone never proves remote work/import did not happen. Unknown leases require exact owned finish or operator evidence recovery.
  if (campaign.researchLeaseExpiresAt)
    return {
      allowed: false,
      reason: "lease-active",
      retryAfter: campaign.researchLeaseExpiresAt,
    };
  const requests = trainingResearchRequestLedger(events);
  const ordered = Array.from(requests.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const latest = ordered.at(-1);
  const continuation =
    latest &&
    events.some(e => {
      const m = trainingResearchMetadata(e);
      if (
        e.eventType !== "research_owned_finished" ||
        m.outcome !== "partial" ||
        m.target !== 50 ||
        m.requestedAt !== latest[0]
      )
        return false;
      try {
        const owner = m as TrainingResearchOwner;
        assertTrainingResearchOwner(owner, events);
        assertTrainingResearchFinish(
          "partial",
          m.readyCount,
          events.filter(event => trainingResearchEventOwned(event, owner))
        );
        return trainingResearchEventOwned(e, owner);
      } catch {
        return false;
      }
    });
  if (readyCount >= 50 || (readyCount >= 30 && !continuation))
    return { allowed: false, reason: "ready-supply-sufficient" };
  const date = getOutreachLocalMoment(now, "America/Chicago").dateKey;
  const onDate = ordered.filter(
    ([at]) =>
      getOutreachLocalMoment(new Date(at), "America/Chicago").dateKey === date
  );
  if (onDate.length >= TRAINING_RESEARCH_MAX_REQUESTS_PER_DATE)
    return { allowed: false, reason: "request-date-budget" };
  if (latest) {
    const retryAfter = new Date(
      new Date(latest[0]).getTime() + TRAINING_RESEARCH_COOLDOWN_MS
    );
    if (now < retryAfter)
      return { allowed: false, reason: "request-cooldown", retryAfter };
  }
  return { allowed: true };
}
export function assertTrainingResearchFinish(
  outcome: TrainingResearchOutcome,
  readyCount: number,
  ownedEvents: TrainingResearchLedgerEvent[]
) {
  if (!TRAINING_RESEARCH_OUTCOMES.includes(outcome))
    throw new Error("Unknown terminal research outcome");
  if (!Number.isInteger(readyCount) || readyCount < 0)
    throw new Error("Invalid canonical ready count");
  const started = ownedEvents.filter(
    e => e.eventType === "research_owned_import_started"
  );
  for (const event of started) {
    const hash = trainingResearchMetadata(event).packetHash;
    if (
      !ownedEvents.some(
        e =>
          e.eventType === "research_owned_imported" &&
          trainingResearchMetadata(e).packetHash === hash
      )
    )
      throw new Error(
        "Import outcome uncertain; retain original lease and do not retry"
      );
  }
  if (outcome === "complete" && readyCount < 50)
    throw new Error("Cannot complete below the recorded fifty-ready target");
  if (
    (outcome === "partial" ||
      outcome === "complete" ||
      outcome === "exhausted") &&
    !ownedEvents.some(e => e.eventType === "research_owned_imported")
  )
    throw new Error(
      "Exact owned import/exhaustion audit is required; unrelated/unknown audits are not completion evidence"
    );
  if (
    (outcome === "partial" || outcome === "complete") &&
    !ownedEvents.some(e => e.eventType === "research_owned_prepared")
  )
    throw new Error("Canonical owned no-send preparation audit is required");
  if (
    outcome === "exhausted" &&
    !ownedEvents.some(
      e =>
        e.eventType === "research_owned_imported" &&
        trainingResearchMetadata(e).eligiblePublicSourcesExhausted === true
    )
  )
    throw new Error("Explicit owned public-source exhaustion is required");
}
