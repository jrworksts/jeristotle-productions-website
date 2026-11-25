import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  brandVideoCampaigns,
  brandVideoEvents,
  brandVideoMessages,
  brandVideoProspects,
  chamberOutreachMessages,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  creditUnionMessages,
  creditUnionProspects,
  type BrandVideoMessage,
  type BrandVideoProspect,
} from "../drizzle/schema";
import {
  BRAND_VIDEO_CAMPAIGN_SLUG,
  BRAND_VIDEO_DRAFT_VERSION,
  BRAND_VIDEO_TIME_ZONE,
  buildBrandVideoSequence,
  hasPublishedBrandVideoEmail,
  isBrandVideoHttpUrl,
  normalizeBrandVideoBusiness,
  normalizeBrandVideoDomain,
  normalizeBrandVideoEmail,
  type BrandVideoResearchImport,
  type BrandVideoResearchProspect,
  type BrandVideoSource,
} from "../shared/brandVideoOutreach";
import { OUTREACH_DAILY_NEW_CONTACT_LIMIT } from "../shared/outreachMaintenance";
import { getDb } from "./db";
import { getTrainingCampaignIdentityConflict } from "./trainingCrossCampaignGuard";

const DEFAULT_ADDRESS = "319 N Mesquite St, Corpus Christi, TX 78401";
const SEQUENCE_CONFIG = JSON.stringify({
  dayOffsets: [0, 4, 9],
  rollWeekends: false,
  maxActiveContactsPerOrganization: 1,
});

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type BrandVideoImportResult = {
  campaignId: number;
  imported: number;
  updated: number;
  skippedNotQualified: number;
  skippedMissingEvidence: number;
  crossCampaignBlocked: number;
};

