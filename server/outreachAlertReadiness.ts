import { and, eq, getTableColumns, sql } from "drizzle-orm";
import * as s from "../drizzle/schema";
import { getDb } from "./db";
import type { OutreachCampaignKey } from "../shared/outreachAlerts";
import {
  BRAND_VIDEO_DRAFT_VERSION,
  hasPublishedBrandVideoEmail,
  isBrandVideoHttpUrl,
  normalizeBrandVideoEmail,
} from "../shared/brandVideoOutreach";
import {
  CREDIT_UNION_DRAFT_VERSION,
  isCreditUnionTargetingReady,
} from "../shared/creditUnionOutreach";
import {
  TRAINING_OUTREACH_DRAFT_VERSION,
  hasSourceBackedTrainingEmail,
  isPublicTrainingHttpUrl,
  normalizeTrainingEmail,
  trainingIdentityAliases,
} from "../shared/trainingOutreach";
import {
  hustleResearchSchema,
  isHustleContactQualified,
  hustleRequiresExactMessageReview,
  isHustleCanonicalMessage,
  organizationKey,
} from "../shared/hustleOutreach";
import {
  readSectorEvidence,
  sectorQualificationReason,
  sectorConflictReason,
  buildSectorSequence,
} from "../shared/sectorResearch";
import { SECTOR_COPY_VERSION } from "../shared/sectorOutreach";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Row = Record<string, any>;
type Identity = {
  id: number;
  origin: string;
  businessName: string;
  website: string | null;
  email: string | null;
};
export type AlertExclusions = {
  records: Identity[];
  suppressions: { email: string }[];
};
const MAX_ROWS = 5000;
async function bounded(query: any): Promise<Row[]> {
  const rows = await query.limit(MAX_ROWS + 1);
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    throw new Error("OUTREACH_READINESS_UNKNOWN");
  return rows;
}

/** Only identity columns are read. No initialization, locks, research, inbox or SMTP calls. */
export async function readOutreachAlertExclusions(
  db: Db
): Promise<AlertExclusions> {
  const defs = [
    ["chamber", s.chamberOutreachProspects, "businessName", "email"],
    ["credit_union", s.creditUnionProspects, "creditUnionName", "primaryEmail"],
    ["brand_video", s.brandVideoProspects, "businessName", "primaryEmail"],
    ["training", s.trainingOutreachProspects, "businessName", "primaryEmail"],
    ["hustle", s.hustleProspects, "name", "email"],
    ["sectors", s.sectorOutreachProspects, "company", "email"],
    ["relationships", s.chamberProspects, "name", "email"],
  ] as const;
  const lists = await Promise.all(
    defs.map(async ([origin, table, name, email]) => {
      const t: any = table;
      const rows = await bounded(
        db
          .select({
            id: t.id,
            businessName: t[name],
            website: t.website,
            email: t[email],
          })
          .from(t)
      );
      return rows.map(r => ({ ...r, origin })) as Identity[];
    })
  );
  const suppressions = await bounded(
    db
      .select({ email: s.chamberOutreachSuppressions.email })
      .from(s.chamberOutreachSuppressions)
  );
  return {
    records: lists.flat(),
    suppressions: suppressions as { email: string }[],
  };
}
function sourcesContain(p: Row) {
  try {
    const sources = JSON.parse(p.sourcesJson);
    return (
      Array.isArray(sources) &&
      sources.some((source: any) => source?.url === p.primaryEmailSourceUrl)
    );
  } catch {
    return false;
  }
}
function noAttempt(m: Row) {
  return (
    !m.claimed &&
    !m.attempted &&
    !m.smtpAcceptedAt &&
    !m.sentAt &&
    !m.hasError &&
    !m.replyAt &&
    !m.optoutAt &&
    !m.bouncedAt &&
    !m.deliveredAt
  );
}
function freshInitial(m: Row, now: Date) {
  return (
    m.status === "approved" &&
    noAttempt(m) &&
    (!m.scheduledAt || m.scheduledAt <= now) &&
    Boolean(m.subject?.trim() && m.textBody?.trim())
  );
}
function crossBlocked(key: string, p: Row, ex: AlertExclusions) {
  const email = p.email ?? p.primaryEmail;
  if (ex.suppressions.some(r => r.email.toLowerCase() === email?.toLowerCase()))
    return true;
  const name = p.businessName ?? p.creditUnionName ?? p.name ?? p.company;
  const aliases = new Set(
    trainingIdentityAliases({ businessName: name, website: p.website, email })
  );
  // Retained cross-campaign source records reserve identity; no history is changed.
  return ex.records.some(
    r =>
      r.origin !== key &&
      !(key === "chamber" && r.origin === "relationships") &&
      trainingIdentityAliases(r).some(a => aliases.has(a))
  );
}

