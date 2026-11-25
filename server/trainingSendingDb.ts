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
  trainingOutreachCampaigns,
  trainingOutreachDailyRuns,
  trainingOutreachEvents,
  trainingOutreachMessages,
  trainingOutreachProspects,
  type TrainingOutreachCampaign,
  type TrainingOutreachMessage,
  type TrainingOutreachProspect,
} from "../drizzle/schema";
import {
  TRAINING_DAILY_NEW_LIMIT,
  TRAINING_OUTREACH_DRAFT_VERSION,
  TRAINING_OUTREACH_TIME_ZONE,
  TRAINING_READY_RESERVE_TARGET,
  addTrainingBusinessDays,
  buildTrainingSequence,
  hasSourceBackedTrainingEmail,
  isPublicTrainingHttpUrl,
  isTrainingTerminalStatus,
  normalizeTrainingEmail,
} from "../shared/trainingOutreach";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { getDb } from "./db";
import {
  ensureTrainingCampaign,
  getTrainingCrossCampaignConflict,
} from "./trainingOutreach";

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

export type TrainingDeliveryCandidate = {
  message: TrainingOutreachMessage;
  prospect: TrainingOutreachProspect;
};

export type TrainingDailyLease = {
  id: number;
  leaseToken: string;
  runDate: string;
};

export type TrainingSendingHealth = {
  campaign: TrainingOutreachCampaign;
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

export type TrainingPointOfSendCheck =
  | {
      ready: true;
      campaign: TrainingOutreachCampaign;
      prospect: TrainingOutreachProspect;
      message: TrainingOutreachMessage;
    }
  | { ready: false; reason: string };

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

function newToken() {
  return randomBytes(18).toString("hex");
}

function isUniqueViolation(error: unknown) { return outreachUniqueViolation(error); }

function asErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    4_000
  );
}

function hasSourcesContainingEmail(prospect: TrainingOutreachProspect) {
  try {
    const sources: unknown = JSON.parse(prospect.sourcesJson);
    return (
      Array.isArray(sources) &&
      sources.some(
        source =>
          source &&
          typeof source === "object" &&
          "url" in source &&
          (source as { url?: unknown }).url === prospect.primaryEmailSourceUrl
      )
    );
  } catch {
    return false;
  }
}

/** Public evidence, qualification, current draft context, and no retained block are all required. */
export function hasSourceBackedTrainingTarget(
  prospect: TrainingOutreachProspect
) {
  return Boolean(
    prospect.qualificationStatus === "qualified" &&
      prospect.status !== "not_fit" &&
      prospect.contactReadiness === "verified" &&
      !prospect.crossCampaignBlock &&
      normalizeTrainingEmail(prospect.primaryEmail) ===
        prospect.normalizedEmail &&
      hasSourceBackedTrainingEmail({
        email: prospect.primaryEmail,
        sourceUrl: prospect.primaryEmailSourceUrl,
      }) &&
      isPublicTrainingHttpUrl(prospect.website) &&
      prospect.localAuthorityEvidence?.trim() &&
      prospect.verifiedObservation?.trim() &&
      prospect.useCase?.trim() &&
      prospect.pilotScope?.trim() &&
      hasSourcesContainingEmail(prospect)
  );
}

export function hasValidTrainingSequence(
  messages: TrainingOutreachMessage[],
  status: "draft" | "approved"
) {
  return (
    messages.length === 3 &&
    [0, 4, 5].every((dueAfterBusinessDays, sequenceStep) =>
      messages.some(
        message =>
          message.sequenceStep === sequenceStep &&
          message.dueAfterBusinessDays === dueAfterBusinessDays &&
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

/**
 * Pure READY NEW eligibility, not a point-of-send or follow-up gate. Retained
 * plans, claims, transport evidence, terminal timestamps, and operator notes
 * exclude a record without clearing or rewriting any of that protected state.
 * Live duplicate/cross-campaign clearance remains the caller's responsibility.
 */
export function hasUntouchedApprovedTrainingInitialTarget(
  prospect: TrainingOutreachProspect,
  messages: TrainingOutreachMessage[]
) {
  return Boolean(
    prospect.status === "approved" &&
      prospect.outreachStatus === "approved" &&
      prospect.firstSentAt == null &&
      prospect.lastSentAt == null &&
      prospect.repliedAt == null &&
      prospect.unsubscribedAt == null &&
      !prospect.manualNotes &&
      prospect.draftVersion === TRAINING_OUTREACH_DRAFT_VERSION &&
      hasSourceBackedTrainingTarget(prospect) &&
      hasValidTrainingSequence(messages, "approved") &&
      messages.every(
        message =>
          message.prospectId === prospect.id &&
          message.plannedAt == null &&
          message.scheduledAt == null &&
          message.sentAt == null &&
          message.deliveredAt == null &&
          message.providerMessageId == null &&
          message.sendClaimToken == null &&
          message.sendClaimedAt == null &&
          message.sendAttemptedAt == null &&
          message.smtpAcceptedAt == null
      )
  );
}

function isActiveProspect(prospect: TrainingOutreachProspect) {
  return !TERMINAL_STATUSES.includes(
    prospect.status as (typeof TERMINAL_STATUSES)[number]
  );
}

export function buildTrainingOutboundMessageId(
  messageId: number,
  claimToken: string
) {
  return `<training-${messageId}-${claimToken}@${MESSAGE_ID_DOMAIN}>`;
}

/** Exported for the trigger adapter; it is a read-only campaign lookup. */
export async function getTrainingCampaignById(campaignId: number) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.id, campaignId))
    .limit(1);
  return campaign;
}

export async function getTrainingCampaignForScheduledTask(taskUid: string) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.schedulerTaskUid, taskUid))
    .limit(1);
  return campaign;
}

async function readMessagesForCampaign(db: Database, campaignId: number) {
  return db
    .select()
    .from(trainingOutreachMessages)
    .where(eq(trainingOutreachMessages.campaignId, campaignId))
    .orderBy(
      asc(trainingOutreachMessages.prospectId),
      asc(trainingOutreachMessages.sequenceStep)
    );
}

