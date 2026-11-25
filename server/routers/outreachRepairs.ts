import { publicProcedure, router } from "../_core/trpc";
import release from "../../shared/outreachRepairRelease.json";

/** Non-sensitive build receipt only. No campaign data, SMTP, inbox or schedule actions. */
export const outreachRepairsRouter = router({
  version: publicProcedure.query(() => ({ ...release, production: process.env.NODE_ENV === "production" })),
});
