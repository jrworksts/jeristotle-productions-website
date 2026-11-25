import { getNextFollowupAt } from "./outreachSchedule";
import { renderJeristotleOutreachEmail } from "./outreachFormatting";

export const CREDIT_UNION_CAMPAIGN_SLUG = "texas-credit-union-content-2026";
export const CREDIT_UNION_TIME_ZONE = "America/Chicago";
export const CREDIT_UNION_DAY_OFFSETS = [0, 3, 8] as const;
export const CREDIT_UNION_DRAFT_VERSION = "texas-credit-union-content-v2";

export const CREDIT_UNION_PROSPECT_STATUSES = [
  "review",
  "verification_needed",
  "approved",
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "not_fit",
  "complete",
] as const;
export type CreditUnionProspectStatus =
  (typeof CREDIT_UNION_PROSPECT_STATUSES)[number];

export const CREDIT_UNION_OUTREACH_STATUSES = [
  "blocked",
  "draft",
  "approved",
  "scheduled",
  "in_sequence",
  "cancelled",
  "complete",
] as const;
export type CreditUnionOutreachStatus =
  (typeof CREDIT_UNION_OUTREACH_STATUSES)[number];

export const CREDIT_UNION_EMAIL_CONFIDENCES = [
  "officially_published",
  "independently_verified",
  "unverified",
  "not_found",
] as const;
export type CreditUnionEmailConfidence =
  (typeof CREDIT_UNION_EMAIL_CONFIDENCES)[number];

export const CREDIT_UNION_MESSAGE_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "sent",
  "skipped",
  "cancelled",
  "failed",
] as const;
export type CreditUnionMessageStatus =
  (typeof CREDIT_UNION_MESSAGE_STATUSES)[number];

/** Events a reviewer may log only after actually observing the stated outcome. */
export const CREDIT_UNION_OBSERVED_OUTCOME_EVENTS = [
  "reply",
  "positive_reply",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "outcome_not_fit",
] as const;
export type CreditUnionObservedOutcomeEvent =
  (typeof CREDIT_UNION_OBSERVED_OUTCOME_EVENTS)[number];

export type CreditUnionContact = {
  name?: string | null;
  title?: string | null;
  /** Optional research metadata only; canonical persisted fields remain name/title. */
  recipientKind?: "named_individual" | "department" | null;
  businessEmail?: string | null;
  emailStatus?: CreditUnionEmailConfidence | string | null;
  emailSourceUrl?: string | null;
  roleSourceUrl?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
};

export type CreditUnionSource = {
  url: string;
  supports: string;
};

export type CreditUnionResearchProspect = {
  creditUnionName: string;
  website?: string | null;
  headquartersCity?: string | null;
  branchCount?: number | null;
  branchCountNote?: string | null;
  operatingStatus?: string | null;
  qualified: boolean;
  fitScore?: number | null;
  fitReason?: string | null;
  contacts?: CreditUnionContact[] | null;
  fallbackContactUrl?: string | null;
  socialChannels?: unknown;
  observedOpportunities?: unknown;
  verifiedPersonalizedOpening?: string | null;
  shortVerifiedTopic?: string | null;
  specificContentIdea?: string | null;
  specificRepurposingIdea?: string | null;
  specificSmallStart?: string | null;
  personalizationNotes?: string | null;
  claimsToAvoid?: unknown;
  sources?: CreditUnionSource[] | null;
  limitations?: unknown;
};

export type CreditUnionResearchImport = {
  researchedOn?: string | null;
  prospects: CreditUnionResearchProspect[];
  top25?: unknown;
};

export type PrimaryContactSelection = {
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  primaryEmail: string | null;
  emailConfidence: CreditUnionEmailConfidence;
  primaryEmailSourceUrl: string | null;
  primaryRoleSourceUrl: string | null;
};

export type CreditUnionMessageDraft = {
  sequenceStep: 0 | 1 | 2;
  dayOffset: 0 | 3 | 8;
  subject: string;
  alternativeSubject: string | null;
  html: string;
  text: string;
};

