import { outreachDeadlineCheck, outreachRuntimeActive, withOutreachDeadline } from "./outreachDeadline";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createConnection, type Connection } from "mysql2";
import type { Duplex } from "node:stream";
import { getDb } from "./db";
import {
  sectorOutreachGroups as groups,
  sectorOutreachCampaigns as campaigns,
  sectorOutreachProspects as prospects,
  sectorOutreachMessages as messages,
  sectorOutreachEvents as events,
  chamberOutreachProspects,
  chamberOutreachSuppressions,
  chamberProspects,
  creditUnionProspects,
  brandVideoProspects,
  trainingOutreachProspects,
  hustleProspects,
} from "../drizzle/schema";
import {
  SECTOR_KEYS,
  SECTOR_DEFINITIONS,
  SECTOR_GROUP_SLUG,
  SECTOR_COPY_VERSION,
  SECTOR_VERSION,
  SECTOR_TIME_ZONE,
  SECTOR_CAP_POLICY_VERSION,
  SECTOR_DAILY_NEW_PER_CAMPAIGN,
  type SectorKey,
} from "../shared/sectorOutreach";
import {
  SECTOR_RUNTIME_VERSION,
  SECTOR_RESERVE_TARGET,
  sectorResearchPacketSchema,
  sectorQualificationReason,
  sectorConflictReason,
  sectorIdentityKey,
  buildSectorSequence,
  readSectorEvidence,
  type SectorResearchRecord,
  type SectorIdentity,
} from "../shared/sectorResearch";

