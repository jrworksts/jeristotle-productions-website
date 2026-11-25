import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { creditUnionCampaigns } from "../drizzle/schema";
import { CREDIT_UNION_DRAFT_VERSION } from "../shared/creditUnionOutreach";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_MAINTENANCE_CRON,
} from "../shared/outreachMaintenance";
import {
  CREDIT_UNION_REPLENISHMENT_POLICY_VERSION,
  CREDIT_UNION_PROACTIVE_RESERVE_TARGET as OUTREACH_READY_BUFFER_TARGET,
  CREDIT_UNION_PROACTIVE_REFILL_THRESHOLD,
} from "../shared/outboundReplenishmentPolicy";
import {
  createHeartbeatJob,
  listHeartbeatJobs,
  updateHeartbeatJob,
} from "./_core/heartbeat";
import {
  ensureCreditUnionCampaign,
  getCreditUnionWorkspace,
} from "./creditUnionOutreach";
import { getDb } from "./db";
import {
  getCreditUnionSendingHealth,
  prepareCreditUnionReadyReserve,
} from "./creditUnionSendingDb";
import { checkCreditUnionInbox } from "./creditUnionInbox";
import {
  getNextOutreachMaintenanceAt,
  getNextOutreachScheduleTimes,
} from "./outreachControls";

export const CREDIT_UNION_CALLBACK = "/api/scheduled/credit-union-outreach";
export const CREDIT_UNION_CRON = OUTREACH_MAINTENANCE_CRON;
const passwordConfigured = () =>
  Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

/** Records the approved fixed configuration but does not schedule or send mail. */
export async function authorizeCreditUnionLaunch() {
  const db = await database();
  const campaign = await ensureCreditUnionCampaign();
  await db
    .update(creditUnionCampaigns)
    .set({
      listApprovedAt: campaign.listApprovedAt || new Date(),
      configApprovedAt: campaign.configApprovedAt || new Date(),
      dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      sendHourLocal: 9,
      timezone: "America/Chicago",
      status: campaign.status === "active" ? "active" : "paused",
      notes: `Jeremy authorized credit-union outreach on October 11, 2026. Use ${CREDIT_UNION_DRAFT_VERSION}, South Texas first, ten new contacts every Central day plus Days 4/9 follow-ups. Missing or uncertain emails stay blocked. No manual catch-up sends.`,
    })
    .where(eq(creditUnionCampaigns.id, campaign.id));
  return ensureCreditUnionCampaign();
}

export async function getCreditUnionOperations(now = new Date()) {
  const workspace = await getCreditUnionWorkspace();
  const campaign = workspace.campaign;
  const health = await getCreditUnionSendingHealth();
  let scheduler = null;
  let schedulerError: string | null = null;
  try {
    const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const job = jobs.find(job => job.taskUid === campaign.dailyScheduleTaskUid);
    if (
      job &&
      job.callbackPath === CREDIT_UNION_CALLBACK &&
      job.cronExpression === CREDIT_UNION_CRON
    )
      scheduler = job;
    else
      schedulerError = campaign.dailyScheduleTaskUid
        ? "Linked credit-union scheduler is unavailable or has an unexpected callback/schedule."
        : "Not scheduled yet. Publish the update, then enable credit-union sending.";
  } catch {
    schedulerError = "Scheduler status is temporarily unavailable.";
  }
  const ready = health.readyInitialCount;
  const eligible = workspace.prospects.filter(p => p.readiness.ready).length;
  return {
    runtimeVersion: "credit-union-sending-v1",
    cadenceVersion: "seven-day-v1",
    sendDays: "every_day",
    requestedCron: CREDIT_UNION_CRON,
    campaignStatus: campaign.status,
    launchAuthorized: Boolean(
      campaign.listApprovedAt && campaign.configApprovedAt
    ),
    scheduler,
    schedulerError,
    transportConfigured: passwordConfigured(),
    readyCount: ready,
    eligibleReviewCount: eligible,
    verificationNeeded: workspace.stats.verificationNeeded,
    bufferTarget: OUTREACH_READY_BUFFER_TARGET,
    replenishmentPolicyVersion: CREDIT_UNION_REPLENISHMENT_POLICY_VERSION,
    refillThreshold: CREDIT_UNION_PROACTIVE_REFILL_THRESHOLD,
    departmentalFallbackAllowed: true,
    lowSupply: ready < CREDIT_UNION_PROACTIVE_REFILL_THRESHOLD,
    dailyNewLimit: campaign.dailyNewLimit,
    health,
    nextMaintenanceAt: getNextOutreachMaintenanceAt(now),
    ...getNextOutreachScheduleTimes(now),
    lastInboxCheck:
      workspace.events.find(e => e.eventType === "reply_check") || null,
    lastRun: health.latestRun,
  };
}

