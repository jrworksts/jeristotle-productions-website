export type EventFormat = "in-person" | "online-live";
export type EventSection = "networking" | "learning";
export type EventRating = "High" | "Medium" | "Low";

export interface NewsletterEvent {
  title: string;
  date: string; // YYYY-MM-DD, America/Chicago calendar day
  time: string; // Verified Central-time display text, e.g. "6:00–8:00 PM CT"
  format: EventFormat;
  section: EventSection;
  location: string;
  fee: string; // "Free", "$15", or "Not listed"
  source: string;
  opportunity: EventRating;
  audience: string;
  why: string;
  prepare: string;
  openerOrTakeaway: string;
  followUp?: string;
  eventUrl: string;
  registerUrl?: string;
  registrationNote?: string;
}

export interface NewsletterToDo {
  taskId: number;
  title: string;
  detail: string;
  status: "not_started" | "in_progress" | "blocked";
  timing: string;
}

export interface NewsletterToDos {
  asOf: string; // Verified Growth Hub snapshot date, YYYY-MM-DD
  items: NewsletterToDo[];
  note: string;
}

export interface NewsletterIssue {
  weekStart: string; // Sunday, YYYY-MM-DD, America/Chicago
  events: NewsletterEvent[];
  note?: string;
  progress?: { label: string; detail: string };
  toDos?: NewsletterToDos;
  motivation?: { title: string; url: string; application: string };
}

const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663569963942/ILnVCcHNKYfXrFtM.png";
const GOLD = "#ffb627";
// /chamber-growth defaults to the verified "today" section; #plan is not valid.
const GROWTH_HUB_URL = "https://jeristotleproductions.com/chamber-growth";
const TO_DO_STATUS_LABELS: Record<NewsletterToDo["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
};
const safe = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const dateAtUtcNoon = (isoDate: string) => new Date(`${isoDate}T12:00:00.000Z`);

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eventStartMinutes(time: string) {
  const match = time.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return Number.POSITIVE_INFINITY;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = time.match(/\b(AM|PM)\b/i)?.[1]?.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour < 12) hour += 12;
  return hour * 60 + minute;
}

function validateToDos(toDos: NewsletterToDos) {
  if (!toDos || typeof toDos !== "object" || Array.isArray(toDos)) {
    throw new Error("toDos must be an object");
  }
  if (
    typeof toDos.asOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDos.asOf)
  ) {
    throw new Error("toDos.asOf must be a valid YYYY-MM-DD date");
  }
  const asOf = dateAtUtcNoon(toDos.asOf);
  if (
    Number.isNaN(asOf.getTime()) ||
    asOf.toISOString().slice(0, 10) !== toDos.asOf
  ) {
    throw new Error("toDos.asOf must be a valid YYYY-MM-DD date");
  }
  if (!Array.isArray(toDos.items) || toDos.items.length > 3) {
    throw new Error("toDos.items must be an array with at most 3 items");
  }
  const requiredText = (value: unknown, field: string, limit: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > limit) {
      throw new Error(
        `${field} must be nonblank text of at most ${limit} characters`
      );
    }
  };
  requiredText(toDos.note, "toDos.note", 700);
  const seen = new Set<number>();
  for (const item of toDos.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Every toDos item must be an object");
    }
    if (!Number.isSafeInteger(item.taskId) || item.taskId <= 0) {
      throw new Error("Every toDos taskId must be a positive integer");
    }
    if (seen.has(item.taskId)) {
      throw new Error(`Duplicate toDos taskId: ${item.taskId}`);
    }
    seen.add(item.taskId);
    requiredText(item.title, "toDos.title", 220);
    requiredText(item.detail, "toDos.detail", 700);
    requiredText(item.timing, "toDos.timing", 200);
    if (!["not_started", "in_progress", "blocked"].includes(item.status)) {
      throw new Error(
        "toDos.status must be not_started, in_progress, or blocked"
      );
    }
  }
}

