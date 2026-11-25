import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SECTOR_KEYS } from "../../shared/sectorOutreach";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getSectorDraftWorkspace,
  updateSectorReviewNotes,
} from "../sectorOutreachDb";
import { getSectorRuntimeWorkspace } from "../sectorRuntimeDb";

const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ENV.ownerOpenId || ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the project owner can review sector outreach drafts.",
    });
  }
  return next({ ctx });
});

/** Notes are review feedback only. There is deliberately no approval/activation route. */
export const sectorRouter = router({
  workspace: ownerProcedure.query(() => getSectorDraftWorkspace()),
  liveWorkspace: ownerProcedure.query(() => getSectorRuntimeWorkspace()),
  saveReviewNotes: ownerProcedure
    .input(
      z
        .object({ key: z.enum(SECTOR_KEYS), notes: z.string().max(4000) })
        .strict()
    )
    .mutation(({ input }) =>
      updateSectorReviewNotes({
        campaignKey: input.key,
        reviewNotes: input.notes,
      })
    ),
});
