import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  brandVideoCampaigns,
  brandVideoProspects,
  brandVideoMessages,
  brandVideoEvents,
} from "../drizzle/schema";
import {
  BRAND_VIDEO_DRAFT_VERSION,
  BRAND_VIDEO_TIME_ZONE,
  BRAND_VIDEO_RUNTIME_VERSION,
  BRAND_VIDEO_MAINTENANCE_CRON,
  BRAND_VIDEO_CALLBACK,
  getNextBrandVideoScheduleTimes,
  BRAND_VIDEO_SEND_CADENCE,
} from "../shared/brandVideoOutreach";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
} from "../shared/outreachMaintenance";
import { OUTREACH_INITIAL_REFILL_START_BELOW, OUTREACH_REPLENISHMENT_POLICY_VERSION, OUTREACH_PUBLIC_SUPPLY_NOTICE } from "../shared/outboundReplenishmentPolicy";
import {
  createHeartbeatJob,
  listHeartbeatJobs,
  updateHeartbeatJob,
} from "./_core/heartbeat";
import {
  ensureBrandVideoCampaign,
  getBrandVideoWorkspace,
  getBrandVideoCrossCampaignConflict,
} from "./brandVideoOutreach";
import { getDb } from "./db";
import {
  getBrandVideoSendingHealth,
  prepareBrandVideoReadyReserve,
  hasBrandVideoSourceBackedTarget,
  hasValidBrandVideoSequence,
} from "./brandVideoSendingDb";
import { checkBrandVideoInbox } from "./brandVideoInbox";
export { BRAND_VIDEO_CALLBACK } from "../shared/brandVideoOutreach";
export const BRAND_VIDEO_CRON = BRAND_VIDEO_MAINTENANCE_CRON;
const passwordConfigured = () =>
  Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

/** Records user-approved list/config and approves the complete reviewed list; never schedules or sends. */
export async function authorizeBrandVideoLaunch() {
  const db = await database();
  const workspace = await getBrandVideoWorkspace();
  const campaign = workspace.campaign;
  // An existing authorization never resurrects a terminal contact or alters an in-flight sequence.
  if (campaign.listApprovedAt && campaign.configApprovedAt) return campaign;
  if (campaign.status === "active")
    throw new Error("Pause Brand Video before approving its launch list.");
  if (!workspace.prospects.length)
    throw new Error(
      "No researched Brand Video list is available for approval."
    );
  for (const prospect of workspace.prospects) {
    const sequence = workspace.messages.filter(
      message => message.prospectId === prospect.id
    );
    if (
      !hasBrandVideoSourceBackedTarget(prospect) ||
      prospect.draftVersion !== BRAND_VIDEO_DRAFT_VERSION ||
      prospect.firstSentAt ||
      prospect.lastSentAt ||
      !["review", "approved"].includes(prospect.status) ||
      !["draft", "approved"].includes(prospect.outreachStatus) ||
      !hasValidBrandVideoSequence(
        sequence,
        prospect.status === "review" ? "draft" : "approved"
      )
    )
      throw new Error(
        `Launch approval blocked: ${prospect.businessName} lacks exactly three current unsent drafts or qualified public-source evidence.`
      );
    const conflict = await getBrandVideoCrossCampaignConflict(prospect);
    if (conflict)
      throw new Error(
        `Launch approval blocked: ${prospect.businessName}: ${conflict}`
      );
  }
  const identities = new Set<string>();
  for (const prospect of workspace.prospects) {
    for (const identity of [
      `email:${prospect.primaryEmail}`,
      `business:${prospect.normalizedBusiness}`,
      ...(prospect.normalizedDomain
        ? [`domain:${prospect.normalizedDomain}`]
        : []),
    ]) {
      if (identities.has(identity))
        throw new Error(
          "Brand Video launch list contains duplicate identities."
        );
      identities.add(identity);
    }
  }
  const now = new Date();
  await db.transaction(async tx => {
    // Conditional full-row snapshots fence edits between validation and atomic approval.
    for (const prospect of workspace.prospects) {
      const [approved] = await tx
        .update(brandVideoProspects)
        .set({ status: "approved", outreachStatus: "approved", updatedAt: now })
        .where(
          and(
            eq(brandVideoProspects.id, prospect.id),
            eq(brandVideoProspects.campaignId, campaign.id),
            eq(brandVideoProspects.status, prospect.status),
            eq(brandVideoProspects.outreachStatus, prospect.outreachStatus),
            eq(brandVideoProspects.updatedAt, prospect.updatedAt),
            isNull(brandVideoProspects.firstSentAt),
            eq(brandVideoProspects.primaryEmail, prospect.primaryEmail),
            eq(
              brandVideoProspects.primaryEmailSourceUrl,
              prospect.primaryEmailSourceUrl
            ),
            eq(brandVideoProspects.draftVersion, BRAND_VIDEO_DRAFT_VERSION),
            eq(brandVideoProspects.qualified, 1),
            eq(brandVideoProspects.sourcesJson, prospect.sourcesJson),
            eq(
              brandVideoProspects.verifiedObservation,
              prospect.verifiedObservation
            ),
            eq(brandVideoProspects.videoAngle, prospect.videoAngle),
            eq(brandVideoProspects.videoScenes, prospect.videoScenes),
            isNull(brandVideoProspects.crossCampaignBlock)
          )
        );
      if (Number(approved.affectedRows) !== 1)
        throw new Error(
          "Brand Video list changed during approval; no approval was committed."
        );
      for (const message of workspace.messages.filter(
        message => message.prospectId === prospect.id
      )) {
        const [updated] = await tx
          .update(brandVideoMessages)
          .set({ status: "approved", updatedAt: now })
          .where(
            and(
              eq(brandVideoMessages.id, message.id),
              eq(brandVideoMessages.campaignId, campaign.id),
              eq(brandVideoMessages.status, message.status),
              eq(brandVideoMessages.updatedAt, message.updatedAt),
              eq(brandVideoMessages.subject, message.subject),
              eq(brandVideoMessages.textBody, message.textBody),
              eq(brandVideoMessages.htmlBody, message.htmlBody),
              isNull(brandVideoMessages.sendAttemptedAt),
              isNull(brandVideoMessages.smtpAcceptedAt)
            )
          );
        if (Number(updated.affectedRows) !== 1)
          throw new Error(
            "Brand Video draft changed during approval; no approval was committed."
          );
      }
      await tx.insert(brandVideoEvents).values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        eventType: "sequence_approved",
        detail:
          "User approved the sourced three-message Brand Video launch sequence.",
        occurredAt: now,
      });
    }
    const [approved] = await tx
      .update(brandVideoCampaigns)
      .set({
        listApprovedAt: now,
        configApprovedAt: now,
        autoApproveQualifiedProspects: 1,
        dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
        sendHourLocal: 9,
        timezone: BRAND_VIDEO_TIME_ZONE,
        status: "paused",
        sequenceConfig: JSON.stringify({
          dayOffsets: [0, 4, 9],
          rollWeekends: false,
          maxActiveContactsPerOrganization: 1,
        }),
        notes: `User authorized Brand Video launch on October 19, 2026. ${BRAND_VIDEO_DRAFT_VERSION}; ten NEW contacts EVERY DAY at 9 AM Central, including weekends; Days 5/10 follow-ups at calendar offsets 4/9. Future imports auto-approve only after they meet public-source email, local-fit, current-draft, and no-cross-campaign-conflict checks. Twenty-contact source-backed reserve. No guesses, manual catch-up, or pre-deployment sending.`,
      })
      .where(
        and(
          eq(brandVideoCampaigns.id, campaign.id),
          eq(brandVideoCampaigns.updatedAt, campaign.updatedAt)
        )
      );
    if (Number(approved.affectedRows) !== 1)
      throw new Error("Brand Video campaign changed during approval.");
  });
  return ensureBrandVideoCampaign();
}

