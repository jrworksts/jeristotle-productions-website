import { and, eq } from "drizzle-orm";
import {
  trainingOutreachCampaigns,
  trainingOutreachEvents,
  trainingOutreachProspects,
} from "../drizzle/schema";
import {
  TRAINING_CALLBACK,
  TRAINING_DAILY_NEW_LIMIT,
  TRAINING_MAINTENANCE_CRON,
  TRAINING_NIGHTLY_MAINTENANCE_CRON,
  TRAINING_OUTREACH_TIME_ZONE,
  TRAINING_READY_RESERVE_TARGET,
  TRAINING_RUNTIME_VERSION,
} from "../shared/trainingOutreach";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { getNextOutreachResearchAt } from "../shared/outreachMaintenance";
import { OUTREACH_INITIAL_REFILL_START_BELOW, OUTREACH_REPLENISHMENT_POLICY_VERSION, OUTREACH_PUBLIC_SUPPLY_NOTICE } from "../shared/outboundReplenishmentPolicy";
import { getDb } from "./db";
import { checkTrainingInbox } from "./trainingInbox";
import {
  getTrainingSendingHealth,
  prepareTrainingReadyReserve,
} from "./trainingSendingDb";
import { ensureTrainingCampaign } from "./trainingOutreach";
import { listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";

export const TRAINING_CRON = TRAINING_NIGHTLY_MAINTENANCE_CRON;
export const TRAINING_CONTROL_CALLBACK = TRAINING_CALLBACK;

function isManagedTrainingCron(cron: string) {
  return cron === TRAINING_CRON || cron === TRAINING_MAINTENANCE_CRON || cron === "0 0,30 6,7,13-23 * * *";
}

function getTrainingCalendarDayAt(date: Date, offset: number, hour: number) {
  const local = getOutreachLocalMoment(date, TRAINING_OUTREACH_TIME_ZONE);
  const desired = Date.UTC(
    local.year,
    local.month - 1,
    local.day + offset,
    hour
  );
  let timestamp = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = getOutreachLocalMoment(
      new Date(timestamp),
      TRAINING_OUTREACH_TIME_ZONE
    );
    const correction =
      desired -
      Date.UTC(
        represented.year,
        represented.month - 1,
        represented.day,
        represented.hour,
        represented.minute
      );
    timestamp += correction;
    if (correction === 0) break;
  }
  return new Date(timestamp);
}

function getNextTrainingScheduleTimes(now: Date) {
  const nextHour = (hour: number) => {
    const today = getTrainingCalendarDayAt(now, 0, hour);
    return today > now ? today : getTrainingCalendarDayAt(now, 1, hour);
  };
  let nextMaintenanceAt: Date | null = null;
  for (let offset = 0; offset < 2 && !nextMaintenanceAt; offset += 1) {
    for (let hour = 8; hour <= 17 && !nextMaintenanceAt; hour += 1) {
      const onHour = getTrainingCalendarDayAt(now, offset, hour);
      for (const minute of [0, 30]) {
        const tick = new Date(onHour.getTime() + minute * 60_000);
        if (tick > now) {
          nextMaintenanceAt = tick;
          break;
        }
      }
    }
  }
  return {
    nextPreparationAt: nextHour(8),
    nextSendAt: nextHour(9),
    nextMaintenanceAt,
  };
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}
const passwordConfigured = () =>
  Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);

/** Records the user's October 24 launch authorization without creating a job or sending mail. */
export async function authorizeTrainingLaunch() {
  const db = await database();
  const campaign = await ensureTrainingCampaign();
  await db
    .update(trainingOutreachCampaigns)
    .set({
      listApprovedAt: campaign.listApprovedAt || new Date(),
      launchApprovedAt: campaign.launchApprovedAt || new Date(),
      dailyNewLimit: TRAINING_DAILY_NEW_LIMIT,
      sendHourLocal: 9,
      timezone: "America/Chicago",
      autoEnroll: 1,
      autoApproveQualifiedProspects: 1,
      status: campaign.status === "active" ? "active" : "paused",
      notes:
        "Jeremy authorized the three-step Training launch on October 25, 2026: approved know-how email, ten new verified contacts every Central calendar day including weekends, follow-ups separate at 4 then 5 business-day spacing, automatic source-backed approval, app-driven research replenishment, and segmented tracking. Missing evidence and cross-campaign conflicts stay blocked. Publication and verified scheduler/research connection are required before activation.",
    })
    .where(eq(trainingOutreachCampaigns.id, campaign.id));
  return ensureTrainingCampaign();
}

