import { eq, isNotNull, or } from 'drizzle-orm';
import { hustleProspects } from '../drizzle/schema';
import { normalizeTrainingBusiness, normalizeTrainingDomain, normalizeTrainingEmail } from '../shared/trainingOutreach';
import { getDb } from './db';
import { getSectorCampaignIdentityConflict } from './sectorCrossCampaignGuard';
export async function getHustleReservedRows(db:NonNullable<Awaited<ReturnType<typeof getDb>>>){
 const rows=await db.select({name:hustleProspects.name,domain:hustleProspects.organizationKey,email:hustleProspects.email}).from(hustleProspects).where(or(eq(hustleProspects.qualification,'qualified'),isNotNull(hustleProspects.firstSentAt),isNotNull(hustleProspects.stoppedAt))).limit(501);
 if(rows.length>500)throw new Error('Sponsorship identity guard overflow; no automatic sending.');return rows;
}
export function hustleReservedMatch(rows:Awaited<ReturnType<typeof getHustleReservedRows>>,input:{businessName?:string|null;domain?:string|null;email?:string|null}){
 const business=normalizeTrainingBusiness(input.businessName),domain=normalizeTrainingDomain(input.domain),email=normalizeTrainingEmail(input.email);
 return rows.some(r=>Boolean(business&&business===normalizeTrainingBusiness(r.name)||domain&&domain===r.domain||email&&email===normalizeTrainingEmail(r.email)));
}
export async function getHustleCampaignIdentityConflict(db:NonNullable<Awaited<ReturnType<typeof getDb>>>,input:{businessName?:string|null;domain?:string|null;email?:string|null}){
 return hustleReservedMatch(await getHustleReservedRows(db),input)?'Matching organization/contact is reserved in Corpus Christi Hustle sponsorship outreach.':getSectorCampaignIdentityConflict(db,input);
}