export async function prepareCreditUnionBatch() {
  return prepareCreditUnionReadyReserve(OUTREACH_READY_BUFFER_TARGET);
}

export async function scanCreditUnionReplies() {
  const campaign = await ensureCreditUnionCampaign();
  return checkCreditUnionInbox({ campaignId: campaign.id });
}

/** Fixed campaign scope: no caller-controlled paths, recipients, task IDs, or cadence. */
export async function setCreditUnionSending(input: { enabled: boolean }) {
  const db = await database();
  let campaign = await ensureCreditUnionCampaign();
  if (!input.enabled) {
    // Persist pause first. Scheduler failures must never undo a stop request.
    await db
      .update(creditUnionCampaigns)
      .set({ status: "paused" })
      .where(eq(creditUnionCampaigns.id, campaign.id));
    if (campaign.dailyScheduleTaskUid) {
      const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
      const job = jobs.find(j => j.taskUid === campaign.dailyScheduleTaskUid);
      if (!job || job.callbackPath !== CREDIT_UNION_CALLBACK)
        throw new Error(
          "Sending is paused in the app, but scheduler could not be verified. No other campaign was changed."
        );
      await updateHeartbeatJob(job.taskUid, { enable: false }, "");
    }
    return { enabled: false, campaignStatus: "paused" };
  }
  if (!passwordConfigured())
    throw new Error("Gmail transport is not configured");
  if (!campaign.physicalPostalAddress?.trim())
    throw new Error("Sender postal address is required");
  const deployed = await fetch(
    "https://jeristotleproductions.com/api/trpc/creditUnion.operations",
    { signal: AbortSignal.timeout(10_000) }
  );
  const deployedPayload = await deployed.json();
  if (
    !deployed.ok ||
    deployedPayload?.result?.data?.json?.runtimeVersion !==
      "credit-union-sending-v1"
  ) {
    throw new Error(
      "Publish the credit-union sending update before enabling its scheduler."
    );
  }
  if (campaign.status === "active") {
    // Fail closed during scheduler synchronization, including an already-active campaign.
    await db
      .update(creditUnionCampaigns)
      .set({ status: "paused" })
      .where(eq(creditUnionCampaigns.id, campaign.id));
  }
  campaign = await authorizeCreditUnionLaunch();
  let uid = campaign.dailyScheduleTaskUid;
  if (uid) {
    const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const job = jobs.find(j => j.taskUid === uid);
    if (!job || job.callbackPath !== CREDIT_UNION_CALLBACK)
      throw new Error("Credit-union scheduler does not match this campaign");
    await updateHeartbeatJob(
      uid,
      { enable: true, cron: CREDIT_UNION_CRON },
      ""
    );
  } else {
    const provisioning = `provisioning-${randomUUID()}`;
    await db
      .update(creditUnionCampaigns)
      .set({ dailyScheduleTaskUid: provisioning })
      .where(
        and(
          eq(creditUnionCampaigns.id, campaign.id),
          isNull(creditUnionCampaigns.dailyScheduleTaskUid)
        )
      );
    const [claimed] = await db
      .select()
      .from(creditUnionCampaigns)
      .where(eq(creditUnionCampaigns.id, campaign.id))
      .limit(1);
    if (claimed?.dailyScheduleTaskUid !== provisioning)
      throw new Error(
        "Another sender setup is already in progress. Refresh status; no duplicate job was created."
      );
    let job;
    try {
      job = await createHeartbeatJob(
        {
          name: `credit-union-outreach-${campaign.id}`,
          cron: CREDIT_UNION_CRON,
          path: CREDIT_UNION_CALLBACK,
          description:
            "Credit-union campaign: reply checks and verified-queue maintenance every half hour during Central business hours every day; ten new introductions at 9 AM Central every day plus due follow-ups. Included in the existing Saturday recap.",
        },
        ""
      );
    } catch (error) {
      await db
        .update(creditUnionCampaigns)
        .set({ dailyScheduleTaskUid: null })
        .where(
          and(
            eq(creditUnionCampaigns.id, campaign.id),
            eq(creditUnionCampaigns.dailyScheduleTaskUid, provisioning)
          )
        );
      throw error;
    }
    uid = job.taskUid;
    try {
      await db
        .update(creditUnionCampaigns)
        .set({ dailyScheduleTaskUid: uid })
        .where(eq(creditUnionCampaigns.id, campaign.id));
    } catch (error) {
      await updateHeartbeatJob(uid, { enable: false }, "");
      throw error;
    }
  }
  await db
    .update(creditUnionCampaigns)
    .set({ status: "active" })
    .where(eq(creditUnionCampaigns.id, campaign.id));
  return { enabled: true, campaignStatus: "active" };
}