/** Read-only report; capability URLs and send claim tokens are never exposed. */
export async function getTrainingOperations(now = new Date()) {
  const campaign = await ensureTrainingCampaign();
  const health = await getTrainingSendingHealth(TRAINING_READY_RESERVE_TARGET);
  let scheduler = null;
  let schedulerError: string | null = null;
  try {
    const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const job = jobs.find(j => j.taskUid === campaign.schedulerTaskUid);
    if (
      job &&
      job.callbackPath === TRAINING_CALLBACK &&
      isManagedTrainingCron(job.cronExpression)
    )
      scheduler = job;
    else
      schedulerError = campaign.schedulerTaskUid
        ? "Linked Training scheduler has an unexpected callback or cadence."
        : "Not scheduled. Publish and verify the update before activating Training.";
  } catch {
    schedulerError =
      "Scheduler status is temporarily unavailable; sending readiness cannot be verified.";
  }
  const { researchWebhookUrl: _privateUrl, ...safeCampaign } = health.campaign;
  const launchAuthorized = Boolean(
    campaign.listApprovedAt && campaign.launchApprovedAt
  );
  const researchConfigured = Boolean(campaign.researchWebhookUrl);
  const nightlyResearchScheduled = scheduler?.cronExpression === TRAINING_CRON;
  const nightlyResearchEnabled =
    nightlyResearchScheduled &&
    scheduler?.isEnable === true &&
    campaign.status === "active";
  const researchScheduleNote =
    scheduler && !nightlyResearchScheduled
      ? "Nightly research is pending schedule: the linked daytime-only job has no 1 AM America/Chicago tick. Daily sending remains at 9 AM Central."
      : null;
  const sendingReady = Boolean(
    launchAuthorized &&
      scheduler &&
      passwordConfigured() &&
      researchConfigured &&
      campaign.runtimeVersion === TRAINING_RUNTIME_VERSION
  );
  return {
    runtimeVersion: TRAINING_RUNTIME_VERSION,
    cadenceVersion: "seven-day-v1",
    sendDays: "every_day",
    campaignStatus: campaign.status,
    launchAuthorized,
    schedulerTaskUid: campaign.schedulerTaskUid,
    scheduler,
    schedulerState: scheduler
      ? scheduler.isEnable
        ? "enabled"
        : "paused"
      : "not-linked",
    schedulerError,
    transportConfigured: passwordConfigured(),
    readyCount: health.readyInitialCount,
    eligibleReviewCount: health.sourceBackedDraftCount,
    qualifiedCount: health.qualifiedCount,
    totalProspectCount: health.totalProspectCount,
    evidenceNeeded: health.evidenceNeededCount,
    bufferTarget: TRAINING_READY_RESERVE_TARGET,
    refillThreshold: OUTREACH_INITIAL_REFILL_START_BELOW,
    replenishmentPolicyVersion: OUTREACH_REPLENISHMENT_POLICY_VERSION,
    publicSupplyNotice: OUTREACH_PUBLIC_SUPPLY_NOTICE,
    lowSupply: health.readyInitialCount < OUTREACH_INITIAL_REFILL_START_BELOW,
    dailyNewLimit: campaign.dailyNewLimit,
    health: { ...health, campaign: safeCampaign },
    cadence:
      "10 new contacts every Central calendar day at 9 AM, including weekends; follow-ups are due 4 and then 5 business days after actual accepted prior sends.",
    requestedCron: TRAINING_CRON,
    callbackPath: TRAINING_CONTROL_CALLBACK,
    researchConfigured,
    nightlyResearchScheduled,
    nightlyResearchScheduleState: nightlyResearchScheduled
      ? nightlyResearchEnabled
        ? "enabled"
        : "paused"
      : scheduler
        ? "pending-schedule"
        : "unavailable",
    researchScheduleNote,
    nextResearchAt: nightlyResearchEnabled
      ? getNextOutreachResearchAt(now)
      : null,
    researchTaskUid: campaign.researchTaskUid,
    lastResearchRequestAt: campaign.researchLastRequestedAt,
    ...getNextTrainingScheduleTimes(now),
    sendingReady,
    caveats: [
      schedulerError,
      researchScheduleNote,
      !researchConfigured
        ? "Research replenishment is not connected yet."
        : null,
      health.lowSupply
        ? `Verified reserve is ${health.readyInitialCount}/${TRAINING_READY_RESERVE_TARGET}; records missing email evidence, qualification or conflict clearance remain blocked.`
        : null,
      health.claimedForReviewCount
        ? `${health.claimedForReviewCount} uncertain messages are held for SMTP-state review; they will not be resent automatically.`
        : null,
    ].filter(Boolean),
  };
}
export async function prepareTrainingBatch() {
  return prepareTrainingReadyReserve(TRAINING_READY_RESERVE_TARGET);
}
export async function scanTrainingReplies() {
  const c = await ensureTrainingCampaign();
  return checkTrainingInbox({ campaignId: c.id });
}