export async function getBrandVideoOperations(now = new Date()) {
  const workspace = await getBrandVideoWorkspace();
  const campaign = workspace.campaign;
  const health = await getBrandVideoSendingHealth();
  let scheduler = null;
  let schedulerError: string | null = null;
  try {
    const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const job = jobs.find(job => job.taskUid === campaign.dailyScheduleTaskUid);
    if (
      job &&
      job.callbackPath === BRAND_VIDEO_CALLBACK &&
      job.cronExpression === BRAND_VIDEO_CRON
    )
      scheduler = job;
    else
      schedulerError = campaign.dailyScheduleTaskUid
        ? "Linked brand-video scheduler is unavailable or has an unexpected callback/schedule."
        : "Not scheduled yet. Publish the update, then enable brand-video sending.";
  } catch {
    schedulerError = "Scheduler status is temporarily unavailable.";
  }
  const ready = health.readyInitialCount;
  const eligible = health.sourceBackedDraftCount;
  return {
    runtimeVersion: BRAND_VIDEO_RUNTIME_VERSION,
    campaignStatus: campaign.status,
    launchAuthorized: Boolean(
      campaign.listApprovedAt && campaign.configApprovedAt
    ),
    scheduler,
    schedulerError,
    transportConfigured: passwordConfigured(),
    readyCount: ready,
    eligibleReviewCount: eligible,
    qualifiedCount: health.qualifiedCount,
    totalProspectCount: health.totalProspectCount,
    evidenceNeeded: health.evidenceNeededCount,
    bufferTarget: OUTREACH_READY_BUFFER_TARGET,
    refillThreshold: OUTREACH_INITIAL_REFILL_START_BELOW,
    replenishmentPolicyVersion: OUTREACH_REPLENISHMENT_POLICY_VERSION,
    publicSupplyNotice: OUTREACH_PUBLIC_SUPPLY_NOTICE,
    lowSupply: ready < OUTREACH_INITIAL_REFILL_START_BELOW,
    dailyNewLimit: campaign.dailyNewLimit,
    health,
    ...getNextBrandVideoScheduleTimes(now, health.latestRun?.runDate),
    cadence: BRAND_VIDEO_SEND_CADENCE,
    requestedCron: BRAND_VIDEO_CRON,
    callbackPath: BRAND_VIDEO_CALLBACK,
    lastInboxCheck:
      workspace.events.find(e => e.eventType === "reply_check") || null,
    lastRun: health.latestRun,
  };
}

