import { getOutreachLocalMoment, OUTREACH_TIME_ZONE } from "./outreachSchedule";
import { JERISTOTLE_INTERNAL_EMAIL_RECIPIENTS } from "./personnelPolicy";
import {
  OUTREACH_MAIL_RECONNECT_ACTION,
  outreachOwnerActionForSnapshot,
  type OutreachOwnerActionEvidence,
} from "./outreachAlertNotificationPolicy";

export const OUTREACH_ALERT_RUNTIME_VERSION = "outreach-alerts-v1";
export const OUTREACH_ALERT_CALLBACK = "/api/scheduled/outreach-alerts";
export const OUTREACH_ALERT_CRON = "0 0,30 14-23 * * *";
export const OUTREACH_ALERT_RECIPIENT = JERISTOTLE_INTERNAL_EMAIL_RECIPIENTS[0];

export type OutreachCampaignKey =
  | "chamber"
  | "credit_union"
  | "brand_video"
  | "training"
  | "hustle"
  | "tourism"
  | "real_estate"
  | "industrial"
  | "healthcare";

export type OutreachReserveContext = {
  readinessVerified?: boolean;
  desiredReserve?: number;
  refillThreshold?: number;
  nextRefillOpportunityAt?: Date | null;
  researchLeaseUntil?: Date | null;
  researchState?:
    | "pending"
    | "exhausted"
    | "source_holds"
    | "not_requested"
    | "unavailable";
  lastVerifiedSendAt?: Date | null;
  dailyLimit?: number;
  /** Requested shared policy; dailyLimit remains the current stored cap. */
  requestedDailyLimit?: number;
  persistedReserveTarget?: number | null;
};

export type OutreachAlertSnapshot = OutreachReserveContext & {
  key: OutreachCampaignKey;
  label: string;
  campaignStatus: string;
  weekdaysOnly: boolean;
  dailyLimit: number;
  readyCount: number | null;
  newAccepted: number;
  followupAccepted: number;
  uncertainCount: number;
  schedulerState:
    | "enabled"
    | "disabled"
    | "not_linked"
    | "invalid"
    | "unavailable";
  runStatus: string | null;
  runDate: string | null;
  runUpdatedAt: Date | null;
  lastMaintenanceFailureAt: Date | null;
  lastMaintenanceSuccessAt: Date | null;
  startsAt: Date | null;
  lastInboxCheckAt?: Date | null;
  schedulerLastExecutedAt?: Date | null;
  readError?: boolean;
  ownerActionEvidence?: OutreachOwnerActionEvidence | null;
};

export type OutreachAlertIssue = OutreachReserveContext & {
  campaignKey: OutreachCampaignKey;
  label: string;
  kind: string;
  detail: string;
  newAccepted: number;
  followupAccepted: number;
  readyCount: number | null;
  ownerAction?: "reconnect_mailbox" | null;
  ownerActionEvidence?: OutreachOwnerActionEvidence | null;
};

const alertWindowStart = 9 * 60 + 30;
const alertWindowEnd = 17 * 60 + 59;
const generalLaunchGraceStart = 9 * 60 + 15;
const chamberLaunchGraceStart = 9 * 60 + 45;
const chamberOutputCheckStart = 10 * 60;
const expectedMaintenanceMinute = 8 * 60;
const maintenanceStaleCheckStart = 10 * 60;
const maintenanceFreshnessMs = 90 * 60 * 1_000;
const inFlightGraceMs = 5 * 60 * 1_000;
const knownSchedulerStates = new Set([
  "enabled",
  "disabled",
  "not_linked",
  "invalid",
  "unavailable",
]);

function finiteCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function finiteReadyCount(value: number | null) {
  return value === null || !Number.isFinite(value) || value < 0
    ? null
    : Math.floor(value);
}

function validTime(value: Date | null | undefined) {
  return value && Number.isFinite(value.getTime()) ? value.getTime() : null;
}

