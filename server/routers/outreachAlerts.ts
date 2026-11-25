import { publicProcedure, router } from "../_core/trpc";
import { getOutreachAlertsStatus } from "../outreachAlerts";
/** Same team-only-link model as the existing Growth Hub; no send/config mutation. */
export const outreachAlertsRouter = router({
  status: publicProcedure.query(() => getOutreachAlertsStatus()),
});
