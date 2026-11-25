import { and, asc, desc, gte, inArray, lt } from "drizzle-orm";
import {
  trainingOutreachCampaigns,
  trainingOutreachDailyRuns,
  trainingOutreachEvents,
  trainingOutreachMessages,
  trainingOutreachProspects,
} from "../drizzle/schema";
import { getDb } from "./db";

export type TrainingRecapActivity = {
  eventType: string;
  detail: string | null;
  occurredAt: Date;
};

export type TrainingRecapRun = {
  runDate: string;
  status: "started" | "complete" | "skipped" | "failed";
  newReserved: number;
  newSent: number;
  followupsSent: number;
  repliesDetected: number;
  errorCount: number;
  summary: string | null;
  updatedAt: Date;
};

export type TrainingCampaignRecap = {
  campaignId: number;
  campaignName: string;
  campaignStatus: "active" | "paused";
  campaignCreatedAt: Date;
  /** SMTP acceptance records in this recap window—not delivery confirmations. */
  newSmtpAccepted: number;
  /** SMTP acceptance records for steps one and two in this recap window. */
  followupSmtpAccepted: number;
  /** Distinct prospects with a step-zero SMTP receipt in this recap window. */
  initialRecipients: number;
  distinctReplies: number;
  distinctMeetings: number;
  distinctOptOuts: number;
  distinctBounces: number;
  distinctErrorEvents: number;
  /** Outcome events recorded in this recap window; outcomes remain separate from message stage. */
  distinctClosedOutcomes: number;
  distinctNotClosedOutcomes: number;
  /** Current persisted outcomes, included separately from weekly outcome events. */
  currentClosed: number;
  currentNotClosed: number;
  /** Approved initial messages eligible for a future weekday run. */
  readyReserve: number;
  reviewPending: number;
  inSequence: number;
  /** Boolean-only reporting; the private research webhook is never returned. */
  researchConfigured: boolean;
  researchLastRequestedAt: Date | null;
  researchActivity: TrainingRecapActivity | null;
  lastRun: TrainingRecapRun | null;
  lastReplyCheckAt: Date | null;
  lastRunAt: Date | null;
};

export type TrainingRecap =
  | { state: "not-included" }
  | { state: "unavailable"; error: string }
  | { state: "available"; campaigns: TrainingCampaignRecap[] };

type WeekWindow = { start: Date; end: Date };
type RecapEvent = {
  id: number;
  campaignId: number;
  prospectId: number | null;
  eventType: string;
  detail: string | null;
  occurredAt: Date;
};

const RESEARCH_ACTIVITY_EVENT = /(?:research|import)/i;

function unavailable(error: unknown): TrainingRecap {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    state: "unavailable",
    error: detail || "Unknown database read failure.",
  };
}

function normalizedEventType(value: string) {
  return value.trim().toLowerCase();
}

function isReplyEvent(value: string) {
  return ["reply", "positive_reply", "reply_detected"].includes(
    normalizedEventType(value)
  );
}

function isMeetingEvent(value: string) {
  return ["meeting", "meeting_booked"].includes(normalizedEventType(value));
}

function isOptOutEvent(value: string) {
  return ["unsubscribed", "opt_out", "opted_out"].includes(
    normalizedEventType(value)
  );
}

function isBounceEvent(value: string) {
  return ["bounced", "bounce"].includes(normalizedEventType(value));
}

function isErrorEvent(value: string) {
  const normalized = normalizedEventType(value);
  return (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("failure")
  );
}

function isClosedOutcomeEvent(value: string) {
  const normalized = normalizedEventType(value);
  return normalized === "closed" || normalized === "outcome_closed";
}

function isNotClosedOutcomeEvent(value: string) {
  const normalized = normalizedEventType(value);
  return (
    normalized === "not_closed" ||
    normalized === "outcome_not_closed" ||
    normalized === "not-closed"
  );
}

/**
 * Counts unique prospects where one is available. Campaign-level events remain
 * countable by event id so missing prospect references cannot silently vanish.
 */
function countDistinctEvents(
  events: RecapEvent[],
  predicate: (eventType: string) => boolean
) {
  const identities = new Set<string>();
  for (const event of events) {
    if (!predicate(event.eventType)) continue;
    identities.add(
      event.prospectId === null
        ? `event:${event.id}`
        : `prospect:${event.prospectId}`
    );
  }
  return identities.size;
}

/**
 * Reads only already-persisted active or paused Training & Knowledge Capture
 * records. It does not initialize, activate, pause, send, scan, schedule, or
 * create research; weekly reporting must remain read-only.
 */
