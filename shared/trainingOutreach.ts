import { z } from "zod";
import { renderJeristotleOutreachEmail } from "./outreachFormatting";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from "./outboundReplenishmentPolicy";

export const TRAINING_OUTREACH_CAMPAIGN_SLUG =
  "internal-training-knowledge-capture-2026";
export const TRAINING_OUTREACH_TIME_ZONE = "America/Chicago";
export const TRAINING_OUTREACH_DRAFT_VERSION = "internal-training-live-v2";
export const TRAINING_RUNTIME_VERSION = "training-sending-v1";
/** Legacy daytime schedule, retained for compatibility and existing shared consumers. */
export const TRAINING_MAINTENANCE_CRON = "0 0,30 13-23 * * *";
/** UTC catch-all; runtime permits research only at 01:00–05:59 Central. */
export const TRAINING_NIGHTLY_MAINTENANCE_CRON = "0 0,30 6-11,13-23 * * *";
export const TRAINING_CALLBACK = "/api/scheduled/training-outreach";
export const TRAINING_RESEARCH_TARGET = 25;
export const TRAINING_DRAFT_TARGET = 10;
/** Generic operator/CLI imports are bounded separately from 12-record agent packets. */
export const TRAINING_IMPORT_MAX_BATCH = 100;
export const TRAINING_SOURCE_MAX_ITEMS = 256;
export const TRAINING_SEQUENCE_DAYS = [0, 4, 5] as const;
export const TRAINING_DAILY_NEW_LIMIT = 10;
export const TRAINING_READY_RESERVE_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;

/** Immutable posture for this phase; no router exposes a way to change it. */
/** `ensureTrainingCampaign` may create this paused baseline but never activate it. */
export const TRAINING_CAMPAIGN_DEFAULTS = {
  status: "paused" as const,
  launchApprovedAt: null,
  listApprovedAt: null,
  dailyNewLimit: TRAINING_DAILY_NEW_LIMIT,
  schedulerTaskUid: null,
  researchTaskUid: null,
  autoApproveQualifiedProspects: false,
  autoEnroll: false,
  smtpAccepted: 0,
} as const;
/** Legacy name retained for research adapter compatibility. */
export const TRAINING_DRAFT_ONLY_CAMPAIGN_DEFAULTS = TRAINING_CAMPAIGN_DEFAULTS;

export const TRAINING_PROSPECT_STATUSES = [
  "review",
  "approved",
  "not_fit",
  "replied",
  "bounced",
  "unsubscribed",
  "meeting",
  "complete",
] as const;
export type TrainingProspectStatus =
  (typeof TRAINING_PROSPECT_STATUSES)[number];

export const TRAINING_TERMINAL_STATUSES = [
  "not_fit",
  "replied",
  "bounced",
  "unsubscribed",
  "meeting",
  "complete",
] as const;

export const TRAINING_OUTREACH_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "in_sequence",
  "cancelled",
  "complete",
] as const;
export type TrainingOutreachStatus =
  (typeof TRAINING_OUTREACH_STATUSES)[number];

export const TRAINING_MESSAGE_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "sent",
  "cancelled",
  "failed",
] as const;
export type TrainingMessageStatus = (typeof TRAINING_MESSAGE_STATUSES)[number];

/** Only an explicitly classified individual may receive a first-name greeting. */
export const TRAINING_EMAIL_RECIPIENT_TYPES = [
  "named",
  "general",
  "unknown",
] as const;
export type TrainingEmailRecipientType =
  (typeof TRAINING_EMAIL_RECIPIENT_TYPES)[number];

export type TrainingQualificationStatus =
  | "qualified"
  | "needs_review"
  | "not_qualified";

export type TrainingFact = {
  text: string;
  url: string;
};

export type TrainingSource = {
  url: string;
  supports: string;
};

const nullableText = (max: number) => z.string().trim().max(max).nullable();