async function hasTrainingIdentityDuplicate(
  db: Database,
  prospect: TrainingOutreachProspect
) {
  const identities = [
    eq(
      trainingOutreachProspects.normalizedBusiness,
      prospect.normalizedBusiness
    ),
  ];
  if (prospect.normalizedDomain)
    identities.push(
      eq(trainingOutreachProspects.normalizedDomain, prospect.normalizedDomain)
    );
  if (prospect.normalizedEmail)
    identities.push(
      eq(trainingOutreachProspects.normalizedEmail, prospect.normalizedEmail)
    );
  const [duplicate] = await db
    .select({ id: trainingOutreachProspects.id })
    .from(trainingOutreachProspects)
    .where(
      and(
        eq(trainingOutreachProspects.campaignId, prospect.campaignId),
        ne(trainingOutreachProspects.id, prospect.id),
        or(...identities)
      )
    )
    .limit(1);
  return Boolean(duplicate);
}

/** Day rows provide an atomic ten-new-contact cap across concurrent callbacks. */
export async function reserveTrainingDailyRun(input: {
  campaignId: number;
  runDate: string;
  now?: Date;
}): Promise<TrainingDailyLease | null> {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const leaseToken = newToken();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  try {
    const result = await db.insert(trainingOutreachDailyRuns).values({
      campaignId: input.campaignId,
      runDate: input.runDate,
      status: "started",
      leaseToken,
      leaseExpiresAt,
      summary: "Reserved by the Training 09:00 Central daily dispatcher.",
    });
    return {
      id: Number(result[0].insertId),
      leaseToken,
      runDate: input.runDate,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const [existing] = await db
    .select()
    .from(trainingOutreachDailyRuns)
    .where(
      and(
        eq(trainingOutreachDailyRuns.campaignId, input.campaignId),
        eq(trainingOutreachDailyRuns.runDate, input.runDate)
      )
    )
    .limit(1);
  if (
    !existing ||
    existing.status === "complete" ||
    existing.status === "skipped"
  )
    return null;
  const [reclaimed] = await db
    .update(trainingOutreachDailyRuns)
    .set({
      status: "started",
      leaseToken,
      leaseExpiresAt,
      summary:
        "Expired Training daily-run lease reclaimed; prior reservations retained.",
    })
    .where(
      and(
        eq(trainingOutreachDailyRuns.id, existing.id),
        inArray(trainingOutreachDailyRuns.status, ["started", "failed"]),
        or(
          isNull(trainingOutreachDailyRuns.leaseExpiresAt),
          lt(trainingOutreachDailyRuns.leaseExpiresAt, now)
        )
      )
    );
  if (Number(reclaimed.affectedRows ?? 0) !== 1) return null;
  return { id: existing.id, leaseToken, runDate: input.runDate };
}

export async function completeTrainingDailyRun(input: {
  campaignId: number;
  lease: TrainingDailyLease;
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
    .from(trainingOutreachDailyRuns)
    .where(
      and(
        eq(trainingOutreachDailyRuns.id, input.lease.id),
        eq(trainingOutreachDailyRuns.campaignId, input.campaignId),
        eq(trainingOutreachDailyRuns.leaseToken, input.lease.leaseToken)
      )
    )
    .limit(1);
  if (!current || current.status !== "started") return false;
  const accepted = (await readMessagesForCampaign(db, input.campaignId)).filter(
    message => message.status === "sent" && message.smtpAcceptedAt &&
      getOutreachLocalMoment(message.smtpAcceptedAt, TRAINING_OUTREACH_TIME_ZONE).dateKey === input.lease.runDate
  );
  await db
    .update(trainingOutreachDailyRuns)
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
        eq(trainingOutreachDailyRuns.id, input.lease.id),
        eq(trainingOutreachDailyRuns.campaignId, input.campaignId),
        eq(trainingOutreachDailyRuns.leaseToken, input.lease.leaseToken),
        eq(trainingOutreachDailyRuns.status, "started")
      )
    );
  await db
    .update(trainingOutreachCampaigns)
    .set({ lastRunAt: now })
    .where(eq(trainingOutreachCampaigns.id, input.campaignId));
  return true;
}

export async function getTrainingInitialCandidates(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(trainingOutreachProspects)
      .where(eq(trainingOutreachProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const initials = new Map(
    messages
      .filter(
        message => message.sequenceStep === 0 && message.status === "approved"
      )
      .map(message => [message.prospectId, message])
  );
  return prospects
    .filter(
      prospect =>
        hasUntouchedApprovedTrainingInitialTarget(
          prospect,
          messages.filter(message => message.prospectId === prospect.id)
        ) &&
        Boolean(initials.get(prospect.id))
    )
    .map(prospect => ({ prospect, message: initials.get(prospect.id)! }))
    .sort(
      (left, right) =>
        right.prospect.fitScore - left.prospect.fitScore ||
        left.prospect.priorityRank - right.prospect.priorityRank ||
        left.prospect.id - right.prospect.id
    );
}

export async function getDueTrainingFollowupCandidates(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(trainingOutreachProspects)
      .where(eq(trainingOutreachProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const prospectById = new Map(
    prospects.map(prospect => [prospect.id, prospect])
  );
  const today = getOutreachLocalMoment(
    now,
    TRAINING_OUTREACH_TIME_ZONE
  ).dateKey;
  return messages
    .filter(message => {
      if (
        message.sequenceStep < 1 ||
        message.status !== "approved" ||
        !message.plannedAt ||
        message.plannedAt > now
      )
        return false;
      const prospect = prospectById.get(message.prospectId);
      if (
        !prospect ||
        prospect.status !== "approved" ||
        prospect.outreachStatus !== "in_sequence" ||
        !prospect.firstSentAt ||
        prospect.draftVersion !== TRAINING_OUTREACH_DRAFT_VERSION ||
        !hasSourceBackedTrainingTarget(prospect)
      )
        return false;
      const previous = messages.find(
        candidate =>
          candidate.prospectId === prospect.id &&
          candidate.sequenceStep === message.sequenceStep - 1 &&
          candidate.status === "sent" &&
          candidate.smtpAcceptedAt &&
          candidate.providerMessageId
      );
      if (!previous) return false;
      // Never catch up two sequence steps in one weekday run.
      return (
        !prospect.lastSentAt ||
        getOutreachLocalMoment(prospect.lastSentAt, TRAINING_OUTREACH_TIME_ZONE)
          .dateKey !== today
      );
    })
    .map(message => ({
      prospect: prospectById.get(message.prospectId)!,
      message,
    }))
    .sort(
      (left, right) =>
        left.message.plannedAt!.getTime() -
          right.message.plannedAt!.getTime() ||
        right.prospect.fitScore - left.prospect.fitScore ||
        left.prospect.id - right.prospect.id
    );
}

export async function getTrainingPreviousSentMessage(
  prospectId: number,
  step: number
) {
  if (step < 1) return undefined;
  const db = await requireDb();
  const [message] = await db
    .select()
    .from(trainingOutreachMessages)
    .where(
      and(
        eq(trainingOutreachMessages.prospectId, prospectId),
        eq(trainingOutreachMessages.sequenceStep, step - 1),
        eq(trainingOutreachMessages.status, "sent"),
        sql`${trainingOutreachMessages.smtpAcceptedAt} IS NOT NULL`
      )
    )
    .limit(1);
  return message;
}

/** Re-reads campaign, contact, recipient evidence, sequence, and collision at send time. */
export async function getTrainingPointOfSendCheck(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken?: string;
  now?: Date;
}): Promise<TrainingPointOfSendCheck> {
  const db = await requireDb();
  const [campaign, prospects, messages] = await Promise.all([
    getTrainingCampaignById(input.campaignId),
    db
      .select()
      .from(trainingOutreachProspects)
      .where(
        and(
          eq(trainingOutreachProspects.id, input.prospectId),
          eq(trainingOutreachProspects.campaignId, input.campaignId)
        )
      )
      .limit(1),
    db
      .select()
      .from(trainingOutreachMessages)
      .where(
        and(
          eq(trainingOutreachMessages.id, input.messageId),
          eq(trainingOutreachMessages.campaignId, input.campaignId),
          eq(trainingOutreachMessages.prospectId, input.prospectId)
        )
      )
      .limit(1),
  ]);
  const prospect = prospects[0];
  const message = messages[0];
  if (!campaign || !prospect || !message)
    return {
      ready: false,
      reason: "Campaign, prospect, or message no longer exists.",
    };
  if (campaign.status !== "active")
    return { ready: false, reason: "Campaign is paused or not active." };
  const moment = getOutreachLocalMoment(
    input.now ?? new Date(),
    campaign.timezone
  );
  if (moment.hour < 9 || moment.hour >= 17)
    return {
      ready: false,
      reason: "Outside the daily 09:00–16:59 Central send window.",
    };
  if (
    campaign.timezone !== TRAINING_OUTREACH_TIME_ZONE ||
    campaign.sendHourLocal !== 9 ||
    campaign.dailyNewLimit !== TRAINING_DAILY_NEW_LIMIT ||
    !campaign.schedulerTaskUid ||
    !campaign.physicalPostalAddress?.trim() ||
    campaign.senderEmail !== "jeremy@jeristotleproductions.com"
  )
    return {
      ready: false,
      reason: "Campaign sending configuration or scheduler link is invalid.",
    };
  if (!campaign.listApprovedAt || !campaign.launchApprovedAt)
    return {
      ready: false,
      reason: "Campaign list or launch approval is missing.",
    };
  if (prospect.status !== "approved" || !isActiveProspect(prospect))
    return { ready: false, reason: "Prospect is terminal or not approved." };
  if (prospect.draftVersion !== TRAINING_OUTREACH_DRAFT_VERSION)
    return {
      ready: false,
      reason: "Prospect is not on the current approved draft version.",
    };
  if (!hasSourceBackedTrainingTarget(prospect))
    return {
      ready: false,
      reason: "Recipient lacks current public email evidence or qualification.",
    };
  const allowedSequence =
    (message.sequenceStep === 0 &&
      prospect.outreachStatus === "approved" &&
      !prospect.firstSentAt) ||
    (message.sequenceStep > 0 &&
      prospect.outreachStatus === "in_sequence" &&
      prospect.firstSentAt);
  if (!allowedSequence)
    return {
      ready: false,
      reason: "Prospect sequence state no longer permits this step.",
    };
  if (
    ![0, 4, 5].includes(message.dueAfterBusinessDays) ||
    !message.subject?.trim() ||
    !message.htmlBody?.trim() ||
    !message.textBody?.trim() ||
    message.sendAttemptedAt ||
    message.smtpAcceptedAt
  )
    return {
      ready: false,
      reason: "Draft changed, is invalid, or SMTP was already attempted.",
    };
  if (message.sequenceStep > 0) {
    const previous = await getTrainingPreviousSentMessage(
      prospect.id,
      message.sequenceStep
    );
    if (
      !previous?.providerMessageId ||
      !message.plannedAt ||
      message.plannedAt > (input.now ?? new Date())
    )
      return {
        ready: false,
        reason: "Follow-up is not due or lacks an accepted prior thread.",
      };
  }
  if (message.status !== (input.claimToken ? "scheduled" : "approved"))
    return {
      ready: false,
      reason: "Message is no longer in the expected delivery state.",
    };
  if (input.claimToken && message.sendClaimToken !== input.claimToken)
    return {
      ready: false,
      reason: "Message claim is owned by another delivery worker.",
    };
  const [conflict, duplicate] = await Promise.all([
    getTrainingCrossCampaignConflict(db, {
      business: prospect.normalizedBusiness,
      domain: prospect.normalizedDomain,
      email: prospect.normalizedEmail,
    }),
    hasTrainingIdentityDuplicate(db, prospect),
  ]);
  if (conflict) return { ready: false, reason: conflict };
  if (duplicate)
    return {
      ready: false,
      reason: "Duplicate Training identity requires manual review.",
    };
  return { ready: true, campaign, prospect, message };
}

class ClaimUnavailable extends Error {}

/** Initial daily reservation and message claim commit together or roll back together. */
export async function claimTrainingMessageForSend(input: {
  candidate: TrainingDeliveryCandidate;
  claimToken: string;
  providerMessageId: string;
  now: Date;
  initialLease?: TrainingDailyLease;
}) {
  // Both initials and follow-ups belong to the same owned daily callback.
  if (!input.initialLease) return false;
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      if (input.initialLease) {
        const [owned] = await tx.update(trainingOutreachDailyRuns).set({ leaseToken: input.initialLease.leaseToken }).where(and(
          eq(trainingOutreachDailyRuns.id, input.initialLease.id), eq(trainingOutreachDailyRuns.campaignId, input.candidate.prospect.campaignId),
          eq(trainingOutreachDailyRuns.runDate, input.initialLease.runDate), eq(trainingOutreachDailyRuns.status, "started"),
          eq(trainingOutreachDailyRuns.leaseToken, input.initialLease.leaseToken), gte(trainingOutreachDailyRuns.leaseExpiresAt, input.now)
        ));
        if (Number(owned.affectedRows ?? 0) !== 1) throw new ClaimUnavailable("Daily continuation owner expired or changed");
      }
      if (input.candidate.message.sequenceStep === 0) {
        if (!input.initialLease)
          throw new ClaimUnavailable("Initial message has no daily run lease.");
        const [reserved] = await tx
          .update(trainingOutreachDailyRuns)
          .set({
            newReserved: sql`${trainingOutreachDailyRuns.newReserved} + 1`,
          })
          .where(
            and(
              eq(trainingOutreachDailyRuns.id, input.initialLease.id),
              eq(
                trainingOutreachDailyRuns.campaignId,
                input.candidate.prospect.campaignId
              ),
              eq(trainingOutreachDailyRuns.runDate, input.initialLease.runDate),
              eq(trainingOutreachDailyRuns.status, "started"),
              eq(
                trainingOutreachDailyRuns.leaseToken,
                input.initialLease.leaseToken
              ),
              gte(trainingOutreachDailyRuns.leaseExpiresAt, input.now),
              lt(
                trainingOutreachDailyRuns.newReserved,
                TRAINING_DAILY_NEW_LIMIT
              )
            )
          );
        if (Number(reserved.affectedRows ?? 0) !== 1)
          throw new ClaimUnavailable(
            "Daily initial-message cap or lease is unavailable."
          );
      }
      const [claimed] = await tx
        .update(trainingOutreachMessages)
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
            eq(trainingOutreachMessages.id, input.candidate.message.id),
            eq(
              trainingOutreachMessages.campaignId,
              input.candidate.prospect.campaignId
            ),
            eq(
              trainingOutreachMessages.prospectId,
              input.candidate.prospect.id
            ),
            eq(trainingOutreachMessages.status, "approved"),
            isNull(trainingOutreachMessages.sendAttemptedAt),
            isNull(trainingOutreachMessages.smtpAcceptedAt),
            sql`EXISTS (SELECT 1 FROM ${trainingOutreachDailyRuns} r WHERE r.id = ${input.initialLease!.id} AND r.campaignId = ${trainingOutreachMessages.campaignId} AND r.runDate = ${input.initialLease!.runDate} AND r.status = 'started' AND r.leaseToken = ${input.initialLease!.leaseToken} AND r.leaseExpiresAt >= ${input.now})`,
            sql`EXISTS (SELECT 1 FROM ${trainingOutreachProspects} WHERE ${trainingOutreachProspects.id} = ${trainingOutreachMessages.prospectId} AND ${trainingOutreachProspects.campaignId} = ${trainingOutreachMessages.campaignId} AND ${trainingOutreachProspects.draftVersion} = ${TRAINING_OUTREACH_DRAFT_VERSION} AND ${trainingOutreachProspects.status} = 'approved' AND ${trainingOutreachProspects.outreachStatus} IN ('approved', 'in_sequence') AND ${trainingOutreachProspects.contactReadiness} = 'verified' AND ${trainingOutreachProspects.crossCampaignBlock} IS NULL)`
          )
        );
      if (Number(claimed.affectedRows ?? 0) !== 1)
        throw new ClaimUnavailable(
          "Message was claimed, cancelled, or changed by another worker."
        );
    });
    return true;
  } catch (error) {
    if (error instanceof ClaimUnavailable) return false;
    throw error;
  }
}

