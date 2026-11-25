import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import {
  sectorOutreachGroups,
  sectorOutreachCampaigns,
  sectorOutreachProspects,
  sectorOutreachMessages,
  sectorOutreachEvents,
  type SectorOutreachGroup,
  type SectorOutreachCampaign,
  type SectorOutreachMessage,
} from "../drizzle/schema";
import {
  SECTOR_DEFINITIONS,
  SECTOR_GROUP_SLUG,
  SECTOR_VERSION,
  SECTOR_TIME_ZONE,
  SECTOR_DAILY_NEW_PER_CAMPAIGN,
  SECTOR_SEND_SEVEN_DAYS,
  SECTOR_FOLLOWUP_BUSINESS_DAYS,
  SECTOR_KEYS,
  type SectorKey,
  type SectorMessage,
} from "../shared/sectorOutreach";
import { getDb } from "./db";

const setupHash = createHash("sha256")
  .update(
    JSON.stringify({
      version: SECTOR_VERSION,
      slug: SECTOR_GROUP_SLUG,
      timeZone: SECTOR_TIME_ZONE,
      dailyNewPerCampaign: SECTOR_DAILY_NEW_PER_CAMPAIGN,
      capScope: "per_campaign_new",
      includesFollowups: false,
      sendSevenDays: SECTOR_SEND_SEVEN_DAYS,
      followupBusinessDays: SECTOR_FOLLOWUP_BUSINESS_DAYS,
      definitions: SECTOR_DEFINITIONS,
    })
  )
  .digest("hex");
export const SECTOR_SETUP_EVENT_KEY = `draft_setup:${SECTOR_GROUP_SLUG}:${setupHash}`;

type SectorCriteria = Omit<
  (typeof SECTOR_DEFINITIONS)[number],
  "key" | "name" | "messages"
