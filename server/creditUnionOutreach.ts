import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  chamberOutreachMessages,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  creditUnionCampaigns,
  creditUnionEvents,
  creditUnionMessages,
  creditUnionProspects,
  type CreditUnionMessage,
  type CreditUnionProspect,
} from "../drizzle/schema";
import {
  CREDIT_UNION_CAMPAIGN_SLUG,
  CREDIT_UNION_DAY_OFFSETS,
  CREDIT_UNION_DRAFT_VERSION,
  CREDIT_UNION_TIME_ZONE,
  CREDIT_UNION_UNSENT_CANCELLATION_STATUSES,
  buildCreditUnionSequence,
  canEditCreditUnionContact,
  firstNameFromCreditUnionContact,
  getCreditUnionDraftApprovalReadiness,
  getCreditUnionSendReadiness,
  getCreditUnionUnsubscribeUrl,
  isCreditUnionTargetingReady,
  isExactSourcedBusinessEmail,
  normalizeCreditUnionDomain,
  normalizeCreditUnionEmail,
  normalizeCreditUnionOrganization,
  selectCreditUnionPrimaryContact,
  type CreditUnionContact,
  type CreditUnionEmailConfidence,
  type CreditUnionMessageStatus,
  type CreditUnionObservedOutcomeEvent,
  type CreditUnionProspectStatus,
  type CreditUnionResearchImport,
  type CreditUnionResearchProspect,
  type CreditUnionSource,
} from "../shared/creditUnionOutreach";
import { OUTREACH_DAILY_NEW_CONTACT_LIMIT } from "../shared/outreachMaintenance";
import { getDb } from "./db";

const DEFAULT_ADDRESS = "319 N Mesquite St, Corpus Christi, TX 78401";
const SEQUENCE_CONFIG = JSON.stringify({
  dayOffsets: CREDIT_UNION_DAY_OFFSETS,
  rollWeekends: true,
  maxActiveContactsPerOrganization: 1,
});

const responseStatuses = new Set<CreditUnionProspectStatus>([
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "not_fit",
  "complete",
]);

const cancellationEventTypes = new Set<CreditUnionObservedOutcomeEvent>([
  "reply",
  "positive_reply",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "outcome_not_fit",
]);

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ResearchRecord = {
  researchedOn: string | null;
  fallbackContactUrl: string | null;
  socialChannels: unknown;
  observedOpportunities: unknown;
  verifiedPersonalizedOpening: string | null;
  shortVerifiedTopic: string | null;
  specificContentIdea: string | null;
  specificRepurposingIdea: string | null;
  specificSmallStart: string | null;
  personalizationNotes: string | null;
  claimsToAvoid: unknown;
  limitations: unknown;
  shortlistRank: number | null;
  shortlistReason: string | null;
};

export type CreditUnionImportResult = {
  campaignId: number;
  imported: number;
  updated: number;
  skippedNotFit: number;
  skippedInvalid: number;
  blockedByChamber: number;
};

function clean(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max = 10_000) {
  const result = clean(value, max);
  return result || null;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asContacts(value: unknown): CreditUnionContact[] {
  return Array.isArray(value)
    ? value.filter(
        (contact): contact is CreditUnionContact =>
          Boolean(contact) && typeof contact === "object"
      )
    : [];
}

function sourceList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(
          (source): source is { url: unknown; supports: unknown } =>
            Boolean(source) && typeof source === "object"
        )
        .map(source => ({
          url: clean(source.url, 500),
          supports: clean(source.supports, 2_000),
        }))
        .filter(source => source.url)
    : [];
}

function toInteger(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function boundedScore(value: unknown) {
  return Math.max(0, Math.min(100, toInteger(value, 0)));
}

function shouldHaveDrafts(research: ResearchRecord) {
  return Boolean(
    research.verifiedPersonalizedOpening &&
      research.shortVerifiedTopic &&
      research.specificContentIdea &&
      research.specificRepurposingIdea &&
      research.specificSmallStart
  );
}

function getTop25Metadata(
  input: CreditUnionResearchImport,
  prospect: CreditUnionResearchProspect
) {
  const direct = prospect as CreditUnionResearchProspect & {
    shortlistRank?: unknown;
    shortlistReason?: unknown;
  };
  const directRank = toInteger(direct.shortlistRank, 0);
  const directReason = nullable(direct.shortlistReason, 4_000);
  if (directRank || directReason) {
    return { shortlistRank: directRank || null, shortlistReason: directReason };
  }

  const list = Array.isArray(input.top25)
    ? input.top25
    : input.top25 && typeof input.top25 === "object"
      ? Object.values(input.top25 as Record<string, unknown>)
      : [];
  const targetName = normalizeCreditUnionOrganization(prospect.creditUnionName);
  const targetDomain = normalizeCreditUnionDomain(prospect.website);
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const candidateName = normalizeCreditUnionOrganization(
      clean(
        candidate.creditUnionName ?? candidate.name ?? candidate.organization
      )
    );
    const candidateDomain = normalizeCreditUnionDomain(
      clean(candidate.website ?? candidate.domain)
    );
    if (
      candidateName !== targetName &&
      (!targetDomain || !candidateDomain || candidateDomain !== targetDomain)
    ) {
      continue;
    }
    const rank = toInteger(
      candidate.shortlistRank ?? candidate.rank ?? candidate.position,
      index + 1
    );
    return {
      shortlistRank: rank > 0 ? rank : index + 1,
      shortlistReason: nullable(
        candidate.shortlistReason ?? candidate.reason ?? candidate.fitReason,
        4_000
      ),
    };
  }
  return { shortlistRank: null, shortlistReason: null };
}

