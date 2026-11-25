import { and, asc, desc, gte, inArray, lt } from "drizzle-orm";
import {
  brandVideoCampaigns,
  brandVideoEvents,
  brandVideoMessages,
  brandVideoProspects,
} from "../drizzle/schema";
import { getDb } from "./db";

export type BrandVideoRecapActivity = {
  eventType: string;
  detail: string | null;
  occurredAt: Date;
};

export type BrandVideoCampaignRecap = {
  campaignId: number;
  campaignName: string;
  campaignStatus: "active" | "paused";
  newSmtpAccepted: number;
  followupSmtpAccepted: number;
  initialRecipients: number;
  distinctReplies: number;
  distinctMeetings: number;
  distinctOptOuts: number;
  distinctBounces: number;
  distinctErrorEvents: number;
  ready: number;
  inSequence: number;
  reviewPending: number;
  lastActivity: BrandVideoRecapActivity | null;
};

export type BrandVideoRecap =
  | { state: "not-included" }
  | { state: "unavailable"; error: string }
  | { state: "available"; campaigns: BrandVideoCampaignRecap[] };

type WeekWindow = { start: Date; end: Date };

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
  return /(maintenance|daily_run|(?:^|_)run(?:_|$))/i.test(eventType(value));
}

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

function unavailable(error: unknown): BrandVideoRecap {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    state: "unavailable",
    error: detail || "Unknown database read failure.",
  };
}

/**
 * Reports only persisted active/paused campaigns. It never creates, activates,
 * schedules, or sends a Brand Video campaign during recap construction.
 */
export async function getBrandVideoRecapWindow(
  window: WeekWindow
): Promise<BrandVideoRecap> {
  try {
    const db = await getDb();
    if (!db) return unavailable(new Error("Database is unavailable."));
    const campaigns = await db
      .select()
      .from(brandVideoCampaigns)
      .where(inArray(brandVideoCampaigns.status, ["active", "paused"]))
      .orderBy(asc(brandVideoCampaigns.id));
    if (!campaigns.length) return { state: "not-included" };

    const campaignIds = campaigns.map(campaign => campaign.id);
    const [prospects, acceptedMessages, weeklyEvents, activityEvents] =
      await Promise.all([
        db
          .select()
          .from(brandVideoProspects)
          .where(inArray(brandVideoProspects.campaignId, campaignIds)),
        db
          .select()
          .from(brandVideoMessages)
          .where(
            and(
              inArray(brandVideoMessages.campaignId, campaignIds),
              gte(brandVideoMessages.smtpAcceptedAt, window.start),
              lt(brandVideoMessages.smtpAcceptedAt, window.end)
            )
          ),
        db
          .select()
          .from(brandVideoEvents)
          .where(
            and(
              inArray(brandVideoEvents.campaignId, campaignIds),
              gte(brandVideoEvents.occurredAt, window.start),
              lt(brandVideoEvents.occurredAt, window.end)
            )
          ),
        db
          .select()
          .from(brandVideoEvents)
          .where(inArray(brandVideoEvents.campaignId, campaignIds))
          .orderBy(
            desc(brandVideoEvents.occurredAt),
            desc(brandVideoEvents.id)
          ),
      ]);

    return {
      state: "available",
      campaigns: campaigns.map(campaign => {
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
          initialRecipients: new Set(
            initialAccepted.map(message => message.prospectId)
          ).size,
          distinctReplies: countDistinctEvents(campaignEvents, isReplyEvent),
          distinctMeetings: countDistinctEvents(campaignEvents, isMeetingEvent),
          distinctOptOuts: countDistinctEvents(campaignEvents, isOptOutEvent),
          distinctBounces: countDistinctEvents(campaignEvents, isBounceEvent),
          distinctErrorEvents: countDistinctEvents(
            campaignEvents,
            isErrorEvent
          ),
          ready: campaignProspects.filter(
            prospect =>
              prospect.status === "approved" &&
              prospect.outreachStatus === "approved" &&
              !prospect.firstSentAt
          ).length,
          inSequence: campaignProspects.filter(
            prospect => prospect.outreachStatus === "in_sequence"
          ).length,
          reviewPending: campaignProspects.filter(
            prospect => prospect.status === "review"
          ).length,
          lastActivity: lastActivity
            ? {
                eventType: lastActivity.eventType,
                detail: lastActivity.detail,
                occurredAt: lastActivity.occurredAt,
              }
            : null,
        } satisfies BrandVideoCampaignRecap;
      }),
    };
  } catch (error) {
    return unavailable(error);
  }
}
