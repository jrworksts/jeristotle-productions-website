import { z } from "zod";
import {
  getTrainingWorkspace,
  updateTrainingProspect,
} from "../trainingOutreach";
import {
  getTrainingOperations,
  prepareTrainingBatch,
  scanTrainingReplies,
  setTrainingSending,
  updateTrainingLeadOutcome,
} from "../trainingControls";
import { unsubscribeTrainingByToken } from "../trainingSendingDb";
import { TRAINING_PROSPECT_STATUSES } from "../../shared/trainingOutreach";
import { publicProcedure, router } from "../_core/trpc";

const optionalNotes = z.string().trim().max(4_000).nullable().optional();

/**
 * Existing Growth Hub is unauthenticated. Every mutating operation remains fixed
 * to the sole Training campaign and never accepts a task UID, callback path,
 * recipient, or cadence from the client.
 */
export const trainingRouter = router({
  workspace: publicProcedure.query(() => getTrainingWorkspace()),
  operations: publicProcedure.query(() => getTrainingOperations()),
  prepareReserve: publicProcedure.mutation(() => prepareTrainingBatch()),
  scanInbox: publicProcedure.mutation(() => scanTrainingReplies()),
  setSending: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => setTrainingSending(input)),
  updateProspect: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(TRAINING_PROSPECT_STATUSES).optional(),
        manualNotes: optionalNotes,
      })
    )
    .mutation(({ input }) => updateTrainingProspect(input)),
  updateLeadOutcome: publicProcedure
    .input(
      z
        .object({
          prospectId: z.number().int().positive(),
          leadOutcome: z.enum(["closed", "not_closed"]).nullable(),
          notClosedReason: z.string().trim().max(4_000).nullable().optional(),
        })
        .superRefine((input, ctx) => {
          const reason = input.notClosedReason?.trim() || "";
          if (input.leadOutcome === "not_closed" && !reason)
            ctx.addIssue({
              code: "custom",
              path: ["notClosedReason"],
              message: "A reason is required for Not Closed.",
            });
          if (input.leadOutcome !== "not_closed" && reason)
            ctx.addIssue({
              code: "custom",
              path: ["notClosedReason"],
              message: "Not Closed reason is allowed only for Not Closed.",
            });
        })
    )
    .mutation(({ input }) => updateTrainingLeadOutcome(input)),
  /** UI/API opt-out mutation. The parent-owned page must call this only after POST confirmation. */
  unsubscribe: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(async ({ input }) => ({
      success: await unsubscribeTrainingByToken(input.token),
    })),
});
