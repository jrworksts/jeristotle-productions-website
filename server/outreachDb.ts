import { randomBytes } from "node:crypto";
import { outreachDeadlineCheck, outreachUniqueViolation } from "./outreachDeadline";
import { getOutreachLocalMoment } from "../shared/outreachSchedule";
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
  chamberOutreachCampaigns,
  chamberOutreachDailyRuns,
  chamberOutreachEvents,
  chamberOutreachMessages,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
} from "../drizzle/schema";
import { CHAMBER_OUTREACH_PROSPECT_SEEDS } from "../shared/chamberOutreachSeeds";
import { OUTREACH_DAILY_NEW_CONTACT_LIMIT } from "../shared/outreachMaintenance";
import { getDb } from "./db";
import { buildChamberOutreachSequence } from "./outreachSequence";
import { getTrainingCampaignIdentityConflict } from "./trainingCrossCampaignGuard";

const CAMPAIGN_SLUG = "united-chamber-2027-brand-refresh";
const DEFAULT_ADDRESS = "Physical postal address required before activation";

/**
 * Returns the inclusive/exclusive UTC range for one America/Chicago calendar
 * day. Calculating both local midnights preserves correct DST-day boundaries.
 */
export function getOutreachCentralDateBounds(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("dateKey must be formatted as YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDay = new Date(Date.UTC(year, month - 1, day));
  if (
    localDay.getUTCFullYear() !== year ||
    localDay.getUTCMonth() !== month - 1 ||
    localDay.getUTCDate() !== day
  ) {
    throw new Error("dateKey must be a valid calendar date");
  }
  const localParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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
      hour: Number(value("hour")),
      minute: Number(value("minute")),
    };
  };
  const localMidnightToUtc = (
    localYear: number,
    localMonth: number,
    localDate: number
  ) => {
    const guess = Date.UTC(localYear, localMonth - 1, localDate);
    const represented = localParts(new Date(guess));
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute
    );
    return new Date(guess - (representedUtc - guess));
  };
  const nextDay = new Date(localDay);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return {
    start: localMidnightToUtc(year, month, day),
    end: localMidnightToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate()
    ),
  };
}

const hasOutreachResearchSource = sql`((${chamberOutreachProspects.website} LIKE 'http://%' OR ${chamberOutreachProspects.website} LIKE 'https://%') OR ${chamberOutreachProspects.sourceUrl} LIKE '%/list/member/%')`;
const isOutreachEmailNotSuppressed = sql`NOT EXISTS (SELECT 1 FROM chamberOutreachSuppressions s WHERE s.email = ${chamberOutreachProspects.email})`;
const isOutreachEmailOnSuppressionList = sql`EXISTS (SELECT 1 FROM chamberOutreachSuppressions s WHERE s.email = ${chamberOutreachProspects.email})`;

function cleanName(value: string | null | undefined) {
  return (value || "").trim();
}

function firstNameFromContact(contactName: string, email: string) {
  const normalized = contactName
    .split(/[,|;]/)[0]
    ?.split(/[—–-]/)[0]
    ?.trim()
    .split(/\s+/)[0];
  if (normalized && /^[A-Za-z][A-Za-z'.-]{1,30}$/.test(normalized)) {
    return normalized;
  }
  const local = email.split("@")[0]?.split(/[._-]/)[0] || "there";
  const generic = new Set([
    "info",
    "contact",
    "hello",
    "admin",
    "office",
    "marketing",
    "sales",
    "web",
    "support",
    "customerservice",
    "service",
  ]);
  if (generic.has(local.toLowerCase())) return "there";
  return local.slice(0, 1).toUpperCase() + local.slice(1);
}

function removeGreeting(opening: string) {
  return opening
    .replace(/^\s*Hi\s+[^,]+,\s*/i, "")
    .replace(/^\s*[A-Z][A-Za-z'.-]+,\s*/, "")
    .trim();
}

function hasUnapprovedSalesLanguage(value: string) {
  return /\$|3,?500|price|ongoing|monthly|distribution/i.test(value);
}

function safeQuestion(value: string | undefined, company: string) {
  const candidate = cleanName(value);
  if (candidate && !hasUnapprovedSalesLanguage(candidate)) return candidate;
  return `As ${company} plans for 2027, which business goal would you most like fresh content to support: stronger awareness, clearer differentiation, or more qualified inquiries?`;
}

function safeHelpAngle(
  value: string | undefined,
  company: string,
  category: string
) {
  const candidate = cleanName(value);
  if (candidate && !hasUnapprovedSalesLanguage(candidate)) return candidate;
  return `a focused, movie-level story built around one verified ${category.toLowerCase()} priority for ${company}`;
}

function safeSubject(value: string | undefined, company: string) {
  return cleanName(value) || `A 2027 content idea for ${company}`;
}

function safeOpening(
  value: string | undefined,
  company: string,
  category: string
) {
  const candidate = removeGreeting(cleanName(value));
  if (candidate && !hasUnapprovedSalesLanguage(candidate)) return candidate;
  return `I was reviewing ${company}'s public work in ${category.toLowerCase()} and saw a useful opportunity to begin with a focused conversation about its 2027 goals.`;
}

function summarizeResearch(research: unknown) {
  if (!research || typeof research !== "object") return null;
  const record = research as Record<string, unknown>;
  const observations = Array.isArray(record.specific_observations)
    ? record.specific_observations.slice(0, 3)
    : [];
  const chamberFit =
    typeof record.verified_chamber_fit === "string"
      ? record.verified_chamber_fit
      : "";
  return [chamberFit, ...observations].filter(Boolean).join("\n\n");
}

function researchStrings(research: unknown, field: string) {
  if (!research || typeof research !== "object") return [];
  const value = (research as Record<string, unknown>)[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

async function getTrainingConflictForChamberProspect(
  db: Awaited<ReturnType<typeof requireDb>>,
  prospect: {
    businessName: string;
    website: string | null;
    email: string;
  }
) {
  return getTrainingCampaignIdentityConflict(db, {
    businessName: prospect.businessName,
    domain: prospect.website,
    email: prospect.email,
  });
}

export async function ensureChamberOutreachCampaign() {
  const db = await requireDb();
  await db
    .insert(chamberOutreachCampaigns)
    .values({
      slug: CAMPAIGN_SLUG,
      name: "2027 Chamber Brand Refresh introductions",
      status: "review",
      senderName: "Jeremy Wells",
      senderEmail: "jeremy@jeristotleproductions.com",
      dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      followupDelayDays: 3,
      maxFollowups: 3,
      sendHourLocal: 9,
      timezone: "America/Chicago",
      notes:
        "Approved copy. Sending remains blocked until a valid postal address is saved and the campaign is explicitly activated.",
      approvedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
        followupDelayDays: 3,
        maxFollowups: 3,
      },
    });

  const [campaign] = await db
    .select()
    .from(chamberOutreachCampaigns)
    .where(eq(chamberOutreachCampaigns.slug, CAMPAIGN_SLUG))
    .limit(1);
  if (!campaign) throw new Error("Outreach campaign could not be initialized");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberOutreachProspects)
    .where(eq(chamberOutreachProspects.campaignId, campaign.id));

  if (Number(count) === 0) {
    const prospectValues = CHAMBER_OUTREACH_PROSPECT_SEEDS.map(seed => {
      const research = seed.research as Record<string, unknown> | null;
      const helpAngles = researchStrings(research, "jeristotle_help_angles");
      const claims = researchStrings(research, "claims_to_avoid");
      const sources = researchStrings(research, "source_urls");
      const researchApproved = seed.researchStatus === "approved";
      return {
        campaignId: campaign.id,
        businessName: seed.businessName,
        website: seed.website || null,
        email: seed.email.toLowerCase(),
        phone: seed.phone || null,
        category: seed.category,
        contactName: seed.contactName || null,
        contactFirstName: firstNameFromContact(seed.contactName, seed.email),
        contactConfidence: seed.contactConfidence,
        unsubscribeToken: randomBytes(24).toString("hex"),
        sourceUrl: seed.sourceUrl,
        fitScore: seed.fitScore,
        status: researchApproved ? ("review" as const) : ("queued" as const),
        researchStatus: researchApproved
          ? ("approved" as const)
          : ("unresearched" as const),
        personalizedSubject: researchApproved
          ? safeSubject(
              typeof research?.personalized_subject === "string"
                ? research.personalized_subject
                : undefined,
              seed.businessName
            )
          : null,
        personalizedOpening: researchApproved
          ? safeOpening(
              typeof research?.personalized_opening === "string"
                ? research.personalized_opening
                : undefined,
              seed.businessName,
              seed.category
            )
          : null,
        questionAboutGoals: researchApproved
          ? safeQuestion(
              typeof research?.question_about_goals === "string"
                ? research.question_about_goals
                : undefined,
              seed.businessName
            )
          : null,
        personalizedHelpAngle: researchApproved
          ? safeHelpAngle(helpAngles[0], seed.businessName, seed.category)
          : null,
        researchSummary: researchApproved ? summarizeResearch(research) : null,
        researchSources: sources.length ? JSON.stringify(sources) : null,
        claimsToAvoid: claims.length ? JSON.stringify(claims) : null,
      };
    });

    for (let index = 0; index < prospectValues.length; index += 50) {
      await db
        .insert(chamberOutreachProspects)
        .values(prospectValues.slice(index, index + 50));
    }
  }

  const reviewProspects = await db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.researchStatus, "approved")
      )
    )
    .orderBy(
      desc(chamberOutreachProspects.fitScore),
      asc(chamberOutreachProspects.id)
    );

  const existingDrafts = await db
    .select({
      prospectId: chamberOutreachMessages.prospectId,
      step: chamberOutreachMessages.sequenceStep,
    })
    .from(chamberOutreachMessages)
    .where(eq(chamberOutreachMessages.campaignId, campaign.id));
  const existingSteps = new Set(
    existingDrafts.map(row => `${row.prospectId}:${row.step}`)
  );
  for (const prospect of reviewProspects) {
    if (
      !prospect.personalizedSubject ||
      !prospect.personalizedOpening ||
      !prospect.questionAboutGoals ||
      !prospect.personalizedHelpAngle
    ) {
      continue;
    }
    const sequence = buildChamberOutreachSequence({
      firstName: prospect.contactFirstName || "there",
      company: prospect.businessName,
      subject: prospect.personalizedSubject,
      personalizedOpening: prospect.personalizedOpening,
      personalizedHelpAngle: prospect.personalizedHelpAngle,
      questionAboutGoals: prospect.questionAboutGoals,
      physicalPostalAddress: campaign.physicalPostalAddress || DEFAULT_ADDRESS,
      unsubscribeUrl: `https://jeristotleproductions.com/unsubscribe/${prospect.unsubscribeToken}`,
    });
    for (const draft of sequence) {
      if (existingSteps.has(`${prospect.id}:${draft.sequenceStep}`)) continue;
      await db
        .insert(chamberOutreachMessages)
        .values({
          campaignId: campaign.id,
          prospectId: prospect.id,
          sequenceStep: draft.sequenceStep,
          kind: draft.kind,
          status: "draft",
          subject: draft.subject,
          htmlBody: draft.html,
          textBody: draft.text,
        })
        .onDuplicateKeyUpdate({
          set: {
            prospectId: prospect.id,
          },
        });
    }
  }

  return campaign;
}

