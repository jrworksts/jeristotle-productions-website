import { and, asc, eq, getTableColumns, gte, inArray, lt, sql } from "drizzle-orm";
import {
  sectorOutreachGroups,
  sectorOutreachCampaigns,
  sectorOutreachProspects,
  sectorOutreachMessages,
  sectorOutreachEvents,
} from "../drizzle/schema";
import { SECTOR_GROUP_SLUG, SECTOR_KEYS, type SectorKey } from "../shared/sectorOutreach";
import { getDb } from "./db";

/** Fixed text only: connection exceptions can contain credentials and private URLs. */
export const SECTOR_RECAP_UNAVAILABLE_MESSAGE =
  "Sector reporting data is unavailable; counts are not reported. Verify the sector migration and database connection.";
export const SECTOR_RECAP_RESERVE_TARGET = 20;
export type SectorRecapWindow = { start: Date; end: Date };
export type SectorRecapActivity = { eventType: string; occurredAt: Date };
export type SectorCampaignRecap = {
  campaignId: number;
  campaignKey: SectorKey;
  campaignName: string;
  campaignStatus: "review" | "active" | "paused";
  dailyNewLimit: number;
  /** Unique message IDs with persisted receipts in [start, end), not deliveries. */
  newSmtpAccepted: number;
  followupSmtpAccepted: number;
  initialRecipients: number;
  distinctContactedProspects: number;
  /** Distinct prospect IDs across prospect/message timestamps and supported events. */
  distinctReplies: number;
  distinctOutOfOfficeReplies: number | null;
  distinctOptOuts: number;
  distinctBounces: number;
  /** Null without an event ledger that supports prospect-linked meeting events. */
  distinctMeetings: number | null;
  currentMeetings: number;
  weeklyEvents: number;
  weeklyErrorEvents: number;
  weeklyUncertainEvents: number;
  weeklyErroredMessages: number;
  weeklyUncertainMessages: number;
  /** Current, due, approved initial inventory. Not authorization or a live gate check. */
  readyReserve: number;
  reserveTarget: number;
  totalProspects: number;
  reviewPending: number;
  verificationNeeded: number;
  inSequence: number;
  draftMessages: number;
  uncertainMessages: number;
  /** Sector schema has no sales-outcome or unread/open/click ledger. */
  currentClosed: null;
  currentNotClosed: null;
  outcomeUnknown: number;
  unreadReplies: null;
  opens: null;
  clicks: null;
  senderScheduleConnected: boolean;
  lastInboxScanAt: Date | null;
  researchActivity: SectorRecapActivity | null;
  lastActivity: SectorRecapActivity | null;
};
export type SectorRecap =
  | { state: "not-included" }
  | { state: "unavailable"; error: string }
  | {
      state: "available";
      window: SectorRecapWindow;
      asOf: Date;
      group: {
        groupId: number;
        status: "review" | "active" | "paused";
        approved: boolean;
        sendingEnabled: boolean;
        researchEnabled: boolean;
        researchConnected: boolean;
        sendSevenDays: boolean;
        capScope: string;
        includesFollowups: boolean;
      };
      campaigns: SectorCampaignRecap[];
    };

type RecapEvent = {
  id: number;
  groupId: number;
  campaignKey: SectorKey | null;
  prospectId: number | null;
  eventType: string;
  occurredAt: Date;
};
const REPLY_EVENTS = ["reply", "replied", "reply_detected", "positive_reply"];
const OOO_EVENTS = ["out_of_office", "out_of_office_reply", "ooo", "ooo_reply"];
const OPT_OUT_EVENTS = ["unsubscribed", "opt_out", "opted_out"];
const BOUNCE_EVENTS = ["bounce", "bounced"];
const MEETING_EVENTS = ["meeting", "meeting_booked"];
const normalized = (value: string) => value.trim().toLowerCase();
const uniqueRows = <T extends { id: number }>(rows: T[]) =>
  Array.from(new Map(rows.map(row => [row.id, row])).values());
const unavailable = (): SectorRecap => ({ state: "unavailable", error: SECTOR_RECAP_UNAVAILABLE_MESSAGE });

export function getSectorRecapWindow(window: SectorRecapWindow, now?: Date): Promise<SectorRecap>;
export function getSectorRecapWindow(start: Date, end: Date, now?: Date): Promise<SectorRecap>;
/**
 * Direct SELECTs only. Never import a workspace initializer, sender, inbox scanner,
 * research requester or read gate: reporting must not change persisted state.
 * Both signatures are supported for callers following existing recap patterns.
 */