/** Pure strict classifier: each distinct prospect needs its exact source-backed untouched initial sequence. */
export function classifyOutreachAlertReady(
  key: OutreachCampaignKey,
  people: Row[],
  queue: Row[],
  ex: AlertExclusions,
  now: Date
): { readyCount: number; sourceHoldCount: number } {
  const ready = new Set<number>();
  for (const p of people) {
    const messages = queue.filter(m => m.prospectId === p.id);
    const initial = messages.find(
      m => (m.sequenceStep ?? m.messageNumber - 1) === 0
    );
    if (
      !initial ||
      !freshInitial(initial, now) ||
      p.firstSentAt ||
      p.stoppedAt ||
      p.hasManualNotes ||
      p.hasHold ||
      p.replyAt ||
      p.repliedAt ||
      p.optoutAt ||
      p.unsubscribedAt ||
      p.bounceAt
    )
      continue;
    try {
      if (
        ["tourism", "real_estate", "industrial", "healthcare"].includes(key)
      ) {
        if (
          p.status !== "ready" ||
          p.qualification !== "qualified" ||
          !p.verifiedAt
        )
          continue;
        const evidence = readSectorEvidence(p.evidenceJson);
        if (
          evidence.email !== p.email ||
          evidence.campaignKey !== key ||
          evidence.company !== p.company ||
          evidence.website !== p.website ||
          sectorQualificationReason(evidence, now) ||
          sectorConflictReason(evidence, ex.records, ex.suppressions, p.id)
        )
          continue;
        const expected = buildSectorSequence(evidence);
        if (
          messages.length !== 3 ||
          !expected.every(e =>
            messages.some(
              m =>
                m.messageNumber === e.messageNumber &&
                m.status === "approved" &&
                noAttempt(m) &&
                m.copyVersion === SECTOR_COPY_VERSION &&
                m.subject === e.subject &&
                m.textBody === e.textBody &&
                m.htmlBody === e.htmlBody
            )
          )
        )
          continue;
      } else if (key === "hustle") {
        if (
          p.stage !== "ready" ||
          p.qualification !== "qualified" ||
          crossBlocked(key, p, ex)
        )
          continue;
        const evidence = hustleResearchSchema.parse(JSON.parse(p.evidenceJson));
        if (
          hustleRequiresExactMessageReview(evidence) ||
          !isHustleContactQualified(evidence, undefined, now) ||
          p.email !== evidence.email?.toLowerCase() ||
          p.organizationKey !== organizationKey(evidence) ||
          ![
            "name",
            "website",
            "category",
            "recipientType",
            "contactName",
            "contactTitle",
            "localEvidence",
            "localSourceUrl",
            "emailSourceUrl",
            "emailSourceQuote",
            "roleSourceUrl",
            "phone",
            "phoneSourceUrl",
          ].every(k => p[k] === (evidence as any)[k])
        )
          continue;
        if (
          messages.length !== 3 ||
          ![0, 1, 2].every(
            step =>
              messages.filter(
                m =>
                  m.sequenceStep === step &&
                  m.status === "approved" &&
                  noAttempt(m) &&
                  isHustleCanonicalMessage(p as any, m as any)
              ).length === 1
          )
        )
          continue;
      } else {
        if (
          p.status !== "approved" ||
          p.crossCampaignBlock ||
          crossBlocked(key, p, ex)
        )
          continue;
        if (key === "chamber") {
          if (
            p.researchStatus !== "approved" ||
            !isPublicTrainingHttpUrl(p.sourceUrl)
          )
            continue;
        } else {
          if (p.outreachStatus !== "approved" || !p.primaryEmailSourceUrl)
            continue;
          if (key === "credit_union") {
            if (
              p.draftVersion !== CREDIT_UNION_DRAFT_VERSION ||
              !isCreditUnionTargetingReady({
                name: p.primaryContactName,
                title: p.primaryContactTitle,
                email: p.primaryEmail,
                emailConfidence: p.emailConfidence,
                emailSourceUrl: p.primaryEmailSourceUrl,
                roleSourceUrl: p.primaryRoleSourceUrl,
              })
            )
              continue;
          } else if (key === "brand_video") {
            if (
              p.draftVersion !== BRAND_VIDEO_DRAFT_VERSION ||
              p.qualified !== 1 ||
              normalizeBrandVideoEmail(p.primaryEmail) !== p.normalizedEmail ||
              !hasPublishedBrandVideoEmail({
                email: p.primaryEmail,
                sourceUrl: p.primaryEmailSourceUrl,
              }) ||
              !isBrandVideoHttpUrl(p.website) ||
              !p.localAuthorityEvidence?.trim() ||
              !p.verifiedObservation?.trim() ||
              !p.videoAngle?.trim() ||
              !p.videoScenes?.trim() ||
              !sourcesContain(p)
            )
              continue;
          } else {
            if (
              p.draftVersion !== TRAINING_OUTREACH_DRAFT_VERSION ||
              p.qualificationStatus !== "qualified" ||
              p.contactReadiness !== "verified" ||
              normalizeTrainingEmail(p.primaryEmail) !== p.normalizedEmail ||
              !hasSourceBackedTrainingEmail({
                email: p.primaryEmail,
                sourceUrl: p.primaryEmailSourceUrl,
              }) ||
              !isPublicTrainingHttpUrl(p.website) ||
              !p.localAuthorityEvidence?.trim() ||
              !p.verifiedObservation?.trim() ||
              !p.useCase?.trim() ||
              !p.pilotScope?.trim() ||
              !sourcesContain(p)
            )
              continue;
          }
          if (
            messages.length !== 3 ||
            ![0, 1, 2].every(
              step =>
                messages.filter(
                  m =>
                    m.sequenceStep === step &&
                    m.status === "approved" &&
                    noAttempt(m) &&
                    m.subject?.trim() &&
                    m.textBody?.trim() &&
                    m.htmlBody?.trim() &&
                    (key === "training"
                      ? m.dueAfterBusinessDays === [0, 4, 5][step]
                      : m.dayOffset ===
                        (key === "credit_union" ? [0, 3, 8] : [0, 4, 9])[step])
                ).length === 1
            )
          )
            continue;
        }
      }
      ready.add(p.id);
    } catch {
      /* Malformed source evidence is a hold, never a send-ready shortcut. */
    }
  }
  return {
    readyCount: ready.size,
    sourceHoldCount: people.filter(p => !p.firstSentAt && !ready.has(p.id))
      .length,
  };
}

