import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getChamberWorkspace,
  updateChamberAction,
  updateChamberBenefit,
  updateChamberEvent,
  updateChamberProspect,
  upsertChamberWeeklyScore,
} from "../db";
import {
  approveProspectSequence,
  getChamberOutreachWorkspace,
  updateOutreachCampaign,
  updateOutreachProspect,
  upsertSuppression,
} from "../outreachDb";
import {
  getOutreachOperations,
  prepareOutreachBatch,
  scanOutreachReplies,
  setOutreachSending,
} from "../outreachControls";

const optionalNotes = z.string().trim().max(4000).nullable().optional();
const nullableDate = z.date().nullable().optional();

export const chamberRouter = router({
  workspace: publicProcedure.query(() => getChamberWorkspace()),

  outreachWorkspace: publicProcedure.query(() => getChamberOutreachWorkspace()),

  /** Public, deployment-scoped operational status for the Chamber sender. */
  outreachOperations: publicProcedure.query(() => getOutreachOperations()),

  /** Pauses/resumes only the persisted Chamber daily sender heartbeat. */
  setOutreachSending: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => setOutreachSending(input)),

  /** Creates/refreshes at most five approved drafts; never sends email. */
  prepareOutreachBatch: publicProcedure.mutation(() => prepareOutreachBatch()),

  /** Scans reply state only; it never invokes an SMTP sender. */
  scanOutreachReplies: publicProcedure.mutation(() => scanOutreachReplies()),

  updateOutreachCampaign: publicProcedure
    .input(
      z.object({
        status: z.enum(["review", "paused"]).optional(),
        physicalPostalAddress: z
          .string()
          .trim()
          .min(10)
          .max(500)
          .nullable()
          .optional(),
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      await updateOutreachCampaign(input);
      return { success: true } as const;
    }),

  approveOutreachSequence: publicProcedure
    .input(z.object({ prospectId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await approveProspectSequence(input.prospectId);
      return { success: true } as const;
    }),

  updateOutreachProspect: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum([
            "queued",
            "researching",
            "review",
            "approved",
            "in_sequence",
            "replied",
            "unsubscribed",
            "bounced",
            "meeting",
            "not_fit",
            "complete",
          ])
          .optional(),
        manualNotes: optionalNotes,
        contactName: z.string().trim().max(1000).nullable().optional(),
        contactFirstName: z.string().trim().max(100).nullable().optional(),
        email: z.string().trim().email().max(320).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updateOutreachProspect(input);
      return { success: true } as const;
    }),

  suppressOutreachEmail: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      await upsertSuppression({
        email: input.email,
        reason: "manual",
        source: "chamber_growth_portal",
        notes: input.notes,
      });
      return { success: true } as const;
    }),

  updateBenefit: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum(["not_started", "scheduled", "in_progress", "complete"])
          .optional(),
        used: z.number().int().min(0).max(100).optional(),
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...values } = input;
      await updateChamberBenefit(id, values);
      return { success: true } as const;
    }),

  updateAction: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum(["not_started", "in_progress", "blocked", "complete"])
          .optional(),
        owner: z.string().trim().min(2).max(100).optional(),
        dueDate: nullableDate,
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...values } = input;
      await updateChamberAction(id, values);
      return { success: true } as const;
    }),

  updateEvent: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum(["considering", "planned", "attended", "skipped"])
          .optional(),
        contactsCount: z.number().int().min(0).max(1000).optional(),
        meetingsBooked: z.number().int().min(0).max(1000).optional(),
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...values } = input;
      await updateChamberEvent(id, values);
      return { success: true } as const;
    }),

  updateProspect: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        stage: z
          .enum([
            "identified",
            "researching",
            "contacted",
            "meeting",
            "brand_refresh_proposal",
            "brand_refresh_client",
            "monthly_conversation",
            "monthly_client",
            "nurture",
            "not_fit",
          ])
          .optional(),
        contactPerson: z.string().trim().max(1000).nullable().optional(),
        email: z.string().trim().max(1000).nullable().optional(),
        phone: z.string().trim().max(160).nullable().optional(),
        lastContact: nullableDate,
        nextFollowup: nullableDate,
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...values } = input;
      await updateChamberProspect(id, values);
      return { success: true } as const;
    }),

  saveWeeklyScore: publicProcedure
    .input(
      z.object({
        weekStart: z.date(),
        eventsAttended: z.number().int().min(0).max(1000),
        targetConversations: z.number().int().min(0).max(1000),
        decisionMakersFound: z.number().int().min(0).max(1000),
        followupsCompleted: z.number().int().min(0).max(1000),
        meetingsBooked: z.number().int().min(0).max(1000),
        brandRefreshProposals: z.number().int().min(0).max(1000),
        brandRefreshClients: z.number().int().min(0).max(1000),
        monthlyConversations: z.number().int().min(0).max(1000),
        monthlyClients: z.number().int().min(0).max(1000),
        notes: optionalNotes,
      })
    )
    .mutation(async ({ input }) => {
      await upsertChamberWeeklyScore(input);
      return { success: true } as const;
    }),
});