export async function refreshApprovedOutreachSeeds() {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  let refreshed = 0;
  for (const seed of CHAMBER_OUTREACH_PROSPECT_SEEDS) {
    if (seed.researchStatus !== "approved" || !seed.research) continue;
    const research = seed.research as Record<string, unknown>;
    const helpAngles = researchStrings(research, "jeristotle_help_angles");
    const claims = researchStrings(research, "claims_to_avoid");
    const sources = researchStrings(research, "source_urls");
    await db
      .update(chamberOutreachProspects)
      .set({
        email: seed.email.toLowerCase(),
        contactName: seed.contactName || null,
        contactFirstName: firstNameFromContact(seed.contactName, seed.email),
        contactConfidence: seed.contactConfidence,
        fitScore: seed.fitScore,
        researchStatus: "approved",
        status: "review",
        personalizedSubject: safeSubject(
          typeof research.personalized_subject === "string"
            ? research.personalized_subject
            : undefined,
          seed.businessName
        ),
        personalizedOpening: safeOpening(
          typeof research.personalized_opening === "string"
            ? research.personalized_opening
            : undefined,
          seed.businessName,
          seed.category
        ),
        questionAboutGoals: safeQuestion(
          typeof research.question_about_goals === "string"
            ? research.question_about_goals
            : undefined,
          seed.businessName
        ),
        personalizedHelpAngle: safeHelpAngle(
          helpAngles[0],
          seed.businessName,
          seed.category
        ),
        researchSummary: summarizeResearch(research),
        researchSources: sources.length ? JSON.stringify(sources) : null,
        claimsToAvoid: claims.length ? JSON.stringify(claims) : null,
      })
      .where(
        and(
          eq(chamberOutreachProspects.campaignId, campaign.id),
          eq(chamberOutreachProspects.businessName, seed.businessName)
        )
      );
    refreshed += 1;
  }
  return refreshed;
}

export async function getChamberOutreachWorkspace() {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [prospects, messages, runs, recentEvents, suppressions] =
    await Promise.all([
      db
        .select()
        .from(chamberOutreachProspects)
        .where(eq(chamberOutreachProspects.campaignId, campaign.id))
        .orderBy(
          desc(chamberOutreachProspects.fitScore),
          asc(chamberOutreachProspects.id)
        ),
      db
        .select()
        .from(chamberOutreachMessages)
        .where(eq(chamberOutreachMessages.campaignId, campaign.id))
        .orderBy(
          asc(chamberOutreachMessages.prospectId),
          asc(chamberOutreachMessages.sequenceStep)
        ),
      db
        .select()
        .from(chamberOutreachDailyRuns)
        .where(eq(chamberOutreachDailyRuns.campaignId, campaign.id))
        .orderBy(desc(chamberOutreachDailyRuns.runDate))
        .limit(30),
      db
        .select()
        .from(chamberOutreachEvents)
        .where(eq(chamberOutreachEvents.campaignId, campaign.id))
        .orderBy(desc(chamberOutreachEvents.occurredAt))
        .limit(50),
      db
        .select()
        .from(chamberOutreachSuppressions)
        .orderBy(desc(chamberOutreachSuppressions.createdAt))
        .limit(100),
    ]);

  const freshCampaign = (
    await db
      .select()
      .from(chamberOutreachCampaigns)
      .where(eq(chamberOutreachCampaigns.id, campaign.id))
      .limit(1)
  )[0];

  return {
    campaign: freshCampaign,
    prospects,
    messages,
    runs,
    recentEvents,
    suppressions,
  };
}

