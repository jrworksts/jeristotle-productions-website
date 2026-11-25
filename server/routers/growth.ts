import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getGrowthWorkspace,
  saveGrowthDailyCheck,
  updateGrowthTask,
} from "../growthDb";
import { isValidGrowthDate } from "../../shared/growthChecklist";
import { getGrowthReminderStatus } from "../growthReminderStatus";

const localDate = z
  .string()
  .refine(isValidGrowthDate, "Use a valid YYYY-MM-DD date.");
export const growthRouter = router({
  reminderStatus: publicProcedure.query(() => getGrowthReminderStatus()),
  workspace: publicProcedure
    .input(z.object({ localDate: localDate.optional() }).optional())
    .query(({ input }) => getGrowthWorkspace(input?.localDate)),
  updateTask: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z
          .enum(["not_started", "in_progress", "blocked", "complete"])
          .optional(),
        owner: z.string().trim().min(2).max(100).optional(),
        dueDate: z.date().nullable().optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...values } = input;
      return updateGrowthTask(id, values);
    }),
  saveDailyCheck: publicProcedure
    .input(
      z.object({
        localDate,
        routineSlug: z.string().trim().min(1).max(100),
        complete: z.boolean().optional(),
        notes: z.string().trim().max(4000).nullable().optional(),
      })
    )
    .mutation(({ input }) => saveGrowthDailyCheck(input)),
});
