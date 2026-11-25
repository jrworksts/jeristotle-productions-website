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
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  chamberOutreachMessages,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  creditUnionCampaigns,
  creditUnionDailyRuns,
  creditUnionEvents,
  creditUnionMessages,
  creditUnionProspects,
  type CreditUnionCampaign,
  type CreditUnionMessage,
  type CreditUnionProspect,
} from "../drizzle/schema";
import {
  CREDIT_UNION_DRAFT_VERSION,
  CREDIT_UNION_TIME_ZONE,
  isCreditUnionTargetingReady,
  planCreditUnionSequenceFromFirstSend,
  type CreditUnionEmailConfidence,
} from "../shared/creditUnionOutreach";
import { compareCreditUnionLaunchPriority } from "../shared/creditUnionTargeting";
import { OUTREACH_DAILY_NEW_CONTACT_LIMIT } from "../shared/outreachMaintenance";
import { CREDIT_UNION_PROACTIVE_RESERVE_TARGET as OUTREACH_READY_BUFFER_TARGET } from "../shared/outboundReplenishmentPolicy";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
import { getDb } from "./db";
import { ensureCreditUnionCampaign } from "./creditUnionOutreach";
import { getTrainingCampaignIdentityConflict } from "./trainingCrossCampaignGuard";

const LEASE_MS = 35_000;
const MESSAGE_ID_DOMAIN = "jeristotleproductions.com";
const TERMINAL_STATUSES = [
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "not_fit",
  "complete",
] as const;
const UNSENT_OR_CLAIMED_STATUSES = ["draft", "approved", "scheduled"] as const;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type CreditUnionDeliveryCandidate = {
  message: CreditUnionMessage;
  prospect: CreditUnionProspect;
};

export type CreditUnionDailyLease = {
  id: number;
  leaseToken: string;
  runDate: string;
};