const publicUrl = z
  .string()
  .trim()
  .max(500)
  .refine(value => isPublicTrainingHttpUrl(value), {
    message:
      "Must be a public HTTP(S) URL without credentials or a private host.",
  });

const nullablePublicUrl = publicUrl.nullable();

const researchProspectSchema = z
  .object({
    businessName: z.string().trim().min(1).max(220),
    website: nullablePublicUrl,
    location: nullableText(240),
    industry: nullableText(180),
    qualificationStatus: z.enum(["qualified", "needs_review", "not_qualified"]),
    priorityRank: z.number().int().min(1).max(100_000),
    fitScore: z.number().finite().min(0).max(100),
    fitReason: nullableText(4_000),
    verifiedObservation: nullableText(4_000),
    useCase: nullableText(4_000),
    pilotScope: nullableText(4_000),
    contactName: nullableText(180),
    contactTitle: nullableText(220),
    contactSourceUrl: nullablePublicUrl,
    businessEmail: nullableText(320),
    businessEmailSourceUrl: nullablePublicUrl,
    emailRecipientType: z
      .enum(TRAINING_EMAIL_RECIPIENT_TYPES)
      .optional()
      .default("unknown"),
    businessPhone: nullableText(100),
    phoneSourceUrl: nullablePublicUrl,
    sizeIndicator: nullableText(500),
    sizeSourceUrl: nullablePublicUrl,
    localAuthorityEvidence: nullableText(4_000),
    uncertainties: z.array(z.string().trim().min(1).max(2_000)).max(50),
    facts: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(4_000),
          url: publicUrl,
        })
      )
      .max(TRAINING_SOURCE_MAX_ITEMS),
    operationalSignals: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(4_000),
          url: publicUrl,
        })
      )
      .max(TRAINING_SOURCE_MAX_ITEMS),
    sources: z
      .array(
        z.object({
          url: publicUrl,
          supports: z.string().trim().min(1).max(2_000),
        })
      )
      .max(TRAINING_SOURCE_MAX_ITEMS),
    selectedForDraft: z.boolean(),
    recommendFirst: z.boolean(),
  })
  .superRefine((prospect, ctx) => {
    const hasContactClaim = Boolean(
      prospect.contactName || prospect.contactTitle
    );
    if (hasContactClaim && !prospect.contactSourceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["contactSourceUrl"],
        message: "A named contact or title requires a public source URL.",
      });
    }
    if (prospect.businessEmail) {
      if (!normalizeTrainingEmail(prospect.businessEmail)) {
        ctx.addIssue({
          code: "custom",
          path: ["businessEmail"],
          message: "Business email must be a valid, source-backed address.",
        });
      }
      if (!prospect.businessEmailSourceUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["businessEmailSourceUrl"],
          message: "A business email requires its public source URL.",
        });
      }
      if (
        prospect.businessEmailSourceUrl &&
        !prospect.sources.some(
          source => source.url === prospect.businessEmailSourceUrl
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: "The email source URL must remain in retained sources.",
        });
      }
    } else if (prospect.businessEmailSourceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["businessEmailSourceUrl"],
        message: "An email source URL must be null when no email was found.",
      });
    }
    if (prospect.businessPhone && !prospect.phoneSourceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneSourceUrl"],
        message: "A phone number requires its public source URL.",
      });
    }
    if (prospect.sizeIndicator && !prospect.sizeSourceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["sizeSourceUrl"],
        message: "A size indicator requires its public source URL.",
      });
    }
    if (prospect.selectedForDraft) {
      if (prospect.qualificationStatus !== "qualified") {
        ctx.addIssue({
          code: "custom",
          path: ["selectedForDraft"],
          message: "Only qualified companies can be selected for drafts.",
        });
      }
      if (prospect.priorityRank > TRAINING_DRAFT_TARGET) {
        ctx.addIssue({
          code: "custom",
          path: ["priorityRank"],
          message: "Draft selection is reserved for the prioritized top 10.",
        });
      }
      for (const field of [
        "verifiedObservation",
        "useCase",
        "pilotScope",
      ] as const) {
        if (!prospect[field]) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message:
              "Selected draft prospects require source-backed draft context.",
          });
        }
      }
    }
    if (
      prospect.qualificationStatus === "qualified" &&
      prospect.sources.length === 0 &&
      prospect.facts.length === 0 &&
      prospect.operationalSignals.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message:
          "Qualified research requires at least one public source-backed fact.",
      });
    }
  });

