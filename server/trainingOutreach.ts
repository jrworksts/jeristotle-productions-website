import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  brandVideoMessages,
  brandVideoProspects,
  chamberOutreachMessages,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  creditUnionMessages,
  creditUnionProspects,
  trainingOutreachCampaigns,
  trainingOutreachEvents,
  trainingOutreachMessages,
  trainingOutreachProspects,
  type TrainingOutreachMessage,
  type TrainingOutreachProspect,
} from "../drizzle/schema";
import {
  TRAINING_DRAFT_TARGET,
  TRAINING_CAMPAIGN_DEFAULTS,
  TRAINING_OUTREACH_CAMPAIGN_SLUG,
  TRAINING_OUTREACH_DRAFT_VERSION,
  TRAINING_OUTREACH_TIME_ZONE,
  TRAINING_RESEARCH_TARGET,
  buildTrainingSequence,
  canTrainingImportRefreshDisposition,
  hasSourceBackedTrainingEmail,
  isTrainingTerminalStatus,
  normalizeTrainingBusiness,
  normalizeTrainingDomain,
  normalizeTrainingEmail,
  parseTrainingResearchImport,
  type TrainingFact,
  type TrainingProspectStatus,
  type TrainingResearchImport,
  type TrainingResearchProspect,
  type TrainingSource,
} from "../shared/trainingOutreach";
import { getDb } from "./db";
import { getHustleReservedRows, hustleReservedMatch } from "./hustleCrossCampaignGuard";
import { getSectorReservedRows, sectorReservedMatch } from "./sectorCrossCampaignGuard";
const DEFAULT_ADDRESS = "319 N Mesquite St, Corpus Christi, TX 78401";
const SEQUENCE_CONFIG = JSON.stringify({
  initialDueAfterBusinessDays: 0,
  followupOneDueAfterAcceptedBusinessDays: 4,
  followupTwoDueAfterAcceptedBusinessDays: 5,
  weekdaysOnly: true,
  actualAcceptedSendRequired: true,
  noReplyRestart: true,
});

const ACTIVE_OUTREACH_STATUSES = ["approved", "scheduled", "in_sequence"];
const TERMINAL_OUTREACH_STATUSES = [
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "not_fit",
  "complete",
];

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type TrainingIdentity = {
  business: string;
  domain: string | null;
  email: string | null;
};

type JsonRecord = Record<string, unknown>;

export type TrainingImportResult = {
  campaignId: number;
  imported: number;
  updated: number;
  drafted: number;
  crossCampaignBlocked: number;
};

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function uniqueSources(sources: TrainingSource[]) {
  const seen = new Set<string>();
  return sources.filter(source => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

function identityMatches(
  identity: TrainingIdentity,
  candidate: { business: string; domain: string | null; email: string | null }
) {
  return Boolean(
    (identity.business && candidate.business === identity.business) ||
      (identity.domain && candidate.domain === identity.domain) ||
      (identity.email && candidate.email === identity.email)
  );
}

function sourceBackedResearch(prospect: TrainingOutreachProspect) {
  const facts = safeJson<TrainingFact[]>(prospect.factsJson, []);
  const signals = safeJson<TrainingFact[]>(prospect.operationalSignalsJson, []);
  const sources = safeJson<TrainingSource[]>(prospect.sourcesJson, []);
  return Boolean(facts.length || signals.length || sources.length);
}

function asIdentity(source: TrainingResearchProspect): TrainingIdentity {
  return {
    business: normalizeTrainingBusiness(source.businessName),
    domain: normalizeTrainingDomain(source.website),
    email: normalizeTrainingEmail(source.businessEmail),
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

async function findTrainingCampaign(db: Database) {
  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG))
    .limit(1);
  return campaign;
}

export function assertTrainingDraftOnlyPhase(
  campaign: Pick<
    typeof trainingOutreachCampaigns.$inferSelect,
    | "status"
    | "launchApprovedAt"
    | "listApprovedAt"
    | "schedulerTaskUid"
    | "autoEnroll"
  >
) {
  if (
    campaign.status !== "paused" ||
    campaign.launchApprovedAt ||
    campaign.listApprovedAt ||
    campaign.schedulerTaskUid ||
    campaign.autoEnroll !== 0
  ) {
    throw new Error(
      "Training import requires the paused research-only phase with no approvals, volume, enrollment or scheduler."
    );
  }
}

/** Creates a paused baseline only. It never updates or activates an existing campaign. */
export async function ensureTrainingCampaign() {
  const db = await requireDb();
  const existing = await findTrainingCampaign(db);
  if (existing) return existing;
  await db
    .insert(trainingOutreachCampaigns)
    .values({
      slug: TRAINING_OUTREACH_CAMPAIGN_SLUG,
      name: "Internal Training & Knowledge Capture — 2026",
      status: TRAINING_CAMPAIGN_DEFAULTS.status,
      launchApprovedAt: TRAINING_CAMPAIGN_DEFAULTS.launchApprovedAt,
      listApprovedAt: TRAINING_CAMPAIGN_DEFAULTS.listApprovedAt,
      dailyNewLimit: TRAINING_CAMPAIGN_DEFAULTS.dailyNewLimit,
      sendHourLocal: 9,
      timezone: TRAINING_OUTREACH_TIME_ZONE,
      schedulerTaskUid: TRAINING_CAMPAIGN_DEFAULTS.schedulerTaskUid,
      researchTaskUid: TRAINING_CAMPAIGN_DEFAULTS.researchTaskUid,
      autoApproveQualifiedProspects:
        TRAINING_CAMPAIGN_DEFAULTS.autoApproveQualifiedProspects ? 1 : 0,
      autoEnroll: TRAINING_CAMPAIGN_DEFAULTS.autoEnroll ? 1 : 0,
      senderName: "Jeremy Wells",
      senderEmail: "jeremy@jeristotleproductions.com",
      physicalPostalAddress: DEFAULT_ADDRESS,
      sequenceConfig: SEQUENCE_CONFIG,
      runtimeVersion: null,
      notes:
        "Paused by default. Research imports and reserve preparation never create or enable a scheduler; sending requires a separately approved deployed runtime and persisted scheduler task UID.",
    })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG))
    .limit(1);
  if (!campaign) throw new Error("Training campaign could not be initialized");
  return campaign;
}

