import { outreachUniqueViolation } from "./outreachDeadline";
import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  brandVideoCampaigns,
  brandVideoDailyRuns,
  brandVideoEvents,
  brandVideoMessages,
  brandVideoProspects,
  type BrandVideoCampaign,
  type BrandVideoMessage,
  type BrandVideoProspect,
} from "../drizzle/schema";
import {
  BRAND_VIDEO_DRAFT_VERSION,
  BRAND_VIDEO_TIME_ZONE,
  hasPublishedBrandVideoEmail,
  isBrandVideoHttpUrl,
  normalizeBrandVideoEmail,
  BRAND_VIDEO_DAY_OFFSETS,
  BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT,
  getBrandVideoCalendarDayAt,
  getBrandVideoSendMoment,
  planBrandVideoSequenceFromFirstSend,
} from "../shared/brandVideoOutreach";
import {
  OUTREACH_DAILY_NEW_CONTACT_LIMIT,
  OUTREACH_READY_BUFFER_TARGET,
} from "../shared/outreachMaintenance";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { getDb } from "./db";
import {
  ensureBrandVideoCampaign,
  getBrandVideoCrossCampaignConflict,
} from "./brandVideoOutreach";

const LEASE_MS = 35_000;
const MESSAGE_ID_DOMAIN = "jeristotleproductions.com";
const TERMINAL_STATUSES = [
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "not_fit",
  "complete",
] as const;
const UNSENT_OR_CLAIMED_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "failed",
] as const;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type BrandVideoDeliveryCandidate = {
  message: BrandVideoMessage;
  prospect: BrandVideoProspect;
};

export type BrandVideoDailyLease = {
  id: number;
  leaseToken: string;
  runDate: string;
};

export type BrandVideoSendingHealth = {
  campaign: BrandVideoCampaign;
  readyInitialCount: number;
  qualifiedCount: number;
  totalProspectCount: number;
  sourceBackedDraftCount: number;
  blockedCount: number;
  evidenceNeededCount: number;
  sentInitialCount: number;
  claimedForReviewCount: number;
  reserveTarget: number;
  lowSupply: boolean;
  lastReplyCheckAt: Date | null;
  lastRunAt: Date | null;
  latestRun: {
    runDate: string;
    status: "started" | "complete" | "skipped" | "failed";
    newReserved: number;
    newSent: number;
    followupsSent: number;
    repliesDetected: number;
    errorCount: number;
    summary: string | null;
  } | null;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

function asErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 4_000)
    : String(error).slice(0, 4_000);
}

function isUniqueViolation(error: unknown) { return outreachUniqueViolation(error); }

function newToken() {
  return randomBytes(18).toString("hex");
}

export function buildBrandVideoOutboundMessageId(
  messageId: number,
  claimToken: string
) {
  return `<bv-${messageId}-${claimToken}@${MESSAGE_ID_DOMAIN}>`;
}

async function hasBrandVideoIdentityDuplicate(
  db: Database,
  prospect: BrandVideoProspect
) {
  const identities = [
    eq(brandVideoProspects.normalizedBusiness, prospect.normalizedBusiness),
  ];
  if (prospect.normalizedDomain) {
    identities.push(
      eq(brandVideoProspects.normalizedDomain, prospect.normalizedDomain)
    );
  }
  if (prospect.normalizedEmail) {
    identities.push(
      eq(brandVideoProspects.normalizedEmail, prospect.normalizedEmail)
    );
  }
  const duplicate = await db
    .select({ id: brandVideoProspects.id })
    .from(brandVideoProspects)
    .where(
      and(
        eq(brandVideoProspects.campaignId, prospect.campaignId),
        ne(brandVideoProspects.id, prospect.id),
        or(...identities)
      )
    )
    .limit(1);
  return Boolean(duplicate[0]);
}

/** Requires retained public email evidence; general business inboxes are allowed, guesses are not. */
export function hasBrandVideoSourceBackedTarget(prospect: BrandVideoProspect) {
  if (
    prospect.qualified !== 1 ||
    prospect.crossCampaignBlock ||
    normalizeBrandVideoEmail(prospect.primaryEmail) !==
      prospect.normalizedEmail ||
    !hasPublishedBrandVideoEmail({
      email: prospect.primaryEmail,
      sourceUrl: prospect.primaryEmailSourceUrl,
    }) ||
    !isBrandVideoHttpUrl(prospect.website) ||
    !prospect.localAuthorityEvidence?.trim() ||
    !prospect.verifiedObservation?.trim() ||
    !prospect.videoAngle?.trim() ||
    !prospect.videoScenes?.trim()
  )
    return false;
  try {
    const sources: unknown = JSON.parse(prospect.sourcesJson);
    return (
      Array.isArray(sources) &&
      sources.some(
        source =>
          source &&
          typeof source === "object" &&
          source.url === prospect.primaryEmailSourceUrl
      )
    );
  } catch {
    return false;
  }
}

function compareBrandVideoLaunchPriority(
  a: BrandVideoProspect,
  b: BrandVideoProspect
) {
  return b.fitScore - a.fitScore || a.id - b.id;
}

export function hasValidBrandVideoSequence(
  messages: BrandVideoMessage[],
  status: "draft" | "approved"
) {
  return (
    messages.length === 3 &&
    BRAND_VIDEO_DAY_OFFSETS.every((offset, step) =>
      messages.some(
        message =>
          message.sequenceStep === step &&
          message.dayOffset === offset &&
          message.status === status &&
          !message.sendAttemptedAt &&
          !message.smtpAcceptedAt &&
          Boolean(
            message.subject?.trim() &&
              message.htmlBody?.trim() &&
              message.textBody?.trim()
          )
      )
    )
  );
}

function isActiveProspect(prospect: BrandVideoProspect) {
  return !TERMINAL_STATUSES.includes(
    prospect.status as (typeof TERMINAL_STATUSES)[number]
  );
}

