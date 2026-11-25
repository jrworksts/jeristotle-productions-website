/** Private managed-task research adapter. No routes, signer, preparation, provider or message writes.
 * A public sponsorship is historical recognition, NOT interest, budget or permission to send.
 * Only the owning task may supply independently observed provenance; this is not a signature service.
 */
import { createHash, randomBytes } from 'node:crypto';
import { constants, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, fstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db';
import { getSectorExclusions } from './sectorRuntimeDb';
import { getSectorReservedRows } from './sectorCrossCampaignGuard';
import { hustleCampaigns, hustleProspects, hustleMessages, hustleEvents, chamberOutreachProspects, creditUnionProspects, brandVideoProspects, trainingOutreachProspects, sectorOutreachProspects, chamberProspects, chamberOutreachSuppressions } from '../drizzle/schema';
import { HUSTLE_SLUG } from '../shared/hustleOutreach';
import { HUSTLE_SPONSORED_CONFIG_VERSION, sponsoredProtectedIdentity } from '../shared/hustleSponsoredReview';
import { isPublicTrainingHttpUrl, normalizeTrainingBusiness, normalizeTrainingDomain, normalizeTrainingEmail } from '../shared/trainingOutreach';

export const RESEARCH_RESERVE_VERSION = 'hustle-source-review-reserve-v1' as const;
export const RESEARCH_TASK_ID = 'c56yJvFkzrx3K3dvrdOjiK' as const;
export const RESEARCH_DIRECT_RECORD = Object.freeze({ taskId: 'wYxXaeCb15BTQVjEmz9GMN', id: 'g7Vi6CyjQGRMCmRaG1offc', timestamp: 1795113849805, userId: '310519663569963942', content: 'Please fix this and build the queue up as well so we keep sending hit 30 people ' });
export const STANDING_RESEARCH_DIRECT_RECORD = Object.freeze({ taskId: 'wYxXaeCb15BTQVjEmz9GMN', id: 'tAhQ3dJrh8bXbqa1HTzeJE', timestamp: 1795041187936, userId: '310519663569963942', content: 'Also make sure to keep 30 potential people in the pipeline consistently ' });
export const RESEARCH_RESERVE_HOLD = 'Source-only research reserve. Exact recipient, message, footer and campaign review required; no message approval, preparation or sending.';
const text = (max: number) => z.string().min(1).max(max).refine(v => v === v.trim(), 'Exact unpadded text required');
const publicUrl = text(500).refine(v => isPublicTrainingHttpUrl(v) && !/\.(?:test|invalid|example)$/i.test(new URL(v).hostname), 'Public HTTP URL required');
const fact = z.object({ url: publicUrl, quote: text(4000), observedOn: z.string().date() }).strict();
export const researchReserveRecordSchema = z.object({
  existingId: z.number().int().positive().safe().nullable(), name: text(220), website: publicUrl,
  email: text(320).refine(v => normalizeTrainingEmail(v) === v, 'Exact normalized email required'),
  contactName: text(180).nullable(), greeting: text(260), emailEvidence: fact,
  phone: fact.extend({ number: text(100), kind: z.enum(['company', 'work_direct']) }).strict(),
  localEvidence: fact, sponsorship: fact.extend({ program: text(500), year: z.union([z.number().int().min(1900).max(2200), z.literal('undated'), z.null()]) }).strict(),
  limitations: z.array(text(4000)).max(30), knownAliases: z.array(text(500)).max(30),
}).strict();
export const researchReservePacketSchema = z.object({ version: z.literal(RESEARCH_RESERVE_VERSION), checkedOn: z.string().date(), target: z.literal(30), records: z.array(researchReserveRecordSchema).max(100) }).strict().superRefine((packet, ctx) => {
  const seen: string[][] = [];
  packet.records.forEach((record, i) => {
    const a = recordAliases(record);
    if (seen.some(b => overlap(a, b))) ctx.addIssue({ code: 'custom', path: ['records', i], message: 'Duplicate organization/domain/email/family in packet' });
    seen.push(a);
  });
});
export type ResearchReserveRecord = z.infer<typeof researchReserveRecordSchema>;
export type ResearchReservePacket = z.infer<typeof researchReservePacketSchema>;
export const researchReserveProvenanceSchema = z.object({
  verificationSource: z.literal('manus-tasks.list_task_messages'), task_id: z.literal(RESEARCH_DIRECT_RECORD.taskId),
  verifiedAt: z.string().datetime({ offset: true }), toolResponseSha256: z.string().regex(/^[a-f0-9]{64}$/), messages: z.array(z.unknown()).min(1).max(1000),
}).strict();
const ownerSchema = z.object({ version: z.literal(RESEARCH_RESERVE_VERSION), kind: z.literal('managed_task_operator'), executionTaskId: z.literal(RESEARCH_TASK_ID),
  ownerFile: text(1024),
  incident: text(200), requestToken: z.string().regex(/^[a-f0-9]{48}$/), ownerToken: z.string().regex(/^[a-f0-9]{48}$/),
  requestedAt: z.string().datetime(), expiresAt: z.number().int(), provenanceId: z.enum([RESEARCH_DIRECT_RECORD.id, STANDING_RESEARCH_DIRECT_RECORD.id]), provenanceHash: z.string().regex(/^[a-f0-9]{64}$/),
  maintenance: z.object({ authorityId: z.literal(STANDING_RESEARCH_DIRECT_RECORD.id), initialEligible: z.number().int().min(0).max(29), deficit: z.number().int().min(1).max(30) }).strict().optional(),
}).strict();
type Owner = z.infer<typeof ownerSchema>;
type Row = Record<string, any>;
const markerSchema = z.object({ version: z.literal(RESEARCH_RESERVE_VERSION), packetHash: z.string().regex(/^[a-f0-9]{64}$/), checkedOn: z.string().date(), record: researchReserveRecordSchema,
  retainedAliases: z.array(z.string()).max(500), exactMessageReviewRequired: z.literal(true), sendApproved: z.literal(false),
}).strict();
function canonical(v: any): string { return JSON.stringify(v === null || typeof v !== 'object' ? v : Array.isArray(v) ? v.map(x => JSON.parse(canonical(x))) : Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))]))); }
export const researchReserveHash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
const incident = `hustle-source-research:${RESEARCH_DIRECT_RECORD.id}:2026-11-19`;
const safety = { noSends: true, sendApproved: false, exactMessageReviewRequired: true } as const;
function verifyDirectProvenance(value: unknown, expected: typeof RESEARCH_DIRECT_RECORD | typeof STANDING_RESEARCH_DIRECT_RECORD, now: Date) {
  const proof = researchReserveProvenanceSchema.parse(value), at = Date.parse(proof.verifiedAt);
  if (!Number.isFinite(now.getTime()) || at > now.getTime() || now.getTime() - at > 15 * 60_000 || at < expected.timestamp) throw new Error('Fresh independent direct-record verification required');
  const matches = proof.messages.filter((m: any) => m?.id === expected.id) as Row[];
  const m = matches[0];
  if (matches.length !== 1 || !m || m.type !== 'user_message' || 'source_task' in m || !m.user_message || 'source_task' in m.user_message ||
      m.user_message.sender?.user_id !== expected.userId || Number(m.timestamp) !== expected.timestamp || m.user_message.content !== expected.content) throw new Error('Exact unforwarded direct user record required');
  return { provenanceId: expected.id, provenanceHash: researchReserveHash(proof), proof };
}
export function verifyResearchReserveProvenance(value: unknown, now = new Date()) {
  return verifyDirectProvenance(value, RESEARCH_DIRECT_RECORD, now);
}
export function verifyStandingResearchReserveProvenance(value: unknown, now = new Date()) {
  return verifyDirectProvenance(value, STANDING_RESEARCH_DIRECT_RECORD, now);
}
/** Files survive uncertain commits. Never overwrite, unlink or auto-recover an owner/intent. */
export function writeResearchReservePrivateFile(path: string, value: unknown) {
  const absolute = resolve(path), fd = openSync(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(absolute), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); }
}
export function readResearchReservePrivateFile(path: string): unknown {
  const fd = openSync(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || (s.mode & 0o777) !== 0o600 || s.nlink !== 1 || s.uid !== process.getuid?.() || s.size > 2_000_000) throw new Error('Bounded original private mode0600 file required');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
const publicMail = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
const nameKey = (v: string) => normalizeTrainingBusiness(v).replace(/\b(?:llc|inc|incorporated|corp|corporation|ltd|limited|company|co)\b/g, '').replace(/\s+/g, ' ').trim();
function identityAliases(name?: string, website?: string, email?: string) {
  const a: string[] = [], domain = normalizeTrainingDomain(website), address = normalizeTrainingEmail(email);
  if (nameKey(name || '')) a.push('name:' + nameKey(name || ''));
  if (domain && !publicMail.has(domain)) a.push('domain:' + domain);
  if (address) { a.push('email:' + address); const d = address.split('@')[1]!; if (!publicMail.has(d)) a.push('domain:' + d); }
  return a;
}
function aliasValue(value: string): string[] {
  if (/^(?:name|domain|email):/.test(value)) return [value];
  if (normalizeTrainingEmail(value)) return identityAliases(undefined, undefined, value);
  if (/^https?:\/\//i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return identityAliases(undefined, value);
  return identityAliases(value);
}
function recordAliases(p: ResearchReserveRecord) { return Array.from(new Set([...identityAliases(p.name, p.website, p.email), ...p.knownAliases.flatMap(aliasValue)])); }
function rowAliases(row: Row): string[] {
  const a = identityAliases(row.name || row.businessName || row.creditUnionName || row.company, row.website || row.normalizedDomain || row.organizationKey, row.email || row.primaryEmail || row.normalizedEmail);
  // Retain recorded parent/alternate identities and contacts, not merely primary inboxes.
  const visit = (v: any, depth = 0) => {
    if (!v || depth > 12) return;
    if (Array.isArray(v)) { v.forEach(x => visit(x, depth + 1)); return; }
    if (typeof v !== 'object') return;
    for (const [key, item] of Object.entries(v)) {
      if (/^(?:knownAliases|parentAliases|aliases|retainedAliases|parentCompany|parentName|parentDomain|parentWebsite|organizationKey|normalizedDomain)$/i.test(key)) {
        for (const x of Array.isArray(item) ? item : [item]) if (typeof x === 'string') a.push(...aliasValue(x));
      }
      if (/^(?:email|primaryEmail|normalizedEmail)$/i.test(key) && typeof item === 'string') a.push(...identityAliases(undefined, undefined, item));
      if (/^(?:name|organization|businessName|creditUnionName|company)$/i.test(key) && typeof item === 'string') a.push(...identityAliases(item));
      if (/^(?:website|domain)$/i.test(key) && typeof item === 'string') a.push(...identityAliases(undefined, item));
      if (typeof item === 'object') visit(item, depth + 1);
    }
  };
  visit(row);
  for (const field of ['contactsJson', 'researchJson', 'evidenceJson', 'sourcesJson']) if (row[field]) {
    try { visit(JSON.parse(row[field])); } catch { /* Primary identity still reserved; unknown holds remain immutable. */ }
    for (const email of String(row[field]).match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) a.push(...identityAliases(undefined, undefined, email.toLowerCase()));
  }
  for (const email of String(row.email || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) a.push(...identityAliases(undefined, undefined, email.toLowerCase()));
  return Array.from(new Set(a));
}
function overlap(a: string[], b: string[]) { return a.some(x => b.some(y => x === y || (x.startsWith('domain:') && y.startsWith('domain:') && (x.slice(7).endsWith('.' + y.slice(7)) || y.slice(7).endsWith('.' + x.slice(7)))))); }
const digits = (s: string) => s.replace(/\D/g, '');
const phoneKey = (s: string) => { const d = digits(s); return d.length === 11 && d.startsWith('1') ? d.slice(1) : d; };
export function researchReserveRecordBlockers(p: ResearchReserveRecord, checkedOn: string, now = new Date()): string[] {
  const reasons: string[] = [], facts = [p.emailEvidence, p.phone, p.localEvidence, p.sponsorship];
  const checked = Date.parse(checkedOn + 'T00:00:00Z');
  const fresh = (d: number) => Number.isFinite(d) && d <= now.getTime() && now.getTime() - d <= 30 * 86400_000;
  if (!fresh(checked) || facts.some(f => !fresh(Date.parse(f.observedOn + 'T00:00:00Z')) || f.observedOn > checkedOn) || (typeof p.sponsorship.year === 'number' && p.sponsorship.year > now.getUTCFullYear())) reasons.push('stale_or_future_source');
  const emailText = p.emailEvidence.quote.replace(/%20/gi, ' ').replace(/(?:^|[\s>:(])['"](?=[a-z0-9.!#$%&*+/=?^_`{|}~-]+@)/gi, m => m.slice(0, -1));
  const emails: string[] = emailText.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  if (!emails.some(v => v.toLowerCase() === p.email)) reasons.push('email_not_exact_published_token');
  if (!/^\d{10,15}$/.test(digits(p.phone.number)) || !(p.phone.quote.match(/\+?\d[\d().\s-]{5,}\d/g) || []).some(v => phoneKey(v) === phoneKey(p.phone.number))) reasons.push('phone_not_exact_published_token');
  if (p.phone.kind === 'work_direct' && (!p.contactName || !/\bdirect\b/i.test(p.phone.quote) || !p.phone.quote.includes(p.contactName))) reasons.push('work_direct_identity_unproven');
  const restricted = /(?:^|[._-])(?:privacy|press|media|mediarelations|emergency|gift[._-]?shop|warranty|donations?)(?:only)?(?:$|[._-])/i;
  // Limitations also retain unselected press inboxes and emergency PHONE routes.
  // Only affirmative descriptions of this selected email route may restrict it.
  const selectedRouteNotes = p.limitations.flatMap(v => v.split(/(?<=[.!?])\s+|\n/)).filter(v => /^(?:this|the|selected|current|published)\s+(?:(?:published|selected|current)\s+)?(?:email|inbox|mailbox|route|contact)\b/i.test(v));
  const routingEvidence = p.emailEvidence.quote + '\n' + selectedRouteNotes.join('\n');
  if (restricted.test(p.email.split('@')[0]!) || /\b(?:privacy|emergency|warranty|gift\s*shop)\b|(?:press|media)[ -]only|(?:press|media)\s+(?:inquiries|relations)|donation[ -]only|only.{0,30}donations?/i.test(routingEvidence)) reasons.push('restricted_email_route');
  const names = [p.name, ...p.knownAliases.filter(v => !/[:@.]/.test(v))];
  const fullTextKey = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(?:llc|inc|incorporated|corp|corporation|ltd|limited|company|co)\b/g, '').replace(/\s+/g, ' ').trim();
  const namesIn = (quote: string) => names.some(n => fullTextKey(quote).includes(fullTextKey(n)));
  const companySource = (f: {url: string; quote: string}) => overlap(identityAliases(undefined, p.website), identityAliases(undefined, f.url)) || namesIn(f.quote);
  if (!companySource(p.emailEvidence) || !companySource(p.phone)) reasons.push('public_company_contact_attribution_missing');
  if (!/coastal bend|corpus christi|port aransas|rockport|aransas pass|ingleside|portland|robstown|kingsville|nueces|san patricio/i.test(p.localEvidence.quote)) reasons.push('local_operating_evidence_missing');
  if (!/\bsponsor(?:ed|s|ship)?\b/i.test(p.sponsorship.quote) || !namesIn(p.sponsorship.quote) || /\b(?:not|no|never|potential|prospective|unconfirmed)\s+(?:a\s+)?sponsor/i.test(p.sponsorship.quote)) reasons.push('documented_sponsorship_missing');
  if (p.contactName ? p.greeting !== p.contactName || !p.emailEvidence.quote.includes(p.contactName) : p.greeting !== `${p.name} team`) reasons.push('honest_greeting_required');
  if (sponsoredProtectedIdentity({ organization: [p.name, ...p.knownAliases].join(' '), website: p.website, email: p.email }) || /raps\s*(?:and|&)\s*apps|the\s*exchange|coast\s*life|frost|bank(?:ing)?|credit\s*union/i.test(recordAliases(p).join(' '))) reasons.push('protected_banking_or_relationship_identity');
  return Array.from(new Set(reasons));
}
async function database() { const db = await getDb(); if (!db) throw new Error('Research database unavailable'); return db; }
function assertCampaign(c: Row | undefined): asserts c is Row {
  if (!c || c.id !== 1 || c.slug !== HUSTLE_SLUG || c.status !== 'active' || !c.launchApprovedAt || c.configVersion !== HUSTLE_SPONSORED_CONFIG_VERSION) throw new Error('Existing active approved current fixed campaign required');
}
async function campaignAndEvents(tx: any, lock = true) {
  let q = tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id, 1)); if (lock) q = q.for('update');
  const [campaign] = await q; assertCampaign(campaign);
  const events: Row[] = await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId, 1));
  return { campaign, events };
}
function detail(e: Row): Row { try { return JSON.parse(e.detailJson); } catch { throw new Error('Unresolved malformed research history'); } }
function finishMatches(events: Row[], request: Row, claim?: Row) {
  return events.some(e => { if (e.eventType !== 'research_completed' || e.eventKey !== request.incident + ':finish') return false; const f = detail(e); return f.incident === request.incident && f.requestToken === request.requestToken && f.requestedAt === request.requestedAt && (!claim || f.ownerToken === claim.ownerToken); });
}
function assertNoUnresolvedLease(c: Row, events: Row[], now: Date) {
  if (c.researchLeaseUntil && new Date(c.researchLeaseUntil).getTime() > now.getTime()) throw new Error('Active research lease must not be replaced');
  const requests = events.filter(e => e.eventType === 'research_requested'), claims = events.filter(e => e.eventType === 'research_lease');
  for (const e of requests) {
    const r = detail(e), ce = claims.find(x => x.eventKey === r.incident + ':claim'), claim = ce && detail(ce);
    if (!r.incident || e.eventKey !== r.incident || !r.requestToken || !r.requestedAt || !claim || claim.requestToken !== r.requestToken || claim.requestedAt !== r.requestedAt || !claim.ownerToken || !finishMatches(events, r, claim)) throw new Error('Unresolved old research request or lease; never adopt it');
  }
  if (claims.some(e => !requests.some(r => r.eventKey + ':claim' === e.eventKey))) throw new Error('Unresolved orphan research lease');
  if (c.researchLeaseUntil && !claims.some(e => { const l = detail(e); return c.researchRequestedAt?.toISOString() === l.requestedAt && new Date(c.researchLeaseUntil).getTime() === l.expiresAt && finishMatches(events, l, l); })) throw new Error('Unresolved campaign research lease');
}
function owned(c: Row, events: Row[], owner: Owner, now: Date, allowInactive = false) {
  const re = events.find(e => e.eventKey === owner.incident && e.eventType === 'research_requested'), ce = events.find(e => e.eventKey === owner.incident + ':claim' && e.eventType === 'research_lease');
  const standing = owner.provenanceId === STANDING_RESEARCH_DIRECT_RECORD.id;
  if (!re || !ce || (!standing && (owner.incident !== incident || owner.maintenance)) || (standing && (!owner.maintenance || owner.maintenance.deficit !== 30 - owner.maintenance.initialEligible || !new RegExp(`^hustle-source-maintenance:${STANDING_RESEARCH_DIRECT_RECORD.id}:\\d{4}-\\d{2}-\\d{2}:[123]$`).test(owner.incident)))) throw new Error('Original source research request and claim required');
  const r = detail(re), l = detail(ce);
  for (const k of ['version', 'kind', 'executionTaskId', 'ownerFile', 'incident', 'requestToken', 'requestedAt', 'expiresAt', 'provenanceId', 'provenanceHash'] as const) if (r[k] !== owner[k] || l[k] !== owner[k]) throw new Error('Original research ownership mismatch');
  if (standing) {
    if (canonical(r.maintenance) !== canonical(owner.maintenance) || canonical(l.maintenance) !== canonical(owner.maintenance) || researchReserveHash(r.provenance) !== owner.provenanceHash) throw new Error('Standing research authority or deficit mismatch');
    const verifiedAt = Date.parse(r.provenance?.verifiedAt);
    if (verifiedAt > Date.parse(owner.requestedAt) + 999) throw new Error('Standing proof postdates the real request');
    verifyStandingResearchReserveProvenance(r.provenance, new Date(Math.max(Date.parse(owner.requestedAt), verifiedAt)));
  }
  if (l.ownerToken !== owner.ownerToken || l.target !== 30 || r.target !== 30) throw new Error('Original research ownership mismatch');
  const finished = events.find(e => e.eventKey === owner.incident + ':finish');
  if (finished && !finishMatches([finished], owner, owner)) throw new Error('Original research finish ownership mismatch');
  const matchingLease = c.researchRequestedAt?.toISOString() === owner.requestedAt && c.researchLeaseUntil?.getTime() === owner.expiresAt;
  if (!allowInactive && (finished || !matchingLease || owner.expiresAt <= now.getTime())) throw new Error('Research lease finished, expired or superseded');
  return { matchingLease, finished };
}
export async function claimResearchReserve(provenance: unknown, ownerFile: string, now = new Date()) {
  const verified = verifyResearchReserveProvenance(provenance, now), db = await database();
  if (Buffer.byteLength(JSON.stringify(verified.proof)) > 50_000) throw new Error('Bounded direct-record provenance required');
  return db.transaction(async tx => {
    const { campaign, events } = await campaignAndEvents(tx);
    if (events.some(e => e.eventKey === incident || (e.eventType === 'research_requested' && detail(e).provenanceId === RESEARCH_DIRECT_RECORD.id))) throw new Error('Direct authorization already claimed; no new owner token');
    assertNoUnresolvedLease(campaign, events, now);
    const requestedAt = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString();
    const owner: Owner = { version: RESEARCH_RESERVE_VERSION, kind: 'managed_task_operator', executionTaskId: RESEARCH_TASK_ID, ownerFile: resolve(ownerFile), incident, requestToken: randomBytes(24).toString('hex'), ownerToken: randomBytes(24).toString('hex'), requestedAt, expiresAt: Date.parse(requestedAt) + 6 * 3600_000, provenanceId: verified.provenanceId, provenanceHash: verified.provenanceHash };
    writeResearchReservePrivateFile(ownerFile, owner); // Before DB mutations/commit; uncertainty retains the exclusive original.
    const { ownerToken: _secret, ...request } = owner;
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: incident, eventType: 'research_requested', detailJson: JSON.stringify({ ...request, target: 30, provenance: verified.proof, ...safety }) });
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: incident + ':claim', eventType: 'research_lease', detailJson: JSON.stringify({ ...owner, target: 30, claimedAt: requestedAt, ...safety }) });
    await tx.update(hustleCampaigns).set({ researchRequestedAt: new Date(requestedAt), researchLeaseUntil: new Date(owner.expiresAt) }).where(eq(hustleCampaigns.id, 1));
    return { claimed: true, incident, provenanceHash: owner.provenanceHash, target: 30, ...safety };
  });
}
function centralDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Existing 9AM task only. No timer, provider, prospect research or message work is started here. */
export async function claimStandingResearchReserve(provenance: unknown, ownerFile: string, now = new Date()) {
  const verified = verifyStandingResearchReserveProvenance(provenance, now);
  if (Buffer.byteLength(JSON.stringify(verified.proof)) > 50_000) throw new Error('Bounded direct-record provenance required');
  const db = await database();
  return db.transaction(async tx => {
    const state = await knownState(tx, true), existingEligible = state.prospects.filter(p => p.campaignId === 1 && validMarker(p, state, now)).length;
    if (existingEligible >= 30) return { claimed: false, reason: 'at-target', existingEligible, target: 30, shortfall: 0, noWrites: true, noResearchStarted: true, ...safety };
    assertNoUnresolvedLease(state.campaign, state.events, now);
    const previous = state.events.filter(e => e.eventType === 'research_requested').map(detail).filter(r => r.provenanceId === STANDING_RESEARCH_DIRECT_RECORD.id);
    if (previous.some(r => !Number.isFinite(Date.parse(r.requestedAt)) || Date.parse(r.requestedAt) > now.getTime())) throw new Error('Unresolved standing request time');
    const day = centralDate(now), ordinal = previous.filter(r => centralDate(new Date(r.requestedAt)) === day).length + 1;
    if (ordinal > 3) return { claimed: false, reason: 'daily-request-limit', existingEligible, target: 30, shortfall: 30 - existingEligible, noWrites: true, ...safety };
    if (previous.some(r => now.getTime() - Date.parse(r.requestedAt) < 90 * 60_000)) return { claimed: false, reason: 'request-cooldown', existingEligible, target: 30, shortfall: 30 - existingEligible, noWrites: true, ...safety };
    const requestedAt = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString(), requestIncident = `hustle-source-maintenance:${STANDING_RESEARCH_DIRECT_RECORD.id}:${day}:${ordinal}`;
    if (state.events.some(e => e.eventKey === requestIncident)) throw new Error('Standing request already recorded; inspect original ownership');
    const owner: Owner = { version: RESEARCH_RESERVE_VERSION, kind: 'managed_task_operator', executionTaskId: RESEARCH_TASK_ID, ownerFile: resolve(ownerFile), incident: requestIncident, requestToken: randomBytes(24).toString('hex'), ownerToken: randomBytes(24).toString('hex'), requestedAt, expiresAt: Date.parse(requestedAt) + 6 * 3600_000, provenanceId: STANDING_RESEARCH_DIRECT_RECORD.id, provenanceHash: verified.provenanceHash, maintenance: { authorityId: STANDING_RESEARCH_DIRECT_RECORD.id, initialEligible: existingEligible, deficit: 30 - existingEligible } };
    writeResearchReservePrivateFile(ownerFile, owner);
    const { ownerToken: _secret, ...request } = owner;
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: requestIncident, eventType: 'research_requested', detailJson: JSON.stringify({ ...request, target: 30, provenance: verified.proof, ...safety }) });
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: requestIncident + ':claim', eventType: 'research_lease', detailJson: JSON.stringify({ ...owner, target: 30, claimedAt: now.toISOString(), ...safety }) });
    await tx.update(hustleCampaigns).set({ researchRequestedAt: new Date(requestedAt), researchLeaseUntil: new Date(owner.expiresAt) }).where(eq(hustleCampaigns.id, 1));
    return { claimed: true, incident: requestIncident, requestedAt, existingEligible, target: 30, shortfall: 30 - existingEligible, maxNewContacts: owner.maintenance!.deficit, provenanceHash: owner.provenanceHash, ...safety };
  });
}
async function knownState(tx: any, lock: boolean) {
  const base = await campaignAndEvents(tx, lock);
  const read = async (table: any): Promise<Row[]> => { const q = tx.select().from(table); return lock ? q.for('update') : q; };
  const prospects = await read(hustleProspects), messages = await read(hustleMessages), allEvents = await read(hustleEvents);
  const sources: Row[] = [];
  for (const table of [chamberOutreachProspects, creditUnionProspects, brandVideoProspects, trainingOutreachProspects, sectorOutreachProspects, chamberProspects]) sources.push(...await read(table));
  const currentSuppressions = await read(chamberOutreachSuppressions);
  const exclusions = await getSectorExclusions(tx), reserved = await getSectorReservedRows(tx);
  if (!Array.isArray(exclusions.records) || !Array.isArray(exclusions.suppressions) || !Array.isArray(reserved)) throw new Error('Complete fresh exclusions required');
  // Omit only helper's own sponsors SOURCE, not matching names in other campaigns.
  sources.push(...exclusions.records.filter(r => r.origin !== 'sponsors'), ...reserved);
  if (prospects.length + messages.length + allEvents.length + sources.length > 100_000) throw new Error('Complete research history exceeds safe bound');
  return { ...base, prospects, messages, allEvents, sources, suppressions: [...currentSuppressions, ...exclusions.suppressions] };
}
type State = Awaited<ReturnType<typeof knownState>>;
const automaticHolds = new Set([RESEARCH_RESERVE_HOLD, 'Current unrestricted marketing email, role or local evidence is incomplete, stale or future-dated.', 'Qualification verified under the November 15 policy. Exact recipient, message, footer and campaign approval remain required; no automatic preparation or sending.']);
const benignEvents = new Set(['research_import', 'research_verified', 'research_review', 'research_reserve_record']);
function existingBlock(p: Row, state: State) {
  if (p.campaignId !== 1 || p.stage !== 'identified' || !['review', 'verification_needed'].includes(p.qualification) || p.firstSentAt || p.lastSentAt || p.stoppedAt || p.manualNotes || ['bank', 'credit_union', 'business_lender'].includes(p.category)) return 'existing_manual_terminal_qualified_or_contacted';
  if (p.holdReason && !automaticHolds.has(p.holdReason)) return 'existing_coordination_or_unknown_hold';
  // Even pristine old drafts are retained untouched, never silently paired with new research.
  if (state.messages.some(m => m.prospectId === p.id) || state.allEvents.some(e => e.prospectId === p.id && !benignEvents.has(e.eventType))) return 'existing_message_or_protected_history';
  return null;
}
function checks(p: ResearchReserveRecord, checkedOn: string, state: State, now: Date) {
  const reasons = researchReserveRecordBlockers(p, checkedOn, now), aliases = recordAliases(p);
  const old = p.existingId === null ? undefined : state.prospects.find(row => row.id === p.existingId);
  if (old) aliases.push(...rowAliases(old));
  const matches = state.prospects.filter(row => overlap(aliases, rowAliases(row)));
  if (p.existingId !== null && (!old || old.campaignId !== 1 || normalizeTrainingDomain(old.website) !== normalizeTrainingDomain(p.website) || !matches.some(row => row.id === old.id))) reasons.push('existing_id_canonical_identity_mismatch');
  if (p.existingId === null && matches.length) reasons.push('existing_identity_requires_stable_id');
  if (matches.some(row => row.id !== old?.id)) reasons.push('unresolved_own_family_or_other_campaign_conflict');
  if (old) { const blocked = existingBlock(old, state); if (blocked) reasons.push(blocked); }
  if (state.sources.some(row => overlap(aliases, rowAliases(row)))) reasons.push('cross_campaign_or_relationship_identity');
  if (state.suppressions.some(row => overlap(aliases, identityAliases(undefined, undefined, row.email)))) reasons.push('shared_suppression');
  return { old, reasons: Array.from(new Set(reasons)) };
}
function columns(record: ResearchReserveRecord) {
  return { organizationKey: normalizeTrainingDomain(record.website)!, name: record.name, website: record.website, category: 'general_sponsor', localEvidence: record.localEvidence.quote, localSourceUrl: record.localEvidence.url,
    contactName: record.contactName, contactTitle: null, recipientType: record.contactName ? 'named_contact' : 'company_team', email: record.email, emailSourceUrl: record.emailEvidence.url, emailSourceQuote: record.emailEvidence.quote,
    roleSourceUrl: null, phone: record.phone.number, phoneSourceUrl: record.phone.url, stage: 'identified', qualification: 'review', holdReason: RESEARCH_RESERVE_HOLD };
}
function validMarker(row: Row, state: State, now: Date) {
  try {
    const marker = markerSchema.parse(JSON.parse(row.evidenceJson).researchReserve), record = { ...marker.record, existingId: row.id };
    if (Object.entries(columns(record)).some(([k, v]) => row[k] !== v) || checks(record, marker.checkedOn, state, now).reasons.length) return null;
    return marker;
  } catch { return null; }
}
function plan(packet: ResearchReservePacket, state: State, now: Date, maxNew = 30) {
  const valid = state.prospects.filter(p => p.campaignId === 1 && validMarker(p, state, now));
  const actions: Array<{ index: number; record: ResearchReserveRecord; old?: Row; reused: boolean }> = [], skipped: Array<{ index: number; id: number | null; reasons: string[] }> = [];
  let count = valid.length;
  packet.records.forEach((record, index) => {
    const { old, reasons } = checks(record, packet.checkedOn, state, now);
    if (reasons.length) { skipped.push({ index, id: record.existingId, reasons }); return; }
    const reused = Boolean(old && valid.some(row => row.id === old.id));
    if (!reused && (count >= 30 || count - valid.length >= maxNew)) { skipped.push({ index, id: record.existingId, reasons: ['target_already_covered_no_padding'] }); return; }
    actions.push({ index, record, old, reused }); if (!reused) count++;
  });
  return { actions, preview: { packetHash: researchReserveHash(packet), target: 30, existingEligible: valid.length, eligibleAfter: count, shortfall: Math.max(0, 30 - count), added: actions.filter(a => !a.old).length, updated: actions.filter(a => a.old && !a.reused).length, reused: actions.filter(a => a.reused).length, skipped, ...safety } };
}
export async function readResearchReserveStatus(now = new Date()) {
  const db = await database();
  return db.transaction(async tx => {
    const state = await knownState(tx, false), existingEligible = state.prospects.filter(p => p.campaignId === 1 && validMarker(p, state, now)).length;
    const storedApprovedUnattemptedInitialRows = state.messages.filter(m => m.campaignId === 1 && m.sequenceStep === 0 && m.status === 'approved' && !m.claimToken && !m.attemptedAt && !m.smtpAcceptedAt && !m.providerMessageId && !m.error).length;
    // This source-only helper is not the signed sender's live approval/stop validator.
    const exactApprovedInitialStock = storedApprovedUnattemptedInitialRows === 0 ? 0 : null;
    return { capturedAt: now.toISOString(), campaignId: 1, configVersion: state.campaign.configVersion, existingEligible, target: 30, shortfall: Math.max(0, 30 - existingEligible), atTarget: existingEligible >= 30, exactApprovedInitialStock, storedApprovedUnattemptedInitialRows, noWrites: true, ...safety };
  });
}
export async function previewResearchReserve(value: unknown, now = new Date()) {
  const packet = researchReservePacketSchema.parse(value), db = await database();
  return db.transaction(async tx => plan(packet, await knownState(tx, false), now).preview);
}
const intentSchema = z.object({ version: z.literal(RESEARCH_RESERVE_VERSION), operation: z.literal('source_research_import'), incident: text(200), ownerHash: z.string().regex(/^[a-f0-9]{64}$/), packetHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(), noAutomaticRetry: z.literal(true) }).strict();
export async function importResearchReserve(value: unknown, ownerFile: string, now = new Date()) {
  const packet = researchReservePacketSchema.parse(value), owner = ownerSchema.parse(readResearchReservePrivateFile(ownerFile));
  if (owner.ownerFile !== resolve(ownerFile)) throw new Error('Original owner file required; copied files cannot create a new import intent');
  const packetHash = researchReserveHash(packet), ownerHash = researchReserveHash(owner), intentFile = resolve(ownerFile) + '.import-intent.json';
  let priorIntent = false;
  try {
    writeResearchReservePrivateFile(intentFile, { version: RESEARCH_RESERVE_VERSION, operation: 'source_research_import', incident: owner.incident, ownerHash, packetHash, createdAt: now.toISOString(), noAutomaticRetry: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const intent = intentSchema.parse(readResearchReservePrivateFile(intentFile));
    if (intent.incident !== owner.incident || intent.ownerHash !== ownerHash || intent.packetHash !== packetHash) throw new Error('Existing owned import intent differs; no retry or replacement');
    priorIntent = true;
  }
  const db = await database();
  return db.transaction(async tx => {
    const { campaign, events } = await campaignAndEvents(tx);
    owned(campaign, events, owner, now, true);
    if (events.some(e => e.eventType === 'research_reserve_import_finished' && detail(e).incident === owner.incident && detail(e).packetHash !== packetHash)) throw new Error('Original owner already consumed by another packet; no reimport');
    const receiptKey = 'research-reserve-import:' + packetHash, receipt = events.find(e => e.eventKey === receiptKey);
    if (receipt) {
      const r = detail(receipt);
      if (receipt.eventType !== 'research_reserve_import_finished' || r.ownerHash !== ownerHash || r.incident !== owner.incident || r.packetHash !== packetHash) throw new Error('Packet receipt is not owned by original claimant');
      return { ...r.result, alreadyRecorded: true };
    }
    if (priorIntent) throw new Error('Unresolved durable import intent; inspect persisted outcome, never retry');
    owned(campaign, events, owner, now);
    const state = await knownState(tx, true), staged = plan(packet, state, now, owner.maintenance?.deficit ?? 30), ids: number[] = [];
    for (const action of staged.actions) {
      if (action.reused) { ids.push(action.old!.id); continue; }
      const { record, old } = action;
      const retainedAliases = Array.from(new Set([...recordAliases(record), ...(old ? rowAliases(old) : [])]));
      if (retainedAliases.length > 500) throw new Error('Complete identity aliases exceed safe bound');
      const evidenceJson = JSON.stringify({ researchReserve: { version: RESEARCH_RESERVE_VERSION, packetHash, checkedOn: packet.checkedOn, record, retainedAliases, exactMessageReviewRequired: true, sendApproved: false } });
      if (Buffer.byteLength(evidenceJson) > 60_000 || (old && Buffer.byteLength(JSON.stringify(old)) > 50_000)) throw new Error('Complete source evidence exceeds event storage bound');
      const values = { ...columns(record), evidenceJson };
      const previous = old ? structuredClone(old) : null;
      if (old) await tx.update(hustleProspects).set(values).where(eq(hustleProspects.id, old.id));
      else await tx.insert(hustleProspects).values({ ...values, campaignId: 1, unsubscribeToken: randomBytes(24).toString('hex') });
      const [saved] = await tx.select().from(hustleProspects).where(eq(hustleProspects.organizationKey, values.organizationKey)).for('update');
      if (!saved || saved.campaignId !== 1 || (old && saved.id !== old.id)) throw new Error('Canonical saved research identity mismatch');
      ids.push(saved.id);
      const detailJson = JSON.stringify({ packetHash, ownerHash, previous, record, historicalSponsorshipIsNotInterestOrBudget: true, ...safety });
      if (Buffer.byteLength(detailJson) > 60_000) throw new Error('Complete append-only research history exceeds event storage bound');
      await tx.insert(hustleEvents).values({ campaignId: 1, prospectId: saved.id, eventKey: `${owner.incident}:record:${saved.id}`, eventType: 'research_reserve_record', detailJson });
    }
    const result = { ...staged.preview, ids, alreadyRecorded: false };
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: receiptKey, eventType: 'research_reserve_import_finished', detailJson: JSON.stringify({ incident: owner.incident, ownerHash, packetHash, result, finishedAt: now.toISOString(), ...safety }) });
    return result;
  });
}
export async function finishResearchReserve(ownerFile: string, now = new Date()) {
  const owner = ownerSchema.parse(readResearchReservePrivateFile(ownerFile)), db = await database();
  if (owner.ownerFile !== resolve(ownerFile)) throw new Error('Original owner file required');
  return db.transaction(async tx => {
    const { campaign, events } = await campaignAndEvents(tx), lease = owned(campaign, events, owner, now, true);
    if (lease.finished) return { finished: true, alreadyRecorded: true, ...safety };
    if (owner.maintenance) {
      let intent: z.infer<typeof intentSchema> | undefined;
      try { intent = intentSchema.parse(readResearchReservePrivateFile(resolve(ownerFile) + '.import-intent.json')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (intent) {
        const receipt = events.find(e => e.eventKey === 'research-reserve-import:' + intent!.packetHash && e.eventType === 'research_reserve_import_finished'), r = receipt && detail(receipt);
        if (intent.incident !== owner.incident || intent.ownerHash !== researchReserveHash(owner) || !r || r.ownerHash !== intent.ownerHash || r.incident !== owner.incident || r.packetHash !== intent.packetHash) throw new Error('Unresolved owned import intent prevents lease release; inspect without retry');
      }
    }
    const state = await knownState(tx, true), eligible = state.prospects.filter(p => p.campaignId === 1 && validMarker(p, state, now)).length;
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: owner.incident + ':finish', eventType: 'research_completed', detailJson: JSON.stringify({ ...owner, target: 30, eligible, outcome: eligible >= 30 ? 'complete' : 'partial', finishedAt: now.toISOString(), leaseStillOwned: lease.matchingLease, ...safety }) });
    if (lease.matchingLease) await tx.update(hustleCampaigns).set({ researchLeaseUntil: null }).where(eq(hustleCampaigns.id, 1));
    return { finished: true, alreadyRecorded: false, eligible, target: 30, shortfall: Math.max(0, 30 - eligible), leaseCleared: lease.matchingLease, ...safety };
  });
}
