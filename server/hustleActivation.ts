import { createHash } from 'node:crypto';
import { HUSTLE_SLUG, HUSTLE_VERSION, HUSTLE_LAUNCH_COPY_VERSION, HUSTLE_LAUNCH_CONFIG_VERSION, HUSTLE_RUNTIME_VERSION, HUSTLE_CALLBACK, HUSTLE_LAUNCH_CRON, HUSTLE_DAILY_NEW_LIMIT, HUSTLE_SEQUENCE_DELAYS, HUSTLE_RESERVE_TARGET, buildHustleSequence, isHustleCanonicalMessage, isHustleContactQualified } from '../shared/hustleOutreach';
import { hustleConflictReason, hustleResearchSchemaRead, hustleStoredEvidenceMatches, type getHustleExclusions } from './hustleDb';

export const HUSTLE_ACTIVATION_SOURCE_VERSION = 'hustle-activation-2026-11-05-v1';
export const HUSTLE_CAPABILITY_PATH = '/api/trpc/outreachRepairs.version';
/** Known existing public origins; membership alone is never deployment proof. */
export const HUSTLE_PRODUCTION_ORIGINS = ['https://jeristotleproductions.com', 'https://www.jeristotleproductions.com', 'https://jeristotle-w4ntuzhs.manus.space'] as const;
export const HUSTLE_APPROVAL_TEXT = 'ok i like that - put it in our normal outreach template and make it active';
export const HUSTLE_APPROVED_AT = '2026-11-05T21:08:00.000Z';
export const HUSTLE_LAUNCH_TARGETS = [
  { prospectId: 8, name: 'IBC Bank / International Bancshares', messageIds: [1, 2, 3] },
  { prospectId: 17, name: 'Gulf Coast Bank & Trust Company', messageIds: [4, 5, 6] },
  { prospectId: 50, name: 'Capital Farm Credit', messageIds: [7, 8, 9] },
] as const;

