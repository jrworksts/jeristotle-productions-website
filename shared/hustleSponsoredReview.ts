import { z } from 'zod';
import { JERISTOTLE_EMAIL } from './const';
import { isPublicTrainingHttpUrl, normalizeTrainingBusiness, normalizeTrainingDomain, normalizeTrainingEmail } from './trainingOutreach';
import { getOutreachLocalMoment } from './outreachSchedule';

/** Additive route only. Neither this schema nor a research marker grants send authority. */
export const HUSTLE_SPONSORED_CONFIG_VERSION = 'hustle-sponsor-general-12-5-30-2026-11-17-v1' as const;
export const HUSTLE_SPONSORED_SOURCE_VERSION = 'hustle-sponsored-review-source-2026-11-19-before-claim-recovery-v4' as const;
export const HUSTLE_SPONSORED_SCHEMA_VERSION = 'hustle-sponsored-review-schema-v1' as const;
export const HUSTLE_SPONSORED_MARKER = 'hustle-sponsored-general-exact-review-v1' as const;
export const HUSTLE_SPONSORED_SLUG = 'corpus-christi-hustle-sponsors-2027' as const;
export const HUSTLE_SPONSORED_MAX_AGE_MS = 30 * 86_400_000;
export const HUSTLE_SPONSORED_POLICY = Object.freeze({
  configVersion: HUSTLE_SPONSORED_CONFIG_VERSION,
  episodeGoal: 12, dailyNewLimit: 5, reserveTarget: 30,
  reserveTargetIsNotDispatchPrerequisite: true,
  timeZone: 'America/Chicago', followupCalendarDays: [2, 3] as readonly [2, 3],
  followupBasis: 'previous_actual_smtp_acceptance', followupLocalHour: 9,
  includeWeekends: true, followupsAdditional: true,
  applyProspectivelyPreserveHistoricalThreads: true,
});
export const HUSTLE_SPONSORED_FOOTER = 'Partnership solicitation from Jeristotle Productions.\n319 N Mesquite St, Corpus Christi, TX 78401\nTo stop outreach from us, reply "no thanks."' as const;
export const HUSTLE_SPONSORED_HOMEPAGE = 'https://jeristotleproductions.com' as const;
export const HUSTLE_SPONSORED_HEADERS = Object.freeze({ 'List-Unsubscribe': '<mailto:jeremy@jeristotleproductions.com?subject=unsubscribe>' });
export const HUSTLE_SPONSORED_FROM_DISPLAY = 'Jeristotle Productions' as const;

const exactText = (max: number) => z.string().min(1).max(max).refine(v => v === v.trim(), 'Retain exact unpadded text');
const publicUrl = exactText(500).refine(isPublicTrainingHttpUrl, 'Public HTTP evidence URL required');
const email = exactText(320).refine(v => normalizeTrainingEmail(v) === v, 'Normalized exact email required');
const date = z.string().date();
const fact = z.object({ url: publicUrl, quote: exactText(4000), observedOn: date }).strict();

/** recognitionEvidence is a retained observation, NOT necessarily a verbatim quotation.
 * For a visual logo do not invent a composite quote or silently expand its entity name. */
export const sponsoredRecognitionSchema = z.object({
  program: exactText(500), year: z.union([z.number().int().min(1900).max(2200), exactText(20)]).nullable(),
  url: publicUrl, observedOn: date, kind: z.literal('sponsor'),
  evidenceType: z.enum(['published_text', 'visual_logo']),
  recognitionEvidence: exactText(4000), quote: exactText(4000).optional(),
  publishedLabel: exactText(500).optional(), namesAsPublished: z.array(exactText(220)).min(1).max(10),
}).strict();

/** A directly observed official link and separate entity attribution, not a hostname guess.
 * Either official -> alternate or alternate -> official is accepted when the same page
 * names this company and the anchor/quoted URL is retained exactly. */