/**
 * Reads, but never writes, other campaign tables. Import and workspace callers
 * reuse one snapshot, so collision matching does not scale database reads by
 * the number of Training prospects.
 */
export async function loadTrainingCrossCampaignSnapshot(db: Database) {
  const [
    chamberSuppressions,
    chamberProspects,
    chamberSent,
    creditUnionRows,
    creditUnionSent,
    brandVideoRows,
    brandVideoSent,
  ] = await Promise.all([
    db
      .select({
        email: chamberOutreachSuppressions.email,
        reason: chamberOutreachSuppressions.reason,
      })
      .from(chamberOutreachSuppressions),
    db
      .select({
        businessName: chamberOutreachProspects.businessName,
        website: chamberOutreachProspects.website,
        email: chamberOutreachProspects.email,
        status: chamberOutreachProspects.status,
      })
      .from(chamberOutreachProspects),
    db
      .select({
        businessName: chamberOutreachProspects.businessName,
        website: chamberOutreachProspects.website,
        email: chamberOutreachProspects.email,
      })
      .from(chamberOutreachMessages)
      .innerJoin(
        chamberOutreachProspects,
        eq(chamberOutreachMessages.prospectId, chamberOutreachProspects.id)
      )
      .where(eq(chamberOutreachMessages.status, "sent")),
    db
      .select({
        businessName: creditUnionProspects.creditUnionName,
        normalizedBusiness: creditUnionProspects.normalizedOrganization,
        normalizedDomain: creditUnionProspects.normalizedDomain,
        normalizedEmail: creditUnionProspects.normalizedEmail,
        outreachStatus: creditUnionProspects.outreachStatus,
        status: creditUnionProspects.status,
      })
      .from(creditUnionProspects),
    db
      .select({
        businessName: creditUnionProspects.creditUnionName,
        normalizedBusiness: creditUnionProspects.normalizedOrganization,
        normalizedDomain: creditUnionProspects.normalizedDomain,
        normalizedEmail: creditUnionProspects.normalizedEmail,
      })
      .from(creditUnionMessages)
      .innerJoin(
        creditUnionProspects,
        eq(creditUnionMessages.prospectId, creditUnionProspects.id)
      )
      .where(eq(creditUnionMessages.status, "sent")),
    db
      .select({
        businessName: brandVideoProspects.businessName,
        normalizedBusiness: brandVideoProspects.normalizedBusiness,
        normalizedDomain: brandVideoProspects.normalizedDomain,
        normalizedEmail: brandVideoProspects.normalizedEmail,
        outreachStatus: brandVideoProspects.outreachStatus,
        status: brandVideoProspects.status,
      })
      .from(brandVideoProspects),
    db
      .select({
        businessName: brandVideoProspects.businessName,
        normalizedBusiness: brandVideoProspects.normalizedBusiness,
        normalizedDomain: brandVideoProspects.normalizedDomain,
        normalizedEmail: brandVideoProspects.normalizedEmail,
      })
      .from(brandVideoMessages)
      .innerJoin(
        brandVideoProspects,
        eq(brandVideoMessages.prospectId, brandVideoProspects.id)
      )
      .where(eq(brandVideoMessages.status, "sent")),
  ]);

  const hustleRows = await getHustleReservedRows(db);
  const sectorRows = await getSectorReservedRows(db);
  return {
    chamberSuppressions,
    chamberProspects,
    chamberSent,
    creditUnionRows,
    creditUnionSent,
    brandVideoRows,
    brandVideoSent,
    ...(hustleRows.length ? { hustleRows } : {}),
    ...(sectorRows.length ? { sectorRows } : {}),
  };
}

type TrainingCrossCampaignSnapshot = Awaited<
  ReturnType<typeof loadTrainingCrossCampaignSnapshot>