export type CreditUnionSendingHealth = {
  campaign: CreditUnionCampaign;
  readyInitialCount: number;
  readySouthTexasCount: number;
  sourceBackedDraftCount: number;
  blockedCount: number;
  verificationNeededCount: number;
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

function affectedRows(result: unknown) {
  if (!Array.isArray(result)) return 0;
  const header = result[0] as { affectedRows?: unknown } | undefined;
  return Number(header?.affectedRows ?? 0);
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

export function buildCreditUnionOutboundMessageId(
  messageId: number,
  claimToken: string
) {
  return `<cu-${messageId}-${claimToken}@${MESSAGE_ID_DOMAIN}>`;
}

async function getChamberConflict(
  db: Database,
  identity: {
    email: string | null;
    businessName?: string | null;
    domain?: string | null;
  }
) {
  const trainingConflict = getTrainingCampaignIdentityConflict(db, identity);
  if (!identity.email) {
    await trainingConflict;
    return "Recipient has no normalized email.";
  }
  const [suppression, inSequence, sent, training] = await Promise.all([
    db
      .select({ reason: chamberOutreachSuppressions.reason })
      .from(chamberOutreachSuppressions)
      .where(eq(chamberOutreachSuppressions.email, identity.email))
      .limit(1),
    db
      .select({ id: chamberOutreachProspects.id })
      .from(chamberOutreachProspects)
      .where(
        and(
          eq(chamberOutreachProspects.email, identity.email),
          inArray(chamberOutreachProspects.status, ["in_sequence", "approved"])
        )
      )
      .limit(1),
    db
      .select({ id: chamberOutreachMessages.id })
      .from(chamberOutreachMessages)
      .innerJoin(
        chamberOutreachProspects,
        eq(chamberOutreachMessages.prospectId, chamberOutreachProspects.id)
      )
      .where(
        and(
          eq(chamberOutreachProspects.email, identity.email),
          eq(chamberOutreachMessages.status, "sent")
        )
      )
      .limit(1),
    trainingConflict,
  ]);
  if (suppression[0])
    return `Shared Chamber suppression: ${suppression[0].reason}.`;
  if (inSequence[0])
    return "Matching email is active or approved in the Chamber outreach sequence.";
  if (sent[0])
    return "Matching email was already sent in the Chamber outreach campaign.";
  if (training) return training;
  return null;
}

async function hasCreditUnionIdentityDuplicate(
  db: Database,
  prospect: CreditUnionProspect
) {
  const identities = [
    eq(
      creditUnionProspects.normalizedOrganization,
      prospect.normalizedOrganization
    ),
  ];
  if (prospect.normalizedDomain) {
    identities.push(
      eq(creditUnionProspects.normalizedDomain, prospect.normalizedDomain)
    );
  }
  if (prospect.normalizedEmail) {
    identities.push(
      eq(creditUnionProspects.normalizedEmail, prospect.normalizedEmail)
    );
  }
  const duplicate = await db
    .select({ id: creditUnionProspects.id })
    .from(creditUnionProspects)
    .where(
      and(
        eq(creditUnionProspects.campaignId, prospect.campaignId),
        ne(creditUnionProspects.id, prospect.id),
        or(...identities)
      )
    )
    .limit(1);
  return Boolean(duplicate[0]);
}

function hasExactTarget(prospect: CreditUnionProspect) {
  return isCreditUnionTargetingReady({
    name: prospect.primaryContactName,
    title: prospect.primaryContactTitle,
    email: prospect.primaryEmail,
    emailConfidence: prospect.emailConfidence as CreditUnionEmailConfidence,
    emailSourceUrl: prospect.primaryEmailSourceUrl,
    roleSourceUrl: prospect.primaryRoleSourceUrl,
  });
}

function isActiveProspect(prospect: CreditUnionProspect) {
  return !TERMINAL_STATUSES.includes(
    prospect.status as (typeof TERMINAL_STATUSES)[number]
  );
}

export async function getCreditUnionCampaignForScheduledTask(taskUid: string) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(creditUnionCampaigns)
    .where(eq(creditUnionCampaigns.dailyScheduleTaskUid, taskUid))
    .limit(1);
  return campaign;
}

export async function recordCreditUnionMaintenanceEvent(
  campaignId: number,
  failed: boolean,
  detail: string,
  now = new Date()
) {
  const db = await requireDb();
  await db.insert(creditUnionEvents).values({
    campaignId,
    eventType: failed ? "maintenance_failed" : "maintenance_complete",
    detail: detail.slice(0, 8000),
    occurredAt: now,
  });
}

/**
 * Cross-campaign send guard for the Chamber sender. It deliberately reserves
 * only a source-backed Credit Union target that is approved/in sequence or has
 * an accepted initial send; unknown/review-only contacts do not leak into the
 * other campaign's suppression scope.
 */
export async function isCreditUnionEmailReserved(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const db = await requireDb();
  const [active, sent] = await Promise.all([
    db
      .select({ id: creditUnionProspects.id })
      .from(creditUnionProspects)
      .where(
        and(
          eq(creditUnionProspects.normalizedEmail, normalized),
          eq(creditUnionProspects.status, "approved"),
          inArray(creditUnionProspects.outreachStatus, [
            "approved",
            "scheduled",
            "in_sequence",
          ])
        )
      )
      .limit(1),
    db
      .select({ id: creditUnionMessages.id })
      .from(creditUnionMessages)
      .innerJoin(
        creditUnionProspects,
        eq(creditUnionMessages.prospectId, creditUnionProspects.id)
      )
      .where(
        and(
          eq(creditUnionProspects.normalizedEmail, normalized),
          eq(creditUnionMessages.sequenceStep, 0),
          eq(creditUnionMessages.status, "sent"),
          sql`${creditUnionMessages.smtpAcceptedAt} IS NOT NULL`
        )
      )
      .limit(1),
  ]);
  return Boolean(active[0] || sent[0]);
}

async function getCampaignById(campaignId: number) {
  const db = await requireDb();
  const [campaign] = await db
    .select()
    .from(creditUnionCampaigns)
    .where(eq(creditUnionCampaigns.id, campaignId))
    .limit(1);
  return campaign;
}

/**
 * Fences a daily batch using a unique campaign/day row. A new lease is granted
 * only to an unstarted/failed run whose prior lease has expired. The run's
 * `newReserved` counter is intentionally not reset on retry.
 */
export async function reserveCreditUnionDailyRun(input: {
  campaignId: number;
  runDate: string;
  now?: Date;
}): Promise<CreditUnionDailyLease | null> {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const leaseToken = newToken();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  try {
    const result = await db.insert(creditUnionDailyRuns).values({
      campaignId: input.campaignId,
      runDate: input.runDate,
      status: "started",
      leaseToken,
      leaseExpiresAt,
      summary: "Reserved by the credit-union 09:00 Central dispatcher.",
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
    .from(creditUnionDailyRuns)
    .where(
      and(
        eq(creditUnionDailyRuns.campaignId, input.campaignId),
        eq(creditUnionDailyRuns.runDate, input.runDate)
      )
    )
    .limit(1);
  if (
    !existing ||
    existing.status === "complete" ||
    existing.status === "skipped"
  ) {
    return null;
  }
  const [result] = await db
    .update(creditUnionDailyRuns)
    .set({
      status: "started",
      leaseToken,
      leaseExpiresAt,
      summary:
        "Expired credit-union daily-run lease reclaimed; prior reservations retained.",
    })
    .where(
      and(
        eq(creditUnionDailyRuns.id, existing.id),
        inArray(creditUnionDailyRuns.status, ["started", "failed"]),
        or(
          isNull(creditUnionDailyRuns.leaseExpiresAt),
          lt(creditUnionDailyRuns.leaseExpiresAt, now)
        )
      )
    );
  if (Number(result.affectedRows ?? 0) !== 1) return null;
  return { id: existing.id, leaseToken, runDate: input.runDate };
}

/** Records a run outcome only for the lease owner so an old callback cannot overwrite a newer run. */
export async function completeCreditUnionDailyRun(input: {
  campaignId: number;
  lease: CreditUnionDailyLease;
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
    .from(creditUnionDailyRuns)
    .where(
      and(
        eq(creditUnionDailyRuns.id, input.lease.id),
        eq(creditUnionDailyRuns.campaignId, input.campaignId),
        eq(creditUnionDailyRuns.leaseToken, input.lease.leaseToken),
        eq(creditUnionDailyRuns.status, "started")
      )
    )
    .limit(1);
  if (!current || current.status !== "started") return false;
  const accepted = (await readMessagesForCampaign(db, input.campaignId)).filter(
    message => message.status === "sent" && message.smtpAcceptedAt &&
      getOutreachLocalMoment(message.smtpAcceptedAt).dateKey === input.lease.runDate
  );
  await db
    .update(creditUnionDailyRuns)
    .set({
      status: input.status,
      newSent: accepted.filter(message => message.sequenceStep === 0).length,
      followupsSent: accepted.filter(message => message.sequenceStep > 0).length,
      repliesDetected: Math.max(current.repliesDetected, input.repliesDetected),
      errorCount: current.errorCount + input.errorCount,
      summary: input.summary.slice(0, 8_000),
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(creditUnionDailyRuns.id, input.lease.id),
        eq(creditUnionDailyRuns.campaignId, input.campaignId),
        eq(creditUnionDailyRuns.leaseToken, input.lease.leaseToken),
        eq(creditUnionDailyRuns.status, "started")
      )
    );
  await db
    .update(creditUnionCampaigns)
    .set({ lastRunAt: now })
    .where(eq(creditUnionCampaigns.id, input.campaignId));
  return true;
}

async function readMessagesForCampaign(db: Database, campaignId: number) {
  return db
    .select()
    .from(creditUnionMessages)
    .where(eq(creditUnionMessages.campaignId, campaignId))
    .orderBy(
      asc(creditUnionMessages.prospectId),
      asc(creditUnionMessages.sequenceStep)
    );
}

/** Returns no candidates that are merely scheduled/claimed or failed; neither is retried automatically. */
export async function getCreditUnionInitialCandidates(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaignId)),
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
        prospect.draftVersion === CREDIT_UNION_DRAFT_VERSION &&
        Boolean(initialByProspect.get(prospect.id))
    )
    .map(prospect => ({
      message: initialByProspect.get(prospect.id)!,
      prospect,
    }))
    .sort((a, b) => compareCreditUnionLaunchPriority(a.prospect, b.prospect));
}

/**
 * Follow-ups are only selected after their immediately prior message is sent.
 * A date comparison against `lastSentAt` makes a newly sent overdue step block
 * the next overdue step until the following Central business day.
 */
export async function getDueCreditUnionFollowupCandidates(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const sentSteps = new Set(
    messages
      .filter(message => message.status === "sent")
      .map(message => `${message.prospectId}:${message.sequenceStep}`)
  );
  const today = getOutreachLocalMoment(now, CREDIT_UNION_TIME_ZONE).dateKey;
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
      if (!prospect || prospect.status !== "approved" || !prospect.firstSentAt)
        return false;
      if (!sentSteps.has(`${message.prospectId}:${message.sequenceStep - 1}`))
        return false;
      const lastSentDate = prospect.lastSentAt
        ? getOutreachLocalMoment(prospect.lastSentAt, CREDIT_UNION_TIME_ZONE)
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
        compareCreditUnionLaunchPriority(a.prospect, b.prospect)
    );
}

export async function getCreditUnionPreviousSentMessage(
  prospectId: number,
  step: number
) {
  if (step < 1) return undefined;
  const db = await requireDb();
  const [message] = await db
    .select()
    .from(creditUnionMessages)
    .where(
      and(
        eq(creditUnionMessages.prospectId, prospectId),
        eq(creditUnionMessages.sequenceStep, step - 1),
        eq(creditUnionMessages.status, "sent")
      )
    )
    .limit(1);
  return message;
}

export type CreditUnionPointOfSendCheck =
  | {
      ready: true;
      campaign: CreditUnionCampaign;
      prospect: CreditUnionProspect;
      message: CreditUnionMessage;
    }
  | { ready: false; reason: string };

/** Re-reads all controls at the send point, rather than trusting queued data. */
export async function getCreditUnionPointOfSendCheck(input: {
  campaignId: number;
  prospectId: number;
  messageId: number;
  claimToken?: string;
}): Promise<CreditUnionPointOfSendCheck> {
  const db = await requireDb();
  const [campaign, prospect, message] = await Promise.all([
    getCampaignById(input.campaignId),
    db
      .select()
      .from(creditUnionProspects)
      .where(
        and(
          eq(creditUnionProspects.id, input.prospectId),
          eq(creditUnionProspects.campaignId, input.campaignId)
        )
      )
      .limit(1),
    db
      .select()
      .from(creditUnionMessages)
      .where(
        and(
          eq(creditUnionMessages.id, input.messageId),
          eq(creditUnionMessages.campaignId, input.campaignId),
          eq(creditUnionMessages.prospectId, input.prospectId)
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
  if (!campaign.listApprovedAt || !campaign.configApprovedAt) {
    return {
      ready: false,
      reason: "Campaign list/config approval is missing.",
    };
  }
  if (
    currentProspect.status !== "approved" ||
    !isActiveProspect(currentProspect)
  ) {
    return { ready: false, reason: "Prospect is terminal or not approved." };
  }
  if (currentProspect.draftVersion !== CREDIT_UNION_DRAFT_VERSION) {
    return {
      ready: false,
      reason: "Prospect is not on the current approved draft version.",
    };
  }
  if (!hasExactTarget(currentProspect)) {
    return {
      ready: false,
      reason:
        "Recipient is no longer a sourced marketing individual or verified official marketing department.",
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
    getChamberConflict(db, {
      email: currentProspect.normalizedEmail,
      businessName: currentProspect.creditUnionName,
      domain: currentProspect.normalizedDomain,
    }),
    hasCreditUnionIdentityDuplicate(db, currentProspect),
  ]);
  if (conflict) return { ready: false, reason: conflict };
  if (duplicate)
    return {
      ready: false,
      reason: "Duplicate credit-union identity requires manual review.",
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
export async function claimCreditUnionMessageForSend(input: {
  candidate: CreditUnionDeliveryCandidate;
  claimToken: string;
  providerMessageId: string;
  now: Date;
  initialLease?: CreditUnionDailyLease;
  dailyNewLimit?: number;
}) {
  // Follow-ups also require the daily owner; no detached delivery worker.
  if (!input.initialLease) return false;
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      if (input.initialLease) {
        const [owned] = await tx.update(creditUnionDailyRuns).set({ leaseToken: input.initialLease.leaseToken }).where(and(
          eq(creditUnionDailyRuns.id, input.initialLease.id), eq(creditUnionDailyRuns.campaignId, input.candidate.prospect.campaignId),
          eq(creditUnionDailyRuns.runDate, input.initialLease.runDate), eq(creditUnionDailyRuns.status, "started"),
          eq(creditUnionDailyRuns.leaseToken, input.initialLease.leaseToken), gte(creditUnionDailyRuns.leaseExpiresAt, input.now)
        ));
        if (Number(owned.affectedRows ?? 0) !== 1) throw new ClaimUnavailable("Daily continuation owner expired or changed");
      }
      if (input.candidate.message.sequenceStep === 0) {
        if (!input.initialLease)
          throw new ClaimUnavailable("Initial message has no daily run lease.");
        const cap = Math.min(
          OUTREACH_DAILY_NEW_CONTACT_LIMIT,
          Math.max(0, input.dailyNewLimit ?? OUTREACH_DAILY_NEW_CONTACT_LIMIT)
        );
        const [reserved] = await tx
          .update(creditUnionDailyRuns)
          .set({ newReserved: sql`${creditUnionDailyRuns.newReserved} + 1` })
          .where(
            and(
              eq(creditUnionDailyRuns.id, input.initialLease.id),
              eq(
                creditUnionDailyRuns.campaignId,
                input.candidate.prospect.campaignId
              ),
              eq(creditUnionDailyRuns.runDate, input.initialLease.runDate),
              eq(creditUnionDailyRuns.status, "started"),
              eq(
                creditUnionDailyRuns.leaseToken,
                input.initialLease.leaseToken
              ),
              gte(creditUnionDailyRuns.leaseExpiresAt, input.now),
              lt(creditUnionDailyRuns.newReserved, cap)
            )
          );
        if (Number(reserved.affectedRows ?? 0) !== 1) {
          throw new ClaimUnavailable(
            "Daily initial-message cap or lease is unavailable."
          );
        }
      }
      const [claimed] = await tx
        .update(creditUnionMessages)
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
            eq(creditUnionMessages.id, input.candidate.message.id),
            eq(
              creditUnionMessages.campaignId,
              input.candidate.prospect.campaignId
            ),
            eq(creditUnionMessages.prospectId, input.candidate.prospect.id),
            eq(creditUnionMessages.status, "approved"),
            isNull(creditUnionMessages.sendAttemptedAt),
            isNull(creditUnionMessages.smtpAcceptedAt),
            sql`EXISTS (SELECT 1 FROM ${creditUnionDailyRuns} r WHERE r.id = ${input.initialLease!.id} AND r.campaignId = ${creditUnionMessages.campaignId} AND r.runDate = ${input.initialLease!.runDate} AND r.status = 'started' AND r.leaseToken = ${input.initialLease!.leaseToken} AND r.leaseExpiresAt >= ${input.now})`
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

export async function recordCreditUnionSendAttempt(input: {
  messageId: number;
  claimToken: string;
  now: Date;
  dailyLease?: CreditUnionDailyLease;
}) {
  const ownedDailyLease = input.dailyLease;
  if (!ownedDailyLease) return false;
  const db = await requireDb();
  const [result] = await db
    .update(creditUnionMessages)
    .set({ sendAttemptedAt: input.now })
    .where(
      and(
        eq(creditUnionMessages.id, input.messageId),
        eq(creditUnionMessages.status, "scheduled"),
        eq(creditUnionMessages.sendClaimToken, input.claimToken),
        isNull(creditUnionMessages.sendAttemptedAt),
        isNull(creditUnionMessages.smtpAcceptedAt),
        sql`EXISTS (SELECT 1 FROM ${creditUnionDailyRuns} r WHERE r.id = ${ownedDailyLease.id} AND r.campaignId = ${creditUnionMessages.campaignId} AND r.runDate = ${ownedDailyLease.runDate} AND r.status = 'started' AND r.leaseToken = ${ownedDailyLease.leaseToken} AND r.leaseExpiresAt >= ${input.now})`
      )
    );
  return Number(result.affectedRows ?? 0) === 1;
}

/** Releases a claim only when no SMTP attempt has happened; attempted rows are never auto-retried. */
export async function releaseCreditUnionUnattemptedClaim(input: {
  messageId: number;
  claimToken: string;
  reason: string;
}) {
  const db = await requireDb();
  await db
    .update(creditUnionMessages)
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
        eq(creditUnionMessages.id, input.messageId),
        eq(creditUnionMessages.status, "scheduled"),
        eq(creditUnionMessages.sendClaimToken, input.claimToken),
        isNull(creditUnionMessages.sendAttemptedAt),
        isNull(creditUnionMessages.smtpAcceptedAt)
      )
    );
}

export async function markCreditUnionDeliveryAmbiguousFailure(input: {
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
    .update(creditUnionMessages)
    .set({
      status: "failed",
      error: reason,
      sendClaimToken: null,
      sendClaimedAt: null,
    })
    .where(
      and(
        eq(creditUnionMessages.id, input.messageId),
        eq(creditUnionMessages.campaignId, input.campaignId),
        eq(creditUnionMessages.prospectId, input.prospectId),
        eq(creditUnionMessages.status, "scheduled"),
        eq(creditUnionMessages.sendClaimToken, input.claimToken)
      )
    );
  if (Number(result.affectedRows ?? 0) === 1) {
    await db.insert(creditUnionEvents).values({
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

export async function finalizeCreditUnionSmtpAcceptance(input: {
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
    .from(creditUnionMessages)
    .where(
      and(
        eq(creditUnionMessages.id, input.messageId),
        eq(creditUnionMessages.campaignId, input.campaignId),
        eq(creditUnionMessages.prospectId, input.prospectId)
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
    .update(creditUnionMessages)
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
        eq(creditUnionMessages.id, input.messageId),
        eq(creditUnionMessages.campaignId, input.campaignId),
        eq(creditUnionMessages.prospectId, input.prospectId),
        or(
          and(
            eq(creditUnionMessages.status, "scheduled"),
            eq(creditUnionMessages.sendClaimToken, input.claimToken)
          ),
          and(
            eq(creditUnionMessages.status, "cancelled"),
            eq(
              creditUnionMessages.providerMessageId,
              input.claimedProviderMessageId
            ),
            sql`${creditUnionMessages.sendAttemptedAt} IS NOT NULL`
          )
        )
      )
    );
  if (Number(result.affectedRows ?? 0) !== 1) return false;

  // A terminal event won the race. Recording the accepted send avoids a later
  // duplicate, while leaving the prospect's terminal cancellation untouched.
  if (terminalCancellationWon) {
    await db.insert(creditUnionEvents).values({
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
          outreachStatus: "in_sequence" as const,
        };
  await db
    .update(creditUnionProspects)
    .set(prospectUpdate)
    .where(
      and(
        eq(creditUnionProspects.id, input.prospectId),
        eq(creditUnionProspects.campaignId, input.campaignId),
        eq(creditUnionProspects.status, "approved")
      )
    );

  if (input.sequenceStep === 0) {
    const campaign = await getCampaignById(input.campaignId);
    if (campaign) {
      const plans = planCreditUnionSequenceFromFirstSend(
        input.acceptedAt,
        campaign.sendHourLocal,
        campaign.timezone
      );
      for (const plan of plans.filter(plan => plan.sequenceStep > 0)) {
        await db
          .update(creditUnionMessages)
          .set({ plannedAt: plan.plannedAt })
          .where(
            and(
              eq(creditUnionMessages.campaignId, input.campaignId),
              eq(creditUnionMessages.prospectId, input.prospectId),
              eq(creditUnionMessages.sequenceStep, plan.sequenceStep),
              eq(creditUnionMessages.status, "approved")
            )
          );
      }
    }
  }

  await db.insert(creditUnionEvents).values({
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

/** Restores missing Day 4/9 plans only from an actual stored initial acceptance. */
export async function ensureCreditUnionFollowupPlans(campaignId: number) {
  const db = await requireDb();
  const [campaign, prospects, messages] = await Promise.all([
    getCampaignById(campaignId),
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaignId)),
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
    if (!initial?.smtpAcceptedAt) continue;
    const plans = planCreditUnionSequenceFromFirstSend(
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
        .update(creditUnionMessages)
        .set({ plannedAt: plan.plannedAt })
        .where(
          and(
            eq(creditUnionMessages.id, existing.id),
            eq(creditUnionMessages.status, "approved"),
            isNull(creditUnionMessages.plannedAt)
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
export async function markCreditUnionProspectTerminal(input: {
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
    .from(creditUnionProspects)
    .where(eq(creditUnionProspects.id, input.prospectId))
    .limit(1);
  if (!prospect || !isActiveProspect(prospect)) return false;

  // Mark terminal first so a concurrent sender's final point-of-send check
  // fails before it can call SMTP; scheduled claims are cancelled next.
  const [terminal] = await db
    .update(creditUnionProspects)
    .set({
      status: input.status,
      outreachStatus: "cancelled",
      repliedAt: input.status === "replied" ? occurredAt : prospect.repliedAt,
      unsubscribedAt:
        input.status === "unsubscribed" ? occurredAt : prospect.unsubscribedAt,
    })
    .where(
      and(
        eq(creditUnionProspects.id, prospect.id),
        inArray(creditUnionProspects.status, [
          "review",
          "verification_needed",
          "approved",
        ])
      )
    );
  if (Number(terminal.affectedRows ?? 0) !== 1) return false;

  if (prospect.normalizedEmail) {
    await db
      .insert(chamberOutreachSuppressions)
      .values({
        email: prospect.normalizedEmail,
        reason: input.status === "replied" ? "replied" : input.status,
        source: "credit_union_inbox_monitor",
        notes: input.detail.slice(0, 4_000),
      })
      .onDuplicateKeyUpdate({
        set: {
          reason: input.status === "replied" ? "replied" : input.status,
          source: "credit_union_inbox_monitor",
          notes: input.detail.slice(0, 4_000),
        },
      });
  }
  await db
    .update(creditUnionMessages)
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
        eq(creditUnionMessages.prospectId, prospect.id),
        inArray(creditUnionMessages.status, [...UNSENT_OR_CLAIMED_STATUSES])
      )
    );
  await db.insert(creditUnionEvents).values({
    campaignId: prospect.campaignId,
    prospectId: prospect.id,
    messageId: input.messageId || null,
    eventType: input.eventType,
    detail: input.detail.slice(0, 4_000),
    occurredAt,
  });
  return true;
}

export async function getCreditUnionInboxTargets(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(
        and(
          eq(creditUnionProspects.campaignId, campaignId),
          inArray(creditUnionProspects.status, ["approved"])
        )
      ),
    readMessagesForCampaign(db, campaignId),
  ]);
  const messageByProspect = new Map<number, CreditUnionMessage[]>();
  for (const message of messages.filter(message => message.status === "sent")) {
    const current = messageByProspect.get(message.prospectId) || [];
    current.push(message);
    messageByProspect.set(message.prospectId, current);
  }
  return prospects
    .filter(
      prospect =>
        Boolean(prospect.firstSentAt) && Boolean(prospect.normalizedEmail)
    )
    .map(prospect => ({
      prospect,
      sentMessages: messageByProspect.get(prospect.id) || [],
    }));
}

export async function recordCreditUnionReplyCheck(
  campaignId: number,
  now = new Date()
) {
  const db = await requireDb();
  await db
    .update(creditUnionCampaigns)
    .set({ lastReplyCheckAt: now })
    .where(eq(creditUnionCampaigns.id, campaignId));
  await db.insert(creditUnionEvents).values({
    campaignId,
    eventType: "reply_check",
    detail: "Bounded credit-union inbox scan completed.",
    occurredAt: now,
  });
}

async function sourceBackedDraftCandidates(campaignId: number) {
  const db = await requireDb();
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaignId)),
    readMessagesForCampaign(db, campaignId),
  ]);
  const byProspect = new Map<number, CreditUnionMessage[]>();
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
        prospect.draftVersion === CREDIT_UNION_DRAFT_VERSION &&
        !prospect.firstSentAt &&
        hasExactTarget(prospect) &&
        drafts.length === 3 &&
        drafts.every(message => message.status === "draft")
      );
    })
    .map(prospect => ({ prospect, messages: byProspect.get(prospect.id)! }))
    .sort((a, b) => compareCreditUnionLaunchPriority(a.prospect, b.prospect));
}

/**
 * Fills only from the already researched, exact-source, latest-version draft
 * pool. It neither changes blocked/unknown contacts nor performs enrichment.
 */
export async function prepareCreditUnionReadyReserve(
  target: number = OUTREACH_READY_BUFFER_TARGET
) {
  const campaign = await ensureCreditUnionCampaign();
  const normalizedTarget = Math.max(
    1,
    Math.min(50, Math.trunc(target) || OUTREACH_READY_BUFFER_TARGET)
  );
  if (!campaign.listApprovedAt || !campaign.configApprovedAt) {
    const health = await getCreditUnionSendingHealth(normalizedTarget);
    return { approved: 0, skipped: "launch-not-authorized" as const, health };
  }
  const db = await requireDb();
  const initial = await getCreditUnionInitialCandidates(campaign.id);
  let needed = Math.max(0, normalizedTarget - initial.length);
  let approved = 0;
  if (needed > 0) {
    for (const candidate of await sourceBackedDraftCandidates(campaign.id)) {
      if (needed <= 0) break;
      const conflict = await getChamberConflict(db, {
        email: candidate.prospect.normalizedEmail,
        businessName: candidate.prospect.creditUnionName,
        domain: candidate.prospect.normalizedDomain,
      });
      const duplicate = await hasCreditUnionIdentityDuplicate(
        db,
        candidate.prospect
      );
      if (conflict || duplicate) continue;
      await db
        .transaction(async tx => {
          const [messagesUpdated] = await tx
            .update(creditUnionMessages)
            .set({ status: "approved" })
            .where(
              and(
                eq(creditUnionMessages.prospectId, candidate.prospect.id),
                eq(creditUnionMessages.campaignId, campaign.id),
                eq(creditUnionMessages.status, "draft")
              )
            );
          if (Number(messagesUpdated.affectedRows ?? 0) !== 3) {
            throw new ClaimUnavailable(
              "Draft sequence changed while reserve preparation was running."
            );
          }
          const [prospectUpdated] = await tx
            .update(creditUnionProspects)
            .set({ status: "approved", outreachStatus: "approved" })
            .where(
              and(
                eq(creditUnionProspects.id, candidate.prospect.id),
                eq(creditUnionProspects.status, "review"),
                eq(creditUnionProspects.outreachStatus, "draft"),
                isNull(creditUnionProspects.firstSentAt),
                eq(
                  creditUnionProspects.draftVersion,
                  CREDIT_UNION_DRAFT_VERSION
                )
              )
            );
          if (Number(prospectUpdated.affectedRows ?? 0) !== 1) {
            throw new ClaimUnavailable(
              "Prospect changed while reserve preparation was running."
            );
          }
        })
        .catch(error => {
          if (error instanceof ClaimUnavailable) return;
          throw error;
        });
      const refreshed = await getCreditUnionInitialCandidates(campaign.id);
      if (refreshed.some(item => item.prospect.id === candidate.prospect.id)) {
        approved += 1;
        needed -= 1;
      }
    }
  }
  const health = await getCreditUnionSendingHealth(normalizedTarget);
  return { approved, skipped: null, health };
}

export async function getCreditUnionSendingHealth(
  reserveTarget: number = OUTREACH_READY_BUFFER_TARGET
): Promise<CreditUnionSendingHealth> {
  const campaign = await ensureCreditUnionCampaign();
  const db = await requireDb();
  const [prospects, messages, runs] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaign.id)),
    readMessagesForCampaign(db, campaign.id),
    db
      .select()
      .from(creditUnionDailyRuns)
      .where(eq(creditUnionDailyRuns.campaignId, campaign.id))
      .orderBy(desc(creditUnionDailyRuns.createdAt))
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
        prospect.draftVersion === CREDIT_UNION_DRAFT_VERSION &&
        hasExactTarget(prospect) &&
        initial?.status === "approved"
    );
  });
  const draftCandidates = await sourceBackedDraftCandidates(campaign.id);
  const latestRun = runs[0];
  return {
    campaign,
    readyInitialCount: ready.length,
    readySouthTexasCount: ready.filter(prospect =>
      /Corpus Christi|Kingsville|Alice|Portland|Port Aransas|Robstown|Beeville|Victoria|Harlingen|McAllen|Edinburg|Brownsville|Laredo|Weslaco|Mission|San Benito|San Antonio|Live Oak|Selma|Schertz|New Braunfels|Del Rio|Eagle Pass|Uvalde/i.test(
        prospect.headquartersCity || prospect.branchCountNote || ""
      )
    ).length,
    sourceBackedDraftCount: draftCandidates.length,
    blockedCount: prospects.filter(
      prospect =>
        prospect.outreachStatus === "blocked" ||
        prospect.outreachStatus === "cancelled"
    ).length,
    verificationNeededCount: prospects.filter(
      prospect => prospect.status === "verification_needed"
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
