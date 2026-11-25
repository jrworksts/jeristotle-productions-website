import { z } from "zod";
import {
  approveCreditUnionSequence,
  getCreditUnionWorkspace,
  recordCreditUnionEvent,
  unsubscribeCreditUnionByToken,
  updateCreditUnionCampaign,
  updateCreditUnionProspect,
} from "../creditUnionOutreach";
import { publicProcedure, router } from "../_core/trpc";
import {
  getCreditUnionOperations,
  prepareCreditUnionBatch,
  scanCreditUnionReplies,
  setCreditUnionSending,
} from "../creditUnionControls";
import { OUTREACH_DAILY_NEW_CONTACT_LIMIT } from "../../shared/outreachMaintenance";

const optionalNotes = z.string().trim().max(4_000).nullable().optional();
const optionalUrl = z.string().trim().url().max(500).nullable().optional();

/**
 * Public for the existing no-login Growth Hub. Sending controls are fixed to
 * this campaign and schedule future work, never an immediate manual send.
 */
export const creditUnionRouter = router({
  workspace: publicProcedure.query(() => getCreditUnionWorkspace()),
  operations: publicProcedure.query(() => getCreditUnionOperations()),
  prepareBatch: publicProcedure.mutation(() => prepareCreditUnionBatch()),
  scanReplies: publicProcedure.mutation(() => scanCreditUnionReplies()),
  setSending: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => setCreditUnionSending(input)),

  updateCampaign: publicProcedure
    .input(
      z.object({
        dailyNewLimit: z.literal(OUTREACH_DAILY_NEW_CONTACT_LIMIT).optional(),
        sendHourLocal: z.literal(9).optional(),
        timezone: z.literal("America/Chicago").optional(),
        physicalPostalAddress: z.string().trim().min(10).max(500).optional(),
        notes: optionalNotes,
      })
    )
    .mutation(({ input }) => updateCreditUnionCampaign(input)),

  updateProspect: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum([
            "review",
            "verification_needed",
            "approved",
            "replied",
            "unsubscribed",
            "bounced",
            "meeting",
            "consultation_complete",
            "qualified_opportunity",
            "not_fit",
            "complete",
          ])
          .optional(),
        manualNotes: optionalNotes,
        primaryContactName: z.string().trim().max(180).nullable().optional(),
        primaryContactTitle: z.string().trim().max(220).nullable().optional(),
        primaryEmail: z.string().trim().email().max(320).nullable().optional(),
        emailConfidence: z
          .enum([
            "officially_published",
            "independently_verified",
            "unverified",
            "not_found",
          ])
          .optional(),
        primaryEmailSourceUrl: optionalUrl,
        primaryRoleSourceUrl: optionalUrl,
      })
    )
    .mutation(({ input }) => updateCreditUnionProspect(input)),

  approveSequence: publicProcedure
    .input(z.object({ prospectId: z.number().int().positive() }))
    .mutation(({ input }) => approveCreditUnionSequence(input.prospectId)),

  recordEvent: publicProcedure
    .input(
      z.object({
        prospectId: z.number().int().positive(),
        messageId: z.number().int().positive().nullable().optional(),
        eventType: z.enum([
          "reply",
          "positive_reply",
          "unsubscribed",
          "bounced",
          "meeting",
          "consultation_complete",
          "qualified_opportunity",
          "outcome_not_fit",
        ]),
        detail: optionalNotes,
        occurredAt: z.date().optional(),
      })
    )
    .mutation(({ input }) => recordCreditUnionEvent(input)),

  /**
   * Token opt-out is a mutation. The parent-owned confirmation page must invoke
   * it only after an explicit user click—not automatically on GET/render.
   */
  unsubscribe: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(async ({ input }) => ({
      success: await unsubscribeCreditUnionByToken(input.token),
    })),
});