export async function getBrandVideoCampaignForScheduledTask(taskUid: string) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(brandVideoCampaigns)
    .where(eq(brandVideoCampaigns.dailyScheduleTaskUid, taskUid))
    .limit(1);
  return campaign;
}

export async function recordBrandVideoMaintenanceEvent(
  campaignId: number,
  failed: boolean,
  detail: string,
  now = new Date()
) {
  const db = await requireDb();
  await db.insert(brandVideoEvents).values({
    campaignId,
    eventType: failed ? "maintenance_failed" : "maintenance_complete",
    detail: detail.slice(0, 8000),
    occurredAt: now,
  });
}

async function getCampaignById(campaignId: number) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(brandVideoCampaigns)
    .where(eq(brandVideoCampaigns.id, campaignId))
    .limit(1);
  return campaign;
}

/**
 * Exactly one reservation per campaign/Chicago calendar day. Every existing
 * row fences that day, including failed/expired/partially attempted runs. An
 * expired lease is NOT evidence of no SMTP acceptance and is never reclaimed.
 */
export async function reserveBrandVideoDailyRun(input: {
  campaignId: number;
  runDate: string;
  now?: Date;
}): Promise<BrandVideoDailyLease | null> {
  const now = input.now ?? new Date();
  if (!getBrandVideoSendMoment(now, input.runDate).inSendWindow) return null;
  const db = await requireDb();
  const leaseToken = newToken();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  try {
    const result = await db.insert(brandVideoDailyRuns).values({
      campaignId: input.campaignId,
      runDate: input.runDate,
      status: "started",
      leaseToken,
      leaseExpiresAt,
      summary:
        "Reserved today's only brand-video batch; 09:00 target with same-day Central daytime catch-up.",
    });
    return {
      id: Number(result[0].insertId),
      leaseToken,
      runDate: input.runDate,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const [existing] = await db.select().from(brandVideoDailyRuns).where(and(
    eq(brandVideoDailyRuns.campaignId, input.campaignId), eq(brandVideoDailyRuns.runDate, input.runDate)
  )).limit(1);
  if (!existing || !["started", "failed"].includes(existing.status)) return null;
  const [owned] = await db.update(brandVideoDailyRuns).set({
    status: "started", leaseToken, leaseExpiresAt,
    summary: "Same-day bounded continuation; all reservations and attempted-message fences retained.",
  }).where(and(
    eq(brandVideoDailyRuns.id, existing.id), inArray(brandVideoDailyRuns.status, ["started", "failed"]),
    or(isNull(brandVideoDailyRuns.leaseExpiresAt), lt(brandVideoDailyRuns.leaseExpiresAt, now))
  ));
  if (Number(owned.affectedRows ?? 0) !== 1) return null;
  return { id: existing.id, leaseToken, runDate: input.runDate };
}

/** Records a run outcome only for the lease owner so an old callback cannot overwrite a newer run. */
export async function completeBrandVideoDailyRun(input: {
  campaignId: number;
  lease: BrandVideoDailyLease;
  status: "started" | "complete" | "skipped" | "failed";
  newSent: number;
  followupsSent: number;
  repliesDetected: number;
  errorCount: number;
  summary: string;
  now?: Date;
}) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const [current] = await db
    .select()
    .from(brandVideoDailyRuns)
    .where(
      and(
        eq(brandVideoDailyRuns.id, input.lease.id),
        eq(brandVideoDailyRuns.campaignId, input.campaignId),
        eq(brandVideoDailyRuns.leaseToken, input.lease.leaseToken)
      )
    )
    .limit(1);
  if (!current || current.status !== "started") return false;
  // Derive actual stored acceptances so a crashed callback cannot lose accepted send counts.
  const accepted = (await readMessagesForCampaign(db, input.campaignId)).filter(
    message => message.status === "sent" && message.smtpAcceptedAt &&
      getOutreachLocalMoment(message.smtpAcceptedAt, BRAND_VIDEO_TIME_ZONE).dateKey === input.lease.runDate
  );
  await db
    .update(brandVideoDailyRuns)
    .set({
      status: input.status,
      newSent: accepted.filter(message => message.sequenceStep === 0).length,
      followupsSent: accepted.filter(message => message.sequenceStep > 0)
        .length,
      repliesDetected: Math.max(current.repliesDetected, input.repliesDetected),
      errorCount: current.errorCount + input.errorCount,
      summary: input.summary.slice(0, 8_000),
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(brandVideoDailyRuns.id, input.lease.id),
        eq(brandVideoDailyRuns.campaignId, input.campaignId),
        eq(brandVideoDailyRuns.leaseToken, input.lease.leaseToken),
        eq(brandVideoDailyRuns.status, "started")
      )
    );
  await db
    .update(brandVideoCampaigns)
    .set({ lastRunAt: now })
    .where(eq(brandVideoCampaigns.id, input.campaignId));
  return true;
}

async function readMessagesForCampaign(db: Database, campaignId: number) {
  return db
    .select()
    .from(brandVideoMessages)
    .where(eq(brandVideoMessages.campaignId, campaignId))
    .orderBy(
      asc(brandVideoMessages.prospectId),
      asc(brandVideoMessages.sequenceStep)
    );
}

/** Returns no candidates that are merely scheduled/claimed or failed; neither is retried automatically. */
export async function getBrandVideoInitialCandidates(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const initialByProspect = new Map(
    messages
      .filter(
        message => message.sequenceStep === 0 && message.status === "approved"
      )
      .map(message => [message.prospectId, message])
  );
  return prospects
    .filter(
      prospect =>
        prospect.status === "approved" &&
        prospect.outreachStatus === "approved" &&
        !prospect.firstSentAt &&
        prospect.draftVersion === BRAND_VIDEO_DRAFT_VERSION &&
        hasBrandVideoSourceBackedTarget(prospect) &&
        hasValidBrandVideoSequence(
          messages.filter(message => message.prospectId === prospect.id),
          "approved"
        ) &&
        Boolean(initialByProspect.get(prospect.id))
    )
    .map(prospect => ({
      message: initialByProspect.get(prospect.id)!,
      prospect,
    }))
    .sort((a, b) => compareBrandVideoLaunchPriority(a.prospect, b.prospect));
}

/**
 * Follow-ups are only selected after their immediately prior message is sent.
 * A date comparison against `lastSentAt` makes a newly sent overdue step block
 * the next overdue step until the following Central calendar day.
 */
export async function getDueBrandVideoFollowupCandidates(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const sentSteps = new Set(
    messages
      .filter(
        message =>
          message.status === "sent" &&
          message.smtpAcceptedAt &&
          message.providerMessageId
      )
      .map(message => `${message.prospectId}:${message.sequenceStep}`)
  );
  const today = getOutreachLocalMoment(now, BRAND_VIDEO_TIME_ZONE).dateKey;
  const prospectById = new Map(
    prospects.map(prospect => [prospect.id, prospect])
  );
  return messages
    .filter(message => {
      if (
        message.sequenceStep < 1 ||
        message.status !== "approved" ||
        !message.plannedAt ||
        message.plannedAt > now
      ) {
        return false;
      }
      const prospect = prospectById.get(message.prospectId);
      if (
        !prospect ||
        prospect.status !== "approved" ||
        prospect.outreachStatus !== "in_sequence" ||
        prospect.draftVersion !== BRAND_VIDEO_DRAFT_VERSION ||
        !hasBrandVideoSourceBackedTarget(prospect) ||
        !prospect.firstSentAt
      )
        return false;
      if (!sentSteps.has(`${message.prospectId}:${message.sequenceStep - 1}`))
        return false;
      const lastSentDate = prospect.lastSentAt
        ? getOutreachLocalMoment(prospect.lastSentAt, BRAND_VIDEO_TIME_ZONE)
            .dateKey
        : null;
      return lastSentDate !== today;
    })
    .map(message => ({
      message,
      prospect: prospectById.get(message.prospectId)!,
    }))
    .sort(
      (a, b) =>
        a.message.plannedAt!.getTime() - b.message.plannedAt!.getTime() ||
        compareBrandVideoLaunchPriority(a.prospect, b.prospect)
    );
}

export async function getBrandVideoPreviousSentMessage(
  prospectId: number,
  step: number
) {
  if (step < 1) return undefined;
  const db = await requireDb();
  const [message] = await db
    .select()
    .from(brandVideoMessages)
    .where(
      and(
        eq(brandVideoMessages.prospectId, prospectId),
        eq(brandVideoMessages.sequenceStep, step - 1),
        eq(brandVideoMessages.status, "sent"),
        sql`${brandVideoMessages.smtpAcceptedAt} IS NOT NULL`
      )
    )
    .limit(1);
  return message;
}

export type BrandVideoPointOfSendCheck =
  | {
      ready: true;
      campaign: BrandVideoCampaign;
      prospect: BrandVideoProspect;
      message: BrandVideoMessage;
    }
  | { ready: false; reason: string };

/** Re-reads all controls at the send point, rather than trusting queued data. */
export async function getBrandVideoPointOfSendCheck(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken?: string;
  dailyLease?: BrandVideoDailyLease;
  taskUid?: string;
  now?: Date;
}): Promise<BrandVideoPointOfSendCheck> {
  const now = input.now ?? new Date();
  const moment = getBrandVideoSendMoment(now, input.dailyLease?.runDate);
  if (!moment.inSendWindow)
    return {
      ready: false,
      reason:
        "Outside this batch's 09:00–17:59 Central calendar-day send window.",
    };
  const db = await requireDb();
  const [campaign, prospect, message] = await Promise.all([
    getCampaignById(input.campaignId),
    db
      .select()
      .from(brandVideoProspects)
      .where(
        and(
          eq(brandVideoProspects.id, input.prospectId),
          eq(brandVideoProspects.campaignId, input.campaignId)
        )
      )
      .limit(1),
    db
      .select()
      .from(brandVideoMessages)
      .where(
        and(
          eq(brandVideoMessages.id, input.messageId),
          eq(brandVideoMessages.campaignId, input.campaignId),
          eq(brandVideoMessages.prospectId, input.prospectId)
        )
      )
      .limit(1),
  ]);
  const currentProspect = prospect[0];
  const currentMessage = message[0];
  if (!campaign || !currentProspect || !currentMessage) {
    return {
      ready: false,
      reason: "Campaign, prospect, or message no longer exists.",
    };
  }
  if (campaign.status !== "active")
    return { ready: false, reason: "Campaign is paused or not active." };
  if (
    campaign.timezone !== BRAND_VIDEO_TIME_ZONE ||
    campaign.sendHourLocal !== 9 ||
    campaign.dailyNewLimit !== OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
    !campaign.dailyScheduleTaskUid ||
    (input.taskUid !== undefined &&
      campaign.dailyScheduleTaskUid !== input.taskUid) ||
    !campaign.physicalPostalAddress?.trim()
  )
    return {
      ready: false,
      reason: "Campaign sending configuration or scheduler link is invalid.",
    };
  if (!campaign.listApprovedAt || !campaign.configApprovedAt) {
    return {
      ready: false,
      reason: "Campaign list/config approval is missing.",
    };
  }
  if (input.dailyLease) {
    const [run] = await db
      .select()
      .from(brandVideoDailyRuns)
      .where(
        and(
          eq(brandVideoDailyRuns.id, input.dailyLease.id),
          eq(brandVideoDailyRuns.campaignId, input.campaignId),
          eq(brandVideoDailyRuns.runDate, moment.dateKey),
          eq(brandVideoDailyRuns.leaseToken, input.dailyLease.leaseToken)
        )
      )
      .limit(1);
    if (
      !run ||
      run.status !== "started" ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt < now ||
      run.newReserved > OUTREACH_DAILY_NEW_CONTACT_LIMIT ||
      (currentMessage.sequenceStep === 0 &&
        (input.claimToken
          ? run.newReserved < 1
          : run.newReserved >= OUTREACH_DAILY_NEW_CONTACT_LIMIT)) ||
      (currentMessage.sequenceStep > 0 &&
        run.followupsSent >= BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT)
    ) {
      return {
        ready: false,
        reason: "Daily batch lease or fixed cap is unavailable.",
      };
    }
  }
  if (
    currentProspect.status !== "approved" ||
    !isActiveProspect(currentProspect)
  ) {
    return { ready: false, reason: "Prospect is terminal or not approved." };
  }
  if (currentProspect.draftVersion !== BRAND_VIDEO_DRAFT_VERSION) {
    return {
      ready: false,
      reason: "Prospect is not on the current approved draft version.",
    };
  }
  if (!hasBrandVideoSourceBackedTarget(currentProspect)) {
    return {
      ready: false,
      reason:
        "Recipient lacks current published public email evidence or qualification.",
    };
  }
  if (
    !(
      (currentMessage.sequenceStep === 0 &&
        currentProspect.outreachStatus === "approved" &&
        !currentProspect.firstSentAt) ||
      (currentMessage.sequenceStep > 0 &&
        currentProspect.outreachStatus === "in_sequence" &&
        currentProspect.firstSentAt)
    )
  )
    return {
      ready: false,
      reason: "Prospect sequence state no longer permits this step.",
    };
  if (
    BRAND_VIDEO_DAY_OFFSETS[currentMessage.sequenceStep as 0 | 1 | 2] !==
      currentMessage.dayOffset ||
    !currentMessage.subject?.trim() ||
    !currentMessage.htmlBody?.trim() ||
    !currentMessage.textBody?.trim() ||
    currentMessage.sendAttemptedAt ||
    currentMessage.smtpAcceptedAt
  )
    return {
      ready: false,
      reason: "Draft changed, is invalid, or SMTP was already attempted.",
    };
  if (currentMessage.sequenceStep > 0) {
    const previous = await getBrandVideoPreviousSentMessage(
      currentProspect.id,
      currentMessage.sequenceStep
    );
    if (
      !previous?.providerMessageId ||
      !currentMessage.plannedAt ||
      currentMessage.plannedAt > now ||
      (currentProspect.lastSentAt &&
        getOutreachLocalMoment(
          currentProspect.lastSentAt,
          BRAND_VIDEO_TIME_ZONE
        ).dateKey === moment.dateKey)
    )
      return {
        ready: false,
        reason: "Follow-up is not due or lacks an accepted prior thread.",
      };
  }
  if (currentMessage.status !== (input.claimToken ? "scheduled" : "approved")) {
    return {
      ready: false,
      reason: "Message is no longer in the expected delivery state.",
    };
  }
  if (input.claimToken && currentMessage.sendClaimToken !== input.claimToken) {
    return {
      ready: false,
      reason: "Message claim is owned by another delivery worker.",
    };
  }
  const [conflict, duplicate] = await Promise.all([
    getBrandVideoCrossCampaignConflict(currentProspect),
    hasBrandVideoIdentityDuplicate(db, currentProspect),
  ]);
  if (conflict) return { ready: false, reason: conflict };
  if (duplicate)
    return {
      ready: false,
      reason: "Duplicate brand-video identity requires manual review.",
    };
  return {
    ready: true,
    campaign,
    prospect: currentProspect,
    message: currentMessage,
  };
}