export async function prepareBrandVideoBatch() {
  return prepareBrandVideoReadyReserve(OUTREACH_READY_BUFFER_TARGET);
}

export async function scanBrandVideoReplies() {
  const campaign = await ensureBrandVideoCampaign();
  return checkBrandVideoInbox({ campaignId: campaign.id });
}

/** Fixed campaign scope: no caller-controlled paths, recipients, task IDs, or cadence. */
export async function setBrandVideoSending(input: { enabled: boolean }) {
  const db = await database();
  let campaign = await ensureBrandVideoCampaign();
  if (!input.enabled) {
    // Persist pause first. Scheduler failures must never undo a stop request.
    await db
      .update(brandVideoCampaigns)
      .set({ status: "paused" })
      .where(eq(brandVideoCampaigns.id, campaign.id));
    if (campaign.dailyScheduleTaskUid) {
      const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
      const job = jobs.find(j => j.taskUid === campaign.dailyScheduleTaskUid);
      if (!job || job.callbackPath !== BRAND_VIDEO_CALLBACK)
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
    "https://jeristotleproductions.com/api/trpc/brandVideo.operations",
    { signal: AbortSignal.timeout(10_000) }
  );
  const deployedPayload = await deployed.json();
  if (
    !deployed.ok ||
    deployedPayload?.result?.data?.json?.runtimeVersion !==
      BRAND_VIDEO_RUNTIME_VERSION
  ) {
    throw new Error(
      "Publish the brand-video sending update before enabling its scheduler."
    );
  }
  if (campaign.status === "active") {
    // Fail closed during scheduler synchronization, including an already-active campaign.
    await db
      .update(brandVideoCampaigns)
      .set({ status: "paused" })
      .where(eq(brandVideoCampaigns.id, campaign.id));
  }
  campaign = await authorizeBrandVideoLaunch();
  let uid = campaign.dailyScheduleTaskUid;
  if (uid) {
    const { jobs } = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
    const job = jobs.find(j => j.taskUid === uid);
    if (!job || job.callbackPath !== BRAND_VIDEO_CALLBACK)
      throw new Error("Brand Video scheduler does not match this campaign");
    await updateHeartbeatJob(uid, { enable: true, cron: BRAND_VIDEO_CRON }, "");
  } else {
    const provisioning = `provisioning-${randomUUID()}`;
    await db
      .update(brandVideoCampaigns)
      .set({ dailyScheduleTaskUid: provisioning })
      .where(
        and(
          eq(brandVideoCampaigns.id, campaign.id),
          isNull(brandVideoCampaigns.dailyScheduleTaskUid)
        )
      );
    const [claimed] = await db
      .select()
      .from(brandVideoCampaigns)
      .where(eq(brandVideoCampaigns.id, campaign.id))
      .limit(1);
    if (claimed?.dailyScheduleTaskUid !== provisioning)
      throw new Error(
        "Another sender setup is already in progress. Refresh status; no duplicate job was created."
      );
    let job;
    try {
      job = await createHeartbeatJob(
        {
          name: `brand-video-outreach-${campaign.id}`,
          cron: BRAND_VIDEO_CRON,
          path: BRAND_VIDEO_CALLBACK,
          description:
            "Brand Video campaign: reply checks and verified-queue maintenance every half hour during Central business hours; ten new daily introductions at 9 AM plus due follow-ups. Brand Video only; no other campaign is changed.",
        },
        ""
      );
    } catch (error) {
      await db
        .update(brandVideoCampaigns)
        .set({ dailyScheduleTaskUid: null })
        .where(
          and(
            eq(brandVideoCampaigns.id, campaign.id),
            eq(brandVideoCampaigns.dailyScheduleTaskUid, provisioning)
          )
        );
      throw error;
    }
    uid = job.taskUid;
    try {
      await db
        .update(brandVideoCampaigns)
        .set({ dailyScheduleTaskUid: uid })
        .where(
          and(
            eq(brandVideoCampaigns.id, campaign.id),
            eq(brandVideoCampaigns.dailyScheduleTaskUid, provisioning)
          )
        );
    } catch (error) {
      await updateHeartbeatJob(uid, { enable: false }, "");
      throw error;
    }
  }
  await db
    .update(brandVideoCampaigns)
    .set({ status: "active" })
    .where(eq(brandVideoCampaigns.id, campaign.id));
  return { enabled: true, campaignStatus: "active" };
}