/** Scoped bounded SELECTs; never invokes workspace/ensure/prepare or point-of-send side effects. */
export async function readOutreachAlertReady(
  db: Db,
  key: OutreachCampaignKey,
  campaignId: number,
  ex: AlertExclusions,
  now: Date
) {
  const defs: Record<string, [any, any]> = {
    chamber: [s.chamberOutreachProspects, s.chamberOutreachMessages],
    credit_union: [s.creditUnionProspects, s.creditUnionMessages],
    brand_video: [s.brandVideoProspects, s.brandVideoMessages],
    training: [s.trainingOutreachProspects, s.trainingOutreachMessages],
    hustle: [s.hustleProspects, s.hustleMessages],
  };
  const sector = !defs[key];
  const [p, m] = defs[key] ?? [
    s.sectorOutreachProspects,
    s.sectorOutreachMessages,
  ];
  const personColumns: Record<string, any> = { ...getTableColumns(p) };
  delete personColumns.unsubscribeToken;
  delete personColumns.manualNotes;
  delete personColumns.holdReason;
  personColumns.hasManualNotes = sql<number>`(${p.manualNotes} is not null and trim(${p.manualNotes}) <> '')`;
  personColumns.hasHold = p.holdReason
    ? sql<number>`(${p.holdReason} is not null and trim(${p.holdReason}) <> '')`
    : sql<number>`0`;
  const messageColumns: Record<string, any> = { ...getTableColumns(m) };
  for (const field of [
    "claimToken",
    "sendClaimToken",
    "providerMessageId",
    "receiptJson",
    "error",
  ])
    delete messageColumns[field];
  const claim = m.claimToken ?? m.sendClaimToken;
  messageColumns.claimed = claim
    ? sql<number>`(${claim} is not null and trim(${claim}) <> '')`
    : sql<number>`0`;
  const attempt = m.attemptedAt ?? m.sendAttemptedAt;
  messageColumns.attempted = attempt
    ? sql<number>`(${attempt} is not null)`
    : sql<number>`0`;
  messageColumns.hasError = sql<number>`(${m.error} is not null and trim(${m.error}) <> '')`;
  const scope = (t: any) =>
    sector
      ? and(eq(t.groupId, campaignId), eq(t.campaignKey, key))
      : eq(t.campaignId, campaignId);
  const [people, queue] = await Promise.all([
    bounded(db.select(personColumns).from(p).where(scope(p))),
    bounded(db.select(messageColumns).from(m).where(scope(m))),
  ]);
  if (key === 'hustle' && people.some(row => row.recipientType === 'sponsored_general')) {
    const { HUSTLE_SPONSORED_CONFIG_VERSION } = await import('../shared/hustleSponsoredReview');
    const [campaign] = await db.select().from(s.hustleCampaigns).where(eq(s.hustleCampaigns.id, campaignId));
    if (campaign?.configVersion === HUSTLE_SPONSORED_CONFIG_VERSION) {
      const { readHustleSponsoredReadyStock } = await import('./hustleSponsoredReviewDb');
      const stock = await readHustleSponsoredReadyStock(db, campaign, undefined, undefined, now);
      return { readyCount: stock.readyInitialCount, sourceHoldCount: Math.max(0, people.filter(row => !row.firstSentAt).length - stock.readyInitialCount) };
    }
  }
  return classifyOutreachAlertReady(key, people, queue, ex, now);
}