class ClaimUnavailable extends Error {}

/**
 * Claims one message in a short DB transaction. For an initial, reserving a
 * daily slot and setting `scheduled` commit together; therefore overlap cannot
 * exceed the configured ten-contact cap even if every callback has the same
 * candidate list.
 */
export async function claimBrandVideoMessageForSend(input: {
  candidate: BrandVideoDeliveryCandidate;
  claimToken: string;
  providerMessageId: string;
  now: Date;
  dailyLease: BrandVideoDailyLease;
  dailyNewLimit?: number;
}) {
  if (
    !getBrandVideoSendMoment(input.now, input.dailyLease.runDate).inSendWindow
  )
    return false;
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      if (input.candidate.message.sequenceStep === 0) {
        const cap = Math.min(
          OUTREACH_DAILY_NEW_CONTACT_LIMIT,
          Math.max(0, input.dailyNewLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT)
        );
        const [reserved] = await tx
          .update(brandVideoDailyRuns)
          .set({ newReserved: sql`${brandVideoDailyRuns.newReserved} + 1` })
          .where(
            and(
              eq(brandVideoDailyRuns.id, input.dailyLease.id),
              eq(
                brandVideoDailyRuns.campaignId,
                input.candidate.prospect.campaignId
              ),
              eq(brandVideoDailyRuns.runDate, input.dailyLease.runDate),
              eq(brandVideoDailyRuns.status, "started"),
              eq(brandVideoDailyRuns.leaseToken, input.dailyLease.leaseToken),
              gte(brandVideoDailyRuns.leaseExpiresAt, input.now),
              lt(brandVideoDailyRuns.newReserved, cap)
            )
          );
        if (Number(reserved.affectedRows ?? 0) !== 1) {
          throw new ClaimUnavailable(
            "Daily initial-message cap or lease is unavailable."
          );
        }
      }
      const [claimed] = await tx
        .update(brandVideoMessages)
        .set({
          status: "scheduled",
          scheduledAt: input.now,
          sendClaimToken: input.claimToken,
          sendClaimedAt: input.now,
          sendAttemptedAt: null,
          providerMessageId: input.providerMessageId,
          error: null,
        })
        .where(
          and(
            eq(brandVideoMessages.id, input.candidate.message.id),
            eq(
              brandVideoMessages.campaignId,
              input.candidate.prospect.campaignId
            ),
            eq(brandVideoMessages.prospectId, input.candidate.prospect.id),
            eq(brandVideoMessages.status, "approved"),
            isNull(brandVideoMessages.sendAttemptedAt),
            isNull(brandVideoMessages.smtpAcceptedAt),
            sql`EXISTS (SELECT 1 FROM ${brandVideoDailyRuns} r WHERE r.id = ${input.dailyLease.id} AND r.campaignId = ${brandVideoMessages.campaignId} AND r.runDate = ${input.dailyLease.runDate} AND r.status = 'started' AND r.leaseToken = ${input.dailyLease.leaseToken} AND r.leaseExpiresAt >= ${input.now} AND r.newReserved <= ${OUTREACH_DAILY_NEW_CONTACT_LIMIT} AND (${brandVideoMessages.sequenceStep} = 0 OR r.followupsSent < ${BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT}))`
          )
        );
      if (Number(claimed.affectedRows ?? 0) !== 1) {
        throw new ClaimUnavailable(
          "Message was claimed, cancelled, or changed by another worker."
        );
      }
    });
    return true;
  } catch (error) {
    if (error instanceof ClaimUnavailable) return false;
    throw error;
  }
}