>;

/**
 * A collision is a local block only. This matcher never writes or changes the
 * source campaign's state.
 */
export function getTrainingCrossCampaignConflictFromSnapshot(
  snapshot: TrainingCrossCampaignSnapshot,
  identity: TrainingIdentity
) {
  const {
    chamberSuppressions,
    chamberProspects,
    chamberSent,
    creditUnionRows,
    creditUnionSent,
    brandVideoRows,
    brandVideoSent,
  } = snapshot;

  if (snapshot.hustleRows && hustleReservedMatch(snapshot.hustleRows, { businessName: identity.business, domain: identity.domain, email: identity.email })) {
    return "Matching company identity is reserved in Corpus Christi Hustle sponsorship outreach.";
  }
  if (snapshot.sectorRows && sectorReservedMatch(snapshot.sectorRows, { businessName: identity.business, domain: identity.domain, email: identity.email })) {
    return "Matching company identity is reserved in the four sector outreach campaigns.";
  }
  const chamberSuppression = chamberSuppressions.find(
    suppression =>
      identity.email &&
      normalizeTrainingEmail(suppression.email) === identity.email
  );
  if (chamberSuppression) {
    return `Shared Chamber suppression: ${chamberSuppression.reason}.`;
  }

  const chamberActive = chamberProspects.find(
    row =>
      identityMatches(identity, {
        business: normalizeTrainingBusiness(row.businessName),
        domain: normalizeTrainingDomain(row.website),
        email: normalizeTrainingEmail(row.email),
      }) && ACTIVE_OUTREACH_STATUSES.includes(row.status)
  );
  if (chamberActive) {
    return "Matching company identity is active or approved in Chamber outreach.";
  }
  const chamberTerminal = chamberProspects.find(
    row =>
      identityMatches(identity, {
        business: normalizeTrainingBusiness(row.businessName),
        domain: normalizeTrainingDomain(row.website),
        email: normalizeTrainingEmail(row.email),
      }) && TERMINAL_OUTREACH_STATUSES.includes(row.status)
  );
  if (chamberTerminal) {
    return "Matching company identity is suppressed or terminal in Chamber outreach.";
  }
  const chamberWasSent = chamberSent.find(row =>
    identityMatches(identity, {
      business: normalizeTrainingBusiness(row.businessName),
      domain: normalizeTrainingDomain(row.website),
      email: normalizeTrainingEmail(row.email),
    })
  );
  if (chamberWasSent) {
    return "Matching company identity was already sent in Chamber outreach.";
  }

  const creditUnionActive = creditUnionRows.find(
    row =>
      identityMatches(identity, {
        business:
          row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
        domain: row.normalizedDomain,
        email: row.normalizedEmail,
      }) && ACTIVE_OUTREACH_STATUSES.includes(row.outreachStatus)
  );
  if (creditUnionActive) {
    return "Matching company identity is active in credit-union outreach.";
  }
  const creditUnionTerminal = creditUnionRows.find(
    row =>
      identityMatches(identity, {
        business:
          row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
        domain: row.normalizedDomain,
        email: row.normalizedEmail,
      }) && TERMINAL_OUTREACH_STATUSES.includes(row.status)
  );
  if (creditUnionTerminal) {
    return "Matching company identity is suppressed or terminal in credit-union outreach.";
  }
  const creditUnionWasSent = creditUnionSent.find(row =>
    identityMatches(identity, {
      business:
        row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
      domain: row.normalizedDomain,
      email: row.normalizedEmail,
    })
  );
  if (creditUnionWasSent) {
    return "Matching company identity was already sent in credit-union outreach.";
  }

  const brandVideoActive = brandVideoRows.find(
    row =>
      identityMatches(identity, {
        business:
          row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
        domain: row.normalizedDomain,
        email: row.normalizedEmail,
      }) && ACTIVE_OUTREACH_STATUSES.includes(row.outreachStatus)
  );
  if (brandVideoActive) {
    return "Matching company identity is active in Brand Video outreach.";
  }
  const brandVideoTerminal = brandVideoRows.find(
    row =>
      identityMatches(identity, {
        business:
          row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
        domain: row.normalizedDomain,
        email: row.normalizedEmail,
      }) && TERMINAL_OUTREACH_STATUSES.includes(row.status)
  );
  if (brandVideoTerminal) {
    return "Matching company identity is suppressed or terminal in Brand Video outreach.";
  }
  const brandVideoWasSent = brandVideoSent.find(row =>
    identityMatches(identity, {
      business:
        row.normalizedBusiness || normalizeTrainingBusiness(row.businessName),
      domain: row.normalizedDomain,
      email: row.normalizedEmail,
    })
  );
  if (brandVideoWasSent) {
    return "Matching company identity was already sent in Brand Video outreach.";
  }

  return null;
}

/** Compatibility helper for callers that need a one-off collision check. */
export async function getTrainingCrossCampaignConflict(
  db: Database,
  identity: TrainingIdentity
) {
  return getTrainingCrossCampaignConflictFromSnapshot(
    await loadTrainingCrossCampaignSnapshot(db),
    identity
  );
}