/** Resume only an already linked, verified Training job; never create or alter another campaign's job. */
export async function setTrainingSending(input: { enabled: boolean }) {
  const db = await database();
  const campaign = await ensureTrainingCampaign();
  if (!input.enabled) {
    await db
      .update(trainingOutreachCampaigns)
      .set({ status: "paused" })
      .where(eq(trainingOutreachCampaigns.id, campaign.id));
    if (campaign.schedulerTaskUid) {
      const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
      const job = jobs.find(j => j.taskUid === campaign.schedulerTaskUid);
      if (!job || job.callbackPath !== TRAINING_CALLBACK)
        throw new Error(
          "Sending is paused in the app, but the Training job could not be verified. No other job was changed."
        );
      await updateHeartbeatJob(job.taskUid, { enable: false }, "");
    }
    return { enabled: false, campaignStatus: "paused" as const };
  }
  if (
    !campaign.listApprovedAt ||
    !campaign.launchApprovedAt ||
    !campaign.autoEnroll ||
    !campaign.autoApproveQualifiedProspects
  )
    throw new Error(
      "Training launch and source-backed auto-approval must be authorized first."
    );
  if (!passwordConfigured() || !campaign.physicalPostalAddress?.trim())
    throw new Error("Sender transport and postal address are required.");
  if (!campaign.researchWebhookUrl)
    throw new Error(
      "Connect verified prospect-research replenishment before activating Training."
    );
  if (!campaign.schedulerTaskUid)
    throw new Error(
      "Publish the update, then link its authenticated Training scheduler before activation."
    );
  const deployed = await fetch(
    "https://jeristotleproductions.com/api/trpc/training.operations",
    { signal: AbortSignal.timeout(10000) }
  );
  const payload = await deployed.json();
  if (
    !deployed.ok ||
    payload?.result?.data?.json?.runtimeVersion !== TRAINING_RUNTIME_VERSION
  )
    throw new Error(
      "Publish and verify the Training sending runtime before activation."
    );
  const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  const job = jobs.find(j => j.taskUid === campaign.schedulerTaskUid);
  if (
    !job ||
    job.callbackPath !== TRAINING_CALLBACK ||
    !isManagedTrainingCron(job.cronExpression)
  )
    throw new Error(
      "Training scheduler ownership or cadence does not match; no job was changed."
    );
  const health = await getTrainingSendingHealth(TRAINING_READY_RESERVE_TARGET);
  if (
    health.sentInitialCount === 0 &&
    health.readyInitialCount < TRAINING_READY_RESERVE_TARGET
  )
    throw new Error(
      `The first launch requires ${TRAINING_READY_RESERVE_TARGET} verified, approved initial contacts in reserve; public supply is not guaranteed.`
    );
  await updateHeartbeatJob(job.taskUid, { enable: true }, "");
  await db
    .update(trainingOutreachCampaigns)
    .set({ status: "active", runtimeVersion: TRAINING_RUNTIME_VERSION })
    .where(eq(trainingOutreachCampaigns.id, campaign.id));
  return { enabled: true, campaignStatus: "active" as const };
}

/** Lead outcome is separate from email delivery. Not Closed always requires a reason. */
export async function updateTrainingLeadOutcome(input: {
  prospectId: number;
  leadOutcome: "closed" | "not_closed" | null;
  notClosedReason?: string | null;
}) {
  const db = await database();
  const campaign = await ensureTrainingCampaign();
  const [prospect] = await db
    .select()
    .from(trainingOutreachProspects)
    .where(
      and(
        eq(trainingOutreachProspects.id, input.prospectId),
        eq(trainingOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Training prospect was not found");
  const reason = input.notClosedReason?.trim() || null;
  if (input.leadOutcome === "not_closed" && !reason)
    throw new Error("A nonempty reason is required for a Not Closed outcome.");
  if (input.leadOutcome !== "not_closed" && reason)
    throw new Error(
      "Not Closed reason can be recorded only with a Not Closed outcome."
    );
  await db
    .update(trainingOutreachProspects)
    .set({
      leadOutcome: input.leadOutcome,
      notClosedReason: input.leadOutcome === "not_closed" ? reason : null,
    })
    .where(
      and(
        eq(trainingOutreachProspects.id, prospect.id),
        eq(trainingOutreachProspects.campaignId, campaign.id)
      )
    );
  await db.insert(trainingOutreachEvents).values({
    campaignId: campaign.id,
    prospectId: prospect.id,
    eventType:
      input.leadOutcome === "closed"
        ? "lead_closed"
        : input.leadOutcome === "not_closed"
          ? "lead_not_closed"
          : "lead_outcome_cleared",
    detail:
      input.leadOutcome === "not_closed"
        ? `Not Closed: ${reason}`
        : input.leadOutcome === "closed"
          ? "Closed outcome recorded."
          : "Lead outcome cleared.",
    metadataJson: JSON.stringify({
      leadOutcome: input.leadOutcome,
      notClosedReason: input.leadOutcome === "not_closed" ? reason : null,
      deliveryStateUnchanged: true,
    }),
  });
  return { success: true } as const;
}
