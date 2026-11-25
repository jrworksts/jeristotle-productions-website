import type { Request, Response } from "express";
import { asc, eq, gt } from "drizzle-orm";
import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";
import {
  OUTREACH_INITIAL_REFILL_START_BELOW,
  OUTREACH_REPLENISHMENT_POLICY_VERSION,
} from "../shared/outboundReplenishmentPolicy";
import {
  brandVideoProspects,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  creditUnionProspects,
  trainingOutreachCampaigns,
  trainingOutreachEvents,
  trainingOutreachMessages,
  trainingOutreachProspects,
  hustleProspects,
  sectorOutreachProspects,
  type TrainingOutreachCampaign,
} from "../drizzle/schema";
import { TRAINING_OUTREACH_CAMPAIGN_SLUG } from "../shared/trainingOutreach";
import {
  TRAINING_RESEARCH_MAX_EXISTING_IDENTITIES,
  TRAINING_RESEARCH_MAX_UNVERIFIED,
  TRAINING_RESEARCH_READY_TARGET,
} from "../shared/trainingResearch";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import {
  countTrainingResearchReadySupply,
  reserveTrainingResearchRequest,
} from "./trainingResearchLifecycle";
import { assertTrainingResearchCampaign } from "../shared/trainingResearchLifecycle";
import {
  collectTrainingResearchExclusions,
  type TrainingResearchExclusionCompleteness,
} from "./trainingResearchExclusions";

/** Mount this callback in the application index; no job is created by this module. */
export const TRAINING_RESEARCH_CALLBACK = "/api/scheduled/training-research";
export const TRAINING_RESEARCH_CALLBACK_NAME =
  "trainingResearchScheduledHandler";
export const TRAINING_REPLENISHMENT_TARGET = TRAINING_RESEARCH_READY_TARGET;

const MAX_CONTEXT_IDENTITIES = TRAINING_RESEARCH_MAX_EXISTING_IDENTITIES;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ResearchTaskCampaign = TrainingOutreachCampaign & {
  /** Added by the schema owner: nullable unique cron task UID for agent writeback. */
  researchTaskUid?: string | null;
  researchWebhookUrl?: string | null;
  researchLastRequestedAt?: Date | null;
  researchLeaseExpiresAt?: Date | null;
};

type ResearchAction = "context" | "import";

export type TrainingResearchContext = {
  action: "context";
  callback: {
    name: typeof TRAINING_RESEARCH_CALLBACK_NAME;
    path: typeof TRAINING_RESEARCH_CALLBACK;
    importAction: "owned-cli";
  };
  packet: {
    version: "training-research-packet-v1";
    maxBatch: 12;
    maxUnverified: typeof TRAINING_RESEARCH_MAX_UNVERIFIED;
    sourceBackedFactsRequired: true;
    sourceBackedEmailRequired: true;
    publicEvidenceRequired: true;
    noGuessedPatternEmails: true;
  };
  qualificationBrief: string;
  targetReadySupply: typeof TRAINING_RESEARCH_READY_TARGET;
  readySupply: number;
  readySupplyShortfall: number;
  excludedIdentities: string[];
  excludedIdentityLimit: typeof MAX_CONTEXT_IDENTITIES;
  excludedIdentitiesTruncated: boolean;
  /** Incomplete contexts must not be used to start research. */
  excludedIdentityCompleteness: TrainingResearchExclusionCompleteness;
  /** Exact source row count when complete; observed rows only when truncated. */
  existingIdentityCount: number;
  researchAgent: {
    status: "not_scheduled" | "configured";
    taskUid: string | null;
    message: string;
  };
  blocked: {
    code: "low_ready_supply" | "none";
    message: string | null;
  };
};

function dateStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function requireDb(db: Database | null): asserts db is Database {
  if (!db) throw new Error("Database is unavailable");
}

async function getCampaignForResearchTask(
  db: Database,
  taskUid: string
): Promise<ResearchTaskCampaign | undefined> {
  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.researchTaskUid, taskUid))
    .limit(1);
  return campaign as ResearchTaskCampaign | undefined;
}

/**
 * All nine campaigns (the sector table includes all four sectors), every status,
 * and shared suppressions. Keyset pages run sequentially on ONE repeatable-read,
 * read-only snapshot, so concurrent inserts/updates/deletes cannot hide a later
 * row. Bounds are global; incomplete snapshots retain the fail-closed flag.
 */