const companyLink = z.object({
  url: publicUrl, targetUrl: publicUrl, quote: exactText(4000), observedOn: date,
  kind: z.enum(['alternate_company_domain', 'observed_company_redirect']), publishedName: exactText(220), identityQuote: exactText(4000),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
  anchor: z.object({ label: exactText(500), href: publicUrl }).strict().optional(),
}).strict();
const messageShape = {
  from: z.literal(JERISTOTLE_EMAIL), replyTo: z.literal(JERISTOTLE_EMAIL), to: email,
  subject: exactText(240).refine(v => !/[\r\n\u2014]/.test(v)),
  textBody: z.string().min(1).max(12000), htmlBody: z.string().min(1).max(16000),
  footer: z.literal(HUSTLE_SPONSORED_FOOTER),
};
export const sponsoredReviewRecordSchema = z.object({
  existingProspectId: z.number().int().positive().safe().nullable(),
  organization: exactText(220), website: publicUrl, email,
  phone: exactText(100).nullable(), sponsorRecognition: sponsoredRecognitionSchema,
  emailEvidence: fact, phoneEvidence: fact.extend({ kind: z.enum(['company', 'work_direct']) }).strict().nullable(),
  sourceLinks: z.array(companyLink).max(4).optional(),
  pageContexts: z.array(z.object({ url: publicUrl, publishedName: exactText(220), identityQuote: exactText(4000), observedOn: date }).strict()).max(8).optional(),
  routingLabel: exactText(2000),
  messages: z.tuple([
    z.object({ ...messageShape, sequenceStep: z.literal(0) }).strict(),
    z.object({ ...messageShape, sequenceStep: z.literal(1) }).strict(),
    z.object({ ...messageShape, sequenceStep: z.literal(2) }).strict(),
  ]),
}).strict();
export type SponsoredReviewRecord = z.infer<typeof sponsoredReviewRecordSchema>;
export const sponsoredReviewBatchSchema = z.object({
  campaignId: z.literal(1), campaignSlug: z.literal(HUSTLE_SPONSORED_SLUG),
  initialSendWindow: z.object({ notBefore: z.string().datetime({offset:true}), expiresAt: z.string().datetime({offset:true}) }).strict().optional(),
  records: z.array(sponsoredReviewRecordSchema).min(1).max(30),
}).strict().superRefine((batch, ctx) => {
  if (batch.initialSendWindow && Date.parse(batch.initialSendWindow.expiresAt) <= Date.parse(batch.initialSendWindow.notBefore))
    ctx.addIssue({code:'custom',path:['initialSendWindow'],message:'Initial-send window must end after its not-before boundary'});
  const aliases = new Set<string>();
  batch.records.forEach((record, index) => {
    for (const alias of sponsoredIdentityAliases(record)) {
      if (aliases.has(alias)) ctx.addIssue({ code: 'custom', path: ['records', index], message: 'Duplicate organization/contact alias: ' + alias });
      aliases.add(alias);
    }
    for (const reason of sponsoredRecordBlockers(record, undefined, false))
      ctx.addIssue({ code: 'custom', path: ['records', index], message: reason });
  });
});
export type SponsoredReviewBatch = z.infer<typeof sponsoredReviewBatchSchema>;
export const sponsoredReviewApprovalSchema = z.object({
  reviewId: z.string().regex(/^[a-f0-9]{48}$/), reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmExactRecipientsMessagesFooterAndPolicy: z.literal(true),
}).strict();
export type SponsoredReviewApproval = z.infer<typeof sponsoredReviewApprovalSchema>;