const scope = new AsyncLocalStorage<{ db: MySql2Database; deadline: number }>();
/** Owned callback connection: hard destroy on deadline, including connection setup and transaction cleanup. */
export async function withSectorDeadline<T>(
  deadline: number,
  run: () => Promise<T>
): Promise<T> {
  if (outreachRuntimeActive()) return withOutreachDeadline(run, deadline);
  if (!process.env.DATABASE_URL) throw new Error("Sector database unavailable");
  if (!Number.isFinite(deadline) || deadline <= Date.now())
    throw new Error("Sector deadline unavailable");
  let connection: Connection | undefined,
    expired = false;
  let rejectDeadline: (error: Error) => void = () => {};
  const expiry = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  // Attach before even constructing a connection. No handshake can leave an unhandled expiry rejection.
  void expiry.catch(() => {});
  const dispose = () => {
    // mysql2 destroy() aliases close(), which calls stream.end(): insufficient cancellation.
    // The raw handle is owned before handshake, including its current TLS-upgraded stream.
    const stream = (
      connection as (Connection & { stream?: Duplex }) | undefined
    )?.stream;
    try {
      stream?.destroy();
    } catch {
      /* teardown must not prevent deadline settlement */
    }
    try {
      connection?.destroy();
    } catch {
      /* no reconnect and no graceful DATA flush */
    }
  };
  const timer = setTimeout(
    () => {
      expired = true;
      dispose();
      rejectDeadline(
        new Error(
          "Sector absolute callback deadline exceeded; attempted messages never retry"
        )
      );
    },
    Math.max(1, deadline - Date.now())
  );
  try {
    connection = createConnection({
      uri: process.env.DATABASE_URL,
      connectTimeout: Math.max(1, Math.min(5000, deadline - Date.now())),
    });
    const connected = new Promise<void>((resolve, reject) =>
      connection!.connect(error =>
        error
          ? reject(new Error("Sector database handshake failed"))
          : resolve()
      )
    );
    await Promise.race([connected, expiry]);
    if (expired || Date.now() >= deadline)
      throw new Error("Sector connection deadline exceeded");
    return await Promise.race([
      scope.run({ db: drizzle(connection.promise()), deadline }, run),
      expiry,
    ]);
  } finally {
    clearTimeout(timer);
    dispose();
  }
}
export async function sectorDatabase() {
  const active = scope.getStore();
  if (active) {
    if (Date.now() >= active.deadline)
      throw new Error("Sector persistence deadline exceeded");
    return active.db;
  }
  const db = await getDb();
  if (!db) throw new Error("Sector database unavailable; counts unknown");
  return db;
}
export function sectorDeadlineCheck(reserveMs = 0) {
  outreachDeadlineCheck(reserveMs);
  const active = scope.getStore();
  if (active && Date.now() + reserveMs >= active.deadline)
    throw new Error("Sector callback deadline reached; no retry of attempts");
}
export function sectorHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function assertSectorFixedConfiguration(
  group: typeof groups.$inferSelect,
  rows: Array<typeof campaigns.$inferSelect>
) {
  if (
    group.id !== 1 ||
    group.slug !== SECTOR_GROUP_SLUG ||
    group.timeZone !== SECTOR_TIME_ZONE ||
    group.policyVersion !== SECTOR_CAP_POLICY_VERSION ||
    group.totalDailyCap !== null ||
    group.capScope !== "per_campaign_new" ||
    group.includesFollowups !== 0 ||
    group.sendSevenDays !== 1 ||
    JSON.stringify(JSON.parse(group.followupBusinessDaysJson)) !== "[4,8]"
  )
    throw new Error("Fixed sector policy changed; owner review required");
  if (rows.length !== 4)
    throw new Error("Exactly four existing sector campaigns are required");
  SECTOR_DEFINITIONS.forEach((d, i) => {
    const row = rows.find(c => c.campaignKey === d.key);
    const { key, name, messages, ...criteria } = d;
    if (
      !row ||
      row.id !== i + 1 ||
      row.groupId !== 1 ||
      row.name !== name ||
      row.dailyNewLimit !== SECTOR_DAILY_NEW_PER_CAMPAIGN ||
      row.reserveTarget !== SECTOR_RESERVE_TARGET ||
      sectorHash(JSON.parse(row.sequenceJson)) !== sectorHash(messages) ||
      sectorHash(JSON.parse(row.criteriaJson)) !== sectorHash(criteria)
    )
      throw new Error("Trusted exact approved copy/criteria mismatch: " + key);
  });
}
export function sectorGroupAuthorized(
  g: typeof groups.$inferSelect | undefined
) {
  return Boolean(
    g &&
      g.id === 1 &&
      g.slug === SECTOR_GROUP_SLUG &&
      g.status === "active" &&
      g.approvalAt &&
      g.runtimeVersion === SECTOR_RUNTIME_VERSION &&
      g.approvedCopyVersion === SECTOR_COPY_VERSION
  );
}
export async function getSectorExclusions(
  db?: Awaited<ReturnType<typeof sectorDatabase>>
) {
  db ||= await sectorDatabase();
  const [
    chamber,
    relationships,
    credit,
    brand,
    training,
    sponsors,
    sectors,
    suppressions,
  ] = await Promise.all([
    db
      .select({
        businessName: chamberOutreachProspects.businessName,
        website: chamberOutreachProspects.website,
        email: chamberOutreachProspects.email,
      })
      .from(chamberOutreachProspects),
    db
      .select({
        businessName: chamberProspects.name,
        website: chamberProspects.website,
        email: chamberProspects.email,
      })
      .from(chamberProspects),
    db
      .select({
        businessName: creditUnionProspects.creditUnionName,
        website: creditUnionProspects.website,
        email: creditUnionProspects.primaryEmail,
      })
      .from(creditUnionProspects),
    db
      .select({
        businessName: brandVideoProspects.businessName,
        website: brandVideoProspects.website,
        email: brandVideoProspects.primaryEmail,
      })
      .from(brandVideoProspects),
    db
      .select({
        businessName: trainingOutreachProspects.businessName,
        website: trainingOutreachProspects.website,
        email: trainingOutreachProspects.primaryEmail,
      })
      .from(trainingOutreachProspects),
    db
      .select({
        businessName: hustleProspects.name,
        website: hustleProspects.website,
        email: hustleProspects.email,
      })
      .from(hustleProspects),
    db
      .select({
        id: prospects.id,
        businessName: prospects.company,
        website: prospects.website,
        email: prospects.email,
      })
      .from(prospects),
    db.select().from(chamberOutreachSuppressions),
  ]);
  const lists = {
    chamber,
    relationships,
    credit,
    brand,
    training,
    sponsors,
    sectors,
  };
  return {
    records: Object.entries(lists).flatMap(([origin, rows]) =>
      rows.map(r => ({ ...r, origin }))
    ) as SectorIdentity[],
    suppressions,
  };
}
export function sectorProspectQualified(
  p: typeof prospects.$inferSelect,
  ex: Awaited<ReturnType<typeof getSectorExclusions>>,
  now = new Date()
) {
  if (
    p.qualification !== "qualified" ||
    p.stoppedAt ||
    !["review", "ready", "contacted"].includes(p.status) ||
    !p.email
  )
    return false;
  try {
    const evidence = readSectorEvidence(p.evidenceJson);
    return (
      evidence.email === p.email &&
      evidence.campaignKey === p.campaignKey &&
      evidence.company === p.company &&
      evidence.website === p.website &&
      !sectorQualificationReason(evidence, now) &&
      !sectorConflictReason(evidence, ex.records, ex.suppressions, p.id)
    );
  } catch {
    return false;
  }
}
export function sectorReadyCount(
  rows: Array<typeof prospects.$inferSelect>,
  queue: Array<typeof messages.$inferSelect>,
  ex: Awaited<ReturnType<typeof getSectorExclusions>>,
  key: SectorKey,
  approvedOnly = true
) {
  return rows.filter(
    p =>
      p.campaignKey === key &&
      !p.firstSentAt &&
      !p.manualNotes &&
      sectorProspectQualified(p, ex) &&
      [1, 2, 3].every(n =>
        queue.some(
          m =>
            m.prospectId === p.id &&
            m.messageNumber === n &&
            m.status === (approvedOnly ? "approved" : "draft") &&
            !m.attemptedAt &&
            !m.claimToken &&
            m.copyVersion === SECTOR_COPY_VERSION
        )
      )
  ).length;
}
export async function getSectorRuntimeWorkspace() {
  const db = await sectorDatabase();
  const [group] = await db.select().from(groups).where(eq(groups.id, 1));
  if (!group)
    throw new Error("Existing sector group missing; runtime never seeds");
  const [campaignRows, prospectRows, messageRows, ex] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.groupId, 1)),
    db.select().from(prospects).where(eq(prospects.groupId, 1)),
    db.select().from(messages).where(eq(messages.groupId, 1)),
    getSectorExclusions(db),
  ]);
  assertSectorFixedConfiguration(group, campaignRows);
  const { researchWebhookUrl, researchLeaseToken, ...safe } = group;
  const runtimeEvents = await db
    .select()
    .from(events)
    .where(eq(events.groupId, 1));
  return {
    events: runtimeEvents
      .slice(-100)
      .map(({ id, groupId, campaignKey, eventType, occurredAt }) => ({
        id,
        groupId,
        campaignKey,
        eventType,
        occurredAt,
      })),
    group: { ...safe, researchConnected: Boolean(researchWebhookUrl) },
    campaigns: campaignRows,
    prospects: prospectRows,
    messages: messageRows,
    health: {
      byCampaign: campaignRows.map(c => ({
        campaignKey: c.campaignKey,
        readyInitialCount: sectorReadyCount(
          prospectRows,
          messageRows,
          ex,
          c.campaignKey
        ),
        draftReadyCount: sectorReadyCount(
          prospectRows,
          messageRows,
          ex,
          c.campaignKey,
          false
        ),
        reserveTarget: c.reserveTarget,
        counts: {
          prospects: prospectRows.filter(p => p.campaignKey === c.campaignKey)
            .length,
          qualified: prospectRows.filter(
            p =>
              p.campaignKey === c.campaignKey && p.qualification === "qualified"
          ).length,
          held: prospectRows.filter(
            p =>
              p.campaignKey === c.campaignKey && p.qualification !== "qualified"
          ).length,
          attempted: messageRows.filter(
            m => m.campaignKey === c.campaignKey && m.attemptedAt
          ).length,
          smtpAccepted: messageRows.filter(
            m => m.campaignKey === c.campaignKey && m.smtpAcceptedAt
          ).length,
          uncertain: messageRows.filter(
            m => m.campaignKey === c.campaignKey && m.status === "uncertain"
          ).length,
          replied: prospectRows.filter(
            p => p.campaignKey === c.campaignKey && p.replyAt
          ).length,
          optedOut: prospectRows.filter(
            p => p.campaignKey === c.campaignKey && p.optoutAt
          ).length,
          bounced: prospectRows.filter(
            p => p.campaignKey === c.campaignKey && p.bounceAt
          ).length,
        },
      })),
    },
  };
}
export async function getSectorResearchContext() {
  const w = await getSectorRuntimeWorkspace(),
    ex = await getSectorExclusions();
  return {
    groupId: 1,
    copyVersion: SECTOR_COPY_VERSION,
    runtimeVersion: SECTOR_RUNTIME_VERSION,
    researchedOn: new Date().toISOString(),
    campaigns: SECTOR_DEFINITIONS.map(d => ({
      ...d,
      health: w.health.byCampaign.find(h => h.campaignKey === d.key),
    })),
    exclusions: ex,
    packetContract: {
      researchedOn: "ISO observation timestamp",
      prospects: "SectorResearchRecord[]",
    },
    noSends: true,
    requirements: [
      "Observe all official sources within 30 days; exact unrestricted business email quote; published role/remit; truthful team greeting for general inbox.",
      "No company/domain/email/alias overlap across legacy, sponsors, sectors or suppressions.",
      "Industrial and healthcare scenes are proposed subject to client approval, not approved filming.",
      "Missing evidence remains outside send queue. No invented proof, pricing or guarantees.",
    ],
  };
}
export type SectorImportAuthorization =
  | { mode: "setup" }
  | ({ mode: "automated" } & SectorResearchOwner);