export async function recordBrandVideoSendAttempt(input: {
  messageId: number;
  claimToken: string;
  now: Date;
  dailyLease: BrandVideoDailyLease;
  taskUid: string;
  expected: Extract<BrandVideoPointOfSendCheck, { ready: true }>;
}) {
  // This is the final boundary: a previous Chicago date can never authorize
  // SMTP on a new date, even when an old callback/claim is still in memory.
  const moment = getBrandVideoSendMoment(input.now, input.dailyLease.runDate);
  if (!moment.inSendWindow) return false;
  const { campaign, prospect, message } = input.expected;
  const db = await requireDb();
  const [result] = await db
    .update(brandVideoMessages)
    .set({ sendAttemptedAt: input.now })
    .where(
      and(
        eq(brandVideoMessages.id, input.messageId),
        eq(brandVideoMessages.campaignId, campaign.id),
        eq(brandVideoMessages.prospectId, prospect.id),
        eq(brandVideoMessages.status, "scheduled"),
        eq(brandVideoMessages.sendClaimToken, input.claimToken),
        isNull(brandVideoMessages.sendAttemptedAt),
        isNull(brandVideoMessages.smtpAcceptedAt),
        eq(brandVideoMessages.sequenceStep, message.sequenceStep),
        eq(brandVideoMessages.dayOffset, message.dayOffset),
        eq(brandVideoMessages.subject, message.subject),
        eq(brandVideoMessages.textBody, message.textBody),
        eq(brandVideoMessages.htmlBody, message.htmlBody),
        sql`${brandVideoMessages.plannedAt} <=> ${message.plannedAt}`,
        sql`EXISTS (SELECT 1 FROM ${brandVideoDailyRuns} r WHERE r.id = ${input.dailyLease.id} AND r.campaignId = ${brandVideoMessages.campaignId} AND r.runDate = ${moment.dateKey} AND r.status = 'started' AND r.leaseToken = ${input.dailyLease.leaseToken} AND r.leaseExpiresAt >= ${input.now} AND r.newReserved <= ${OUTREACH_DAILY_NEW_CONTACT_LIMIT} AND (${brandVideoMessages.sequenceStep} > 0 OR r.newReserved > 0) AND (${brandVideoMessages.sequenceStep} = 0 OR r.followupsSent < ${BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT}))`,
        // Compare the fresh snapshot as well as stop/config state atomically.
        // A concurrent edit must never route approved copy to a stale recipient.
        sql`EXISTS (SELECT 1 FROM ${brandVideoProspects} p INNER JOIN ${brandVideoCampaigns} c ON c.id = p.campaignId WHERE p.id = ${brandVideoMessages.prospectId} AND p.campaignId = ${campaign.id} AND p.status = 'approved' AND p.outreachStatus = ${prospect.outreachStatus} AND p.qualified = 1 AND p.crossCampaignBlock IS NULL AND p.draftVersion = ${BRAND_VIDEO_DRAFT_VERSION} AND p.primaryEmail = ${prospect.primaryEmail} AND p.normalizedEmail = ${prospect.normalizedEmail} AND p.primaryEmailSourceUrl = ${prospect.primaryEmailSourceUrl} AND p.sourcesJson = ${prospect.sourcesJson} AND p.website = ${prospect.website} AND p.localAuthorityEvidence = ${prospect.localAuthorityEvidence} AND p.verifiedObservation = ${prospect.verifiedObservation} AND p.videoAngle = ${prospect.videoAngle} AND p.videoScenes = ${prospect.videoScenes} AND p.unsubscribeToken = ${prospect.unsubscribeToken} AND p.firstSentAt <=> ${prospect.firstSentAt} AND p.lastSentAt <=> ${prospect.lastSentAt} AND c.status = 'active' AND c.timezone = ${BRAND_VIDEO_TIME_ZONE} AND c.sendHourLocal = 9 AND c.dailyNewLimit = ${OUTREACH_DAILY_NEW_CONTACT_LIMIT} AND c.dailyScheduleTaskUid = ${input.taskUid} AND c.physicalPostalAddress = ${campaign.physicalPostalAddress} AND c.listApprovedAt IS NOT NULL AND c.configApprovedAt IS NOT NULL)`
      )
    );
  return Number(result.affectedRows ?? 0) === 1;
}