export function validateNewsletterIssue(
  issue: NewsletterIssue
): NewsletterIssue {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.weekStart)) {
    throw new Error("weekStart must be YYYY-MM-DD");
  }
  const firstDay = dateAtUtcNoon(issue.weekStart);
  if (
    Number.isNaN(firstDay.getTime()) ||
    firstDay.toISOString().slice(0, 10) !== issue.weekStart ||
    firstDay.getUTCDay() !== 0
  ) {
    throw new Error("weekStart must be a valid Sunday");
  }
  if (!Array.isArray(issue.events) || issue.events.length > 12) {
    throw new Error("events must be an array with at most 12 items");
  }
  if (issue.toDos !== undefined) validateToDos(issue.toDos);
  if (
    issue.progress &&
    (!issue.progress.label?.trim() || !issue.progress.detail?.trim())
  ) {
    throw new Error("Progress needs a label and verified detail");
  }
  if (issue.motivation) {
    if (
      !issue.motivation.title?.trim() ||
      !issue.motivation.application?.trim()
    ) {
      throw new Error("Motivational video needs a title and application");
    }
    const videoUrl = new URL(issue.motivation.url);
    if (
      videoUrl.protocol !== "https:" ||
      videoUrl.username ||
      videoUrl.password
    ) {
      throw new Error(
        "Motivational video links must use HTTPS without credentials"
      );
    }
  }
  const seen = new Set<string>();
  const events = issue.events.map(event => {
    for (const field of [
      "title",
      "date",
      "time",
      "location",
      "fee",
      "source",
      "audience",
      "why",
      "prepare",
      "openerOrTakeaway",
      "eventUrl",
    ] as const) {
      if (!event[field] || typeof event[field] !== "string") {
        throw new Error(`${field} is required for every event`);
      }
    }
    if (
      !["in-person", "online-live"].includes(event.format) ||
      !["networking", "learning"].includes(event.section) ||
      !["High", "Medium", "Low"].includes(event.opportunity)
    ) {
      throw new Error(
        `Invalid format, section, or opportunity for ${event.title}`
      );
    }
    if (event.section === "learning" && event.format !== "online-live") {
      throw new Error(
        `Learning section is for live online sessions: ${event.title}`
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
      throw new Error(`Invalid date for ${event.title}`);
    }
    const date = dateAtUtcNoon(event.date);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== event.date ||
      date < firstDay ||
      date.getTime() - firstDay.getTime() >= 7 * 86400000
    ) {
      throw new Error(
        `${event.title} is outside the Sunday–Saturday issue week`
      );
    }
    for (const link of [event.eventUrl, event.registerUrl].filter(Boolean)) {
      const parsed = new URL(link!);
      if (parsed.protocol !== "https:") {
        throw new Error(`Event links must use HTTPS: ${event.title}`);
      }
    }
    const key = `${normalizeTitle(event.title)}|${event.date}|${event.time.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`Duplicate event: ${event.title}`);
    seen.add(key);
    return event;
  });
  events.sort((a, b) =>
    a.date === b.date
      ? eventStartMinutes(a.time) - eventStartMinutes(b.time) ||
        a.time.localeCompare(b.time)
      : a.date.localeCompare(b.date)
  );
  return { ...issue, events };
}

function toDosSection(toDos: NewsletterToDos): string {
  return `<tr><td style="padding:18px 28px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#faf8f2;border:1px solid #d8d0bd;">
      <tr><td style="padding:15px 18px;background:#111111;border-left:4px solid ${GOLD};">
        <h2 style="margin:0;color:#fffaf0;font-size:20px;line-height:1.2;">This week’s practical to-dos</h2>
        <p style="margin:7px 0 0;color:${GOLD};font-size:11px;line-height:1.5;">Current Growth Hub state &nbsp;·&nbsp; As of ${safe(toDos.asOf)}</p>
      </td></tr>
      ${
        toDos.items.length
          ? toDos.items
              .map(
                item => `<tr><td style="padding:13px 18px;background:#faf8f2;border-bottom:1px solid #e4dfd3;">
        <h3 style="margin:0;color:#151515;font-size:15px;line-height:1.4;">${safe(item.title)}</h3>
        <p style="margin:5px 0 0;color:#91600a;font-size:11px;line-height:1.5;">Task #${safe(String(item.taskId))} &nbsp;·&nbsp; Current state: ${safe(TO_DO_STATUS_LABELS[item.status])}</p>
        <p style="margin:6px 0 0;color:#36332f;font-size:13px;line-height:1.5;">${safe(item.detail)}</p>
        <p style="margin:6px 0 0;color:#5c5750;font-size:12px;line-height:1.5;"><strong>Timing:</strong> ${safe(item.timing)}</p>
      </td></tr>`
              )
              .join("\n")
          : `<tr><td style="padding:13px 18px;background:#faf8f2;color:#36332f;font-size:13px;line-height:1.5;">No current actionable tasks were verified.</td></tr>`
      }
      <tr><td style="padding:13px 18px;background:#faf8f2;">
        <p style="margin:0;color:#5c5750;font-size:12px;line-height:1.5;"><strong>Note:</strong> ${safe(toDos.note)}</p>
        <p style="margin:6px 0 0;color:#5c5750;font-size:12px;line-height:1.5;">Keep to one task per day.</p>
        <p style="margin:10px 0 0;font-size:12px;line-height:1.5;"><a href="${GROWTH_HUB_URL}" style="color:#91600a;font-weight:800;text-decoration:underline;">Open Growth Hub →</a></p>
      </td></tr>
    </table>
  </td></tr>`;
}

function eventCard(event: NewsletterEvent): string {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dateAtUtcNoon(event.date));
  const label = event.registerUrl
    ? "REGISTER / DETAILS →"
    : "EVENT / REGISTRATION →";
  const href = event.registerUrl || event.eventUrl;
  return `<tr><td style="padding:0 28px 18px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;border:1px solid #e4dfd3;border-left:4px solid ${GOLD};">
      <tr><td style="padding:22px 23px 2px;">
        <p style="margin:0 0 11px;color:#91600a;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">${safe(date)} &nbsp;·&nbsp; ${safe(event.time)}</p>
        <h3 style="margin:0;color:#151515;font-size:23px;line-height:1.16;letter-spacing:-0.4px;">${safe(event.title)}</h3>
        <p style="margin:10px 0 0;color:#5c5750;font-size:13px;line-height:1.55;">${safe(event.location)} &nbsp;·&nbsp; ${safe(event.fee)} &nbsp;·&nbsp; ${event.format === "in-person" ? "In person" : "Live online"}</p>
        <p style="margin:14px 0 0;color:#2e2c28;font-size:14px;line-height:1.55;">${safe(event.why)}</p>
        <p style="margin:12px 0 0;color:#5c5750;font-size:13px;line-height:1.5;"><strong>Who to meet / learn from:</strong> ${safe(event.audience)}</p>
        <p style="margin:8px 0 0;color:#5c5750;font-size:13px;line-height:1.5;"><strong>Go prepared:</strong> ${safe(event.prepare)}</p>
        <p style="margin:8px 0 0;color:#5c5750;font-size:13px;line-height:1.5;"><strong>${event.section === "learning" ? "Put it to work" : "Conversation opener"}:</strong> ${safe(event.openerOrTakeaway)}</p>
        ${event.followUp ? `<p style="margin:8px 0 0;color:#5c5750;font-size:13px;line-height:1.5;"><strong>48-hour follow-up:</strong> ${safe(event.followUp)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:18px 23px 22px;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${GOLD}" style="background:${GOLD};"><a href="${safe(href)}" style="display:inline-block;padding:12px 17px;color:#101010;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:0.9px;">${label}</a></td></tr></table>
        <p style="margin:12px 0 0;color:#8a857c;font-size:11px;line-height:1.45;">${safe(event.source)} &nbsp;·&nbsp; ${safe(event.opportunity)} priority${event.registrationNote ? ` &nbsp;·&nbsp; ${safe(event.registrationNote)}` : ""}</p>
      </td></tr>
    </table>
  </td></tr>`;
}

export function buildEventsNewsletter(rawIssue: NewsletterIssue) {
  const issue = validateNewsletterIssue(rawIssue);
  const first = dateAtUtcNoon(issue.weekStart);
  const last = new Date(first.getTime() + 6 * 86400000);
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const yearFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });
  const range = `${dateFmt.format(first)}–${dateFmt.format(last)}, ${yearFmt.format(last)}`;
  const networking = issue.events.filter(e => e.section === "networking");
  const learning = issue.events.filter(e => e.section === "learning");
  const subject = `Jeristotle weekly events | ${range}`;
  const section = (
    title: string,
    subtitle: string,
    events: NewsletterEvent[]
  ) =>
    events.length
      ? `<tr><td style="padding:14px 28px 14px;"><p style="margin:0;color:#91600a;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${safe(subtitle)}</p><h2 style="margin:6px 0 0;color:#151515;font-size:25px;line-height:1.15;">${safe(title)}</h2></td></tr>${events.map(eventCard).join("\n")}`
      : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(subject)}</title></head>