function researchRecord(
  input: CreditUnionResearchImport,
  prospect: CreditUnionResearchProspect
): ResearchRecord {
  const top25 = getTop25Metadata(input, prospect);
  return {
    researchedOn: nullable(input.researchedOn, 80),
    fallbackContactUrl: nullable(prospect.fallbackContactUrl, 500),
    socialChannels: prospect.socialChannels ?? null,
    observedOpportunities: prospect.observedOpportunities ?? null,
    verifiedPersonalizedOpening: nullable(
      prospect.verifiedPersonalizedOpening,
      4_000
    ),
    shortVerifiedTopic: nullable(prospect.shortVerifiedTopic, 1_000),
    specificContentIdea: nullable(prospect.specificContentIdea, 4_000),
    specificRepurposingIdea: nullable(prospect.specificRepurposingIdea, 4_000),
    specificSmallStart: nullable(prospect.specificSmallStart, 4_000),
    personalizationNotes: nullable(prospect.personalizationNotes, 4_000),
    claimsToAvoid: prospect.claimsToAvoid ?? null,
    limitations: prospect.limitations ?? null,
    shortlistRank: top25.shortlistRank,
    shortlistReason: top25.shortlistReason,
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function ensureCreditUnionCampaign() {
  const db = await requireDb();
  const [existing] = await db
    .select()
    .from(creditUnionCampaigns)
    .where(eq(creditUnionCampaigns.slug, CREDIT_UNION_CAMPAIGN_SLUG))
    .limit(1);
  if (existing) return existing;

  await db
    .insert(creditUnionCampaigns)
    .values({
      slug: CREDIT_UNION_CAMPAIGN_SLUG,
      name: "Texas Credit Union content outreach — 2026",
      status: "review",
      dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      sendHourLocal: 9,
      timezone: CREDIT_UNION_TIME_ZONE,
      senderName: "Jeremy Wells",
      senderEmail: "jeremy@jeristotleproductions.com",
      physicalPostalAddress: DEFAULT_ADDRESS,
      sequenceConfig: SEQUENCE_CONFIG,
      notes:
        "Review-only preparation. No list/config approval, sender, schedule, or activation is authorized.",
    })
    .onDuplicateKeyUpdate({
      set: {
        dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
        updatedAt: new Date(),
      },
    });

  const [campaign] = await db
    .select()
    .from(creditUnionCampaigns)
    .where(eq(creditUnionCampaigns.slug, CREDIT_UNION_CAMPAIGN_SLUG))
    .limit(1);
  if (!campaign)
    throw new Error("Credit Union campaign could not be initialized");
  return campaign;
}

async function getChamberConflict(db: Database, email: string | null) {
  if (!email) return null;
  const [suppression, inSequence, sent] = await Promise.all([
    db
      .select({
        id: chamberOutreachSuppressions.id,
        reason: chamberOutreachSuppressions.reason,
      })
      .from(chamberOutreachSuppressions)
      .where(eq(chamberOutreachSuppressions.email, email))
      .limit(1),
    db
      .select({ id: chamberOutreachProspects.id })
      .from(chamberOutreachProspects)
      .where(
        and(
          eq(chamberOutreachProspects.email, email),
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
          eq(chamberOutreachProspects.email, email),
          eq(chamberOutreachMessages.status, "sent")
        )
      )
      .limit(1),
  ]);
  if (suppression[0]) {
    return `Shared Chamber suppression: ${suppression[0].reason}.`;
  }
  if (inSequence[0]) {
    return "Matching email is active or approved in the Chamber outreach sequence.";
  }
  if (sent[0]) {
    return "Matching email was already sent in the Chamber outreach campaign.";
  }
  return null;
}

async function findExistingProspect(
  db: Database,
  campaignId: number,
  identity: {
    organization: string;
    domain: string | null;
    email: string | null;
  }
) {
  const identities = [
    eq(creditUnionProspects.normalizedOrganization, identity.organization),
  ];
  if (identity.domain) {
    identities.push(eq(creditUnionProspects.normalizedDomain, identity.domain));
  }
  if (identity.email) {
    identities.push(eq(creditUnionProspects.normalizedEmail, identity.email));
  }
  return db
    .select()
    .from(creditUnionProspects)
    .where(
      and(eq(creditUnionProspects.campaignId, campaignId), or(...identities))
    )
    .orderBy(asc(creditUnionProspects.id));
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
  const rows = await db
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
  return Boolean(rows[0]);
}

async function getProspectMessages(db: Database, prospectId: number) {
  return db
    .select()
    .from(creditUnionMessages)
    .where(eq(creditUnionMessages.prospectId, prospectId))
    .orderBy(asc(creditUnionMessages.sequenceStep));
}

function messageStatuses(
  messages: CreditUnionMessage[]
): CreditUnionMessageStatus[] {
  return messages.map(message => message.status as CreditUnionMessageStatus);
}

function hasResearchForDrafts(research: ResearchRecord) {
  return Boolean(
    research.verifiedPersonalizedOpening &&
      research.shortVerifiedTopic &&
      research.specificContentIdea &&
      research.specificRepurposingIdea &&
      research.specificSmallStart
  );
}

async function draftReadiness(
  db: Database,
  prospect: CreditUnionProspect,
  messages: CreditUnionMessage[]
) {
  const [chamberConflict, duplicate] = await Promise.all([
    getChamberConflict(db, prospect.normalizedEmail),
    hasCreditUnionIdentityDuplicate(db, prospect),
  ]);
  const storedResearch = safeJson<ResearchRecord>(prospect.researchJson, {
    researchedOn: null,
    fallbackContactUrl: null,
    socialChannels: null,
    observedOpportunities: null,
    verifiedPersonalizedOpening: null,
    shortVerifiedTopic: null,
    specificContentIdea: null,
    specificRepurposingIdea: null,
    specificSmallStart: null,
    personalizationNotes: null,
    claimsToAvoid: null,
    limitations: null,
    shortlistRank: null,
    shortlistReason: null,
  });
  const readiness = getCreditUnionDraftApprovalReadiness({
    primaryContactName: prospect.primaryContactName,
    primaryContactTitle: prospect.primaryContactTitle,
    primaryEmail: prospect.primaryEmail,
    emailConfidence: prospect.emailConfidence as CreditUnionEmailConfidence,
    primaryEmailSourceUrl: prospect.primaryEmailSourceUrl,
    primaryRoleSourceUrl: prospect.primaryRoleSourceUrl,
    prospectStatus: prospect.status as CreditUnionProspectStatus,
    crossCampaignBlock: chamberConflict || prospect.crossCampaignBlock,
    duplicate,
    suppressed: Boolean(
      chamberConflict?.startsWith("Shared Chamber suppression")
    ),
    messageStatuses: messageStatuses(messages),
  });
  if (!hasResearchForDrafts(storedResearch)) {
    readiness.reasons.push(
      "Verified personalization and all three proposed ideas are required."
    );
    readiness.ready = false;
  }
  return {
    ...readiness,
    chamberConflict: Boolean(chamberConflict || prospect.crossCampaignBlock),
  };
}

async function sendReadiness(
  db: Database,
  campaign: Awaited<ReturnType<typeof ensureCreditUnionCampaign>>,
  prospect: CreditUnionProspect,
  messages: CreditUnionMessage[]
) {
  const [chamberConflict, duplicate] = await Promise.all([
    getChamberConflict(db, prospect.normalizedEmail),
    hasCreditUnionIdentityDuplicate(db, prospect),
  ]);
  const readiness = getCreditUnionSendReadiness({
    campaignStatus: campaign.status,
    listApprovedAt: campaign.listApprovedAt,
    configApprovedAt: campaign.configApprovedAt,
    primaryContactName: prospect.primaryContactName,
    primaryContactTitle: prospect.primaryContactTitle,
    primaryEmail: prospect.primaryEmail,
    emailConfidence: prospect.emailConfidence as CreditUnionEmailConfidence,
    primaryEmailSourceUrl: prospect.primaryEmailSourceUrl,
    primaryRoleSourceUrl: prospect.primaryRoleSourceUrl,
    prospectStatus: prospect.status as CreditUnionProspectStatus,
    crossCampaignBlock: chamberConflict || prospect.crossCampaignBlock,
    duplicate,
    suppressed: Boolean(
      chamberConflict?.startsWith("Shared Chamber suppression")
    ),
    messageStatuses: messageStatuses(messages),
  });
  return {
    ...readiness,
    chamberConflict: Boolean(chamberConflict || prospect.crossCampaignBlock),
  };
}

function hasProgress(
  prospect: CreditUnionProspect,
  messages: CreditUnionMessage[]
) {
  return Boolean(
    prospect.firstSentAt ||
      prospect.lastSentAt ||
      responseStatuses.has(prospect.status as CreditUnionProspectStatus) ||
      ["approved", "scheduled", "in_sequence", "complete"].includes(
        prospect.outreachStatus
      ) ||
      messages.some(message => message.status !== "draft")
  );
}

async function upsertDrafts(
  db: Database,
  campaign: Awaited<ReturnType<typeof ensureCreditUnionCampaign>>,
  prospect: CreditUnionProspect,
  research: ResearchRecord
) {
  if (!shouldHaveDrafts(research)) {
    return false;
  }

  const existingMessages = await getProspectMessages(db, prospect.id);
  if (existingMessages.some(message => message.status !== "draft"))
    return false;

  const drafts = buildCreditUnionSequence({
    creditUnionName: prospect.creditUnionName,
    firstName: firstNameFromCreditUnionContact(prospect.primaryContactName),
    verifiedPersonalizedOpening: research.verifiedPersonalizedOpening || "",
    shortVerifiedTopic: research.shortVerifiedTopic || "",
    specificContentIdea: research.specificContentIdea || "",
    specificRepurposingIdea: research.specificRepurposingIdea || "",
    specificSmallStart: research.specificSmallStart || "",
    unsubscribeUrl: getCreditUnionUnsubscribeUrl(prospect.unsubscribeToken),
    physicalPostalAddress: campaign.physicalPostalAddress,
  });

  for (const draft of drafts) {
    await db
      .insert(creditUnionMessages)
      .values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        sequenceStep: draft.sequenceStep,
        status: "draft",
        subject: draft.subject,
        alternativeSubject: draft.alternativeSubject,
        htmlBody: draft.html,
        textBody: draft.text,
        dayOffset: draft.dayOffset,
      })
      .onDuplicateKeyUpdate({
        set: {
          subject: draft.subject,
          alternativeSubject: draft.alternativeSubject,
          htmlBody: draft.html,
          textBody: draft.text,
          dayOffset: draft.dayOffset,
        },
      });
  }
  return true;
}