export async function updateOutreachCampaign(input: {
  status?: "review" | "paused" | "active";
  physicalPostalAddress?: string | null;
  notes?: string | null;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  if (input.status === "active") {
    const address =
      input.physicalPostalAddress ?? campaign.physicalPostalAddress ?? "";
    if (address.trim().length < 10) {
      throw new Error(
        "A valid physical postal address is required before activation"
      );
    }
    const [{ count: approvedCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chamberOutreachMessages)
      .where(
        and(
          eq(chamberOutreachMessages.campaignId, campaign.id),
          eq(chamberOutreachMessages.sequenceStep, 0),
          eq(chamberOutreachMessages.status, "approved")
        )
      );
    if (Number(approvedCount) === 0) {
      throw new Error(
        "Approve the first personalized sequences before activation"
      );
    }
  }
  await db
    .update(chamberOutreachCampaigns)
    .set({
      ...input,
      activatedAt:
        input.status === "active" ? new Date() : campaign.activatedAt,
    })
    .where(eq(chamberOutreachCampaigns.id, campaign.id));
  if (input.physicalPostalAddress) {
    await refreshUnsentOutreachDrafts(input.physicalPostalAddress);
  }
  return (await getChamberOutreachWorkspace()).campaign;
}

async function refreshUnsentOutreachDrafts(physicalPostalAddress: string) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const prospects = await db
    .select()
    .from(chamberOutreachProspects)
    .where(eq(chamberOutreachProspects.campaignId, campaign.id));
  for (const prospect of prospects) {
    if (
      !prospect.personalizedSubject ||
      !prospect.personalizedOpening ||
      !prospect.questionAboutGoals ||
      !prospect.personalizedHelpAngle
    ) {
      continue;
    }
    const sequence = buildChamberOutreachSequence({
      firstName: prospect.contactFirstName || "there",
      company: prospect.businessName,
      subject: prospect.personalizedSubject,
      personalizedOpening: prospect.personalizedOpening,
      personalizedHelpAngle: prospect.personalizedHelpAngle,
      questionAboutGoals: prospect.questionAboutGoals,
      physicalPostalAddress,
      unsubscribeUrl: `https://jeristotleproductions.com/unsubscribe/${prospect.unsubscribeToken}`,
    });
    for (const draft of sequence) {
      await db
        .update(chamberOutreachMessages)
        .set({
          subject: draft.subject,
          htmlBody: draft.html,
          textBody: draft.text,
        })
        .where(
          and(
            eq(chamberOutreachMessages.prospectId, prospect.id),
            eq(chamberOutreachMessages.sequenceStep, draft.sequenceStep),
            ne(chamberOutreachMessages.status, "sent")
          )
        );
    }
  }
}

export async function updateOutreachProspect(input: {
  id: number;
  status?:
    | "queued"
    | "researching"
    | "review"
    | "approved"
    | "in_sequence"
    | "replied"
    | "unsubscribed"
    | "bounced"
    | "meeting"
    | "not_fit"
    | "complete";
  manualNotes?: string | null;
  contactName?: string | null;
  contactFirstName?: string | null;
  email?: string;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [prospect] = await db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.id, input.id),
        eq(chamberOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Prospect not found in the active campaign");
  const { id, status, email, ...updates } = input;
  const terminalStatuses = new Set([
    "replied",
    "unsubscribed",
    "bounced",
    "meeting",
    "not_fit",
    "complete",
  ]);
  const isTerminal = Boolean(status && terminalStatuses.has(status));
  const normalizedEmail = email?.trim().toLowerCase();
  await db
    .update(chamberOutreachProspects)
    .set({
      ...updates,
      ...(status ? { status } : {}),
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(isTerminal ? { nextFollowupAt: null } : {}),
    })
    .where(
      and(
        eq(chamberOutreachProspects.id, id),
        eq(chamberOutreachProspects.campaignId, campaign.id)
      )
    );
  if (!isTerminal) return;

  const terminalEmail = normalizedEmail || prospect.email;
  await upsertSuppression({
    email: terminalEmail,
    reason:
      status === "replied"
        ? "replied"
        : status === "unsubscribed"
          ? "unsubscribed"
          : status === "bounced"
            ? "bounced"
            : "manual",
    source: "manual_outreach_update",
    notes: updates.manualNotes,
  });
  await db
    .update(chamberOutreachMessages)
    .set({ status: "skipped", error: "Prospect manually marked terminal." })
    .where(
      and(
        eq(chamberOutreachMessages.campaignId, campaign.id),
        eq(chamberOutreachMessages.prospectId, id),
        inArray(chamberOutreachMessages.status, [
          "draft",
          "approved",
          "scheduled",
        ])
      )
    );
}

export async function approveProspectSequence(prospectId: number) {
  const db = await requireDb();
  const [prospect] = await db
    .select()
    .from(chamberOutreachProspects)
    .where(eq(chamberOutreachProspects.id, prospectId))
    .limit(1);
  if (!prospect) throw new Error("Prospect not found");
  if (
    !["review", "approved"].includes(prospect.status) ||
    prospect.firstSentAt
  ) {
    throw new Error("Only unsent review sequences can be approved");
  }
  const trainingConflict = await getTrainingConflictForChamberProspect(
    db,
    prospect
  );
  if (trainingConflict) throw new Error(trainingConflict);
  const drafts = await db
    .select()
    .from(chamberOutreachMessages)
    .where(eq(chamberOutreachMessages.prospectId, prospectId));
  if (
    drafts.length !== 4 ||
    drafts.some(draft => !["draft", "approved"].includes(draft.status))
  ) {
    throw new Error(
      "All four unsent sequence drafts are required before approval"
    );
  }
  await db
    .update(chamberOutreachMessages)
    .set({ status: "approved" })
    .where(eq(chamberOutreachMessages.prospectId, prospectId));
  await db
    .update(chamberOutreachProspects)
    .set({ status: "approved" })
    .where(eq(chamberOutreachProspects.id, prospectId));
  await db.insert(chamberOutreachEvents).values({
    campaignId: prospect.campaignId,
    prospectId,
    eventType: "sequence_approved",
    detail: "All four personalized drafts approved for this prospect.",
  });
}

export async function setMessageApproval(input: {
  messageId: number;
  status: "draft" | "approved";
}) {
  const db = await requireDb();
  await db
    .update(chamberOutreachMessages)
    .set({ status: input.status })
    .where(eq(chamberOutreachMessages.id, input.messageId));
}

export async function upsertSuppression(input: {
  email: string;
  reason: "unsubscribed" | "replied" | "bounced" | "manual";
  source: string;
  notes?: string | null;
}) {
  const db = await requireDb();
  await db
    .insert(chamberOutreachSuppressions)
    .values({ ...input, email: input.email.toLowerCase() })
    .onDuplicateKeyUpdate({
      set: { reason: input.reason, source: input.source, notes: input.notes },
    });
}

export async function unsubscribeByToken(token: string) {
  const db = await requireDb();
  const [prospect] = await db
    .select()
    .from(chamberOutreachProspects)
    .where(eq(chamberOutreachProspects.unsubscribeToken, token))
    .limit(1);
  if (!prospect) return false;
  await upsertSuppression({
    email: prospect.email,
    reason: "unsubscribed",
    source: "unsubscribe_link",
  });
  await db
    .update(chamberOutreachProspects)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      nextFollowupAt: null,
    })
    .where(eq(chamberOutreachProspects.id, prospect.id));
  await db
    .update(chamberOutreachMessages)
    .set({ status: "skipped" })
    .where(
      and(
        eq(chamberOutreachMessages.prospectId, prospect.id),
        eq(chamberOutreachMessages.status, "scheduled")
      )
    );
  await db.insert(chamberOutreachEvents).values({
    campaignId: prospect.campaignId,
    prospectId: prospect.id,
    eventType: "unsubscribed",
    detail: "Suppressed through the public unsubscribe link.",
  });
  return true;
}

export async function getOutreachRecapWindow(start: Date, end: Date) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [events, runs] = await Promise.all([
    db
      .select()
      .from(chamberOutreachEvents)
      .where(
        and(
          eq(chamberOutreachEvents.campaignId, campaign.id),
          gte(chamberOutreachEvents.occurredAt, start),
          lte(chamberOutreachEvents.occurredAt, end)
        )
      ),
    db
      .select()
      .from(chamberOutreachDailyRuns)
      .where(
        and(
          eq(chamberOutreachDailyRuns.campaignId, campaign.id),
          gte(chamberOutreachDailyRuns.createdAt, start),
          lte(chamberOutreachDailyRuns.createdAt, end)
        )
      ),
  ]);
  return { campaign, events, runs };
}

/** Sender lookup is read-only: never initialize controls or rewrite historical drafts. */
export async function getCampaignForAutomation() {
  const db = await requireDb();
  const [campaign] = await db.select().from(chamberOutreachCampaigns)
    .where(eq(chamberOutreachCampaigns.slug, CAMPAIGN_SLUG)).limit(1);
  if (!campaign) throw new Error("Existing Chamber campaign missing; sending blocked.");
  return campaign;
}

/**
 * Returns campaign-scoped outreach inventory. `readyCount` is deliberately
 * limited to unsent, approved sequence-zero messages whose prospect remains
 * approved and is not on the shared suppression list.
 */
