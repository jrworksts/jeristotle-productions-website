import { z } from 'zod';
import { isPublicTrainingHttpUrl, normalizeTrainingEmail } from './trainingOutreach';
import { renderJeristotleOutreachEmail } from './outreachFormatting';
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from './outboundReplenishmentPolicy';

export const HUSTLE_SLUG = 'corpus-christi-hustle-sponsors-2027';
export const HUSTLE_VERSION = 'hustle-episode-sponsorship-v1';
export const HUSTLE_LAUNCH_COPY_VERSION = 'hustle-sponsor-benefit-first-2026-11-05-v1';
export const HUSTLE_RUNTIME_VERSION = 'hustle-runtime-launch-2026-11-05-v1';
export const HUSTLE_LAUNCH_CONFIG_VERSION = 'hustle-benefit-first-launch-2026-11-05-v1';
/** Proposed only; the parent creates the actual job after a new checkpoint + Jeremy Publish. */
export const HUSTLE_LAUNCH_CRON = '0 8,38 6,7,13-23 * * *';
export const HUSTLE_EPISODE_GOAL = 24;
export const HUSTLE_DAILY_NEW_LIMIT = 10;
export const HUSTLE_RESERVE_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
export const HUSTLE_SEQUENCE_DELAYS = [0,4,5] as const;
export const HUSTLE_CRON = '0 0,30 13-23 * * *';
export const HUSTLE_CALLBACK = '/api/scheduled/hustle-outreach';
export const HUSTLE_STAGES = ['identified','ready','contacted','replied','proposal_requested','proposal_sent','meeting','negotiation','sponsor_confirmed','not_fit','bounced','unsubscribed','held','sequence_complete'] as const;
export const HUSTLE_FINANCIAL = ['bank','credit_union','business_lender'] as const;
export const HUSTLE_STOP_STAGES = ['replied','proposal_requested','proposal_sent','meeting','negotiation','sponsor_confirmed','not_fit','bounced','unsubscribed','held','sequence_complete'] as const;
const nullableText = (n:number) => z.string().trim().max(n).nullable();
const publicUrl = z.string().trim().max(500).refine(isPublicTrainingHttpUrl,'Public source URL required');
/** Jeremy's narrow November 15 approval; evidence is not message approval. */
export const HUSTLE_QUALIFICATION_POLICY_VERSION = 'hustle-qualification-2026-11-15-v1' as const;
const qualificationFactShape = {
  url:publicUrl, quote:z.string().trim().min(1).max(4000),
  observedOn:z.string().date(), publishedOn:z.string().date().nullable(),
};
const qualificationFact = z.object(qualificationFactShape).strict();
const pageContext = z.object({...qualificationFactShape,publishedName:z.string().trim().min(2).max(220),aliasProof:qualificationFact.optional()}).strict();
const scopedStaffFact = z.object({...qualificationFactShape,blockId:z.string().trim().min(1).max(120)}).strict();
const personAssociation = z.object({...qualificationFactShape,blockId:z.string().trim().min(1).max(120),name:scopedStaffFact,title:scopedStaffFact,email:scopedStaffFact}).strict();
const qualificationCommonShape = {
  policyVersion:z.literal(HUSTLE_QUALIFICATION_POLICY_VERSION),
  email:qualificationFact,
  phone:z.object({...qualificationFactShape,number:z.string().trim().min(7).max(100),kind:z.enum(['work_direct','company'])}).strict(),
  localFit:qualificationFact,
  pageContexts:z.array(pageContext).max(20).optional(),
  sourceLinks:z.array(z.object({...qualificationFactShape,targetUrl:publicUrl,kind:z.enum(['official_pressroom','alternate_company_domain']),anchor:z.object({label:z.string().trim().min(1).max(300),href:publicUrl}).strict().optional()}).strict()).max(4),
};
const qualificationEvidenceSchema = z.discriminatedUnion('route',[
  z.object({...qualificationCommonShape,route:z.literal('local_owner'),currentRole:qualificationFact,localOwnership:qualificationFact,smallBusiness:qualificationFact,personAssociation:personAssociation.optional()}).strict(),
  z.object({...qualificationCommonShape,route:z.literal('official_department'),departmentRemit:qualificationFact}).strict(),
]);
const hustleResearchBaseSchema = z.object({
  name:z.string().trim().min(2).max(220), website:publicUrl,
  category:z.enum(['bank','credit_union','business_lender','other_sponsor']),
  localEvidence:z.string().trim().min(10).max(4000), localSourceUrl:publicUrl,
  contactName:nullableText(180), contactTitle:nullableText(220),
  recipientType:z.enum(['named','marketing_team','communications_team','partnerships_team','unverified']),
  email:nullableText(320), emailSourceUrl:publicUrl.nullable(), emailSourceQuote:nullableText(4000), roleSourceUrl:publicUrl.nullable(),
  phone:nullableText(100), phoneSourceUrl:publicUrl.nullable(), phoneKind:z.enum(['work_direct','company','missing']),
  roleEvidence:z.string().max(4000), sourceDateNotes:z.string().max(4000), sponsorFit:z.string().max(4000),
  verifiedObservation:z.string().max(4000), limitations:z.array(z.string().max(2000)).max(60),
  sources:z.array(z.object({url:publicUrl,supports:z.string().max(2000)}).strict()).max(80),
  recommendForOutreach:z.boolean(),
  verifiedOn:z.string().date().optional(),
  qualificationEvidence:qualificationEvidenceSchema.optional(),
}).strict();
export type HustleResearch = z.infer<typeof hustleResearchBaseSchema>;
export const hustleResearchSchema = hustleResearchBaseSchema.superRefine((p,ctx)=>{
  if(p.email && (!normalizeTrainingEmail(p.email)||!p.emailSourceUrl||!p.emailSourceQuote)) ctx.addIssue({code:'custom',message:'Exact email requires source URL and published quote.'});
  if(p.phone && !p.phoneSourceUrl) ctx.addIssue({code:'custom',message:'Phone source missing.'});
  if(Object.prototype.hasOwnProperty.call(p,'qualificationEvidence') && (!p.qualificationEvidence || !hasApprovedQualificationProof(p))) ctx.addIssue({code:'custom',path:['qualificationEvidence'],message:'Approved route requires matching, company-published public proof for every claim.'});
});
export const hustlePacketSchema = z.object({version:z.literal(1),checkedOn:z.string().date(),coverageNotes:z.array(z.string()).max(100),prospects:z.array(hustleResearchSchema).max(100)}).strict();
export const host = (url:string) => new URL(url).hostname.toLowerCase().replace(/^www\./,'');
export const organizationKey = (p:{website:string;name:string}) => {
  const url=new URL(p.website);
  const charter=url.hostname.toLowerCase()==='mapping.ncua.gov'&&url.pathname.match(/^\/CreditUnionDetails\/(\d+)\/?$/i)?.[1];
  return charter?`registry:ncua:${charter}`:host(p.website);
};
export function isHustleLegacyContactQualified(p:HustleResearch,checkedOn=p.verifiedOn,now=new Date()) {
  if(!checkedOn)return false;
  const reviewed=Date.parse(checkedOn+'T00:00:00Z');
  if(!Number.isFinite(reviewed)||reviewed>now.getTime()||now.getTime()-reviewed>30*86400000)return false;
  if(!/corpus christi|coastal bend|nueces|san patricio|aransas|rockport|portland|kingsville|kleberg|beeville|refugio|jim wells|alice|robstown|ingleside|live oak|goliad|brooks|kenedy|duval/i.test(p.localEvidence))return false;
  if(p.limitations.some(l=>/restricted|press[- ]only|media[- ]only|privacy|accessibility|unconfirmed|unable to confirm|uncertain (role|email|local)|missing (current )?(role|email|local)|historical (role|email)|not (current|verified|for marketing)/i.test(l)))return false;
  const email=normalizeTrainingEmail(p.email);
  if(!p.recommendForOutreach || !email || !p.emailSourceUrl || !p.roleSourceUrl || !p.emailSourceQuote?.toLowerCase().includes(email) || !p.roleEvidence.trim() || !p.verifiedObservation.trim()) return false;
  const local=email.split('@')[0];
  if(/^(info|support|contact|customerservice|service|help|privacy|security|accessibility|press|mediarelations|complaints|donations|scholarship)([._-].*)?$/.test(local)) return false;
  if(p.recipientType==='named') return Boolean(p.contactName && p.contactTitle && /marketing|communications|brand|community.*(relations|impact|development)|partnership|sponsorship/i.test(p.contactTitle));
  if(!['marketing_team','communications_team','partnerships_team'].includes(p.recipientType)) return false;
  if(host(p.emailSourceUrl)!==host(p.roleSourceUrl)) return false;
  const domain=email.split('@')[1];
  const official=host(p.website);
  if(domain!==official && !domain.endsWith('.'+official)) return false;
  if(host(p.emailSourceUrl)!==official && !host(p.emailSourceUrl).endsWith('.'+official)) return false;
  if(p.recipientType==='marketing_team') return /^(marketing|brand|brandmarketing|mktg|[a-z0-9]{1,12}marketing)([._-].*)?$/.test(local) && /marketing|brand/i.test(p.roleEvidence);
  if(p.recipientType==='communications_team') return /^(communications|communication|comms)([._-].*)?$/.test(local);
  return p.category==='other_sponsor' && /^(partnerships|sponsorships|sponsorship)([._-].*)?$/.test(local) && /sponsor|partnership/i.test(p.roleEvidence);
}
type QualificationFact = z.infer<typeof qualificationFact>;
const hustleLocalArea = /corpus christi|coastal bend|nueces|san patricio|aransas|rockport|portland|kingsville|kleberg|beeville|refugio|jim wells|alice|robstown|ingleside|live oak|goliad|brooks|kenedy|duval/i;
const restrictedRoute = /\b(?:customer\s*(?:service|support)|privacy|accessibility|security|complaints|donation[s]?|scholarship[s]?)\b|(?:press|media)[- ]only|only.{0,30}(?:press|media)|(?:press|media)\s+(?:inquiries|enquiries|relations|contact)/i;
const heldEvidence = /restricted|unconfirmed|unable to confirm|uncertain|missing (current )?(role|email|local|ownership|phone)|historical|archived|not (current|verified|for marketing)|former|retired|past president|president[- ]elect|no longer|will become|plans? to become|previously|(?:not|no)\s+(?:(?:an?|the)\s+)?(?:small[- ](?:business|company|enterprise|firm)|micro[- ]?(?:enterprise|business)|one[- ]person (?:business|company|enterprise)|sole proprietor(?:ship)?|locally[- ]owned|local owner|ownership|owner|owned|president|official)|assumed|inferred|estimated|enrichment|third[- ]party|according to|reported by/i;
const nonCompanyIdentity = /(?:^|\.)(?:apollo\.io|zoominfo\.com|rocketreach\.co|linkedin\.com|facebook\.com|bloomberg\.com|crunchbase\.com|yelp\.com|dnb\.com|gmail\.com|google\.com|yahoo\.com|outlook\.com)$/i;
const sameCompanyHost = (candidate:string,official:string) => candidate===official || candidate.endsWith('.'+official);
const proofText = (value:string) => value.toLowerCase().replace(/\s+/g,' ').trim();
const containsClaim = (quote:string,claim:string|null) => Boolean(claim && proofText(quote).includes(proofText(claim)));
const identityText = (value:string) => proofText(value).replace(/[^a-z0-9]+/g,' ').trim();
const legalIdentity = (value:string) => identityText(value).replace(/(?:\s+(?:incorporated|inc|llc|l l c|ltd|limited|corp|corporation|co|company))+$/,'').trim();
const identityContains = (quote:string,name:string) => (' '+identityText(quote)+' ').includes(' '+identityText(name)+' ');
const escapePattern = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function validPageIdentity(context:z.infer<typeof pageContext>,legalName:string) {
  if(!identityContains(context.quote,context.publishedName))return false;
  const legal=legalIdentity(legalName),brand=legalIdentity(context.publishedName);
  const generic=/^(?:shop|store|business|company|group|enterprise[s]?|service[s]?|holdings|corporate|international|national|local|the|and|of|for|a|an|small|bank|owner|president)$/;
  const constituent=brand===legal || (brand.length>=4 && brand.split(' ').some(word=>!generic.test(word)) && (' '+legal+' ').includes(' '+brand+' '));
  const alias=context.aliasProof;
  if(alias && (alias.url!==context.url || !new RegExp(escapePattern(identityText(legalName))+' (?:doing business as|d b a|dba|trading as|trades as|known as|brand name is) '+escapePattern(identityText(context.publishedName))+'(?: |$)').test(identityText(alias.quote))))return false;
  return constituent || Boolean(alias);
}
function conflictingEntity(quote:string,names:string[]) {
  // Explicit entity attributions cannot be rescued by a different page header.
  const candidates:string[]=[];
  const patterns=[
    /(?:^|[;\n.!])\s*([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,7})\s+(?=(?:main|company|office|switchboard|direct|work|phone|tel|advertising department|marketing department|sponsorship department|serves|supports|is\s+(?:a|an|the|not)\b))/g,
    /(?:^|[;\n.!])\s*([a-z][a-z0-9&' -]{0,180}?)\s+(?=(?:company phone|advertising department|marketing department|sponsorship department|serves|supports|is\s+(?:a|an|the|not)\b))/gi,
    /\b(?:owner|president|Owner|President)\s+of\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,7})/g,
    /(?:^|[;\n.!])\s*([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,7})\s*:/g,
  ];
  for(const pattern of patterns)for(const match of Array.from(quote.matchAll(pattern)))candidates.push(match[1]);
  const known=(value:string)=>names.some(name=>new RegExp('^'+escapePattern(legalIdentity(name))+'(?: (?:(?:advertising|marketing|sponsorship) department|(?:main|company|office|direct|work)(?: office|work)? phone|official(?: company| corporate)? (?:pressroom|newsroom|website|domain|site)))?$').test(legalIdentity(value)));
  const label=/^(?:for|we|our business|main|company|office|phone|tel|email|owner|president|contact|(?:main|company|office|direct|work)(?: office|work)? phone|advertising|marketing|advertising department|marketing department|sponsorship department|advertising sponsorships|newsroom|pressroom|official pressroom|official newsroom|official company website|official company pressroom)$/;
  return candidates.some(value=>!known(value) && !label.test(identityText(value)));
}
const exactPublishedEmail = (quote:string,email:string) => (quote.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[]).some(value=>value.toLowerCase()===email);
const exactQuotedUrl = (quote:string,url:string) => (quote.match(/https?:\/\/[^\s<>"']+/gi)||[]).some(value=>value.replace(/[),.;]+$/,'')===url);
function namedOwnership(quote:string,name:string) {
  const escaped=proofText(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const text=proofText(quote);
  return new RegExp(escaped+'\\s*(?:,\\s*|\\s+(?:is\\s+)?(?:the\\s+|a\\s+)?)(?:(?:current|local|sole|business|co)[- ]+)*(?:owner|owns)\\b','i').test(text) || new RegExp('\\bowned by\\s+'+escaped+'\\b','i').test(text);
}
function inlinePersonRole(quote:string,name:string,title:string,email?:string) {
  const prefix='(?:^|[^a-z0-9])'+escapePattern(proofText(name))+'\\s*(?:,\\s*|\\s+(?:is\\s+)?(?:the\\s+|a\\s+)?(?:current\\s+)?)'+escapePattern(proofText(title));
  return new RegExp(prefix+(email?'[\\s,:;]+'+escapePattern(email)+'(?:$|[^a-z0-9@._-])':'(?:$|[^a-z0-9])'),'i').test(proofText(quote));
}
function explicitBusinessScope(quote:string,names:string[],contactName:string|null) {
  if(/\b(?:if|unless|would|could|might|used to|used[- ]to)\b/i.test(quote))return false;
  const scope='(?:small (?:business|company|enterprise|firm)|micro ?(?:enterprise|business)|one person (?:business|company|enterprise)|sole proprietorship)';
  const modifiers='(?:(?:a|an|current|independent|locally owned|local|registered) )*';
  const subject='(?:'+names.map(name=>escapePattern(identityText(name))).join('|')+'|we|our (?:business|company|enterprise|firm))';
  if(new RegExp('(?:^| )'+subject+' (?:is|are|operates? as|operate as|operates?|operate) '+modifiers+scope+'(?: |$)').test(identityText(quote)))return true;
  return Boolean(contactName&&new RegExp('(?:^| )'+escapePattern(identityText(contactName))+' is (?:the |a )?sole proprietor of (?:'+names.map(name=>escapePattern(identityText(name))).join('|')+')(?: |$)').test(identityText(quote)));
}
function scopedLocalOwnership(quote:string,names:string[]) {
  if(/\bowner|\bowns|\bby\b/i.test(quote.replace(/locally[- ]owned|local ownership/gi,'')))return false;
  const subject='(?:'+names.map(name=>escapePattern(identityText(name))).join('|')+'|we|our (?:business|company))';
  return new RegExp('(?:^| )'+subject+' (?:is|are) (?:a |an )?locally owned(?: |$)').test(identityText(quote));
}
function directProofUrl(value:string) {
  if(!isPublicTrainingHttpUrl(value))return false;
  const url=new URL(value);
  const decoded=(text:string)=>{for(let i=0;i<3;i++){const next=decodeURIComponent(text);if(next===text)break;text=next;}return text;};
  // Scalar IDs are valid. Routing parameters, embedded destinations and search routes are not.
  if(/(?:^|\/)(?:redirect[^/]*|out|external|search)(?:\/|\.|$)|https?:|\/\//i.test(decoded(url.pathname)))return false;
  if(/https?:|\/\//i.test(decoded(url.hash)))return false;
  for(const [key,value] of Array.from(url.searchParams.entries())) {
    if(/^(?:url|uri|href|link|to|target.*|destination.*|dest|redirect.*|return.*|next|goto|continue|forward.*|search|query|q)$/i.test(decoded(key).replace(/[^a-z]/gi,'')) || /https?:|\/\/|^[/.\\]|\b[a-z0-9-]+\.(?:com|org|net|io|test)(?:[/:]|$)/i.test(decoded(value)))return false;
  }
  return true;
}
function scopedPersonProof(p:HustleResearch,email:string):boolean {
  const e=p.qualificationEvidence;
  if(!e||e.route!=='local_owner'||!e.personAssociation||!p.contactName||!p.contactTitle)return false;
  const a=e.personAssociation;
  if(a.url!==e.email.url||a.url!==e.currentRole.url||[a.name,a.title,a.email].some(fact=>fact.url!==a.url||fact.blockId!==a.blockId))return false;
  if(a.name.quote!==p.contactName||a.title.quote!==p.contactTitle||normalizeTrainingEmail(a.email.quote)!==email)return false;
  if(e.email.quote!==a.email.quote||e.currentRole.quote!==a.title.quote)return false;
  // Only a bounded single-person DOM block, not an asserted association or whole-page header.
  const wrapper=a.quote.match(/^<(article|li|section|div)\b([^>]*)>([\s\S]*)<\/\1>$/i);
  if(!wrapper||!new RegExp('(?:^|\\s)id\\s*=\\s*["\']'+escapePattern(a.blockId)+'["\']').test(wrapper[2])||new RegExp('<'+wrapper[1]+'\\b','i').test(wrapper[3]))return false;
  if(/<\/?(?:article|li|section|div)\b|\bid\s*=|\b(?:data-person|data-staff|data-member)\b/i.test(wrapper[3])||/\bdata-id\s*=/i.test(wrapper[2]))return false;
  if(/<!--|<script|<style|\bhidden\b|aria-hidden|display\s*:\s*none/i.test(a.quote))return false;
  const texts=wrapper[3].split(/<[^>]+>/).map(value=>value.trim()).filter(Boolean);
  if(texts.length!==3||texts[2]!==a.email.quote)return false;
  if(!((texts[0]===p.contactName&&texts[1]===p.contactTitle)||(texts[0]===p.contactTitle&&texts[1]===p.contactName)))return false;
  const emails=a.quote.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)||[];
  return emails.length>0&&emails.every(value=>value.toLowerCase()===email);
}
function qualificationFacts(p:HustleResearch):QualificationFact[] {
  const e=p.qualificationEvidence;
  if(!e)return [];
  const contexts=e.pageContexts||[];
  const association=e.route==='local_owner'?e.personAssociation:undefined;
  return [e.email,e.phone,e.localFit,...e.sourceLinks,...contexts,...contexts.flatMap(context=>context.aliasProof?[context.aliasProof]:[]),...(association?[association,association.name,association.title,association.email]:[]),...(e.route==='local_owner'?[e.currentRole,e.localOwnership,e.smallBusiness]:[e.departmentRemit])];
}
/** Offline proof validation; no source fetching, title invention, or employee-count assumptions. */
function hasApprovedQualificationProof(p:HustleResearch):boolean {
  try {
    const e=p.qualificationEvidence;
    if(!e || !directProofUrl(p.website))return false;
    const official=host(p.website),email=normalizeTrainingEmail(p.email);
    if(!email || !p.emailSourceUrl || !p.roleSourceUrl || !p.phone || !p.phoneSourceUrl || p.phoneKind==='missing')return false;
    if(!p.recommendForOutreach || !p.roleEvidence.trim() || !p.verifiedObservation.trim() || !p.sourceDateNotes.trim())return false;
    if(!hustleLocalArea.test(p.localEvidence) || !hustleLocalArea.test(p.sponsorFit) || !/sponsor|advertis|episode|entrepreneur|business.*stor/i.test(p.sponsorFit))return false;
    if(p.limitations.some(value=>heldEvidence.test(value)||restrictedRoute.test(value)))return false;
    const retained=(url:string)=>p.sources.some(source=>source.url===url && source.supports.trim());
    const contexts=e.pageContexts||[];
    if(new Set(contexts.map(context=>context.url)).size!==contexts.length||contexts.some(context=>!validPageIdentity(context,p.name)))return false;
    const pageNames=(url:string)=>[p.name,...contexts.filter(context=>context.url===url).map(context=>context.publishedName)];
    const entityProof=(fact:QualificationFact)=>!conflictingEntity(fact.quote,[...pageNames(fact.url),...(p.contactName?[p.contactName,...pageNames(fact.url).map(name=>name+' '+p.contactName)]:[])]) && (identityContains(fact.quote,p.name)||contexts.some(context=>context.url===fact.url));
    const linkedHosts=new Set<string>();
    for(const link of e.sourceLinks) {
      if(!directProofUrl(link.url)||!directProofUrl(link.targetUrl)||!sameCompanyHost(host(link.url),official)||!retained(link.url)||!retained(link.targetUrl))return false;
      const target=host(link.targetUrl);
      if(nonCompanyIdentity.test(target)||sameCompanyHost(target,official)||linkedHosts.has(target)||!entityProof(link))return false;
      if(/redirect|forward(?:s|ing)?|third[- ]party|unaffiliated|external listing/i.test(link.quote))return false;
      if(link.anchor) {
        if(!contexts.some(context=>context.url===link.url)||link.anchor.href!==link.targetUrl||link.quote!==link.anchor.label)return false;
        if(link.kind==='official_pressroom' ? !/^(?:(?:our|company|corporate)\s+)?(?:newsroom|pressroom|press room|news room|media center)$/i.test(link.anchor.label) : !/^(?:official|company|corporate)(?: company)? (?:website|domain|site)$/i.test(link.anchor.label))return false;
      } else {
        if(!exactQuotedUrl(link.quote,link.targetUrl))return false;
        if(link.kind==='official_pressroom' ? !/official (?:company )?(?:pressroom|newsroom|media center)/i.test(link.quote) : !/official (?:company |corporate )?(?:website|domain|site)/i.test(link.quote))return false;
      }
      // A base-site link authorizes only this directly linked host, whose identity must also be published.
      if(!contexts.some(context=>context.url===link.targetUrl)&&!identityContains(link.quote,p.name))return false;
      linkedHosts.add(target);
    }
    const trusted=(url:string)=>directProofUrl(url)&&(sameCompanyHost(host(url),official)||linkedHosts.has(host(url)));
    // Even if somebody substitutes a third-party listing for the company website, it cannot authorize a route.
    if(nonCompanyIdentity.test(official))return false;
    const facts=qualificationFacts(p);
    if(facts.some(fact=>!trusted(fact.url)||!retained(fact.url)||heldEvidence.test(fact.quote)||restrictedRoute.test(fact.quote)))return false;
    if([p.emailSourceUrl,p.roleSourceUrl,p.phoneSourceUrl,p.localSourceUrl].some(url=>!trusted(url)||!retained(url)))return false;
    if(contexts.some(context=>!entityProof(context)))return false;
    if(e.email.url!==p.emailSourceUrl || e.email.quote!==p.emailSourceQuote || !exactPublishedEmail(e.email.quote,email) || !entityProof(e.email))return false;
    if(e.phone.url!==p.phoneSourceUrl || e.phone.kind!==p.phoneKind || !entityProof(e.phone))return false;
    const digits=(value:string)=>value.replace(/\D/g,'');
    const number=digits(p.phone);
    if(!/^\d{10,15}$/.test(number)||digits(e.phone.number)!==number)return false;
    if(!(e.phone.quote.match(/\+?\d[\d().\s-]{5,}\d/g)||[]).some(value=>digits(value)===number))return false;
    if(e.phone.kind==='work_direct') {
      const recipientProof=e.route==='local_owner'?containsClaim(e.phone.quote,p.contactName):/\b(?:marketing|advertising|sponsorship)\s+(?:department|team)\b/i.test(e.phone.quote);
      if(!recipientProof||!/\bdirect\b/i.test(e.phone.quote)||!/work|phone|tel|call/i.test(e.phone.quote)||/main|switchboard|company phone/i.test(e.phone.quote))return false;
    } else if(!/main|company|office|switchboard|contact|phone|tel|call/i.test(e.phone.quote))return false;
    if(e.localFit.url!==p.localSourceUrl || !entityProof(e.localFit) || !hustleLocalArea.test(e.localFit.quote) || !/business|community|local|sponsor|advertis|marketing/i.test(e.localFit.quote))return false;
    const local=email.split('@')[0],domain=email.split('@')[1];
    if(/(?:^|[._-])(?:info|support|contact|customer.?service|service|help|privacy|security|accessibility|press|media.?relations|complaints|donations?|scholarship)(?:$|[._-])/i.test(local))return false;
    if(restrictedRoute.test(p.emailSourceQuote||'')||restrictedRoute.test(p.roleEvidence))return false;
    const companyEmail=sameCompanyHost(domain,official)||linkedHosts.has(domain);
    if(e.route==='local_owner') {
      if(p.recipientType!=='named'||!p.contactName||!p.contactTitle||!/\b(?:owner|president)\b/i.test(p.contactTitle))return false;
      const association=scopedPersonProof(p,email);
      if(e.personAssociation&&!association)return false;
      if(e.currentRole.url!==p.roleSourceUrl||!entityProof(e.currentRole)||(!association&&!inlinePersonRole(e.currentRole.quote,p.contactName,p.contactTitle)))return false;
      if(!association&&!inlinePersonRole(e.email.quote,p.contactName,p.contactTitle,email))return false;
      if(!companyEmail && domain!=='gmail.com')return false;
      // Ownership must belong to this named person and this whole local business, not a local branch of a national chain.
      if(!entityProof(e.localOwnership)||(!namedOwnership(e.localOwnership.quote,p.contactName)&&!(association&&/^owner$/i.test(p.contactTitle)&&scopedLocalOwnership(e.localOwnership.quote,pageNames(e.localOwnership.url))))||!/locally[- ]owned|local ownership|local owner/i.test(e.localOwnership.quote))return false;
      if(!entityProof(e.smallBusiness)||!explicitBusinessScope(e.smallBusiness.quote,pageNames(e.smallBusiness.url),p.contactName))return false;
      if(/\b(?:national|nationwide|global|multinational|branch|division|subsidiary|chain)\b/i.test([p.contactTitle,p.roleEvidence,p.localEvidence,...facts.map(fact=>fact.quote)].join(' ')))return false;
      return true;
    }
    if(!companyEmail||p.contactName!==null||p.contactTitle!==null)return false;
    if(!['marketing_team','communications_team','partnerships_team'].includes(p.recipientType))return false;
    if(p.recipientType==='partnerships_team'&&p.category!=='other_sponsor')return false;
    if(!/^(?:marketing|brand|brandmarketing|mktg|[a-z0-9]{1,12}marketing|advertising|advertisinginquir(?:y|ies)|advertisingenquir(?:y|ies)|sponsorships?|partnerships)(?:[._-].*)?$/.test(local))return false;
    const remit=e.departmentRemit;
    return remit.url===p.roleSourceUrl && entityProof(remit) && exactPublishedEmail(remit.quote,email) && /\b(?:marketing|advertising|sponsorships?)\b/i.test(remit.quote) && /department|team|inquir|enquir|commercial|opportunit|contact/i.test(remit.quote);
  } catch { return false; }
}
function qualificationProofIsFresh(p:HustleResearch,checkedOn:string|undefined,now:Date):boolean {
  if(!checkedOn||!Number.isFinite(now.getTime()))return false;
  const reviewed=Date.parse(checkedOn+'T00:00:00Z');
  if(!Number.isFinite(reviewed)||reviewed>now.getTime()||now.getTime()-reviewed>30*86400000)return false;
  return qualificationFacts(p).every(fact=>{
    const observed=Date.parse(fact.observedOn+'T00:00:00Z');
    const published=fact.publishedOn===null?observed:Date.parse(fact.publishedOn+'T00:00:00Z');
    // Freshness is the current source observation, not the page's original publication date.
    return Number.isFinite(observed)&&Number.isFinite(published)&&observed<=reviewed&&published<=observed&&now.getTime()-observed<=30*86400000;
  });
}
export function isHustleContactQualified(p:HustleResearch,checkedOn=p.verifiedOn,now=new Date()) {
  // Malformed additive evidence never falls back to the legacy route, even on otherwise legacy-qualified contacts.
  if(Object.prototype.hasOwnProperty.call(p,'qualificationEvidence')) {
    const parsed=hustleResearchSchema.safeParse(p);
    if(!parsed.success||!parsed.data.qualificationEvidence||!qualificationProofIsFresh(parsed.data,checkedOn,now))return false;
    return isHustleLegacyContactQualified(parsed.data,checkedOn,now)||hasApprovedQualificationProof(parsed.data);
  }
  return isHustleLegacyContactQualified(p,checkedOn,now);
}
/** Stable evidence marker fences every new route, including an owner who also has a legacy marketing title. */
export function hustleRequiresExactMessageReview(p:HustleResearch):boolean {
  return Object.prototype.hasOwnProperty.call(p,'qualificationEvidence') || (isHustleContactQualified(p)&&!isHustleLegacyContactQualified(p));
}
export function buildHustleSequence(p:{name:string;category:string;recipientType:string;contactName:string|null}) {
  const greeting=p.recipientType==='named' && p.contactName ? `Hi ${p.contactName.split(/\s+/)[0]},` : p.recipientType==='communications_team' ? `Hello ${p.name} communications team,` : p.recipientType==='partnerships_team' ? `Hello ${p.name} partnerships team,` : `Hello ${p.name} marketing team,`;
  const financial=(HUSTLE_FINANCIAL as readonly string[]).includes(p.category);
  const opening=financial ? `Could ${p.name} use a new way to get in front of Corpus Christi business owners and show its support for local small businesses?` : `Could ${p.name} use a new way to connect with Corpus Christi business owners and show its support for the local business community?`;
  const positioning=financial ? `Rather than just telling owners that ${p.name} supports small businesses, this gives your team an opportunity to demonstrate that support by helping bring a local entrepreneur's story to the community.` : `Rather than another standalone ad, this gives ${p.name} an opportunity to be part of a meaningful local story and help bring it to the community.`;
  const nextStep=financial ? 'A clear call to action could connect interested owners with your business-banking team.' : 'A clear call to action could connect interested owners with your team.';
  const measurement=financial ? 'The proposal would set out how to measure visibility, business-owner inquiries and meetings, along with goals for new business accounts and loan activity using aggregate results your institution can confirm.' : 'The proposal would set out how to measure visibility, engagement, qualified inquiries and customer conversations appropriate to your business.';
  const subject=`Putting ${p.name} in front of Corpus Christi business owners`;
  const signature='Jeremy Wells\nJeristotle Productions\nMovie-level content production for small businesses.\n319 N Mesquite St, Corpus Christi, TX 78401\nTo opt out, reply unsubscribe.';
  const bodies=[
    `${greeting}\n\n${opening}\n\nCorpus Christi Hustle is a mini-documentary series highlighting the entrepreneurs building our community. As the sponsor of one 2027 episode, your brand would be featured alongside a compelling local business story, supported by short videos and a proposed local promotion plan across YouTube, Facebook and Instagram.\n\n${positioning}\n\n${nextStep} The campaign would include agreed reporting on visibility, inquiries and meetings so your team can evaluate the investment.\n\nWould you like me to send a short proposal showing what this could look like for ${p.name}?\n\n${signature}`,
    `${greeting}\n\nFollowing up on the opportunity to put ${p.name} alongside the entrepreneurs moving Corpus Christi forward.\n\nA sponsored mini-documentary could give your team a local story to share through your own channels, plus shorter videos and targeted promotion designed to reach the business community. ${nextStep}\n\n${measurement}\n\nWe're planning 24 episodes in 2027, with one sponsor per episode. Your team could evaluate a single episode first, without committing to the full series.\n\nMay I send the proposal for your team to investigate? If a different marketing colleague handles opportunities like this, who would be best to include?\n\n${signature}`,
    `${greeting}\n\nOne final note about helping ${p.name} become more visible to Corpus Christi business owners through a local entrepreneur's story.\n\nIf ${financial ? 'showing your support for small businesses' : 'building a stronger connection with the local business community'} is a priority for 2027, a Corpus Christi Hustle episode could be worth exploring.\n\nWould you like the short proposal, or should I close the loop for now? Either way is completely fine.\n\n${signature}`,
  ];
  return bodies.map((textBody,sequenceStep)=>({sequenceStep,subject:sequenceStep ? `Re: ${subject}`:subject,textBody,htmlBody:renderJeristotleOutreachEmail({subject:sequenceStep ? `Re: ${subject}`:subject,text:textBody,linkFree:sequenceStep===0})}));
}
/** Exact current approved text plus deterministic professional HTML; never repairs/rewords copy. */
export function isHustleCanonicalMessage(p:Parameters<typeof buildHustleSequence>[0],m:{sequenceStep:number;subject:string;textBody:string}) {
  try {
    if(!Number.isInteger(m.sequenceStep)||m.sequenceStep<0||m.sequenceStep>2)return false;
    const canonical=buildHustleSequence(p)[m.sequenceStep];
    return m.subject===canonical.subject&&m.textBody===canonical.textBody;
  } catch { return false; }
}
