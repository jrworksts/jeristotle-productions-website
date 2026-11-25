import { getOutreachLocalMoment } from "./outreachSchedule";
import { renderJeristotleOutreachEmail } from "./outreachFormatting";

export const BRAND_VIDEO_CAMPAIGN_SLUG =
  "corpus-christi-professional-brand-video-2026";
export const BRAND_VIDEO_TIME_ZONE = "America/Chicago";
export const BRAND_VIDEO_DAY_OFFSETS = [0, 4, 9] as const;
export const BRAND_VIDEO_DRAFT_VERSION = "corpus-christi-brand-video-v1";
export const BRAND_VIDEO_RUNTIME_VERSION = "brand-video-sending-v1";
export const BV_SEND_RELIABILITY_VERSION =
  "brand-video-send-reliability-2026-11-05-v1";
export const BRAND_VIDEO_SEND_START_HOUR = 9;
/** The existing daytime boundary is inclusive through 17:59, exclusive at 18:00. */
export const BRAND_VIDEO_SEND_END_HOUR = 18;
export const BRAND_VIDEO_FOLLOWUP_ATTEMPT_LIMIT = 20;
export const BRAND_VIDEO_SEND_CADENCE =
  "Up to 10 new contacts per calendar day, including weekends; target 9 AM Central with same-day scheduler catch-up through 5:59 PM; Days 5/10 follow-ups (up to 20 attempts per daily batch). No automatic rerun of a reserved day.";
/** UTC catch-all covers Central DST; runtime guard limits daily local business hours. */
export const BRAND_VIDEO_MAINTENANCE_CRON = "0 0,30 13-23 * * *";
export const BRAND_VIDEO_CALLBACK = "/api/scheduled/brand-video-outreach";

/** Window eligibility is not permission for a second batch: the unique daily row is the fence. */
export function getBrandVideoSendMoment(now = new Date(), runDate?: string) {
  const moment = getOutreachLocalMoment(now, BRAND_VIDEO_TIME_ZONE);
  return {
    ...moment,
    inSendWindow:
      moment.hour >= BRAND_VIDEO_SEND_START_HOUR &&
      moment.hour < BRAND_VIDEO_SEND_END_HOUR &&
      (runDate === undefined || moment.dateKey === runDate),
  };
}

export const BRAND_VIDEO_PROSPECT_STATUSES = [
  "review",
  "approved",
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "not_fit",
  "complete",
] as const;
export type BrandVideoProspectStatus =
  (typeof BRAND_VIDEO_PROSPECT_STATUSES)[number];

export const BRAND_VIDEO_OUTREACH_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "in_sequence",
  "cancelled",
  "complete",
] as const;
export type BrandVideoOutreachStatus =
  (typeof BRAND_VIDEO_OUTREACH_STATUSES)[number];

export const BRAND_VIDEO_MESSAGE_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "sent",
  "cancelled",
  "failed",
] as const;
export type BrandVideoMessageStatus =
  (typeof BRAND_VIDEO_MESSAGE_STATUSES)[number];

export type BrandVideoSource = {
  url: string;
  supports: string;
};

export type BrandVideoResearchProspect = {
  businessName: string;
  industry: string;
  website: string;
  businessEmail: string | null;
  businessEmailSourceUrl: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactSourceUrl: string | null;
  localAuthorityEvidence: string;
  sourceUrls: string[];
  verifiedObservation: string;
  videoAngle: string;
  videoScenes: string;
  fitScore: number;
  fitReason: string;
  qualificationStatus: "qualified" | "not_qualified" | "needs_review";
  exclusionReason: string | null;
  subjectVariant: "video-idea" | "story-behind";
  emailOne: string | null;
  emailTwo: string | null;
  emailThree: string | null;
};

export type BrandVideoResearchImport = {
  researchedOn: string;
  prospects: BrandVideoResearchProspect[];
};

export type BrandVideoMessageDraft = {
  sequenceStep: 0 | 1 | 2;
  dayOffset: 0 | 4 | 9;
  subject: string;
  alternativeSubject: string | null;
  text: string;
  html: string;
};

const emailPattern =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBrandVideoBusiness(value: string | null | undefined) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 255);
}

export function normalizeBrandVideoEmail(value: string | null | undefined) {
  const normalized = text(value).toLowerCase();
  return normalized.length <= 320 &&
    !normalized.includes("..") &&
    emailPattern.test(normalized)
    ? normalized
    : null;
}