/** Atomic durable audit write immediately before transport. */
export async function recordTrainingSendAttempt(input: {
  messageId: number;
  claimToken: string;
  now: Date;
  dailyLease?: TrainingDailyLease;
}) {
  const ownedDailyLease = input.dailyLease;
  if (!ownedDailyLease) return false;
  const db = await requireDb();
  const [result] = await db
    .update(trainingOutreachMessages)
    .set({ sendAttemptedAt: input.now })
    .where(
      and(
        eq(trainingOutreachMessages.id, input.messageId),
        eq(trainingOutreachMessages.status, "scheduled"),
        eq(trainingOutreachMessages.sendClaimToken, input.claimToken),
        isNull(trainingOutreachMessages.sendAttemptedAt),
        isNull(trainingOutreachMessages.smtpAcceptedAt),
        sql`EXISTS (SELECT 1 FROM ${trainingOutreachDailyRuns} r WHERE r.id = ${ownedDailyLease.id} AND r.campaignId = ${trainingOutreachMessages.campaignId} AND r.runDate = ${ownedDailyLease.runDate} AND r.status = 'started' AND r.leaseToken = ${ownedDailyLease.leaseToken} AND r.leaseExpiresAt >= ${input.now})`,
        sql`EXISTS (SELECT 1 FROM ${trainingOutreachProspects} p INNER JOIN ${trainingOutreachCampaigns} c ON c.id = p.campaignId WHERE p.id = ${trainingOutreachMessages.prospectId} AND p.status = 'approved' AND p.outreachStatus IN ('approved', 'in_sequence') AND p.contactReadiness = 'verified' AND p.crossCampaignBlock IS NULL AND c.status = 'active' AND c.launchApprovedAt IS NOT NULL AND c.listApprovedAt IS NOT NULL)`
      )
    );
  return Number(result.affectedRows ?? 0) === 1;
}