>;

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Stored sector ${label} is invalid. Owner review is required.`,
    });
  }
}

function assertReviewGroup(
  group: SectorOutreachGroup | undefined
): asserts group is SectorOutreachGroup {
  if (!group)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Sector drafts have not been set up. Apply the sector migration and run the draft-only setup script.",
    });
  if (
    group.slug !== SECTOR_GROUP_SLUG ||
    group.status !== "review" ||
    group.approvalAt !== null ||
    group.sendingEnabled !== 0 ||
    group.researchEnabled !== 0 ||
    group.timeZone !== SECTOR_TIME_ZONE ||
    group.totalDailyCap !== null ||
    group.includesFollowups !== 0 ||
    group.capScope !== "per_campaign_new" ||
    group.sendSevenDays !== 1 ||
    group.policyVersion !== SECTOR_VERSION ||
    JSON.stringify(
      parseJson(group.followupBusinessDaysJson, "follow-up policy")
    ) !== JSON.stringify(SECTOR_FOLLOWUP_BUSINESS_DAYS)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Sector storage must remain unapproved review-only with sending and research disabled.",
    });
  }
}

function campaignDraft(row: SectorOutreachCampaign) {
  if (row.status !== "review" || !SECTOR_KEYS.includes(row.campaignKey) || row.dailyNewLimit !== SECTOR_DAILY_NEW_PER_CAMPAIGN) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Sector campaign must remain review-only.",
    });
  }
  const sequence = parseJson<SectorMessage[]>(row.sequenceJson, "sequence");
  if (
    !Array.isArray(sequence) ||
    sequence.length !== 3 ||
    new Set(sequence.map(message => message.messageNumber)).size !== 3 ||
    !sequence.every(
      message =>
        [1, 2, 3].includes(message.messageNumber) &&
        typeof message.subject === "string" &&
        message.subject.trim().length > 0 &&
        typeof message.body === "string" &&
        message.body.trim().length > 0
    )
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Each sector must have exactly three numbered draft templates.",
    });
  }
  const criteria = parseJson<SectorCriteria>(row.criteriaJson, "criteria");
  return {
    ...row,
    ...criteria,
    key: row.campaignKey,
    criteria,
    messages: [...sequence].sort((a, b) => a.messageNumber - b.messageNumber),
  };
}

function assertNoSendHistory(messages: SectorOutreachMessage[]) {
  if (
    messages.some(
      message =>
        message.status !== "draft" ||
        message.scheduledAt !== null ||
        message.attemptedAt !== null ||
        message.smtpAcceptedAt !== null ||
        message.deliveredAt !== null ||
        message.bouncedAt !== null ||
        message.providerMessageId !== null ||
        message.receiptJson !== null
    )
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Sector drafts contain a schedule, attempted message or receipt. Review edits are blocked; no history will be overwritten.",
    });
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Sector draft database is unavailable. Draft counts cannot be determined.",
    });
  return db;
}

/** Do not turn missing tables, connectivity errors or invalid records into empty counts. */
async function storageOperation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Sector draft storage could not be read or saved. Verify the sector migration and database connection. Counts are unavailable.",
    });
  }
}

/** Read-only: never seeds, approves, imports or calls other campaign workspaces. */
export async function getSectorDraftWorkspace() {
  return storageOperation(async () => {
    const db = await requireDb();
    const [group] = await db
      .select()
      .from(sectorOutreachGroups)
      .where(eq(sectorOutreachGroups.slug, SECTOR_GROUP_SLUG))
      .limit(1);
    assertReviewGroup(group);
    const [campaignRows, prospects, messages] = await Promise.all([
      db
        .select()
        .from(sectorOutreachCampaigns)
        .where(eq(sectorOutreachCampaigns.groupId, group.id)),
      db
        .select()
        .from(sectorOutreachProspects)
        .where(eq(sectorOutreachProspects.groupId, group.id)),
      db
        .select()
        .from(sectorOutreachMessages)
        .where(eq(sectorOutreachMessages.groupId, group.id)),
    ]);
    if (
      campaignRows.length !== 4 ||
      SECTOR_KEYS.some(
        key => !campaignRows.some(row => row.campaignKey === key)
      )
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Sector draft setup is incomplete: four campaign records are required.",
      });
    }
    assertNoSendHistory(messages);
    const campaigns = SECTOR_KEYS.map(key =>
      campaignDraft(campaignRows.find(row => row.campaignKey === key)!)
    );
    return {
      group,
      campaigns,
      prospects,
      messages,
      totals: {
        campaigns: campaigns.length,
        templates: campaigns.reduce(
          (total, campaign) => total + campaign.messages.length,
          0
        ),
        prospects: prospects.length,
        messages: messages.length,
        draftMessages: messages.filter(message => message.status === "draft")
          .length,
        attempted: messages.filter(message => message.attemptedAt !== null)
          .length,
        smtpAccepted: messages.filter(
          message => message.smtpAcceptedAt !== null
        ).length,
        replied: prospects.filter(prospect => prospect.replyAt !== null).length,
        optedOut: prospects.filter(prospect => prospect.optoutAt !== null)
          .length,
        bounced: prospects.filter(prospect => prospect.bounceAt !== null)
          .length,
      },
      gates: {
        status: "review" as const,
        approvalAt: null,
        sendingEnabled: false as const,
        researchEnabled: false as const,
        activationAvailable: false as const,
        approvalAvailable: false as const,
        timeZone: SECTOR_TIME_ZONE,
        dailyNewPerCampaign: SECTOR_DAILY_NEW_PER_CAMPAIGN,
        capScope: "per_campaign_new" as const,
        totalDailyCap: null,
        includesFollowups: false as const,
        sendSevenDays: SECTOR_SEND_SEVEN_DAYS,
        businessDaysOnly: false as const,
        followupBusinessDays: SECTOR_FOLLOWUP_BUSINESS_DAYS,
        followupAnchor: "previous_smtp_acceptance" as const,
      },
      statuses: {
        group: "review" as const,
        campaigns: "review" as const,
        messages: "draft" as const,
        setup: "persisted" as const,
      },
    };
  });
}
export type SectorDraftWorkspace = Awaited<
  ReturnType<typeof getSectorDraftWorkspace>
>;

/** CLI-only, replay-safe setup. Never invoked by a router or a workspace read. */
export async function setupSectorDrafts() {
  return storageOperation(async () => {
    const db = await requireDb();
    return db.transaction(async tx => {
      await tx
        .insert(sectorOutreachGroups)
        .ignore()
        .values({
          slug: SECTOR_GROUP_SLUG,
          status: "review",
          timeZone: SECTOR_TIME_ZONE,
          totalDailyCap: null,
          includesFollowups: 0,
          capScope: "per_campaign_new",
          sendSevenDays: 1,
          followupBusinessDaysJson: JSON.stringify(
            SECTOR_FOLLOWUP_BUSINESS_DAYS
          ),
          policyVersion: SECTOR_VERSION,
          approvalAt: null,
          sendingEnabled: 0,
          researchEnabled: 0,
        });
      const [group] = await tx
        .select()
        .from(sectorOutreachGroups)
        .where(eq(sectorOutreachGroups.slug, SECTOR_GROUP_SLUG))
        .limit(1)
        .for("update");
      assertReviewGroup(group);
      for (const definition of SECTOR_DEFINITIONS) {
        const { key, name, messages, ...criteria } = definition;
        await tx
          .insert(sectorOutreachCampaigns)
          .ignore()
          .values({
            groupId: group.id,
            campaignKey: key,
            name,
            status: "review",
            dailyNewLimit: SECTOR_DAILY_NEW_PER_CAMPAIGN,
            criteriaJson: JSON.stringify(criteria),
            sequenceJson: JSON.stringify(messages),
            reviewNotes: null,
          });
      }
      const campaigns = await tx
        .select()
        .from(sectorOutreachCampaigns)
        .where(eq(sectorOutreachCampaigns.groupId, group.id));
      const prospects = await tx
        .select()
        .from(sectorOutreachProspects)
        .where(eq(sectorOutreachProspects.groupId, group.id));
      const messages = await tx
        .select()
        .from(sectorOutreachMessages)
        .where(eq(sectorOutreachMessages.groupId, group.id));
      assertNoSendHistory(messages);
      if (
        campaigns.length !== 4 ||
        SECTOR_KEYS.some(
          key => !campaigns.some(row => row.campaignKey === key)
        ) ||
        prospects.length ||
        messages.length
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Setup requires exactly four sector drafts, zero prospects and zero message instances. Existing records were not replaced.",
        });
      }
      const templateCount = campaigns
        .map(campaignDraft)
        .reduce((total, campaign) => total + campaign.messages.length, 0);
      await tx
        .insert(sectorOutreachEvents)
        .ignore()
        .values({
          groupId: group.id,
          eventKey: SECTOR_SETUP_EVENT_KEY,
          eventType: "draft_setup",
          detailJson: JSON.stringify({
            setupHash,
            version: SECTOR_VERSION,
            campaigns: 4,
            templates: templateCount,
            prospects: 0,
            messages: 0,
            status: "review",
            approvalAt: null,
            sendingEnabled: false,
            researchEnabled: false,
          }),
        });
      return {
        groupId: group.id,
        slug: group.slug,
        campaigns: 4,
        templates: templateCount,
        prospects: 0,
        messages: 0,
        setupEventKey: SECTOR_SETUP_EVENT_KEY,
        status: "review" as const,
        approvalAt: null,
        sendingEnabled: false as const,
        researchEnabled: false as const,
      };
    });
  });
}

/** Owner route exposes notes only. It cannot change copy, state or any gate. */
export async function updateSectorReviewNotes(input: {
  campaignKey: SectorKey;
  reviewNotes: string | null;
}) {
  if (
    !SECTOR_KEYS.includes(input.campaignKey) ||
    (input.reviewNotes !== null &&
      (typeof input.reviewNotes !== "string" ||
        input.reviewNotes.length > 4000))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Use a sector campaign key and review notes of at most 4,000 characters.",
    });
  }
  return storageOperation(async () => {
    const db = await requireDb();
    return db.transaction(async tx => {
      const [group] = await tx
        .select()
        .from(sectorOutreachGroups)
        .where(eq(sectorOutreachGroups.slug, SECTOR_GROUP_SLUG))
        .limit(1)
        .for("update");
      assertReviewGroup(group);
      const [campaign] = await tx
        .select()
        .from(sectorOutreachCampaigns)
        .where(
          and(
            eq(sectorOutreachCampaigns.groupId, group.id),
            eq(sectorOutreachCampaigns.campaignKey, input.campaignKey)
          )
        )
        .limit(1);
      if (!campaign)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sector campaign draft was not found.",
        });
      campaignDraft(campaign);
      const messages = await tx
        .select()
        .from(sectorOutreachMessages)
        .where(eq(sectorOutreachMessages.groupId, group.id));
      assertNoSendHistory(messages);
      const reviewNotes = input.reviewNotes?.trim() || null;
      await tx
        .update(sectorOutreachCampaigns)
        .set({ reviewNotes })
        .where(
          and(
            eq(sectorOutreachCampaigns.groupId, group.id),
            eq(sectorOutreachCampaigns.campaignKey, input.campaignKey)
          )
        );
      await tx
        .insert(sectorOutreachEvents)
        .values({
          groupId: group.id,
          campaignKey: input.campaignKey,
          eventKey: `review_notes:${randomUUID()}`,
          eventType: "review_notes_updated",
          detailJson: JSON.stringify({
            campaignKey: input.campaignKey,
            notesPresent: reviewNotes !== null,
            status: "review",
            approvalAt: null,
          }),
        });
      return {
        campaignKey: input.campaignKey,
        reviewNotes,
        status: "review" as const,
      };
    });
  });
}