/** Allows a public general-business inbox but never a guessed or malformed address. */
export function hasPublishedBrandVideoEmail(input: {
  email: string | null | undefined;
  sourceUrl: string | null | undefined;
}) {
  return Boolean(
    normalizeBrandVideoEmail(input.email) &&
      isBrandVideoHttpUrl(input.sourceUrl)
  );
}

/** Evidence must be a public HTTP(S) URL rather than an arbitrary label. */
export function isBrandVideoHttpUrl(value: string | null | undefined) {
  const raw = text(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const privateHost =
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      /^(?:127|10|0)\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith("[");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(host) &&
      !privateHost &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function normalizeBrandVideoDomain(value: string | null | undefined) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase();
    const domain = hostname.replace(/^www\./, "");
    return domain || null;
  } catch {
    return null;
  }
}

export function brandVideoGreeting(
  contactName: string | null | undefined,
  businessName: string
) {
  const first = text(contactName)
    .replace(/^(mr|mrs|ms|dr)\.\s+/i, "")
    .split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'.-]{0,40}$/.test(first) ? first : businessName;
}

export function sanitizeBrandVideoDraft(value: string | null | undefined) {
  return text(value)
    .replace(/\r\n/g, "\n")
    .replace(/[—–]/g, ",")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 8_000);
}

function defaultEmailText(input: {
  step: 0 | 1 | 2;
  greeting: string;
  businessName: string;
  observation: string;
  videoAngle: string;
  videoScenes: string;
}) {
  const signoff = [
    "Best,",
    "",
    "Jeremy Wells",
    "Creative Director",
    "Jeristotle Productions",
    "jeremy@jeristotleproductions.com",
    "jeristotleproductions.com",
    "",
    "Corpus Christi, TX",
    "To stop these emails, reply “unsubscribe”.",
  ].join("\n");
  const sentenceFragment = (value: string) =>
    value
      .replace(/\s*Source\s*:.*$/i, "")
      .trim()
      .replace(/[.!?]+$/, "");
  const observation = sentenceFragment(input.observation);
  const angle = sentenceFragment(input.videoAngle);
  const scenes = sentenceFragment(input.videoScenes);
  const observationLead = observation.replace(/^The\s+/i, "the ");
  if (input.step === 0) {
    return [
      `Hi ${input.greeting},`,
      "",
      "I’m Jeremy with Jeristotle Productions here in Corpus Christi.",
      "",
      `I noticed that ${observationLead}. I think that can be a great story to show online.`,
      "",
      "We create professional brand videos that help customers understand what you do, get to know the people behind it, and see why they should choose you.",
      "",
      `For ${input.businessName}, I’d love to highlight this story: ${angle}.`,
      "",
      "Would you be open to me sending over a quick video concept?",
      "",
      signoff,
    ].join("\n");
  }
  if (input.step === 1) {
    return [
      `Hi ${input.greeting},`,
      "",
      "Just wanted to follow up on the video idea.",
      "",
      `One scene I keep coming back to is ${scenes}.`,
      "",
      "Want me to send over a short outline?",
      "",
      signoff,
    ].join("\n");
  }
  return [
    `Hi ${input.greeting},`,
    "",
    `Just closing the loop on the brand video idea for ${input.businessName}.`,
    "",
    "If this feels like something you want to explore, I’d be happy to put a concept together.",
    "",
    "Is this something you’re considering, or should I leave it here for now?",
    "",
    signoff,
  ].join("\n");
}

/**
 * Produces a source-backed three-message sequence. No send dates are committed
 * until the campaign launch and the user-authorized automatic-approval setting
 * are both active.
 */
export function buildBrandVideoSequence(input: {
  businessName: string;
  contactName: string | null;
  observation: string;
  videoAngle: string;
  videoScenes: string;
  subjectVariant: "video-idea" | "story-behind";
  emailOne?: string | null;
  emailTwo?: string | null;
  emailThree?: string | null;
}) {
  const primarySubject =
    input.subjectVariant === "story-behind"
      ? `Showing the story behind ${input.businessName}`
      : `A video idea for ${input.businessName}`;
  const greeting = brandVideoGreeting(input.contactName, input.businessName);
  const offsets: Array<0 | 4 | 9> = [0, 4, 9];
  return offsets.map((dayOffset, sequenceStep) => {
    const step = sequenceStep as 0 | 1 | 2;
    const text = defaultEmailText({
      step,
      greeting,
      businessName: input.businessName,
      observation: sanitizeBrandVideoDraft(input.observation),
      videoAngle: sanitizeBrandVideoDraft(input.videoAngle),
      videoScenes: sanitizeBrandVideoDraft(input.videoScenes),
    });
    const subject = step === 0 ? primarySubject : `Re: ${primarySubject}`;
    return {
      sequenceStep: step,
      dayOffset,
      subject,
      alternativeSubject:
        step === 0
          ? input.subjectVariant === "video-idea"
            ? `Showing the story behind ${input.businessName}`
            : `A video idea for ${input.businessName}`
          : null,
      text,
      html: renderJeristotleOutreachEmail({ subject, text }),
    } satisfies BrandVideoMessageDraft;
  });
}