/**
 * Imports only researched qualified organizations. The source input remains the
 * audit record for not-fit rows; those are counted but intentionally not seeded
 * into the review queue. Existing sent/progress rows retain IDs, statuses,
 * timestamps, and message content.
 */
export async function importCreditUnionProspects(
  input: CreditUnionResearchImport
): Promise<CreditUnionImportResult> {
  if (!Array.isArray(input.prospects)) {
    throw new Error("Import requires a prospects array");
  }
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const result: CreditUnionImportResult = {
    campaignId: campaign.id,
    imported: 0,
    updated: 0,
    skippedNotFit: 0,
    skippedInvalid: 0,
    blockedByChamber: 0,
  };

  for (const rawProspect of input.prospects) {
    if (!rawProspect?.qualified) {
      result.skippedNotFit += 1;
      continue;
    }
    const creditUnionName = clean(rawProspect.creditUnionName, 220);
    const normalizedOrganization =
      normalizeCreditUnionOrganization(creditUnionName);
    if (!creditUnionName || !normalizedOrganization) {
      result.skippedInvalid += 1;
      continue;
    }

    const contacts = asContacts(rawProspect.contacts);
    const selection = selectCreditUnionPrimaryContact(contacts);
    const normalizedDomain = normalizeCreditUnionDomain(rawProspect.website);
    const research = researchRecord(input, rawProspect);
    const chamberBlock = await getChamberConflict(db, selection.primaryEmail);
    if (chamberBlock) result.blockedByChamber += 1;
    const targetingReady = isCreditUnionTargetingReady({
      name: selection.primaryContactName,
      title: selection.primaryContactTitle,
      email: selection.primaryEmail,
      emailConfidence: selection.emailConfidence,
      emailSourceUrl: selection.primaryEmailSourceUrl,
      roleSourceUrl: selection.primaryRoleSourceUrl,
    });
    const desiredStatus = targetingReady
      ? ("review" as const)
      : ("verification_needed" as const);
    const desiredOutreachStatus =
      targetingReady && hasResearchForDrafts(research) && !chamberBlock
        ? ("draft" as const)
        : ("blocked" as const);
    const existingMatches = await findExistingProspect(db, campaign.id, {
      organization: normalizedOrganization,
      domain: normalizedDomain,
      email: selection.primaryEmail,
    });
    const existing = existingMatches[0];
    const sharedValues = {
      creditUnionName,
      normalizedOrganization,
      website: nullable(rawProspect.website, 500),
      normalizedDomain,
      headquartersCity: nullable(rawProspect.headquartersCity, 160),
      branchCount:
        rawProspect.branchCount === null ||
        rawProspect.branchCount === undefined
          ? null
          : Math.max(0, toInteger(rawProspect.branchCount)),
      branchCountNote: nullable(rawProspect.branchCountNote, 4_000),
      operatingStatus: nullable(rawProspect.operatingStatus, 120),
      qualified: 1,
      fitScore: boundedScore(rawProspect.fitScore),
      fitReason: nullable(rawProspect.fitReason, 4_000),
      contactsJson: JSON.stringify(contacts),
      researchJson: JSON.stringify(research),
      sourcesJson: JSON.stringify(sourceList(rawProspect.sources)),
      primaryContactName: selection.primaryContactName,
      primaryContactTitle: selection.primaryContactTitle,
      primaryEmail: selection.primaryEmail,
      normalizedEmail: selection.primaryEmail,
      emailConfidence: selection.emailConfidence,
      primaryEmailSourceUrl: selection.primaryEmailSourceUrl,
      primaryRoleSourceUrl: selection.primaryRoleSourceUrl,
      crossCampaignBlock: chamberBlock,
      draftVersion: CREDIT_UNION_DRAFT_VERSION,
    };

    let prospect: CreditUnionProspect;
    if (!existing) {
      const insertResult = await db.insert(creditUnionProspects).values({
        campaignId: campaign.id,
        ...sharedValues,
        status: desiredStatus,
        outreachStatus: desiredOutreachStatus,
        unsubscribeToken: randomBytes(24).toString("hex"),
      });
      const id = Number(insertResult[0].insertId);
      const [inserted] = await db
        .select()
        .from(creditUnionProspects)
        .where(eq(creditUnionProspects.id, id))
        .limit(1);
      if (!inserted) throw new Error("Imported prospect could not be reloaded");
      prospect = inserted;
      result.imported += 1;
      await db.insert(creditUnionEvents).values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        eventType: "imported",
        detail: "Imported from reviewed Texas credit-union research.",
        metadataJson: JSON.stringify({
          researchedOn: research.researchedOn,
          shortlistRank: research.shortlistRank,
        }),
      });
    } else {
      const existingMessages = await getProspectMessages(db, existing.id);
      if (hasProgress(existing, existingMessages)) {
        // Refresh source-backed research only; preserve contact targeting and any progress.
        await db
          .update(creditUnionProspects)
          .set({
            contactsJson: sharedValues.contactsJson,
            researchJson: sharedValues.researchJson,
            sourcesJson: sharedValues.sourcesJson,
            fitScore: sharedValues.fitScore,
            fitReason: sharedValues.fitReason,
          })
          .where(eq(creditUnionProspects.id, existing.id));
      } else {
        await db
          .update(creditUnionProspects)
          .set({
            ...sharedValues,
            status: desiredStatus,
            outreachStatus: desiredOutreachStatus,
          })
          .where(eq(creditUnionProspects.id, existing.id));
      }
      const [updated] = await db
        .select()
        .from(creditUnionProspects)
        .where(eq(creditUnionProspects.id, existing.id))
        .limit(1);
      if (!updated) throw new Error("Existing prospect could not be reloaded");
      prospect = updated;
      result.updated += 1;
    }

    if (!hasProgress(prospect, await getProspectMessages(db, prospect.id))) {
      const createdDrafts = await upsertDrafts(
        db,
        campaign,
        prospect,
        research
      );
      if (!createdDrafts && prospect.outreachStatus !== "blocked") {
        await db
          .update(creditUnionProspects)
          .set({ outreachStatus: "blocked" })
          .where(eq(creditUnionProspects.id, prospect.id));
      }
    }
  }
  return result;
}

