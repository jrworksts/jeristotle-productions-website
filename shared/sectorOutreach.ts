import { getOutreachLocalMoment } from "./outreachSchedule";
import { getBrandVideoCalendarDayAt } from "./brandVideoOutreach";
import { renderJeristotleOutreachEmail } from "./outreachFormatting";
import { OUTREACH_NEW_CONTACTS_PER_CAMPAIGN_DAY } from "./outboundReplenishmentPolicy";

export const SECTOR_GROUP_SLUG = "coastal-bend-four-sector-outreach-2026";
/** Historical draft/activation marker remains pinned; active config migrates separately. */
export const SECTOR_VERSION = "sector-draft-review-v2";
export const SECTOR_CAP_POLICY_VERSION = "sector-ten-new-reserve-50-2026-11-05-v1";
export const SECTOR_TIME_ZONE = "America/Chicago";
/** Each of the four campaigns has its OWN ten-new-contact budget. Follow-ups are additional. */
export const SECTOR_DAILY_NEW_PER_CAMPAIGN = OUTREACH_NEW_CONTACTS_PER_CAMPAIGN_DAY;
export const SECTOR_SEND_SEVEN_DAYS = true;
export const SECTOR_FOLLOWUP_BUSINESS_DAYS = [4, 8] as const;
export const SECTOR_CTA = "Worth sending you a short example?";
export const SECTOR_COPY_VERSION = "sector-example-first-v1";
export const SECTOR_KEYS = [
  "tourism",
  "real_estate",
  "industrial",
  "healthcare",
] as const;
export type SectorKey = (typeof SECTOR_KEYS)[number];
export type SectorMessage = {
  messageNumber: 1 | 2 | 3;
  subject: string;
  body: string;
};
export type SectorDefinition = {
  key: SectorKey;
  name: string;
  targetCriteria: string;
  buyerCriteria: string;
  outcome: string;
  exclusions: string;
  personalizationFields: string[];
  messages: SectorMessage[];
};

export const SECTOR_SIGNATURE = [
  "Jeremy",
  "",
  "Jeremy Wells",
  "Creative Director",
  "Jeristotle Productions",
  "319 N Mesquite St, Corpus Christi, TX 78401",
  'To stop these emails, reply "unsubscribe".',
].join("\n");
const body = (paragraphs: string[]) =>
  [...paragraphs, SECTOR_SIGNATURE].join("\n\n");

