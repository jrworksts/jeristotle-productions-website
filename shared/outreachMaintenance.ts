import { isOutreachResearchWindow } from "./outreachResearchWindow";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET, OUTREACH_INITIAL_REFILL_START_BELOW } from "./outboundReplenishmentPolicy";

// Replenishment never changes the ten-new-per-day sending limit.
export const OUTREACH_DAILY_NEW_CONTACT_LIMIT = 10;
export const OUTREACH_READY_BUFFER_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
export const OUTREACH_REFILL_START_BELOW = OUTREACH_INITIAL_REFILL_START_BELOW;
export const OUTREACH_PREPARATION_BATCH_LIMIT = 5;
// Retain the daytime constant for other campaigns that share it.
export const OUTREACH_MAINTENANCE_CRON = "0 0,30 13-23 * * *";
// Retain all daytime ticks; request code alone gates bounded research to 01:00–05:59 Central.
export const OUTREACH_NIGHTLY_MAINTENANCE_CRON = "0 0,30 6-11,13-23 * * *";
export const OUTREACH_PREVIOUS_WEEKDAY_CRON = "0 0,30 13-23 * * 1-5";
export const OUTREACH_LEGACY_CRON = "0 0 13,14,15 * * 1-5";

/** Next canonical on-hour tick inside the actual research gate, including both fall-back hours. */
export function getNextOutreachResearchAt(now: Date): Date {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Cannot calculate a research schedule for an invalid date");
  }
  const firstDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  for (let offset = 0; offset < 3; offset += 1) {
    for (const hour of [6, 7, 8, 9, 10, 11]) {
      const tick = new Date(firstDay + offset * 86_400_000 + hour * 3_600_000);
      if (tick > now && isOutreachResearchWindow(tick)) return tick;
    }
  }
  throw new Error("Could not calculate the next Central research window");
}

export function isOutreachMaintenanceWindow(moment: {
  isBusinessDay: boolean;
  hour: number;
}) {
  return moment.hour >= 8 && moment.hour <= 17;
}
