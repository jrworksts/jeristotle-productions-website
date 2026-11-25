import type { HeartbeatJobInfo } from "./_core/heartbeat";
import { listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";
import { prepareAutomatedNewProspects } from "./outreachAutomation";
import {
  getCampaignForAutomation,
  getOutreachQueueHealth,
  updateOutreachCampaign,
} from "./outreachDb";
import { checkOutreachReplies } from "./outreachInbox";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_LEGACY_CRON,
  OUTREACH_MAINTENANCE_CRON,
  OUTREACH_NIGHTLY_MAINTENANCE_CRON,
  OUTREACH_PREVIOUS_WEEKDAY_CRON,
  OUTREACH_READY_BUFFER_TARGET,
  getNextOutreachResearchAt,
} from "../shared/outreachMaintenance";

/**
 * These task UIDs are deployment-owned identifiers. They are intentionally not
 * accepted from the public portal: controls can only operate on this Chamber
 * campaign's persisted daily task, and only when it matches this sender.
 */
export const CHAMBER_DAILY_OUTREACH_TASK_UID = "jvsxD5yijFFF9tmKduyPpD";
export const CHAMBER_SATURDAY_RECAP_TASK_UID = "HPDDLt7tPBV5Dhaw6FEUB3";
export const CHAMBER_OUTREACH_TIME_ZONE = "America/Chicago";
export const CHAMBER_DAILY_OUTREACH_CRON = OUTREACH_NIGHTLY_MAINTENANCE_CRON;
export const CHAMBER_DAILY_OUTREACH_CALLBACK =
  "/api/scheduled/chamber-outreach";

const HEARTBEAT_PAGE = { page: 1, pageSize: 100 } as const;

function isDailyMaintenanceCron(cron: string) {
  return (
    cron === CHAMBER_DAILY_OUTREACH_CRON || cron === OUTREACH_MAINTENANCE_CRON || cron === "0 0,30 6,7,13-23 * * *"
  );
}

function isManagedCron(cron: string) {
  return (
    isDailyMaintenanceCron(cron) ||
    cron === OUTREACH_PREVIOUS_WEEKDAY_CRON ||
    cron === OUTREACH_LEGACY_CRON
  );
}

function resumedDailyCron(cron: string) {
  // An ordinary toggle is not authorization to migrate the nightly schedule.
  // Preserve the existing weekday-to-daytime upgrade for older Chamber jobs.
  return isDailyMaintenanceCron(cron) ? cron : OUTREACH_MAINTENANCE_CRON;
}

export type OutreachHeartbeatHealth = {
  isEnable: boolean;
  lastExecutedAt: Date | null;
  nextExecutionAt: Date | null;
  cronExpression: string;
};

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
};

function getLocalParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

/**
 * Converts a non-ambiguous local business-hour time to UTC. Iterating through
 * Intl's rendered local parts makes this apply the correct Central offset on
 * either side of daylight-saving time without shipping an offset table.
 */
function localTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = getLocalParts(new Date(timestamp), timeZone);
    const representedAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      0
    );
    const correction = targetAsUtc - representedAsUtc;
    if (correction === 0) break;
    timestamp += correction;
  }
  return new Date(timestamp);
}

function nextLocalWeekdayHour(options: {
  now: Date;
  hour: number;
  timeZone: string;
  allowedWeekdays: number[];
}): Date {
  const local = getLocalParts(options.now, options.timeZone);
  const candidateDay = new Date(
    Date.UTC(local.year, local.month - 1, local.day)
  );

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const candidate = new Date(candidateDay);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    if (!options.allowedWeekdays.includes(candidate.getUTCDay())) continue;
    const scheduled = localTimeToUtc(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth() + 1,
      candidate.getUTCDate(),
      options.hour,
      options.timeZone
    );
    if (scheduled.getTime() > options.now.getTime()) return scheduled;
  }

  throw new Error("Could not calculate the next Chamber outreach schedule");
}

/**
 * Reports the next actual local operating windows rather than the heartbeat's
 * UTC catch-all hours (13,14,15). The latter intentionally has one skipped
 * hour around each DST season.
 */