export async function getOutreachQueueHealth(_now = new Date()) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [ready, queued, eligibleQueued, researching, blocked] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(chamberOutreachMessages)
        .innerJoin(
          chamberOutreachProspects,
          eq(chamberOutreachMessages.prospectId, chamberOutreachProspects.id)
        )
        .where(
          and(
            eq(chamberOutreachMessages.campaignId, campaign.id),
            eq(chamberOutreachMessages.sequenceStep, 0),
            eq(chamberOutreachMessages.status, "approved"),
            eq(chamberOutreachProspects.status, "approved"),
            isNull(chamberOutreachProspects.firstSentAt),
            isOutreachEmailNotSuppressed
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chamberOutreachProspects)
        .where(
          and(
            eq(chamberOutreachProspects.campaignId, campaign.id),
            eq(chamberOutreachProspects.status, "queued")
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chamberOutreachProspects)
        .where(
          and(
            eq(chamberOutreachProspects.campaignId, campaign.id),
            eq(chamberOutreachProspects.status, "queued"),
            hasOutreachResearchSource,
            isOutreachEmailNotSuppressed
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chamberOutreachProspects)
        .where(
          and(
            eq(chamberOutreachProspects.campaignId, campaign.id),
            eq(chamberOutreachProspects.status, "researching")
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chamberOutreachProspects)
        .where(
          and(
            eq(chamberOutreachProspects.campaignId, campaign.id),
            or(
              inArray(chamberOutreachProspects.status, [
                "replied",
                "unsubscribed",
                "bounced",
                "meeting",
                "not_fit",
                "complete",
              ]),
              isOutreachEmailOnSuppressionList
            )
          )
        ),
    ]);
  const readyCount = Number(ready[0]?.count ?? 0);
  const queuedCount = Number(queued[0]?.count ?? 0);
  const eligibleQueuedCount = Number(eligibleQueued[0]?.count ?? 0);
  const researchingCount = Number(researching[0]?.count ?? 0);
  const blockedCount = Number(blocked[0]?.count ?? 0);
  return {
    readyCount,
    queuedCount,
    eligibleQueuedCount,
    researchingCount,
    blockedCount,
    lowSupply: readyCount + eligibleQueuedCount < 25,
  };
}

/**
 * Reclaims abandoned research claims only while they are unsent, unresearched,
 * and unsuppressed. The conditional update makes concurrent maintenance runs
 * idempotent and prevents terminal records from being revived.
 */
export async function recoverStaleOutreachResearch(now = new Date()) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const [result] = await db
    .update(chamberOutreachProspects)
    .set({ status: "queued", updatedAt: now })
    .where(
      and(
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "researching"),
        eq(chamberOutreachProspects.researchStatus, "unresearched"),
        isNull(chamberOutreachProspects.firstSentAt),
        lt(chamberOutreachProspects.updatedAt, staleBefore),
        isOutreachEmailNotSuppressed
      )
    );
  const recoveredCount = Number(result.affectedRows ?? 0);
  if (recoveredCount > 0) {
    await db.insert(chamberOutreachEvents).values({
      campaignId: campaign.id,
      eventType: "research_recovered",
      detail: `Recovered ${recoveredCount} stale unsent research claim${recoveredCount === 1 ? "" : "s"}.`,
      occurredAt: now,
    });
  }
  return recoveredCount;
}

/** Counts actual sent sequence-zero messages in the supplied Central date. */
export async function getOutreachNewSentCountForDate(dateKey: string) {
  const db = await requireDb();
  const campaign = await getCampaignForAutomation();
  const { start, end } = getOutreachCentralDateBounds(dateKey);
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberOutreachMessages)
    .where(
      and(
        eq(chamberOutreachMessages.campaignId, campaign.id),
        eq(chamberOutreachMessages.sequenceStep, 0),
        eq(chamberOutreachMessages.status, "sent"),
        gte(chamberOutreachMessages.sentAt, start),
        lt(chamberOutreachMessages.sentAt, end)
      )
    );
  return Number(result?.count ?? 0);
}

export async function claimOutreachResearchProspect(prospectId: number) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [result] = await db
    .update(chamberOutreachProspects)
    .set({ status: "researching", updatedAt: new Date() })
    .where(
      and(
        eq(chamberOutreachProspects.id, prospectId),
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "queued"),
        eq(chamberOutreachProspects.researchStatus, "unresearched"),
        isNull(chamberOutreachProspects.firstSentAt),
        isOutreachEmailNotSuppressed
      )
    );
  return result.affectedRows === 1;
}

export async function getQueuedResearchProspects(limit: number) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  return db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "queued"),
        eq(chamberOutreachProspects.researchStatus, "unresearched"),
        isNull(chamberOutreachProspects.firstSentAt),
        hasOutreachResearchSource,
        isOutreachEmailNotSuppressed
      )
    )
    .orderBy(
      sql`CASE WHEN ${chamberOutreachProspects.contactConfidence} = 'direct' THEN 0 WHEN ${chamberOutreachProspects.contactConfidence} = 'public' THEN 1 ELSE 2 END`,
      desc(chamberOutreachProspects.fitScore),
      asc(chamberOutreachProspects.id)
    )
    .limit(limit);
}

export async function saveAutomatedProspectResearch(input: {
  prospectId: number;
  personalizedSubject: string;
  personalizedOpening: string;
  questionAboutGoals: string;
  personalizedHelpAngle: string;
  researchSummary: string;
  researchSources: string[];
  claimsToAvoid: string[];
  autoApprove: boolean;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [prospect] = await db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.id, input.prospectId),
        eq(chamberOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Prospect not found");

  // Research is asynchronous. Only persist it while the original unsent claim
  // is still active; a reply, unsubscribe, bounce, manual terminal update, or
  // initial send that happened in the meantime must win this race.
  const [updateResult] = await db
    .update(chamberOutreachProspects)
    .set({
      researchStatus: "approved",
      status: input.autoApprove ? "approved" : "review",
      personalizedSubject: input.personalizedSubject,
      personalizedOpening: input.personalizedOpening,
      questionAboutGoals: input.questionAboutGoals,
      personalizedHelpAngle: input.personalizedHelpAngle,
      researchSummary: input.researchSummary,
      researchSources: JSON.stringify(input.researchSources),
      claimsToAvoid: JSON.stringify(input.claimsToAvoid),
    })
    .where(
      and(
        eq(chamberOutreachProspects.id, prospect.id),
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "researching"),
        eq(chamberOutreachProspects.researchStatus, "unresearched"),
        isNull(chamberOutreachProspects.firstSentAt),
        isOutreachEmailNotSuppressed
      )
    );
  if (Number(updateResult.affectedRows ?? 0) !== 1) return false;

  const sequence = buildChamberOutreachSequence({
    firstName: prospect.contactFirstName || "there",
    company: prospect.businessName,
    subject: input.personalizedSubject,
    personalizedOpening: input.personalizedOpening,
    personalizedHelpAngle: input.personalizedHelpAngle,
    questionAboutGoals: input.questionAboutGoals,
    physicalPostalAddress: campaign.physicalPostalAddress || DEFAULT_ADDRESS,
    unsubscribeUrl: `https://jeristotleproductions.com/unsubscribe/${prospect.unsubscribeToken}`,
  });
  for (const draft of sequence) {
    await db
      .insert(chamberOutreachMessages)
      .values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        sequenceStep: draft.sequenceStep,
        kind: draft.kind,
        status: input.autoApprove ? "approved" : "draft",
        subject: draft.subject,
        htmlBody: draft.html,
        textBody: draft.text,
      })
      .onDuplicateKeyUpdate({
        set: {
          // Duplicate rows may be historical sends. Never overwrite their
          // copy, status, or provider metadata with delayed research output.
          prospectId: sql`prospectId`,
        },
      });
  }
  await db.insert(chamberOutreachEvents).values({
    campaignId: campaign.id,
    prospectId: prospect.id,
    eventType: "research_completed",
    detail: input.autoApprove
      ? "High-confidence automated research approved for the active campaign."
      : "Research completed and drafts placed in review.",
  });
  return true;
}

export async function markProspectResearchFailed(
  prospectId: number,
  reason: string
) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [prospect] = await db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.id, prospectId),
        eq(chamberOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) return;
  const [{ count: priorFailures }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberOutreachEvents)
    .where(
      and(
        eq(chamberOutreachEvents.prospectId, prospectId),
        eq(chamberOutreachEvents.eventType, "research_failed")
      )
    );
  const transient =
    /truncated|JSON|Unterminated|timed? ?out|abort|fetch failed|LLM invoke failed/i.test(
      reason
    );
  const retry = transient && Number(priorFailures) < 3;
  const [result] = await db
    .update(chamberOutreachProspects)
    .set({
      researchStatus: retry ? "unresearched" : "failed",
      status: retry ? "queued" : "review",
      manualNotes: reason,
    })
    .where(
      and(
        eq(chamberOutreachProspects.id, prospectId),
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "researching"),
        eq(chamberOutreachProspects.researchStatus, "unresearched"),
        isNull(chamberOutreachProspects.firstSentAt),
        isOutreachEmailNotSuppressed
      )
    );
  if (Number(result.affectedRows ?? 0) !== 1) return;
  await db.insert(chamberOutreachEvents).values({
    campaignId: campaign.id,
    prospectId,
    eventType: "research_failed",
    detail: `${reason}${retry ? " Retry queued for the next preparation run." : " Held for source/contact review."}`,
  });
}