export async function getTrainingRecapWindow(
  window: WeekWindow
): Promise<TrainingRecap> {
  try {
    const db = await getDb();
    if (!db) return unavailable(new Error("Database is unavailable."));

    const campaigns = await db
      .select()
      .from(trainingOutreachCampaigns)
      .where(inArray(trainingOutreachCampaigns.status, ["active", "paused"]))
      .orderBy(asc(trainingOutreachCampaigns.id));

    if (!campaigns.length) return { state: "not-included" };

    const campaignIds = campaigns.map(campaign => campaign.id);
    const [prospects, acceptedMessages, weeklyEvents, allEvents, runs] =
      await Promise.all([
        db
          .select()
          .from(trainingOutreachProspects)
          .where(inArray(trainingOutreachProspects.campaignId, campaignIds)),
        db
          .select()
          .from(trainingOutreachMessages)
          .where(
            and(
              inArray(trainingOutreachMessages.campaignId, campaignIds),
              gte(trainingOutreachMessages.smtpAcceptedAt, window.start),
              lt(trainingOutreachMessages.smtpAcceptedAt, window.end)
            )
          ),
        db
          .select()
          .from(trainingOutreachEvents)
          .where(
            and(
              inArray(trainingOutreachEvents.campaignId, campaignIds),
              gte(trainingOutreachEvents.occurredAt, window.start),
              lt(trainingOutreachEvents.occurredAt, window.end)
            )
          ),
        // Research state needs the most recent persisted research evidence, not
        // a scheduler guess. This intentionally reads all-time activity.
        db
          .select()
          .from(trainingOutreachEvents)
          .where(inArray(trainingOutreachEvents.campaignId, campaignIds))
          .orderBy(
            desc(trainingOutreachEvents.occurredAt),
            desc(trainingOutreachEvents.id)
          ),
        db
          .select()
          .from(trainingOutreachDailyRuns)
          .where(inArray(trainingOutreachDailyRuns.campaignId, campaignIds))
          .orderBy(
            desc(trainingOutreachDailyRuns.runDate),
            desc(trainingOutreachDailyRuns.updatedAt)
          ),
      ]);

    const recapCampaigns = campaigns.map(campaign => {
      const campaignProspects = prospects.filter(
        prospect => prospect.campaignId === campaign.id
      );
      const campaignMessages = acceptedMessages.filter(
        message => message.campaignId === campaign.id
      );
      const campaignEvents = weeklyEvents.filter(
        event => event.campaignId === campaign.id
      ) as RecapEvent[];
      const campaignActivity = allEvents.filter(
        event => event.campaignId === campaign.id
      ) as RecapEvent[];
      const initialAccepted = campaignMessages.filter(
        message => message.sequenceStep === 0
      );
      const lastRun = runs.find(run => run.campaignId === campaign.id);
      const researchActivity = campaignActivity.find(event =>
        RESEARCH_ACTIVITY_EVENT.test(event.eventType)
      );

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignStatus: campaign.status === "active" ? "active" : "paused",
        campaignCreatedAt: campaign.createdAt,
        newSmtpAccepted: initialAccepted.length,
        followupSmtpAccepted: campaignMessages.filter(
          message => message.sequenceStep > 0
        ).length,
        initialRecipients: new Set(
          initialAccepted.map(message => message.prospectId)
        ).size,
        distinctReplies: countDistinctEvents(campaignEvents, isReplyEvent),
        distinctMeetings: countDistinctEvents(campaignEvents, isMeetingEvent),
        distinctOptOuts: countDistinctEvents(campaignEvents, isOptOutEvent),
        distinctBounces: countDistinctEvents(campaignEvents, isBounceEvent),
        distinctErrorEvents: countDistinctEvents(campaignEvents, isErrorEvent),
        distinctClosedOutcomes: countDistinctEvents(
          campaignEvents,
          isClosedOutcomeEvent
        ),
        distinctNotClosedOutcomes: countDistinctEvents(
          campaignEvents,
          isNotClosedOutcomeEvent
        ),
        currentClosed: campaignProspects.filter(
          prospect => prospect.leadOutcome === "closed"
        ).length,
        currentNotClosed: campaignProspects.filter(
          prospect => prospect.leadOutcome === "not_closed"
        ).length,
        readyReserve: campaignProspects.filter(
          prospect =>
            prospect.status === "approved" &&
            prospect.outreachStatus === "approved" &&
            !prospect.firstSentAt
        ).length,
        reviewPending: campaignProspects.filter(
          prospect => prospect.status === "review"
        ).length,
        inSequence: campaignProspects.filter(
          prospect => prospect.outreachStatus === "in_sequence"
        ).length,
        researchConfigured: Boolean(campaign.researchWebhookUrl),
        researchLastRequestedAt: campaign.researchLastRequestedAt,
        researchActivity: researchActivity
          ? {
              eventType: researchActivity.eventType,
              detail: researchActivity.detail,
              occurredAt: researchActivity.occurredAt,
            }
          : null,
        lastRun: lastRun
          ? {
              runDate: lastRun.runDate,
              status: lastRun.status,
              newReserved: lastRun.newReserved,
              newSent: lastRun.newSent,
              followupsSent: lastRun.followupsSent,
              repliesDetected: lastRun.repliesDetected,
              errorCount: lastRun.errorCount,
              summary: lastRun.summary,
              updatedAt: lastRun.updatedAt,
            }
          : null,
        lastReplyCheckAt: campaign.lastReplyCheckAt,
        lastRunAt: campaign.lastRunAt,
      } satisfies TrainingCampaignRecap;
    });

    return { state: "available", campaigns: recapCampaigns };
  } catch (error) {
    // A reporting read failure is visible in the existing Saturday recap and
    // must never block it or become invented all-zero Training metrics.
    return unavailable(error);
  }
}