/** Releases a claim only when no SMTP attempt has happened; attempted rows are never auto-retried. */
export async function releaseBrandVideoUnattemptedClaim(input: {
  messageId: number;
  claimToken: string;
  reason: string;
}) {
  const db = await requireDb();
  await db
    .update(brandVideoMessages)
    .set({
      status: "approved",
      scheduledAt: null,
      sendClaimToken: null,
      sendClaimedAt: null,
      providerMessageId: null,
      error: input.reason.slice(0, 4_000),
    })
    .where(
      and(
        eq(brandVideoMessages.id, input.messageId),
        eq(brandVideoMessages.status, "scheduled"),
        eq(brandVideoMessages.sendClaimToken, input.claimToken),
        isNull(brandVideoMessages.sendAttemptedAt)
      )
    );
}

export async function markBrandVideoDeliveryAmbiguousFailure(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken: string;
  error: unknown;
  now?: Date;
}) {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const reason = `Manual review required; SMTP outcome may be ambiguous: ${asErrorMessage(input.error)}`;
  const [result] = await db
    .update(brandVideoMessages)
    .set({
      status: "failed",
      error: reason,
      sendClaimToken: null,
      sendClaimedAt: null,
    })
    .where(
      and(
        eq(brandVideoMessages.id, input.messageId),
        eq(brandVideoMessages.campaignId, input.campaignId),
        eq(brandVideoMessages.prospectId, input.prospectId),
        eq(brandVideoMessages.status, "scheduled"),
        eq(brandVideoMessages.sendClaimToken, input.claimToken)
      )
    );
  if (Number(result.affectedRows ?? 0) === 1) {
    await db.insert(brandVideoEvents).values({
      campaignId: input.campaignId,
      prospectId: input.prospectId,
      messageId: input.messageId,
      eventType: "send_failure",
      detail: reason,
      metadataJson: JSON.stringify({
        disposition: "manual_review_no_auto_retry",
      }),
      occurredAt: now,
    });
  }
}