const publicMail = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
const thirdPartyHost = /(?:^|\.)(?:apollo\.io|zoominfo\.com|rocketreach\.co|linkedin\.com|facebook\.com|google\.com|gmail\.com|yelp\.com|crunchbase\.com)$/i;
const host = (value: string) => normalizeTrainingDomain(value) || '';
const sameHost = (a: string, b: string) => a === b || a.endsWith('.' + b);
const identity = (v: string) => normalizeTrainingBusiness(v).replace(/(?: (?:inc|incorporated|llc|ltd|corp|corporation))+$/, '').replace(/\bof\b/g, '').replace(/\s+/g, ' ').trim();
export function sponsoredIdentityAliases(input: { organization?: string; name?: string; businessName?: string; website?: string | null; email?: string | null; organizationKey?: string | null }): string[] {
  const aliases: string[] = [];
  const name = identity(input.organization || input.name || input.businessName || '');
  if (name) aliases.push('name:' + name);
  const domain = host(input.website || '');
  if (domain && !publicMail.has(domain)) aliases.push('domain:' + domain);
  if (input.organizationKey && !publicMail.has(input.organizationKey)) aliases.push('domain:' + input.organizationKey);
  const address = normalizeTrainingEmail(input.email);
  if (address) {
    aliases.push('email:' + address);
    const mailDomain = address.split('@')[1]!;
    if (!publicMail.has(mailDomain)) aliases.push('domain:' + mailDomain);
  }
  return Array.from(new Set(aliases));
}
export function sponsoredOrganizationKey(record: SponsoredReviewRecord) { return host(record.website); }
export function sponsoredSourceFacts(record: SponsoredReviewRecord) {
  return [record.sponsorRecognition, record.emailEvidence, ...(record.phoneEvidence ? [record.phoneEvidence] : []), ...(record.sourceLinks || []), ...(record.pageContexts || [])];
}
export function sponsoredSourceIsFresh(record: SponsoredReviewRecord, now: Date): boolean {
  return Number.isFinite(now.getTime()) && sponsoredSourceFacts(record).every(f => {
    const observed = Date.parse(f.observedOn + 'T00:00:00Z');
    return Number.isFinite(observed) && observed <= now.getTime() && now.getTime() - observed <= HUSTLE_SPONSORED_MAX_AGE_MS;
  });
}
function exactEmailToken(quote: string, address: string) {
  return (quote.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).some(v => v.toLowerCase() === address);
}
const digits = (v: string) => v.replace(/\D/g, '');
function exactPhoneToken(quote: string, number: string) {
  return (quote.match(/\+?\d[\d().\s-]{5,}\d/g) || []).some(v => digits(v) === digits(number));
}
const restrictedLocal = /(?:^|[._-])(?:emergency|security|privacy|accessibility|resume|resumes|careers?|jobs?|patient[s]?|donations?|press|mediarelations)(?:$|[._-])/i;
const restrictedContext = /\b(?:emergency|security|privacy|accessibility|resume[s]?|patient[s]?)\b|donation[- ]only|(?:press|media)[- ]only|(?:press|media)\s+(?:inquiries|enquiries|relations)|(?:only|exclusively).{0,40}(?:donation|press|resume|patient)/i;
export function sponsoredProtectedIdentity(record: Pick<SponsoredReviewRecord, 'organization' | 'website' | 'email'>): boolean {
  return /\b(?:bank|banking|credit union|business lender|frost|coast\s*life|raps(?: and apps)?|exchange)\b/i.test(record.organization) || /frostbank|coastlifecu|rapsandapps|exchangebank|(?:^|[.-])bank(?:[.-]|$)/i.test(host(record.website)) || record.email.endsWith('@jeristotleproductions.com');
}
function hasOfficialEmailEvidence(record: SponsoredReviewRecord) {
  const official = host(record.website), emailHost = host(record.emailEvidence.url);
  if (!official || thirdPartyHost.test(official) || publicMail.has(official)) return false;
  const trusted = new Set([official]);
  for (const link of record.sourceLinks || []) {
    const a = host(link.url), b = host(link.targetUrl);
    if (thirdPartyHost.test(a) || thirdPartyHost.test(b) || publicMail.has(a) || publicMail.has(b)) return false;
    if (!sameHost(a, official) && !sameHost(b, official)) return false;
    if (identity(link.publishedName) !== identity(record.organization) || !identity(link.identityQuote).includes(identity(link.publishedName))) return false;
    if (link.kind === 'observed_company_redirect') {
      if (!sameHost(a, official) || ![301, 302, 307, 308].includes(link.statusCode || 0) || !/redirect|\b30[1278]\b/i.test(link.quote)) return false;
    } else if (link.anchor) {
      if (link.anchor.href !== link.targetUrl || link.anchor.label !== link.quote) return false;
    } else if (!(link.quote.match(/https?:\/\/[^\s<>"']+/gi) || []).some(v => v.replace(/[),.;]+$/, '') === link.targetUrl)) return false;
    trusted.add(sameHost(a, official) ? b : a);
  }
  const trustedUrl = (url: string) => Array.from(trusted).some(h => sameHost(host(url), h));
  // A verified named company listing is public general-business evidence, not a
  // dedicated official-department route. Require attribution on that exact page,
  // a real company-domain email and no enrichment/social/masked inferred identity.
  const namedPublication = (url: string) => !thirdPartyHost.test(host(url)) && (record.pageContexts || []).some(context =>
    context.url === url && identity(context.publishedName) === identity(record.organization) && identity(context.identityQuote).includes(identity(context.publishedName)));
  const companyMail = Array.from(trusted).some(h => sameHost(record.email.split('@')[1]!, h));
  return (trustedUrl(record.emailEvidence.url) || (companyMail && namedPublication(record.emailEvidence.url))) &&
    (record.phoneEvidence === null || trustedUrl(record.phoneEvidence.url) || namedPublication(record.phoneEvidence.url)) &&
    (publicMail.has(record.email.split('@')[1]!) || Array.from(trusted).some(h => sameHost(record.email.split('@')[1]!, h))) && !thirdPartyHost.test(emailHost);
}
function decodeHtml(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([a-f0-9]+)|([a-z]+));/gi, (all, decimal, hex, named) => {
    if (decimal || hex) { const n = parseInt(decimal || hex, decimal ? 10 : 16); return n <= 0x10ffff ? String.fromCodePoint(n) : all; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[String(named).toLowerCase()] || all;
  });
}
const visibleNormalized = (value: string) => value.replace(/https:\/\/jeristotleproductions\.com\/?/g, 'jeristotleproductions.com').replace(/\s+/g, ' ').trim();
/** Validate but NEVER render/repair/normalize stored payload bytes. */
export function sponsoredMessageIsSafe(message: SponsoredReviewRecord['messages'][number]): boolean {
  try {
    if (/[\r\u2014]/.test(message.textBody) || /\u2014|&mdash;|&#(?:8212|x2014);/i.test(message.htmlBody)) return false;
    if (!message.textBody.endsWith('\n\n' + message.footer) || !message.textBody.includes('\n' + HUSTLE_SPONSORED_HOMEPAGE + '\n')) return false;
    const html = message.htmlBody;
    if (/<!--|<\s*(?:script|style|iframe|img|svg|object|embed|link|form|input|video|audio)\b|\bon[a-z]+\s*=|\b(?:src|srcset|background)\s*=|url\s*\(|expression\s*\(|display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![\d.])[^;]*;[^>]*>[^<\s\u00a0]/i.test(html)) return false;
    for (const tag of Array.from(html.matchAll(/<\/?\s*([a-z][a-z0-9]*)\b/gi))) if (!['html', 'head', 'meta', 'title', 'body', 'table', 'tr', 'td', 'p', 'a', 'br'].includes(tag[1]!.toLowerCase())) return false;
    const hrefs = Array.from(html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi), v => decodeHtml(v[2]!));
    if (hrefs.some(h => !['mailto:' + JERISTOTLE_EMAIL, HUSTLE_SPONSORED_HOMEPAGE, HUSTLE_SPONSORED_HOMEPAGE + '/'].includes(h))) return false;
    if ((html.match(/\bhref\s*=/gi) || []).length !== hrefs.length || !hrefs.includes(HUSTLE_SPONSORED_HOMEPAGE + '/')) return false;
    const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1];
    if (!body) return false;
    const visible = decodeHtml(body.replace(/<[^>]*>/g, ' '));
    return visibleNormalized(visible) === visibleNormalized(message.textBody);
  } catch { return false; }
}
export function sponsoredRecordBlockers(record: SponsoredReviewRecord, now = new Date(), checkFresh = true): string[] {
  const reasons: string[] = [];
  if (checkFresh && !sponsoredSourceIsFresh(record, now)) reasons.push('stale_or_future_source');
  if (!exactEmailToken(record.emailEvidence.quote, record.email)) reasons.push('email_not_exact_published_token');
  if (!hasOfficialEmailEvidence(record)) reasons.push('official_company_source_binding_missing');
  if (restrictedLocal.test(record.email.split('@')[0]!) || restrictedContext.test(record.emailEvidence.quote)) reasons.push('restricted_email_route');
  if (sponsoredProtectedIdentity(record)) reasons.push('protected_banking_or_relationship_identity');
  if ((record.phone === null) !== (record.phoneEvidence === null)) reasons.push('phone_source_binding_missing');
  if (record.phone && record.phoneEvidence && (!/^\d{10,15}$/.test(digits(record.phone)) || !exactPhoneToken(record.phoneEvidence.quote, record.phone))) reasons.push('phone_not_exact_published_token');
  if (record.phoneEvidence?.kind === 'work_direct' && !/\bdirect\b/i.test(record.phoneEvidence.quote)) reasons.push('direct_phone_scope_unproven');
  const recognition = record.sponsorRecognition;
  let recognitionContext = identity(recognition.recognitionEvidence + ' ' + (recognition.publishedLabel || ''));
  for (const publishedName of recognition.namesAsPublished) recognitionContext = recognitionContext.split(identity(publishedName)).join(' ');
  if (!/\bsponsor(?:ed|s|ship)?\b/i.test(recognitionContext) || /\b(?:not|no|never)\s+(?:(?:a|an|the|confirmed|verified)\s+)*sponsor\b|\b(?:possible|potential|prospective|unconfirmed|assumed|inferred)\s+(?:event\s+)?sponsor\b|partner only|participant only/i.test(recognitionContext)) reasons.push('sponsor_recognition_not_proven');
  if (!recognition.namesAsPublished.some(n => identity(n) === identity(record.organization))) reasons.push('sponsor_entity_binding_missing');
  if (!recognition.namesAsPublished.some(n => identity(recognition.recognitionEvidence).includes(identity(n)))) reasons.push('sponsor_observation_entity_missing');
  for (const message of record.messages) {
    if (message.to !== record.email) reasons.push('recipient_mapping_mismatch');
    if (!sponsoredMessageIsSafe(message)) reasons.push('unsafe_or_plain_html_footer_mismatch');
    if (!message.textBody.startsWith('Hello ' + record.organization + ' team,\n')) reasons.push('honest_company_team_greeting_required');
  }
  return Array.from(new Set(reasons));
}

/** Server provenance covers private evidence/HTML helpers as well as public validators.
 * This is a code fingerprint, never an owner approval or caller capability. */
export function sponsoredReviewValidationFingerprint(): string {
  return [identity, exactEmailToken, exactPhoneToken, hasOfficialEmailEvidence,
    decodeHtml, visibleNormalized, sponsoredIdentityAliases, sponsoredProtectedIdentity,
    sponsoredSourceFacts, sponsoredSourceIsFresh, sponsoredMessageIsSafe,
    sponsoredRecordBlockers, sponsoredAuthorizationMatches].map(f => f.toString()).join('\n');
}

/** Pure stable JSON for hashing by the server; no crypto/env or I/O in this module. */
export function sponsoredCanonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(sponsoredCanonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).filter(k => (value as any)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + sponsoredCanonicalJson((value as any)[k])).join(',') + '}';
  throw new Error('Finite canonical JSON required');
}
export function isHustleSponsoredProspect(prospect: { evidenceJson?: string | null; recipientType?: string }): boolean {
  // A damaged marker never falls through to the old canonical autoapproval route.
  if (prospect.recipientType === 'sponsored_general') return true;
  return typeof prospect.evidenceJson === 'string' && prospect.evidenceJson.includes(HUSTLE_SPONSORED_MARKER);
}
export type HustleSponsoredAuthorization = {
  verified: true; reviewId: string; reviewHash: string; prospectId: number; campaignId: 1;
  approvedAt: number; expiresAt: number; sourceVersion: typeof HUSTLE_SPONSORED_SOURCE_VERSION;
  sourceHash: string; policyHash: string; researchHash: string; prospectBindingHash: string;
  campaignBindingHash: string; record: SponsoredReviewRecord;
  headers: typeof HUSTLE_SPONSORED_HEADERS; fromDisplay: typeof HUSTLE_SPONSORED_FROM_DISPLAY;
  initialSendWindow?: {notBefore:string;expiresAt:string};
  uidValidity: Record<string, string>;
  messages: Array<SponsoredReviewRecord['messages'][number] & { messageId: number }>;
};
/** Must be supplied ONLY by the server's verified DB reader, never an RPC input.
 * Crypto/source/baseline verification belongs to that reader; this is exact mapping only. */
export function sponsoredAuthorizationMatches(input: { authorization: HustleSponsoredAuthorization | null; campaign: any; prospect: any; message: any; now: Date }): boolean {
  const { authorization: a, campaign: c, prospect: p, message: m, now } = input;
  if (!a || a.verified !== true || !Number.isFinite(now.getTime()) || a.approvedAt > now.getTime() || a.expiresAt <= now.getTime()) return false;
  if (m.sequenceStep === 0 && a.initialSendWindow && (!Number.isFinite(Date.parse(a.initialSendWindow.notBefore)) || !Number.isFinite(Date.parse(a.initialSendWindow.expiresAt)) || now.getTime() < Date.parse(a.initialSendWindow.notBefore) || now.getTime() >= Date.parse(a.initialSendWindow.expiresAt))) return false;
  if (a.sourceVersion !== HUSTLE_SPONSORED_SOURCE_VERSION || c.id !== 1 || c.slug !== HUSTLE_SPONSORED_SLUG || c.configVersion !== HUSTLE_SPONSORED_CONFIG_VERSION || c.episodeGoal !== 12) return false;
  if (!isHustleSponsoredProspect(p) || p.campaignId !== 1 || p.id !== a.prospectId || p.email !== a.record.email || p.name !== a.record.organization || p.website !== a.record.website) return false;
  if (m.campaignId !== 1 || m.prospectId !== p.id || a.messages.length !== 3 || new Set(a.messages.map(v => v.messageId)).size !== 3) return false;
  const exact = a.messages.find(v => v.sequenceStep === m.sequenceStep);
  return Boolean(exact && exact.messageId === m.id && exact.to === p.email && exact.subject === m.subject && exact.textBody === m.textBody && sponsoredSourceIsFresh(a.record, now));
}
export function getHustleSponsoredPayload(authorization: HustleSponsoredAuthorization, step: number) {
  if (!authorization || authorization.verified !== true || ![0, 1, 2].includes(step)) throw new Error('Verified exact sponsored authorization required');
  const exact = authorization.messages.find(m => m.sequenceStep === step);
  if (!exact || exact.to !== authorization.record.email) throw new Error('Exact approved message mapping missing');
  return { ...exact, headers: { ...authorization.headers }, fromDisplay: authorization.fromDisplay }; // Original bytes, no renderer.
}
/** Calendar calculation is prospective and includes weekends. No timer or scheduling I/O. */
export function getHustleSponsoredFollowupAt(previousActualAcceptance: Date, step: 1 | 2): Date {
  if (!Number.isFinite(previousActualAcceptance.getTime()) || ![1, 2].includes(step)) throw new Error('Previous actual SMTP acceptance required');
  const local = getOutreachLocalMoment(previousActualAcceptance, 'America/Chicago');
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  target.setUTCDate(target.getUTCDate() + HUSTLE_SPONSORED_POLICY.followupCalendarDays[step - 1]!);
  const desired = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 9);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const represented = getOutreachLocalMoment(new Date(guess), 'America/Chicago');
    guess += desired - Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute);
  }
  return new Date(guess);
}
