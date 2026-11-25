import type { ChamberOutreachProspect } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { normalizeOutreachPunctuation } from "./outreachEmail";

export type ProspectPersonalization = {
  status: "approved" | "insufficient";
  personalizedSubject: string;
  personalizedOpening: string;
  questionAboutGoals: string;
  personalizedHelpAngle: string;
  researchSummary: string;
  claimsToAvoid: string[];
  sources: string[];
  confidence: number;
};

const disallowed =
  /\$|3,?500|ongoing|monthly|distribution|guarantee|guaranteed|discount|package/i;

export function validateProspectPersonalization(
  value: ProspectPersonalization
): ProspectPersonalization {
  const clean = (text: string) => normalizeOutreachPunctuation(text.trim());
  const result = {
    ...value,
    personalizedSubject: clean(value.personalizedSubject),
    personalizedOpening: clean(value.personalizedOpening),
    questionAboutGoals: clean(value.questionAboutGoals),
    personalizedHelpAngle: clean(value.personalizedHelpAngle),
    researchSummary: clean(value.researchSummary),
    claimsToAvoid: value.claimsToAvoid.map(clean),
    sources: value.sources.filter(source => /^https?:\/\//i.test(source)),
  };
  const required = [
    result.personalizedSubject,
    result.personalizedOpening,
    result.questionAboutGoals,
    result.personalizedHelpAngle,
    result.researchSummary,
  ];
  if (required.some(item => item.length < 18)) {
    throw new Error("Personalization is missing a substantive field");
  }
  if (!result.questionAboutGoals.endsWith("?")) {
    throw new Error("The goals prompt must end with a question");
  }
  if (required.some(item => disallowed.test(item))) {
    throw new Error(
      "Personalization contains disallowed sales or outcome language"
    );
  }
  if (result.sources.length === 0) {
    throw new Error("Personalization must include at least one public source");
  }
  if (result.confidence < 0 || result.confidence > 1) {
    throw new Error("Confidence must be between zero and one");
  }
  return result;
}

function htmlToReadableText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18_000);
}

export async function fetchProspectWebsiteText(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("A public website URL is required for personalization");
  }
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(5_000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; JeristotleProspectResearch/1.0; +https://jeristotleproductions.com/)",
    },
  });
  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status}`);
  }
  const text = htmlToReadableText(await response.text());
  if (text.length < 500) {
    throw new Error(
      "Website did not provide enough public text to personalize safely"
    );
  }
  return text;
}

export async function researchOutreachProspect(
  prospect: ChamberOutreachProspect
): Promise<ProspectPersonalization> {
  const website = prospect.website || "";
  const sources = [website, prospect.sourceUrl].filter(
    (url): url is string =>
      Boolean(url && /^https?:\/\//i.test(url)) && !/\/list\/?$/i.test(url!)
  );
  let websiteText = "";
  let verifiedSource = "";
  let lastError: unknown;
  for (const source of Array.from(new Set(sources))) {
    try {
      websiteText = await fetchProspectWebsiteText(source);
      verifiedSource = source;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!verifiedSource)
    throw (
      lastError || new Error("No usable public company source is available")
    );
  const response = await invokeLLM({
    model: "gpt-5-mini",
    max_completion_tokens: 3_000,
    reasoning: { effort: "minimal" },
    signal: AbortSignal.timeout(18_000),
    outputSchema: {
      name: "chamber_prospect_personalization",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: ["approved", "insufficient"] },
          personalizedSubject: { type: "string" },
          personalizedOpening: { type: "string" },
          questionAboutGoals: { type: "string" },
          personalizedHelpAngle: { type: "string" },
          researchSummary: { type: "string" },
          claimsToAvoid: { type: "array", items: { type: "string" } },
          sources: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "status",
          "personalizedSubject",
          "personalizedOpening",
          "questionAboutGoals",
          "personalizedHelpAngle",
          "researchSummary",
          "claimsToAvoid",
          "sources",
          "confidence",
        ],
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are a careful B2B prospect researcher for Jeristotle Productions in Corpus Christi. Use only the supplied directory record and website text. Never invent facts. Mark status insufficient when the website does not support one specific observation. Write concise, natural email ingredients, not a full email. Do not use em dashes. Do not mention price, discounts, packages, ongoing work, monthly services, distribution, guaranteed outcomes, weak marketing, or assumed problems. The help angle must be framed as one optional possibility. The goals prompt must be one genuine question. The subject must be specific but not clickbait. Use only the supplied verifiedSource in sources. Confidence 0.90 or higher is reserved for facts directly supported by the supplied website text.",
      },
      {
        role: "user",
        content: JSON.stringify({
          chamberRecord: {
            company: prospect.businessName,
            category: prospect.category,
            contactName: prospect.contactName,
            email: prospect.email,
            website,
          },
          websiteText,
          verifiedSource,
          requiredPositioning:
            "Jeristotle creates movie-level content production for small businesses. Explore the prospect's 2027 content goals through one relevant optional creative idea and a short conversation. Do not pitch an offer or package.",
        }),
      },
    ],
  });
  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Research output was truncated; retry required, not a business-fit rejection"
    );
  }
  const raw = choice?.message.content;
  if (typeof raw !== "string") {
    throw new Error("Personalization model did not return JSON text");
  }
  const parsed = validateProspectPersonalization(
    JSON.parse(raw) as ProspectPersonalization
  );
  if (parsed.sources.some(source => source !== verifiedSource)) {
    throw new Error("Research cited a source that was not actually fetched");
  }
  if (parsed.status !== "approved" || parsed.confidence < 0.9) {
    throw new Error(
      "Public evidence was not strong enough for automated outreach"
    );
  }
  return parsed;
}