export const trainingResearchImportSchema = z
  .object({
    researchedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "researchedOn must be YYYY-MM-DD."),
    prospects: z
      .array(researchProspectSchema)
      .min(1)
      // The separate research packet adds a stricter cap. This generic import
      // remains bounded and never implies activation or recurring work.
      .max(TRAINING_IMPORT_MAX_BATCH),
  })
  .superRefine((input, ctx) => {
    const ranks = new Set<number>();
    const identities = new Map<string, number>();

    input.prospects.forEach((prospect, index) => {
      if (ranks.has(prospect.priorityRank)) {
        ctx.addIssue({
          code: "custom",
          path: ["prospects", index, "priorityRank"],
          message: "Priority ranks must be unique within one import.",
        });
      }
      ranks.add(prospect.priorityRank);

      const aliases = trainingIdentityAliases({
        businessName: prospect.businessName,
        website: prospect.website,
        email: prospect.businessEmail,
      });
      for (const alias of aliases) {
        const previous = identities.get(alias);
        if (previous !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["prospects", index],
            message: `Duplicate company identity overlaps prospect ${previous + 1}.`,
          });
          break;
        }
        identities.set(alias, index);
      }
    });
  });

export type TrainingResearchProspect = z.infer<typeof researchProspectSchema>;
export type TrainingResearchImport = z.infer<
  typeof trainingResearchImportSchema
>;

/** CLI callers use this parser before any database work begins. */
export function parseTrainingResearchImport(
  input: unknown
): TrainingResearchImport {
  return trainingResearchImportSchema.parse(input);
}