export function getNextOutreachScheduleTimes(
  now: Date,
  options: { timeZone?: string; sendHourLocal?: number } = {}
) {
  const timeZone = options.timeZone ?? CHAMBER_OUTREACH_TIME_ZONE;
  const sendHourLocal = options.sendHourLocal ?? 9;
  return {
    nextPreparationAt: nextLocalWeekdayHour({
      now,
      hour: sendHourLocal - 1,
      timeZone,
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    }),
    nextSendAt: nextLocalWeekdayHour({
      now,
      hour: sendHourLocal,
      timeZone,
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    }),
    nextRecapAt: nextLocalWeekdayHour({
      now,
      hour: 10,
      timeZone: CHAMBER_OUTREACH_TIME_ZONE,
      allowedWeekdays: [6],
    }),
  };
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getNextOutreachMaintenanceAt(
  now: Date,
  timeZone = CHAMBER_OUTREACH_TIME_ZONE
) {
  const local = getLocalParts(now, timeZone);
  const firstDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(firstDay);
    day.setUTCDate(day.getUTCDate() + offset);
    for (let hour = 8; hour <= 17; hour++) {
      const onHour = localTimeToUtc(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        hour,
        timeZone
      );
      for (const minutes of [0, 30]) {
        const tick = new Date(onHour.getTime() + minutes * 60_000);
        if (tick > now) return tick;
      }
    }
  }
  throw new Error("Could not calculate the next maintenance window");
}

function heartbeatHealth(
  taskUid: string | null,
  job: HeartbeatJobInfo | undefined
): OutreachHeartbeatHealth | null {
  if (!taskUid || !job) return null;
  return {
    isEnable: job.isEnable,
    lastExecutedAt: toDate(job.lastExecutedAt),
    nextExecutionAt: toDate(job.nextExecutionAt),
    cronExpression: job.cronExpression,
  };
}

function transportIsConfigured(): boolean {
  // Do not verify or expose a credential from a public health query. SMTP and
  // IMAP use the same application password in this deployment.
  return Boolean(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS);
}

async function getScopedCampaign() {
  const campaign = await getCampaignForAutomation();
  if (!campaign) throw new Error("Chamber outreach campaign is unavailable");
  return campaign;
}

function hasManagedDailyTask(campaign: { dailyTaskUid: string | null }) {
  return campaign.dailyTaskUid === CHAMBER_DAILY_OUTREACH_TASK_UID;
}

async function getManagedDailyTask() {
  const campaign = await getScopedCampaign();
  if (!hasManagedDailyTask(campaign)) {
    throw new Error(
      "Chamber daily sender is not linked to the managed deployed heartbeat"
    );
  }

  const heartbeatPage = await listHeartbeatJobs("", HEARTBEAT_PAGE);
  const job = heartbeatPage.jobs.find(
    item => item.taskUid === CHAMBER_DAILY_OUTREACH_TASK_UID
  );
  if (!job) {
    throw new Error("Managed Chamber daily heartbeat is unavailable");
  }
  if (job.callbackPath !== CHAMBER_DAILY_OUTREACH_CALLBACK) {
    throw new Error(
      "Managed Chamber daily heartbeat has an unexpected callback"
    );
  }
  if (!isManagedCron(job.cronExpression)) {
    throw new Error(
      "Managed Chamber daily heartbeat has an unexpected schedule"
    );
  }
  return { campaign, job };
}

/**
 * Public status is deliberately a bounded view: just this campaign's daily
 * sender and its existing Saturday recap. Scheduler failures are rendered as
 * unavailable rather than making the entire public portal query fail.
 */