async function findExistingTrainingProspects(
  db: Database,
  campaignId: number,
  identity: TrainingIdentity
) {
  const matches = [
    eq(trainingOutreachProspects.normalizedBusiness, identity.business),
  ];
  if (identity.domain) {
    matches.push(
      eq(trainingOutreachProspects.normalizedDomain, identity.domain)
    );
  }
  if (identity.email) {
    matches.push(eq(trainingOutreachProspects.normalizedEmail, identity.email));
  }
  return db
    .select()
    .from(trainingOutreachProspects)
    .where(
      and(eq(trainingOutreachProspects.campaignId, campaignId), or(...matches))
    )
    .orderBy(asc(trainingOutreachProspects.id));
}

async function getTrainingMessages(db: Database, prospectId: number) {
  return db
    .select()
    .from(trainingOutreachMessages)
    .where(eq(trainingOutreachMessages.prospectId, prospectId))
    .orderBy(asc(trainingOutreachMessages.sequenceStep));
}

function sourceValues(
  research: TrainingResearchImport,
  source: TrainingResearchProspect,
  crossCampaignBlock: string | null
) {
  const normalizedEmail = normalizeTrainingEmail(source.businessEmail);
  const emailSourced = hasSourceBackedTrainingEmail({
    email: normalizedEmail,
    sourceUrl: source.businessEmailSourceUrl,
  });
  return {
    businessName: source.businessName,
    normalizedBusiness: normalizeTrainingBusiness(source.businessName),
    website: source.website,
    normalizedDomain: normalizeTrainingDomain(source.website),
    location: source.location,
    industry: source.industry,
    priorityRank: source.priorityRank,
    fitScore: boundedScore(source.fitScore),
    fitReason: source.fitReason,
    qualificationStatus: source.qualificationStatus,
    verifiedObservation: source.verifiedObservation,
    useCase: source.useCase,
    pilotScope: source.pilotScope,
    primaryContactName: source.contactName,
    primaryContactTitle: source.contactTitle,
    contactSourceUrl: source.contactSourceUrl,
    primaryEmail: emailSourced ? normalizedEmail : null,
    normalizedEmail: emailSourced ? normalizedEmail : null,
    primaryEmailSourceUrl: emailSourced ? source.businessEmailSourceUrl : null,
    emailRecipientType: source.emailRecipientType,
    primaryPhone: source.businessPhone,
    phoneSourceUrl: source.phoneSourceUrl,
    sizeIndicator: source.sizeIndicator,
    sizeSourceUrl: source.sizeSourceUrl,
    localAuthorityEvidence: source.localAuthorityEvidence,
    uncertaintiesJson: JSON.stringify(source.uncertainties),
    factsJson: JSON.stringify(source.facts),
    operationalSignalsJson: JSON.stringify(source.operationalSignals),
    sourcesJson: JSON.stringify(uniqueSources(source.sources)),
    contactReadiness: crossCampaignBlock
      ? ("blocked" as const)
      : emailSourced
        ? ("verified" as const)
        : ("unverified" as const),
    crossCampaignBlock,
    selectedForDraft: source.selectedForDraft ? 1 : 0,
    researchedOn: research.researchedOn,
    draftVersion: TRAINING_OUTREACH_DRAFT_VERSION,
  };
}

function hasSourceBackedImportTarget(
  source: TrainingResearchProspect,
  values: ReturnType<typeof sourceValues>
) {
  return Boolean(
    source.qualificationStatus === "qualified" &&
      values.contactReadiness === "verified" &&
      !values.crossCampaignBlock &&
      source.verifiedObservation?.trim() &&
      source.useCase?.trim() &&
      source.pilotScope?.trim() &&
      (source.facts.length ||
        source.operationalSignals.length ||
        source.sources.length)
  );
}

function mayAutoApproveTrainingProspect(
  campaign: typeof trainingOutreachCampaigns.$inferSelect,
  source: TrainingResearchProspect,
  values: ReturnType<typeof sourceValues>
) {
  return (
    campaign.autoApproveQualifiedProspects === 1 &&
    hasSourceBackedImportTarget(source, values)
  );
}

function hasActualTrainingSendEvidence(
  prospect: TrainingOutreachProspect,
  messages: TrainingOutreachMessage[]
) {
  return Boolean(
    prospect.firstSentAt ||
      prospect.lastSentAt ||
      messages.some(
        message =>
          message.sendAttemptedAt ||
          message.smtpAcceptedAt ||
          message.sentAt ||
          message.providerMessageId
      )
  );
}

type TrainingReimportValues = ReturnType<typeof sourceValues>;

/**
 * Builds the only fields a research refresh may write. Status and manual notes
 * are deliberately absent, so excluded/terminal dispositions and reviewer
 * notes survive every import. A previously blocked record also stays blocked.
 */
