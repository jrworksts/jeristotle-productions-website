import { createHash } from "node:crypto";
import { z } from "zod";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from "./outboundReplenishmentPolicy";
import {
  isPublicTrainingHttpUrl,
  normalizeTrainingEmail,
  parseTrainingResearchImport,
  type TrainingResearchImport,
  type TrainingResearchProspect,
} from "./trainingOutreach";

/** Versioned, agent-to-owner contract; it is intentionally not a public UI form. */
export const TRAINING_RESEARCH_PACKET_VERSION = "training-research-packet-v1";
export const TRAINING_RESEARCH_MAX_BATCH = 12;
export const TRAINING_RESEARCH_MAX_UNVERIFIED = 6;
export const TRAINING_RESEARCH_READY_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
/** Global unique-alias context bound, not a row limit or a per-source quota. */
export const TRAINING_RESEARCH_MAX_EXISTING_IDENTITIES = 10_000;

export type TrainingResearchFailure = {
  sourceUrl: string | null;
  reason: string;
};

export type ParsedTrainingResearchPacket = {
  version: typeof TRAINING_RESEARCH_PACKET_VERSION;
  researchedOn: string;
  /** True only when the research agent exhausted eligible public sources. */
  eligiblePublicSourcesExhausted: boolean;
  failures: TrainingResearchFailure[];
  prospects: TrainingResearchProspect[];
  /** Null only for an explicit, evidence-free exhaustion report. */
  importData: TrainingResearchImport | null;
  packetHash: string;
  evidenceDigest: string;
};

const publicUrl = z
  .string()
  .trim()
  .max(500)
  .refine(value => isPublicTrainingHttpUrl(value), {
    message: "Source URLs must be public HTTP(S) URLs.",
  });

const packetEnvelopeSchema = z
  .object({
    version: z.literal(TRAINING_RESEARCH_PACKET_VERSION),
    researchedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "researchedOn must be YYYY-MM-DD."),
    eligiblePublicSourcesExhausted: z.boolean().optional().default(false),
    failures: z
      .array(
        z
          .object({
            sourceUrl: publicUrl.nullable().optional().default(null),
            reason: z.string().trim().min(1).max(1_000),
          })
          .strict()
      )
      .max(24)
      .optional()
      .default([]),
    // Detailed prospect validation remains centralized in parseTrainingResearchImport.
    prospects: z.array(z.unknown()).max(TRAINING_RESEARCH_MAX_BATCH),
  })
  .strict();

const prospectKeys = new Set([
  "businessName",
  "website",
  "location",
  "industry",
  "qualificationStatus",
  "priorityRank",
  "fitScore",
  "fitReason",
  "verifiedObservation",
  "useCase",
  "pilotScope",
  "contactName",
  "contactTitle",
  "contactSourceUrl",
  "businessEmail",
  "businessEmailSourceUrl",
  "emailRecipientType",
  "businessPhone",
  "phoneSourceUrl",
  "sizeIndicator",
  "sizeSourceUrl",
  "localAuthorityEvidence",
  "uncertainties",
  "facts",
  "operationalSignals",
  "sources",
  "selectedForDraft",
  "recommendFirst",
]);

const citationKeys = new Set(["text", "url"]);
const sourceKeys = new Set(["url", "supports"]);

function assertPlainRecord(
  value: unknown,
  path: string
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
}

/**
 * The base import parser strips unknown keys by design. Scheduled research must
 * reject them instead: task/campaign/sender/status fields are never agent input.
 */
function assertOnlyKnownPacketFields(value: unknown) {
  assertPlainRecord(value, "packet");
  const prospects = value.prospects;
  if (!Array.isArray(prospects)) return;

  prospects.forEach((prospect, index) => {
    assertPlainRecord(prospect, `prospects[${index}]`);
    for (const key of Object.keys(prospect)) {
      if (!prospectKeys.has(key)) {
        throw new Error(
          `prospects[${index}].${key} is not allowed in a research packet.`
        );
      }
    }

    for (const field of ["facts", "operationalSignals"] as const) {
      const citations = prospect[field];
      if (!Array.isArray(citations)) continue;
      citations.forEach((citation, citationIndex) => {
        assertPlainRecord(
          citation,
          `prospects[${index}].${field}[${citationIndex}]`
        );
        for (const key of Object.keys(citation)) {
          if (!citationKeys.has(key)) {
            throw new Error(
              `prospects[${index}].${field}[${citationIndex}].${key} is not allowed.`
            );
          }
        }
      });
    }

    const sources = prospect.sources;
    if (!Array.isArray(sources)) return;
    sources.forEach((source, sourceIndex) => {
      assertPlainRecord(source, `prospects[${index}].sources[${sourceIndex}]`);
      for (const key of Object.keys(source)) {
        if (!sourceKeys.has(key)) {
          throw new Error(
            `prospects[${index}].sources[${sourceIndex}].${key} is not allowed.`
          );
        }
      }
    });
  });
}

