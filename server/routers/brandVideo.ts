import { z } from "zod";
import {
  getBrandVideoWorkspace,
  updateBrandVideoProspect,
} from "../brandVideoOutreach";
import { publicProcedure, router } from "../_core/trpc";
import {
  authorizeBrandVideoLaunch,
  getBrandVideoOperations,
  prepareBrandVideoBatch,
  scanBrandVideoReplies,
  setBrandVideoSending,
} from "../brandVideoControls";
import { unsubscribeBrandVideoByToken } from "../brandVideoSendingDb";

const optionalNotes = z.string().trim().max(4_000).nullable().optional();

/**
 * Fixed-scope controls match the existing no-login Growth Hub. No immediate send
 * operation exists: activation schedules future work only after deployed-runtime preflight.
 */
export const brandVideoRouter = router({
  workspace: publicProcedure.query(() => getBrandVideoWorkspace()),
  operations: publicProcedure.query(() => getBrandVideoOperations()),
  authorize: publicProcedure.mutation(() => authorizeBrandVideoLaunch()),
  prepareBatch: publicProcedure.mutation(() => prepareBrandVideoBatch()),
  scanReplies: publicProcedure.mutation(() => scanBrandVideoReplies()),
  setSending: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => setBrandVideoSending(input)),
  unsubscribe: publicProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{48}$/i) }))
    .mutation(async ({ input }) => ({
      success: await unsubscribeBrandVideoByToken(input.token),
    })),
  updateProspect: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["review", "approved", "not_fit"]).optional(),
        manualNotes: optionalNotes,
      })
    )
    .mutation(({ input }) => updateBrandVideoProspect(input)),
});