export function preserveTrainingReimportValues(
  values: TrainingReimportValues,
  existing: Pick<
    TrainingOutreachProspect,
    "status" | "selectedForDraft" | "contactReadiness" | "emailRecipientType"
  >
) {
  const preserveDisposition = !canTrainingImportRefreshDisposition(
    existing.status
  );
  return {
    ...values,
    // Imports default to unknown; do not overwrite a deliberate classification
    // merely because a research refresh omitted it.
    emailRecipientType:
      values.emailRecipientType === "unknown"
        ? existing.emailRecipientType
        : values.emailRecipientType,
    ...(existing.contactReadiness === "blocked"
      ? { contactReadiness: "blocked" as const }
      : {}),
    ...(preserveDisposition
      ? { selectedForDraft: existing.selectedForDraft }
      : {}),
  };
}

async function ensureTrainingDrafts(
  db: Database,
  campaignId: number,
  prospect: TrainingOutreachProspect,
  options: { approved: boolean }
) {
  if (
    prospect.qualificationStatus !== "qualified" ||
    Boolean(prospect.crossCampaignBlock) ||
    prospect.contactReadiness === "blocked" ||
    isTrainingTerminalStatus(prospect.status)
  ) {
    return 0;
  }
  if (
    !prospect.verifiedObservation ||
    !prospect.useCase ||
    !prospect.pilotScope
  ) {
    return 0;
  }
  if (
    !options.approved &&
    (prospect.selectedForDraft !== 1 ||
      prospect.priorityRank > TRAINING_DRAFT_TARGET)
  )
    return 0;

  const existing = await getTrainingMessages(db, prospect.id);
  const existingByStep = new Map(
    existing.map(message => [message.sequenceStep, message])
  );
  const drafts = buildTrainingSequence({
    businessName: prospect.businessName,
    contactName: prospect.primaryContactName,
    recipientIsNamed: prospect.emailRecipientType === "named",
    verifiedObservation: prospect.verifiedObservation,
    useCase: prospect.useCase,
    pilotScope: prospect.pilotScope,
  });
  const hasCompleteUntouchedDraftSequence =
    existing.length === drafts.length &&
    drafts.every(draft => {
      const existingDraft = existingByStep.get(draft.sequenceStep);
      return Boolean(
        existingDraft &&
          existingDraft.status === "draft" &&
          existingDraft.dueAfterBusinessDays === draft.dueAfterBusinessDays &&
          !existingDraft.plannedAt &&
          !existingDraft.scheduledAt &&
          !existingDraft.sentAt &&
          !existingDraft.smtpAcceptedAt &&
          !existingDraft.providerMessageId &&
          !existingDraft.sendClaimToken &&
          !existingDraft.sendClaimedAt &&
          !existingDraft.sendAttemptedAt
      );
    });
  let created = 0;
  for (const draft of drafts) {
    const existingDraft = existingByStep.get(draft.sequenceStep);
    if (existingDraft) {
      if (
        !["draft", "approved"].includes(existingDraft.status) ||
        existingDraft.plannedAt ||
        existingDraft.sentAt ||
        existingDraft.providerMessageId ||
        existingDraft.sendAttemptedAt
      )
        continue;
      // Re-imported research can improve the source-backed observation or
      // concise use-case fragment. Current auto-approved prospects may also
      // safely promote an untouched existing draft. Never mask or modify any
      // persisted plan/send/provider transport fields.
      await db
        .update(trainingOutreachMessages)
        .set({
          subject: draft.subject,
          textBody: draft.text,
          htmlBody: draft.html,
          dueAfterBusinessDays: draft.dueAfterBusinessDays,
          ...(options.approved && hasCompleteUntouchedDraftSequence
            ? { status: "approved" as const }
            : {}),
        })
        .where(
          and(
            eq(trainingOutreachMessages.id, existingDraft.id),
            eq(trainingOutreachMessages.campaignId, campaignId),
            eq(trainingOutreachMessages.prospectId, prospect.id),
            eq(trainingOutreachMessages.status, existingDraft.status),
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
      continue;
    }
    await db.insert(trainingOutreachMessages).values({
      campaignId,
      prospectId: prospect.id,
      sequenceStep: draft.sequenceStep,
      status: options.approved && existing.length === 0 ? "approved" : "draft",
      subject: draft.subject,
      textBody: draft.text,
      htmlBody: draft.html,
      dueAfterBusinessDays: draft.dueAfterBusinessDays,
      plannedAt: null,
      scheduledAt: null,
      sentAt: null,
      smtpAcceptedAt: null,
      providerMessageId: null,
      sendClaimToken: null,
      sendClaimedAt: null,
      sendAttemptedAt: null,
      error: null,
    });
    created += 1;
  }
  return created;
}

/**
 * Bounded integration-facing import. It never activates a campaign or creates a
 * scheduler. When the persisted auto-approval flag is on, every qualifying
 * source-backed record is prepared rather than only the original top ten.
 */
export async function importTrainingProspects(
  importData: unknown
): Promise<TrainingImportResult> {
  const input = parseTrainingResearchImport(importData);
  const db = await requireDb();
  const campaign = await ensureTrainingCampaign();
  const crossCampaignSnapshot = await loadTrainingCrossCampaignSnapshot(db);
  const result: TrainingImportResult = {
    campaignId: campaign.id,
    imported: 0,
    updated: 0,
    drafted: 0,
    crossCampaignBlocked: 0,
  };

  for (const source of input.prospects) {
    const identity = asIdentity(source);
    const liveCrossCampaignBlock = getTrainingCrossCampaignConflictFromSnapshot(
      crossCampaignSnapshot,
      identity
    );
    if (liveCrossCampaignBlock) result.crossCampaignBlocked += 1;

    const matches = await findExistingTrainingProspects(
      db,
      campaign.id,
      identity
    );
    if (matches.length > 1) {
      throw new Error(
        `Training import has an ambiguous existing identity for ${source.businessName}; no duplicate was created.`
      );
    }
    const existing = matches[0];
    const crossCampaignBlock =
      liveCrossCampaignBlock || existing?.crossCampaignBlock || null;
    const values = sourceValues(input, source, crossCampaignBlock);
    const autoApprove = mayAutoApproveTrainingProspect(
      campaign,
      source,
      values
    );

    let prospect: TrainingOutreachProspect;
    if (!existing) {
      const inserted = await db.insert(trainingOutreachProspects).values({
        campaignId: campaign.id,
        ...values,
        status: autoApprove ? "approved" : "review",
        outreachStatus: autoApprove ? "approved" : "draft",
        unsubscribeToken: randomBytes(24).toString("hex"),
        manualNotes: null,
      });
      const [created] = await db
        .select()
        .from(trainingOutreachProspects)
        .where(eq(trainingOutreachProspects.id, Number(inserted[0].insertId)))
        .limit(1);
      if (!created) throw new Error("Training prospect could not be reloaded");
      prospect = created;
      result.imported += 1;
      await db.insert(trainingOutreachEvents).values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        eventType: "imported",
        detail: autoApprove
          ? "Imported with existing campaign auto-approval. No schedule, callback, or send was created."
          : "Imported for research and review. No approval, schedule, callback, or send was created.",
        metadataJson: JSON.stringify({
          researchedOn: input.researchedOn,
          recommendFirst: source.recommendFirst,
          selectedForDraft: source.selectedForDraft,
        }),
      });
    } else {
      const existingMessages = await getTrainingMessages(db, existing.id);
      // Once SMTP was attempted or accepted, neither sources nor copy are
      // refreshed. This keeps a durable, auditable record of actual outreach.
      if (!hasActualTrainingSendEvidence(existing, existingMessages)) {
        const updates = preserveTrainingReimportValues(values, existing);
        await db
          .update(trainingOutreachProspects)
          .set({
            ...updates,
            ...(autoApprove && existing.status === "review"
              ? {
                  status: "approved" as const,
                  outreachStatus: "approved" as const,
                }
              : {}),
          })
          .where(eq(trainingOutreachProspects.id, existing.id));
      }
      const [updated] = await db
        .select()
        .from(trainingOutreachProspects)
        .where(eq(trainingOutreachProspects.id, existing.id))
        .limit(1);
      if (!updated) throw new Error("Training prospect could not be reloaded");
      prospect = updated;
      result.updated += 1;
    }

    result.drafted += await ensureTrainingDrafts(db, campaign.id, prospect, {
      approved:
        prospect.status === "approved" &&
        prospect.outreachStatus === "approved",
    });
  }
  return result;
}

