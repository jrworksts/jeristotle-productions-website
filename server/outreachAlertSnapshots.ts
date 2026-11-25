import {
  and,
  desc,
  eq,
  getTableColumns,
  gte,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { getDb } from "./db";
import { listHeartbeatJobs, type HeartbeatJobInfo } from "./_core/heartbeat";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import {
  OUTREACH_MAINTENANCE_CRON,
  OUTREACH_NIGHTLY_MAINTENANCE_CRON,
  OUTREACH_LEGACY_CRON,
  OUTREACH_PREVIOUS_WEEKDAY_CRON,
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
  OUTREACH_REFILL_START_BELOW,
} from "../shared/outreachMaintenance";
import {
  BRAND_VIDEO_CAMPAIGN_SLUG,
  BRAND_VIDEO_MAINTENANCE_CRON,
} from "../shared/brandVideoOutreach";
import { CREDIT_UNION_CAMPAIGN_SLUG } from "../shared/creditUnionOutreach";
import {
  TRAINING_OUTREACH_CAMPAIGN_SLUG,
  TRAINING_MAINTENANCE_CRON,
  TRAINING_NIGHTLY_MAINTENANCE_CRON,
} from "../shared/trainingOutreach";
import {
  HUSTLE_SLUG,
  HUSTLE_CALLBACK,
  HUSTLE_CRON,
  HUSTLE_LAUNCH_CRON,
} from "../shared/hustleOutreach";
import {
  SECTOR_GROUP_SLUG,
  SECTOR_KEYS,
  SECTOR_DEFINITIONS,
} from "../shared/sectorOutreach";
import type {
  OutreachAlertSnapshot,
  OutreachCampaignKey,
} from "../shared/outreachAlerts";
import {
  readOutreachAlertExclusions,
  readOutreachAlertReady,
} from "./outreachAlertReadiness";
import { nextOutreachAlertRefillOpportunity } from "./outreachAlertRefill";

// Compatibility is alert-only: preserve current native definitions until the
// parent publishes and updates the SAME stored campaign UIDs. Never accept a
// cron just because it parses, nor another sector's minute stagger.
const CURRENT_HALF_HOURLY_OVERNIGHT_CRON = "0 0,30 6,7,13-23 * * *";
const SECTOR_ALERT_CRONS = {
  tourism: [
    "0 0,10,20,30,40,50 6,7,14-22 * * *",
    "0 0,10,20,30,40,50 6-11,14-22 * * *",
  ],
  real_estate: [
    "0 2,12,22,32,42,52 6,7,14-22 * * *",
    "0 2,12,22,32,42,52 6-11,14-22 * * *",
  ],
  industrial: [
    "0 4,14,24,34,44,54 6,7,14-22 * * *",
    "0 4,14,24,34,44,54 6-11,14-22 * * *",
  ],
  healthcare: [
    "0 6,16,26,36,46,56 6,7,14-22 * * *",
    "0 6,16,26,36,46,56 6-11,14-22 * * *",
  ],
} as const;

/** All nine current pipelines; adding a pipeline requires a read-only source here. */
export const OUTREACH_ALERT_CAMPAIGNS = [
  {
    key: "chamber",
    label: "Chamber outreach",
    slug: "united-chamber-2027-brand-refresh",
    campaigns: schema.chamberOutreachCampaigns,
    messages: schema.chamberOutreachMessages,
    runs: schema.chamberOutreachDailyRuns,
    events: schema.chamberOutreachEvents,
    taskField: "dailyTaskUid",
    startField: "activatedAt",
    acceptedField: "sentAt",
    callback: "/api/scheduled/chamber-outreach",
    crons: [
      OUTREACH_MAINTENANCE_CRON,
      OUTREACH_NIGHTLY_MAINTENANCE_CRON,
      CURRENT_HALF_HOURLY_OVERNIGHT_CRON,
      OUTREACH_PREVIOUS_WEEKDAY_CRON,
      OUTREACH_LEGACY_CRON,
    ],
  },
  {
    key: "credit_union",
    label: "Credit-union outreach",
    slug: CREDIT_UNION_CAMPAIGN_SLUG,
    campaigns: schema.creditUnionCampaigns,
    messages: schema.creditUnionMessages,
    runs: schema.creditUnionDailyRuns,
    events: schema.creditUnionEvents,
    taskField: "dailyScheduleTaskUid",
    startField: "configApprovedAt",
    acceptedField: "smtpAcceptedAt",
    callback: "/api/scheduled/credit-union-outreach",
    crons: [
      OUTREACH_MAINTENANCE_CRON,
      OUTREACH_NIGHTLY_MAINTENANCE_CRON,
      OUTREACH_PREVIOUS_WEEKDAY_CRON,
    ],
  },
  {
    key: "brand_video",
    label: "Brand Video outreach",
    slug: BRAND_VIDEO_CAMPAIGN_SLUG,
    campaigns: schema.brandVideoCampaigns,
    messages: schema.brandVideoMessages,
    runs: schema.brandVideoDailyRuns,
    events: schema.brandVideoEvents,
    taskField: "dailyScheduleTaskUid",
    startField: "configApprovedAt",
    acceptedField: "smtpAcceptedAt",
    callback: "/api/scheduled/brand-video-outreach",
    crons: [BRAND_VIDEO_MAINTENANCE_CRON, OUTREACH_NIGHTLY_MAINTENANCE_CRON],
  },
  {
    key: "training",
    label: "Training & Knowledge Capture",
    slug: TRAINING_OUTREACH_CAMPAIGN_SLUG,
    campaigns: schema.trainingOutreachCampaigns,
    messages: schema.trainingOutreachMessages,
    runs: schema.trainingOutreachDailyRuns,
    events: schema.trainingOutreachEvents,
    taskField: "schedulerTaskUid",
    startField: "launchApprovedAt",
    acceptedField: "smtpAcceptedAt",
    callback: "/api/scheduled/training-outreach",
    crons: [
      TRAINING_MAINTENANCE_CRON,
      TRAINING_NIGHTLY_MAINTENANCE_CRON,
      CURRENT_HALF_HOURLY_OVERNIGHT_CRON,
      OUTREACH_NIGHTLY_MAINTENANCE_CRON,
      OUTREACH_PREVIOUS_WEEKDAY_CRON,
    ],
  },
  {
    key: "hustle",
    label: "Corpus Christi Hustle sponsorship",
    slug: HUSTLE_SLUG,
    campaigns: schema.hustleCampaigns,
    messages: schema.hustleMessages,
    runs: null,
    events: schema.hustleEvents,
    taskField: "schedulerTaskUid",
    startField: "launchApprovedAt",
    acceptedField: "smtpAcceptedAt",
    callback: HUSTLE_CALLBACK,
    crons: [
      HUSTLE_CRON,
      HUSTLE_LAUNCH_CRON,
      "0 8,38 6,7,13-23 * * *",
      "0 8,38 6-11,13-23 * * *",
    ],
  },
  ...SECTOR_KEYS.map(key => ({
    key,
    label: SECTOR_DEFINITIONS.find(d => d.key === key)!.name,
    slug: SECTOR_GROUP_SLUG,
    campaigns: schema.sectorOutreachCampaigns,
    messages: schema.sectorOutreachMessages,
    runs: null,
    events: schema.sectorOutreachEvents,
    taskField: "schedulerTaskUid",
    startField: "approvalAt",
    acceptedField: "smtpAcceptedAt",
    callback: "/api/scheduled/sector-outreach",
    crons: [
      ...SECTOR_ALERT_CRONS[key],
      HUSTLE_LAUNCH_CRON,
      "0 8,38 6,7,13-23 * * *",
      CURRENT_HALF_HOURLY_OVERNIGHT_CRON,
      OUTREACH_NIGHTLY_MAINTENANCE_CRON,
    ],
  })),
] as const;

export function outreachAlertDayBounds(now: Date) {
  const local = getOutreachLocalMoment(now);
  const toUtc = (year: number, month: number, day: number) => {
    const target = Date.UTC(year, month - 1, day, 0, 0, 0);
    let value = target;
    for (let i = 0; i < 4; i++) {
      const p = getOutreachLocalMoment(new Date(value));
      const correction =
        target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      value += correction;
      if (!correction) break;
    }
    return new Date(value);
  };
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return {
    localDate: local.dateKey,
    start: toUtc(local.year, local.month, local.day),
    end: toUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate()
    ),
  };
}
async function heartbeatInventory(): Promise<HeartbeatJobInfo[] | null> {
  try {
    const jobs: HeartbeatJobInfo[] = [];
    for (let page = 1; page <= 5; page++) {
      const result = await listHeartbeatJobs("", { page, pageSize: 100 });
      jobs.push(...result.jobs);
      if (jobs.length >= result.total) return jobs;
      if (!result.jobs.length) return null;
    }
  } catch {
    /* Inventory failure is unknown, not disabled or empty. */
  }
  return null;
}
function count(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  )
    throw new Error("OUTREACH_COUNT_UNAVAILABLE");
  return Math.floor(Number(value));
}