export type CreditUnionTemplateFields = {
  creditUnionName: string;
  firstName: string;
  verifiedPersonalizedOpening: string;
  shortVerifiedTopic: string;
  specificContentIdea: string;
  specificRepurposingIdea: string;
  specificSmallStart: string;
  unsubscribeUrl: string;
  physicalPostalAddress: string;
};

export type CreditUnionReadinessInput = {
  campaignStatus: "review" | "paused" | "active";
  listApprovedAt: Date | null;
  configApprovedAt: Date | null;
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  primaryEmail: string | null;
  emailConfidence: CreditUnionEmailConfidence;
  primaryEmailSourceUrl: string | null;
  primaryRoleSourceUrl: string | null;
  prospectStatus: CreditUnionProspectStatus;
  crossCampaignBlock: string | null;
  duplicate: boolean;
  suppressed: boolean;
  messageStatuses: CreditUnionMessageStatus[];
};

export type CreditUnionReadiness = {
  ready: boolean;
  reasons: string[];
};

/** Every unsent review/queue state is cancelled after a reply, opt-out, or bounce. */
export const CREDIT_UNION_UNSENT_CANCELLATION_STATUSES = [
  "draft",
  "approved",
  "scheduled",
] as const satisfies readonly CreditUnionMessageStatus[];

export function getCreditUnionResponseStopPolicy(
  status: CreditUnionProspectStatus
) {
  const suppressReason =
    status === "unsubscribed"
      ? "unsubscribed"
      : status === "bounced"
        ? "bounced"
        : status === "replied"
          ? "replied"
          : null;
  return {
    cancelMessageStatuses: CREDIT_UNION_UNSENT_CANCELLATION_STATUSES,
    addSharedSuppression: suppressReason !== null,
    suppressReason,
  } as const;
}

const genericInboxLocals = new Set([
  "admin",
  "community",
  "contact",
  "customerservice",
  "help",
  "hello",
  "info",
  "market",
  "marketing",
  "marketingdepartment",
  "media",
  "memberservices",
  "office",
  "press",
  "service",
  "support",
  "webmaster",
]);

/**
 * Mailbox recipients, never inferred people. These exact values are persisted
 * in the existing primary-contact columns, avoiding a database migration.
 */
const creditUnionDepartmentRecipients = [
  {
    name: "Marketing team",
    title: "Marketing department",
    allowedInboxLocals: new Set(["marketing", "marketingdepartment"]),
  },
  {
    name: "Communications team",
    title: "Communications department",
    allowedInboxLocals: new Set(["communications", "publicrelations"]),
  },
] as const;

/** Service, privacy, sponsorship, and press-only addresses are never targets. */
const disallowedDepartmentInboxLocals = new Set([
  "support",
  "info",
  "memberservices",
  "complaints",
  "privacy",
  "sponsorship",
  "press",
]);

const terminalProspectStatuses = new Set<CreditUnionProspectStatus>([
  "replied",
  "unsubscribed",
  "bounced",
  "meeting",
  "consultation_complete",
  "qualified_opportunity",
  "not_fit",
  "complete",
]);