/** Bracketed fields are visibly UNRESOLVED template tokens, not invented prospect facts. */
export const SECTOR_DEFINITIONS: SectorDefinition[] = [
  {
    key: "tourism",
    name: "Tourism, hospitality & experiences",
    targetCriteria:
      "Coastal Bend hotels, resorts, attractions, event venues, fishing/boating operators and restaurant groups with a current official operating presence and a specific experience worth showing.",
    buyerCriteria:
      "Published marketing, commercial, sales or owner/operator contact responsible for promotion. A publicly published general business inbox may use an explicitly truthful company-team greeting.",
    outcome:
      "Reservations, bookings, seasonal demand or appropriate event interest.",
    exclusions:
      "Closed operators, single-branch duplicates, restricted press/support/reservation-only inboxes, existing clients, prior outreach overlaps and suppressed contacts.",
    personalizationFields: [
      "Company",
      "First name / Company team",
      "Verified experience or seasonal fact",
      "Official fact source URL",
      "Proposed story angle",
      "Proposed scenes",
      "Relevant booking goal",
    ],
    messages: [
      {
        messageNumber: 1,
        subject: "A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "I noticed [verified fact about the company, experience, location, or seasonal offering].",
          "I’m Jeremy Wells with Jeristotle Productions in Corpus Christi. We create cinematic brand films, short-form video, and photography businesses use across websites, social media, advertising, and sales.",
          "For [Company], I’d explore a short film focused on [specific experience], then cut it into content supporting [bookings / seasonal demand / group inquiries].",
          "We’ve created this type of content for hospitality brands.",
          "Worth sending you a short example?",
        ]),
      },
      {
        messageNumber: 2,
        subject: "Re: A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "One possible direction would be following a guest through the first few moments of [specific experience].",
          "The main film could support your website and brand, while shorter edits could help promote [specific offer or seasonal opportunity].",
          "Would it be useful if I sent over a relevant example?",
        ]),
      },
      {
        messageNumber: 3,
        subject: "Re: A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "Closing the loop here.",
          "If creating a stronger content library for [bookings / seasonal demand / group inquiries] becomes relevant, reply and I’ll send a few ideas specific to [Company].",
          "If not, no problem.",
        ]),
      },
    ],
  },
  {
    key: "real_estate",
    name: "Developers & established brokerages",
    targetCriteria:
      "Coastal Bend developers, residential communities, commercial property groups and established brokerages with a verified active development, launch, portfolio or recruiting initiative. Do not label a brokerage high-performing without evidence.",
    buyerCriteria:
      "Published marketing, development, brokerage leadership or owner contact with relevant project responsibility; general business inbox only with a company-team greeting.",
    outcome:
      "Qualified property inquiries, tours, launch interest or recruiting conversations. Investor-facing material requires a separately approved scope and claims.",
    exclusions:
      "Private owner/patient-type data, guessed contacts, expired listings, unsupported returns/occupancy/financing claims, existing relationships and campaign overlaps.",
    personalizationFields: [
      "Company",
      "First name / Company team",
      "Verified development or brokerage fact",
      "Official fact source URL",
      "Proposed property/lifestyle angle",
      "Proposed scenes",
      "Relevant inquiry or tour goal",
    ],
    messages: [
      {
        messageNumber: 1,
        subject: "Give buyers a feel for [Property or Company]",
        body: body([
          "Hi [First name / Company team],",
          "I noticed [verified fact about the development, property, portfolio, or brokerage].",
          "I’m Jeremy Wells with Jeristotle Productions in Corpus Christi. We create cinematic brand films, property videos, short-form content, and photography for businesses that need to communicate value visually.",
          "For [Company], I’d explore a film that gives buyers a feel for [specific property, development, neighborhood, or lifestyle] before they decide to schedule a tour.",
          "Shorter edits could support [property inquiries / tour requests / launch interest].",
          "Worth sending you a short example?",
        ]),
      },
      {
        messageNumber: 2,
        subject: "Re: Give buyers a feel for [Property or Company]",
        body: body([
          "Hi [First name / Company team],",
          "One possible direction would be a street-to-front-door sequence showing what it feels like to arrive at [property or development].",
          "The main film could support the launch or listing, while shorter edits could direct interested viewers toward a tour request.",
          "Would it be useful if I sent over a relevant example?",
        ]),
      },
      {
        messageNumber: 3,
        subject: "Re: Give buyers a feel for [Property or Company]",
        body: body([
          "Hi [First name / Company team],",
          "Closing the loop here.",
          "If stronger visual content for [property inquiries / tour requests / launch interest] becomes relevant, reply and I’ll send a few ideas specific to [Company].",
          "If not, no problem.",
        ]),
      },
    ],
  },
  {
    key: "industrial",
    name: "Industrial, energy & technical B2B",
    targetCriteria:
      "Coastal Bend energy, manufacturing, engineering, logistics, technical-services and industrial-supply firms with verified facilities/services and a clear B2B capability or recruiting story.",
    buyerCriteria:
      "Published marketing, business-development, commercial leadership, recruiting or executive contact whose current role matches the proposed objective. No safety/training buyer inference solely from a title.",
    outcome:
      "Clearer capability communication, sales conversations, customer education or recruiting interest.",
    exclusions:
      "Unverified certification/safety/engineering claims, confidential customer/process footage, price-led offers, consumer advertising language, existing Training/campaign overlaps and suppressions.",
    personalizationFields: [
      "Company",
      "First name / Company team",
      "Verified capability, facility or hiring fact",
      "Official fact source URL",
      "Proposed capability story",
      "Proposed approved scenes",
      "Relevant B2B or recruiting goal",
    ],
    messages: [
      {
        messageNumber: 1,
        subject: "A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "I noticed [verified capability, facility, service, or hiring fact].",
          "I’m Jeremy Wells with Jeristotle Productions in Corpus Christi. We create professional video and photography that help technical companies explain their capabilities to customers, prospects, and future employees.",
          "For [Company], I’d explore a capabilities film focused on [specific approved capability].",
          "The full film could support sales conversations, while shorter edits could introduce that capability to relevant prospects.",
          "Worth sending you a short example?",
        ]),
      },
      {
        messageNumber: 2,
        subject: "Re: A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "One possible direction would be filming an approved demonstration of [specific capability], with a team member explaining where it fits in a customer’s project.",
          "The longer version could support sales follow-up, while shorter edits could introduce the capability to new prospects.",
          "Would it be useful if I sent over a relevant example?",
        ]),
      },
      {
        messageNumber: 3,
        subject: "Re: A content idea for [Company]",
        body: body([
          "Hi [First name / Company team],",
          "Closing the loop here.",
          "If clearer content around [specific capability / customer education / recruiting] becomes relevant, reply and I’ll send a few ideas specific to [Company].",
          "If not, no problem.",
        ]),
      },
    ],
  },
  {
    key: "healthcare",
    name: "Healthcare groups & specialty clinics",
    targetCriteria:
      "Coastal Bend multi-location healthcare groups and specialty practices with verified services, locations or recruiting needs. Research public business information only.",
    buyerCriteria:
      "Published marketing, practice administration, recruiting or group leadership with relevant remit; no personal clinician contact guessing or patient communication routes.",
    outcome:
      "Appropriate service inquiries, clearer patient-experience education or recruiting interest.",
    exclusions:
      "Patient data, patient testimonials without rights, unsupported clinical outcomes, diagnosis/medical advice, guarantees, patient-only intake/support routes, existing overlaps and suppressions.",
    personalizationFields: [
      "Company",
      "First name / Company team",
      "Verified service, location or hiring fact",
      "Official fact source URL",
      "Proposed educational angle",
      "Proposed non-patient scenes",
      "Relevant inquiry or recruiting goal",
    ],
    messages: [
      {
        messageNumber: 1,
        subject: "A content idea for [Practice or Group]",
        body: body([
          "Hi [First name / Company team],",
          "I noticed [verified service, location, specialty, or recruiting fact].",
          "I’m Jeremy Wells with Jeristotle Productions in Corpus Christi. We create professional video and photography that help organizations explain their services, experience, and people clearly.",
          "For [Company], I’d explore an educational film about [specific approved service or patient-experience topic].",
          "Shorter approved clips could direct viewers to the relevant service page or support recruiting efforts.",
          "Worth sending you a short example?",
        ]),
      },
      {
        messageNumber: 2,
        subject: "Re: A content idea for [Practice or Group]",
        body: body([
          "Hi [First name / Company team],",
          "One possible direction would be filming a staff member explaining what someone can expect when they first contact or visit the practice.",
          "A shorter approved clip could answer a practical question and direct viewers to the relevant service page.",
          "Would it be useful if I sent over a relevant example?",
        ]),
      },
      {
        messageNumber: 3,
        subject: "Re: A content idea for [Practice or Group]",
        body: body([
          "Hi [First name / Company team],",
          "Closing the loop here.",
          "If clearer content around [approved service / patient education / recruiting] becomes relevant, reply and I’ll send a few ideas specific to [Company].",
          "If not, no problem.",
        ]),
      },
    ],
  },
];