export async function getApprovedInitialMessages(limit: number) {
  const db = await requireDb();
  const campaign = await getCampaignForAutomation();
  const candidates = await db
    .select({
      message: chamberOutreachMessages,
      prospect: chamberOutreachProspects,
    })
    .from(chamberOutreachMessages)
    .innerJoin(
      chamberOutreachProspects,
      eq(chamberOutreachMessages.prospectId, chamberOutreachProspects.id)
    )
    .where(
      and(
        eq(chamberOutreachMessages.campaignId, campaign.id),
        eq(chamberOutreachMessages.sequenceStep, 0),
        eq(chamberOutreachMessages.status, "approved"),
        isNull(chamberOutreachMessages.sendClaimToken),
        isNull(chamberOutreachMessages.sendClaimedAt),
        isNull(chamberOutreachMessages.sendAttemptedAt),
        isNull(chamberOutreachMessages.sentAt),
        isNull(chamberOutreachMessages.providerMessageId),
        isNull(chamberOutreachMessages.error),
        eq(chamberOutreachProspects.status, "approved"),
        isNull(chamberOutreachProspects.firstSentAt),
        isOutreachEmailNotSuppressed
      )
    )
    .orderBy(asc(chamberOutreachMessages.id))
    .limit(limit);
  const ready = [];
  for (const candidate of candidates) {
    // This is the Chamber sender's final database-backed candidate read. A
    // Training read failure propagates to the scheduler, so delivery cannot
    // proceed when reciprocal conflict state is unavailable.
    if (await getTrainingConflictForChamberProspect(db, candidate.prospect)) {
      continue;
    }
    ready.push(candidate);
  }
  return ready;
}

export async function autoApproveResearchReadyProspects(limit: number) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const prospects = await db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "review"),
        eq(chamberOutreachProspects.researchStatus, "approved"),
        ne(chamberOutreachProspects.contactConfidence, "directory"),
        isNull(chamberOutreachProspects.firstSentAt),
        isOutreachEmailNotSuppressed
      )
    )
    .orderBy(
      desc(chamberOutreachProspects.fitScore),
      asc(chamberOutreachProspects.id)
    )
    .limit(limit);
  let approved = 0;
  for (const prospect of prospects) {
    // Review-only Training rows do not block this path; approved, active,
    // terminal, or transport-evidenced Training identities do.
    if (await getTrainingConflictForChamberProspect(db, prospect)) continue;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chamberOutreachMessages)
      .where(eq(chamberOutreachMessages.prospectId, prospect.id));
    if (Number(count) !== 4) continue;
    await approveProspectSequence(prospect.id);
    approved += 1;
  }
  return approved;
}

export async function getDueFollowupMessages(now: Date) {
  const db = await requireDb();
  const campaign = await getCampaignForAutomation();
  const messages = await db
    .select()
    .from(chamberOutreachMessages)
    .where(
      and(
        eq(chamberOutreachMessages.campaignId, campaign.id),
        eq(chamberOutreachMessages.status, "scheduled"),
        isNull(chamberOutreachMessages.sendClaimToken),
        isNull(chamberOutreachMessages.sendClaimedAt),
        isNull(chamberOutreachMessages.sendAttemptedAt),
        isNull(chamberOutreachMessages.sentAt),
        isNull(chamberOutreachMessages.providerMessageId),
        isNull(chamberOutreachMessages.error),
        lte(chamberOutreachMessages.scheduledAt, now)
      )
    )
    .orderBy(asc(chamberOutreachMessages.scheduledAt)).limit(100);
  const result = [];
  for (const message of messages) {
    const [prospect] = await db
      .select()
      .from(chamberOutreachProspects)
      .where(eq(chamberOutreachProspects.id, message.prospectId))
      .limit(1);
    if (prospect?.status === "in_sequence") result.push({ message, prospect });
  }
  return result;
}

export async function getPreviousSentMessage(prospectId: number, step: number) {
  const db = await requireDb();
  return (
    await db
      .select()
      .from(chamberOutreachMessages)
      .where(
        and(
          eq(chamberOutreachMessages.prospectId, prospectId),
          eq(chamberOutreachMessages.sequenceStep, step - 1),
          eq(chamberOutreachMessages.status, "sent")
        )
      )
      .limit(1)
  )[0];
}

export type ChamberDailyLease = { id: number; campaignId: number; runDate: string; leaseToken: string; newReserved: number };
export type ChamberSendGate = { dailyLease: ChamberDailyLease; now: Date; inboxCheckedAt: Date;
  taskUid: string; expectedEmail: string; expectedSubject: string; expectedTextBody: string };