function workspaceProspect(
  prospect: TrainingOutreachProspect,
  liveCrossCampaignBlock: string | null
) {
  const crossCampaignBlock =
    liveCrossCampaignBlock || prospect.crossCampaignBlock || null;
  const emailVerified = hasSourceBackedTrainingEmail({
    email: prospect.primaryEmail,
    sourceUrl: prospect.primaryEmailSourceUrl,
  });
  return {
    id: prospect.id,
    businessName: prospect.businessName,
    website: prospect.website,
    location: prospect.location,
    industry: prospect.industry,
    priorityRank: prospect.priorityRank,
    fitScore: prospect.fitScore,
    fitReason: prospect.fitReason,
    qualificationStatus: prospect.qualificationStatus,
    verifiedObservation: prospect.verifiedObservation,
    useCase: prospect.useCase,
    pilotScope: prospect.pilotScope,
    primaryContactName: prospect.primaryContactName,
    primaryContactTitle: prospect.primaryContactTitle,
    contactSourceUrl: prospect.contactSourceUrl,
    primaryEmail: emailVerified ? prospect.primaryEmail : null,
    primaryEmailSourceUrl: emailVerified
      ? prospect.primaryEmailSourceUrl
      : null,
    emailRecipientType: prospect.emailRecipientType,
    primaryPhone: prospect.primaryPhone,
    phoneSourceUrl: prospect.phoneSourceUrl,
    sizeIndicator: prospect.sizeIndicator,
    sizeSourceUrl: prospect.sizeSourceUrl,
    localAuthorityEvidence: prospect.localAuthorityEvidence,
    uncertainties: safeJson<string[]>(prospect.uncertaintiesJson, []),
    facts: safeJson<TrainingFact[]>(prospect.factsJson, []),
    operationalSignals: safeJson<TrainingFact[]>(
      prospect.operationalSignalsJson,
      []
    ),
    sources: safeJson<TrainingSource[]>(prospect.sourcesJson, []),
    manualNotes: prospect.manualNotes,
    status: prospect.status,
    outreachStatus: prospect.outreachStatus,
    leadOutcome: prospect.leadOutcome,
    notClosedReason: prospect.notClosedReason,
    firstSentAt: prospect.firstSentAt,
    lastSentAt: prospect.lastSentAt,
    repliedAt: prospect.repliedAt,
    unsubscribedAt: prospect.unsubscribedAt,
    contactReadiness: prospect.contactReadiness,
    crossCampaignBlock,
    selectedForDraft: prospect.selectedForDraft === 1,
    researchedOn: prospect.researchedOn,
  };
}

