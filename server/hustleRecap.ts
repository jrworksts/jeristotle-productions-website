import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  hustleCampaigns,
  hustleEpisodes,
  hustleEvents,
  hustleMessages,
  hustleProspects,
} from "../drizzle/schema";
import { HUSTLE_SLUG, HUSTLE_RESERVE_TARGET } from "../shared/hustleOutreach";
import { getDb } from "./db";
import { hustleEmailTransportConfigured } from "./hustleEmail";

/** Never return database exceptions: they may contain connection URLs or tokens. */
export const HUSTLE_RECAP_UNAVAILABLE_MESSAGE =
  "Hustle reporting data is unavailable; counts are not reported. Inspect the database connection.";

export type HustleCampaignRecap = {
  campaignId: number;
  campaignName: string;
  campaignStatus: "review" | "paused" | "active";
  launchApproved: boolean;
  /** Distinct persisted message receipts within [start, end), not deliveries. */
  newSmtpAccepted: number;
  followupSmtpAccepted: number;
  initialRecipients: number;
  /** Includes automatic/OOO responses; the existing inbox stores both as replied. */
  distinctReplies: number;
  /** Null when generic reply events cannot be separated into human and OOO. */
  distinctOutOfOfficeReplies: number | null;
  distinctOptOuts: number;
  distinctBounces: number;
  weeklyEvents: number;
  weeklyErrorEvents: number;
  /** Persisted reserve only, not a claim that final send-time checks have passed. */
  readyReserve: number;
  reserveTarget: number;
  reviewHolds: number;
  draftMessages: number;
  uncertainMessages: number;
  totalProspects: number;
  episodeSlots2027: number;
  episodeGoal: number;
  reservedEpisodeSlots2027: number;
  confirmedEpisodeSlots2027: number;
  /** Local configuration/persisted bindings only, not live connectivity probes. */
  researchConnected: boolean;
  senderScheduleConnected: boolean;
  senderConfigured: boolean;
  researchRequestedAt: Date | null;
  lastInboxScanAt: Date | null;
};

export type HustleRecap =
  | { state: "not-included" }
  | { state: "unavailable"; error: string }
  | { state: "available"; campaigns: HustleCampaignRecap[] };

type WeekWindow = { start: Date; end: Date };
type RecapEvent = {
  id: number;
  prospectId: number | null;
  eventType: string;
};
const REPLY_EVENTS = ["replied", "reply", "reply_detected", "positive_reply"];
const OOO_EVENTS = ["out_of_office", "out_of_office_reply", "ooo", "ooo_reply"];
const normalize = (value: string) => value.trim().toLowerCase();

function distinctProspectEvents(events: RecapEvent[], types: string[]) {
  return new Set(
    events
      .filter(event => types.includes(normalize(event.eventType)))
      .map(event =>
        event.prospectId === null ? `event:${event.id}` : `prospect:${event.prospectId}`
      )
  ).size;
}

function unavailable(): HustleRecap {
  return { state: "unavailable", error: HUSTLE_RECAP_UNAVAILABLE_MESSAGE };
}

/**
 * Reads only the already-persisted fixed Corpus Christi Hustle campaign.
 * Intentionally does NOT import hustleDb/getHustleWorkspace: those initialize
 * campaigns and episode slots. No writes, scan, research request, reserve
 * preparation, SMTP connection, scheduler change, or launch action occurs here.
 */