export async function getOutreachOperations(now = new Date()) {
  let campaign:
    | Awaited<ReturnType<typeof getCampaignForAutomation>>
    | undefined;
  try {
    campaign = await getCampaignForAutomation();
  } catch {
    campaign = undefined;
  }

  const schedule = getNextOutreachScheduleTimes(now, {
    timeZone: campaign?.timezone || CHAMBER_OUTREACH_TIME_ZONE,
    sendHourLocal: campaign?.sendHourLocal || 9,
  });
  const dailyTaskUid =
    campaign && hasManagedDailyTask(campaign)
      ? CHAMBER_DAILY_OUTREACH_TASK_UID
      : null;
  // The recap is read-only here. Its UID is deployment-owned and deliberately
  // fixed so legacy campaign rows that did not persist recapTaskUid still get
  // an accurate status; no mutation below can ever touch this task.
  const recapTaskUid = CHAMBER_SATURDAY_RECAP_TASK_UID;

  try {
    const heartbeatPage = await listHeartbeatJobs("", HEARTBEAT_PAGE);
    const sender = heartbeatHealth(
      dailyTaskUid,
      heartbeatPage.jobs.find(item => item.taskUid === dailyTaskUid)
    );
    const recap = heartbeatHealth(
      recapTaskUid,
      heartbeatPage.jobs.find(item => item.taskUid === recapTaskUid)
    );
    const senderCronIsExpected = isManagedCron(sender?.cronExpression || "");
    const queueHealth = await getOutreachQueueHealth(now);
    const senderCallbackIsExpected =
      heartbeatPage.jobs.find(item => item.taskUid === dailyTaskUid)
        ?.callbackPath === CHAMBER_DAILY_OUTREACH_CALLBACK;
    const nightlyResearchScheduled =
      senderCallbackIsExpected &&
      sender?.cronExpression === CHAMBER_DAILY_OUTREACH_CRON;
    const nightlyResearchEnabled =
      nightlyResearchScheduled &&
      sender?.isEnable === true &&
      campaign?.status === "active";
    return {
      campaignStatus: campaign?.status ?? "unknown",
      cadenceVersion: "seven-day-v1",
      sendDays: "every_day",
      dailyNewLimit:
        campaign?.dailyNewLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      sender,
      recap,
      queueHealth,
      bufferTarget: OUTREACH_READY_BUFFER_TARGET,
      continuousMaintenanceEnabled:
        senderCallbackIsExpected &&
        isDailyMaintenanceCron(sender?.cronExpression || ""),
      requestedCron: CHAMBER_DAILY_OUTREACH_CRON,
      nightlyResearchScheduled,
      nightlyResearchScheduleState: nightlyResearchScheduled
        ? nightlyResearchEnabled
          ? "enabled"
          : "paused"
        : senderCronIsExpected && senderCallbackIsExpected
          ? "pending-schedule"
          : "unavailable",
      researchScheduleNote:
        !nightlyResearchScheduled &&
        senderCronIsExpected &&
        senderCallbackIsExpected
          ? "Nightly research is pending schedule: the linked daytime-only job has no 1 AM America/Chicago tick. Daily sending time is unchanged."
          : null,
      nextResearchAt: nightlyResearchEnabled
        ? getNextOutreachResearchAt(now)
        : null,
      transportConfigured: transportIsConfigured(),
      serverNow: now,
      ...schedule,
      ...(senderCallbackIsExpected &&
      isDailyMaintenanceCron(sender?.cronExpression || "")
        ? { nextPreparationAt: getNextOutreachMaintenanceAt(now) }
        : {}),
      statusUnavailable: !campaign
        ? "Campaign status is temporarily unavailable."
        : !dailyTaskUid || !sender
          ? "Daily sender status is unavailable."
          : !senderCronIsExpected
            ? "Daily sender schedule is not the managed Chamber schedule."
            : !senderCallbackIsExpected
              ? "Daily sender callback is not the managed Chamber endpoint."
              : recapTaskUid && !recap
                ? "Saturday recap status is unavailable."
                : null,
    };
  } catch {
    return {
      campaignStatus: campaign?.status ?? "unknown",
      dailyNewLimit:
        campaign?.dailyNewLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      sender: null,
      recap: null,
      queueHealth: null,
      bufferTarget: OUTREACH_READY_BUFFER_TARGET,
      continuousMaintenanceEnabled: false,
      requestedCron: CHAMBER_DAILY_OUTREACH_CRON,
      nightlyResearchScheduled: false,
      nightlyResearchScheduleState: "unavailable",
      researchScheduleNote: null,
      nextResearchAt: null,
      transportConfigured: transportIsConfigured(),
      serverNow: now,
      ...schedule,
      statusUnavailable: "Scheduler status is temporarily unavailable.",
    };
  }
}

async function restoreCampaignStatus(status: "review" | "paused" | "active") {
  await updateOutreachCampaign({ status });
}