export type SectorResearchOwner = {
  requestToken: string;
  requestedAt: string;
  ownerToken: string;
};
async function stagePacket(
  value: unknown,
  ex: Awaited<ReturnType<typeof getSectorExclusions>>
) {
  const packet = sectorResearchPacketSchema.parse(value),
    seen: SectorIdentity[] = [];
  const staged = packet.prospects.map(p => {
    const conflict = sectorConflictReason(
      p,
      [...ex.records, ...seen],
      ex.suppressions
    );
    seen.push({
      businessName: p.company,
      website: p.website,
      email: p.email,
      origin: "packet",
    });
    const holdReason =
      conflict || sectorQualificationReason(p, new Date(), packet.researchedOn);
    return { p, holdReason, conflict: Boolean(conflict) };
  });
  return {
    packet,
    staged,
    preview: {
      packetHash: sectorHash(packet),
      total: staged.length,
      qualified: staged.filter(r => !r.holdReason).length,
      held: staged
        .filter(r => r.holdReason)
        .map(r => ({
          company: r.p.company,
          campaignKey: r.p.campaignKey,
          reason: r.holdReason,
        })),
      noSends: true,
    },
  };
}
export async function previewSectorResearchImport(packet: unknown) {
  return (await stagePacket(packet, await getSectorExclusions())).preview;
}
export async function requireSectorResearchOwner(
  tx: any,
  g: typeof groups.$inferSelect,
  owner: SectorResearchOwner,
  allowFinished = false
) {
  const incident = `sector-research:${owner.requestToken}`;
  const [request] = await tx
    .select()
    .from(events)
    .where(eq(events.eventKey, incident));
  const [claim] = await tx
    .select()
    .from(events)
    .where(eq(events.eventKey, incident + ":claim"));
  const [finished] = await tx
    .select()
    .from(events)
    .where(eq(events.eventKey, incident + ":finish"));
  if (!request || !claim || !owner.ownerToken)
    throw new Error("Original request and owned claim required");
  const r = JSON.parse(request.detailJson),
    c = JSON.parse(claim.detailJson);
  if (
    r.requestToken !== owner.requestToken ||
    r.requestedAt !== owner.requestedAt ||
    c.ownerToken !== owner.ownerToken ||
    c.requestToken !== owner.requestToken ||
    c.requestedAt !== owner.requestedAt
  )
    throw new Error("Research ownership mismatch");
  if (
    !allowFinished &&
    (finished ||
      g.researchLeaseToken !== owner.requestToken ||
      g.researchRequestedAt?.toISOString() !== owner.requestedAt ||
      !g.researchLeaseUntil ||
      g.researchLeaseUntil <= new Date())
  )
    throw new Error("Research lease expired, superseded or finished");
  return { incident, finished };
}
export async function importSectorResearch(
  value: unknown,
  authorization?: SectorImportAuthorization
) {
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    const cs = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.groupId, 1))
      .for("update");
    if (!g) throw new Error("Existing group missing");
    assertSectorFixedConfiguration(g, cs);
    if (authorization?.mode === "setup") {
      if (
        g.status !== "review" ||
        g.sendingEnabled ||
        g.researchEnabled ||
        g.approvalAt
      )
        throw new Error(
          "Setup import requires unapproved review with gates off"
        );
    } else if (authorization?.mode === "automated") {
      if (!sectorGroupAuthorized(g) || g.researchEnabled !== 1)
        throw new Error("Active research approval required");
      await requireSectorResearchOwner(tx, g, authorization);
    } else
      throw new Error(
        "Explicit CLI setup context or owned automated lease required"
      );
    const staged = await stagePacket(
      value,
      await getSectorExclusions(tx as any)
    );
    const eventKey = "sector-import:" + staged.preview.packetHash;
    const [prior] = await tx
      .select()
      .from(events)
      .where(eq(events.eventKey, eventKey));
    if (prior)
      return { ...staged.preview, alreadyRecorded: true, added: 0, updated: 0 };
    let added = 0;
    const skipped: string[] = [];
    for (const { p, holdReason, conflict } of staged.staged) {
      sectorDeadlineCheck(1000);
      if (conflict) {
        skipped.push(p.company);
        continue;
      }
      await tx
        .insert(prospects)
        .values({
          groupId: 1,
          campaignKey: p.campaignKey,
          identityKey: sectorIdentityKey(p),
          company: p.company,
          website: p.website,
          contactName: p.contactName,
          contactRole: p.contactRole,
          email: p.email,
          emailSourceUrl: p.emailSourceUrl,
          emailSourceQuote: p.emailSourceQuote,
          roleSourceUrl: p.roleSourceUrl,
          phone: p.phone,
          phoneSourceUrl: p.phoneSourceUrl,
          verifiedFact: p.verifiedFact,
          factSourceUrl: p.factSourceUrl,
          personalization: JSON.stringify(p.personalization),
          proposedAngle: p.proposedAngle,
          angleSourceUrl: p.factSourceUrl,
          evidenceJson: JSON.stringify(p),
          verifiedAt: Number.isFinite(Date.parse(p.verifiedAtISO))
            ? new Date(p.verifiedAtISO)
            : null,
          qualification: holdReason ? "verification_needed" : "qualified",
          holdReason,
          status: "review",
        });
      added++;
    }
    await tx
      .insert(events)
      .values({
        groupId: 1,
        eventKey,
        eventType: "research_import",
        detailJson: JSON.stringify({
          ...staged.preview,
          added,
          updated: 0,
          skipped,
          mode: authorization.mode,
          researchedOn: staged.packet.researchedOn,
        }),
      });
    return { ...staged.preview, added, updated: 0, skipped };
  });
}
/** Never overwrites copy, manual edits or history. Review setup produces drafts; active approved runtime produces approved instances. */
export async function prepareSectorReserve() {
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    const cs = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.groupId, 1))
      .for("update");
    if (!g) throw new Error("Existing group missing");
    assertSectorFixedConfiguration(g, cs);
    if (g.status !== "review" && !sectorGroupAuthorized(g))
      return { prepared: 0, noSends: true };
    const rows = await tx
        .select()
        .from(prospects)
        .where(eq(prospects.groupId, 1))
        .for("update"),
      queue = await tx
        .select()
        .from(messages)
        .where(eq(messages.groupId, 1))
        .for("update"),
      ex = await getSectorExclusions(tx as any);
    const active = sectorGroupAuthorized(g),
      status: "approved" | "draft" = active ? "approved" : "draft";
    let prepared = 0;
    for (const c of cs) {
      let ready = sectorReadyCount(rows, queue, ex, c.campaignKey, active);
      for (const p of rows) {
        sectorDeadlineCheck(1000);
        if (ready >= c.reserveTarget) break;
        if (
          p.campaignKey !== c.campaignKey ||
          p.firstSentAt ||
          p.manualNotes ||
          !sectorProspectQualified(p, ex) ||
          queue.some(m => m.prospectId === p.id)
        )
          continue;
        const sequence = buildSectorSequence(
          readSectorEvidence(p.evidenceJson)
        );
        await tx
          .insert(messages)
          .values(
            sequence.map(m => ({
              ...m,
              groupId: 1,
              campaignKey: p.campaignKey,
              prospectId: p.id,
              status,
            }))
          );
        if (active)
          await tx
            .update(prospects)
            .set({ status: "ready" })
            .where(eq(prospects.id, p.id));
        ready++;
        prepared++;
      }
    }
    if (prepared)
      await tx
        .insert(events)
        .values({
          groupId: 1,
          eventKey: "sector-reserve:" + randomUUID(),
          eventType: "reserve_prepared",
          detailJson: JSON.stringify({ prepared, status, noSends: true }),
        });
    return { prepared, noSends: true };
  });
}
export type SectorStopDisposition =
  | "replied"
  | "opted_out"
  | "bounced"
  | "stopped"
  | "meeting";