function normalizedStatus(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isExplicitlyActive(status: string) {
  return status.trim().toLowerCase() === "active";
}

function acceptedSummary(newAccepted: number, followupAccepted: number) {
  return `Accepted today: ${newAccepted} new and ${followupAccepted} follow-up.`;
}

function isNewLaunchToday(snapshot: OutreachAlertSnapshot, localDate: string) {
  const startsAt = snapshot.startsAt;
  if (!startsAt || !Number.isFinite(startsAt.getTime())) return false;
  const localStart = getOutreachLocalMoment(startsAt, OUTREACH_TIME_ZONE);
  const startMinutes = localStart.hour * 60 + localStart.minute;
  const launchGraceStart =
    snapshot.key === "chamber"
      ? chamberLaunchGraceStart
      : generalLaunchGraceStart;
  return localStart.dateKey === localDate && startMinutes > launchGraceStart;
}

function hasNewerMaintenanceFailure(snapshot: OutreachAlertSnapshot) {
  const failure = validTime(snapshot.lastMaintenanceFailureAt);
  if (failure === null) return false;
  const success = validTime(snapshot.lastMaintenanceSuccessAt);
  return success === null || failure > success;
}

function latestCurrentLocalMaintenanceAt(
  snapshot: OutreachAlertSnapshot,
  localDate: string,
  now: Date
) {
  // A callback receipt does not prove a successful inbox scan. All current
  // campaigns supply the inbox field; scheduler metadata is legacy fallback only.
  const receipts =
    snapshot.lastInboxCheckAt !== undefined
      ? [snapshot.lastInboxCheckAt]
      : [snapshot.schedulerLastExecutedAt];
  return receipts
    .map(validTime)
    .filter(
      (timestamp): timestamp is number =>
        timestamp !== null &&
        timestamp <= now.getTime() &&
        getOutreachLocalMoment(new Date(timestamp), OUTREACH_TIME_ZONE)
          .dateKey === localDate
    )
    .reduce<number | null>(
      (latest, timestamp) =>
        latest === null || timestamp > latest ? timestamp : latest,
      null
    );
}

function hasStaleMaintenance(
  snapshot: OutreachAlertSnapshot,
  localDate: string,
  now: Date,
  nowMinutes: number
) {
  if (
    nowMinutes < maintenanceStaleCheckStart ||
    nowMinutes - expectedMaintenanceMinute <= 90
  ) {
    return false;
  }
  const startsAt = validTime(snapshot.startsAt);
  if (startsAt !== null && now.getTime() - startsAt <= maintenanceFreshnessMs)
    return false;
  const latest = latestCurrentLocalMaintenanceAt(snapshot, localDate, now);
  return latest === null || now.getTime() - latest > maintenanceFreshnessMs;
}

function isFreshCurrentRun(
  snapshot: OutreachAlertSnapshot,
  localDate: string,
  now: Date
) {
  if (snapshot.runDate !== localDate) return false;
  const status = normalizedStatus(snapshot.runStatus);
  if (!["started", "running", "in_progress", "in-progress"].includes(status)) {
    return false;
  }
  const updatedAt = validTime(snapshot.runUpdatedAt);
  if (updatedAt === null) return false;
  const age = now.getTime() - updatedAt;
  return age >= 0 && age <= inFlightGraceMs;
}

function isCurrentRunFailure(status: string) {
  return ["failed", "failure", "error"].includes(status);
}

function isIncompleteRun(status: string) {
  return [
    "started",
    "running",
    "in_progress",
    "in-progress",
    "skipped",
    "missed",
    "pending",
  ].includes(status);
}

function alertIssue(
  snapshot: OutreachAlertSnapshot,
  kind: string,
  detail: string
): OutreachAlertIssue {
  return {
    campaignKey: snapshot.key,
    label: snapshot.label,
    kind,
    detail,
    newAccepted: finiteCount(snapshot.newAccepted),
    followupAccepted: finiteCount(snapshot.followupAccepted),
    readyCount: finiteReadyCount(snapshot.readyCount),
    readinessVerified: snapshot.readinessVerified,
    dailyLimit: snapshot.dailyLimit,
    requestedDailyLimit: snapshot.requestedDailyLimit,
    persistedReserveTarget: snapshot.persistedReserveTarget,
    desiredReserve: snapshot.desiredReserve,
    refillThreshold: snapshot.refillThreshold,
    nextRefillOpportunityAt: snapshot.nextRefillOpportunityAt,
    researchLeaseUntil: snapshot.researchLeaseUntil,
    researchState: snapshot.researchState,
    lastVerifiedSendAt: snapshot.lastVerifiedSendAt,
  };
}

/** Supply is independent of today's cap/run. A verified empty reserve blocks future cadence. */
export function evaluateOutreachReserveAlert(
  snapshot: OutreachAlertSnapshot,
  now: Date
): OutreachAlertIssue | null {
  const local = getOutreachLocalMoment(now, OUTREACH_TIME_ZONE);
  if (
    local.hour * 60 + local.minute < alertWindowStart ||
    local.hour * 60 + local.minute > alertWindowEnd ||
    !isExplicitlyActive(snapshot.campaignStatus) ||
    snapshot.readError ||
    snapshot.schedulerState !== "enabled" ||
    snapshot.readinessVerified !== true ||
    finiteReadyCount(snapshot.readyCount) !== 0 ||
    !Number.isFinite(snapshot.dailyLimit) ||
    snapshot.dailyLimit <= 0 ||
    isFreshCurrentRun(snapshot, local.dateKey, now)
  )
    return null;
  return alertIssue(
    snapshot,
    "ready_new_empty",
    "Verified READY NEW reserve is 0. Future new-contact cadence cannot continue until qualified, approved contacts are ready. Today's accepted sends remain recorded; this is not a failed-send claim."
  );
}

/**
 * Evaluates one campaign snapshot without reading or changing any external state.
 * It intentionally reports only the highest-priority actionable condition.
 */
export function evaluateOutreachAlert(
  snapshot: OutreachAlertSnapshot,
  now: Date
): OutreachAlertIssue | null {
  const local = getOutreachLocalMoment(now, OUTREACH_TIME_ZONE);
  const nowMinutes = local.hour * 60 + local.minute;
  const brandVideoRunsEveryDay = snapshot.key === "brand_video";

  if (nowMinutes < alertWindowStart || nowMinutes > alertWindowEnd) return null;
  if (
    snapshot.weekdaysOnly &&
    !brandVideoRunsEveryDay &&
    !local.isBusinessDay
  ) {
    return null;
  }
  // Paused, review, and other explicitly non-active campaigns are intentional.
  if (!isExplicitlyActive(snapshot.campaignStatus)) {
    return snapshot.readError && snapshot.campaignStatus === "unknown"
      ? alertIssue(
          snapshot,
          "health_unknown",
          "Campaign health cannot be confirmed; verify scheduler and reporting access."
        )
      : null;
  }

  const schedulerState = String(snapshot.schedulerState ?? "").trim();
  const newAccepted = finiteCount(snapshot.newAccepted);
  const followupAccepted = finiteCount(snapshot.followupAccepted);
  const uncertainCount = finiteCount(snapshot.uncertainCount);
  const readyCount = finiteReadyCount(snapshot.readyCount);
  const dailyLimit = finiteCount(snapshot.dailyLimit);
  const runStatus = normalizedStatus(snapshot.runStatus);
  const currentRun = snapshot.runDate === local.dateKey;

  // Health cannot be assessed safely, so never infer zero sends in this branch.
  if (
    snapshot.readError ||
    schedulerState === "unavailable" ||
    !knownSchedulerStates.has(schedulerState)
  ) {
    return alertIssue(
      snapshot,
      "health_unknown",
      "Campaign health cannot be confirmed; verify scheduler and reporting access."
    );
  }

  if (schedulerState === "not_linked") {
    return alertIssue(
      snapshot,
      "scheduler_not_linked",
      "Active campaign is not linked to a scheduler."
    );
  }
  if (schedulerState === "disabled") {
    return alertIssue(
      snapshot,
      "scheduler_disabled",
      "Scheduler is disabled while the campaign is active."
    );
  }
  if (schedulerState === "invalid") {
    return alertIssue(
      snapshot,
      "scheduler_invalid",
      "Scheduler configuration is invalid for this active campaign."
    );
  }

  if (outreachOwnerActionForSnapshot(snapshot, now)) {
    return {
      ...alertIssue(
        snapshot,
        "owner_action_required",
        OUTREACH_MAIL_RECONNECT_ACTION
      ),
      ownerAction: "reconnect_mailbox",
      ownerActionEvidence: snapshot.ownerActionEvidence,
    };
  }

  if (uncertainCount > 0) {
    return alertIssue(
      snapshot,
      "delivery_uncertain",
      `${uncertainCount} delivery record${uncertainCount === 1 ? " needs" : "s need"} reconciliation; do not resend automatically.`
    );
  }

  if (hasNewerMaintenanceFailure(snapshot)) {
    return alertIssue(
      snapshot,
      "maintenance_failure",
      "A newer maintenance failure needs review before relying on campaign health."
    );
  }

  // A run may legitimately be working for a few minutes after it has reserved the day.
  if (isFreshCurrentRun(snapshot, local.dateKey, now)) return null;

  if (hasStaleMaintenance(snapshot, local.dateKey, now, nowMinutes)) {
    return alertIssue(
      snapshot,
      "maintenance_stale",
      "Today's expected maintenance has not been confirmed within the required freshness window."
    );
  }

  if (currentRun && isCurrentRunFailure(runStatus)) {
    return alertIssue(
      snapshot,
      "failed_batch",
      `Today's daily run reports a technical failure. ${acceptedSummary(newAccepted, followupAccepted)}`
    );
  }

  // A newly activated campaign after the scheduled start should not be judged for
  // a batch that was never expected to exist; configuration failures remain above.
  if (isNewLaunchToday(snapshot, local.dateKey)) return null;

  // Persisted SMTP acceptance is authoritative even if aggregate run tracking is absent.
  if (dailyLimit > 0 && newAccepted >= dailyLimit) return null;

  // Chamber's sender can complete a retry through the 9 AM hour, including 9:30.
  // Configuration, uncertainty, maintenance, and explicit failures already returned.
  if (snapshot.key === "chamber" && nowMinutes < chamberOutputCheckStart) {
    return null;
  }

  if (!currentRun) {
    return alertIssue(
      snapshot,
      snapshot.runDate ? "missed_batch" : "missing_batch",
      snapshot.runDate
        ? `No completed daily run is recorded for ${local.dateKey}; the latest recorded run is from an earlier date.`
        : `No daily run is recorded for ${local.dateKey} after the send window.`
    );
  }

  if (isIncompleteRun(runStatus) || !runStatus) {
    return alertIssue(
      snapshot,
      "missed_batch",
      "Today's daily run has not completed after the send window."
    );
  }

  if (readyCount === 0 && newAccepted === 0 && dailyLimit > 0) {
    return alertIssue(
      snapshot,
      "queue_exhausted",
      "Ready queue is exhausted; no new SMTP acceptance is recorded today."
    );
  }

  if (dailyLimit > 0 && newAccepted < dailyLimit) {
    return alertIssue(
      snapshot,
      "partial_batch",
      `${newAccepted} of ${dailyLimit} new messages have SMTP acceptance today; review the incomplete batch.`
    );
  }

  return null;
}

/** Pure branded HTML/plaintext renderer; no side effects. */
export { renderOutreachAlertEmail as buildOutreachAlertEmail } from "./outreachAlertEmail";