/** Stable sorted-object digest, including dates, shared by manifest and release verification. */
export function hustleActivationHash(value: unknown): string {
  function canonical(v: any): string {
    if (v instanceof Date) return JSON.stringify(v.toISOString());
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    if (v === undefined) throw new Error('Undefined manifest field');
    return JSON.stringify(v);
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** Pure static release capability; no DB, sender, credential, scheduler or inbox work. */
export function getHustleActivationCapabilities() {
  return {
    sourceVersion: HUSTLE_ACTIVATION_SOURCE_VERSION,
    runtimeVersion: HUSTLE_RUNTIME_VERSION,
    policyVersion: HUSTLE_VERSION,
    approvedCopyVersion: HUSTLE_LAUNCH_COPY_VERSION,
    activeConfigVersion: HUSTLE_LAUNCH_CONFIG_VERSION,
    campaignSlug: HUSTLE_SLUG,
    callbackPath: HUSTLE_CALLBACK,
    cron: HUSTLE_LAUNCH_CRON,
    dailyNewLimit: HUSTLE_DAILY_NEW_LIMIT,
    followupsAdditional: true,
    followupAttemptLimit: 20,
    sequenceDelays: [...HUSTLE_SEQUENCE_DELAYS],
    timeZone: 'America/Chicago',
    sendLocalWindow: '09:00-17:00',
    researchLocalWindow: '01:00-06:00',
    reserveTarget: HUSTLE_RESERVE_TARGET,
    firstEmailLinkFree: true,
    professionalWhiteHtmlAndPlaintext: true,
    sourceQuoteAndCrossCampaignGuards: true,
    stopOnReplyAutomaticReplyBounceOptout: true,
    uncertainNeverRetry: true,
    copyHash: hustleActivationHash(HUSTLE_LAUNCH_TARGETS.map(t => buildHustleSequence({ name: t.name, category: 'bank', recipientType: t.prospectId === 50 ? 'marketing_team' : 'named', contactName: t.prospectId === 8 ? 'Gabriel' : t.prospectId === 17 ? 'Meg' : null }))),
  };
}

/** A full sequence is admitted or held as a unit; there is no copy rewrite or partial approval. */
export function hustleActivationDraftSequence(p: any, queue: any[], exclusions: Awaited<ReturnType<typeof getHustleExclusions>>, now = new Date()): number[] | null {
  if (p.campaignId !== 1 || p.qualification !== 'qualified' || p.holdReason || p.manualNotes || !['ready', 'identified'].includes(p.stage) || p.firstSentAt || p.lastSentAt || p.stoppedAt) return null;
  try {
    const evidence = hustleResearchSchemaRead(p.evidenceJson);
    if (!hustleStoredEvidenceMatches(p, evidence) || !isHustleContactQualified(evidence, undefined, now) || hustleConflictReason(evidence, exclusions)) return null;
    const sequence = queue.filter(m => m.prospectId === p.id);
    if (sequence.length !== 3 || ![0, 1, 2].every(step => sequence.filter(m => m.sequenceStep === step).length === 1)) return null;
    if (sequence.some(m => m.campaignId !== 1 || !['draft', 'approved'].includes(m.status) || !isHustleCanonicalMessage(p, m) || ['scheduledAt', 'claimToken', 'attemptedAt', 'smtpAcceptedAt', 'providerMessageId', 'error'].some(k => m[k]))) return null;
    return sequence.sort((a, b) => a.sequenceStep - b.sequenceStep).map(m => m.id);
  } catch { return null; }
}

/** Original nine unsent drafts only. Nothing held, manual, historical or unrelated is promoted. */
export function assertHustleInitialLaunchState(state: { campaign: any; prospects: any[]; messages: any[]; episodes: any[]; events: any[] }, exclusions: Awaited<ReturnType<typeof getHustleExclusions>>, now = new Date()) {
  const { campaign: c, prospects, messages, episodes, events } = state;
  if (!c || c.id !== 1 || c.slug !== HUSTLE_SLUG || c.configVersion !== HUSTLE_VERSION || c.status !== 'review' || c.episodeGoal !== 24 || c.launchApprovedAt || c.schedulerTaskUid || c.researchWebhookUrl || c.researchRequestedAt || c.researchLeaseUntil || c.lastInboxScanAt) throw new Error('Original unbound, unapproved fixed review campaign required');
  if (prospects.length !== 61 || prospects.filter(p => p.qualification === 'qualified').length !== 3 || prospects.filter(p => p.qualification !== 'qualified').length !== 58 || messages.length !== 9 || prospects.some(p => p.campaignId !== 1 || p.firstSentAt || p.lastSentAt || p.stoppedAt || p.manualNotes)) throw new Error('Original 61-record / 3-qualified / 58-held / 9-unsent state required; never reset history');
  if (episodes.length !== 24 || new Set(episodes.map(e => e.episodeNumber)).size !== 24 || episodes.some(e => e.campaignId !== 1 || e.seasonYear !== 2027 || e.episodeNumber < 1 || e.episodeNumber > 24 || e.sponsorProspectId || e.status !== 'unassigned' || e.notes)) throw new Error('Original 24 unassigned 2027 episode slots required');
  if (events.some(e => /activation|daily_send|research_requested|research_lease/.test(e.eventType)) || events.filter(e => e.eventType === 'copy_revised' && e.eventKey === 'benefit-copy-revision:2026-11-05').length !== 1) throw new Error('Exact copy revision audit and no prior live launch/history required');
  const targetMessages: number[] = [];
  for (const target of HUSTLE_LAUNCH_TARGETS) {
    const p = prospects.find(p => p.id === target.prospectId && p.name === target.name);
    if (!p || p.stage !== 'ready') throw new Error('Original three qualified ready prospects required; activation never resets their stages');
    const ids = p && hustleActivationDraftSequence(p, messages, exclusions, now);
    if (!ids || ids.join(',') !== target.messageIds.join(',')) throw new Error('All nine exact canonical qualified source-conflict-free drafts required');
    targetMessages.push(...ids);
  }
  return { prospectIds: HUSTLE_LAUNCH_TARGETS.map(t => t.prospectId), messageIds: targetMessages, readyInitialCount: 3, unsentMessages: 9, held: 58, reserveTarget: 20, reserveGap: 17 };
}