/** Claims are releasable only before SMTP. Attempted rows are never blindly retried. */
export async function releaseTrainingUnattemptedClaim(input: {
  messageId: number;
  claimToken: string;
  reason: string;
}) {
  const db = await requireDb();
  await db
    .update(trainingOutreachMessages)
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
        eq(trainingOutreachMessages.id, input.messageId),
        eq(trainingOutreachMessages.status, "scheduled"),
        eq(trainingOutreachMessages.sendClaimToken, input.claimToken),
        isNull(trainingOutreachMessages.sendAttemptedAt),
        isNull(trainingOutreachMessages.smtpAcceptedAt)
      )
    );
}

export async function markTrainingDeliveryAmbiguousFailure(input: {
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
    .update(trainingOutreachMessages)
    .set({
      status: "failed",
      error: reason,
      sendClaimToken: null,
      sendClaimedAt: null,
    })
    .where(
      and(
        eq(trainingOutreachMessages.id, input.messageId),
        eq(trainingOutreachMessages.campaignId, input.campaignId),
        eq(trainingOutreachMessages.prospectId, input.prospectId),
        eq(trainingOutreachMessages.status, "scheduled"),
        eq(trainingOutreachMessages.sendClaimToken, input.claimToken)
      )
    );
  if (Number(result.affectedRows ?? 0) === 1)
    await db.insert(trainingOutreachEvents).values({
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

/** Records SMTP acceptance and plans only the immediate next step from the actual acceptance timestamp. */
export async function finalizeTrainingSmtpAcceptance(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken: string;
  sequenceStep: number;
  claimedProviderMessageId: string;
  providerMessageId: string;
  acceptedAt: Date;
}) {
  const db = await requireDb();
  const [before] = await db
    .select()
    .from(trainingOutreachMessages)
    .where(eq(trainingOutreachMessages.id, input.messageId))
    .limit(1);
  const terminalCancellationWon = Boolean(
    before &&
      before.status === "cancelled" &&
      before.providerMessageId === input.claimedProviderMessageId &&
      before.sendAttemptedAt
  );
  const [result] = await db
    .update(trainingOutreachMessages)
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
        eq(trainingOutreachMessages.id, input.messageId),
        eq(trainingOutreachMessages.campaignId, input.campaignId),
        eq(trainingOutreachMessages.prospectId, input.prospectId),
        or(
          and(
            eq(trainingOutreachMessages.status, "scheduled"),
            eq(trainingOutreachMessages.sendClaimToken, input.claimToken)
          ),
          and(
            eq(trainingOutreachMessages.status, "cancelled"),
            eq(
              trainingOutreachMessages.providerMessageId,
              input.claimedProviderMessageId
            ),
            sql`${trainingOutreachMessages.sendAttemptedAt} IS NOT NULL`
          )
        )
      )
    );
  if (Number(result.affectedRows ?? 0) !== 1) return false;
  if (terminalCancellationWon) {
    await db.insert(trainingOutreachEvents).values({
      campaignId: input.campaignId,
      prospectId: input.prospectId,
      messageId: input.messageId,
      eventType: "smtp_accepted_after_terminal",
      detail:
        "SMTP accepted after terminal cancellation; no follow-up was planned.",
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
    .update(trainingOutreachProspects)
    .set(prospectUpdate)
    .where(
      and(
        eq(trainingOutreachProspects.id, input.prospectId),
        eq(trainingOutreachProspects.campaignId, input.campaignId),
        eq(trainingOutreachProspects.status, "approved")
      )
    );

  if (input.sequenceStep < 2) {
    const campaign = await getTrainingCampaignById(input.campaignId);
    const nextStep = input.sequenceStep + 1;
    const dueAfterBusinessDays = nextStep === 1 ? 4 : 5;
    if (campaign) {
      const plannedAt = addTrainingBusinessDays(
        input.acceptedAt,
        dueAfterBusinessDays,
        campaign.sendHourLocal,
        campaign.timezone
      );
      await db
        .update(trainingOutreachMessages)
        .set({ plannedAt })
        .where(
          and(
            eq(trainingOutreachMessages.campaignId, input.campaignId),
            eq(trainingOutreachMessages.prospectId, input.prospectId),
            eq(trainingOutreachMessages.sequenceStep, nextStep),
            eq(trainingOutreachMessages.status, "approved"),
            isNull(trainingOutreachMessages.plannedAt)
          )
        );
    }
  }
  await db.insert(trainingOutreachEvents).values({
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

/** Repairs only missing plans derived from accepted prior sends, never a planned date. */
export async function ensureTrainingFollowupPlans(campaignId: number) {
  const db = await requireDb();
  const [campaign, prospects, messages] = await Promise.all([
    getTrainingCampaignById(campaignId),
    db
      .select()
      .from(trainingOutreachProspects)
      .where(eq(trainingOutreachProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  if (!campaign) return 0;
  let restored = 0;
  for (const prospect of prospects) {
    if (
      prospect.status !== "approved" ||
      prospect.outreachStatus !== "in_sequence"
    )
      continue;
    for (const step of [1, 2]) {
      const message = messages.find(
        candidate =>
          candidate.prospectId === prospect.id &&
          candidate.sequenceStep === step
      );
      const previous = messages.find(
        candidate =>
          candidate.prospectId === prospect.id &&
          candidate.sequenceStep === step - 1 &&
          candidate.status === "sent" &&
          candidate.smtpAcceptedAt
      );
      if (
        !message ||
        !previous?.smtpAcceptedAt ||
        message.plannedAt ||
        message.status !== "approved"
      )
        continue;
      const plannedAt = addTrainingBusinessDays(
        previous.smtpAcceptedAt,
        step === 1 ? 4 : 5,
        campaign.sendHourLocal,
        campaign.timezone
      );
      const [updated] = await db
        .update(trainingOutreachMessages)
        .set({ plannedAt })
        .where(
          and(
            eq(trainingOutreachMessages.id, message.id),
            eq(trainingOutreachMessages.status, "approved"),
            isNull(trainingOutreachMessages.plannedAt)
          )
        );
      restored += Number(updated.affectedRows ?? 0);
    }
  }
  return restored;
}

/** A reply, including OOO, is terminal. No return-date or automatic restart exists. */
export async function markTrainingProspectTerminal(input: {
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
    .from(trainingOutreachProspects)
    .where(eq(trainingOutreachProspects.id, input.prospectId))
    .limit(1);
  if (!prospect) return false;
  const transitioned =
    isActiveProspect(prospect) || input.status === "unsubscribed";
  await db.transaction(async tx => {
    if (transitioned)
      await tx
        .update(trainingOutreachProspects)
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
            eq(trainingOutreachProspects.id, prospect.id),
            eq(trainingOutreachProspects.campaignId, prospect.campaignId),
            ...(input.status === "unsubscribed"
              ? []
              : [
                  inArray(trainingOutreachProspects.status, [
                    "review",
                    "approved",
                  ]),
                ])
          )
        );
    await tx
      .update(trainingOutreachMessages)
      .set({
        status: "cancelled",
        error: `Cancelled after ${input.eventType}. No automatic restart.`,
        plannedAt: null,
        scheduledAt: null,
        sendClaimToken: null,
        sendClaimedAt: null,
      })
      .where(
        and(
          eq(trainingOutreachMessages.prospectId, prospect.id),
          eq(trainingOutreachMessages.campaignId, prospect.campaignId),
          inArray(trainingOutreachMessages.status, [
            ...UNSENT_OR_CLAIMED_STATUSES,
          ])
        )
      );
    if (transitioned)
      await tx.insert(trainingOutreachEvents).values({
        campaignId: prospect.campaignId,
        prospectId: prospect.id,
        messageId: input.messageId || null,
        eventType: input.eventType,
        detail: input.detail.slice(0, 4_000),
        metadataJson: JSON.stringify({ noAutomaticRestart: true }),
        occurredAt,
      });
  });
  return transitioned;
}

export async function getTrainingInboxTargets(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(trainingOutreachProspects)
      .where(
        and(
          eq(trainingOutreachProspects.campaignId, campaignId),
          eq(trainingOutreachProspects.status, "approved")
        )
      ),
    readMessagesForCampaign(db, campaignId),
  ]);
  const byProspect = new Map<number, TrainingOutreachMessage[]>();
  for (const message of messages.filter(
    message =>
      message.providerMessageId &&
      (message.smtpAcceptedAt || message.sendAttemptedAt)
  )) {
    const current = byProspect.get(message.prospectId) || [];
    current.push(message);
    byProspect.set(message.prospectId, current);
  }
  return prospects
    .filter(
      prospect =>
        Boolean(byProspect.get(prospect.id)?.length) &&
        Boolean(prospect.normalizedEmail)
    )
    .map(prospect => ({
      prospect: {
        ...prospect,
        firstSentAt:
          prospect.firstSentAt ||
          byProspect
            .get(prospect.id)
            ?.find(message => message.sequenceStep === 0)?.sendAttemptedAt ||
          byProspect.get(prospect.id)?.[0]?.sendAttemptedAt ||
          null,
      },
      sentMessages: byProspect.get(prospect.id) || [],
    }));
}

export async function recordTrainingReplyCheck(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  await db
    .update(trainingOutreachCampaigns)
    .set({ lastReplyCheckAt: now })
    .where(eq(trainingOutreachCampaigns.id, campaignId));
  await db.insert(trainingOutreachEvents).values({
    campaignId,
    eventType: "reply_check",
    detail: "Bounded Training inbox scan completed.",
    occurredAt: now,
  });
}

async function createApprovedTrainingDrafts(
  db: Database,
  campaignId: number,
  prospect: TrainingOutreachProspect
) {
  const messages = await db
    .select()
    .from(trainingOutreachMessages)
    .where(eq(trainingOutreachMessages.prospectId, prospect.id));
  if (!hasSourceBackedTrainingTarget(prospect)) return 0;

  // Legacy imports approved complete triples before the current copy/version
  // existed. While the prospect retains that old version, the normal candidate
  // and point-of-send gates keep it out of delivery. Replace only a wholly
  // untouched approved triple, and do not mark its prospect current until all
  // three guarded copy writes have succeeded.
  if (
    prospect.draftVersion !== TRAINING_OUTREACH_DRAFT_VERSION &&
    prospect.status === "approved" &&
    prospect.outreachStatus === "approved" &&
    !prospect.firstSentAt &&
    !prospect.lastSentAt &&
    hasValidTrainingSequence(messages, "approved") &&
    messages.every(
      message =>
        !message.plannedAt &&
        !message.scheduledAt &&
        !message.sentAt &&
        !message.smtpAcceptedAt &&
        !message.deliveredAt &&
        !message.providerMessageId &&
        !message.sendClaimToken &&
        !message.sendClaimedAt &&
        !message.sendAttemptedAt
    )
  ) {
    const currentDrafts = buildTrainingSequence({
      businessName: prospect.businessName,
      contactName: prospect.primaryContactName,
      recipientIsNamed: prospect.emailRecipientType === "named",
      verifiedObservation: prospect.verifiedObservation || "",
      useCase: prospect.useCase || "",
      pilotScope: prospect.pilotScope || "",
    });
    let regenerated = 0;
    for (const draft of currentDrafts) {
      const legacy = messages.find(
        message =>
          message.sequenceStep === draft.sequenceStep &&
          message.dueAfterBusinessDays === draft.dueAfterBusinessDays
      );
      if (!legacy) return 0;
      // Copy equality makes a concurrent manual edit a failed regeneration
      // rather than an overwrite. The rest of the predicate prevents a stale
      // reserve pass from changing a planned, claimed, attempted, or sent row.
      const [updated] = await db
        .update(trainingOutreachMessages)
        .set({
          status: "approved",
          subject: draft.subject,
          textBody: draft.text,
          htmlBody: draft.html,
          dueAfterBusinessDays: draft.dueAfterBusinessDays,
        })
        .where(
          and(
            eq(trainingOutreachMessages.id, legacy.id),
            eq(trainingOutreachMessages.campaignId, campaignId),
            eq(trainingOutreachMessages.prospectId, prospect.id),
            eq(trainingOutreachMessages.sequenceStep, draft.sequenceStep),
            eq(
              trainingOutreachMessages.dueAfterBusinessDays,
              draft.dueAfterBusinessDays
            ),
            eq(trainingOutreachMessages.status, "approved"),
            eq(trainingOutreachMessages.subject, legacy.subject),
            eq(trainingOutreachMessages.textBody, legacy.textBody),
            eq(trainingOutreachMessages.htmlBody, legacy.htmlBody),
            isNull(trainingOutreachMessages.plannedAt),
            isNull(trainingOutreachMessages.scheduledAt),
            isNull(trainingOutreachMessages.sentAt),
            isNull(trainingOutreachMessages.smtpAcceptedAt),
            isNull(trainingOutreachMessages.deliveredAt),
            isNull(trainingOutreachMessages.providerMessageId),
            isNull(trainingOutreachMessages.sendClaimToken),
            isNull(trainingOutreachMessages.sendClaimedAt),
            isNull(trainingOutreachMessages.sendAttemptedAt),
            sql`EXISTS (
              SELECT 1 FROM ${trainingOutreachProspects}
              WHERE ${trainingOutreachProspects.id} = ${trainingOutreachMessages.prospectId}
                AND ${trainingOutreachProspects.campaignId} = ${trainingOutreachMessages.campaignId}
                AND ${trainingOutreachProspects.draftVersion} = ${prospect.draftVersion}
                AND ${trainingOutreachProspects.status} = 'approved'
                AND ${trainingOutreachProspects.outreachStatus} = 'approved'
                AND ${trainingOutreachProspects.firstSentAt} IS NULL
                AND ${trainingOutreachProspects.lastSentAt} IS NULL
                AND ${trainingOutreachProspects.contactReadiness} = 'verified'
                AND ${trainingOutreachProspects.crossCampaignBlock} IS NULL
            )`
          )
        );
      if (Number(updated.affectedRows ?? 0) !== 1) return regenerated;
      regenerated += 1;
    }
    if (regenerated !== currentDrafts.length) return regenerated;

    const [versioned] = await db
      .update(trainingOutreachProspects)
      .set({ draftVersion: TRAINING_OUTREACH_DRAFT_VERSION })
      .where(
        and(
          eq(trainingOutreachProspects.id, prospect.id),
          eq(trainingOutreachProspects.campaignId, campaignId),
          eq(trainingOutreachProspects.draftVersion, prospect.draftVersion),
          inArray(trainingOutreachProspects.status, ["review", "approved"]),
          inArray(trainingOutreachProspects.outreachStatus, ["draft", "approved"]),
          isNull(trainingOutreachProspects.firstSentAt),
          isNull(trainingOutreachProspects.lastSentAt),
          eq(trainingOutreachProspects.contactReadiness, "verified"),
          isNull(trainingOutreachProspects.crossCampaignBlock),
          ...currentDrafts.map(
            draft => sql`EXISTS (
              SELECT 1 FROM ${trainingOutreachMessages}
              WHERE ${trainingOutreachMessages.id} = ${messages.find(
                message => message.sequenceStep === draft.sequenceStep
              )!.id}
                AND ${trainingOutreachMessages.campaignId} = ${campaignId}
                AND ${trainingOutreachMessages.prospectId} = ${prospect.id}
                AND ${trainingOutreachMessages.sequenceStep} = ${draft.sequenceStep}
                AND ${trainingOutreachMessages.dueAfterBusinessDays} = ${draft.dueAfterBusinessDays}
                AND ${trainingOutreachMessages.status} = 'approved'
                AND ${trainingOutreachMessages.subject} = ${draft.subject}
                AND ${trainingOutreachMessages.textBody} = ${draft.text}
                AND ${trainingOutreachMessages.htmlBody} = ${draft.html}
                AND ${trainingOutreachMessages.plannedAt} IS NULL
                AND ${trainingOutreachMessages.scheduledAt} IS NULL
                AND ${trainingOutreachMessages.sentAt} IS NULL
                AND ${trainingOutreachMessages.smtpAcceptedAt} IS NULL
                AND ${trainingOutreachMessages.deliveredAt} IS NULL
                AND ${trainingOutreachMessages.providerMessageId} IS NULL
                AND ${trainingOutreachMessages.sendClaimToken} IS NULL
                AND ${trainingOutreachMessages.sendClaimedAt} IS NULL
                AND ${trainingOutreachMessages.sendAttemptedAt} IS NULL
            )`
          )
        )
      );
    return regenerated + Number(versioned.affectedRows ?? 0);
  }
  // A previously imported, complete draft triple may be safely promoted without
  // changing any copy. Each conditional update remains guarded against a plan,
  // attempt, SMTP evidence, or concurrent state change.
  if (
    hasValidTrainingSequence(messages, "draft") &&
    messages.every(
      message =>
        !message.plannedAt &&
        !message.scheduledAt &&
        !message.sentAt &&
        !message.smtpAcceptedAt &&
        !message.providerMessageId &&
        !message.sendClaimToken &&
        !message.sendClaimedAt &&
        !message.sendAttemptedAt
    )
  ) {
    let promoted = 0;
    for (const message of messages) {
      const [updated] = await db
        .update(trainingOutreachMessages)
        .set({ status: "approved" })
        .where(
          and(
            eq(trainingOutreachMessages.id, message.id),
            eq(trainingOutreachMessages.campaignId, campaignId),
            eq(trainingOutreachMessages.prospectId, prospect.id),
            eq(trainingOutreachMessages.status, "draft"),
            isNull(trainingOutreachMessages.plannedAt),
            isNull(trainingOutreachMessages.scheduledAt),
            isNull(trainingOutreachMessages.sentAt),
            isNull(trainingOutreachMessages.smtpAcceptedAt),
            isNull(trainingOutreachMessages.providerMessageId),
            isNull(trainingOutreachMessages.sendClaimToken),
            isNull(trainingOutreachMessages.sendClaimedAt),
            isNull(trainingOutreachMessages.sendAttemptedAt)
          )
        );
      promoted += Number(updated.affectedRows ?? 0);
    }
    return promoted;
  }
  const drafts = buildTrainingSequence({
    businessName: prospect.businessName,
    contactName: prospect.primaryContactName,
    recipientIsNamed: prospect.emailRecipientType === "named",
    verifiedObservation: prospect.verifiedObservation || "",
    useCase: prospect.useCase || "",
    pilotScope: prospect.pilotScope || "",
  });
  const existingSteps = new Set(messages.map(message => message.sequenceStep));
  // Never overwrite a partial/protected row. Missing rows stay drafts so a later
  // reserve pass can promote the complete, still-unattempted triple atomically.
  for (const draft of drafts) {
    if (existingSteps.has(draft.sequenceStep)) continue;
    await db.insert(trainingOutreachMessages).values({
      campaignId,
      prospectId: prospect.id,
      sequenceStep: draft.sequenceStep,
      status: messages.length ? "draft" : "approved",
      subject: draft.subject,
      textBody: draft.text,
      htmlBody: draft.html,
      dueAfterBusinessDays: draft.dueAfterBusinessDays,
    });
  }
  return drafts.filter(draft => !existingSteps.has(draft.sequenceStep)).length;
}

/** Prepares only campaign-auto-approved evidence-backed records; it cannot activate sending. */
export async function prepareTrainingReadyReserve(
  target = TRAINING_READY_RESERVE_TARGET
) {
  const campaign = await ensureTrainingCampaign();
  const db = await requireDb();
  let approved = 0;
  if (campaign.autoApproveQualifiedProspects === 1) {
    const prospects = await db
      .select()
      .from(trainingOutreachProspects)
      .where(
        and(
          eq(trainingOutreachProspects.campaignId, campaign.id),
          inArray(trainingOutreachProspects.status, ["review", "approved"])
        )
      );
    for (const prospect of prospects) {
      if (!hasSourceBackedTrainingTarget(prospect)) continue;
      const conflict = await getTrainingCrossCampaignConflict(db, {
        business: prospect.normalizedBusiness,
        domain: prospect.normalizedDomain,
        email: prospect.normalizedEmail,
      });
      if (conflict) continue;
      // An earlier import can already have approved the prospect while leaving
      // its original drafts untouched. Repair only an unstarted, approved
      // sequence; cancelled/in-sequence/terminal work is never revived here.
      if (
        prospect.status === "approved" &&
        prospect.outreachStatus === "approved" &&
        !prospect.firstSentAt
      ) {
        await createApprovedTrainingDrafts(db, campaign.id, prospect);
        continue;
      }
      const [updated] = await db
        .update(trainingOutreachProspects)
        .set({ status: "approved", outreachStatus: "approved" })
        .where(
          and(
            eq(trainingOutreachProspects.id, prospect.id),
            eq(trainingOutreachProspects.status, "review"),
            eq(trainingOutreachProspects.contactReadiness, "verified"),
            isNull(trainingOutreachProspects.crossCampaignBlock)
          )
        );
      if (Number(updated.affectedRows ?? 0) === 1) {
        const [reloaded] = await db
          .select()
          .from(trainingOutreachProspects)
          .where(eq(trainingOutreachProspects.id, prospect.id))
          .limit(1);
        if (reloaded) {
          await createApprovedTrainingDrafts(db, campaign.id, reloaded);
          approved += 1;
        }
      }
    }
  }
  const health = await getTrainingSendingHealth(target);
  return {
    approved,
    skipped:
      campaign.autoApproveQualifiedProspects === 1
        ? null
        : ("campaign-auto-approval-disabled" as const),
    health,
  };
}

export async function getTrainingSendingHealth(
  reserveTarget = TRAINING_READY_RESERVE_TARGET
): Promise<TrainingSendingHealth> {
  const campaign = await ensureTrainingCampaign();
  const db = await requireDb();
  const [prospects, messages, runs] = await Promise.all([
    db
      .select()
      .from(trainingOutreachProspects)
      .where(eq(trainingOutreachProspects.campaignId, campaign.id)),
    readMessagesForCampaign(db, campaign.id),
    db
      .select()
      .from(trainingOutreachDailyRuns)
      .where(eq(trainingOutreachDailyRuns.campaignId, campaign.id))
      .orderBy(desc(trainingOutreachDailyRuns.createdAt))
      .limit(1),
  ]);
  const ready = [] as TrainingOutreachProspect[];
  for (const prospect of prospects) {
    if (
      !hasUntouchedApprovedTrainingInitialTarget(
        prospect,
        messages.filter(message => message.prospectId === prospect.id)
      )
    )
      continue;
    const [conflict, duplicate] = await Promise.all([
      getTrainingCrossCampaignConflict(db, {
        business: prospect.normalizedBusiness,
        domain: prospect.normalizedDomain,
        email: prospect.normalizedEmail,
      }),
      hasTrainingIdentityDuplicate(db, prospect),
    ]);
    if (!conflict && !duplicate) ready.push(prospect);
  }
  const draftCandidates = prospects.filter(prospect => {
    const messagesForProspect = messages.filter(
      message => message.prospectId === prospect.id
    );
    return (
      prospect.status === "review" &&
      prospect.outreachStatus === "draft" &&
      !prospect.firstSentAt &&
      hasSourceBackedTrainingTarget(prospect) &&
      hasValidTrainingSequence(messagesForProspect, "draft")
    );
  });
  const latestRun = runs[0];
  return {
    campaign,
    readyInitialCount: ready.length,
    qualifiedCount: prospects.filter(
      prospect => prospect.qualificationStatus === "qualified"
    ).length,
    totalProspectCount: prospects.length,
    sourceBackedDraftCount: draftCandidates.length,
    blockedCount: prospects.filter(
      prospect =>
        Boolean(prospect.crossCampaignBlock) ||
        prospect.outreachStatus === "cancelled"
    ).length,
    evidenceNeededCount: prospects.filter(
      prospect => !hasSourceBackedTrainingTarget(prospect)
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
    lowSupply: ready.length < reserveTarget,
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

/** Token-scoped opt-out changes only this Training campaign. */
export async function unsubscribeTrainingByToken(token: string) {
  if (!/^[a-f0-9]{48}$/i.test(token)) return false;
  const db = await requireDb();
  const campaign = await ensureTrainingCampaign();
  const [prospect] = await db
    .select()
    .from(trainingOutreachProspects)
    .where(
      and(
        eq(trainingOutreachProspects.unsubscribeToken, token.toLowerCase()),
        eq(trainingOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) return false;
  await markTrainingProspectTerminal({
    prospectId: prospect.id,
    status: "unsubscribed",
    eventType: "unsubscribed",
    detail: "Opted out through the dedicated Training unsubscribe endpoint.",
  });
  return true;
}

export async function recordTrainingMaintenanceEvent(
  campaignId: number,
  failed: boolean,
  detail: string,
  now = new Date()
) {
  const db = await requireDb();
  await db.insert(trainingOutreachEvents).values({
    campaignId,
    eventType: failed ? "maintenance_failed" : "maintenance_complete",
    detail: detail.slice(0, 8_000),
    occurredAt: now,
  });
}
