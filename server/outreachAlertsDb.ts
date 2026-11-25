import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  gte,
  notInArray,
  sql,
} from "drizzle-orm";
import {
  outreachAlertMonitors,
  outreachDeliveryAlerts,
} from "../drizzle/schema";
import { getDb } from "./db";
import type {
  OutreachAlertIssue,
  OutreachAlertSnapshot,
  OutreachCampaignKey,
} from "../shared/outreachAlerts";
export const OUTREACH_ALERT_MONITOR_SLUG =
  "jeristotle-outreach-delivery-alerts";
async function database() {
  const db = await getDb();
  if (!db) throw new Error("OUTREACH_ALERT_DATABASE_UNAVAILABLE");
  return db;
}
export async function getOutreachAlertMonitor(
  taskUid?: string
): Promise<typeof outreachAlertMonitors.$inferSelect | null> {
  const db = await database();
  const conditions = [
    eq(outreachAlertMonitors.slug, OUTREACH_ALERT_MONITOR_SLUG),
  ];
  if (taskUid)
    conditions.push(eq(outreachAlertMonitors.scheduleCronTaskUid, taskUid));
  return (
    (
      await db
        .select()
        .from(outreachAlertMonitors)
        .where(and(...conditions))
        .limit(1)
    )[0] || null
  );
}
export async function stageOutreachAlertMonitor() {
  const db = await database();
  await db
    .insert(outreachAlertMonitors)
    .values({ slug: OUTREACH_ALERT_MONITOR_SLUG })
    .onDuplicateKeyUpdate({
      set: { slug: sql`${outreachAlertMonitors.slug}` },
    });
  return getOutreachAlertMonitor();
}
export function outreachIncidentKey(
  issue: OutreachAlertIssue,
  localDate: string
) {
  return `${localDate}:${issue.campaignKey}:${issue.kind}`;
}
export async function upsertOutreachAlert(
  issue: OutreachAlertIssue,
  localDate: string,
  now: Date
) {
  const db = await database();
  if (issue.kind === "ready_new_empty") {
    return db.transaction(async tx => {
      // Existing monitor row serializes episode creation without any new schema.
      const lock = await tx
        .select({ id: outreachAlertMonitors.id })
        .from(outreachAlertMonitors)
        .where(eq(outreachAlertMonitors.slug, OUTREACH_ALERT_MONITOR_SLUG))
        .for("update");
      if (lock.length !== 1) throw new Error("OUTREACH_ALERT_MONITOR_REQUIRED");
      const [prior] = await tx
        .select()
        .from(outreachDeliveryAlerts)
        .where(
          and(
            eq(outreachDeliveryAlerts.campaignKey, issue.campaignKey),
            eq(outreachDeliveryAlerts.kind, "ready_new_empty")
          )
        )
        .orderBy(desc(outreachDeliveryAlerts.id))
        .limit(1);
      const dedupeKey =
        prior && !prior.resolvedAt
          ? prior.dedupeKey
          : outreachEmptyEpisodeKey(issue.campaignKey, prior?.id ?? 0);
      const values = {
        dedupeKey,
        campaignKey: issue.campaignKey,
        localDate,
        kind: issue.kind,
        label: issue.label,
        detail: issue.detail,
        newAccepted: issue.newAccepted,
        followupAccepted: issue.followupAccepted,
        readyCount: issue.readyCount,
        updatedAt: now,
      };
      await tx
        .insert(outreachDeliveryAlerts)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            detail: values.detail,
            newAccepted: values.newAccepted,
            followupAccepted: values.followupAccepted,
            readyCount: values.readyCount,
            updatedAt: now,
          },
        });
      const [row] = await tx
        .select()
        .from(outreachDeliveryAlerts)
        .where(eq(outreachDeliveryAlerts.dedupeKey, dedupeKey))
        .limit(1);
      if (!row || row.resolvedAt)
        throw new Error("OUTREACH_EMPTY_EPISODE_UNAVAILABLE");
      return row;
    });
  }
  const dedupeKey = outreachIncidentKey(issue, localDate);
  const values = {
    dedupeKey,
    campaignKey: issue.campaignKey,
    localDate,
    kind: issue.kind,
    label: issue.label,
    detail: issue.detail,
    newAccepted: issue.newAccepted,
    followupAccepted: issue.followupAccepted,
    readyCount: issue.readyCount,
    resolvedAt: null,
    updatedAt: now,
  };
  await db
    .insert(outreachDeliveryAlerts)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        detail: values.detail,
        newAccepted: values.newAccepted,
        followupAccepted: values.followupAccepted,
        readyCount: values.readyCount,
        resolvedAt: null,
        updatedAt: now,
      },
    });
  return (
    await db
      .select()
      .from(outreachDeliveryAlerts)
      .where(eq(outreachDeliveryAlerts.dedupeKey, dedupeKey))
      .limit(1)
  )[0]!;
}
export async function claimOutreachAlert(
  id: number,
  channel: "email" | "owner",
  now: Date
) {
  const db = await database();
  const state =
    channel === "email"
      ? outreachDeliveryAlerts.emailState
      : outreachDeliveryAlerts.ownerState;
  const patch =
    channel === "email"
      ? {
          emailState: "sending" as const,
          emailAttemptedAt: now,
          updatedAt: now,
        }
      : { ownerState: "sending" as const, updatedAt: now };
  const [r] = await db
    .update(outreachDeliveryAlerts)
    .set(patch)
    .where(
      and(
        eq(outreachDeliveryAlerts.id, id),
        eq(state, "pending"),
        isNull(outreachDeliveryAlerts.resolvedAt)
      )
    );
  return Number(r.affectedRows || 0) === 1;
}
export async function patchOutreachAlert(
  id: number,
  patch: Partial<typeof outreachDeliveryAlerts.$inferInsert>
) {
  const db = await database();
  await db
    .update(outreachDeliveryAlerts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(outreachDeliveryAlerts.id, id));
}
export async function recoverStaleOutreachAlertClaims(now: Date) {
  const db = await database();
  const before = new Date(now.getTime() - 5 * 60000);
  await db
    .update(outreachDeliveryAlerts)
    .set({ emailState: "uncertain", updatedAt: now })
    .where(
      and(
        eq(outreachDeliveryAlerts.emailState, "sending"),
        lt(outreachDeliveryAlerts.emailAttemptedAt, before)
      )
    );
  await db
    .update(outreachDeliveryAlerts)
    .set({ ownerState: "uncertain", updatedAt: now })
    .where(
      and(
        eq(outreachDeliveryAlerts.ownerState, "sending"),
        lt(outreachDeliveryAlerts.updatedAt, before)
      )
    );
}
export async function resolveOutreachAlerts(
  activeKeys: string[],
  now: Date,
  trustworthyCampaigns: OutreachCampaignKey[]
) {
  if (!trustworthyCampaigns.length) return;
  const db = await database();
  const conditions = [
    isNull(outreachDeliveryAlerts.resolvedAt),
    inArray(outreachDeliveryAlerts.campaignKey, trustworthyCampaigns),
    ne(outreachDeliveryAlerts.kind, "ready_new_empty"),
  ];
  if (activeKeys.length)
    conditions.push(notInArray(outreachDeliveryAlerts.dedupeKey, activeKeys));
  await db
    .update(outreachDeliveryAlerts)
    .set({ resolvedAt: now, updatedAt: now })
    .where(and(...conditions));
}
export async function recentOutreachAlerts() {
  const db = await database();
  return db
    .select()
    .from(outreachDeliveryAlerts)
    .orderBy(desc(outreachDeliveryAlerts.createdAt))
    .limit(30);
}
export async function markOutreachMonitorCheck(
  id: number,
  now: Date,
  errorCode: string | null = null
) {
  const db = await database();
  await db
    .update(outreachAlertMonitors)
    .set({ lastCheckedAt: now, lastErrorCode: errorCode, updatedAt: now })
    .where(eq(outreachAlertMonitors.id, id));
}