function isControllableCampaignStatus(
  status: string
): status is "review" | "paused" | "active" {
  return status === "review" || status === "paused" || status === "active";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function rollbackOrExplainFailure(options: {
  priorStatus: "review" | "paused" | "active";
  schedulerError: unknown;
  failureState: "paused" | "active";
}) {
  try {
    await restoreCampaignStatus(options.priorStatus);
  } catch (rollbackError) {
    throw new Error(
      `Scheduler update failed: ${errorMessage(options.schedulerError)}. Campaign remains ${options.failureState} because rollback to ${options.priorStatus} failed: ${errorMessage(rollbackError)}`
    );
  }
  throw options.schedulerError;
}

/**
 * Enables or pauses only the existing, persisted Chamber daily sender. There
 * is no public input for task UIDs, cron expressions, recipients, or SMTP
 * configuration, and the Saturday recap is never mutated.
 */
export async function setOutreachSending(input: { enabled: boolean }) {
  const { campaign, job } = await getManagedDailyTask();

  if (!isControllableCampaignStatus(campaign.status)) {
    throw new Error(
      "The Chamber campaign must be in review, paused, or active before its sender can be controlled"
    );
  }
  const priorStatus = campaign.status;

  if (input.enabled) {
    // Avoid invoking the campaign activation gate for an already healthy
    // campaign. It is important because approvals may have been consumed by
    // a prior send and do not need reapproval merely to render a no-op toggle.
    if (
      campaign.status === "active" &&
      job.isEnable &&
      isDailyMaintenanceCron(job.cronExpression)
    ) {
      return {
        enabled: true,
        changed: false,
        campaignStatus: campaign.status,
        schedulerEnabled: true,
      } as const;
    }

    if (!transportIsConfigured()) {
      throw new Error(
        "Gmail sender is not configured; sending cannot be resumed"
      );
    }

    if (campaign.status === "active") {
      await updateHeartbeatJob(
        CHAMBER_DAILY_OUTREACH_TASK_UID,
        { enable: true, cron: resumedDailyCron(job.cronExpression) },
        ""
      );
      return {
        enabled: true,
        changed: true,
        campaignStatus: campaign.status,
        schedulerEnabled: true,
      } as const;
    }

    // updateOutreachCampaign("active") validates postal address and the
    // existing initial-message approval gate before the heartbeat is resumed.
    await updateOutreachCampaign({ status: "active" });
    try {
      await updateHeartbeatJob(
        CHAMBER_DAILY_OUTREACH_TASK_UID,
        { enable: true, cron: resumedDailyCron(job.cronExpression) },
        ""
      );
    } catch (error) {
      if (priorStatus !== "active") {
        await rollbackOrExplainFailure({
          priorStatus,
          schedulerError: error,
          failureState: "active",
        });
      }
      throw error;
    }
    return {
      enabled: true,
      changed: true,
      campaignStatus: "active",
      schedulerEnabled: true,
    } as const;
  }

  if (campaign.status === "paused" && !job.isEnable) {
    return {
      enabled: false,
      changed: false,
      campaignStatus: campaign.status,
      schedulerEnabled: false,
    } as const;
  }

  const campaignChanged = campaign.status !== "paused";
  if (campaignChanged) {
    // Pause persistence first. A heartbeat firing between these two operations
    // will observe paused status and cannot send.
    await updateOutreachCampaign({ status: "paused" });
  }
  try {
    if (job.isEnable) {
      await updateHeartbeatJob(
        CHAMBER_DAILY_OUTREACH_TASK_UID,
        { enable: false },
        ""
      );
    }
  } catch (error) {
    // Do not undo an explicit stop request. Even if the scheduler still fires,
    // the persisted pause keeps the handler from sending additional messages.
    throw new Error(
      `Sending is paused in the app. The scheduler could not be disabled: ${errorMessage(error)}. Refresh status and retry pause to synchronize it.`
    );
  }

  return {
    enabled: false,
    changed: campaignChanged || job.isEnable,
    campaignStatus: "paused",
    schedulerEnabled: false,
  } as const;
}

/**
 * Creates/refreshes approved drafts only. It intentionally has no weekday or
 * active-status gate: manual preparation is useful before a future send, but
 * this path never invokes an SMTP sender.
 */
export async function prepareOutreachBatch(now = new Date()) {
  const campaign = await getScopedCampaign();
  if (!isControllableCampaignStatus(campaign.status)) {
    throw new Error(
      "The Chamber campaign must be in review, paused, or active before preparing drafts"
    );
  }
  const prepared = await prepareAutomatedNewProspects(
    OUTREACH_READY_BUFFER_TARGET,
    now
  );
  return {
    prepared: true,
    readyCount: prepared.available.length,
    researchFailures: prepared.researchFailures,
    preparedAt: now,
  } as const;
}

/** Checks the configured inbox and records reply/suppression state; it sends no mail. */
export async function scanOutreachReplies(now = new Date()) {
  const result = await checkOutreachReplies(now);
  return {
    ...result,
    checkedAt: now,
  } as const;
}