/** Refresh existing review drafts without reimporting or changing contact data. */
export async function refreshCreditUnionReviewDrafts(
  priorityInput?: CreditUnionResearchImport
) {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  if (
    campaign.status !== "review" ||
    campaign.listApprovedAt ||
    campaign.configApprovedAt
  ) {
    throw new Error(
      "Copy refresh requires an unapproved review-only campaign."
    );
  }
  const [prospects, messages] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaign.id)),
    db
      .select()
      .from(creditUnionMessages)
      .where(eq(creditUnionMessages.campaignId, campaign.id)),
  ]);
  if (
    messages.some(
      message =>
        message.status !== "draft" ||
        message.smtpAcceptedAt ||
        message.scheduledAt ||
        message.plannedAt
    )
  ) {
    throw new Error(
      "Copy refresh requires unsent, unscheduled draft messages only."
    );
  }
  let refreshed = 0;
  let skipped = 0;
  for (const prospect of prospects) {
    if (
      hasProgress(
        prospect,
        messages.filter(message => message.prospectId === prospect.id)
      )
    ) {
      skipped += 1;
      continue;
    }
    const research = safeJson<ResearchRecord | null>(
      prospect.researchJson,
      null
    );
    if (research && priorityInput) {
      const sourceProspect = priorityInput.prospects.find(
        p =>
          normalizeCreditUnionOrganization(p.creditUnionName) ===
          prospect.normalizedOrganization
      );
      if (sourceProspect)
        Object.assign(
          research,
          getTop25Metadata(priorityInput, sourceProspect)
        );
    }
    if (!research || !(await upsertDrafts(db, campaign, prospect, research))) {
      skipped += 1;
      continue;
    }
    await db
      .update(creditUnionProspects)
      .set({
        draftVersion: CREDIT_UNION_DRAFT_VERSION,
        researchJson: JSON.stringify(research),
      })
      .where(eq(creditUnionProspects.id, prospect.id));
    refreshed += 1;
  }
  return {
    campaign: campaign.slug,
    draftVersion: CREDIT_UNION_DRAFT_VERSION,
    refreshed,
    skipped,
    safety:
      "Draft copy and shortlist metadata only; contacts, approvals, statuses, suppression and sending unchanged.",
  };
}

