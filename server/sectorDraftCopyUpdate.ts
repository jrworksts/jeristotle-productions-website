import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  sectorOutreachGroups as G,
  sectorOutreachCampaigns as C,
  sectorOutreachProspects as P,
  sectorOutreachMessages as M,
  sectorOutreachEvents as E,
} from "../drizzle/schema";
import {
  SECTOR_DEFINITIONS,
  SECTOR_GROUP_SLUG,
  SECTOR_KEYS,
  SECTOR_VERSION,
  SECTOR_COPY_VERSION,
  SECTOR_TIME_ZONE,
  SECTOR_SEND_SEVEN_DAYS,
  SECTOR_FOLLOWUP_BUSINESS_DAYS,
} from "../shared/sectorOutreach";
import { getDb } from "./db";

export const SECTOR_COPY_REVISION = "results-revision-2026-11-05";
export const SECTOR_COPY_BASELINE_PATH =
  "research/sector-copy-before-results-revision-2026-11-05.json";
export const SECTOR_COPY_RECEIPT_PATH =
  "research/sector-copy-results-revision-receipt-2026-11-05.json";
// IDs verified against the existing isolated 2026-11-05 raw policy archive.
// Historical contract only. Never import the mutable active ten-new policy here.
const HISTORICAL_DAILY_NEW_PER_CAMPAIGN = 5 as const;
const IDS = {
  tourism: 1,
  real_estate: 2,
  industrial: 3,
  healthcare: 4,
} as const;
const KEYS = Object.keys(IDS) as (keyof typeof IDS)[];
type RawRow = Record<string, unknown>;
export type SectorCopySnapshot = {
  group: RawRow;
  campaigns: RawRow[];
  events: RawRow[];
  prospects: RawRow[];
  messages: RawRow[];
};
export type SectorCopySequence = {
  campaignId: number;
  campaignKey: keyof typeof IDS;
  sequenceJson: string;
  sha256: string;
};
export type SectorCopyBaseline = {
  format: "sector-copy-baseline-v1";
  revision: typeof SECTOR_COPY_REVISION;
  copyVersion: typeof SECTOR_COPY_VERSION;
  capturedAt: string;
  fingerprint: string;
  snapshot: SectorCopySnapshot;
  expectedHash: string;
  expectedSequences: SectorCopySequence[];
};
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function fail(message: string): never {
  throw new Error(
    `Sector copy revision blocked: ${message}; inspect without overwriting`
  );
}
function raw<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as RawRow;
    return `{${Object.keys(row)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export function sectorCopyHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function equal(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function snapshotFingerprint(snapshot: SectorCopySnapshot): string {
  return sectorCopyHash(canonical(snapshot));
}
function assertSequence(sequenceJson: unknown): asserts sequenceJson is string {
  if (typeof sequenceJson !== "string") fail("missing raw sequence");
  let messages: unknown;
  try {
    messages = JSON.parse(sequenceJson);
  } catch {
    fail("invalid sequence JSON");
  }
  if (
    !Array.isArray(messages) ||
    messages.length !== 3 ||
    ![1, 2, 3].every(
      n => messages.filter(m => m?.messageNumber === n).length === 1
    ) ||
    !messages.every(
      m =>
        typeof m.subject === "string" &&
        m.subject.trim() &&
        typeof m.body === "string" &&
        m.body.trim()
    )
  )
    fail("exactly three valid numbered templates required");
}
function expectedSequences(): SectorCopySequence[] {
  if (
    SECTOR_VERSION !== "sector-draft-review-v2" ||
    SECTOR_GROUP_SLUG !== "coastal-bend-four-sector-outreach-2026" ||
    String(SECTOR_COPY_VERSION) !== "sector-results-reply-first-v1" ||
    !equal(SECTOR_KEYS, KEYS) ||
    SECTOR_TIME_ZONE !== "America/Chicago" ||
    SECTOR_SEND_SEVEN_DAYS !== true ||
    !equal(SECTOR_FOLLOWUP_BUSINESS_DAYS, [4, 8]) ||
    SECTOR_DEFINITIONS.length !== 4 ||
    KEYS.some(key => SECTOR_DEFINITIONS.filter(d => d.key === key).length !== 1)
  ) {
    fail("live definitions changed the existing policy or exact four keys");
  }
  return KEYS.map(campaignKey => {
    const sequenceJson = JSON.stringify(
      SECTOR_DEFINITIONS.find(d => d.key === campaignKey)!.messages
    );
    assertSequence(sequenceJson);
    return {
      campaignId: IDS[campaignKey],
      campaignKey,
      sequenceJson,
      sha256: sectorCopyHash(sequenceJson),
    };
  });
}
function assertSnapshot(snapshot: SectorCopySnapshot): void {
  if (
    !snapshot ||
    !snapshot.group ||
    !Array.isArray(snapshot.campaigns) ||
    !Array.isArray(snapshot.events) ||
    !Array.isArray(snapshot.prospects) ||
    !Array.isArray(snapshot.messages)
  ) {
    fail("invalid raw snapshot");
  }
  const g = snapshot.group;
  if (
    g.id !== 1 ||
    g.slug !== SECTOR_GROUP_SLUG ||
    g.status !== "review" ||
    g.approvalAt !== null ||
    g.sendingEnabled !== 0 ||
    g.researchEnabled !== 0 ||
    g.policyVersion !== "sector-draft-review-v2" ||
    g.timeZone !== "America/Chicago" ||
    g.totalDailyCap !== null ||
    g.includesFollowups !== 0 ||
    g.capScope !== "per_campaign_new" ||
    g.sendSevenDays !== 1 ||
    g.followupBusinessDaysJson !== "[4,8]"
  )
    fail(
      "unapproved inactive review gates / five-new-per-campaign seven-day policy required"
    );
  if (
    snapshot.campaigns.length !== 4 ||
    KEYS.some(
      key =>
        snapshot.campaigns.filter(
          c =>
            c.campaignKey === key &&
            c.id === IDS[key] &&
            c.groupId === 1 &&
            c.status === "review" &&
            c.dailyNewLimit === HISTORICAL_DAILY_NEW_PER_CAMPAIGN
        ).length !== 1
    )
  ) {
    fail("exact four existing campaign IDs and review limits required");
  }
  if (snapshot.prospects.length || snapshot.messages.length)
    fail("ZERO prospects and ZERO recipient message instances required");
  for (const c of snapshot.campaigns) assertSequence(c.sequenceJson);
  if (
    snapshot.events.some(
      e =>
        e.groupId !== 1 ||
        !Number.isInteger(e.id) ||
        typeof e.eventKey !== "string" ||
        !["draft_setup", "review_notes_updated", "policy_updated"].includes(
          String(e.eventType)
        ) ||
        typeof e.detailJson !== "string"
    ) ||
    new Set(snapshot.events.map(e => e.id)).size !== snapshot.events.length ||
    new Set(snapshot.events.map(e => e.eventKey)).size !==
      snapshot.events.length
  )
    fail("invalid or ambiguous existing audits");
}
function isCopyAudit(event: RawRow): boolean {
  if (String(event.eventKey).startsWith("copy_revision:")) return true;
  try {
    return JSON.parse(String(event.detailJson)).action === "copy_revision";
  } catch {
    return false;
  } // Old audits are opaque and preserved byte-for-byte.
}
function normalizeSnapshot(snapshot: SectorCopySnapshot): SectorCopySnapshot {
  const result = raw(snapshot);
  result.campaigns.sort((a, b) => Number(a.id) - Number(b.id));
  result.events.sort((a, b) => Number(a.id) - Number(b.id));
  return result;
}
async function lockedSnapshot(tx: Tx): Promise<SectorCopySnapshot> {
  const groups = await tx
    .select()
    .from(G)
    .where(eq(G.slug, SECTOR_GROUP_SLUG))
    .for("update");
  if (groups.length !== 1 || groups[0].id !== 1)
    fail("exact existing isolated group ID required");
  const group = groups[0];
  const campaigns = await tx
    .select()
    .from(C)
    .where(eq(C.groupId, group.id))
    .for("update");
  const prospects = await tx
    .select()
    .from(P)
    .where(eq(P.groupId, group.id))
    .for("update");
  const messages = await tx
    .select()
    .from(M)
    .where(eq(M.groupId, group.id))
    .for("update");
  const events = await tx
    .select()
    .from(E)
    .where(eq(E.groupId, group.id))
    .for("update");
  const snapshot = normalizeSnapshot({
    group,
    campaigns,
    prospects,
    messages,
    events,
  });
  assertSnapshot(snapshot);
  return snapshot;
}
function createBaseline(
  snapshot: SectorCopySnapshot,
  expected: SectorCopySequence[]
): SectorCopyBaseline {
  if (snapshot.events.some(isCopyAudit))
    fail("copy audit exists but original file baseline is missing");
  if (
    expected.some(
      e =>
        snapshot.campaigns.find(c => c.id === e.campaignId)!.sequenceJson ===
        e.sequenceJson
    )
  ) {
    fail(
      "all four prior sequences must differ from the proposed revision; no unaudited no-op"
    );
  }
  return {
    format: "sector-copy-baseline-v1",
    revision: SECTOR_COPY_REVISION,
    copyVersion: SECTOR_COPY_VERSION,
    capturedAt: new Date().toISOString(),
    fingerprint: snapshotFingerprint(snapshot),
    snapshot,
    expectedHash: sectorCopyHash(canonical(expected)),
    expectedSequences: expected,
  };
}
export function validateSectorCopyBaseline(input: unknown): SectorCopyBaseline {
  const b = input as SectorCopyBaseline;
  if (
    !b ||
    b.format !== "sector-copy-baseline-v1" ||
    b.revision !== SECTOR_COPY_REVISION ||
    b.copyVersion !== SECTOR_COPY_VERSION ||
    typeof b.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(b.capturedAt))
  )
    fail("missing or invalid original file baseline");
  assertSnapshot(b.snapshot);
  if (
    !equal(b.snapshot, normalizeSnapshot(b.snapshot)) ||
    b.fingerprint !== snapshotFingerprint(b.snapshot) ||
    !equal(b.expectedSequences, expectedSequences()) ||
    b.expectedHash !== sectorCopyHash(canonical(b.expectedSequences)) ||
    b.snapshot.events.some(isCopyAudit)
  )
    fail(
      "file baseline fingerprint, live expected copy or prior audits mismatch"
    );
  if (
    b.expectedSequences.some(
      e =>
        b.snapshot.campaigns.find(c => c.id === e.campaignId)!.sequenceJson ===
        e.sequenceJson
    )
  ) {
    fail("baseline contains an unaudited target sequence");
  }
  return b;
}
function revisionAudit(b: SectorCopyBaseline) {
  const revisionHash = sectorCopyHash(
    canonical({
      revision: SECTOR_COPY_REVISION,
      groupId: 1,
      copyVersion: b.copyVersion,
      slug: SECTOR_GROUP_SLUG,
      beforeFingerprint: b.fingerprint,
      expectedHash: b.expectedHash,
    })
  );
  const sequences = b.expectedSequences.map(e => {
    const sequenceJson = b.snapshot.campaigns.find(c => c.id === e.campaignId)!
      .sequenceJson as string;
    return {
      campaignId: e.campaignId,
      campaignKey: e.campaignKey,
      before: { sequenceJson, sha256: sectorCopyHash(sequenceJson) },
      after: { sequenceJson: e.sequenceJson, sha256: e.sha256 },
    };
  });
  const detail = {
    action: "copy_revision",
    revision: SECTOR_COPY_REVISION,
    revisionHash,
    copyVersion: b.copyVersion,
    groupId: 1,
    slug: SECTOR_GROUP_SLUG,
    baselinePath: SECTOR_COPY_BASELINE_PATH,
    beforeFingerprint: b.fingerprint,
    expectedHash: b.expectedHash,
    sequences,
    policyVersion: "sector-draft-review-v2",
    status: "review",
    approvalAt: null,
    sendingEnabled: false,
    researchEnabled: false,
    perCampaignNewLimit: HISTORICAL_DAILY_NEW_PER_CAMPAIGN,
    capScope: "per_campaign_new",
    totalDailyCap: null,
    includesFollowups: false,
    sendSevenDays: true,
    followupBusinessDays: [4, 8],
    noSend: true,
    noEnrollment: true,
    noResearch: true,
    noSchedules: true,
    notApproval: true,
    criteriaPreserved: true,
    reviewNotesPreserved: true,
    groupFieldsPreserved: true,
    oldAuditsPreserved: true,
    allowedCampaignFields: ["sequenceJson", "updatedAt"],
  };
  return {
    groupId: 1,
    campaignKey: null,
    eventType: "draft_setup" as const,
    eventKey: `copy_revision:${revisionHash}`,
    detailJson: JSON.stringify(detail),
    detail,
  };
}
function assertPreserved(
  before: SectorCopySnapshot,
  after: SectorCopySnapshot
): void {
  if (!equal(before.group, after.group))
    fail("a group field changed (including policy, approval or updatedAt)");
  for (const c of before.campaigns) {
    const a = after.campaigns.find(row => row.id === c.id)!;
    const protectedFields = (row: RawRow) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !["sequenceJson", "updatedAt"].includes(key)
        )
      );
    if (!a || !equal(protectedFields(c), protectedFields(a)))
      fail("campaign controls, criteria, notes or identity changed");
  }
  if (!before.events.every(e => after.events.some(a => equal(a, e))))
    fail("a full raw prior audit changed or disappeared");
}
function verifyReplay(
  current: SectorCopySnapshot,
  b: SectorCopyBaseline
): boolean {
  const audit = revisionAudit(b);
  const copyEvents = current.events.filter(isCopyAudit);
  if (!copyEvents.length) {
    if (
      !equal(current, b.snapshot) ||
      snapshotFingerprint(current) !== b.fingerprint
    )
      fail("current raw rows do not exactly match the file baseline");
    return false;
  }
  if (
    copyEvents.length !== 1 ||
    copyEvents[0].eventKey !== audit.eventKey ||
    copyEvents[0].groupId !== 1 ||
    copyEvents[0].campaignKey !== null ||
    copyEvents[0].eventType !== "draft_setup" ||
    copyEvents[0].detailJson !== audit.detailJson ||
    current.events.length !== b.snapshot.events.length + 1 ||
    b.expectedSequences.some(
      e =>
        current.campaigns.find(c => c.id === e.campaignId)!.sequenceJson !==
        e.sequenceJson
    )
  ) {
    fail(
      "ambiguous copy audit / sequence mismatch; replay never overwrites edited copy"
    );
  }
  assertPreserved(b.snapshot, current);
  return true;
}
function receipt(b: SectorCopyBaseline, after: SectorCopySnapshot) {
  const audit = revisionAudit(b);
  return {
    format: "sector-copy-receipt-v1",
    revision: SECTOR_COPY_REVISION,
    copyVersion: b.copyVersion,
    groupId: 1,
    eventKey: audit.eventKey,
    event: after.events.find(e => e.eventKey === audit.eventKey)!,
    beforeFingerprint: b.fingerprint,
    afterFingerprint: snapshotFingerprint(after),
    expectedHash: b.expectedHash,
    sequences: audit.detail.sequences,
    afterSnapshot: after,
    gates: {
      status: "review",
      approvalAt: null,
      sendingEnabled: false,
      researchEnabled: false,
      activationAvailable: false,
      approvalAvailable: false,
      policyVersion: "sector-draft-review-v2",
      perCampaignNewLimit: HISTORICAL_DAILY_NEW_PER_CAMPAIGN,
      capScope: "per_campaign_new",
      totalDailyCap: null,
      includesFollowups: false,
      sendSevenDays: true,
      timeZone: "America/Chicago",
      followupBusinessDays: [4, 8],
    },
    totals: {
      campaigns: 4,
      templates: 12,
      prospects: 0,
      messages: 0,
      attempted: 0,
      smtpAccepted: 0,
    },
    noSend: true,
    noEnrollment: true,
    noResearch: true,
    noSchedules: true,
    notApproval: true,
    criteriaPreserved: true,
    reviewNotesPreserved: true,
    groupFieldsPreserved: true,
    oldAuditsPreserved: true,
    copyOnly: true,
  };
}
async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) fail("database unavailable; counts cannot be assumed zero");
  return db;
}
/** CLI-only, locked read-only preview. No filesystem writes, seeding, network calls or activation. */
export async function previewSectorDraftCopy(input?: unknown) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const current = await lockedSnapshot(tx);
    const baseline =
      input === undefined
        ? createBaseline(current, expectedSequences())
        : validateSectorCopyBaseline(input);
    const replayVerified = verifyReplay(current, baseline);
    const audit = revisionAudit(baseline);
    return {
      mode: "preview" as const,
      wouldChange: !replayVerified,
      replayVerified,
      databaseWrites: 0,
      filesystemWrites: 0,
      noSend: true,
      baseline,
      plannedCampaignIds: baseline.expectedSequences.map(e => e.campaignId),
      plannedAudit: audit,
      receipt: replayVerified ? receipt(baseline, current) : null,
    };
  });
}
/** CLI-only apply: caller must load the original, exclusively-created baseline file. */
export async function applySectorDraftCopy(input: unknown) {
  const baseline = validateSectorCopyBaseline(input);
  const db = await requireDb();
  return db.transaction(async tx => {
    const before = await lockedSnapshot(tx);
    if (verifyReplay(before, baseline)) {
      return {
        changed: false,
        replayVerified: true,
        receipt: receipt(baseline, before),
      };
    }
    for (const e of baseline.expectedSequences) {
      // No explicit updatedAt: the schema's automatic on-update timestamp is the only other permitted change.
      await tx
        .update(C)
        .set({ sequenceJson: e.sequenceJson })
        .where(
          and(
            eq(C.groupId, 1),
            eq(C.id, e.campaignId),
            eq(C.campaignKey, e.campaignKey)
          )
        );
    }
    const { detail: _detail, ...audit } = revisionAudit(baseline);
    await tx.insert(E).values(audit); // Not ignore/upsert: a collision must roll back.
    const after = await lockedSnapshot(tx);
    if (!verifyReplay(after, baseline))
      fail("post-write exact-copy audit readback failed");
    return {
      changed: true,
      replayVerified: false,
      receipt: receipt(baseline, after),
    };
  });
}