function assertAvailableEvidence(
  prospect: TrainingResearchProspect,
  index: number
) {
  if (prospect.facts.length === 0) {
    throw new Error(
      `prospects[${index}] must include at least one source-backed public fact.`
    );
  }
  if (prospect.sources.length === 0) {
    throw new Error(
      `prospects[${index}] must include sources that make its evidence available.`
    );
  }

  const available = new Set(prospect.sources.map(source => source.url));
  const assertAvailable = (url: string | null, label: string) => {
    if (url && !available.has(url)) {
      throw new Error(
        `prospects[${index}].${label} must reference a URL listed in sources.`
      );
    }
  };

  prospect.facts.forEach((fact, factIndex) =>
    assertAvailable(fact.url, `facts[${factIndex}].url`)
  );
  prospect.operationalSignals.forEach((signal, signalIndex) =>
    assertAvailable(signal.url, `operationalSignals[${signalIndex}].url`)
  );
  assertAvailable(prospect.contactSourceUrl, "contactSourceUrl");
  assertAvailable(prospect.businessEmailSourceUrl, "businessEmailSourceUrl");
  assertAvailable(prospect.phoneSourceUrl, "phoneSourceUrl");
  assertAvailable(prospect.sizeSourceUrl, "sizeSourceUrl");

  if (prospect.businessEmail) {
    const email = normalizeTrainingEmail(prospect.businessEmail);
    if (!email) {
      throw new Error(`prospects[${index}] has an invalid business email.`);
    }
    const sourceBackedEmailFact = prospect.facts.some(
      fact =>
        fact.url === prospect.businessEmailSourceUrl &&
        fact.text.toLowerCase().includes(email)
    );
    if (!sourceBackedEmailFact) {
      throw new Error(
        `prospects[${index}] email must be published in a cited fact; guessed pattern emails are not allowed.`
      );
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)])
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function sorted<T>(values: T[], selector: (value: T) => string) {
  return [...values].sort((left, right) =>
    selector(left).localeCompare(selector(right))
  );
}

function packetProjection(input: {
  researchedOn: string;
  eligiblePublicSourcesExhausted: boolean;
  failures: TrainingResearchFailure[];
  prospects: TrainingResearchProspect[];
}) {
  return {
    version: TRAINING_RESEARCH_PACKET_VERSION,
    researchedOn: input.researchedOn,
    eligiblePublicSourcesExhausted: input.eligiblePublicSourcesExhausted,
    failures: sorted(
      input.failures,
      failure => `${failure.sourceUrl ?? ""}\u0000${failure.reason}`
    ),
    prospects: [...input.prospects]
      .sort(
        (left, right) =>
          left.priorityRank - right.priorityRank ||
          left.businessName.localeCompare(right.businessName)
      )
      .map(prospect => ({
        ...prospect,
        uncertainties: [...prospect.uncertainties].sort(),
        facts: sorted(prospect.facts, fact => `${fact.url}\u0000${fact.text}`),
        operationalSignals: sorted(
          prospect.operationalSignals,
          signal => `${signal.url}\u0000${signal.text}`
        ),
        sources: sorted(
          prospect.sources,
          source => `${source.url}\u0000${source.supports}`
        ),
      })),
  };
}

function evidenceProjection(prospects: TrainingResearchProspect[]) {
  return [...prospects]
    .sort((left, right) => left.businessName.localeCompare(right.businessName))
    .map(prospect => ({
      businessName: prospect.businessName,
      website: prospect.website,
      businessEmail: prospect.businessEmail,
      businessEmailSourceUrl: prospect.businessEmailSourceUrl,
      facts: sorted(prospect.facts, fact => `${fact.url}\u0000${fact.text}`),
      operationalSignals: sorted(
        prospect.operationalSignals,
        signal => `${signal.url}\u0000${signal.text}`
      ),
      sources: sorted(
        prospect.sources,
        source => `${source.url}\u0000${source.supports}`
      ),
    }));
}

/**
 * Parses an isolated agent writeback packet. The parser does not accept a
 * campaign/task/sender/status field and therefore cannot be used to alter
 * scheduling, approval, enrollment, or outbound-mail controls.
 */
export function parseTrainingResearchPacket(
  input: unknown
): ParsedTrainingResearchPacket {
  const envelope = packetEnvelopeSchema.parse(input);
  assertOnlyKnownPacketFields(input);

  if (envelope.prospects.length === 0) {
    if (!envelope.eligiblePublicSourcesExhausted) {
      throw new Error(
        "An empty research packet is valid only when eligible public sources were exhausted."
      );
    }
    const packetHash = sha256(
      packetProjection({
        researchedOn: envelope.researchedOn,
        eligiblePublicSourcesExhausted: true,
        failures: envelope.failures,
        prospects: [],
      })
    );
    return {
      version: TRAINING_RESEARCH_PACKET_VERSION,
      researchedOn: envelope.researchedOn,
      eligiblePublicSourcesExhausted: true,
      failures: envelope.failures,
      prospects: [],
      importData: null,
      packetHash,
      evidenceDigest: sha256([]),
    };
  }

  const importData = parseTrainingResearchImport({
    researchedOn: envelope.researchedOn,
    prospects: envelope.prospects,
  });
  const unverified = importData.prospects.filter(
    prospect => !prospect.businessEmail
  ).length;
  if (unverified > TRAINING_RESEARCH_MAX_UNVERIFIED) {
    throw new Error(
      `A research packet can contain no more than ${TRAINING_RESEARCH_MAX_UNVERIFIED} unverified records.`
    );
  }

  importData.prospects.forEach(assertAvailableEvidence);
  const projection = packetProjection({
    researchedOn: importData.researchedOn,
    eligiblePublicSourcesExhausted: envelope.eligiblePublicSourcesExhausted,
    failures: envelope.failures,
    prospects: importData.prospects,
  });

  return {
    version: TRAINING_RESEARCH_PACKET_VERSION,
    researchedOn: importData.researchedOn,
    eligiblePublicSourcesExhausted: envelope.eligiblePublicSourcesExhausted,
    failures: envelope.failures,
    prospects: importData.prospects,
    importData,
    packetHash: sha256(projection),
    evidenceDigest: sha256(evidenceProjection(importData.prospects)),
  };
}