export async function getCreditUnionWorkspace() {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const [prospects, messages, recentEvents, statsEvents] = await Promise.all([
    db
      .select()
      .from(creditUnionProspects)
      .where(eq(creditUnionProspects.campaignId, campaign.id))
      .orderBy(
        desc(creditUnionProspects.fitScore),
        asc(creditUnionProspects.id)
      ),
    db
      .select()
      .from(creditUnionMessages)
      .where(eq(creditUnionMessages.campaignId, campaign.id))
      .orderBy(
        asc(creditUnionMessages.prospectId),
        asc(creditUnionMessages.sequenceStep)
      ),
    db
      .select()
      .from(creditUnionEvents)
      .where(eq(creditUnionEvents.campaignId, campaign.id))
      .orderBy(desc(creditUnionEvents.occurredAt), desc(creditUnionEvents.id))
      .limit(100),
    db
      .select({
        eventType: creditUnionEvents.eventType,
        prospectId: creditUnionEvents.prospectId,
      })
      .from(creditUnionEvents)
      .where(eq(creditUnionEvents.campaignId, campaign.id)),
  ]);
  const emails = prospects
    .map(prospect => prospect.normalizedEmail)
    .filter((email): email is string => Boolean(email));
  const [chamberSuppressions, chamberActive, chamberSent] = emails.length
    ? await Promise.all([
        db
          .select({
            email: chamberOutreachSuppressions.email,
            reason: chamberOutreachSuppressions.reason,
          })
          .from(chamberOutreachSuppressions)
          .where(inArray(chamberOutreachSuppressions.email, emails)),
        db
          .select({ email: chamberOutreachProspects.email })
          .from(chamberOutreachProspects)
          .where(
            and(
              inArray(chamberOutreachProspects.email, emails),
              inArray(chamberOutreachProspects.status, [
                "in_sequence",
                "approved",
              ])
            )
          ),
        db
          .select({ email: chamberOutreachProspects.email })
          .from(chamberOutreachMessages)
          .innerJoin(
            chamberOutreachProspects,
            eq(chamberOutreachMessages.prospectId, chamberOutreachProspects.id)
          )
          .where(
            and(
              inArray(chamberOutreachProspects.email, emails),
              eq(chamberOutreachMessages.status, "sent")
            )
          ),
      ])
    : ([[], [], []] as const);

  const suppressionByEmail = new Map(
    chamberSuppressions.map(item => [item.email, item.reason])
  );
  const activeChamberEmails = new Set(chamberActive.map(item => item.email));
  const sentChamberEmails = new Set(chamberSent.map(item => item.email));
  const chamberConflictForEmail = (email: string | null) => {
    if (!email) return null;
    const suppression = suppressionByEmail.get(email);
    if (suppression) return `Shared Chamber suppression: ${suppression}.`;
    if (activeChamberEmails.has(email)) {
      return "Matching email is active or approved in the Chamber outreach sequence.";
    }
    if (sentChamberEmails.has(email)) {
      return "Matching email was already sent in the Chamber outreach campaign.";
    }
    return null;
  };
  const identityCounts = new Map<string, number>();
  for (const prospect of prospects) {
    for (const identity of [
      `org:${prospect.normalizedOrganization}`,
      prospect.normalizedDomain ? `domain:${prospect.normalizedDomain}` : null,
      prospect.normalizedEmail ? `email:${prospect.normalizedEmail}` : null,
    ]) {
      if (identity)
        identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
    }
  }
  const duplicateInWorkspace = (prospect: CreditUnionProspect) =>
    [
      `org:${prospect.normalizedOrganization}`,
      prospect.normalizedDomain ? `domain:${prospect.normalizedDomain}` : null,
      prospect.normalizedEmail ? `email:${prospect.normalizedEmail}` : null,
    ].some(
      identity => identity !== null && (identityCounts.get(identity) || 0) > 1
    );

  const messagesByProspect = new Map<number, CreditUnionMessage[]>();
  for (const message of messages) {
    const current = messagesByProspect.get(message.prospectId) || [];
    current.push(message);
    messagesByProspect.set(message.prospectId, current);
  }

  const workspaceProspects = prospects.map(prospect => {
    const prospectMessages = messagesByProspect.get(prospect.id) || [];
    const chamberBlock = chamberConflictForEmail(prospect.normalizedEmail);
    const duplicate = duplicateInWorkspace(prospect);
    const baseReadiness = {
      primaryContactName: prospect.primaryContactName,
      primaryContactTitle: prospect.primaryContactTitle,
      primaryEmail: prospect.primaryEmail,
      emailConfidence: prospect.emailConfidence as CreditUnionEmailConfidence,
      primaryEmailSourceUrl: prospect.primaryEmailSourceUrl,
      primaryRoleSourceUrl: prospect.primaryRoleSourceUrl,
      prospectStatus: prospect.status as CreditUnionProspectStatus,
      crossCampaignBlock: chamberBlock || prospect.crossCampaignBlock,
      duplicate,
      suppressed: Boolean(
        chamberBlock?.startsWith("Shared Chamber suppression")
      ),
    };
    const readiness = getCreditUnionDraftApprovalReadiness({
      ...baseReadiness,
      messageStatuses: messageStatuses(prospectMessages),
    });
    const research = safeJson<ResearchRecord | null>(
      prospect.researchJson,
      null
    );
    if (!research || !hasResearchForDrafts(research)) {
      readiness.reasons.push(
        "Verified personalization and all three proposed ideas are required."
      );
      readiness.ready = false;
    }
    const futureSendReadiness = getCreditUnionSendReadiness({
      ...baseReadiness,
      campaignStatus: campaign.status,
      listApprovedAt: campaign.listApprovedAt,
      configApprovedAt: campaign.configApprovedAt,
      messageStatuses: messageStatuses(prospectMessages),
    });
    return {
      ...prospect,
      contacts: safeJson<CreditUnionContact[]>(prospect.contactsJson, []),
      research,
      sources: safeJson<CreditUnionSource[]>(prospect.sourcesJson, []),
      readiness: {
        ...readiness,
        chamberConflict: Boolean(chamberBlock || prospect.crossCampaignBlock),
      },
      sendReadiness: {
        ...futureSendReadiness,
        chamberConflict: Boolean(chamberBlock || prospect.crossCampaignBlock),
      },
    };
  });

  const namedContacts = workspaceProspects.reduce(
    (total, prospect) =>
      total +
      prospect.contacts.filter(contact => Boolean(clean(contact.name))).length,
    0
  );
  const emailReady = workspaceProspects.filter(prospect =>
    isCreditUnionTargetingReady({
      name: prospect.primaryContactName,
      title: prospect.primaryContactTitle,
      email: prospect.primaryEmail,
      emailConfidence: prospect.emailConfidence as CreditUnionEmailConfidence,
      emailSourceUrl: prospect.primaryEmailSourceUrl,
      roleSourceUrl: prospect.primaryRoleSourceUrl,
    })
  ).length;
  const eventCount = (eventType: string) =>
    statsEvents.filter(event => event.eventType === eventType).length;
  const deliveredEvents = statsEvents.filter(
    event => event.eventType === "delivered"
  );
  const confirmedDelivered = deliveredEvents.length;
  const distinctDelivered = new Set(
    deliveredEvents
      .map(event => event.prospectId)
      .filter((prospectId): prospectId is number => prospectId !== null)
  ).size;
  const smtpAccepted = messages.filter(message =>
    Boolean(message.smtpAcceptedAt)
  ).length;

  return {
    campaign,
    prospects: workspaceProspects,
    messages,
    events: recentEvents,
    recentEvents,
    stats: {
      qualifiedOrganizations: workspaceProspects.filter(
        prospect => prospect.qualified === 1
      ).length,
      namedContacts,
      emailReady,
      verificationNeeded: workspaceProspects.filter(
        prospect => prospect.status === "verification_needed"
      ).length,
      sent: smtpAccepted,
      smtpAccepted,
      distinctDelivered,
      confirmedDelivered,
      replies: eventCount("reply") + eventCount("positive_reply"),
      positiveReplies: eventCount("positive_reply"),
      meetings: eventCount("meeting"),
      completedConsultations: eventCount("consultation_complete"),
      qualifiedOpportunities: eventCount("qualified_opportunity"),
    },
  };
}