type Monitor = NonNullable<Awaited<ReturnType<typeof getOutreachAlertMonitor>>>;
type Baseline = {
  status: string;
  activeSince: string | null;
  weekdaysOnly?: boolean;
};
export function outreachCampaignBaselines(
  monitor: Monitor,
  snapshots: OutreachAlertSnapshot[],
  now: Date
) {
  let baselines: Record<string, Baseline> = {};
  try {
    const parsed = JSON.parse(monitor.campaignBaselinesJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      baselines = parsed;
  } catch {
    /* Safe fresh baseline, never retrospective alerts. */
  }
  const result = snapshots.map(snapshot => {
    if (snapshot.readError || snapshot.campaignStatus === "unknown")
      return snapshot;
    const prior = baselines[snapshot.key];
    const active = snapshot.campaignStatus === "active";
    // Legacy baselines were weekday-only except Brand Video. A new weekend
    // schedule activated after 9 AM must not create a retroactive missed batch.
    const cadenceChanged =
      prior?.status === "active" &&
      (prior.weekdaysOnly ?? snapshot.key !== "brand_video") !==
        snapshot.weekdaysOnly;
    const activeSince = active
      ? !cadenceChanged &&
        prior?.status === "active" &&
        prior.activeSince &&
        Number.isFinite(new Date(prior.activeSince).getTime())
        ? prior.activeSince
        : (prior ? now : monitor.activatedAt || now).toISOString()
      : null;
    baselines[snapshot.key] = {
      status: snapshot.campaignStatus,
      activeSince,
      weekdaysOnly: snapshot.weekdaysOnly,
    };
    const baselineAt = activeSince ? new Date(activeSince) : null;
    const startsAt =
      baselineAt && (!snapshot.startsAt || baselineAt > snapshot.startsAt)
        ? baselineAt
        : snapshot.startsAt;
    return { ...snapshot, startsAt };
  });
  return { snapshots: result, json: JSON.stringify(baselines) };
}
export async function applyOutreachCampaignBaselines(
  monitor: Monitor,
  snapshots: OutreachAlertSnapshot[],
  now: Date
) {
  const result = outreachCampaignBaselines(monitor, snapshots, now);
  if (result.json !== monitor.campaignBaselinesJson) {
    const db = await database();
    await db
      .update(outreachAlertMonitors)
      .set({ campaignBaselinesJson: result.json, updatedAt: now })
      .where(eq(outreachAlertMonitors.id, monitor.id));
  }
  return result.snapshots;
}

export function outreachEmptyEpisodeKey(
  campaignKey: OutreachCampaignKey,
  previousResolvedId: number
) {
  return `empty:${campaignKey}:after:${previousResolvedId}`;
}

/** Empty incidents survive midnight, pause, missing scheduler and DB failure; reset ONLY after verified READY > 0. */
export async function resolveOutreachEmptyEpisodes(
  snapshots: OutreachAlertSnapshot[],
  now: Date
) {
  const recovered = snapshots
    .filter(
      s =>
        !s.readError &&
        s.readinessVerified === true &&
        typeof s.readyCount === "number" &&
        Number.isFinite(s.readyCount) &&
        s.readyCount > 0
    )
    .map(s => s.key);
  if (!recovered.length) return;
  const db = await database();
  await db.transaction(async tx => {
    const lock = await tx
      .select({ id: outreachAlertMonitors.id })
      .from(outreachAlertMonitors)
      .where(eq(outreachAlertMonitors.slug, OUTREACH_ALERT_MONITOR_SLUG))
      .for("update");
    if (lock.length !== 1) throw new Error("OUTREACH_ALERT_MONITOR_REQUIRED");
    await tx
      .update(outreachDeliveryAlerts)
      .set({ resolvedAt: now, updatedAt: now })
      .where(
        and(
          isNull(outreachDeliveryAlerts.resolvedAt),
          eq(outreachDeliveryAlerts.kind, "ready_new_empty"),
          inArray(outreachDeliveryAlerts.campaignKey, recovered)
        )
      );
  });
}

/** One grouped initial empty-reserve attempt per Central day, all campaign claims committed BEFORE SMTP. */
export async function claimOutreachEmptyAlertGroup(
  ids: number[],
  now: Date,
  dayStart: Date,
  dayEnd: Date
) {
  if (!ids.length) return [];
  const db = await database();
  return db.transaction(async tx => {
    const lock = await tx
      .select({ id: outreachAlertMonitors.id })
      .from(outreachAlertMonitors)
      .where(eq(outreachAlertMonitors.slug, OUTREACH_ALERT_MONITOR_SLUG))
      .for("update");
    if (lock.length !== 1) throw new Error("OUTREACH_ALERT_MONITOR_REQUIRED");
    const [attemptedToday] = await tx
      .select({ id: outreachDeliveryAlerts.id })
      .from(outreachDeliveryAlerts)
      .where(
        and(
          eq(outreachDeliveryAlerts.kind, "ready_new_empty"),
          gte(outreachDeliveryAlerts.emailAttemptedAt, dayStart),
          lt(outreachDeliveryAlerts.emailAttemptedAt, dayEnd)
        )
      )
      .limit(1);
    if (attemptedToday) return [];
    const rows = await tx
      .select()
      .from(outreachDeliveryAlerts)
      .where(
        and(
          inArray(outreachDeliveryAlerts.id, ids),
          eq(outreachDeliveryAlerts.kind, "ready_new_empty"),
          eq(outreachDeliveryAlerts.emailState, "pending"),
          isNull(outreachDeliveryAlerts.resolvedAt)
        )
      )
      .for("update");
    if (!rows.length) return [];
    const [claim] = await tx
      .update(outreachDeliveryAlerts)
      .set({ emailState: "sending", emailAttemptedAt: now, updatedAt: now })
      .where(
        inArray(
          outreachDeliveryAlerts.id,
          rows.map(r => r.id)
        )
      );
    if (Number(claim.affectedRows || 0) !== rows.length)
      throw new Error("OUTREACH_EMPTY_GROUP_CLAIM_INCOMPLETE");
    return rows;
  });
}
