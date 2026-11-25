export const OUTREACH_TIME_ZONE = "America/Chicago";

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function getOutreachLocalMoment(
  date: Date,
  timeZone = OUTREACH_TIME_ZONE
) {
  const parts = localParts(date, timeZone);
  return {
    ...parts,
    dateKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    isBusinessDay: !["Saturday", "Sunday"].includes(parts.weekday),
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
) {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const represented = localParts(new Date(guess), timeZone);
  const representedUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
    0
  );
  return new Date(guess - (representedUtc - guess));
}

export function getNextFollowupAt(
  lastSentAt: Date,
  delayDays = 3,
  sendHour = 9,
  timeZone = OUTREACH_TIME_ZONE
) {
  const local = localParts(lastSentAt, timeZone);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  target.setUTCDate(target.getUTCDate() + delayDays);
  while ([0, 6].includes(target.getUTCDay())) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return zonedDateTimeToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    sendHour,
    timeZone
  );
}

export function getCentralWeekWindow(now: Date) {
  const local = localParts(now, OUTREACH_TIME_ZONE);
  const anchor = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceSunday = anchor.getUTCDay();
  const start = new Date(anchor);
  start.setUTCDate(anchor.getUTCDate() - daysSinceSunday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return {
    start: zonedDateTimeToUtc(
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate(),
      0,
      OUTREACH_TIME_ZONE
    ),
    end: zonedDateTimeToUtc(
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      end.getUTCDate(),
      0,
      OUTREACH_TIME_ZONE
    ),
  };
}