export async function updateCreditUnionCampaign(input: {
  dailyNewLimit?: number;
  sendHourLocal?: number;
  timezone?: string;
  physicalPostalAddress?: string;
  notes?: string | null;
}) {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const updates = {
    dailyNewLimit: input.dailyNewLimit,
    sendHourLocal: input.sendHourLocal,
    timezone: input.timezone,
    physicalPostalAddress: input.physicalPostalAddress,
    notes: input.notes,
  };
  await db
    .update(creditUnionCampaigns)
    .set(updates)
    .where(eq(creditUnionCampaigns.id, campaign.id));
  return (
    await db
      .select()
      .from(creditUnionCampaigns)
      .where(eq(creditUnionCampaigns.id, campaign.id))
      .limit(1)
  )[0];
}

async function cancelRemainingCreditUnionMessages(
  db: Database,
  prospectId: number,
  reason: string
) {
  await db
    .update(creditUnionMessages)
    .set({
      status: "cancelled",
      error: reason,
      scheduledAt: null,
      plannedAt: null,
    })
    .where(
      and(
        eq(creditUnionMessages.prospectId, prospectId),
        inArray(creditUnionMessages.status, [
          ...CREDIT_UNION_UNSENT_CANCELLATION_STATUSES,
        ])
      )
    );
}

async function addSharedSuppression(
  db: Database,
  input: {
    email: string | null;
    reason: "unsubscribed" | "replied" | "bounced";
    notes?: string | null;
  }
) {
  if (!input.email) return;
  await db
    .insert(chamberOutreachSuppressions)
    .values({
      email: input.email,
      reason: input.reason,
      source: "texas_credit_union_outreach",
      notes: input.notes || null,
    })
    .onDuplicateKeyUpdate({
      set: {
        reason: input.reason,
        source: "texas_credit_union_outreach",
        notes: input.notes || null,
      },
    });
}

