import { createHash } from "node:crypto";
import { SECTOR_COPY_VERSION, SECTOR_DEFINITIONS, SECTOR_GROUP_SLUG, SECTOR_KEYS, SECTOR_CAP_POLICY_VERSION, SECTOR_DAILY_NEW_PER_CAMPAIGN } from "../shared/sectorOutreach";
import { SECTOR_RUNTIME_VERSION, buildSectorSequence, readSectorEvidence } from "../shared/sectorResearch";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from "../shared/outboundReplenishmentPolicy";
import release from "../shared/outreachRepairRelease.json";

export const SECTOR_ACTIVATION_SOURCE_VERSION = "sector-activation-repair-2026-11-05-v1";
export const SECTOR_ACTIVATION_CAPABILITY_PATH = "/api/trpc/outreachRepairs.version";
export function getSectorDeploymentRelease() { return { ...release }; }
// These are the three existing public origins recorded in the Nov 5 public-check archive.
// Membership is not deployment proof: the helper separately fetches the exact capability route.
export const SECTOR_PRODUCTION_ORIGINS = [
  "https://jeristotleproductions.com",
  "https://www.jeristotleproductions.com",
  "https://jeristotle-w4ntuzhs.manus.space",
] as const;
export function getSectorActivationCapabilities() {
  return {
    sourceVersion: SECTOR_ACTIVATION_SOURCE_VERSION,
    runtimeVersion: SECTOR_RUNTIME_VERSION,
    approvedCopyVersion: SECTOR_COPY_VERSION,
    policyVersion: SECTOR_CAP_POLICY_VERSION,
    groupSlug: SECTOR_GROUP_SLUG,
    campaignKeys: [...SECTOR_KEYS],
    copyHash: createHash("sha256").update(JSON.stringify(SECTOR_DEFINITIONS)).digest("hex"),
    callbackPath: "/api/scheduled/sector-outreach",
    production: process.env.NODE_ENV === "production",
    dailyNewPerCampaign: SECTOR_DAILY_NEW_PER_CAMPAIGN,
    reserveTarget: OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET,
    followupsAdditional: true,
    sendSevenDays: true,
    timeZone: "America/Chicago",
    researchLocalWindow: "01:00-06:00",
    sendLocalWindow: "09:00-17:00",
  };
}
/** Pure predicate. Any manual/history/identity discrepancy holds the entire sequence. */
export function sectorActivationDraftSequence(p: any, queue: any[]): number[] | null {
  if (p.groupId !== 1 || p.status !== "review" || p.manualNotes ||
      ["firstSentAt", "lastSentAt", "replyAt", "optoutAt", "bounceAt", "stoppedAt"].some(k => p[k])) return null;
  try {
    const expected = buildSectorSequence(readSectorEvidence(p.evidenceJson));
    const sequence = queue.filter(m => m.prospectId === p.id);
    if (sequence.length !== 3 || !expected.every(s => sequence.some(m =>
      m.groupId === 1 && m.campaignKey === p.campaignKey &&
      m.messageNumber === s.messageNumber && m.subject === s.subject &&
      m.textBody === s.textBody && m.htmlBody === s.htmlBody &&
      m.copyVersion === SECTOR_COPY_VERSION && m.status === "draft" &&
      !["attemptedAt", "smtpAcceptedAt", "claimToken", "claimedAt", "receiptJson",
        "providerMessageId", "scheduledAt", "attemptDate", "replyAt", "optoutAt",
        "deliveredAt", "bouncedAt", "error"].some(k => m[k])
    ))) return null;
    return sequence.map(m => m.id);
  } catch { return null; }
}