export async function finalizeBrandVideoSmtpAcceptance(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken: string;
  sequenceStep: number;
  /** The Message-ID stamped atomically with the claim, before SMTP. */
  claimedProviderMessageId: string;
  /** SMTP's returned provider ID; Gmail may rewrite the supplied ID. */
  providerMessageId: string;
  acceptedAt: Date;
}) {
  const db = await requireDb();
  // A terminal inbox event can cancel the scheduled claim after SMTP begins.
  // Its pre-stamped Message-ID and attempt timestamp prove the accepted message
  // belongs to this claim. Preserve that acceptance history, but never revive
  // the terminal prospect or plan a follow-up.
  const [before] = await db
    .select()
    .from(brandVideoMessages)
    .where(
      and(
        eq(brandVideoMessages.id, input.messageId),
        eq(brandVideoMessages.campaignId, input.campaignId),
        eq(brandVideoMessages.prospectId, input.prospectId)
      )
    )
    .limit(1);
  const terminalCancellationWon = Boolean(
    before &&
      before.status === "cancelled" &&
      before.providerMessageId === input.claimedProviderMessageId &&
      before.sendAttemptedAt
  );
  const [result] = await db
    .update(brandVideoMessages)
    .set({
      status: "sent",
      sentAt: input.acceptedAt,
      smtpAcceptedAt: input.acceptedAt,
      providerMessageId: input.providerMessageId,
      sendClaimToken: null,
      sendClaimedAt: null,
      error: null,
    })
    .where(
      and(
        eq(brandVideoMessages.id, input.messageId),
        eq(brandVideoMessages.campaignId, input.campaignId),
        eq(brandVideoMessages.prospectId, input.prospectId),
        or(
          and(
            eq(brandVideoMessages.status, "scheduled"),
            eq(brandVideoMessages.sendClaimToken, input.claimToken)
          ),
          and(
            eq(brandVideoMessages.status, "cancelled"),
            eq(
              brandVideoMessages.providerMessageId,
              input.claimedProviderMessageId
            ),
            sql`${brandVideoMessages.sendAttemptedAt} IS NOT NULL`
          )
        )
      )
    );
  if (Number(result.affectedRows ?? 0) !== 1) return false;

  // A terminal event won the race. Recording the accepted send avoids a later
  // duplicate, while leaving the prospect's terminal cancellation untouched.
  if (terminalCancellationWon) {
    await db.insert(brandVideoEvents).values({
      campaignId: input.campaignId,
      prospectId: input.prospectId,
      messageId: input.messageId,
      eventType: "smtp_accepted_after_terminal",
      detail:
        "SMTP accepted after a terminal response cancellation; no follow-up was planned.",
      metadataJson: JSON.stringify({
        providerMessageId: input.providerMessageId,
      }),
      occurredAt: input.acceptedAt,
    });
    return true;
  }

  const prospectUpdate =
    input.sequenceStep === 0
      ? {
          firstSentAt: input.acceptedAt,
          lastSentAt: input.acceptedAt,
          outreachStatus: "in_sequence" as const,
        }
      : {
          lastSentAt: input.acceptedAt,
          outreachStatus:
            input.sequenceStep === 2
              ? ("complete" as const)
              : ("in_sequence" as const),
        };
  await db
    .update(brandVideoProspects)
    .set(prospectUpdate)
    .where(
      and(
        eq(brandVideoProspects.id, input.prospectId),
        eq(brandVideoProspects.campaignId, input.campaignId),
        eq(brandVideoProspects.status, "approved")
      )
    );

  if (input.sequenceStep === 0) {
    const campaign = await getCampaignById(input.campaignId);
    if (campaign) {
      const plans = planBrandVideoSequenceFromFirstSend(
        input.acceptedAt,
        campaign.sendHourLocal,
        campaign.timezone
      );
      for (const plan of plans.filter(plan => plan.sequenceStep > 0)) {
        await db
          .update(brandVideoMessages)
          .set({ plannedAt: plan.plannedAt })
          .where(
            and(
              eq(brandVideoMessages.campaignId, input.campaignId),
              eq(brandVideoMessages.prospectId, input.prospectId),
              eq(brandVideoMessages.sequenceStep, plan.sequenceStep),
              eq(brandVideoMessages.status, "approved")
            )
          );
      }
    }
  }

  await db.insert(brandVideoEvents).values({
    campaignId: input.campaignId,
    prospectId: input.prospectId,
    messageId: input.messageId,
    eventType: input.sequenceStep === 0 ? "initial_sent" : "followup_sent",
    detail: "SMTP accepted the message.",
    metadataJson: JSON.stringify({
      providerMessageId: input.providerMessageId,
      sequenceStep: input.sequenceStep,
      smtpAcceptedAt: input.acceptedAt.toISOString(),
    }),
    occurredAt: input.acceptedAt,
  });
  return true;
}