async function applyTerminalOutcome(
  db: Database,
  prospect: CreditUnionProspect,
  input: {
    status: CreditUnionProspectStatus;
    eventType: string;
    detail?: string | null;
    messageId?: number | null;
    occurredAt?: Date;
  }
) {
  const occurredAt = input.occurredAt || new Date();
  const suppressReason =
    input.status === "unsubscribed"
      ? "unsubscribed"
      : input.status === "bounced"
        ? "bounced"
        : "replied";
  if (["replied", "unsubscribed", "bounced"].includes(input.status)) {
    await addSharedSuppression(db, {
      email: prospect.normalizedEmail,
      reason: suppressReason,
      notes: input.detail,
    });
  }
  await cancelRemainingCreditUnionMessages(
    db,
    prospect.id,
    `Cancelled after ${input.eventType}.`
  );
  await db
    .update(creditUnionProspects)
    .set({
      status: input.status,
      outreachStatus: "cancelled",
      repliedAt: input.status === "replied" ? occurredAt : prospect.repliedAt,
      unsubscribedAt:
        input.status === "unsubscribed" ? occurredAt : prospect.unsubscribedAt,
    })
    .where(eq(creditUnionProspects.id, prospect.id));
  await db.insert(creditUnionEvents).values({
    campaignId: prospect.campaignId,
    prospectId: prospect.id,
    messageId: input.messageId || null,
    eventType: input.eventType,
    detail: input.detail || null,
    occurredAt,
  });
}