export async function getHustleRecapWindow(
  window: WeekWindow,
  now = new Date()
): Promise<HustleRecap> {
  if (
    !Number.isFinite(window.start.getTime()) ||
    !Number.isFinite(window.end.getTime()) ||
    window.start >= window.end ||
    !Number.isFinite(now.getTime())
  ) return unavailable();

  try {
    const db = await getDb();
    if (!db) return unavailable();

    // Project booleans at the SQL boundary: never fetch secret URLs/task IDs.
    const campaigns = await db
      .select({
        id: hustleCampaigns.id,
        status: hustleCampaigns.status,
        launchApprovedAt: hustleCampaigns.launchApprovedAt,
        configVersion: hustleCampaigns.configVersion,
        episodeGoal: hustleCampaigns.episodeGoal,
        researchConnected: sql<number>`(${hustleCampaigns.researchWebhookUrl} is not null and trim(${hustleCampaigns.researchWebhookUrl}) <> '')`,
        senderScheduleConnected: sql<number>`(${hustleCampaigns.schedulerTaskUid} is not null and trim(${hustleCampaigns.schedulerTaskUid}) <> '')`,
        researchRequestedAt: hustleCampaigns.researchRequestedAt,
        lastInboxScanAt: hustleCampaigns.lastInboxScanAt,
      })
      .from(hustleCampaigns)
      .where(and(
        eq(hustleCampaigns.slug, HUSTLE_SLUG),
        inArray(hustleCampaigns.status, ["review", "paused", "active"])
      ))
      .orderBy(asc(hustleCampaigns.id));

    if (!campaigns.length) return { state: "not-included" };
    const campaignIds = campaigns.map(campaign => campaign.id);
    const [prospects, messages, receipts, events, episodes] = await Promise.all([
      db.select({
        id: hustleProspects.id,
        campaignId: hustleProspects.campaignId,
        qualification: hustleProspects.qualification,
        stage: hustleProspects.stage,
        firstSentAt: hustleProspects.firstSentAt,
        stoppedAt: hustleProspects.stoppedAt,
        hasEmail: sql<number>`(${hustleProspects.email} is not null and trim(${hustleProspects.email}) <> '')`,
        hasHold: sql<number>`(${hustleProspects.holdReason} is not null and trim(${hustleProspects.holdReason}) <> '')`,
      }).from(hustleProspects).where(inArray(hustleProspects.campaignId, campaignIds)),
      db.select({
        id: hustleMessages.id,
        campaignId: hustleMessages.campaignId,
        prospectId: hustleMessages.prospectId,
        sequenceStep: hustleMessages.sequenceStep,
        status: hustleMessages.status,
        scheduledAt: hustleMessages.scheduledAt,
        attemptedAt: hustleMessages.attemptedAt,
        smtpAcceptedAt: hustleMessages.smtpAcceptedAt,
        claimed: sql<number>`(${hustleMessages.claimToken} is not null and ${hustleMessages.claimToken} <> '')`,
      }).from(hustleMessages).where(inArray(hustleMessages.campaignId, campaignIds)),
      db.select({
        id: hustleMessages.id,
        campaignId: hustleMessages.campaignId,
        prospectId: hustleMessages.prospectId,
        sequenceStep: hustleMessages.sequenceStep,
        smtpAcceptedAt: hustleMessages.smtpAcceptedAt,
      }).from(hustleMessages).where(and(
        inArray(hustleMessages.campaignId, campaignIds),
        gte(hustleMessages.smtpAcceptedAt, window.start),
        lt(hustleMessages.smtpAcceptedAt, window.end)
      )),
      // Do not select detailJson/eventKey: research events contain ownership tokens.
      db.select({
        id: hustleEvents.id,
        campaignId: hustleEvents.campaignId,
        prospectId: hustleEvents.prospectId,
        eventType: hustleEvents.eventType,
        occurredAt: hustleEvents.occurredAt,
      }).from(hustleEvents).where(and(
        inArray(hustleEvents.campaignId, campaignIds),
        gte(hustleEvents.occurredAt, window.start),
        lt(hustleEvents.occurredAt, window.end)
      )),
      db.select({
        campaignId: hustleEpisodes.campaignId,
        episodeNumber: hustleEpisodes.episodeNumber,
        seasonYear: hustleEpisodes.seasonYear,
        sponsorProspectId: hustleEpisodes.sponsorProspectId,
        status: hustleEpisodes.status,
      }).from(hustleEpisodes).where(and(
        inArray(hustleEpisodes.campaignId, campaignIds),
        eq(hustleEpisodes.seasonYear, 2027)
      )),
    ]);

    const inWindow = (date: Date | null) =>
      date !== null && date >= window.start && date < window.end;
    const senderConfigured = hustleEmailTransportConfigured(); // Pure local preflight.
    const signedStocks = new Map<number, {readyInitialCount:number;target:number}>();
    const { HUSTLE_SPONSORED_CONFIG_VERSION } = await import('../shared/hustleSponsoredReview');
    for (const campaign of campaigns) if (campaign.configVersion === HUSTLE_SPONSORED_CONFIG_VERSION) {
      const [stored] = await db.select().from(hustleCampaigns).where(eq(hustleCampaigns.id, campaign.id));
      if (!stored) return unavailable();
      const { readHustleSponsoredReadyStock } = await import('./hustleSponsoredReviewDb');
      signedStocks.set(campaign.id, await readHustleSponsoredReadyStock(db, stored, undefined, undefined, now));
    }
    return {
      state: "available",
      campaigns: campaigns.map(campaign => {
        const campaignProspects = prospects.filter(p => p.campaignId === campaign.id);
        const campaignMessages = messages.filter(m => m.campaignId === campaign.id);
        // Receipt identity is the immutable ledger message id; no send-event totals.
        const campaignReceipts = Array.from(new Map(receipts
          .filter(m => m.campaignId === campaign.id && inWindow(m.smtpAcceptedAt))
          .map(m => [m.id, m])).values());
        const initialReceipts = campaignReceipts.filter(m => m.sequenceStep === 0);
        const weeklyEvents = Array.from(new Map(events
          .filter(e => e.campaignId === campaign.id && inWindow(e.occurredAt))
          .map(e => [e.id, e])).values());
        const slots = Array.from(new Map(episodes
          .filter(e => e.campaignId === campaign.id && e.seasonYear === 2027)
          .map(e => [e.episodeNumber, e])).values());
        const assignedSponsors = new Set(slots.flatMap(e =>
          e.sponsorProspectId === null ? [] : [e.sponsorProspectId]
        ));
        const readyProspects = new Set(campaignProspects.filter(p =>
          p.qualification === "qualified" && p.stage === "ready" &&
          Boolean(p.hasEmail) && !p.hasHold && !p.firstSentAt && !p.stoppedAt &&
          !assignedSponsors.has(p.id)
        ).map(p => p.id));

        return {
          campaignId: campaign.id,
          campaignName: "Corpus Christi Hustle · 2027 episode sponsorship",
          campaignStatus: campaign.status as HustleCampaignRecap["campaignStatus"],
          launchApproved: Boolean(campaign.launchApprovedAt),
          newSmtpAccepted: initialReceipts.length,
          followupSmtpAccepted: campaignReceipts.filter(m => m.sequenceStep > 0).length,
          initialRecipients: new Set(initialReceipts.map(m => m.prospectId)).size,
          distinctReplies: distinctProspectEvents(weeklyEvents, [...REPLY_EVENTS, ...OOO_EVENTS]),
          // Generic replied events deliberately do not distinguish OOO from people.
          distinctOutOfOfficeReplies: weeklyEvents.some(e => REPLY_EVENTS.includes(normalize(e.eventType)))
            ? null : distinctProspectEvents(weeklyEvents, OOO_EVENTS),
          distinctOptOuts: distinctProspectEvents(weeklyEvents, ["unsubscribed", "opt_out", "opted_out"]),
          distinctBounces: distinctProspectEvents(weeklyEvents, ["bounced", "bounce"]),
          weeklyEvents: weeklyEvents.length,
          weeklyErrorEvents: weeklyEvents.filter(e => /error|failed|failure|uncertain/i.test(e.eventType)).length,
          readyReserve: signedStocks.get(campaign.id)?.readyInitialCount ?? new Set(campaignMessages.filter(m =>
            m.sequenceStep === 0 && m.status === "approved" && !m.claimed &&
            !m.attemptedAt && !m.smtpAcceptedAt &&
            (!m.scheduledAt || m.scheduledAt <= now) && readyProspects.has(m.prospectId)
          ).map(m => m.prospectId)).size,
          reserveTarget: signedStocks.get(campaign.id)?.target ?? HUSTLE_RESERVE_TARGET,
          reviewHolds: campaignProspects.filter(p => p.qualification !== "qualified" || Boolean(p.hasHold)).length,
          draftMessages: new Set(campaignMessages.filter(m => m.status === "draft").map(m => m.id)).size,
          uncertainMessages: new Set(campaignMessages.filter(m => m.status === "uncertain").map(m => m.id)).size,
          totalProspects: campaignProspects.length,
          episodeSlots2027: slots.length,
          episodeGoal: campaign.episodeGoal,
          reservedEpisodeSlots2027: slots.filter(e => e.status === "reserved").length,
          confirmedEpisodeSlots2027: slots.filter(e => e.status === "confirmed").length,
          researchConnected: Boolean(campaign.researchConnected),
          senderScheduleConnected: Boolean(campaign.senderScheduleConnected),
          senderConfigured,
          researchRequestedAt: campaign.researchRequestedAt,
          lastInboxScanAt: campaign.lastInboxScanAt,
        } satisfies HustleCampaignRecap;
      }),
    };
  } catch {
    // No raw exception is returned or logged, and failure never becomes zeroes.
    return unavailable();
  }
}
