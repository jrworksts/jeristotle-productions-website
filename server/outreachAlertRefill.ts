import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";

function matches(field: string, value: number): boolean {
  return field.split(",").some(part => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step <= 0) return false;
    if (range === "*") return value % step === 0;
    const [start, end] = range.split("-").map(Number);
    if (!Number.isInteger(start)) return false;
    if (end === undefined) return value === start;
    return (
      Number.isInteger(end) &&
      value >= start &&
      value <= end &&
      (value - start) % step === 0
    );
  });
}

/** An opportunity, not a completion promise. Only live bound enabled-cron ticks are used. */
export function nextOutreachAlertRefillOpportunity(
  cron: string | null,
  now: Date,
  leaseUntil?: Date | null
): Date | null {
  const fields = cron?.trim().split(/\s+/);
  if (
    !fields ||
    fields.length !== 6 ||
    fields[0] !== "0" ||
    !Number.isFinite(now.getTime())
  )
    return null;
  const earliest = Math.max(now.getTime(), leaseUntil?.getTime() || 0);
  if (!Number.isFinite(earliest)) return null;
  const first = Math.floor(earliest / 60000) * 60000 + 60000;
  for (let tick = first; tick < first + 8 * 86400000; tick += 60000) {
    const date = new Date(tick);
    if (
      matches(fields[1], date.getUTCMinutes()) &&
      matches(fields[2], date.getUTCHours()) &&
      matches(fields[3], date.getUTCDate()) &&
      matches(fields[4], date.getUTCMonth() + 1) &&
      matches(fields[5], date.getUTCDay()) &&
      isOutreachResearchWindow(date)
    )
      return date;
  }
  return null;
}