function chamberGateDate(input: ChamberSendGate) {
  outreachDeadlineCheck();
  if (!Number.isFinite(input.now.getTime()) || !Number.isFinite(input.inboxCheckedAt.getTime())) return false;
  const moment = getOutreachLocalMoment(input.now);
  return moment.dateKey === input.dailyLease.runDate && moment.hour >= 9 && moment.hour < 17 &&
    input.inboxCheckedAt <= input.now && input.now.getTime() - input.inboxCheckedAt.getTime() < 27_000;
}
function chamberOwnedDay(input: ChamberSendGate) {
  const lease = input.dailyLease;
  // Both DST transitions precede 09:00; next local midnight gives that afternoon's offset.
  const { end } = getOutreachCentralDateBounds(lease.runDate);
  const sendStart = new Date(end.getTime() - 15 * 60 * 60 * 1000);
  const sendEnd = new Date(end.getTime() - 7 * 60 * 60 * 1000);
  return sql`EXISTS (SELECT 1 FROM ${chamberOutreachDailyRuns} r WHERE r.id = ${lease.id} AND r.campaignId = ${chamberOutreachMessages.campaignId} AND r.runDate = ${lease.runDate} AND r.status = 'started' AND r.leaseToken = ${lease.leaseToken} AND r.leaseExpiresAt >= ${input.now} AND r.leaseExpiresAt > CURRENT_TIMESTAMP(3) AND CURRENT_TIMESTAMP(3) >= ${sendStart} AND CURRENT_TIMESTAMP(3) < ${sendEnd})`;
}
/** Both claim and attempt re-read source/stop/configuration/inbox ownership in SQL. */
function chamberFreshRecipient(input: ChamberSendGate) {
  // Existing watermark is timestamp(0); fresh completeAll is also required in this callback.
  const watermark = new Date(Math.floor(input.inboxCheckedAt.getTime() / 1000) * 1000);
  return sql`EXISTS (SELECT 1 FROM ${chamberOutreachProspects} p INNER JOIN ${chamberOutreachCampaigns} c ON c.id = p.campaignId
    WHERE p.id = ${chamberOutreachMessages.prospectId} AND p.campaignId = ${chamberOutreachMessages.campaignId}
    AND c.id = ${input.dailyLease.campaignId} AND c.slug = ${CAMPAIGN_SLUG} AND c.status = 'active'
    AND c.timezone = 'America/Chicago' AND c.sendHourLocal = 9 AND c.dailyNewLimit = 10 AND c.dailyTaskUid = ${input.taskUid}
    AND CHAR_LENGTH(TRIM(c.physicalPostalAddress)) >= 10 AND c.lastReplyCheckAt >= ${watermark}
    AND p.email = ${input.expectedEmail} AND ${chamberOutreachMessages.subject} = ${input.expectedSubject}
    AND ${chamberOutreachMessages.textBody} = ${input.expectedTextBody}
    AND p.researchStatus = 'approved' AND p.contactConfidence <> 'directory'
    AND (p.website LIKE 'http://%' OR p.website LIKE 'https://%' OR p.sourceUrl LIKE '%/list/member/%')
    AND (p.researchSources LIKE '%http://%' OR p.researchSources LIKE '%https://%')
    AND NOT EXISTS (SELECT 1 FROM ${chamberOutreachSuppressions} s WHERE s.email = p.email)
    AND ((${chamberOutreachMessages.sequenceStep} = 0 AND p.status = 'approved' AND p.firstSentAt IS NULL)
      OR (${chamberOutreachMessages.sequenceStep} > 0 AND p.status = 'in_sequence' AND p.firstSentAt IS NOT NULL
        AND ${chamberOutreachMessages.scheduledAt} <= ${input.now}
        AND EXISTS (SELECT 1 FROM chamberOutreachMessages prev WHERE prev.prospectId = p.id
          AND prev.sequenceStep = ${chamberOutreachMessages.sequenceStep} - 1 AND prev.status = 'sent'
          AND prev.sentAt IS NOT NULL AND prev.providerMessageId IS NOT NULL))))`;
}
class ChamberClaimUnavailable extends Error {}
/** A claim is never released/retried automatically, including a pre-SMTP timeout. */
export async function claimOutreachMessageForSend(input: ChamberSendGate & {
  messageId: number; prospectId: number; sequenceStep: number; claimToken: string;
}) {
  if (!input.dailyLease || !chamberGateDate(input)) return false;
  const db = await requireDb();
  try {
    await db.transaction(async tx => {
      const [owned] = await tx.select().from(chamberOutreachDailyRuns).where(and(
        eq(chamberOutreachDailyRuns.id, input.dailyLease.id), eq(chamberOutreachDailyRuns.campaignId, input.dailyLease.campaignId),
        eq(chamberOutreachDailyRuns.runDate, input.dailyLease.runDate), eq(chamberOutreachDailyRuns.status, 'started'),
        eq(chamberOutreachDailyRuns.leaseToken, input.dailyLease.leaseToken), gte(chamberOutreachDailyRuns.leaseExpiresAt, input.now)
      )).limit(1).for('update');
      if (!owned) throw new ChamberClaimUnavailable('Day lease is unavailable.');
      if (input.sequenceStep === 0) {
        const [reserved] = await tx.update(chamberOutreachDailyRuns).set({ newReserved: sql`${chamberOutreachDailyRuns.newReserved} + 1` })
          .where(and(eq(chamberOutreachDailyRuns.id, input.dailyLease.id), eq(chamberOutreachDailyRuns.leaseToken, input.dailyLease.leaseToken),
            eq(chamberOutreachDailyRuns.status, 'started'), gte(chamberOutreachDailyRuns.leaseExpiresAt, input.now),
            lt(chamberOutreachDailyRuns.newReserved, OUTREACH_DAILY_NEW_CONTACT_LIMIT)));
        if (Number(reserved.affectedRows ?? 0) !== 1) throw new ChamberClaimUnavailable('Daily ten-new cap reached.');
      }
      const [claimed] = await tx.update(chamberOutreachMessages).set({ sendClaimToken: input.claimToken, sendClaimedAt: input.now })
        .where(and(eq(chamberOutreachMessages.id, input.messageId), eq(chamberOutreachMessages.prospectId, input.prospectId),
          eq(chamberOutreachMessages.campaignId, input.dailyLease.campaignId), eq(chamberOutreachMessages.sequenceStep, input.sequenceStep),
          eq(chamberOutreachMessages.status, input.sequenceStep === 0 ? 'approved' : 'scheduled'),
          isNull(chamberOutreachMessages.sendClaimToken), isNull(chamberOutreachMessages.sendClaimedAt),
          isNull(chamberOutreachMessages.sendAttemptedAt), isNull(chamberOutreachMessages.sentAt),
          isNull(chamberOutreachMessages.providerMessageId), isNull(chamberOutreachMessages.error),
          chamberOwnedDay(input), chamberFreshRecipient(input)));
      if (Number(claimed.affectedRows ?? 0) !== 1) throw new ChamberClaimUnavailable('Message changed, stopped, or claimed.');
      outreachDeadlineCheck();
    });
    return true;
  } catch (error) {
    if (error instanceof ChamberClaimUnavailable || outreachUniqueViolation(error)) return false;
    throw error;
  }
}
/** Commit provider ID and durable attempt together BEFORE opening any SMTP socket. */
export async function recordOutreachSendAttempt(input: ChamberSendGate & {
  messageId: number; claimToken: string; providerMessageId: string;
}) {
  if (!input.dailyLease || !chamberGateDate(input)) return false;
  const db = await requireDb();
  const [result] = await db.update(chamberOutreachMessages).set({ sendAttemptedAt: input.now, providerMessageId: input.providerMessageId })
    .where(and(eq(chamberOutreachMessages.id, input.messageId), eq(chamberOutreachMessages.sendClaimToken, input.claimToken),
      inArray(chamberOutreachMessages.status, ['approved', 'scheduled']), isNull(chamberOutreachMessages.sendAttemptedAt),
      isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.providerMessageId), isNull(chamberOutreachMessages.error),
      chamberOwnedDay(input), chamberFreshRecipient(input)));
  return Number(result.affectedRows ?? 0) === 1;
}
export async function markOutreachMessageSent(input: {
  messageId: number; prospectId: number; sequenceStep: number; providerMessageId: string;
  sentAt: Date; nextFollowupAt: Date | null; claimToken: string; dailyLease: ChamberDailyLease;
}) {
  outreachDeadlineCheck();
  const db = await requireDb();
  return db.transaction(async tx => {
    const [changed] = await tx.update(chamberOutreachMessages).set({ status: 'sent', sentAt: input.sentAt })
      .where(and(eq(chamberOutreachMessages.id, input.messageId), eq(chamberOutreachMessages.campaignId, input.dailyLease.campaignId),
        eq(chamberOutreachMessages.prospectId, input.prospectId), eq(chamberOutreachMessages.sendClaimToken, input.claimToken),
        eq(chamberOutreachMessages.providerMessageId, input.providerMessageId), sql`${chamberOutreachMessages.sendAttemptedAt} IS NOT NULL`,
        inArray(chamberOutreachMessages.status, ['approved', 'scheduled']), isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.error)));
    if (Number(changed.affectedRows ?? 0) !== 1) return false;
    const [prospectChanged] = await tx.update(chamberOutreachProspects).set({
      status: input.nextFollowupAt ? 'in_sequence' : 'complete',
      firstSentAt: input.sequenceStep === 0 ? input.sentAt : undefined, lastSentAt: input.sentAt, nextFollowupAt: input.nextFollowupAt,
    }).where(and(eq(chamberOutreachProspects.id, input.prospectId), eq(chamberOutreachProspects.campaignId, input.dailyLease.campaignId),
      eq(chamberOutreachProspects.status, input.sequenceStep === 0 ? 'approved' : 'in_sequence'), isOutreachEmailNotSuppressed));
    if (Number(prospectChanged.affectedRows ?? 0) === 1 && input.nextFollowupAt) {
      await tx.update(chamberOutreachMessages).set({ status: 'scheduled', scheduledAt: input.nextFollowupAt })
        .where(and(eq(chamberOutreachMessages.prospectId, input.prospectId), eq(chamberOutreachMessages.campaignId, input.dailyLease.campaignId),
          eq(chamberOutreachMessages.sequenceStep, input.sequenceStep + 1), eq(chamberOutreachMessages.status, 'approved'),
          isNull(chamberOutreachMessages.sendClaimToken), isNull(chamberOutreachMessages.sendAttemptedAt),
          isNull(chamberOutreachMessages.providerMessageId), isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.error)));
    }
    await tx.update(chamberOutreachDailyRuns).set(input.sequenceStep === 0
      ? { newSent: sql`${chamberOutreachDailyRuns.newSent} + 1` }
      : { followupsSent: sql`${chamberOutreachDailyRuns.followupsSent} + 1` }).where(and(
        eq(chamberOutreachDailyRuns.id, input.dailyLease.id), eq(chamberOutreachDailyRuns.leaseToken, input.dailyLease.leaseToken),
        eq(chamberOutreachDailyRuns.status, 'started')));
    await tx.insert(chamberOutreachEvents).values({ campaignId: input.dailyLease.campaignId, prospectId: input.prospectId,
      messageId: input.messageId, eventType: input.sequenceStep === 0 ? 'initial_sent' : 'followup_sent',
      detail: `Sequence step ${input.sequenceStep} accepted; immutable provider ID retained.`, occurredAt: input.sentAt });
    outreachDeadlineCheck();
    return true;
  });
}
export async function markOutreachMessageFailed(messageId: number, prospectId: number, error: string, claimToken?: string) {
  // Never overwrite an old failed/errored row or an accepted receipt.
  if (!claimToken) return false;
  const db = await requireDb();
  const [changed] = await db.update(chamberOutreachMessages).set({ status: 'failed', error: error.slice(0, 4000) }).where(and(
    eq(chamberOutreachMessages.id, messageId), eq(chamberOutreachMessages.prospectId, prospectId),
    eq(chamberOutreachMessages.sendClaimToken, claimToken), inArray(chamberOutreachMessages.status, ['approved', 'scheduled']),
    isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.error)));
  return Number(changed.affectedRows ?? 0) === 1;
}
export async function skipOutreachMessage(messageId: number, prospectId: number, reason: string) {
  const db = await requireDb();
  const [changed] = await db.update(chamberOutreachMessages).set({ status: 'skipped', error: reason }).where(and(
    eq(chamberOutreachMessages.id, messageId), eq(chamberOutreachMessages.prospectId, prospectId),
    inArray(chamberOutreachMessages.status, ['draft', 'approved', 'scheduled']), isNull(chamberOutreachMessages.sendClaimToken),
    isNull(chamberOutreachMessages.sendAttemptedAt), isNull(chamberOutreachMessages.providerMessageId),
    isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.error)));
  return Number(changed.affectedRows ?? 0) === 1;
}