/** Restores missing Days 5/10 plans (offsets 4/9) only from an actual stored initial acceptance. */
export async function ensureBrandVideoFollowupPlans(campaignId: number) {
  const db = await requireDb();
  const [campaign, prospects, messages] = await Promise.all([
    getCampaignById(campaignId),
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  if (!campaign) return 0;
  const initialSent = new Map(
    messages
      .filter(
        message =>
          message.sequenceStep === 0 &&
          message.status === "sent" &&
          message.smtpAcceptedAt
      )
      .map(message => [message.prospectId, message])
  );
  let restored = 0;
  for (const prospect of prospects) {
    const initial = initialSent.get(prospect.id);
    if (
      !initial?.smtpAcceptedAt ||
      prospect.status !== "approved" ||
      prospect.outreachStatus !== "in_sequence"
    )
      continue;
    const plans = planBrandVideoSequenceFromFirstSend(
      initial.smtpAcceptedAt,
      campaign.sendHourLocal,
      campaign.timezone
    );
    for (const plan of plans.filter(plan => plan.sequenceStep > 0)) {
      const existing = messages.find(
        message =>
          message.prospectId === prospect.id &&
          message.sequenceStep === plan.sequenceStep
      );
      if (!existing || existing.plannedAt || existing.status !== "approved")
        continue;
      const [result] = await db
        .update(brandVideoMessages)
        .set({ plannedAt: plan.plannedAt })
        .where(
          and(
            eq(brandVideoMessages.id, existing.id),
            eq(brandVideoMessages.status, "approved"),
            isNull(brandVideoMessages.plannedAt)
          )
        );
      restored += Number(result.affectedRows ?? 0);
    }
  }
  return restored;
}

/**
 * Terminal responses always win over a `scheduled` claim. This function is
 * shared by IMAP monitoring and can be used by future webhook/manual adapters.
 */
export async function markBrandVideoProspectTerminal(input: {
  prospectId: number;
  status: "replied" | "bounced" | "unsubscribed";
  eventType: "reply_detected" | "bounced" | "unsubscribed";
  detail: string;
  messageId?: number | null;
  occurredAt?: Date;
}) {
  const db = await requireDb();
  const occurredAt = input.occurredAt ?? new Date();
  const [prospect] = await db
    .select()
    .from(brandVideoProspects)
    .where(eq(brandVideoProspects.id, input.prospectId))
    .limit(1);
  if (!prospect) return false;
  // Repeated terminal observations repair interrupted cancellation; never revive a stopped prospect.
  const transitioned =
    isActiveProspect(prospect) || input.status === "unsubscribed";
  await db.transaction(async tx => {
    if (transitioned) {
      await tx
        .update(brandVideoProspects)
        .set({
          status: input.status,
          outreachStatus: "cancelled",
          repliedAt:
            input.status === "replied" ? occurredAt : prospect.repliedAt,
          unsubscribedAt:
            input.status === "unsubscribed"
              ? occurredAt
              : prospect.unsubscribedAt,
        })
        .where(
          and(
            eq(brandVideoProspects.id, prospect.id),
            eq(brandVideoProspects.campaignId, prospect.campaignId),
            ...(input.status === "unsubscribed"
              ? []
              : [inArray(brandVideoProspects.status, ["review", "approved"])])
          )
        );
    }
    await tx
      .update(brandVideoMessages)
      .set({
        status: "cancelled",
        error: `Cancelled after ${input.eventType}.`,
        plannedAt: null,
        scheduledAt: null,
        sendClaimToken: null,
        sendClaimedAt: null,
      })
      .where(
        and(
          eq(brandVideoMessages.prospectId, prospect.id),
          eq(brandVideoMessages.campaignId, prospect.campaignId),
          inArray(brandVideoMessages.status, [...UNSENT_OR_CLAIMED_STATUSES])
        )
      );
    if (transitioned)
      await tx.insert(brandVideoEvents).values({
        campaignId: prospect.campaignId,
        prospectId: prospect.id,
        messageId: input.messageId || null,
        eventType: input.eventType,
        detail: input.detail.slice(0, 4_000),
        occurredAt,
      });
  });
  return transitioned;
}

export async function getBrandVideoInboxTargets(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(
        and(
          eq(brandVideoProspects.campaignId, campaignId),
          inArray(brandVideoProspects.status, ["approved"])
        )
      ),
    readMessagesForCampaign(db, campaignId),
  ]);
  const messageByProspect = new Map<number, BrandVideoMessage[]>();
  for (const message of messages.filter(
    message =>
      message.providerMessageId &&
      (message.smtpAcceptedAt || message.sendAttemptedAt)
  )) {
    const current = messageByProspect.get(message.prospectId) || [];
    current.push(message);
    messageByProspect.set(message.prospectId, current);
  }
  return prospects
    .filter(
      prospect =>
        Boolean(messageByProspect.get(prospect.id)?.length) &&
        Boolean(prospect.normalizedEmail)
    )
    .map(prospect => ({
      prospect: {
        ...prospect,
        firstSentAt:
          prospect.firstSentAt ||
          messageByProspect
            .get(prospect.id)
            ?.find(message => message.sequenceStep === 0)?.sendAttemptedAt ||
          messageByProspect.get(prospect.id)?.[0]?.sendAttemptedAt ||
          null,
      },
      sentMessages: messageByProspect.get(prospect.id) || [],
    }));
}