<body style="margin:0;padding:0;background:#eeeae1;color:#151515;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#eeeae1;padding:20px 8px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#faf8f2;border:1px solid #d8d0bd;">
<tr><td style="background:#111111;border-top:6px solid ${GOLD};padding:22px 28px 26px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="50" style="vertical-align:middle;"><img src="${LOGO_URL}" width="38" height="38" alt="J" style="display:block;width:38px;height:38px;border:0;"></td><td style="vertical-align:middle;color:#faf6ec;font-size:13px;font-weight:800;letter-spacing:1.6px;">JERISTOTLE<br><span style="color:${GOLD};font-size:9px;letter-spacing:2.6px;">PRODUCTIONS</span></td></tr></table>
<p style="margin:29px 0 8px;color:${GOLD};font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">The Sunday edit &nbsp;/&nbsp; ${safe(range)}</p>
<h1 style="margin:0;color:#fffaf0;font-size:36px;line-height:1.04;letter-spacing:-0.8px;">Where to show up<br><span style="color:${GOLD};">this week.</span></h1>
<p style="margin:13px 0 0;color:#c9c5bb;font-size:14px;line-height:1.55;">A focused lineup of rooms to meet future collaborators and clients, plus live sessions worth learning from.</p>
</td></tr>
${issue.progress ? `<tr><td style="padding:18px 28px 0;"><p style="margin:0;padding:15px 18px;background:#fff5de;border-left:4px solid ${GOLD};color:#50442c;font-size:13px;line-height:1.55;"><strong>${safe(issue.progress.label)}:</strong> ${safe(issue.progress.detail)}</p></td></tr>` : ""}
${issue.toDos ? toDosSection(issue.toDos) : ""}
<tr><td style="padding:18px 28px 6px;"><p style="margin:0;color:#58534a;font-size:13px;line-height:1.6;">${networking.length} in-person networking ${networking.length === 1 ? "pick" : "picks"} &nbsp;•&nbsp; ${learning.length} live online ${learning.length === 1 ? "session" : "sessions"}. All times Central. Check the event page before traveling or registering.</p></td></tr>
${issue.events.length ? `${section("Meet the right people", "In person · relationship building", networking)}${section("Learn and apply", "Live online · business growth", learning)}` : `<tr><td style="padding:22px 28px 28px;color:#36332f;font-size:15px;line-height:1.6;">No qualifying events were confirmed for this week. We checked our local networking and live-learning calendars and will look again next Sunday.</td></tr>`}
${issue.note ? `<tr><td style="padding:4px 28px 22px;"><p style="margin:0;padding:15px 18px;background:#fff5de;border-left:4px solid ${GOLD};color:#50442c;font-size:13px;line-height:1.55;"><strong>Plan ahead:</strong> ${safe(issue.note)}</p></td></tr>` : ""}
${issue.motivation ? `<tr><td style="padding:4px 28px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#111111;"><tr><td style="padding:22px 23px;"><p style="margin:0 0 9px;color:${GOLD};font-size:10px;font-weight:800;letter-spacing:1.6px;">THIS WEEK'S MOTIVATION</p><h2 style="margin:0;color:#fffaf0;font-size:23px;line-height:1.2;">${safe(issue.motivation.title)}</h2><p style="margin:12px 0 16px;color:#c9c5bb;font-size:13px;line-height:1.55;">${safe(issue.motivation.application)}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${GOLD}" style="background:${GOLD};"><a href="${safe(issue.motivation.url)}" style="display:inline-block;padding:12px 17px;color:#101010;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:0.9px;">WATCH VIDEO →</a></td></tr></table></td></tr></table></td></tr>` : ""}
<tr><td style="padding:20px 28px 25px;background:#111111;color:#aaa69c;font-size:11px;line-height:1.6;">Movie-level content production for small businesses.<br>Curated from the United Corpus Christi Chamber, UTSA SBDC, Young Professionals of the Coastal Bend, Corpus Christi Events Calendar, and SCORE. Dates and availability can change; confirm with each organizer. This editorial priority is not a promise of attendance or business outcomes.<br><span style="color:${GOLD};">Jeristotle Productions · Corpus Christi, Texas</span></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "JERISTOTLE PRODUCTIONS | THE SUNDAY EDIT",
    `Where to show up this week: ${range} (Central time)`,
    ...(issue.progress
      ? [`${issue.progress.label}: ${issue.progress.detail}`]
      : []),
    ...(issue.toDos
      ? [
          "",
          "This week’s practical to-dos",
          `Current Growth Hub state | As of ${issue.toDos.asOf}`,
          ...(!issue.toDos.items.length
            ? ["No current actionable tasks were verified."]
            : issue.toDos.items.flatMap(item => [
                `Task #${item.taskId} | ${item.title}`,
                `Current state: ${TO_DO_STATUS_LABELS[item.status]}`,
                item.detail,
                `Timing: ${item.timing}`,
              ])),
          `Note: ${issue.toDos.note}`,
          "Keep to one task per day.",
          `Open Growth Hub: ${GROWTH_HUB_URL}`,
          "",
        ]
      : []),
    `${networking.length} in-person networking picks; ${learning.length} live online sessions`,
    "",
    ...issue.events.flatMap(event => [
      `${event.section === "networking" ? "MEET" : "LEARN"} | ${event.title}`,
      `${event.date} | ${event.time} | ${event.location} | ${event.fee}`,
      `${event.opportunity} priority | ${event.source}`,
      `Why: ${event.why}`,
      `Who / topic: ${event.audience}`,
      `Prepare: ${event.prepare}`,
      `${event.section === "learning" ? "Apply" : "Conversation"}: ${event.openerOrTakeaway}`,
      ...(event.followUp ? [`48-hour follow-up: ${event.followUp}`] : []),
      `${event.registerUrl ? "Register" : "Event / registration"}: ${event.registerUrl || event.eventUrl}`,
      ...(event.registrationNote
        ? [`Registration note: ${event.registrationNote}`]
        : []),
      "",
    ]),
    ...(issue.events.length
      ? []
      : ["No qualifying events were confirmed for this week.", ""]),
    ...(issue.note ? [`Plan ahead: ${issue.note}`, ""] : []),
    ...(issue.motivation
      ? [
          "THIS WEEK'S MOTIVATION",
          issue.motivation.title,
          issue.motivation.application,
          `Watch: ${issue.motivation.url}`,
          "",
        ]
      : []),
    "Verify details with the organizer before attending. No outcomes are guaranteed.",
  ].join("\n");
  return { subject, html, text, issue };
}
