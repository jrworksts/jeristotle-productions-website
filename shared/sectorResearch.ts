import { z } from "zod";
import { SECTOR_KEYS, SECTOR_DEFINITIONS, SECTOR_COPY_VERSION, type SectorKey } from "./sectorOutreach";
import { renderJeristotleOutreachEmail } from "./outreachFormatting";
import { trainingIdentityAliases, isPublicTrainingHttpUrl } from "./trainingOutreach";
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from "./outboundReplenishmentPolicy";

export const SECTOR_RUNTIME_VERSION = "sector-runtime-2026-11-05-v1";
export const SECTOR_RESERVE_TARGET = OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
export const SECTOR_SOURCE_MAX_AGE_MS = 30 * 86400000;
const field = z.string().max(4000);
export const sectorResearchRecordSchema = z.object({
  campaignKey: z.enum(SECTOR_KEYS), company: z.string().min(1).max(220), website: z.string().max(500),
  contactName: z.string().max(180).nullable(), contactRole: z.string().max(220).nullable(),
  email: z.string().max(320), emailSourceUrl: z.string().max(500), emailSourceQuote: field,
  roleSourceUrl: z.string().max(500).nullable(), phone: z.string().max(100).nullable(), phoneSourceUrl: z.string().max(500).nullable(),
  verifiedFact: field, factSourceUrl: z.string().max(500), localFit: field, localFitSourceUrl: z.string().max(500),
  proposedAngle: field, proposedScenes: z.array(field).max(20),
  personalization: z.object({
    greeting: field, company: field, verifiedFact: field,
    propertyOrCompany: field.optional(), specificExperience: field.optional(), bookingGoal: field.optional(), specificOffer: field.optional(),
    propertyOrDevelopment: field.optional(), propertyGoal: field.optional(), specificCapability: field.optional(), capabilityGoal: field.optional(),
    approvedService: field.optional(), serviceGoal: field.optional(),
  }).strict(),
  verifiedAtISO: z.string().max(40), evidenceNotes: field,
  sources: z.array(z.object({url:z.string().max(500),quote:field,kind:z.string().max(80),publishedDate:z.string().max(40).nullable()}).strict()).max(40),
}).strict();
export const sectorResearchPacketSchema = z.object({researchedOn:z.string().max(40),prospects:z.array(sectorResearchRecordSchema).max(200)}).strict();
export type SectorResearchRecord = z.infer<typeof sectorResearchRecordSchema>;
export type SectorResearchPacket = z.infer<typeof sectorResearchPacketSchema>;
export type SectorIdentity = {businessName:string|null;website:string|null;email:string|null;id?:number;origin?:string};
const publicMail = new Set(["gmail.com","googlemail.com","outlook.com","hotmail.com","yahoo.com","aol.com","icloud.com","live.com","msn.com","proton.me","protonmail.com"]);
export function sectorDomain(value:string|null|undefined) {
  try {return new URL(value || "").hostname.toLowerCase().replace(/^www\./,"");} catch {return null;}
}
export function sectorIdentityAliases(p:SectorIdentity) {
  const aliases=trainingIdentityAliases(p);
  const canonical=(p.businessName||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\b(?:llc|inc|incorporated|corp|corporation|ltd|limited|company|co)\b/g,"").trim().replace(/\s+/g," ");
  if(canonical)aliases.push("canonical-business:"+canonical);
  const domain=p.email?.toLowerCase().split("@")[1];
  if(domain&&!publicMail.has(domain)) aliases.push(`domain:${domain}`);
  return Array.from(new Set(aliases));
}
export function sectorIdentityKey(p:SectorResearchRecord) {
  return (sectorDomain(p.website)||trainingIdentityAliases({businessName:p.company,website:null,email:null})[0]||"").slice(0,220);
}
export function sectorConflictReason(p:SectorResearchRecord, records:SectorIdentity[], suppressions:Array<{email:string}>, selfId?:number) {
  if(/coast\s*life/i.test(p.company)||/coastlifecu\./i.test(p.website))return "Protected CoastLife relationship; no cold outreach.";
  if(/\bfrost\b/i.test(p.company)||/frostbank\./i.test(p.website))return "Existing Frost proposal; owner coordination required.";
  if(suppressions.some(s=>s.email.toLowerCase()===p.email.toLowerCase()))return "Shared email suppression applies.";
  const aliases=new Set(sectorIdentityAliases({businessName:p.company,website:p.website,email:p.email}));
  const conflict=records.find(r=>!(r.origin==="sectors"&&selfId===r.id)&&sectorIdentityAliases(r).some(a=>aliases.has(a)));
  return conflict?`Company/domain/contact already recorded in ${conflict.origin||"outreach"}; preserve history.`:null;
}
const tokens:Record<string,keyof SectorResearchRecord["personalization"]> = {
  "Company":"company", "First name / Company team":"greeting", "Property or Company":"propertyOrCompany", "Practice or Group":"propertyOrCompany",
  "verified fact about the company, experience, location, or seasonal offering":"verifiedFact", "specific experience":"specificExperience", "bookings / seasonal demand / group inquiries":"bookingGoal", "specific offer or seasonal opportunity":"specificOffer",
  "verified fact about the development, property, portfolio, or brokerage":"verifiedFact", "specific property, development, neighborhood, or lifestyle":"propertyOrDevelopment", "property or development":"propertyOrDevelopment", "property inquiries / tour requests / launch interest":"propertyGoal",
  "verified capability, facility, service, or hiring fact":"verifiedFact", "specific approved capability":"specificCapability", "specific capability":"specificCapability", "specific capability / customer education / recruiting":"capabilityGoal",
  "verified service, location, specialty, or recruiting fact":"verifiedFact", "specific approved service or patient-experience topic":"approvedService", "approved service / patient education / recruiting":"serviceGoal",
};
export function sectorUnsafeCopy(text:string) {
  return /\[[^\]]*\]|\{\{[^}]*\}\}|\b(?:TBD|TODO|INSERT HERE)\b|\s\/\s|https?:\/\/|www\.|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:guarantee(?:d)?|risk[- ]free|ROI|investment returns)\b|\$\s*\d/i.test(text);
}
export function buildSectorSequence(p:SectorResearchRecord) {
  const definition=SECTOR_DEFINITIONS.find(d=>d.key===p.campaignKey)!;
  const fill=(text:string)=>text.replace(/\[([^\]]+)\]/g,(_,token:string)=>{
    const key=tokens[token],value=key&&p.personalization[key];
    if(!value?.trim())throw new Error(`Missing template personalization: ${token}`);
    if(sectorUnsafeCopy(value))throw new Error(`Unsafe template personalization: ${token}`);
    return value.trim();
  });
  return definition.messages.map(m=>{
    const subject=fill(m.subject),textBody=fill(m.body);
    if(subject.length>240||/[\r\n]/.test(subject)||sectorUnsafeCopy(subject+"\n"+textBody))throw new Error("Unsafe or unresolved sector copy");
    return {messageNumber:m.messageNumber,subject,textBody,htmlBody:renderJeristotleOutreachEmail({subject,text:textBody,linkFree:true,physicalPostalAddress:"319 N Mesquite St, Corpus Christi, TX 78401"}),copyVersion:SECTOR_COPY_VERSION};
  });
}
function official(url:string,p:SectorResearchRecord) {
  if(!isPublicTrainingHttpUrl(url))return false;
  const domain=sectorDomain(p.website),source=sectorDomain(url);
  return Boolean(domain&&source&&(domain===source||source.endsWith("."+domain)));
}
/** Only case/whitespace are normalized. Unsupported words, numbers and modifiers cannot be added. */
export function sectorQuoteSupportsClaim(p:SectorResearchRecord,url:string,claim:string) {
  const normalized=(text:string)=>text.normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();
  const exact=normalized(claim);
  return exact.length>=12&&p.sources.some(s=>s.url===url&&normalized(s.quote).includes(exact));
}
/** Evidence is a hold, never a send shortcut. No network access or contact attribution inference. */
export function sectorQualificationReason(p:SectorResearchRecord,now=new Date(),researchedOn?:string):string|null {
  const observed=Date.parse(p.verifiedAtISO),packetDate=researchedOn?Date.parse(researchedOn):observed;
  if(!Number.isFinite(observed)||observed>now.getTime()||now.getTime()-observed>SECTOR_SOURCE_MAX_AGE_MS||!Number.isFinite(packetDate)||packetDate>now.getTime()||now.getTime()-packetDate>SECTOR_SOURCE_MAX_AGE_MS)return "Sources must be observed within the last 30 days, not future-dated.";
  if(!isPublicTrainingHttpUrl(p.website)||!official(p.emailSourceUrl,p)||!official(p.factSourceUrl,p)||!official(p.localFitSourceUrl,p))return "Current official company email, fact and Coastal Bend sources are required.";
  if(!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(p.email)||/[\r\n]/.test(p.email))return "Invalid exact business email.";
  const quotedEmails:string[]=p.emailSourceQuote.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  if(!quotedEmails.includes(p.email))return "Exact published email must occur in the authoritative email quote.";
  if(/\b(?:press|media inquiries|patient|appointments?|reservations?|customer support|customer service|technical support|billing|medical advice)\b/i.test(p.emailSourceQuote+" "+p.contactRole)||/^(?:press|media|support|reservations?|appointments?|patients?|billing|help|customerservice)@/i.test(p.email))return "Restricted press/customer/patient/support/reservation contact is not a business buyer.";
  const source=(url:string)=>p.sources.find(s=>s.url===url&&s.quote.trim().length>=12);
  if(!source(p.emailSourceUrl)||!source(p.factSourceUrl)||!source(p.localFitSourceUrl)||!p.sources.some(s=>s.url===p.emailSourceUrl&&s.quote.includes(p.email)&&s.quote.includes(p.emailSourceQuote)))return "Source packet must preserve the email quote and quoted official fact/local evidence.";
  if(p.sources.some(s=>!isPublicTrainingHttpUrl(s.url)||!s.kind.trim()||!s.quote.trim()||s.publishedDate&&(!Number.isFinite(Date.parse(s.publishedDate))||Date.parse(s.publishedDate)>now.getTime())))return "Source metadata incomplete or invalid.";
  if(!p.verifiedFact.trim()||p.personalization.verifiedFact!==p.verifiedFact||p.personalization.company!==p.company)return "Company and verified fact must exactly match source-packet personalization.";
  if(!sectorQuoteSupportsClaim(p,p.factSourceUrl,p.verifiedFact))return "Outbound factual claim must be an exact excerpt of its recorded official quote.";
  if(!sectorQuoteSupportsClaim(p,p.localFitSourceUrl,p.localFit))return "Coastal Bend fit must be an exact excerpt of its recorded official quote.";
  if(!/coastal bend|corpus christi|port aransas|rockport|aransas pass|ingleside|portland|robstown|kingsville|nueces|san patricio/i.test(p.localFit))return "Published Coastal Bend operating fit is required.";
  const remit=p.contactRole||"";
  const allowed:Record<SectorKey,RegExp>={tourism:/marketing|commercial|sales|owner|operator|business inquiries|partnership/i,real_estate:/marketing|development|broker|leadership|owner|business inquiries/i,industrial:/marketing|business development|commercial|recruit|executive|president|owner|business inquiries/i,healthcare:/marketing|practice admin|administration|recruit|leadership|business inquiries/i};
  if(!allowed[p.campaignKey].test(remit))return "Published business remit relevant to the sector is required.";
  const roleUrl=p.roleSourceUrl||p.emailSourceUrl,roleQuote=p.sources.filter(s=>s.url===roleUrl).map(s=>s.quote).join("\n");
  if(!official(roleUrl,p)||!allowed[p.campaignKey].test(roleQuote))return "Remit must be published on a related official source, not inferred from an inbox.";
  if(p.contactName){
    const identity=(text:string)=>text.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g,"");
    if(!identity(roleQuote).includes(identity(p.contactName))||!identity(roleQuote).includes(identity(remit))||p.personalization.greeting!==p.contactName.split(/\s+/)[0])return "Named contact and role must be source-backed; greeting cannot invent attribution.";
  }else if(p.personalization.greeting!==`${p.company} team`)return "General business email requires truthful exact company-team greeting.";
  if(p.phone&&(!p.phoneSourceUrl||!official(p.phoneSourceUrl,p)||!source(p.phoneSourceUrl)))return "Phone needs an official published source.";
  if(!p.proposedAngle.trim()||!p.proposedScenes.length||p.proposedScenes.some(s=>!s.trim()))return "Proposed story angle and scenes are required.";
  if(["industrial","healthcare"].includes(p.campaignKey)&&!/subject to (?:company |client |practice )?approval|proposed.{0,80}approval/i.test(p.evidenceNotes+" "+p.proposedAngle))return "Industrial/healthcare filming is proposed subject to approval, never already approved.";
  if(p.campaignKey==="healthcare"&&/patient testimonials?|patient footage|clinical outcome|cure|diagnos/i.test(p.proposedScenes.join(" ")+p.proposedAngle))return "Healthcare concept must avoid patient footage and clinical claims.";
  try{buildSectorSequence(p);}catch{return "Template-specific personalization is missing, unresolved or unsafe.";}
  return null;
}
export function readSectorEvidence(raw:string) {return sectorResearchRecordSchema.parse(JSON.parse(raw));}