export async function getProspectsAwaitingReplies() {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  return db
    .select()
    .from(chamberOutreachProspects)
    .where(
      and(
        eq(chamberOutreachProspects.campaignId, campaign.id),
        eq(chamberOutreachProspects.status, "in_sequence")
      )
    );
}

export async function markProspectReplied(input: {
  prospectId: number;
  email: string;
  detail: string;
  repliedAt: Date;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  await upsertSuppression({
    email: input.email,
    reason: "replied",
    source: "imap_reply_monitor",
    notes: input.detail,
  });
  await db
    .update(chamberOutreachProspects)
    .set({
      status: "replied",
      repliedAt: input.repliedAt,
      nextFollowupAt: null,
    })
    .where(eq(chamberOutreachProspects.id, input.prospectId));
  await db
    .update(chamberOutreachMessages)
    .set({ status: "skipped" })
    .where(
      and(
        eq(chamberOutreachMessages.campaignId, campaign.id),
        eq(chamberOutreachMessages.prospectId, input.prospectId),
        inArray(chamberOutreachMessages.status, [
          "draft",
          "approved",
          "scheduled",
        ])
      )
    );
  await db.insert(chamberOutreachEvents).values({
    campaignId: campaign.id,
    prospectId: input.prospectId,
    eventType: "reply_detected",
    detail: input.detail,
    occurredAt: input.repliedAt,
  });
}

/** Existing complete/skipped/failed/legacy rows are permanently fenced. Only new started markers resume. */
export async function reserveOutreachDailyRun(runDate: string, now = new Date()): Promise<ChamberDailyLease | null> {
  outreachDeadlineCheck();
  const moment = getOutreachLocalMoment(now);
  if (moment.dateKey !== runDate || moment.hour < 9 || moment.hour >= 17) return null;
  const db = await requireDb();
  const campaign = await getCampaignForAutomation();
  const [existing] = await db.select().from(chamberOutreachDailyRuns).where(and(
    eq(chamberOutreachDailyRuns.campaignId, campaign.id), eq(chamberOutreachDailyRuns.runDate, runDate)
  )).limit(1);
  const leaseToken = randomBytes(24).toString('hex');
  const leaseExpiresAt = new Date(now.getTime() + 35_000);
  if (existing) {
    if (existing.status !== 'started' || !existing.leaseToken || !existing.leaseExpiresAt || existing.leaseExpiresAt >= now) return null;
    const [changed] = await db.update(chamberOutreachDailyRuns).set({ leaseToken, leaseExpiresAt }).where(and(
      eq(chamberOutreachDailyRuns.id, existing.id), eq(chamberOutreachDailyRuns.status, 'started'),
      eq(chamberOutreachDailyRuns.leaseToken, existing.leaseToken), lt(chamberOutreachDailyRuns.leaseExpiresAt, now)
    ));
    return Number(changed.affectedRows ?? 0) === 1
      ? { id: existing.id, campaignId: campaign.id, runDate, leaseToken, newReserved: existing.newReserved } : null;
  }
  // New rows start conservatively with all previously sent OR claimed initial contacts in this Chicago day.
  const { start, end } = getOutreachCentralDateBounds(runDate);
  const [counted] = await db.select({ count: sql<number>`count(*)` }).from(chamberOutreachMessages).where(and(
    eq(chamberOutreachMessages.campaignId, campaign.id), eq(chamberOutreachMessages.sequenceStep, 0), or(
      and(gte(chamberOutreachMessages.sentAt, start), lt(chamberOutreachMessages.sentAt, end)),
      and(gte(chamberOutreachMessages.sendClaimedAt, start), lt(chamberOutreachMessages.sendClaimedAt, end)),
      and(gte(chamberOutreachMessages.sendAttemptedAt, start), lt(chamberOutreachMessages.sendAttemptedAt, end))
    )
  ));
  const newReserved = Number(counted?.count ?? 0);
  try {
    const [result] = await db.insert(chamberOutreachDailyRuns).values({ campaignId: campaign.id, runDate,
      status: 'started', leaseToken, leaseExpiresAt, newReserved,
      summary: 'New durable Chamber daily run; unknown attempts and reservations are never retried.' });
    return { id: Number(result.insertId), campaignId: campaign.id, runDate, leaseToken, newReserved };
  } catch (error) {
    if (outreachUniqueViolation(error)) return null;
    throw error;
  }
}
/** Owner-only update. Successful counts are committed with receipts, never reset by callback-local counters. */
export async function recordOutreachDailyRun(input: {
  runDate: string; status: 'started' | 'complete' | 'skipped' | 'failed';
  newSent: number; followupsSent: number; repliesDetected: number; errorCount: number; summary: string;
  lease: ChamberDailyLease; now?: Date;
}) {
  if (!input.lease) return false;
  outreachDeadlineCheck();
  const db = await requireDb();
  const now = input.now ?? new Date();
  const [changed] = await db.update(chamberOutreachDailyRuns).set({ status: input.status,
    repliesDetected: sql`${chamberOutreachDailyRuns.repliesDetected} + ${input.repliesDetected}`,
    errorCount: sql`${chamberOutreachDailyRuns.errorCount} + ${input.errorCount}`,
    summary: input.summary.slice(0, 8000),
    // Preserve the non-NULL new-run marker even when releasing a partial lease.
    leaseExpiresAt: input.status === 'started' ? new Date(now.getTime() - 1) : now,
  }).where(and(eq(chamberOutreachDailyRuns.id, input.lease.id), eq(chamberOutreachDailyRuns.campaignId, input.lease.campaignId),
    eq(chamberOutreachDailyRuns.runDate, input.runDate), eq(chamberOutreachDailyRuns.status, 'started'),
    eq(chamberOutreachDailyRuns.leaseToken, input.lease.leaseToken), gte(chamberOutreachDailyRuns.leaseExpiresAt, now)));
  if (Number(changed.affectedRows ?? 0) !== 1) return false;
  await db.update(chamberOutreachCampaigns).set({ lastRunAt: now }).where(eq(chamberOutreachCampaigns.id, input.lease.campaignId));
  return true;
}

export async function isOutreachEmailSuppressed(email: string) {
  const db = await requireDb();
  const normalizedEmail = email.toLowerCase();
  const [suppressionRows, prospectRows] = await Promise.all([
    db
      .select()
      .from(chamberOutreachSuppressions)
      .where(eq(chamberOutreachSuppressions.email, normalizedEmail))
      .limit(1),
    db
      .select({
        businessName: chamberOutreachProspects.businessName,
        website: chamberOutreachProspects.website,
        email: chamberOutreachProspects.email,
      })
      .from(chamberOutreachProspects)
      .where(eq(chamberOutreachProspects.email, normalizedEmail))
      .limit(1),
  ]);
  if (suppressionRows[0]) return true;
  const prospect = prospectRows[0];

  // `outreachAutomation` invokes this immediately before SMTP. Preserve the
  // shared-suppression return contract while treating a reciprocal Training
  // conflict as equally ineligible; an unavailable Training read propagates
  // and therefore never permits a delivery.
  return Boolean(
    await getTrainingConflictForChamberProspect(db, {
      businessName: prospect?.businessName || "",
      website: prospect?.website || null,
      email: prospect?.email || normalizedEmail,
    })
  );
}

export async function recordReplyCheck(at: Date) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  await db
    .update(chamberOutreachCampaigns)
    .set({ lastReplyCheckAt: at })
    .where(eq(chamberOutreachCampaigns.id, campaign.id));
}

export async function recordOutreachEvent(input: {
  eventType: string;
  detail?: string | null;
  occurredAt?: Date;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  await db.insert(chamberOutreachEvents).values({
    campaignId: campaign.id,
    eventType: input.eventType,
    detail: input.detail,
    occurredAt: input.occurredAt,
  });
}

export async function hasOutreachEventSince(eventType: string, since: Date) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  const [event] = await db
    .select()
    .from(chamberOutreachEvents)
    .where(
      and(
        eq(chamberOutreachEvents.campaignId, campaign.id),
        eq(chamberOutreachEvents.eventType, eventType),
        gte(chamberOutreachEvents.occurredAt, since)
      )
    )
    .limit(1);
  return Boolean(event);
}

export async function setOutreachScheduleIds(input: {
  dailyTaskUid?: string | null;
  recapTaskUid?: string | null;
}) {
  const db = await requireDb();
  const campaign = await ensureChamberOutreachCampaign();
  await db
    .update(chamberOutreachCampaigns)
    .set(input)
    .where(eq(chamberOutreachCampaigns.id, campaign.id));
}