async function loadExcludedTrainingResearchIdentities(db: Database) {
  return db.transaction(
    tx =>
      collectTrainingResearchExclusions([
        {
          name: "training",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: trainingOutreachProspects.id,
                businessName: trainingOutreachProspects.businessName,
                normalizedBusiness:
                  trainingOutreachProspects.normalizedBusiness,
                website: trainingOutreachProspects.website,
                normalizedDomain: trainingOutreachProspects.normalizedDomain,
                email: trainingOutreachProspects.primaryEmail,
                normalizedEmail: trainingOutreachProspects.normalizedEmail,
              })
              .from(trainingOutreachProspects)
              .where(
                afterId === null
                  ? undefined
                  : gt(trainingOutreachProspects.id, afterId)
              )
              .orderBy(asc(trainingOutreachProspects.id))
              .limit(limit),
        },
        {
          name: "chamber",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: chamberOutreachProspects.id,
                businessName: chamberOutreachProspects.businessName,
                website: chamberOutreachProspects.website,
                email: chamberOutreachProspects.email,
              })
              .from(chamberOutreachProspects)
              .where(
                afterId === null
                  ? undefined
                  : gt(chamberOutreachProspects.id, afterId)
              )
              .orderBy(asc(chamberOutreachProspects.id))
              .limit(limit),
        },
        {
          name: "creditUnion",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: creditUnionProspects.id,
                businessName: creditUnionProspects.creditUnionName,
                normalizedBusiness: creditUnionProspects.normalizedOrganization,
                website: creditUnionProspects.website,
                normalizedDomain: creditUnionProspects.normalizedDomain,
                normalizedEmail: creditUnionProspects.normalizedEmail,
              })
              .from(creditUnionProspects)
              .where(
                afterId === null
                  ? undefined
                  : gt(creditUnionProspects.id, afterId)
              )
              .orderBy(asc(creditUnionProspects.id))
              .limit(limit),
        },
        {
          name: "brandVideo",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: brandVideoProspects.id,
                businessName: brandVideoProspects.businessName,
                normalizedBusiness: brandVideoProspects.normalizedBusiness,
                website: brandVideoProspects.website,
                normalizedDomain: brandVideoProspects.normalizedDomain,
                normalizedEmail: brandVideoProspects.normalizedEmail,
              })
              .from(brandVideoProspects)
              .where(
                afterId === null
                  ? undefined
                  : gt(brandVideoProspects.id, afterId)
              )
              .orderBy(asc(brandVideoProspects.id))
              .limit(limit),
        },
        {
          name: "suppressions",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: chamberOutreachSuppressions.id,
                email: chamberOutreachSuppressions.email,
              })
              .from(chamberOutreachSuppressions)
              .where(
                afterId === null
                  ? undefined
                  : gt(chamberOutreachSuppressions.id, afterId)
              )
              .orderBy(asc(chamberOutreachSuppressions.id))
              .limit(limit),
        },
        {
          name: "hustle",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: hustleProspects.id,
                businessName: hustleProspects.name,
                website: hustleProspects.website,
                email: hustleProspects.email,
              })
              .from(hustleProspects)
              .where(
                afterId === null ? undefined : gt(hustleProspects.id, afterId)
              )
              .orderBy(asc(hustleProspects.id))
              .limit(limit),
        },
        {
          name: "sectors",
          readPage: async (afterId, limit) =>
            tx
              .select({
                id: sectorOutreachProspects.id,
                businessName: sectorOutreachProspects.company,
                website: sectorOutreachProspects.website,
                email: sectorOutreachProspects.email,
              })
              .from(sectorOutreachProspects)
              .where(
                afterId === null
                  ? undefined
                  : gt(sectorOutreachProspects.id, afterId)
              )
              .orderBy(asc(sectorOutreachProspects.id))
              .limit(limit),
        },
      ]),
    // Repeatable read pins one snapshot. Readers expose only SELECT operations.
    // TiDB rejects START TRANSACTION READ ONLY unless noop functions are enabled;
    // omit that unsupported flag, never change server settings or fall back to
    // independent reads. A failed snapshot transaction still rejects completely.
    { isolationLevel: "repeatable read" }
  );
}

async function countReadySupply(db: Database, campaignId: number) {
  return countTrainingResearchReadySupply(db, campaignId);
}

export type TrainingReplenishmentRequestResult = {
  requested: boolean;
  requestState: "delivered" | "failed_definite" | "uncertain" | "skipped";
  skipped?:
    | "outside-central-research-window"
    | "campaign-not-eligible"
    | "webhook-not-configured"
    | "ready-supply-sufficient"
    | "lease-active"
    | "request-date-budget"
    | "request-cooldown"
    | "ready-count-invalid";
  readyCount: number;
  target: typeof TRAINING_REPLENISHMENT_TARGET;
  retryAfter: Date | null;
};