export async function recordBrandVideoReplyCheck(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  await db
    .update(brandVideoCampaigns)
    .set({ lastReplyCheckAt: now })
    .where(eq(brandVideoCampaigns.id, campaignId));
  await db.insert(brandVideoEvents).values({
    campaignId,
    eventType: "reply_check",
    detail: "Bounded brand-video inbox scan completed.",
    occurredAt: now,
  });
}

async function sourceBackedDraftCandidates(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const byProspect = new Map<number, BrandVideoMessage[]>();
  for (const message of messages) {
    const current = byProspect.get(message.prospectId) || [];
    current.push(message);
    byProspect.set(message.prospectId, current);
  }
  return prospects
    .filter(prospect => {
      const drafts = byProspect.get(prospect.id) || [];
      return (
        prospect.status === "review" &&
        prospect.outreachStatus === "draft" &&
        prospect.draftVersion === BRAND_VIDEO_DRAFT_VERSION &&
        !prospect.firstSentAt &&
        hasBrandVideoSourceBackedTarget(prospect) &&
        hasValidBrandVideoSequence(drafts, "draft")
      );
    })
    .map(prospect => ({ prospect, messages: byProspect.get(prospect.id)! }))
    .sort((a, b) => compareBrandVideoLaunchPriority(a.prospect, b.prospect));
}

/** Reports the approved reserve only. Research discovery/import cannot implicitly approve contacts. */
export async function prepareBrandVideoReadyReserve(
  target = OUTREACH_READY_BUFFER_TARGET
) {
  const health = await getBrandVideoSendingHealth(target);
  return {
    approved: 0,
    skipped: health.lowSupply ? ("low-approved-supply" as const) : null,
    health,
  };
}

export async function getBrandVideoSendingHealth(
  reserveTarget = OUTREACH_READY_BUFFER_TARGET
): Promise<BrandVideoSendingHealth> {
  const campaign = await ensureBrandVideoCampaign();
  const db = await requireDb();
  const [prospects, messages, runs] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaign.id)),
    readMessagesForCampaign(db, campaign.id),
    db
      .select()
      .from(brandVideoDailyRuns)
      .where(eq(brandVideoDailyRuns.campaignId, campaign.id))
      .orderBy(desc(brandVideoDailyRuns.createdAt))
      .limit(1),
  ]);
  const initialMessages = new Map(
    messages
      .filter(message => message.sequenceStep === 0)
      .map(message => [message.prospectId, message])
  );
  const ready = prospects.filter(prospect => {
    const initial = initialMessages.get(prospect.id);
    return Boolean(
      prospect.status === "approved" &&
        prospect.outreachStatus === "approved" &&
        !prospect.firstSentAt &&
        prospect.draftVersion === BRAND_VIDEO_DRAFT_VERSION &&
        hasBrandVideoSourceBackedTarget(prospect) &&
        initial?.status === "approved" &&
        hasValidBrandVideoSequence(
          messages.filter(message => message.prospectId === prospect.id),
          "approved"
        )
    );
  });
  const draftCandidates = await sourceBackedDraftCandidates(campaign.id);
  const verifiedReady = [];
  for (const prospect of ready) {
    if (
      !(await getBrandVideoCrossCampaignConflict(prospect)) &&
      !(await hasBrandVideoIdentityDuplicate(db, prospect))
    )
      verifiedReady.push(prospect);
  }
  const latestRun = runs[0];
  return {
    campaign,
    readyInitialCount: verifiedReady.length,
    qualifiedCount: prospects.filter(prospect => prospect.qualified === 1)
      .length,
    totalProspectCount: prospects.length,
    sourceBackedDraftCount: draftCandidates.length,
    blockedCount: prospects.filter(
      prospect =>
        Boolean(prospect.crossCampaignBlock) ||
        prospect.outreachStatus === "cancelled"
    ).length,
    evidenceNeededCount: prospects.filter(
      prospect => !hasBrandVideoSourceBackedTarget(prospect)
    ).length,
    sentInitialCount: messages.filter(
      message =>
        message.sequenceStep === 0 &&
        message.status === "sent" &&
        Boolean(message.smtpAcceptedAt)
    ).length,
    claimedForReviewCount: messages.filter(
      message => message.status === "scheduled" || message.status === "failed"
    ).length,
    reserveTarget,
    lowSupply: verifiedReady.length < reserveTarget,
    lastReplyCheckAt: campaign.lastReplyCheckAt,
    lastRunAt: campaign.lastRunAt,
    latestRun: latestRun
      ? {
          runDate: latestRun.runDate,
          status: latestRun.status,
          newReserved: latestRun.newReserved,
          newSent: latestRun.newSent,
          followupsSent: latestRun.followupsSent,
          repliesDetected: latestRun.repliesDetected,
          errorCount: latestRun.errorCount,
          summary: latestRun.summary,
        }
      : null,
  };
}

/** Token-scoped opt-out never changes another campaign's queue or suppression rows. */
export async function unsubscribeBrandVideoByToken(token: string) {
  if (!/^[a-f0-9]{48}$/i.test(token)) return false;
  const db = await requireDb();
  const campaign = await ensureBrandVideoCampaign();
  const [prospect] = await db
    .select()
    .from(brandVideoProspects)
    .where(
      and(
        eq(brandVideoProspects.unsubscribeToken, token.toLowerCase()),
        eq(brandVideoProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) return false;
  await markBrandVideoProspectTerminal({
    prospectId: prospect.id,
    status: "unsubscribed",
    eventType: "unsubscribed",
    detail: "Opted out through the dedicated Brand Video unsubscribe endpoint.",
  });
  return true;
}