/** Inbox maintenance must not invoke ensureChamberOutreachCampaign: it upserts controls/drafts. */
export async function getChamberInboxSnapshot() {
  const db = await requireDb();
  const [campaign] = await db.select().from(chamberOutreachCampaigns)
    .where(eq(chamberOutreachCampaigns.slug, CAMPAIGN_SLUG)).limit(1);
  if (!campaign) throw new Error("Existing Chamber inbox campaign missing; sending blocked.");
  const prospects = await db.select().from(chamberOutreachProspects).where(and(
    eq(chamberOutreachProspects.campaignId, campaign.id),
    eq(chamberOutreachProspects.status, "in_sequence")
  )).limit(201);
  if (prospects.length > 200) throw new Error("Chamber inbox target bound exceeded; sending blocked.");
  const messages = prospects.length ? await db.select().from(chamberOutreachMessages).where(and(
    eq(chamberOutreachMessages.campaignId, campaign.id),
    inArray(chamberOutreachMessages.prospectId, prospects.map(p => p.id)),
    eq(chamberOutreachMessages.status, "sent")
  )).limit(601) : [];
  if (messages.length > 600) throw new Error("Chamber inbox sent-message bound exceeded; sending blocked.");
  return { campaign, prospects, messages };
}

export type ChamberInboxStopInput = {
  campaignId: number;
  prospectId: number;
  email: string;
  messageId: number;
  kind: "replied" | "ooo" | "optout" | "permanent";
  expectedSentAt: Date;
  expectedProviderMessageId: string | null;
  binding: "message_id" | "recipient_time";
  suppressionReason: "replied" | "unsubscribed" | "bounced" | "manual";
  receivedAt: Date;
  action?: string;
  status?: string;
  evidenceKey: string;
  safetyVersion: string;
  deadline: number;
};

/**
 * One existing-campaign/prospect stop, serialized by its prospect lock. A replay
 * or an already terminal historical disposition makes no changes. No campaign
 * controls, sent copy, provider ID, failed attempt, or pre-existing suppression
 * metadata are overwritten. The audit stores structured evidence, not mail.
 */
export async function stopChamberInboxProspect(input: ChamberInboxStopInput) {
  const checkDeadline = () => {
    if (!Number.isFinite(input.deadline) || Date.now() >= input.deadline)
      throw new Error("Chamber inbox stop deadline exceeded; sending blocked.");
  };
  checkDeadline();
  if (!/^[a-f0-9]{64}$/.test(input.evidenceKey) || !Number.isFinite(input.receivedAt.getTime()))
    throw new Error("Chamber inbox stop evidence invalid; sending blocked.");
  if (!Number.isFinite(input.expectedSentAt.getTime()) || (input.binding === "message_id" && !input.expectedProviderMessageId))
    throw new Error("Chamber inbox original sent binding invalid; sending blocked.");
  if (input.kind === "permanent" && (input.action !== "failed" || !/^5\.\d{1,3}\.\d{1,3}$/.test(input.status || "")))
    throw new Error("Chamber permanent stop requires failed + 5.x.x evidence.");
  const expectedReason = input.kind === "optout" ? "unsubscribed" : input.kind === "permanent"
    ? /^5\.7\./.test(input.status!) ? "manual" : "bounced" : "replied";
  if (input.suppressionReason !== expectedReason) throw new Error("Chamber inbox suppression disposition mismatch.");
  const db = await requireDb();
  return db.transaction(async tx => {
    const [campaign] = await tx.select({ id: chamberOutreachCampaigns.id }).from(chamberOutreachCampaigns)
      .where(and(eq(chamberOutreachCampaigns.id, input.campaignId), eq(chamberOutreachCampaigns.slug, CAMPAIGN_SLUG))).limit(1);
    if (!campaign) throw new Error("Existing Chamber inbox campaign ownership mismatch.");
    const [prospect] = await tx.select().from(chamberOutreachProspects).where(and(
      eq(chamberOutreachProspects.campaignId, input.campaignId), eq(chamberOutreachProspects.id, input.prospectId)
    )).limit(1).for("update");
    if (!prospect || prospect.email.trim().toLowerCase() !== input.email.trim().toLowerCase())
      throw new Error("Chamber inbox prospect ownership mismatch.");
    checkDeadline();
    // Preserve all fixed known historical stops and manual terminal decisions.
    if (prospect.status !== "in_sequence") return false;
    const [anchor] = await tx.select().from(chamberOutreachMessages).where(and(
      eq(chamberOutreachMessages.campaignId, input.campaignId), eq(chamberOutreachMessages.prospectId, input.prospectId),
      eq(chamberOutreachMessages.id, input.messageId), eq(chamberOutreachMessages.status, "sent")
    )).limit(1);
    if (!anchor?.sentAt || anchor.sentAt > input.receivedAt) throw new Error("Chamber inbox sent anchor missing or changed.");
    if (anchor.sentAt.getTime() !== input.expectedSentAt.getTime() || anchor.providerMessageId !== input.expectedProviderMessageId)
      throw new Error("Chamber inbox exact original sent binding changed; sending blocked.");
    const eventType = input.kind === "permanent" ? "delivery_failure_detected" : input.kind === "optout" ? "optout_detected" : "reply_detected";
    const detail = JSON.stringify({ safetyVersion: input.safetyVersion, evidenceKey: input.evidenceKey,
      kind: input.kind, binding: input.binding, action: input.action, status: input.status,
      suppressionReason: input.suppressionReason, messageId: anchor.id,
      note: input.suppressionReason === "manual" ? "Permanent policy rejection; sender/authentication review required, not an invalid-address assertion." : "Bound inbox evidence; subsequent unattempted follow-ups stopped." });
    checkDeadline();
    const [changed] = await tx.update(chamberOutreachProspects).set({
      status: input.kind === "permanent" ? "bounced" : input.kind === "optout" ? "unsubscribed" : "replied",
      nextFollowupAt: null,
      ...(input.kind === "optout" ? { unsubscribedAt: input.receivedAt } : input.kind !== "permanent" ? { repliedAt: input.receivedAt } : {}),
      manualNotes: sql`CONCAT_WS('\n\n', NULLIF(${chamberOutreachProspects.manualNotes}, ''), ${detail})`,
    }).where(and(eq(chamberOutreachProspects.campaignId, input.campaignId), eq(chamberOutreachProspects.id, input.prospectId), eq(chamberOutreachProspects.status, "in_sequence")));
    if (Number(changed.affectedRows ?? 0) !== 1) return false;
    checkDeadline();
    await tx.update(chamberOutreachMessages).set({ status: "skipped", error: detail }).where(and(
      eq(chamberOutreachMessages.campaignId, input.campaignId), eq(chamberOutreachMessages.prospectId, input.prospectId),
      gte(chamberOutreachMessages.sequenceStep, anchor.sequenceStep + 1),
      inArray(chamberOutreachMessages.status, ["draft", "approved", "scheduled"]),
      isNull(chamberOutreachMessages.sentAt), isNull(chamberOutreachMessages.providerMessageId)
    ));
    checkDeadline();
    await tx.insert(chamberOutreachSuppressions).values({ email: prospect.email.trim().toLowerCase(),
      reason: input.suppressionReason, source: "chamber_imap_safety_monitor", notes: detail
    }).onDuplicateKeyUpdate({ set: { email: sql`${chamberOutreachSuppressions.email}` } });
    checkDeadline();
    await tx.insert(chamberOutreachEvents).values({ campaignId: input.campaignId, prospectId: input.prospectId,
      messageId: input.messageId, eventType, detail, occurredAt: input.receivedAt });
    checkDeadline();
    return true;
  });
}

/** Only the completed scanner calls this; never initialize campaigns or move the watermark backwards. */
export async function recordChamberInboxCheck(campaignId: number, at: Date, deadline: number) {
  if (!Number.isFinite(at.getTime()) || !Number.isFinite(deadline) || Date.now() >= deadline)
    throw new Error("Chamber inbox completion deadline invalid or exceeded; sending blocked.");
  const db = await requireDb();
  const [result] = await db.update(chamberOutreachCampaigns).set({ lastReplyCheckAt: at }).where(and(
    eq(chamberOutreachCampaigns.id, campaignId), eq(chamberOutreachCampaigns.slug, CAMPAIGN_SLUG),
    or(isNull(chamberOutreachCampaigns.lastReplyCheckAt), lte(chamberOutreachCampaigns.lastReplyCheckAt, at)),
    sql`CURRENT_TIMESTAMP(3) < ${new Date(deadline)}`
  ));
  if (Number(result.affectedRows ?? 0) !== 1) throw new Error("Chamber inbox completion stamp not confirmed; sending blocked.");
}