async function recordReplenishmentAudit(
  db: Database,
  input: {
    campaignId: number;
    eventType:
      | "research_webhook_requested"
      | "research_webhook_failed"
      | "research_webhook_uncertain";
    detail: string;
    readyCount: number;
    requestedAt: Date;
    error?: string;
  }
) {
  await db.insert(trainingOutreachEvents).values({
    campaignId: input.campaignId,
    eventType: input.eventType,
    detail: input.detail.slice(0, 4_000),
    metadataJson: JSON.stringify({
      readyCount: input.readyCount,
      target: TRAINING_REPLENISHMENT_TARGET,
      requestedAt: input.requestedAt.toISOString(),
      // Deliberately retain outcome metadata only. A webhook URL is a secret
      // configuration value and is never returned or put in audit metadata.
      error: input.error?.slice(0, 1_000) ?? null,
      noResearchExecutedHere: true,
      noSenderEnabled: true,
      noJobCreated: true,
    }),
  });
}

/** Requests external research only. Ownership completion, not expiry or a network
 * response, releases the 24h uncertain-work lease. No sends, jobs or imports here. */
export async function requestTrainingReplenishment(
  campaignId: number,
  now = new Date()
): Promise<TrainingReplenishmentRequestResult> {
  if (!isOutreachResearchWindow(now))
    return {
      requested: false,
      requestState: "skipped",
      skipped: "outside-central-research-window",
      readyCount: 0,
      target: TRAINING_REPLENISHMENT_TARGET,
      retryAfter: null,
    };
  const reservation = await reserveTrainingResearchRequest(campaignId, now);
  if (!reservation.reserved)
    return {
      requested: false,
      requestState: "skipped",
      skipped:
        reservation.reason as TrainingReplenishmentRequestResult["skipped"],
      readyCount: reservation.readyCount,
      target: TRAINING_REPLENISHMENT_TARGET,
      retryAfter: reservation.retryAfter,
    };
  const db = await getDb();
  requireDb(db);
  const requestedAt = new Date(reservation.requestedAt);
  const requestPayload = {
    campaign: "training",
    campaignId: 1,
    readyCount: reservation.readyCount,
    target: TRAINING_REPLENISHMENT_TARGET,
    refillThreshold: OUTREACH_INITIAL_REFILL_START_BELOW,
    policyVersion: OUTREACH_REPLENISHMENT_POLICY_VERSION,
    requestedAt: reservation.requestedAt,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(reservation.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
      redirect: "error",
    });
    // HTTP failure is not proof no remote work started. Never shorten or erase its ledger.
    await recordReplenishmentAudit(db, {
      campaignId: 1,
      eventType: response.ok
        ? "research_webhook_requested"
        : "research_webhook_uncertain",
      detail: response.ok
        ? "External owned research requested; exact original finish is required to release the lease."
        : "Webhook HTTP outcome uncertain; original full lease retained, no automatic retry.",
      readyCount: reservation.readyCount,
      requestedAt,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    });
    return {
      requested: true,
      requestState: response.ok ? "delivered" : "uncertain",
      readyCount: reservation.readyCount,
      target: TRAINING_REPLENISHMENT_TARGET,
      retryAfter: reservation.leaseExpiresAt,
    };
  } catch {
    // Never persist raw network errors: they can contain the secret webhook URL.
    await recordReplenishmentAudit(db, {
      campaignId: 1,
      eventType: "research_webhook_uncertain",
      detail:
        "Research webhook delivery uncertain; original full lease retained, no automatic retry.",
      readyCount: reservation.readyCount,
      requestedAt,
      error: "network-outcome-uncertain",
    });
    return {
      requested: true,
      requestState: "uncertain",
      readyCount: reservation.readyCount,
      target: TRAINING_REPLENISHMENT_TARGET,
      retryAfter: reservation.leaseExpiresAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function researchAgentStatus(campaign: ResearchTaskCampaign) {
  const taskUid = campaign.researchTaskUid ?? null;
  return {
    status: taskUid ? ("configured" as const) : ("not_scheduled" as const),
    taskUid,
    message: taskUid
      ? "A task UID is configured for authenticated agent writeback; this endpoint does not create or schedule the agent."
      : "research agent not scheduled",
  };
}

function qualificationBrief() {
  return [
    "Research Corpus Christi-area businesses that publicly indicate repeatable internal workflows, onboarding, recurring team explanations, field/service operations, or training-documentation needs.",
    "Import only specific public facts with their direct public URLs. A qualified record needs source-backed fit context; only include an email when that exact address is publicly published in a cited fact and source.",
    "Do not infer email patterns, promise performance/compliance/safety outcomes, enable sending, change campaign settings, create jobs, or include a campaign/task ID in the packet.",
  ].join(" ");
}

async function buildContext(
  db: Database,
  campaign: ResearchTaskCampaign
): Promise<TrainingResearchContext> {
  // A scoped DB may be a single connection. Finish ready-count reads before
  // starting the isolated read-only exclusion transaction on that connection.
  const readySupply = await countReadySupply(db, campaign.id);
  const exclusions = await loadExcludedTrainingResearchIdentities(db);
  const shortfall = Math.max(0, TRAINING_RESEARCH_READY_TARGET - readySupply);
  const agent = researchAgentStatus(campaign);
  const blocked =
    shortfall > 0 && agent.status === "not_scheduled"
      ? {
          code: "low_ready_supply" as const,
          message:
            "Verified ready supply is below target and no research agent is scheduled; this is a blocked replenishment state, not a guarantee of discovery.",
        }
      : { code: "none" as const, message: null };

  return {
    action: "context",
    callback: {
      name: TRAINING_RESEARCH_CALLBACK_NAME,
      path: TRAINING_RESEARCH_CALLBACK,
      importAction: "owned-cli",
    },
    packet: {
      version: "training-research-packet-v1",
      maxBatch: 12,
      maxUnverified: TRAINING_RESEARCH_MAX_UNVERIFIED,
      sourceBackedFactsRequired: true,
      sourceBackedEmailRequired: true,
      publicEvidenceRequired: true,
      noGuessedPatternEmails: true,
    },
    qualificationBrief: qualificationBrief(),
    targetReadySupply: TRAINING_RESEARCH_READY_TARGET,
    readySupply,
    readySupplyShortfall: shortfall,
    excludedIdentities: exclusions.aliases,
    excludedIdentityLimit: MAX_CONTEXT_IDENTITIES,
    excludedIdentitiesTruncated: exclusions.truncated,
    excludedIdentityCompleteness: exclusions.completeness,
    existingIdentityCount: exclusions.identityCount,
    researchAgent: agent,
    blocked,
  };
}

function asAction(body: unknown): ResearchAction {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }
  const record = body as Record<string, unknown>;
  const action = record.action;
  if (action !== "context" && action !== "import") {
    throw new Error("action must be context or import.");
  }
  const allowed = action === "context" ? ["action"] : ["action", "packet"];
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new Error(`${key} is not allowed in a scheduled research request.`);
    }
  }
  return action;
}

