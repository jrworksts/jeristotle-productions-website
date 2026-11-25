import { eq, isNotNull, or } from 'drizzle-orm';
import { sectorOutreachProspects } from '../drizzle/schema';
import { normalizeTrainingBusiness, normalizeTrainingDomain, normalizeTrainingEmail } from '../shared/trainingOutreach';
import { getDb } from './db';
type Database=NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function getSectorReservedRows(db:Database){
 const rows=await db.select({name:sectorOutreachProspects.company,website:sectorOutreachProspects.website,email:sectorOutreachProspects.email}).from(sectorOutreachProspects).where(or(eq(sectorOutreachProspects.qualification,'qualified'),isNotNull(sectorOutreachProspects.replyAt),isNotNull(sectorOutreachProspects.optoutAt),isNotNull(sectorOutreachProspects.bounceAt),isNotNull(sectorOutreachProspects.stoppedAt))).limit(1001);
 if(rows.length>1000)throw new Error('Sector identity guard overflow. Sending blocked; inspect.');
 return rows;
}
export function sectorReservedMatch(rows:Awaited<ReturnType<typeof getSectorReservedRows>>,input:{businessName?:string|null;domain?:string|null;email?:string|null}){
 const business=normalizeTrainingBusiness(input.businessName),domain=normalizeTrainingDomain(input.domain),email=normalizeTrainingEmail(input.email);
 return rows.some(r=>Boolean(business&&business===normalizeTrainingBusiness(r.name)||domain&&domain===normalizeTrainingDomain(r.website)||email&&email===normalizeTrainingEmail(r.email)));
}
export async function getSectorCampaignIdentityConflict(db:Database,input:{businessName?:string|null;domain?:string|null;email?:string|null}){
 return sectorReservedMatch(await getSectorReservedRows(db),input)?'Matching organization/contact is reserved in the four sector outreach campaigns.':null;
}