function clean(value: unknown, max = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullable(value: unknown, max = 8_000) {
  return clean(value, max) || null;
}

function boundedScore(value: unknown) {
  const candidate = Number(value);
  return Number.isFinite(candidate)
    ? Math.max(0, Math.min(100, Math.trunc(candidate)))
    : 0;
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sourcesFromResearch(
  prospect: BrandVideoResearchProspect
): BrandVideoSource[] {
  const unique = new Map<string, BrandVideoSource>();
  const add = (url: string | null | undefined, supports: string) => {
    const source = clean(url, 500);
    if (!isBrandVideoHttpUrl(source) || unique.has(source)) return;
    unique.set(source, { url: source, supports: clean(supports, 1_000) });
  };
  for (const url of prospect.sourceUrls || [])
    add(url, "Public research source");
  add(prospect.website, "Official business website");
  add(prospect.businessEmailSourceUrl, "Published business email");
  add(prospect.contactSourceUrl, "Named local contact or role");
  return Array.from(unique.values());
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function ensureBrandVideoCampaign() {
  const db = await requireDb();
  await db
    .insert(brandVideoCampaigns)
    .values({
      slug: BRAND_VIDEO_CAMPAIGN_SLUG,
      name: "Corpus Christi professional brand video outreach — 2026",
      status: "review",
      dailyNewLimit: OUTREACH_DAILY_NEW_CONTACT_LIMIT,
      sendHourLocal: 9,
      timezone: BRAND_VIDEO_TIME_ZONE,
      senderName: "Jeremy Wells",
      senderEmail: "jeremy@jeristotleproductions.com",
      physicalPostalAddress: DEFAULT_ADDRESS,
      sequenceConfig: SEQUENCE_CONFIG,
      notes:
        "Review-only launch. Prepare 25 sourced local business prospects and three personalized drafts each. No sending, schedule, list approval, or activation is authorized.",
    })
    .onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });
  const [campaign] = await db
    .select()
    .from(brandVideoCampaigns)
    .where(eq(brandVideoCampaigns.slug, BRAND_VIDEO_CAMPAIGN_SLUG))
    .limit(1);
  if (!campaign)
    throw new Error("Brand Video campaign could not be initialized");
  return campaign;
}

async function getChamberConflict(db: Database, email: string) {
  const [suppression, active, sent] = await Promise.all([
    db
      .select({ reason: chamberOutreachSuppressions.reason })
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
  if (suppression[0]) return `Shared suppression: ${suppression[0].reason}.`;
  if (active[0])
    return "Matching email is active or approved in Chamber outreach.";
  if (sent[0]) return "Matching email was already sent in Chamber outreach.";
  return null;
}

async function getCreditUnionConflict(db: Database, email: string) {
  const [active, sent] = await Promise.all([
    db
      .select({ id: creditUnionProspects.id })
      .from(creditUnionProspects)
      .where(
        and(
          eq(creditUnionProspects.normalizedEmail, email),
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
          eq(creditUnionProspects.normalizedEmail, email),
          eq(creditUnionMessages.status, "sent")
        )
      )
      .limit(1),
  ]);
  if (active[0]) return "Matching email is active in credit-union outreach.";
  if (sent[0])
    return "Matching email was already sent in credit-union outreach.";
  return null;
}

async function getIdentityConflict(
  db: Database,
  identity: { business: string; domain: string | null; email: string }
) {
  const direct = await Promise.all([
    getChamberConflict(db, identity.email),
    getCreditUnionConflict(db, identity.email),
    getTrainingCampaignIdentityConflict(db, {
      businessName: identity.business,
      domain: identity.domain,
      email: identity.email,
    }),
  ]);
  const directConflict = direct.find(Boolean);
  if (directConflict) return directConflict;

  const [chamberProspects, creditUnionRows] = await Promise.all([
    db
      .select({
        businessName: chamberOutreachProspects.businessName,
        website: chamberOutreachProspects.website,
      })
      .from(chamberOutreachProspects),
    db
      .select({
        businessName: creditUnionProspects.creditUnionName,
        domain: creditUnionProspects.normalizedDomain,
      })
      .from(creditUnionProspects),
  ]);
  const chamberMatch = chamberProspects.find(
    item =>
      normalizeBrandVideoBusiness(item.businessName) === identity.business ||
      Boolean(
        identity.domain &&
          normalizeBrandVideoDomain(item.website) === identity.domain
      )
  );
  if (chamberMatch)
    return "Matching business or domain is already present in Chamber outreach.";
  const creditUnionMatch = creditUnionRows.find(
    item =>
      normalizeBrandVideoBusiness(item.businessName) === identity.business ||
      Boolean(identity.domain && item.domain === identity.domain)
  );
  if (creditUnionMatch)
    return "Matching business or domain is already present in credit-union outreach.";
  return null;
}

/** Read-only live collision check; retained blocks are never automatically bypassed. */
export async function getBrandVideoCrossCampaignConflict(
  prospect: BrandVideoProspect
) {
  if (prospect.crossCampaignBlock) return prospect.crossCampaignBlock;
  const db = await requireDb();
  const email = normalizeBrandVideoEmail(prospect.primaryEmail);
  if (!email || email !== prospect.normalizedEmail)
    return "Recipient email identity is invalid.";
  return getIdentityConflict(db, {
    business: prospect.normalizedBusiness,
    domain: prospect.normalizedDomain,
    email,
  });
}

async function getMessages(db: Database, prospectId: number) {
  return db
    .select()
    .from(brandVideoMessages)
    .where(eq(brandVideoMessages.prospectId, prospectId))
    .orderBy(asc(brandVideoMessages.sequenceStep));
}

function hasProgress(
  prospect: BrandVideoProspect,
  messages: BrandVideoMessage[]
) {
  return Boolean(
    prospect.firstSentAt ||
      prospect.lastSentAt ||
      ["approved", "scheduled", "in_sequence", "complete"].includes(
        prospect.outreachStatus
      ) ||
      messages.some(message => message.status !== "draft")
  );
}

async function upsertDrafts(
  db: Database,
  campaignId: number,
  prospect: BrandVideoProspect,
  source: BrandVideoResearchProspect,
  messageStatus: "draft" | "approved" = "draft"
) {
  const existing = await getMessages(db, prospect.id);
  if (existing.some(message => message.status !== "draft")) return false;
  const drafts = buildBrandVideoSequence({
    businessName: prospect.businessName,
    contactName: prospect.primaryContactName,
    observation: prospect.verifiedObservation,
    videoAngle: prospect.videoAngle,
    videoScenes: prospect.videoScenes,
    subjectVariant: source.subjectVariant,
  });
  for (const draft of drafts) {
    await db
      .insert(brandVideoMessages)
      .values({
        campaignId,
        prospectId: prospect.id,
        sequenceStep: draft.sequenceStep,
        status: messageStatus,
        subject: draft.subject,
        alternativeSubject: draft.alternativeSubject,
        htmlBody: draft.html,
        textBody: draft.text,
        dayOffset: draft.dayOffset,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: messageStatus,
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
 * Imports source-backed research. When the user has enabled automatic approval,
 * only complete, conflict-free imports become send-eligible; this function never
 * sends email or bypasses the point-of-send verification.
 */
export async function importBrandVideoProspects(
  input: BrandVideoResearchImport
): Promise<BrandVideoImportResult> {
  if (!Array.isArray(input.prospects))
    throw new Error("Import requires a prospects array");
  const db = await requireDb();
  const campaign = await ensureBrandVideoCampaign();
  const result: BrandVideoImportResult = {
    campaignId: campaign.id,
    imported: 0,
    updated: 0,
    skippedNotQualified: 0,
    skippedMissingEvidence: 0,
    crossCampaignBlocked: 0,
  };

  for (const source of input.prospects) {
    if (source.qualificationStatus !== "qualified") {
      result.skippedNotQualified += 1;
      continue;
    }
    const businessName = clean(source.businessName, 220);
    const industry = clean(source.industry, 180);
    const website = clean(source.website, 500);
    const email = normalizeBrandVideoEmail(source.businessEmail);
    const normalizedBusiness = normalizeBrandVideoBusiness(businessName);
    const normalizedDomain = normalizeBrandVideoDomain(website);
    if (
      !businessName ||
      !industry ||
      !website ||
      !email ||
      !normalizedBusiness ||
      !hasPublishedBrandVideoEmail({
        email,
        sourceUrl: source.businessEmailSourceUrl,
      }) ||
      !clean(source.localAuthorityEvidence) ||
      !clean(source.verifiedObservation) ||
      !clean(source.videoAngle) ||
      !clean(source.videoScenes)
    ) {
      result.skippedMissingEvidence += 1;
      continue;
    }

    const crossCampaignBlock = await getIdentityConflict(db, {
      business: normalizedBusiness,
      domain: normalizedDomain,
      email,
    });
    if (crossCampaignBlock) result.crossCampaignBlocked += 1;
    const autoApprove =
      campaign.autoApproveQualifiedProspects === 1 && !crossCampaignBlock;
    const sources = sourcesFromResearch(source);
    const contacts = [
      {
        name: nullable(source.contactName, 180),
        title: nullable(source.contactTitle, 220),
        businessEmail: email,
        emailSourceUrl: clean(source.businessEmailSourceUrl, 500),
        roleSourceUrl: nullable(source.contactSourceUrl, 500),
        notes:
          "Publicly sourced for professional brand-video outreach; send eligibility requires every automated safeguard.",
      },
    ];
    const research = {
      researchedOn: clean(input.researchedOn, 80),
      localAuthorityEvidence: clean(source.localAuthorityEvidence, 4_000),
      verifiedObservation: clean(source.verifiedObservation, 4_000),
      videoAngle: clean(source.videoAngle, 4_000),
      videoScenes: clean(source.videoScenes, 4_000),
      subjectVariant: source.subjectVariant,
      qualificationStatus: source.qualificationStatus,
      exclusionReason: nullable(source.exclusionReason, 4_000),
    };
    const [existing] = await db
      .select()
      .from(brandVideoProspects)
      .where(
        and(
          eq(brandVideoProspects.campaignId, campaign.id),
          or(
            eq(brandVideoProspects.normalizedBusiness, normalizedBusiness),
            eq(brandVideoProspects.normalizedEmail, email),
            ...(normalizedDomain
              ? [eq(brandVideoProspects.normalizedDomain, normalizedDomain)]
              : [])
          )
        )
      )
      .limit(1);
    const values = {
      businessName,
      normalizedBusiness,
      industry,
      website,
      normalizedDomain,
      localAuthorityEvidence: research.localAuthorityEvidence,
      qualified: 1,
      fitScore: boundedScore(source.fitScore),
      fitReason: clean(source.fitReason, 4_000),
      verifiedObservation: research.verifiedObservation,
      videoAngle: research.videoAngle,
      videoScenes: research.videoScenes,
      contactsJson: JSON.stringify(contacts),
      researchJson: JSON.stringify(research),
      sourcesJson: JSON.stringify(sources),
      primaryContactName: nullable(source.contactName, 180),
      primaryContactTitle: nullable(source.contactTitle, 220),
      primaryEmail: email,
      normalizedEmail: email,
      primaryEmailSourceUrl: clean(source.businessEmailSourceUrl, 500),
      primaryRoleSourceUrl: nullable(source.contactSourceUrl, 500),
      crossCampaignBlock,
      draftVersion: BRAND_VIDEO_DRAFT_VERSION,
    };
    let prospect: BrandVideoProspect;
    if (!existing) {
      const inserted = await db.insert(brandVideoProspects).values({
        campaignId: campaign.id,
        ...values,
        status: autoApprove ? "approved" : "review",
        outreachStatus: autoApprove ? "approved" : "draft",
        unsubscribeToken: randomBytes(24).toString("hex"),
      });
      const [created] = await db
        .select()
        .from(brandVideoProspects)
        .where(eq(brandVideoProspects.id, Number(inserted[0].insertId)))
        .limit(1);
      if (!created) throw new Error("Imported prospect could not be reloaded");
      prospect = created;
      result.imported += 1;
      await db.insert(brandVideoEvents).values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        eventType: autoApprove ? "sequence_auto_approved" : "imported",
        detail: autoApprove
          ? "Automatically approved after satisfying the user-authorized public-source, local-fit, current-draft, and no-conflict checks."
          : "Imported from public-source Corpus Christi brand-video research.",
        metadataJson: JSON.stringify({ researchedOn: research.researchedOn }),
      });
    } else {
      const messages = await getMessages(db, existing.id);
      if (hasProgress(existing, messages)) {
        await db
          .update(brandVideoProspects)
          .set({
            contactsJson: values.contactsJson,
            researchJson: values.researchJson,
            sourcesJson: values.sourcesJson,
            fitScore: values.fitScore,
            fitReason: values.fitReason,
            crossCampaignBlock,
          })
          .where(eq(brandVideoProspects.id, existing.id));
      } else {
        await db
          .update(brandVideoProspects)
          .set({
            ...values,
            status: autoApprove ? "approved" : "review",
            outreachStatus: autoApprove ? "approved" : "draft",
          })
          .where(eq(brandVideoProspects.id, existing.id));
      }
      const [updated] = await db
        .select()
        .from(brandVideoProspects)
        .where(eq(brandVideoProspects.id, existing.id))
        .limit(1);
      if (!updated) throw new Error("Updated prospect could not be reloaded");
      prospect = updated;
      result.updated += 1;
    }
    if (
      !(await getMessages(db, prospect.id)).some(
        message => message.status !== "draft"
      )
    ) {
      await upsertDrafts(
        db,
        campaign.id,
        prospect,
        source,
        autoApprove ? "approved" : "draft"
      );
    }
  }
  return result;
}

export async function getBrandVideoWorkspace() {
  const db = await requireDb();
  const campaign = await ensureBrandVideoCampaign();
  const [prospects, messages, events] = await Promise.all([
    db
      .select()
      .from(brandVideoProspects)
      .where(eq(brandVideoProspects.campaignId, campaign.id))
      .orderBy(desc(brandVideoProspects.fitScore), asc(brandVideoProspects.id)),
    db
      .select()
      .from(brandVideoMessages)
      .where(eq(brandVideoMessages.campaignId, campaign.id))
      .orderBy(
        asc(brandVideoMessages.prospectId),
        asc(brandVideoMessages.sequenceStep)
      ),
    db
      .select()
      .from(brandVideoEvents)
      .where(eq(brandVideoEvents.campaignId, campaign.id))
      .orderBy(desc(brandVideoEvents.occurredAt), desc(brandVideoEvents.id))
      .limit(100),
  ]);
  const latestSent = messages.filter(message => message.smtpAcceptedAt).length;
  const stats = {
    qualified: prospects.filter(prospect => prospect.qualified === 1).length,
    reviewReady: prospects.filter(
      prospect => prospect.status === "review" && !prospect.crossCampaignBlock
    ).length,
    approved: prospects.filter(prospect => prospect.status === "approved")
      .length,
    crossCampaignBlocked: prospects.filter(
      prospect => prospect.crossCampaignBlock
    ).length,
    drafts: messages.filter(message => message.status === "draft").length,
    smtpAccepted: latestSent,
    replies: prospects.filter(prospect => prospect.status === "replied").length,
  };
  return {
    campaign,
    prospects: prospects.map(prospect => ({
      ...prospect,
      contacts: safeJson(prospect.contactsJson, [] as unknown[]),
      research: safeJson(prospect.researchJson, {} as Record<string, unknown>),
      sources: safeJson(prospect.sourcesJson, [] as BrandVideoSource[]),
    })),
    messages,
    events,
    stats,
  };
}

export async function updateBrandVideoProspect(input: {
  id: number;
  status?: "review" | "approved" | "not_fit";
  manualNotes?: string | null;
}) {
  const db = await requireDb();
  const campaign = await ensureBrandVideoCampaign();
  const [prospect] = await db
    .select()
    .from(brandVideoProspects)
    .where(
      and(
        eq(brandVideoProspects.id, input.id),
        eq(brandVideoProspects.campaignId, campaign.id)
      )
    )
    .limit(1);
  if (!prospect) throw new Error("Brand Video prospect was not found");
  const messages = await getMessages(db, prospect.id);
  if (input.status === "approved") {
    if (
      prospect.status !== "review" ||
      prospect.firstSentAt ||
      prospect.lastSentAt
    )
      throw new Error("Only unsent review prospects can be approved.");
    if (prospect.crossCampaignBlock)
      throw new Error(
        "Resolve the cross-campaign conflict before approving this prospect."
      );
    if (
      messages.length !== 3 ||
      messages.some(message => message.status !== "draft")
    )
      throw new Error(
        "Exactly three unsent draft messages are required for approval."
      );
    const { hasBrandVideoSourceBackedTarget, hasValidBrandVideoSequence } =
      await import("./brandVideoSendingDb");
    if (
      !hasBrandVideoSourceBackedTarget(prospect) ||
      !hasValidBrandVideoSequence(messages, "draft") ||
      prospect.draftVersion !== BRAND_VIDEO_DRAFT_VERSION
    )
      throw new Error(
        "Current qualified, source-backed email and draft evidence is required."
      );
    const conflict = await getBrandVideoCrossCampaignConflict(prospect);
    if (conflict) throw new Error(conflict);
    await db.transaction(async tx => {
      const [approved] = await tx
        .update(brandVideoProspects)
        .set({
          status: "approved",
          outreachStatus: "approved",
          manualNotes: input.manualNotes,
        })
        .where(
          and(
            eq(brandVideoProspects.id, prospect.id),
            eq(brandVideoProspects.campaignId, campaign.id),
            eq(brandVideoProspects.status, "review"),
            eq(brandVideoProspects.outreachStatus, "draft"),
            eq(brandVideoProspects.updatedAt, prospect.updatedAt),
            eq(brandVideoProspects.primaryEmail, prospect.primaryEmail),
            eq(brandVideoProspects.sourcesJson, prospect.sourcesJson),
            eq(brandVideoProspects.qualified, 1),
            eq(brandVideoProspects.draftVersion, BRAND_VIDEO_DRAFT_VERSION),
            sql`${brandVideoProspects.firstSentAt} IS NULL`,
            sql`${brandVideoProspects.crossCampaignBlock} IS NULL`
          )
        );
      if (Number(approved.affectedRows) !== 1)
        throw new Error(
          "Prospect changed during approval; nothing was approved."
        );
      for (const message of messages) {
        const [updated] = await tx
          .update(brandVideoMessages)
          .set({ status: "approved" })
          .where(
            and(
              eq(brandVideoMessages.id, message.id),
              eq(brandVideoMessages.campaignId, campaign.id),
              eq(brandVideoMessages.status, "draft"),
              eq(brandVideoMessages.updatedAt, message.updatedAt),
              eq(brandVideoMessages.subject, message.subject),
              eq(brandVideoMessages.textBody, message.textBody),
              eq(brandVideoMessages.htmlBody, message.htmlBody),
              sql`${brandVideoMessages.sendAttemptedAt} IS NULL`,
              sql`${brandVideoMessages.smtpAcceptedAt} IS NULL`
            )
          );
        if (Number(updated.affectedRows) !== 1)
          throw new Error(
            "Draft changed during approval; nothing was approved."
          );
      }
      await tx.insert(brandVideoEvents).values({
        campaignId: campaign.id,
        prospectId: prospect.id,
        eventType: "sequence_approved",
        detail: "Explicitly approved the sourced Brand Video sequence.",
      });
    });
  } else {
    if (
      input.status === "review" &&
      (prospect.status !== "review" ||
        messages.some(message => message.status !== "draft"))
    )
      throw new Error(
        "Approved, attempted, or terminal prospects cannot be reset to review."
      );
    if (input.status === "not_fit") {
      await db.transaction(async tx => {
        // Lock/stop the prospect first; never leave a concurrent send able to revive it.
        await tx
          .update(brandVideoProspects)
          .set({
            status: "not_fit",
            outreachStatus: "cancelled",
            manualNotes: input.manualNotes,
          })
          .where(
            and(
              eq(brandVideoProspects.id, prospect.id),
              eq(brandVideoProspects.campaignId, campaign.id)
            )
          );
        await tx
          .update(brandVideoMessages)
          .set({
            status: "cancelled",
            plannedAt: null,
            scheduledAt: null,
            sendClaimToken: null,
            sendClaimedAt: null,
            error: "Cancelled after not-fit outcome.",
          })
          .where(
            and(
              eq(brandVideoMessages.prospectId, prospect.id),
              eq(brandVideoMessages.campaignId, campaign.id),
              inArray(brandVideoMessages.status, [
                "draft",
                "approved",
                "scheduled",
                "failed",
              ])
            )
          );
      });
      return { success: true } as const;
    }
    await db
      .update(brandVideoProspects)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.manualNotes !== undefined
          ? { manualNotes: input.manualNotes }
          : {}),
      })
      .where(eq(brandVideoProspects.id, prospect.id));
  }
  return { success: true } as const;
}