/**
 * Owner-only scheduled callback for a future AGENT cron. It accepts no campaign
 * or task ID from request JSON. Context is read-only; unowned imports are rejected;
 * authentication failures are 403 and leave no audit trail.
 */
export async function trainingResearchScheduledHandler(
  req: Request,
  res: Response
) {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    return res.status(403).json({ error: "cron-only endpoint" });
  }
  if (!user.isCron || !user.taskUid) {
    return res.status(403).json({ error: "cron-only endpoint" });
  }

  try {
    const db = await getDb();
    requireDb(db);
    const campaign = await getCampaignForResearchTask(db, user.taskUid);
    // 2xx for stale platform task avoids retries/audit spam. No body scoping.
    if (!campaign) return res.json({ ok: true, skipped: "orphan" });

    assertTrainingResearchCampaign(campaign);
    const action = asAction(req.body);
    if (action === "context") {
      return res.json(await buildContext(db, campaign));
    }
    // Legacy unowned writeback cannot prove association with the current request.
    // Keep authentication unchanged; supported automated imports use the owner-file CLI.
    return res
      .status(409)
      .json({
        error:
          "Unowned research import is disabled; use the exact original owner-file lifecycle helper.",
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TrainingResearch] ${message}`);
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: {
        url: req.originalUrl,
        taskUid: user.taskUid,
        date: dateStamp(),
      },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * A read-only bridge for an owner-access tRPC procedure, if parent wiring adds
 * one. It accepts only a server-supplied task UID rather than browser campaign
 * fields and does not mutate records.
 */
export async function getTrainingResearchContextForTask(taskUid: string) {
  const db = await getDb();
  requireDb(db);
  const campaign = await getCampaignForResearchTask(db, taskUid);
  if (!campaign) throw new Error("Training research task is not configured.");
  assertTrainingResearchCampaign(campaign);
  return buildContext(db, campaign);
}

/** Truthful UI/recap status helper; it never claims discovery is active without a task UID. */
export async function getTrainingResearchAgentStatus() {
  const db = await getDb();
  requireDb(db);
  const [campaign] = await db
    .select()
    .from(trainingOutreachCampaigns)
    .where(eq(trainingOutreachCampaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG))
    .limit(1);
  if (!campaign) {
    return {
      status: "not_scheduled" as const,
      taskUid: null,
      message: "research agent not scheduled",
    };
  }
  return researchAgentStatus(campaign as ResearchTaskCampaign);
}