/** Future send plans remain tied to the actual accepted first message. */
export function planBrandVideoSequenceFromFirstSend(
  firstSentAt: Date,
  sendHourLocal = 9,
  timeZone = BRAND_VIDEO_TIME_ZONE
) {
  return BRAND_VIDEO_DAY_OFFSETS.map((dayOffset, sequenceStep) => ({
    sequenceStep: sequenceStep as 0 | 1 | 2,
    dayOffset,
    plannedAt:
      sequenceStep === 0
        ? firstSentAt
        : getBrandVideoCalendarDayAt(
            firstSentAt,
            dayOffset,
            sendHourLocal,
            timeZone
          ),
  }));
}

/** Calendar-day offsets, including weekends, with DST-correct local hour. */
export function getBrandVideoCalendarDayAt(
  date: Date,
  offset: number,
  hour: number,
  timeZone = BRAND_VIDEO_TIME_ZONE
) {
  const local = getOutreachLocalMoment(date, timeZone);
  const target = new Date(
    Date.UTC(local.year, local.month - 1, local.day + offset, hour)
  );
  const desired = target.getTime();
  let timestamp = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const represented = getOutreachLocalMoment(new Date(timestamp), timeZone);
    const correction =
      desired -
      Date.UTC(
        represented.year,
        represented.month - 1,
        represented.day,
        represented.hour,
        represented.minute
      );
    timestamp += correction;
    if (!correction) break;
  }
  return new Date(timestamp);
}

export function getNextBrandVideoScheduleTimes(
  now = new Date(),
  reservedRunDate?: string | null
) {
  const nextHour = (hour: number) => {
    const today = getBrandVideoCalendarDayAt(now, 0, hour);
    return today > now ? today : getBrandVideoCalendarDayAt(now, 1, hour);
  };
  const today = getBrandVideoSendMoment(now);
  let nextSendAt = getBrandVideoCalendarDayAt(
    now,
    1,
    BRAND_VIDEO_SEND_START_HOUR
  );
  let nextMaintenanceAt: Date | null = null;
  for (let offset = 0; offset < 2 && !nextMaintenanceAt; offset++) {
    for (let hour = 8; hour <= 17 && !nextMaintenanceAt; hour++) {
      const onHour = getBrandVideoCalendarDayAt(now, offset, hour);
      for (const minute of [0, 30]) {
        const tick = new Date(onHour.getTime() + minute * 60_000);
        if (tick > now) {
          nextMaintenanceAt = tick;
          break;
        }
      }
    }
  }
  // With no current-day reservation, a later maintenance callback may own today's
  // only batch. Callers with ledger data must pass its date (all statuses fence).
  if (reservedRunDate !== today.dateKey) {
    if (today.hour < BRAND_VIDEO_SEND_START_HOUR) {
      nextSendAt = getBrandVideoCalendarDayAt(
        now,
        0,
        BRAND_VIDEO_SEND_START_HOUR
      );
    } else if (
      today.inSendWindow &&
      nextMaintenanceAt &&
      getBrandVideoSendMoment(nextMaintenanceAt, today.dateKey).inSendWindow
    ) {
      nextSendAt = nextMaintenanceAt;
    }
  }
  return {
    nextPreparationAt: nextHour(8),
    // An eligible callback estimate, not a promise of SMTP acceptance or delivery.
    nextSendAt,
    nextMaintenanceAt,
    sendCadence: BRAND_VIDEO_SEND_CADENCE,
    sendReliabilityVersion: BV_SEND_RELIABILITY_VERSION,
  };
}

export function getBrandVideoListUnsubscribeHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function getBrandVideoUnsubscribeUrl(token: string) {
  return `https://jeristotleproductions.com/brand-video-unsubscribe/${encodeURIComponent(token)}`;
}