function trimmed(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

const emailPattern =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;

export function normalizeTrainingEmail(value: string | null | undefined) {
  const normalized = trimmed(value).toLowerCase();
  return normalized.length <= 320 &&
    !normalized.includes("..") &&
    emailPattern.test(normalized)
    ? normalized
    : null;
}

export function normalizeTrainingBusiness(value: string | null | undefined) {
  return trimmed(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 255);
}

export function normalizeTrainingDomain(value: string | null | undefined) {
  const raw = trimmed(value);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

/** Public evidence URLs only: no credentials, localhost, or private/reserved IP ranges. */
export function isPublicTrainingHttpUrl(value: string | null | undefined) {
  const raw = trimmed(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      Boolean(url.username) ||
      Boolean(url.password)
    ) {
      return false;
    }
    const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
    if (!host.includes(".") && !host.includes(":")) return false;
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "0.0.0.0" ||
      host === "::" ||
      host === "::1" ||
      host.startsWith("::ffff:") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    ) {
      return false;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      if (octets.some(part => part > 255)) return false;
      const [first, second] = octets;
      if (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function hasSourceBackedTrainingEmail(input: {
  email: string | null | undefined;
  sourceUrl: string | null | undefined;
}) {
  return Boolean(
    normalizeTrainingEmail(input.email) &&
      isPublicTrainingHttpUrl(input.sourceUrl)
  );
}

export function trainingIdentityAliases(input: {
  businessName: string | null | undefined;
  website: string | null | undefined;
  email: string | null | undefined;
}) {
  const aliases = [`business:${normalizeTrainingBusiness(input.businessName)}`];
  const domain = normalizeTrainingDomain(input.website);
  const email = normalizeTrainingEmail(input.email);
  if (domain) aliases.push(`domain:${domain}`);
  if (email) aliases.push(`email:${email}`);
  return aliases.filter(alias => alias !== "business:");
}

export function isTrainingTerminalStatus(
  status: TrainingProspectStatus | string | null | undefined
) {
  return (TRAINING_TERMINAL_STATUSES as readonly string[]).includes(
    status || ""
  );
}

/** Re-imports can refresh research, but never revive excluded or terminal records. */
export function canTrainingImportRefreshDisposition(
  status: TrainingProspectStatus | string | null | undefined
) {
  return !isTrainingTerminalStatus(status);
}

export type TrainingMessageDraft = {
  sequenceStep: 0 | 1 | 2;
  dueAfterBusinessDays: 0 | 4 | 5;
  status: "draft";
  subject: string;
  text: string;
  html: string;
  plannedAt: null;
  sentAt: null;
  providerMessageId: null;
};

function safeDraftText(value: string) {
  return value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[—–]/g, ",")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 4_000);
}

function sentenceFragment(value: string) {
  return safeDraftText(value)
    .replace(/\s*source\s*:.*$/i, "")
    .trim()
    .replace(/[.!?]+$/, "");
}

function trainingGreeting(input: {
  contactName: string | null;
  businessName: string;
  recipientIsNamed: boolean;
}) {
  if (!input.recipientIsNamed) {
    return input.businessName ? `Hi ${input.businessName} team,` : "Hi there,";
  }

  const first = trimmed(input.contactName)
    .replace(/^(mr|mrs|ms|dr)\.\s+/i, "")
    .split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'.-]{0,40}$/.test(first)
    ? `Hi ${first},`
    : input.businessName
      ? `Hi ${input.businessName} team,`
      : "Hi there,";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Personal, readable HTML with the shared Jeristotle outreach signature. */
export function trainingTextToHtml(text: string, subject: string) {
  return renderJeristotleOutreachEmail({ subject, text: safeDraftText(text) });
}

function trainingSignature() {
  return [
    "Best,",
    "",
    "Jeremy Wells",
    "Creative Director",
    "Jeristotle Productions",
    "jeremy@jeristotleproductions.com",
    "jeristotleproductions.com",
    "319 N Mesquite St, Corpus Christi, TX 78401",
    "",
    'To opt out of any future email, reply "unsubscribe".',
  ].join("\n");
}

/** Builds draft copy only. Sending, approval, scheduling, and activation are separate. */
export function buildTrainingSequence(input: {
  businessName: string;
  contactName: string | null;
  /** Defaults to generic; a name alone is never enough to imply recipient identity. */
  recipientIsNamed?: boolean;
  verifiedObservation: string;
  useCase: string;
  pilotScope: string;
}) {
  const businessName = safeDraftText(input.businessName);
  const greeting = trainingGreeting({
    contactName: input.contactName,
    businessName,
    recipientIsNamed: input.recipientIsNamed ?? false,
  });
  const observation = sentenceFragment(input.verifiedObservation);
  // Use-case fragments are imported as readable continuations, not conditional clauses.
  const useCase = sentenceFragment(input.useCase).replace(/^if\s+/i, "");
  const initialSubject = "Capturing your team’s know-how";
  const signature = trainingSignature();

  const textByStep: [string, string, string] = [
    [
      greeting,
      "",
      "I’m Jeremy Wells with Jeristotle Productions here in Corpus Christi.",
      "",
      observation ? `I noticed that ${observation}.` : "",
      "",
      "I wondered how you capture the experience your team passes along to new employees. Are there tasks or processes your supervisors find themselves explaining over and over?",
      "",
      "We help document how your team works through short training videos and practical guides employees can revisit.",
      "",
      "We interview and film your experienced people, then organize the material for your team to review and use.",
      "",
      "The goal is to make onboarding easier and reduce time spent repeating the same instruction.",
      "",
      "Your team supplies the expertise and reviews and approves the final instructions before delivery.",
      "",
      `Would you be open to a brief conversation about whether this could be useful at ${businessName}?`,
      "",
      signature,
    ].join("\n"),
    [
      greeting,
      "",
      "Just following up.",
      "",
      "A small paid pilot can focus on one workflow your team selects, with an experienced employee, a short training video, and a practical guide for private team use.",
      "",
      "Your designated reviewer approves the final instructions before delivery. We do not publish or reuse the material without separate permission.",
      "",
      useCase
        ? `One possible starting point, if it is useful to your team, is ${useCase}.`
        : "",
      "",
      "Would a brief conversation be useful?",
      "",
      signature,
    ].join("\n"),
    [
      greeting,
      "",
      "One last follow-up on capturing internal know-how.",
      "",
      "If repeated explanations or onboarding handoffs become a priority, Jeristotle can help your team document a client-selected workflow for private use.",
      "",
      "If there is someone else who handles this, I would appreciate being pointed in the right direction. Otherwise, I will leave it here.",
      "",
      signature,
    ].join("\n"),
  ];

  return TRAINING_SEQUENCE_DAYS.map((dueAfterBusinessDays, index) => {
    const sequenceStep = index as 0 | 1 | 2;
    const subject =
      sequenceStep === 0 ? initialSubject : `Re: ${initialSubject}`;
    const text = safeDraftText(textByStep[sequenceStep]);
    return {
      sequenceStep,
      dueAfterBusinessDays,
      status: "draft",
      subject,
      text,
      html: trainingTextToHtml(text, subject),
      plannedAt: null,
      sentAt: null,
      providerMessageId: null,
    } satisfies TrainingMessageDraft;
  });
}

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
};

function localDateParts(date: Date, timeZone: string): LocalDateParts {
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
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Converts a desired local wall-clock time to UTC, retaining that hour through DST. */
function localWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string
) {
  const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
  let timestamp = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = localDateParts(new Date(timestamp), timeZone);
    const representedWallClock = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      0
    );
    const correction = desired - representedWallClock;
    timestamp += correction;
    if (correction === 0) break;
  }
  return new Date(timestamp);
}

