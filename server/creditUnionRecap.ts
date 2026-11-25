import { and, asc, desc, gte, inArray, lt } from "drizzle-orm";
import {
  creditUnionCampaigns,
  creditUnionEvents,
  creditUnionMessages,
  creditUnionProspects,
} from "../drizzle/schema";
import { getDb } from "./db";

export type CreditUnionRecapActivity = {
  eventType: string;
  detail: string | null;
  occurredAt: Date;
};

export type CreditUnionCampaignRecap = {
  campaignId: number;
  campaignName: string;
  campaignStatus: "active" | "paused";
  newSmtpAccepted: number;
  followupSmtpAccepted: number;
  /** Distinct prospects with a step-zero SMTP acceptance during this recap window. */
  initialRecipients: number;
  distinctReplies: number;
  distinctMeetings: number;
  distinctOptOuts: number;
  distinctBounces: number;
  distinctErrorEvents: number;
  ready: number;
  verificationNeeded: number;
  inSequence: number;
  lastActivity: CreditUnionRecapActivity | null;
};

export type CreditUnionRecap =
  | { state: "not-included" }
  | { state: "unavailable"; error: string }
  | { state: "available"; campaigns: CreditUnionCampaignRecap[] };

type WeekWindow = { start: Date; end: Date };

const CREDIT_UNION_ACTIVITY_EVENT =
  /(maintenance|daily_run|(?:^|_)run(?:_|$))/i;

function eventType(value: string) {
  return value.trim().toLowerCase();
}

function isReplyEvent(value: string) {
  return ["reply", "positive_reply", "reply_detected"].includes(
    eventType(value)
  );
}

function isMeetingEvent(value: string) {
  return ["meeting", "meeting_booked"].includes(eventType(value));
}

function isOptOutEvent(value: string) {
  return ["unsubscribed", "opt_out", "opted_out"].includes(eventType(value));
}

function isBounceEvent(value: string) {
  return ["bounced", "bounce"].includes(eventType(value));
}

function isErrorEvent(value: string) {
  const normalized = eventType(value);
  return (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("failure")
  );
}

function isRunOrMaintenanceActivity(value: string) {
  return CREDIT_UNION_ACTIVITY_EVENT.test(eventType(value));
}

/**
 * Counts unique affected prospects where one is available. Campaign-level or
 * transport events without a prospect remain individually countable by event
 * id, so a missing prospect id never disappears from the operational count.
 */
function countDistinctEvents(
  events: Array<{ id: number; prospectId: number | null; eventType: string }>,
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

function unavailable(error: unknown): CreditUnionRecap {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    state: "unavailable",
    error: detail || "Unknown database read failure.",
  };
}

/**
 * Reads only already-persisted active or paused credit-union campaigns.
 * This deliberately does not call ensureCreditUnionCampaign: a weekly recap
 * must never create, activate, schedule, or otherwise change a campaign.
 */
export async function getCreditUnionRecapWindow(
  window: WeekWindow
): Promise<CreditUnionRecap> {
  try {
    const db = await getDb();
    if (!db) return unavailable(new Error("Database is unavailable."));

    const campaigns = await db
      .select()
      .from(creditUnionCampaigns)
      .where(inArray(creditUnionCampaigns.status, ["active", "paused"]))
      .orderBy(asc(creditUnionCampaigns.id));

    if (!campaigns.length) return { state: "not-included" };

    const campaignIds = campaigns.map(campaign => campaign.id);
    const [prospects, acceptedMessages, weeklyEvents, activityEvents] =
      await Promise.all([
        db
          .select()
          .from(creditUnionProspects)
          .where(inArray(creditUnionProspects.campaignId, campaignIds)),
        db
          .select()
          .from(creditUnionMessages)
          .where(
            and(
              inArray(creditUnionMessages.campaignId, campaignIds),
              gte(creditUnionMessages.smtpAcceptedAt, window.start),
              lt(creditUnionMessages.smtpAcceptedAt, window.end)
            )
          ),
        db
          .select()
          .from(creditUnionEvents)
          .where(
            and(
              inArray(creditUnionEvents.campaignId, campaignIds),
              gte(creditUnionEvents.occurredAt, window.start),
              lt(creditUnionEvents.occurredAt, window.end)
            )
          ),
        // Activity is intentionally not constrained to the week: the recap
        // should show the latest recorded maintenance/run, if one exists.
        db
          .select()
          .from(creditUnionEvents)
          .where(inArray(creditUnionEvents.campaignId, campaignIds))
          .orderBy(
            desc(creditUnionEvents.occurredAt),
            desc(creditUnionEvents.id)
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
      );
      const initialAccepted = campaignMessages.filter(
        message => message.sequenceStep === 0
      );
      const initialRecipients = new Set(
        initialAccepted.map(message => message.prospectId)
      ).size;
      const lastActivity = activityEvents.find(
        event =>
          event.campaignId === campaign.id &&
          isRunOrMaintenanceActivity(event.eventType)
      );

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignStatus: campaign.status === "active" ? "active" : "paused",
        newSmtpAccepted: initialAccepted.length,
        followupSmtpAccepted: campaignMessages.filter(
          message => message.sequenceStep > 0
        ).length,
        initialRecipients,
        distinctReplies: countDistinctEvents(campaignEvents, isReplyEvent),
        distinctMeetings: countDistinctEvents(campaignEvents, isMeetingEvent),
        distinctOptOuts: countDistinctEvents(campaignEvents, isOptOutEvent),
        distinctBounces: countDistinctEvents(campaignEvents, isBounceEvent),
        distinctErrorEvents: countDistinctEvents(campaignEvents, isErrorEvent),
        ready: campaignProspects.filter(
          prospect =>
            prospect.status === "approved" &&
            prospect.outreachStatus === "approved" &&
            !prospect.firstSentAt
        ).length,
        verificationNeeded: campaignProspects.filter(
          prospect => prospect.status === "verification_needed"
        ).length,
        inSequence: campaignProspects.filter(
          prospect => prospect.outreachStatus === "in_sequence"
        ).length,
        lastActivity: lastActivity
          ? {
              eventType: lastActivity.eventType,
              detail: lastActivity.detail,
              occurredAt: lastActivity.occurredAt,
            }
          : null,
      } satisfies CreditUnionCampaignRecap;
    });

    return { state: "available", campaigns: recapCampaigns };
  } catch (error) {
    // A credit-union reporting problem must never block the Chamber recap or
    // become an invented all-zero campaign section.
    return unavailable(error);
  }
}
