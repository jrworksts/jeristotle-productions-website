import { randomBytes } from "node:crypto";
import { isOutreachResearchWindow } from "../shared/outreachResearchWindow";
import { and, asc, eq, isNull, like } from "drizzle-orm";
import {
  trainingOutreachCampaigns as campaigns,
  trainingOutreachEvents as events,
  trainingOutreachProspects as prospects,
  trainingOutreachMessages as messages,
} from "../drizzle/schema";
import {
  TRAINING_OUTREACH_CAMPAIGN_SLUG,
  normalizeTrainingBusiness,
  normalizeTrainingDomain,
  normalizeTrainingEmail,
} from "../shared/trainingOutreach";
import {
  parseTrainingResearchPacket,
  type ParsedTrainingResearchPacket,
} from "../shared/trainingResearch";
import {
  TRAINING_RESEARCH_LIFECYCLE_VERSION,
  TRAINING_RESEARCH_UNCERTAIN_LEASE_MS,
  assertTrainingResearchCampaign,
  assertTrainingResearchOwner,
  assertTrainingResearchFinish,
  exactTrainingResearchTimestamp,
  trainingResearchDbTimestamp,
  trainingResearchRequestKey,
  trainingResearchRequestLedger,
  trainingResearchMetadata,
  trainingResearchEventOwned,
  trainingResearchLeaseMatches,
  trainingResearchRequestGate,
  type TrainingResearchOwner,
  type TrainingResearchOutcome,
  type TrainingResearchLedgerEvent,
} from "../shared/trainingResearchLifecycle";
import { getDb } from "./db";
import {
  getTrainingCrossCampaignConflictFromSnapshot,
  loadTrainingCrossCampaignSnapshot,
  importTrainingProspects,
} from "./trainingOutreach";
import {
  hasUntouchedApprovedTrainingInitialTarget,
  prepareTrainingReadyReserve,
} from "./trainingSendingDb";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const MAX_LEDGER_SCAN = 20_000;
const NO_SENDS = {
  noSends: true,
  noSenderEnabled: true,
  noJobCreated: true,
} as const;
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}
async function campaignRow(db: Database, lock = false) {
  const query = db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, 1),
        eq(campaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG)
      )
    )
    .limit(1);
  const [campaign] = await (lock ? query.for("update") : query);
  assertTrainingResearchCampaign(campaign, false);
  return campaign;
}
export async function loadTrainingResearchLedger(db: Database) {
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.campaignId, 1),
        // Include unknown/legacy research audits for replay refusal, not completion.
        like(events.eventType, "research_%")
      )
    )
    .orderBy(asc(events.id))
    .limit(MAX_LEDGER_SCAN + 1);
  if (rows.length > MAX_LEDGER_SCAN)
    throw new Error(
      "Research ledger scan limit reached; fail closed pending operator audit"
    );
  return rows;
}
function ownerMetadata(owner: TrainingResearchOwner) {
  return {
    ...owner,
    lifecycleVersion: TRAINING_RESEARCH_LIFECYCLE_VERSION,
    ...NO_SENDS,
  };
}
async function audit(
  db: Database,
  eventType: string,
  metadata: Record<string, unknown>
) {
  await db.insert(events).values({
    campaignId: 1,
    eventType,
    detail:
      "Owned Training research lifecycle; no sending or schedule changes.",
    metadataJson: JSON.stringify({ ...metadata, ...NO_SENDS }),
  });
}
function finished(
  rows: TrainingResearchLedgerEvent[],
  owner: TrainingResearchOwner
) {
  return rows.find(
    e =>
      e.eventType === "research_owned_finished" &&
      trainingResearchEventOwned(e, owner)
  );
}
function assertCurrentOwner(
  campaign: any,
  rows: TrainingResearchLedgerEvent[],
  owner: TrainingResearchOwner,
  now: Date
) {
  assertTrainingResearchCampaign(campaign);
  assertTrainingResearchOwner(owner, rows);
  if (finished(rows, owner))
    throw new Error("Original research request already finished");
  if (
    !trainingResearchLeaseMatches(campaign, owner) ||
    exactTrainingResearchTimestamp(owner.leaseExpiresAt) <= now
  )
    throw new Error("Stale or expired research owner; no import/retry allowed");
}
/** Read-only reserve counting, using canonical evidence/sequence predicates plus stricter claim/transport exclusion and all-nine collision clearance. */
export async function countTrainingResearchReadySupply(
  db: Database,
  campaignId = 1
) {
  if (campaignId !== 1) throw new Error("Fixed Training campaign required");
  const [rows, drafts, snapshot] = await Promise.all([
    db.select().from(prospects).where(eq(prospects.campaignId, 1)),
    db.select().from(messages).where(eq(messages.campaignId, 1)),
    loadTrainingCrossCampaignSnapshot(db),
  ]);
  let ready = 0;
  for (const p of rows) {
    const sequence = drafts.filter(m => m.prospectId === p.id);
    if (!hasUntouchedApprovedTrainingInitialTarget(p, sequence))
      continue;
    if (
      rows.some(
        q =>
          q.id !== p.id &&
          (q.normalizedBusiness === p.normalizedBusiness ||
            (p.normalizedDomain && q.normalizedDomain === p.normalizedDomain) ||
            (p.normalizedEmail && q.normalizedEmail === p.normalizedEmail))
      )
    )
      continue;
    if (
      getTrainingCrossCampaignConflictFromSnapshot(snapshot, {
        business: p.normalizedBusiness,
        domain: p.normalizedDomain,
        email: p.normalizedEmail,
      })
    )
      continue;
    ready += 1;
  }
  return ready;
}
/** Atomic request reservation and append-only ledger before any network delivery. No expired lease reclamation. */
export async function reserveTrainingResearchRequest(
  campaignId: number,
  now: Date
) {
  if (campaignId !== 1)
    return {
      reserved: false as const,
      reason: "campaign-not-eligible",
      readyCount: 0,
      retryAfter: null,
    };
  const db = await requireDb();
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Database;
    const campaign = await campaignRow(tx, true);
    const readyCount = await countTrainingResearchReadySupply(tx);
    try {
      assertTrainingResearchCampaign(campaign);
    } catch {
      return {
        reserved: false as const,
        reason: "campaign-not-eligible",
        readyCount,
        retryAfter: null,
      };
    }
    const webhookUrl = campaign.researchWebhookUrl;
    try {
      const url = new URL(webhookUrl ?? "");
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      return {
        reserved: false as const,
        reason: "webhook-not-configured",
        readyCount,
        retryAfter: null,
      };
    }
    const rows = await loadTrainingResearchLedger(tx);
    const gate = trainingResearchRequestGate({
      campaign,
      events: rows,
      now,
      readyCount,
    });
    if (!gate.allowed)
      return {
        reserved: false as const,
        reason: gate.reason!,
        readyCount,
        retryAfter: gate.retryAfter ?? null,
      };
    const requestedAt = now.toISOString();
    const leaseExpiresAt = trainingResearchDbTimestamp(
      new Date(now.getTime() + TRAINING_RESEARCH_UNCERTAIN_LEASE_MS)
    );
    const [result] = await tx
      .update(campaigns)
      .set({
        researchLastRequestedAt: trainingResearchDbTimestamp(now),
        researchLeaseExpiresAt: leaseExpiresAt,
      })
      .where(
        and(
          eq(campaigns.id, 1),
          eq(campaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG),
          isNull(campaigns.researchLeaseExpiresAt)
        )
      );
    if (Number(result.affectedRows) !== 1)
      throw new Error("Research reservation compare-and-set failed");
    await audit(tx, "research_request_reserved", {
      lifecycleVersion: TRAINING_RESEARCH_LIFECYCLE_VERSION,
      requestedAt,
      requestKey: trainingResearchRequestKey(requestedAt),
      readyCount,
      target: 50,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    });
    return {
      reserved: true as const,
      requestedAt,
      readyCount,
      leaseExpiresAt,
      webhookUrl: webhookUrl!,
    };
  });
}
export async function claimTrainingResearch(
  input: { requestedAt: string },
  now = new Date()
): Promise<TrainingResearchOwner> {
  if (!isOutreachResearchWindow(now))
    throw new Error("Research claims may start only 01:00–05:59 Central");
  exactTrainingResearchTimestamp(input.requestedAt);
  const db = await requireDb();
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Database;
    const campaign = await campaignRow(tx, true);
    assertTrainingResearchCampaign(campaign);
    const rows = await loadTrainingResearchLedger(tx);
    const request = trainingResearchRequestLedger(rows).get(input.requestedAt);
    if (!request) throw new Error("No exact matching request ledger");
    if (
      rows.some(
        e =>
          e.eventType === "research_owned_claim" &&
          trainingResearchMetadata(e).requestedAt === input.requestedAt
      )
    )
      throw new Error(
        "Request already claimed; original private owner file is required, never issue a replacement token"
      );
    if (
      !campaign.researchLeaseExpiresAt ||
      campaign.researchLeaseExpiresAt <= now ||
      campaign.researchLastRequestedAt?.getTime() !==
        trainingResearchDbTimestamp(input.requestedAt).getTime()
    )
      throw new Error("No exact current original research lease");
    const requestLease = request.metadata.leaseExpiresAt;
    if (
      requestLease &&
      requestLease !== campaign.researchLeaseExpiresAt.toISOString()
    )
      throw new Error("Request ledger lease mismatch");
    // For legacy requests without a recorded expiry, verify the unchanged original 24h lease only.
    if (
      !requestLease &&
      campaign.researchLeaseExpiresAt.getTime() !==
        trainingResearchDbTimestamp(
          new Date(
            new Date(input.requestedAt).getTime() +
              TRAINING_RESEARCH_UNCERTAIN_LEASE_MS
          )
        ).getTime()
    )
      throw new Error("Legacy original lease mismatch");
    const owner: TrainingResearchOwner = {
      campaignId: 1,
      campaignSlug: TRAINING_OUTREACH_CAMPAIGN_SLUG,
      requestedAt: input.requestedAt,
      requestKey: trainingResearchRequestKey(input.requestedAt),
      requestEventId: request.event.id,
      leaseExpiresAt: campaign.researchLeaseExpiresAt.toISOString(),
      ownerToken: randomBytes(24).toString("hex"),
      target: 50,
    };
    await audit(tx, "research_owned_claim", {
      ...ownerMetadata(owner),
      claimedAt: now.toISOString(),
      state: "running",
    });
    return owner; // Only the CLI private file consumes this capability, never public context/stdout.
  });
}
async function packetPreview(
  db: Database,
  packet: ParsedTrainingResearchPacket
) {
  const snapshot = await loadTrainingCrossCampaignSnapshot(db);
  const existing = await db
    .select()
    .from(prospects)
    .where(eq(prospects.campaignId, 1));
  return packet.prospects.map(p => {
    const business = normalizeTrainingBusiness(p.businessName),
      domain = normalizeTrainingDomain(p.website),
      email = normalizeTrainingEmail(p.businessEmail);
    const overlaps = existing.filter(
      row =>
        row.normalizedBusiness === business ||
        (domain && row.normalizedDomain === domain) ||
        (email && row.normalizedEmail === email)
    );
    return {
      businessName: p.businessName,
      sourceUrls: p.sources.map(s => s.url),
      sourceBackedEmail: Boolean(email),
      conflict: overlaps.length
        ? "Existing Training identity: owned research never rewrites existing/protected records"
        : getTrainingCrossCampaignConflictFromSnapshot(snapshot, {
            business,
            domain,
            email,
          }),
    };
  });
}
export async function previewTrainingOwnedResearch(
  packetInput: unknown,
  owner: TrainingResearchOwner,
  now = new Date()
) {
  const packet = parseTrainingResearchPacket(packetInput),
    db = await requireDb();
  const campaign = await campaignRow(db),
    rows = await loadTrainingResearchLedger(db);
  assertCurrentOwner(campaign, rows, owner, now);
  const checks = await packetPreview(db, packet);
  const prior = rows.filter(
    e => trainingResearchMetadata(e).packetHash === packet.packetHash
  );
  return {
    packetHash: packet.packetHash,
    evidenceDigest: packet.evidenceDigest,
    records: checks,
    conflicts: checks.filter(c => c.conflict).length,
    replayed: prior.some(e =>
      [
        "research_owned_imported",
        "research_import_batch",
        "research_exhausted",
      ].includes(e.eventType)
    ),
    uncertain:
      prior.some(e => e.eventType === "research_owned_import_started") &&
      !prior.some(e => e.eventType === "research_owned_imported"),
    target: 50,
    ...NO_SENDS,
  };
}
export async function importTrainingOwnedResearch(
  packetInput: unknown,
  owner: TrainingResearchOwner,
  now = new Date()
) {
  const packet = parseTrainingResearchPacket(packetInput),
    db = await requireDb();
  const start = await db.transaction(async transaction => {
    const tx = transaction as unknown as Database,
      campaign = await campaignRow(tx, true),
      rows = await loadTrainingResearchLedger(tx);
    assertCurrentOwner(campaign, rows, owner, now);
    const prior = rows.filter(
      e => trainingResearchMetadata(e).packetHash === packet.packetHash
    );
    const done = prior.find(
      e =>
        e.eventType === "research_owned_imported" &&
        trainingResearchEventOwned(e, owner)
    );
    if (done)
      return {
        replayed: true as const,
        receipt: trainingResearchMetadata(done).receipt,
      };
    if (prior.some(e => e.eventType === "research_owned_import_started"))
      throw new Error(
        "Packet import already attempted; uncertain outcomes must not be retried"
      );
    if (
      prior.some(e =>
        [
          "research_owned_imported",
          "research_import_batch",
          "research_exhausted",
        ].includes(e.eventType)
      )
    )
      throw new Error(
        "Packet replay belongs to another/unassociated original request; no import"
      );
    const owned = rows.filter(e => trainingResearchEventOwned(e, owner));
    if (
      owned.some(
        e =>
          e.eventType === "research_owned_import_started" &&
          !owned.some(
            done =>
              done.eventType === "research_owned_imported" &&
              trainingResearchMetadata(done).packetHash ===
                trainingResearchMetadata(e).packetHash
          )
      )
    )
      throw new Error(
        "Original owner has an uncertain import; changing packet hash cannot authorize a retry"
      );
    if (prior.length)
      throw new Error(
        "Packet hash has an unknown original audit association; manual review, no import retry"
      );
    const checks = await packetPreview(tx, packet);
    if (checks.some(c => c.conflict))
      throw new Error(
        "Training packet conflicts with existing Training or all-nine reserved/suppressed identity; no writes"
      );
    const readyCount = await countTrainingResearchReadySupply(tx);
    const verifiedQualified = packet.prospects.filter(
      p => p.businessEmail && p.qualificationStatus === "qualified"
    ).length;
    if (verifiedQualified > Math.max(0, 50 - readyCount))
      throw new Error(
        "Packet exceeds the owned fifty-ready highwater shortfall; create a smaller strict packet"
      );
    // This intent commits before the nontransactional existing importer. Any interruption afterwards is manual-review/no-retry, not an assumed failed import.
    await audit(tx, "research_owned_import_started", {
      ...ownerMetadata(owner),
      packetHash: packet.packetHash,
      evidenceDigest: packet.evidenceDigest,
    });
    return { replayed: false as const };
  });
  if (start.replayed)
    return {
      replayed: true,
      packetHash: packet.packetHash,
      receipt: start.receipt,
      ...NO_SENDS,
    };
  const receipt = await db.transaction(async transaction => {
    const tx = transaction as unknown as Database,
      campaign = await campaignRow(tx, true),
      rows = await loadTrainingResearchLedger(tx);
    assertCurrentOwner(campaign, rows, owner, new Date());
    const checks = await packetPreview(tx, packet);
    if (checks.some(c => c.conflict))
      throw new Error(
        "Packet identity changed since intent; import remains uncertain/no retry"
      );
    // Keep the campaign ownership lock across the existing importer. A finish/new
    // reservation cannot interleave. Its own live collision/send-evidence guards
    // are retained, and the durable intent survives any partial failure.
    const receipt = packet.importData
      ? await importTrainingProspects(packet.importData)
      : null;
    await audit(tx, "research_owned_imported", {
      ...ownerMetadata(owner),
      packetHash: packet.packetHash,
      evidenceDigest: packet.evidenceDigest,
      eligiblePublicSourcesExhausted: packet.eligiblePublicSourcesExhausted,
      receipt,
    });
    return receipt;
  });
  return {
    replayed: false,
    packetHash: packet.packetHash,
    receipt,
    ...NO_SENDS,
  };
}
export async function prepareTrainingOwnedResearch(
  owner: TrainingResearchOwner,
  now = new Date()
) {
  const db = await requireDb();
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Database,
      campaign = await campaignRow(tx, true),
      rows = await loadTrainingResearchLedger(tx);
    assertCurrentOwner(campaign, rows, owner, now);
    const owned = rows.filter(e => trainingResearchEventOwned(e, owner));
    if (!owned.some(e => e.eventType === "research_owned_imported"))
      throw new Error(
        "Exact original owned import is required before preparation"
      );
    for (const start of owned.filter(
      e => e.eventType === "research_owned_import_started"
    ))
      if (
        !owned.some(
          e =>
            e.eventType === "research_owned_imported" &&
            trainingResearchMetadata(e).packetHash ===
              trainingResearchMetadata(start).packetHash
        )
      )
        throw new Error("Uncertain import; no preparation/retry");
    await prepareTrainingReadyReserve(50); // Existing canonical no-send helper; does not update campaign or create jobs.
    // The canonical helper uses its existing connection. Read fresh committed
    // state there, not this transaction's earlier ledger snapshot.
    const readyCount = await countTrainingResearchReadySupply(db);
    await audit(tx, "research_owned_prepared", {
      ...ownerMetadata(owner),
      readyCount,
      preparedAt: now.toISOString(),
    });
    return { readyCount, target: 50, ...NO_SENDS };
  });
}
export async function finishTrainingResearch(
  owner: TrainingResearchOwner,
  outcome: TrainingResearchOutcome,
  now = new Date()
) {
  const db = await requireDb();
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Database,
      campaign = await campaignRow(tx, true),
      rows = await loadTrainingResearchLedger(tx);
    assertTrainingResearchOwner(owner, rows);
    const prior = finished(rows, owner);
    if (prior)
      return {
        alreadyFinalized: true,
        ...trainingResearchMetadata(prior).result,
        ...NO_SENDS,
      };
    assertTrainingResearchCampaign(campaign);
    const owned = rows.filter(e => trainingResearchEventOwned(e, owner));
    const readyCount = await countTrainingResearchReadySupply(tx);
    assertTrainingResearchFinish(outcome, readyCount, owned);
    // Original owner may record terminal completion even after expiry, but never clear a newer or mismatched lease.
    let leaseCleared = false;
    if (trainingResearchLeaseMatches(campaign, owner)) {
      const [result] = await tx
        .update(campaigns)
        .set({ researchLeaseExpiresAt: null })
        .where(
          and(
            eq(campaigns.id, 1),
            eq(campaigns.slug, TRAINING_OUTREACH_CAMPAIGN_SLUG),
            eq(
              campaigns.researchLastRequestedAt,
              trainingResearchDbTimestamp(owner.requestedAt)
            ),
            eq(
              campaigns.researchLeaseExpiresAt,
              exactTrainingResearchTimestamp(owner.leaseExpiresAt)
            )
          )
        );
      leaseCleared = Number(result.affectedRows) === 1;
      if (!leaseCleared)
        throw new Error(
          "Original finish compare-and-set failed; no completion recorded"
        );
    }
    const result = { outcome, readyCount, target: 50, leaseCleared };
    await audit(tx, "research_owned_finished", {
      ...ownerMetadata(owner),
      outcome,
      readyCount,
      finishedAt: now.toISOString(),
      result,
    });
    return { alreadyFinalized: false, ...result, ...NO_SENDS };
  });
}
export async function getTrainingResearchLifecycleStatus() {
  const db = await requireDb(),
    campaign = await campaignRow(db),
    rows = await loadTrainingResearchLedger(db);
  return {
    campaignId: 1,
    campaignSlug: campaign.slug,
    status: campaign.status,
    readyCount: await countTrainingResearchReadySupply(db),
    target: 50,
    refillStartsBelow: 30,
    researchLastRequestedAt: campaign.researchLastRequestedAt,
    researchLeaseExpiresAt: campaign.researchLeaseExpiresAt,
    requests: Array.from(trainingResearchRequestLedger(rows).entries()).map(
      ([requestedAt, r]) => ({
        requestedAt,
        requestEventId: r.event.id,
        requestKey: trainingResearchRequestKey(requestedAt),
      })
    ),
    ...NO_SENDS,
  };
}