function workspaceMessage(message: TrainingOutreachMessage) {
  return {
    id: message.id,
    prospectId: message.prospectId,
    sequenceStep: message.sequenceStep as 0 | 1 | 2,
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
    status: message.status,
    dueAfterBusinessDays: message.dueAfterBusinessDays as 0 | 4 | 5,
    plannedAt: message.plannedAt,
    sentAt: message.sentAt,
    providerMessageId: message.providerMessageId,
    scheduledAt: message.scheduledAt,
    smtpAcceptedAt: message.smtpAcceptedAt,
    deliveredAt: message.deliveredAt,
    sendAttemptedAt: message.sendAttemptedAt,
    error: message.error,
  };
}

/** Reporting only: distinct persisted message receipts, not event names or delivery claims. */
export function countTrainingSmtpAcceptedReceipts(
  messages: ReadonlyArray<Pick<TrainingOutreachMessage, "id" | "smtpAcceptedAt">>
) {
  return new Set(
    messages.filter(message => message.smtpAcceptedAt != null).map(message => message.id)
  ).size;
}

export async function getTrainingWorkspace() {
  const db = await requireDb();
  const campaign = await findTrainingCampaign(db);
  if (!campaign)
    throw new Error("The training research campaign has not been initialized.");
  const [prospects, messages, events, crossCampaignSnapshot] =
    await Promise.all([
      db
        .select()
        .from(trainingOutreachProspects)
        .where(eq(trainingOutreachProspects.campaignId, campaign.id))
        .orderBy(
          asc(trainingOutreachProspects.priorityRank),
          desc(trainingOutreachProspects.fitScore),
          asc(trainingOutreachProspects.id)
        ),
      db
        .select()
        .from(trainingOutreachMessages)
        .where(eq(trainingOutreachMessages.campaignId, campaign.id))
        .orderBy(
          asc(trainingOutreachMessages.prospectId),
          asc(trainingOutreachMessages.sequenceStep)
        ),
      db
        .select({ eventType: trainingOutreachEvents.eventType })
        .from(trainingOutreachEvents)
        .where(eq(trainingOutreachEvents.campaignId, campaign.id)),
      loadTrainingCrossCampaignSnapshot(db),
    ]);

  const workspaceProspects = prospects.map(prospect =>
    workspaceProspect(
      prospect,
      getTrainingCrossCampaignConflictFromSnapshot(crossCampaignSnapshot, {
        business: prospect.normalizedBusiness,
        domain: prospect.normalizedDomain,
        email: prospect.normalizedEmail,
      })
    )
  );
  const workspaceMessages = messages.map(workspaceMessage);
  const qualifiedSourceBacked = prospects.filter(
    prospect =>
      prospect.qualificationStatus === "qualified" &&
      sourceBackedResearch(prospect) &&
      !isTrainingTerminalStatus(prospect.status)
  );
  const selectedSourceBacked = qualifiedSourceBacked.filter(
    prospect => prospect.selectedForDraft === 1 && prospect.priorityRank <= 10
  );
  const countEvents = (eventType: string) =>
    events.filter(event => event.eventType === eventType).length;
  const smtpAccepted = countTrainingSmtpAcceptedReceipts(messages);

  const recommendedProspects = workspaceProspects
    .filter(
      prospect =>
        prospect.selectedForDraft &&
        prospect.status === "review" &&
        prospect.qualificationStatus === "qualified" &&
        prospect.contactReadiness === "verified" &&
        !prospect.crossCampaignBlock
    )
    .sort(
      (left, right) =>
        left.priorityRank - right.priorityRank ||
        right.fitScore - left.fitScore ||
        left.id - right.id
    )
    .slice(0, 3);

  const { researchWebhookUrl: privateResearchUrl, ...safeCampaign } = campaign;
  return {
    campaign: safeCampaign,
    prospects: workspaceProspects,
    messages: workspaceMessages,
    /** Read-only prioritization for review, never a send-ready or enrollment claim. */
    recommendedProspects,
    stats: {
      researched: prospects.length,
      qualified: prospects.filter(
        prospect => prospect.qualificationStatus === "qualified"
      ).length,
      needsReview: prospects.filter(
        prospect =>
          prospect.qualificationStatus !== "qualified" ||
          !hasSourceBackedTrainingEmail({
            email: prospect.primaryEmail,
            sourceUrl: prospect.primaryEmailSourceUrl,
          })
      ).length,
      selectedForDraft: selectedSourceBacked.length,
      drafts: workspaceMessages.length,
      verifiedEmail: workspaceProspects.filter(
        prospect => prospect.contactReadiness === "verified"
      ).length,
      contactBlocked: workspaceProspects.filter(
        prospect => prospect.contactReadiness !== "verified"
      ).length,
      crossCampaignBlocked: workspaceProspects.filter(prospect =>
        Boolean(prospect.crossCampaignBlock)
      ).length,
      smtpAccepted,
      replies: countEvents("reply"),
      meetings: countEvents("meeting"),
      researchTarget: TRAINING_RESEARCH_TARGET,
    },
    policy: {
      phase: campaign.launchApprovedAt ? "live_capable" : "draft_only",
      sendingAuthorized: Boolean(
        campaign.launchApprovedAt && campaign.listApprovedAt
      ),
      clientApproval:
        "The client supplies and approves the instruction; Jeristotle does not make engineering, safety, compliance, or outcome claims.",
      pilot:
        "One client-approved workflow, an SME interview or demo, scoped short training modules, and a supporting checklist. Materials stay in private access or the client’s existing system; no custom LMS is included.",
      commercial:
        "Drafts may describe a small paid project without a price. They do not promise free production.",
      followupTiming:
        "If a future phase is explicitly authorized, follow-up one is due 4 business days after the initial actual accepted send; follow-up two is due 5 business days after the first actual accepted send.",
      replyHandling:
        "Any reply, including an out-of-office reply, is a manual review disposition and stops future messages. No return-date restart automation exists.",
      optOut:
        "Any future sender must retain a clear opt-out mechanism. This phase creates no sender or public training materials.",
    },
    replenishment: {
      researchTarget: TRAINING_RESEARCH_TARGET,
      draftTarget: TRAINING_DRAFT_TARGET,
      researched: prospects.length,
      researchBacklog: Math.max(0, TRAINING_RESEARCH_TARGET - prospects.length),
      sourceBackedQualifiedBacklog: qualifiedSourceBacked.filter(
        prospect => prospect.selectedForDraft !== 1
      ).length,
      selectedSourceBacked: selectedSourceBacked.length,
      draftsPreparedForSelected: selectedSourceBacked.filter(
        prospect =>
          workspaceMessages.filter(
            message => message.prospectId === prospect.id
          ).length === 3
      ).length,
      draftBacklog: Math.max(
        0,
        TRAINING_DRAFT_TARGET - selectedSourceBacked.length
      ),
      discoveryConfigured: Boolean(privateResearchUrl),
      cliImport: {
        enabled: true,
        guard:
          "Use parseTrainingResearchImport before calling importTrainingProspects. It accepts at most 25 unique, source-backed public research records and at most 10 selected top-ranked draft candidates.",
      },
      claim:
        "Counts reflect the currently imported source-backed backlog only; no reserve check or recurring discovery process promises a perpetually full pipeline.",
    },
  };
}