export async function stopSectorProspect(
  id: number,
  disposition: SectorStopDisposition,
  detail: string
) {
  if (
    !["replied", "opted_out", "bounced", "stopped", "meeting"].includes(
      disposition
    )
  )
    throw new Error("Invalid stop disposition");
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    await tx.select().from(groups).where(eq(groups.id, 1)).for("update");
    const [p] = await tx
      .select()
      .from(prospects)
      .where(and(eq(prospects.id, id), eq(prospects.groupId, 1)))
      .for("update");
    if (!p) return false;
    const at = new Date();
    const terminal =
      Boolean(p.stoppedAt) ||
      [
        "replied",
        "opted_out",
        "bounced",
        "stopped",
        "meeting",
        "complete",
      ].includes(p.status);
    await tx
      .update(prospects)
      .set({
        stoppedAt: p.stoppedAt || at,
        ...(!terminal ? { status: disposition } : {}),
        ...(disposition === "replied" ? { replyAt: p.replyAt || at } : {}),
        ...(disposition === "opted_out" ? { optoutAt: p.optoutAt || at } : {}),
        ...(disposition === "bounced" ? { bounceAt: p.bounceAt || at } : {}),
      })
      .where(eq(prospects.id, id));
    const queue = await tx
      .select()
      .from(messages)
      .where(eq(messages.prospectId, id))
      .for("update");
    for (const m of queue)
      if (
        !m.attemptedAt &&
        !m.smtpAcceptedAt &&
        ["draft", "approved", "claimed"].includes(m.status)
      )
        await tx
          .update(messages)
          .set({ status: "cancelled" })
          .where(eq(messages.id, m.id));
    if (p.email)
      await tx
        .insert(chamberOutreachSuppressions)
        .ignore()
        .values({
          email: p.email.toLowerCase(),
          reason:
            disposition === "opted_out"
              ? "unsubscribed"
              : disposition === "replied"
                ? "replied"
                : disposition === "bounced"
                  ? "bounced"
                  : "manual",
          source: "sector:" + p.campaignKey,
          notes: detail.slice(0, 4000),
        });
    await tx
      .insert(events)
      .ignore()
      .values({
        groupId: 1,
        campaignKey: p.campaignKey,
        eventKey: `sector-stop:${id}:${sectorHash([disposition, detail])}`,
        eventType: "prospect_stopped",
        detailJson: JSON.stringify({
          prospectId: id,
          disposition,
          previousStatus: p.status,
          detail,
          noSends: true,
          emailOnlySuppression: true,
        }),
      });
    return true;
  });
}
export async function claimSectorResearch(input: {
  requestToken: string;
  requestedAt: string;
}) {
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    if (
      !g ||
      !sectorGroupAuthorized(g) ||
      !g.researchEnabled ||
      g.researchLeaseToken !== input.requestToken ||
      g.researchRequestedAt?.toISOString() !== input.requestedAt ||
      !g.researchLeaseUntil ||
      g.researchLeaseUntil <= new Date()
    )
      throw new Error("Original active research request required");
    const incident = `sector-research:${input.requestToken}`;
    const [request] = await tx
      .select()
      .from(events)
      .where(eq(events.eventKey, incident));
    const [prior] = await tx
      .select()
      .from(events)
      .where(eq(events.eventKey, incident + ":claim"));
    if (!request || prior)
      throw new Error(
        "Request already claimed or missing; never steal a claim"
      );
    const r = JSON.parse(request.detailJson);
    if (
      r.requestToken !== input.requestToken ||
      r.requestedAt !== input.requestedAt
    )
      throw new Error("Request metadata mismatch");
    const ownerToken = randomBytes(24).toString("hex");
    await tx
      .insert(events)
      .values({
        groupId: 1,
        eventKey: incident + ":claim",
        eventType: "research_claim",
        detailJson: JSON.stringify({ ...input, ownerToken }),
      });
    return { ...input, ownerToken };
  });
}
export async function finishSectorResearch(
  owner: SectorResearchOwner,
  detail: string
) {
  const readiness = (await getSectorRuntimeWorkspace()).health.byCampaign.map(h => ({
    campaignKey: h.campaignKey, readyCount: h.readyInitialCount, target: h.reserveTarget,
  }));
  const db = await sectorDatabase();
  return db.transaction(async tx => {
    const [g] = await tx
      .select()
      .from(groups)
      .where(eq(groups.id, 1))
      .for("update");
    if (!g) throw new Error("Group missing");
    const { incident, finished } = await requireSectorResearchOwner(
      tx,
      g,
      owner,
      true
    );
    if (finished) return { finished: true, alreadyRecorded: true };
    await tx
      .insert(events)
      .values({
        groupId: 1,
        eventKey: incident + ":finish",
        eventType: "research_finished",
        detailJson: JSON.stringify({ ...owner, detail, readyByCampaign: readiness, noSends: true }),
      });
    // A late finish must never clear a newer request's lease.
    if (
      g.researchLeaseToken === owner.requestToken &&
      g.researchRequestedAt?.toISOString() === owner.requestedAt
    )
      await tx
        .update(groups)
        .set({ researchLeaseToken: null, researchLeaseUntil: null })
        .where(eq(groups.id, 1));
    return { finished: true };
  });
}