export function sectorFollowupAt(
  previousAcceptedAt: Date,
  messageNumber: 2 | 3,
  timeZone = SECTOR_TIME_ZONE
) {
  const required = messageNumber === 2 ? 4 : 8;
  let counted = 0;
  for (let offset = 1; offset <= 20; offset++) {
    const candidate = getBrandVideoCalendarDayAt(
      previousAcceptedAt,
      offset,
      9,
      timeZone
    );
    const local = getOutreachLocalMoment(candidate, timeZone);
    if (local.weekday === "Saturday" || local.weekday === "Sunday") continue;
    counted++;
    if (counted === required) return candidate;
  }
  throw new Error("Unable to calculate business-day follow-up");
}

export function sectorTemplateHasPlaceholders(subject: string, text: string) {
  return /\[[^\]]+\]/.test(subject + "\n" + text);
}
export function sectorEmailPreview(message: SectorMessage) {
  return renderJeristotleOutreachEmail({
    subject: message.subject,
    text: message.body,
    physicalPostalAddress: "319 N Mesquite St, Corpus Christi, TX 78401",
    linkFree: true,
  });
}

/** Draft planner only, NOT a live dispatcher. No SMTP, DB writes or committed schedules.
 * Counts are this Chicago date's NEW attempts per campaign, including uncertain new attempts.
 * Eligible follow-ups never consume the new-contact budget. Saturday/Sunday are eligible send days.
 */
export function planSectorDay<
  T extends {
    sector: SectorKey;
    messageNumber: 1 | 2 | 3;
    stopped: boolean;
    verified: boolean;
    unresolvedTokens: boolean;
    dueAt: Date;
  },
>(input: {
  candidates: T[];
  alreadyAttemptedNew: Record<SectorKey, number>;
  now: Date;
  cursor?: number;
}) {
  const used = SECTOR_KEYS.map(key => {
    const count = input.alreadyAttemptedNew[key];
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count))
      throw new Error(
        "Complete nonnegative per-campaign new-attempt counts are required"
      );
    return count;
  });
  const eligible = input.candidates.filter(
    c =>
      SECTOR_KEYS.includes(c.sector) &&
      [1, 2, 3].includes(c.messageNumber) &&
      c.verified &&
      !c.stopped &&
      !c.unresolvedTokens &&
      c.dueAt <= input.now
  );
  const buckets = SECTOR_KEYS.map(key =>
    eligible
      .filter(c => c.sector === key)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  );
  const result: T[] = [];
  const start = Math.abs(Math.floor(input.cursor ?? 0)) % 4;
  while (buckets.some(b => b.length)) {
    for (let index = 0; index < 4; index++) {
      const campaign = (start + index) % 4;
      const next = buckets[campaign].shift();
      if (
        !next ||
        (next.messageNumber === 1 &&
          used[campaign] >= SECTOR_DAILY_NEW_PER_CAMPAIGN)
      )
        continue;
      result.push(next);
      if (next.messageNumber === 1) used[campaign]++;
    }
  }
  return result;
}