/** Adds business days after an accepted send, excluding Saturday and Sunday. */
export function addTrainingBusinessDays(
  acceptedAt: Date,
  businessDays: number,
  sendHourLocal = 9,
  timeZone = TRAINING_OUTREACH_TIME_ZONE
) {
  const local = localDateParts(acceptedAt, timeZone);
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let remaining = Math.max(0, Math.trunc(businessDays));
  while (remaining > 0) {
    target.setUTCDate(target.getUTCDate() + 1);
    if (![0, 6].includes(target.getUTCDay())) remaining -= 1;
  }
  return localWallClockToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    sendHourLocal,
    timeZone
  );
}

/**
 * Computes an advisory plan only. Step 2 remains null until the first follow-up
 * is actually accepted; it is never chained from a merely planned date.
 */
export function planTrainingSequenceFromAcceptedSends(input: {
  initialAcceptedAt: Date | null;
  firstFollowupAcceptedAt: Date | null;
  sendHourLocal?: number;
  timeZone?: string;
}) {
  const sendHourLocal = input.sendHourLocal ?? 9;
  const timeZone = input.timeZone ?? TRAINING_OUTREACH_TIME_ZONE;
  return [
    {
      sequenceStep: 0 as const,
      dueAfterBusinessDays: 0 as const,
      plannedAt: input.initialAcceptedAt,
    },
    {
      sequenceStep: 1 as const,
      dueAfterBusinessDays: 4 as const,
      plannedAt: input.initialAcceptedAt
        ? addTrainingBusinessDays(
            input.initialAcceptedAt,
            4,
            sendHourLocal,
            timeZone
          )
        : null,
    },
    {
      sequenceStep: 2 as const,
      dueAfterBusinessDays: 5 as const,
      plannedAt: input.firstFollowupAcceptedAt
        ? addTrainingBusinessDays(
            input.firstFollowupAcceptedAt,
            5,
            sendHourLocal,
            timeZone
          )
        : null,
    },
  ];
}