const exactEvidenceConfidences = new Set<CreditUnionEmailConfidence>([
  "officially_published",
  "independently_verified",
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCreditUnionOrganization(value: string) {
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

export function normalizeCreditUnionEmail(value: string | null | undefined) {
  const normalized = text(value).toLowerCase();
  return emailPattern.test(normalized) ? normalized.slice(0, 320) : null;
}

/** Evidence must be a public HTTP(S) URL, never an arbitrary label or URI. */
export function isCreditUnionHttpUrl(value: string | null | undefined) {
  const raw = text(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

export function normalizeCreditUnionDomain(value: string | null | undefined) {
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

export function isGenericCreditUnionInbox(email: string | null | undefined) {
  const normalized = normalizeCreditUnionEmail(email);
  if (!normalized) return false;
  return genericInboxLocals.has(normalizedCreditUnionInboxLocal(normalized));
}

function normalizedCreditUnionInboxLocal(email: string) {
  return (email.split("@")[0] || "").replace(/[._-]/g, "");
}

export function isExactSourcedBusinessEmail(input: {
  email: string | null | undefined;
  confidence: CreditUnionEmailConfidence;
  emailSourceUrl: string | null | undefined;
}) {
  return Boolean(
    normalizeCreditUnionEmail(input.email) &&
      !isGenericCreditUnionInbox(input.email) &&
      exactEvidenceConfidences.has(input.confidence) &&
      isCreditUnionHttpUrl(input.emailSourceUrl)
  );
}

function getCreditUnionDepartmentRecipient(
  name: string | null | undefined,
  title: string | null | undefined
) {
  return (
    creditUnionDepartmentRecipients.find(
      recipient =>
        text(name) === recipient.name && text(title) === recipient.title
    ) || null
  );
}

function isCreditUnionDepartmentTeamName(value: string | null | undefined) {
  const name = text(value).toLowerCase();
  return creditUnionDepartmentRecipients.some(
    recipient => recipient.name.toLowerCase() === name
  );
}

/**
 * Public source context is manually checked by the importer. This deterministic
 * control requires each supplied source URL to be HTTP(S) on the institution's
 * email domain (or a subdomain), never a third-party or general-source domain.
 */
function isOfficialCreditUnionDepartmentSource(
  sourceUrl: string | null | undefined,
  email: string | null | undefined
) {
  const normalizedEmail = normalizeCreditUnionEmail(email);
  if (!normalizedEmail || !isCreditUnionHttpUrl(sourceUrl)) return false;
  const emailDomain = normalizedEmail.split("@")[1] || "";
  const sourceDomain = normalizeCreditUnionDomain(sourceUrl);
  return Boolean(
    sourceDomain &&
      (sourceDomain === emailDomain || sourceDomain.endsWith(`.${emailDomain}`))
  );
}

/**
 * Narrow fallback for an officially published Marketing or Communications
 * mailbox. It intentionally does not reuse the named-email helper: generic
 * inboxes are invalid for a person but one exact, source-verified department
 * mailbox may be a truthful departmental recipient.
 */
export function isVerifiedCreditUnionDepartment(input: {
  name: string | null | undefined;
  title: string | null | undefined;
  email: string | null | undefined;
  emailConfidence: CreditUnionEmailConfidence;
  emailSourceUrl: string | null | undefined;
  roleSourceUrl: string | null | undefined;
}) {
  const recipient = getCreditUnionDepartmentRecipient(input.name, input.title);
  const normalizedEmail = normalizeCreditUnionEmail(input.email);
  if (!recipient || !normalizedEmail) return false;

  const local = normalizedCreditUnionInboxLocal(normalizedEmail);
  return Boolean(
    input.emailConfidence === "officially_published" &&
      recipient.allowedInboxLocals.has(local) &&
      !disallowedDepartmentInboxLocals.has(local) &&
      isOfficialCreditUnionDepartmentSource(
        input.emailSourceUrl,
        normalizedEmail
      ) &&
      isOfficialCreditUnionDepartmentSource(
        input.roleSourceUrl,
        normalizedEmail
      )
  );
}

function normalizedEmailConfidence(
  value: CreditUnionContact["emailStatus"]
): CreditUnionEmailConfidence {
  return CREDIT_UNION_EMAIL_CONFIDENCES.includes(
    value as CreditUnionEmailConfidence
  )
    ? (value as CreditUnionEmailConfidence)
    : "not_found";
}

export function isMarketingRelevantCreditUnionTitle(
  value: string | null | undefined
) {
  return /\b(marketing|brand|communications?|community(?:\s+development)?|digital|content|creative|public relations|member(?:ship| experience| relations| revenue)?|growth|business development|business relations|experience)\b/i.test(
    text(value)
  );
}

/** A send target is a named marketer or a narrowly verified department inbox. */
export function isCreditUnionTargetingReady(input: {
  name: string | null | undefined;
  title: string | null | undefined;
  email: string | null | undefined;
  emailConfidence: CreditUnionEmailConfidence;
  emailSourceUrl: string | null | undefined;
  roleSourceUrl: string | null | undefined;
}) {
  const namedTarget = Boolean(
    isNamedIndividual({ name: input.name }) &&
      isMarketingRelevantCreditUnionTitle(input.title) &&
      isCreditUnionHttpUrl(input.roleSourceUrl) &&
      isExactSourcedBusinessEmail({
        email: input.email,
        confidence: input.emailConfidence,
        emailSourceUrl: input.emailSourceUrl,
      })
  );
  return namedTarget || isVerifiedCreditUnionDepartment(input);
}

function isNamedIndividual(contact: CreditUnionContact) {
  const name = text(contact.name);
  return Boolean(
    name &&
      !isCreditUnionDepartmentTeamName(name) &&
      !/^(?:(?:marketing|communications?|public relations)\s+(?:team|department))$/i.test(
        name
      ) &&
      !/^(?:marketing(?:\s+department)?|media|press|community|member services|customer service|communications?|contact|support)$/i.test(
        name
      )
  );
}

/**
 * Prefer a named, marketing-relevant contact with current-role evidence. Only
 * then fall back to the narrow, source-verified department recipient; generic
 * and unsourced inboxes remain in contacts JSON and are never promoted.
 */
export function selectCreditUnionPrimaryContact(
  contacts: CreditUnionContact[] | null | undefined
): PrimaryContactSelection {
  const available = Array.isArray(contacts) ? contacts : [];
  const named = available.filter(isNamedIndividual);
  const marketingNamed = named.filter(contact =>
    isMarketingRelevantCreditUnionTitle(contact.title)
  );
  const exactMarketing = marketingNamed.find(contact =>
    isCreditUnionTargetingReady({
      name: contact.name,
      title: contact.title,
      email: contact.businessEmail,
      emailConfidence: normalizedEmailConfidence(contact.emailStatus),
      emailSourceUrl: contact.emailSourceUrl,
      roleSourceUrl: contact.roleSourceUrl,
    })
  );

  if (exactMarketing) {
    return {
      primaryContactName: text(exactMarketing.name) || null,
      primaryContactTitle: text(exactMarketing.title) || null,
      primaryEmail: normalizeCreditUnionEmail(exactMarketing.businessEmail),
      emailConfidence: normalizedEmailConfidence(exactMarketing.emailStatus),
      primaryEmailSourceUrl: text(exactMarketing.emailSourceUrl) || null,
      primaryRoleSourceUrl: text(exactMarketing.roleSourceUrl) || null,
    };
  }

  const department = available.find(contact =>
    isVerifiedCreditUnionDepartment({
      name: contact.name,
      title: contact.title,
      email: contact.businessEmail,
      emailConfidence: normalizedEmailConfidence(contact.emailStatus),
      emailSourceUrl: contact.emailSourceUrl,
      roleSourceUrl: contact.roleSourceUrl,
    })
  );
  if (department) {
    const recipient = getCreditUnionDepartmentRecipient(
      department.name,
      department.title
    );
    if (!recipient) throw new Error("Verified department recipient is missing");
    return {
      primaryContactName: recipient.name,
      primaryContactTitle: recipient.title,
      primaryEmail: normalizeCreditUnionEmail(department.businessEmail),
      emailConfidence: normalizedEmailConfidence(department.emailStatus),
      primaryEmailSourceUrl: text(department.emailSourceUrl) || null,
      primaryRoleSourceUrl: text(department.roleSourceUrl) || null,
    };
  }

  const fallback = marketingNamed.find(
    contact => !isGenericCreditUnionInbox(contact.businessEmail)
  );
  return {
    primaryContactName: fallback ? text(fallback.name) || null : null,
    primaryContactTitle: fallback ? text(fallback.title) || null : null,
    primaryEmail: null,
    emailConfidence: fallback
      ? normalizedEmailConfidence(fallback.emailStatus)
      : "not_found",
    primaryEmailSourceUrl: null,
    primaryRoleSourceUrl: fallback
      ? text(fallback.roleSourceUrl) || null
      : null,
  };
}

export function firstNameFromCreditUnionContact(
  name: string | null | undefined
) {
  if (isCreditUnionDepartmentTeamName(name)) return "team";
  const candidate = text(name)
    .replace(/^(mr|mrs|ms|dr)\.\s+/i, "")
    .split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'.-]{0,40}$/.test(candidate) ? candidate : "there";
}

export function getCreditUnionUnsubscribeUrl(token: string) {
  return `https://jeristotleproductions.com/credit-union-unsubscribe/${encodeURIComponent(token)}`;
}

function requiredPersonalization(value: string, field: string) {
  const clean = text(value);
  if (!clean) {
    throw new Error(
      `${field} is required before generating a credit-union draft`
    );
  }
  return clean;
}

/** Remove only redundant research-field labels; preserve the substantive idea. */
function normalizeProposedIdea(value: string) {
  return value
    .replace(
      /^\s*(?:proposed?\s+idea|proposal|content\s+idea|idea)\s*:\s*/i,
      ""
    )
    .replaceAll("—", ",")
    .trim();
}

function asSentence(value: string) {
  const clean = normalizeProposedIdea(value).replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function signatureText(address: string, unsubscribeUrl: string) {
  return [
    "Best,",
    "",
    "Jeremy Wells",
    "Creative Director",
    "Jeristotle Productions",
    "https://jeristotleproductions.com/",
    "",
    address,
    'To stop these emails, reply "unsubscribe" or use this unsubscribe link:',
    unsubscribeUrl,
  ].join("\n");
}

function renderEmail(input: {
  subject: string;
  firstName: string;
  paragraphs: string[];
  physicalPostalAddress: string;
  unsubscribeUrl: string;
}) {
  const textBody = [
    `Hi ${input.firstName},`,
    "",
    ...input.paragraphs.flatMap(paragraph => [paragraph, ""]),
    signatureText(input.physicalPostalAddress, input.unsubscribeUrl),
  ].join("\n");
  return {
    html: renderJeristotleOutreachEmail({
      subject: input.subject,
      text: textBody,
      unsubscribeUrl: input.unsubscribeUrl,
      physicalPostalAddress: input.physicalPostalAddress,
    }),
    text: textBody,
  };
}

/** Builds draft-only content; this function performs no persistence or delivery. */
export function buildCreditUnionSequence(
  fields: CreditUnionTemplateFields
): CreditUnionMessageDraft[] {
  const creditUnionName = requiredPersonalization(
    fields.creditUnionName,
    "Credit union name"
  );
  const firstName = firstNameFromCreditUnionContact(fields.firstName);
  const opening = requiredPersonalization(
    fields.verifiedPersonalizedOpening,
    "Verified personalized opening"
  );
  const contentIdea = asSentence(
    requiredPersonalization(fields.specificContentIdea, "Specific content idea")
  );
  const repurposingIdea = asSentence(
    requiredPersonalization(
      fields.specificRepurposingIdea,
      "Specific repurposing idea"
    )
  );
  const initialSubject = `Is ${creditUnionName} reaching the next generation of members?`;
  const followupSubject = `Re: ${initialSubject}`;

  const initial = renderEmail({
    subject: initialSubject,
    firstName,
    physicalPostalAddress: fields.physicalPostalAddress,
    unsubscribeUrl: fields.unsubscribeUrl,
    paragraphs: [
      opening,
      "I’m Jeremy with Jeristotle Productions. We specialize in helping credit unions update their social media and content to reach the next generation of new members in their communities.",
      "Reaching younger members takes more than posting more often or reusing the same static content. It takes fresh, relevant stories that show why joining matters and make your local community feel represented.",
      "We create movie-level, social-first videos and campaign content that can carry that message across Instagram, Facebook, YouTube, and streaming, with local versions built around the communities your branches serve.",
      `Is growing the next generation of members a focus for ${creditUnionName} as you plan for 2027?`,
      "Would you be open to a free 15–20-minute consultation next week to compare ideas?",
    ],
  });

  const followupOne = renderEmail({
    subject: followupSubject,
    firstName,
    physicalPostalAddress: fields.physicalPostalAddress,
    unsubscribeUrl: fields.unsubscribeUrl,
    paragraphs: [
      "Another challenge is keeping content current without making your marketing team responsible for every shoot, edit, and post.",
      "Member testimonials and financial-literacy programs can show the difference your credit union makes. A planned shoot can refresh those stories and give your team a useful library, instead of another standalone video to figure out how to use.",
      `One idea for ${creditUnionName}: ${contentIdea}`,
      repurposingIdea,
      "We can work as an extension of your team, with scheduled production, clear approvals, and practical support using the finished content on social media. Your team keeps the direction; we help with execution.",
      "Would a free 15–20-minute consultation be useful to discuss what needs updating and where your team could use a hand?",
    ],
  });

  const followupTwo = renderEmail({
    subject: followupSubject,
    firstName,
    physicalPostalAddress: fields.physicalPostalAddress,
    unsubscribeUrl: fields.unsubscribeUrl,
    paragraphs: [
      `One final thought for ${creditUnionName}: what happens after someone shows interest at a community event or responds to a video?`,
      "A missed phone call should not end the conversation. A short, helpful video and interest-based email follow-up can keep it going. Someone asking about improving their credit should hear something different from someone interested in an auto loan.",
      "We can help connect that content to opt-in inquiry forms and follow-up through your existing systems, with a clear next step to speak with your team or visit a branch. It can complement your in-person outreach even when account opening still happens in person.",
      "The aim is to track more than views: requested information, booked conversations, and branch follow-through where your team can measure it.",
      "Would a free 15–20-minute consultation be worthwhile to explore that path? If now is not the right time, I’ll leave it here.",
    ],
  });

  return [
    {
      sequenceStep: 0,
      dayOffset: 0,
      subject: initialSubject,
      alternativeSubject: null,
      ...initial,
    },
    {
      sequenceStep: 1,
      dayOffset: 3,
      subject: followupSubject,
      alternativeSubject:
        "Keeping your content current without more work for your team",
      ...followupOne,
    },
    {
      sequenceStep: 2,
      dayOffset: 8,
      subject: followupSubject,
      alternativeSubject: `After the event: keeping interest moving for ${creditUnionName}`,
      ...followupTwo,
    },
  ];
}

/**
 * Pure planning helper. Every touch is calculated from the actual initial-send
 * timestamp, rather than chaining the next offset after a rolled follow-up.
 */
export function planCreditUnionSequenceFromFirstSend(
  firstSentAt: Date,
  sendHourLocal = 9,
  timeZone = CREDIT_UNION_TIME_ZONE
) {
  return CREDIT_UNION_DAY_OFFSETS.map(dayOffset => ({
    sequenceStep: CREDIT_UNION_DAY_OFFSETS.indexOf(dayOffset),
    dayOffset,
    plannedAt:
      dayOffset === 0
        ? firstSentAt
        : getNextFollowupAt(firstSentAt, dayOffset, sendHourLocal, timeZone),
  }));
}

/** Pure future-send readiness predicate; it never authorizes or sends email. */
export function getCreditUnionSendReadiness(
  input: CreditUnionReadinessInput
): CreditUnionReadiness {
  const reasons: string[] = [];
  if (input.campaignStatus !== "active") {
    reasons.push("Campaign is not active.");
  }
  if (!input.listApprovedAt) {
    reasons.push("Prospect list has not been approved.");
  }
  if (!input.configApprovedAt) {
    reasons.push("Campaign configuration has not been approved.");
  }
  if (
    !isCreditUnionTargetingReady({
      name: input.primaryContactName,
      title: input.primaryContactTitle,
      email: input.primaryEmail,
      emailConfidence: input.emailConfidence,
      emailSourceUrl: input.primaryEmailSourceUrl,
      roleSourceUrl: input.primaryRoleSourceUrl,
    })
  ) {
    reasons.push(
      "A named marketing-relevant contact needs valid current-role and exact email source URLs plus an exact, sourced, non-generic business email; alternatively, use a verified official marketing or communications department recipient."
    );
  }
  if (input.crossCampaignBlock) {
    reasons.push(input.crossCampaignBlock);
  }
  if (input.duplicate) {
    reasons.push("Duplicate contact or organization identity requires review.");
  }
  if (input.suppressed) {
    reasons.push("Contact is on the shared suppression list.");
  }
  if (terminalProspectStatuses.has(input.prospectStatus)) {
    reasons.push("Prospect is in a terminal or response status.");
  }
  if (
    input.messageStatuses.length !== 3 ||
    input.messageStatuses.some(status => status !== "approved")
  ) {
    reasons.push("All three messages must be approved.");
  }
  return { ready: reasons.length === 0, reasons };
}

/** Draft approval is intentionally narrower than launch/send readiness. */
export function getCreditUnionDraftApprovalReadiness(input: {
  primaryContactName: string | null;
  primaryContactTitle: string | null;
  primaryEmail: string | null;
  emailConfidence: CreditUnionEmailConfidence;
  primaryEmailSourceUrl: string | null;
  primaryRoleSourceUrl: string | null;
  prospectStatus: CreditUnionProspectStatus;
  crossCampaignBlock: string | null;
  duplicate: boolean;
  suppressed: boolean;
  messageStatuses: CreditUnionMessageStatus[];
}): CreditUnionReadiness {
  const reasons: string[] = [];
  if (
    !isCreditUnionTargetingReady({
      name: input.primaryContactName,
      title: input.primaryContactTitle,
      email: input.primaryEmail,
      emailConfidence: input.emailConfidence,
      emailSourceUrl: input.primaryEmailSourceUrl,
      roleSourceUrl: input.primaryRoleSourceUrl,
    })
  ) {
    reasons.push(
      "A named marketing-relevant contact needs valid current-role and exact email source URLs plus an exact, sourced, non-generic business email; alternatively, use a verified official marketing or communications department recipient."
    );
  }
  if (input.crossCampaignBlock) reasons.push(input.crossCampaignBlock);
  if (input.duplicate) reasons.push("Duplicate identity requires review.");
  if (input.suppressed)
    reasons.push("Contact is on the shared suppression list.");
  if (terminalProspectStatuses.has(input.prospectStatus)) {
    reasons.push("Prospect is in a terminal or response status.");
  }
  if (input.prospectStatus === "verification_needed") {
    reasons.push("Prospect still needs contact verification.");
  }
  if (
    input.messageStatuses.length !== 3 ||
    input.messageStatuses.some(status => status !== "draft")
  ) {
    reasons.push("Exactly three unapproved draft messages are required.");
  }
  return { ready: reasons.length === 0, reasons };
}

/** Contact identity may change only while an unsent prospect remains unapproved. */
export function canEditCreditUnionContact(input: {
  firstSentAt: Date | null | undefined;
  outreachStatus: CreditUnionOutreachStatus;
}) {
  return (
    !input.firstSentAt &&
    (input.outreachStatus === "blocked" || input.outreachStatus === "draft")
  );
}

export function getCreditUnionListUnsubscribeHeaders(unsubscribeUrl: string) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:jeremy@jeristotleproductions.com?subject=Unsubscribe>`,
  };
}