export async function getSectorRecapWindow(
  startOrWindow: Date | SectorRecapWindow,
  endOrNow?: Date,
  explicitNow?: Date
): Promise<SectorRecap> {
  const window = startOrWindow instanceof Date
    ? { start: startOrWindow, end: endOrNow! }
    : startOrWindow;
  const now = (startOrWindow instanceof Date ? explicitNow : endOrNow) ?? new Date();
  if (!(window?.start instanceof Date) || !(window?.end instanceof Date) ||
      !Number.isFinite(window.start.getTime()) || !Number.isFinite(window.end.getTime()) ||
      window.start >= window.end || !Number.isFinite(now.getTime())) return unavailable();
  const inWindow = (date: Date | null | undefined) =>
    date instanceof Date && date >= window.start && date < window.end;

  try {
    const db = await getDb();
    if (!db) return unavailable();
    const [group] = await db.select({
      id: sectorOutreachGroups.id,
      status: sectorOutreachGroups.status,
      approvalAt: sectorOutreachGroups.approvalAt,
      approvedCopyVersion: sectorOutreachGroups.approvedCopyVersion,
      sendingEnabled: sectorOutreachGroups.sendingEnabled,
      researchEnabled: sectorOutreachGroups.researchEnabled,
      sendSevenDays: sectorOutreachGroups.sendSevenDays,
      capScope: sectorOutreachGroups.capScope,
      includesFollowups: sectorOutreachGroups.includesFollowups,
      researchConnected: sql<number>`(${sectorOutreachGroups.researchWebhookUrl} is not null and trim(${sectorOutreachGroups.researchWebhookUrl}) <> '')`,
    }).from(sectorOutreachGroups).where(eq(sectorOutreachGroups.slug, SECTOR_GROUP_SLUG)).limit(1);
    if (!group) return { state: "not-included" };
    if (!["review", "active", "paused"].includes(group.status)) return unavailable();

    const campaigns = await db.select({
      id: sectorOutreachCampaigns.id,
      groupId: sectorOutreachCampaigns.groupId,
      campaignKey: sectorOutreachCampaigns.campaignKey,
      name: sectorOutreachCampaigns.name,
      status: sectorOutreachCampaigns.status,
      dailyNewLimit: sectorOutreachCampaigns.dailyNewLimit,
      senderScheduleConnected: sql<number>`(${sectorOutreachCampaigns.schedulerTaskUid} is not null and trim(${sectorOutreachCampaigns.schedulerTaskUid}) <> '')`,
      lastInboxScanAt: sectorOutreachCampaigns.lastInboxScanAt,
    }).from(sectorOutreachCampaigns).where(and(
      eq(sectorOutreachCampaigns.groupId, group.id),
      inArray(sectorOutreachCampaigns.campaignKey, [...SECTOR_KEYS])
    )).orderBy(asc(sectorOutreachCampaigns.id));
    // Do not fabricate missing campaigns or collapse partially migrated data to zero.
    if (campaigns.length !== 4 || SECTOR_KEYS.some(key =>
      campaigns.filter(c => c.groupId === group.id && c.campaignKey === key).length !== 1
    ) || campaigns.some(c => !["review", "active", "paused"].includes(c.status))) return unavailable();

    // Older event schemas have no prospect reference or meeting event type. Never
    // parse private detailJson to guess identities or turn campaign events into people.
    const eventColumns = getTableColumns(sectorOutreachEvents);
    const eventProspectColumn = "prospectId" in eventColumns ? eventColumns.prospectId : null;
    const supportsMeetingEvents = Boolean(eventProspectColumn) &&
      sectorOutreachEvents.eventType.enumValues.some(value => MEETING_EVENTS.includes(value));
    const eventFields = {
      id: sectorOutreachEvents.id,
      groupId: sectorOutreachEvents.groupId,
      campaignKey: sectorOutreachEvents.campaignKey,
      prospectId: eventProspectColumn ? sql<number | null>`${eventProspectColumn}` : sql<null>`null`,
      eventType: sectorOutreachEvents.eventType,
      occurredAt: sectorOutreachEvents.occurredAt,
    };
    const messageFields = {
      id: sectorOutreachMessages.id,
      groupId: sectorOutreachMessages.groupId,
      campaignKey: sectorOutreachMessages.campaignKey,
      prospectId: sectorOutreachMessages.prospectId,
      messageNumber: sectorOutreachMessages.messageNumber,
      status: sectorOutreachMessages.status,
      copyVersion: sectorOutreachMessages.copyVersion,
      claimed: sql<number>`(${sectorOutreachMessages.claimToken} is not null and trim(${sectorOutreachMessages.claimToken}) <> '')`,
      scheduledAt: sectorOutreachMessages.scheduledAt,
      attemptedAt: sectorOutreachMessages.attemptedAt,
      smtpAcceptedAt: sectorOutreachMessages.smtpAcceptedAt,
      replyAt: sectorOutreachMessages.replyAt,
      optoutAt: sectorOutreachMessages.optoutAt,
      bouncedAt: sectorOutreachMessages.bouncedAt,
      hasError: sql<number>`(${sectorOutreachMessages.error} is not null and trim(${sectorOutreachMessages.error}) <> '')`,
      hasUnresolvedTokens: sql<number>`(${sectorOutreachMessages.subject} regexp ${"\\[[^]]+\\]"} or ${sectorOutreachMessages.textBody} regexp ${"\\[[^]]+\\]"})`,
    };
    const [prospectRows, messageRows, receiptRows, eventRows, activityRows] = await Promise.all([
      db.select({
        id: sectorOutreachProspects.id,
        groupId: sectorOutreachProspects.groupId,
        campaignKey: sectorOutreachProspects.campaignKey,
        status: sectorOutreachProspects.status,
        qualification: sectorOutreachProspects.qualification,
        verifiedAt: sectorOutreachProspects.verifiedAt,
        firstSentAt: sectorOutreachProspects.firstSentAt,
        hasHold: sql<number>`(${sectorOutreachProspects.holdReason} is not null and trim(${sectorOutreachProspects.holdReason}) <> '')`,
        replyAt: sectorOutreachProspects.replyAt,
        optoutAt: sectorOutreachProspects.optoutAt,
        bounceAt: sectorOutreachProspects.bounceAt,
        stoppedAt: sectorOutreachProspects.stoppedAt,
        hasEmail: sql<number>`(${sectorOutreachProspects.email} is not null and trim(${sectorOutreachProspects.email}) <> '')`,
      }).from(sectorOutreachProspects).where(and(
        eq(sectorOutreachProspects.groupId, group.id), inArray(sectorOutreachProspects.campaignKey, [...SECTOR_KEYS])
      )),
      db.select(messageFields).from(sectorOutreachMessages).where(and(
        eq(sectorOutreachMessages.groupId, group.id), inArray(sectorOutreachMessages.campaignKey, [...SECTOR_KEYS])
      )),
      db.select({
        id: sectorOutreachMessages.id, groupId: sectorOutreachMessages.groupId,
        campaignKey: sectorOutreachMessages.campaignKey, prospectId: sectorOutreachMessages.prospectId,
        messageNumber: sectorOutreachMessages.messageNumber, smtpAcceptedAt: sectorOutreachMessages.smtpAcceptedAt,
      }).from(sectorOutreachMessages).where(and(
        eq(sectorOutreachMessages.groupId, group.id), inArray(sectorOutreachMessages.campaignKey, [...SECTOR_KEYS]),
        gte(sectorOutreachMessages.smtpAcceptedAt, window.start), lt(sectorOutreachMessages.smtpAcceptedAt, window.end)
      )),
      db.select(eventFields).from(sectorOutreachEvents).where(and(
        eq(sectorOutreachEvents.groupId, group.id),
        gte(sectorOutreachEvents.occurredAt, window.start), lt(sectorOutreachEvents.occurredAt, window.end)
      )),
      db.select(eventFields).from(sectorOutreachEvents).where(eq(sectorOutreachEvents.groupId, group.id)),
    ]);
    const prospects = uniqueRows(prospectRows);
    const messages = uniqueRows(messageRows);
    const receipts = uniqueRows(receiptRows);
    const events = uniqueRows(eventRows) as RecapEvent[];
    const activities = (uniqueRows(activityRows) as RecapEvent[])
      .filter(e => e.groupId === group.id && e.occurredAt instanceof Date && e.occurredAt <= now)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id - a.id);

    return {
      state: "available", window, asOf: now,
      group: {
        groupId: group.id, status: group.status as "review" | "active" | "paused",
        approved: Boolean(group.approvalAt), sendingEnabled: Boolean(group.sendingEnabled),
        researchEnabled: Boolean(group.researchEnabled), researchConnected: Boolean(group.researchConnected),
        sendSevenDays: Boolean(group.sendSevenDays), capScope: group.capScope,
        includesFollowups: Boolean(group.includesFollowups),
      },
      campaigns: SECTOR_KEYS.map(key => {
        const campaign = campaigns.find(c => c.campaignKey === key)!;
        const belongs = (row: { groupId: number; campaignKey: string | null }) => row.groupId === group.id && row.campaignKey === key;
        const people = prospects.filter(belongs);
        const ledger = messages.filter(belongs);
        const accepted = receipts.filter(m => belongs(m) && inWindow(m.smtpAcceptedAt));
        const initial = accepted.filter(m => m.messageNumber === 1);
        const weekly = events.filter(e => belongs(e) && inWindow(e.occurredAt));
        const linked = (types: string[]) => weekly.filter(e => e.prospectId !== null && types.includes(normalized(e.eventType))).map(e => e.prospectId!);
        const countPeople = (prospectDates: number[], messageDates: number[], eventTypes: string[]) =>
          new Set([...prospectDates, ...messageDates, ...linked(eventTypes)]).size;
        const attemptedPeople = new Set(ledger.filter(m => m.messageNumber === 1 &&
          (m.attemptedAt || m.smtpAcceptedAt || ["claimed", "sent", "uncertain"].includes(m.status))
        ).map(m => m.prospectId));
        const qualifiedReady = new Set(people.filter(p =>
          p.status === "ready" && p.qualification === "qualified" && p.verifiedAt && p.hasEmail &&
          !p.hasHold && !p.firstSentAt && !p.replyAt && !p.optoutAt && !p.bounceAt && !p.stoppedAt && !attemptedPeople.has(p.id)
        ).map(p => p.id));
        const latest = activities.find(e => e.campaignKey === key || e.campaignKey === null);
        const research = activities.find(e => (e.campaignKey === key || e.campaignKey === null) && /research|import/i.test(e.eventType));
        const activity = (e: RecapEvent | undefined): SectorRecapActivity | null => e ? { eventType: e.eventType, occurredAt: e.occurredAt } : null;
        return {
          campaignId: campaign.id, campaignKey: key, campaignName: campaign.name,
          campaignStatus: campaign.status as SectorCampaignRecap["campaignStatus"], dailyNewLimit: campaign.dailyNewLimit,
          newSmtpAccepted: initial.length,
          followupSmtpAccepted: accepted.filter(m => m.messageNumber === 2 || m.messageNumber === 3).length,
          initialRecipients: new Set(initial.map(m => m.prospectId)).size,
          distinctContactedProspects: new Set(accepted.filter(m => [1, 2, 3].includes(m.messageNumber)).map(m => m.prospectId)).size,
          distinctReplies: countPeople(people.filter(p => inWindow(p.replyAt)).map(p => p.id), ledger.filter(m => inWindow(m.replyAt)).map(m => m.prospectId), [...REPLY_EVENTS, ...OOO_EVENTS]),
          distinctOutOfOfficeReplies: null, // Generic stored reply timestamps include automatic/OOO responses.
          distinctOptOuts: countPeople(people.filter(p => inWindow(p.optoutAt)).map(p => p.id), ledger.filter(m => inWindow(m.optoutAt)).map(m => m.prospectId), OPT_OUT_EVENTS),
          distinctBounces: countPeople(people.filter(p => inWindow(p.bounceAt)).map(p => p.id), ledger.filter(m => inWindow(m.bouncedAt)).map(m => m.prospectId), BOUNCE_EVENTS),
          distinctMeetings: supportsMeetingEvents ? new Set(linked(MEETING_EVENTS)).size : null,
          currentMeetings: people.filter(p => p.status === "meeting").length,
          weeklyEvents: weekly.length,
          weeklyErrorEvents: weekly.filter(e => /error|failed|failure|uncertain/i.test(e.eventType)).length,
          weeklyUncertainEvents: weekly.filter(e => /uncertain/i.test(e.eventType)).length,
          weeklyErroredMessages: ledger.filter(m => m.hasError && inWindow(m.attemptedAt)).length,
          weeklyUncertainMessages: ledger.filter(m => m.status === "uncertain" && inWindow(m.attemptedAt)).length,
          readyReserve: new Set(ledger.filter(m => m.messageNumber === 1 && m.status === "approved" &&
            !m.claimed && !m.hasError && Boolean(group.approvedCopyVersion) && m.copyVersion === group.approvedCopyVersion &&
            !m.attemptedAt && !m.smtpAcceptedAt && !m.replyAt && !m.optoutAt && !m.bouncedAt && !m.hasUnresolvedTokens &&
            (!m.scheduledAt || m.scheduledAt <= now) && qualifiedReady.has(m.prospectId)
          ).map(m => m.prospectId)).size,
          reserveTarget: SECTOR_RECAP_RESERVE_TARGET, totalProspects: people.length,
          reviewPending: people.filter(p => p.status === "review" || p.qualification === "review").length,
          verificationNeeded: people.filter(p => p.qualification === "verification_needed").length,
          inSequence: people.filter(p => p.status === "contacted").length,
          draftMessages: ledger.filter(m => m.status === "draft").length,
          uncertainMessages: ledger.filter(m => m.status === "uncertain").length,
          currentClosed: null, currentNotClosed: null, outcomeUnknown: people.length,
          unreadReplies: null, opens: null, clicks: null,
          senderScheduleConnected: Boolean(campaign.senderScheduleConnected), lastInboxScanAt: campaign.lastInboxScanAt,
          researchActivity: activity(research), lastActivity: activity(latest),
        } satisfies SectorCampaignRecap;
      }),
    };
  } catch {
    // Unavailable must never become all-zero metrics or expose raw error details.
    return unavailable();
  }
}