export async function updateCreditUnionProspect(input: {
  id: number;
  status?: CreditUnionProspectStatus;
  manualNotes?: string | null;
  primaryContactName?: string | null;
  primaryContactTitle?: string | null;
  primaryEmail?: string | null;
  emailConfidence?: CreditUnionEmailConfidence;
  primaryEmailSourceUrl?: string | null;
  primaryRoleSourceUrl?: string | null;
}) {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const [prospect] = await db
    .select()
    .from(creditUnionProspects)
    .where(
      and(
        eq(creditUnionProspects.id, input.id),
        eq(creditUnionProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Credit Union prospect not found");

  const nextEmail =
    input.primaryEmail === undefined
      ? prospect.primaryEmail
      : normalizeCreditUnionEmail(input.primaryEmail);
  const nextConfidence =
    input.emailConfidence ||
    (prospect.emailConfidence as CreditUnionEmailConfidence);
  const nextSource =
    input.primaryEmailSourceUrl === undefined
      ? prospect.primaryEmailSourceUrl
      : nullable(input.primaryEmailSourceUrl, 500);
  const nextName =
    input.primaryContactName === undefined
      ? prospect.primaryContactName
      : nullable(input.primaryContactName, 180);
  const nextTitle =
    input.primaryContactTitle === undefined
      ? prospect.primaryContactTitle
      : nullable(input.primaryContactTitle, 220);
  const nextRoleSource =
    input.primaryRoleSourceUrl === undefined
      ? prospect.primaryRoleSourceUrl
      : nullable(input.primaryRoleSourceUrl, 500);
  const contactChanged =
    nextEmail !== prospect.primaryEmail ||
    nextName !== prospect.primaryContactName ||
    nextTitle !== prospect.primaryContactTitle ||
    nextConfidence !== prospect.emailConfidence ||
    nextSource !== prospect.primaryEmailSourceUrl ||
    nextRoleSource !== prospect.primaryRoleSourceUrl;
  if (
    contactChanged &&
    !canEditCreditUnionContact({
      firstSentAt: prospect.firstSentAt,
      outreachStatus: prospect.outreachStatus,
    })
  ) {
    throw new Error(
      "Contact details cannot change on an approved or started sequence. Notes and response tracking remain editable; review a new sequence for a different recipient."
    );
  }
  if (
    nextEmail &&
    !isCreditUnionTargetingReady({
      name: nextName,
      title: nextTitle,
      email: nextEmail,
      emailConfidence: nextConfidence,
      emailSourceUrl: nextSource,
      roleSourceUrl: nextRoleSource,
    })
  ) {
    throw new Error(
      "Primary targeting email requires a sourced marketing-relevant individual or an officially published marketing/communications department with a truthful team greeting and valid role/email sources; retain unverified addresses in contact research instead."
    );
  }

  const identityCopy: CreditUnionProspect = {
    ...prospect,
    primaryEmail: nextEmail,
    normalizedEmail: nextEmail,
  };
  if (await hasCreditUnionIdentityDuplicate(db, identityCopy)) {
    throw new Error(
      "This email, domain, or organization duplicates another Credit Union prospect."
    );
  }
  const chamberBlock = await getChamberConflict(db, nextEmail);
  const updates = {
    manualNotes: input.manualNotes,
    primaryContactName:
      input.primaryContactName === undefined ? undefined : nextName,
    primaryContactTitle:
      input.primaryContactTitle === undefined ? undefined : nextTitle,
    primaryEmail: input.primaryEmail === undefined ? undefined : nextEmail,
    normalizedEmail: input.primaryEmail === undefined ? undefined : nextEmail,
    emailConfidence: input.emailConfidence,
    primaryEmailSourceUrl:
      input.primaryEmailSourceUrl === undefined ? undefined : nextSource,
    primaryRoleSourceUrl:
      input.primaryRoleSourceUrl === undefined ? undefined : nextRoleSource,
    crossCampaignBlock: chamberBlock,
  };
  await db
    .update(creditUnionProspects)
    .set(updates)
    .where(eq(creditUnionProspects.id, prospect.id));

  const [current] = await db
    .select()
    .from(creditUnionProspects)
    .where(eq(creditUnionProspects.id, prospect.id))
    .limit(1);
  if (!current) throw new Error("Credit Union prospect could not be reloaded");

  if (input.status && responseStatuses.has(input.status)) {
    await applyTerminalOutcome(db, current, {
      status: input.status,
      eventType:
        input.status === "replied"
          ? "reply"
          : input.status === "unsubscribed"
            ? "unsubscribed"
            : input.status === "bounced"
              ? "bounced"
              : input.status,
      detail: input.manualNotes,
    });
  } else if (input.status) {
    await db
      .update(creditUnionProspects)
      .set({ status: input.status })
      .where(eq(creditUnionProspects.id, prospect.id));
  } else {
    const currentMessages = await getProspectMessages(db, current.id);
    if (!hasProgress(current, currentMessages)) {
      const currentResearch = safeJson<ResearchRecord>(current.researchJson, {
        researchedOn: null,
        fallbackContactUrl: null,
        socialChannels: null,
        observedOpportunities: null,
        verifiedPersonalizedOpening: null,
        shortVerifiedTopic: null,
        specificContentIdea: null,
        specificRepurposingIdea: null,
        specificSmallStart: null,
        personalizationNotes: null,
        claimsToAvoid: null,
        limitations: null,
        shortlistRank: null,
        shortlistReason: null,
      });
      const createdDrafts = await upsertDrafts(
        db,
        campaign,
        current,
        currentResearch
      );
      const targetingReady = isCreditUnionTargetingReady({
        name: current.primaryContactName,
        title: current.primaryContactTitle,
        email: current.primaryEmail,
        emailConfidence: current.emailConfidence as CreditUnionEmailConfidence,
        emailSourceUrl: current.primaryEmailSourceUrl,
        roleSourceUrl: current.primaryRoleSourceUrl,
      });
      await db
        .update(creditUnionProspects)
        .set({
          status: targetingReady ? "review" : "verification_needed",
          outreachStatus:
            createdDrafts && targetingReady && !current.crossCampaignBlock
              ? "draft"
              : "blocked",
        })
        .where(eq(creditUnionProspects.id, current.id));
    }
  }
  return true;
}

export async function approveCreditUnionSequence(prospectId: number) {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const [prospect] = await db
    .select()
    .from(creditUnionProspects)
    .where(
      and(
        eq(creditUnionProspects.id, prospectId),
        eq(creditUnionProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Credit Union prospect not found");
  const messages = await getProspectMessages(db, prospect.id);
  if (
    prospect.firstSentAt ||
    messages.some(message =>
      ["scheduled", "sent", "failed", "cancelled"].includes(message.status)
    )
  ) {
    throw new Error(
      "A claimed, sent, failed, or cancelled sequence cannot be reapproved automatically. Review delivery history first."
    );
  }
  const readiness = await draftReadiness(db, prospect, messages);
  if (!readiness.ready) {
    throw new Error(
      `Sequence cannot be approved: ${readiness.reasons.join(" ")}`
    );
  }

  await db
    .update(creditUnionMessages)
    .set({ status: "approved" })
    .where(
      and(
        eq(creditUnionMessages.prospectId, prospect.id),
        eq(creditUnionMessages.status, "draft")
      )
    );
  await db
    .update(creditUnionProspects)
    .set({ status: "approved", outreachStatus: "approved" })
    .where(eq(creditUnionProspects.id, prospect.id));
  await db.insert(creditUnionEvents).values({
    campaignId: campaign.id,
    prospectId: prospect.id,
    eventType: "sequence_approved",
    detail:
      "Three draft messages approved for review only; no list/config approval, activation, schedule, or send was performed.",
  });
  return { success: true, campaignStatus: campaign.status } as const;
}

export async function recordCreditUnionEvent(input: {
  prospectId: number;
  messageId?: number | null;
  eventType: CreditUnionObservedOutcomeEvent;
  detail?: string | null;
  occurredAt?: Date;
}) {
  const db = await requireDb();
  const campaign = await ensureCreditUnionCampaign();
  const [prospect] = await db
    .select()
    .from(creditUnionProspects)
    .where(
      and(
        eq(creditUnionProspects.id, input.prospectId),
        eq(creditUnionProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Credit Union prospect not found");

  if (cancellationEventTypes.has(input.eventType)) {
    const status: CreditUnionProspectStatus =
      input.eventType === "unsubscribed"
        ? "unsubscribed"
        : input.eventType === "bounced"
          ? "bounced"
          : input.eventType === "reply" || input.eventType === "positive_reply"
            ? "replied"
            : input.eventType === "meeting"
              ? "meeting"
              : input.eventType === "consultation_complete"
                ? "consultation_complete"
                : input.eventType === "qualified_opportunity"
                  ? "qualified_opportunity"
                  : "not_fit";
    await applyTerminalOutcome(db, prospect, {
      status,
      eventType: input.eventType,
      detail: input.detail,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
    });
    return { success: true } as const;
  }

  throw new Error("Only known observed outcome events may be recorded.");
}

export async function unsubscribeCreditUnionByToken(token: string) {
  const db = await requireDb();
  const [prospect] = await db
    .select()
    .from(creditUnionProspects)
    .where(eq(creditUnionProspects.unsubscribeToken, token))
    .limit(1);
  if (!prospect) return false;
  await applyTerminalOutcome(db, prospect, {
    status: "unsubscribed",
    eventType: "unsubscribed",
    detail:
      "Suppressed through the explicit Credit Union unsubscribe confirmation.",
  });
  return true;
}

/**
 * This module deliberately has no transport, sender, cron, activation, or
 * scheduling mutation. Future launch code must re-check sendReadiness at the
 * point of delivery and use the pure shared Day 1/4/9 planning helper.
 */
export const CREDIT_UNION_RUNTIME_SEND_DISABLED = true;