/** Direct SELECTs only. Never imports a workspace initializer, inbox, prepare or send helper. */
export async function loadOutreachAlertSnapshots(
  now = new Date()
): Promise<OutreachAlertSnapshot[]> {
  const db = await getDb();
  if (!db) throw new Error("OUTREACH_HEALTH_DATABASE_UNAVAILABLE");
  const [jobs, exclusionsResult] = await Promise.all([
    heartbeatInventory(),
    readOutreachAlertExclusions(db).then(
      value => ({ value }),
      () => ({ value: null })
    ),
  ]);
  const bounds = outreachAlertDayBounds(now);
  const staleBefore = new Date(now.getTime() - 5 * 60000);
  return Promise.all(
    OUTREACH_ALERT_CAMPAIGNS.map(async definition => {
      const d: any = definition;
      const sector = SECTOR_KEYS.includes(d.key);
      const base: OutreachAlertSnapshot = {
        key: d.key,
        label: d.label,
        campaignStatus: "unknown",
        weekdaysOnly: false,
        dailyLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
        requestedDailyLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
        persistedReserveTarget: null,
        desiredReserve: OUTREACH_READY_BUFFER_TARGET,
        refillThreshold: OUTREACH_REFILL_START_BELOW,
        readyCount: null,
        readinessVerified: false,
        newAccepted: 0,
        followupAccepted: 0,
        uncertainCount: 0,
        schedulerState: "unavailable",
        runStatus: null,
        runDate: null,
        runUpdatedAt: null,
        lastMaintenanceFailureAt: null,
        lastMaintenanceSuccessAt: null,
        startsAt: null,
        researchState: "unavailable",
        lastVerifiedSendAt: null,
        nextRefillOpportunityAt: null,
        researchLeaseUntil: null,
      };
      let knownStatus = "unknown";
      try {
        const c: any = d.campaigns;
        // Never fetch campaign secrets; only bound task UID plus safe configuration/timestamps.
        const campaignFields: Record<string, any> = {
          id: c.id,
          status: c.status,
          createdAt: c.createdAt,
          dailyNewLimit:
            c.dailyNewLimit ?? sql<number>`${OUTREACH_DAILY_NEW_CONTACT_LIMIT}`,
          reserveTarget: c.reserveTarget ?? sql<null>`null`,
          taskUid: c[d.taskField],
          startsAt: c[d.startField] ?? c.createdAt,
          lastInboxCheckAt:
            c.lastReplyCheckAt ?? c.lastInboxScanAt ?? sql<null>`null`,
          researchLeaseUntil:
            c.researchLeaseUntil ?? c.researchLeaseExpiresAt ?? sql<null>`null`,
          researchRequestedAt:
            c.researchRequestedAt ??
            c.researchLastRequestedAt ??
            sql<null>`null`,
        };
        let group: any = null;
        if (sector) {
          const g = schema.sectorOutreachGroups;
          [group] = await db
            .select({
              id: g.id,
              status: g.status,
              sendingEnabled: g.sendingEnabled,
              approvalAt: g.approvalAt,
              researchLeaseUntil: g.researchLeaseUntil,
              researchRequestedAt: g.researchRequestedAt,
            })
            .from(g)
            .where(eq(g.slug, SECTOR_GROUP_SLUG))
            .limit(1);
          if (!group)
            return {
              ...base,
              campaignStatus: "not_configured",
              schedulerState: "not_linked",
            };
        }
        const [campaign] = await db
          .select(campaignFields)
          .from(c)
          .where(
            sector
              ? and(eq(c.groupId, group.id), eq(c.campaignKey, d.key))
              : eq(c.slug, d.slug)
          )
          .limit(1);
        if (!campaign)
          return {
            ...base,
            campaignStatus: "not_configured",
            schedulerState: "not_linked",
          };
        knownStatus =
          sector &&
          (group.status !== "active" ||
            !group.sendingEnabled ||
            !group.approvalAt)
            ? "paused"
            : campaign.status;
        const taskUid = campaign.taskUid;
        const job = jobs?.find(j => j.taskUid === taskUid);
        const schedulerState = !jobs
          ? "unavailable"
          : !taskUid || !job
            ? "not_linked"
            : job.callbackPath !== d.callback ||
                !d.crons.includes(job.cronExpression)
              ? "invalid"
              : job.isEnable
                ? "enabled"
                : "disabled";
        const scope = (t: any) =>
          sector
            ? and(eq(t.groupId, group.id), eq(t.campaignKey, d.key))
            : eq(t.campaignId, campaign.id);
        const m: any = d.messages,
          e: any = d.events,
          acceptedColumn = m[d.acceptedField],
          step = sector ? m.messageNumber : m.sequenceStep;
        const eventColumns: any = getTableColumns(e);
        const metadata = eventColumns.metadataJson;
        const researchFields = {
          eventType: e.eventType,
          occurredAt: e.occurredAt,
          state: metadata
            ? sql<
                string | null
              >`CASE WHEN JSON_VALID(${metadata}) THEN JSON_UNQUOTE(JSON_EXTRACT(${metadata}, '$.state')) ELSE NULL END`
            : sql<null>`null`,
          leaseMs: metadata
            ? sql<
                string | null
              >`CASE WHEN JSON_VALID(${metadata}) THEN JSON_UNQUOTE(JSON_EXTRACT(${metadata}, '$.leaseExpiresAt')) ELSE NULL END`
            : sql<null>`null`,
        };
        const receiptChecks =
          d.key === "chamber"
            ? [isNotNull(m.providerMessageId), eq(m.status, "sent")]
            : [];
        const attempt = m.sendAttemptedAt ?? m.attemptedAt;
        const uncertain =
          d.key === "chamber"
            ? and(
                scope(m),
                eq(m.status, "failed"),
                isNull(m.sentAt),
                gte(m.updatedAt, bounds.start),
                lt(m.updatedAt, staleBefore)
              )
            : and(
                scope(m),
                isNull(acceptedColumn),
                isNotNull(attempt),
                gte(attempt, bounds.start),
                lt(attempt, staleBefore)
              );
        if (!exclusionsResult.value)
          throw new Error("OUTREACH_IDENTITY_STATE_UNKNOWN");
        const [
          receipts,
          readiness,
          uncertainRows,
          run,
          failure,
          success,
          latestSend,
          research,
        ] = await Promise.all([
          db
            .select({
              initial: sql<number>`COALESCE(SUM(CASE WHEN ${step} = ${sector ? 1 : 0} THEN 1 ELSE 0 END), 0)`,
              followup: sql<number>`COALESCE(SUM(CASE WHEN ${step} > ${sector ? 1 : 0} THEN 1 ELSE 0 END), 0)`,
            })
            .from(m)
            .where(
              and(
                scope(m),
                gte(acceptedColumn, bounds.start),
                lt(acceptedColumn, bounds.end),
                ...receiptChecks
              )
            ),
          readOutreachAlertReady(
            db,
            d.key,
            sector ? group.id : campaign.id,
            exclusionsResult.value,
            now
          ),
          db
            .select({ count: sql<number>`count(*)` })
            .from(m)
            .where(uncertain),
          d.runs
            ? db
                .select({
                  status: d.runs.status,
                  runDate: d.runs.runDate,
                  updatedAt: d.runs.updatedAt,
                })
                .from(d.runs)
                .where(
                  and(
                    eq(d.runs.campaignId, campaign.id),
                    eq(d.runs.runDate, bounds.localDate)
                  )
                )
                .limit(1)
            : Promise.resolve([]),
          db
            .select({ at: e.occurredAt })
            .from(e)
            .where(
              and(
                scope(e),
                eq(e.eventType, "maintenance_failed"),
                gte(e.occurredAt, bounds.start)
              )
            )
            .orderBy(desc(e.occurredAt))
            .limit(1),
          db
            .select({ at: e.occurredAt })
            .from(e)
            .where(
              and(
                scope(e),
                eq(e.eventType, "maintenance_complete"),
                gte(e.occurredAt, bounds.start)
              )
            )
            .orderBy(desc(e.occurredAt))
            .limit(1),
          db
            .select({ at: acceptedColumn })
            .from(m)
            .where(and(scope(m), isNotNull(acceptedColumn), ...receiptChecks))
            .orderBy(desc(acceptedColumn))
            .limit(1),
          db
            .select(researchFields)
            .from(e)
            .where(
              and(
                sector
                  ? eq(e.groupId, group.id)
                  : eq(e.campaignId, campaign.id),
                sql`${e.eventType} IN ('research_replenishment','research_exhausted','research_requested','research_webhook_requested','research_webhook_uncertain','research_request_uncertain','research_finished','research_import','research_import_batch')`
              )
            )
            .orderBy(desc(e.occurredAt))
            .limit(1),
        ]);
        const recordedLeaseMs = Number(research[0]?.leaseMs);
        const eventLease =
          research[0]?.state === "running" &&
          Number.isFinite(recordedLeaseMs) &&
          recordedLeaseMs > now.getTime()
            ? new Date(recordedLeaseMs)
            : null;
        const campaignLease = sector
          ? group.researchLeaseUntil
          : campaign.researchLeaseUntil;
        const lease =
          eventLease && (!campaignLease || eventLease > campaignLease)
            ? eventLease
            : campaignLease;
        const pendingLease = lease instanceof Date && lease > now;
        const event = research[0]?.eventType;
        return {
          ...base,
          campaignStatus: knownStatus,
          weekdaysOnly: job
            ? job.cronExpression.trim().split(/\s+/).slice(-1)[0] === "1-5"
            : false,
          dailyLimit: count(campaign.dailyNewLimit),
          persistedReserveTarget:
            campaign.reserveTarget == null
              ? null
              : count(campaign.reserveTarget),
          startsAt: sector
            ? group.approvalAt || campaign.createdAt
            : campaign.startsAt || campaign.createdAt,
          schedulerState,
          newAccepted: count(receipts[0]?.initial),
          followupAccepted: count(receipts[0]?.followup),
          readyCount: readiness.readyCount,
          readinessVerified: true,
          uncertainCount: count(uncertainRows[0]?.count),
          runStatus: run[0]?.status || null,
          runDate: run[0]?.runDate || null,
          runUpdatedAt: run[0]?.updatedAt || null,
          lastMaintenanceFailureAt: failure[0]?.at || null,
          lastMaintenanceSuccessAt: success[0]?.at || null,
          lastInboxCheckAt: campaign.lastInboxCheckAt || null,
          schedulerLastExecutedAt: job?.lastExecutedAt
            ? new Date(job.lastExecutedAt)
            : null,
          researchLeaseUntil: lease || null,
          nextRefillOpportunityAt:
            schedulerState === "enabled"
              ? nextOutreachAlertRefillOpportunity(
                  job!.cronExpression,
                  now,
                  lease
                )
              : null,
          researchState: pendingLease
            ? "pending"
            : event === "research_exhausted" ||
                research[0]?.state === "exhausted"
              ? "exhausted"
              : readiness.sourceHoldCount > 0
                ? "source_holds"
                : "not_requested",
          lastVerifiedSendAt: latestSend[0]?.at || null,
        } as OutreachAlertSnapshot;
      } catch {
        return { ...base, campaignStatus: knownStatus, readError: true };
      }
    })
  );
}