/** Records a manual disposition or notes only; there is no approval or restart path. */
export async function updateTrainingProspect(input: {
  id: number;
  manualNotes?: string | null;
  status?: TrainingProspectStatus;
}) {
  const db = await requireDb();
  const campaign = await ensureTrainingCampaign();
  const [prospect] = await db
    .select()
    .from(trainingOutreachProspects)
    .where(
      and(
        eq(trainingOutreachProspects.id, input.id),
        eq(trainingOutreachProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Training prospect was not found");

  if (input.status === "review" && isTrainingTerminalStatus(prospect.status)) {
    throw new Error(
      "Terminal or excluded prospects cannot be restored to review by this draft-only pipeline."
    );
  }

  const updates: {
    status?: TrainingProspectStatus;
    manualNotes?: string | null;
  } = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.manualNotes !== undefined) updates.manualNotes = input.manualNotes;
  if (Object.keys(updates).length) {
    await db
      .update(trainingOutreachProspects)
      .set(updates)
      .where(eq(trainingOutreachProspects.id, prospect.id));
  }

  if (input.status && input.status !== prospect.status) {
    const eventType =
      input.status === "replied"
        ? "reply"
        : input.status === "meeting"
          ? "meeting"
          : `disposition_${input.status}`;
    await db.insert(trainingOutreachEvents).values({
      campaignId: campaign.id,
      prospectId: prospect.id,
      eventType,
      detail:
        "Manual disposition recorded. No email was sent, no plan was created, and no restart automation exists.",
      metadataJson: JSON.stringify({
        disposition: input.status,
        stopsFutureMessages: true,
        automatedRestart: false,
      } as JsonRecord),
    });
  }
  return { success: true } as const;
}
