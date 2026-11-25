import { getOutreachLocalMoment } from "./outreachSchedule";
import { OUTREACH_RESEARCH_START_HOUR, OUTREACH_RESEARCH_END_HOUR } from "./outboundReplenishmentPolicy";

/** Research requests only: daily 01:00–05:59:59.999 America/Chicago, DST-aware.
 * Existing jobs still START at 1 AM. This is dispatch tolerance, not daytime research authorization.
 * Claim dedupe, company-call budgets, cooldowns and leases remain separate required gates.
 */
export function isOutreachResearchWindow(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const { hour } = getOutreachLocalMoment(now, "America/Chicago");
  return hour >= OUTREACH_RESEARCH_START_HOUR && hour <= OUTREACH_RESEARCH_END_HOUR;
}
