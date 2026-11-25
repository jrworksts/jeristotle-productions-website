import { and, eq } from 'drizzle-orm';
import { sectorOutreachGroups as G, sectorOutreachCampaigns as C, sectorOutreachProspects as P, sectorOutreachMessages as M, sectorOutreachEvents as E } from '../drizzle/schema';
import { SECTOR_GROUP_SLUG, SECTOR_VERSION, SECTOR_KEYS } from '../shared/sectorOutreach';
import { getDb } from './db';
export const SECTOR_POLICY_UPDATE_KEY='policy_update:coastal-bend-four-sector-outreach-2026:2026-11-05:per-campaign-new-seven-days';
// Immutable historical authorization. This is NOT the active ten-new/reserve-50 migration.
const HISTORICAL_DAILY_NEW_PER_CAMPAIGN = 5 as const;
const HISTORICAL_CAMPAIGN_IDS = { tourism: 1, real_estate: 2, industrial: 3, healthcare: 4 } as const;
/** CLI-only. Only the original inactive review policy may change; never approval, copy, recipients or schedules. */
export async function updateSectorDraftPolicy() {
 const db=await getDb();if(!db)throw new Error('Sector draft DB unavailable');
 return db.transaction(async tx=>{
  const [group]=await tx.select().from(G).where(eq(G.slug,SECTOR_GROUP_SLUG)).limit(1).for('update');
  if(!group||group.id!==1||group.status!=='review'||group.approvalAt!==null||group.sendingEnabled!==0||group.researchEnabled!==0||group.timeZone!=='America/Chicago'||group.followupBusinessDaysJson!=='[4,8]')throw new Error('Only the unapproved inactive four-sector review policy may be changed');
  const campaigns=await tx.select().from(C).where(eq(C.groupId,group.id));
  const prospects=await tx.select().from(P).where(eq(P.groupId,group.id));
  const messages=await tx.select().from(M).where(eq(M.groupId,group.id));
  const events=await tx.select().from(E).where(eq(E.groupId,group.id));
  if(campaigns.length!==4||SECTOR_KEYS.some(key=>campaigns.filter(c=>c.campaignKey===key&&c.id===HISTORICAL_CAMPAIGN_IDS[key]&&c.groupId===1&&c.status==='review'&&c.dailyNewLimit===HISTORICAL_DAILY_NEW_PER_CAMPAIGN).length!==1)||prospects.length||messages.length)throw new Error('Policy update requires four original five-new review campaigns and zero enrolled prospects or recipient messages');
  const existing=events.filter(e=>e.eventKey===SECTOR_POLICY_UPDATE_KEY);
  const current=group.policyVersion===SECTOR_VERSION&&group.totalDailyCap===null&&group.includesFollowups===0&&group.capScope==='per_campaign_new'&&group.sendSevenDays===1&&campaigns.every(c=>c.dailyNewLimit===HISTORICAL_DAILY_NEW_PER_CAMPAIGN);
  if(current){if(existing.length!==1)throw new Error('Updated policy lacks its exact audit; inspect without repeating writes');return {changed:false,groupId:group.id,eventKey:SECTOR_POLICY_UPDATE_KEY,policyVersion:SECTOR_VERSION,perCampaignNewLimit:HISTORICAL_DAILY_NEW_PER_CAMPAIGN,followupsAdditional:true,sendSevenDays:true,inactive:true};}
  if(existing.length||group.policyVersion!=='sector-draft-review-v1'||group.totalDailyCap!==5||group.includesFollowups!==1)throw new Error('Unexpected prior policy or audit; inspect without overwriting');
  const before={group,campaigns};
  await tx.update(G).set({totalDailyCap:null,includesFollowups:0,capScope:'per_campaign_new',sendSevenDays:1,policyVersion:SECTOR_VERSION}).where(eq(G.slug,SECTOR_GROUP_SLUG));
  for(const key of SECTOR_KEYS)await tx.update(C).set({dailyNewLimit:HISTORICAL_DAILY_NEW_PER_CAMPAIGN}).where(and(eq(C.groupId,group.id),eq(C.campaignKey,key)));
  await tx.insert(E).values({groupId:group.id,eventKey:SECTOR_POLICY_UPDATE_KEY,eventType:'policy_updated',detailJson:JSON.stringify({authorizedBy:'Jeremy Wells',authorization:'Five new contacts per day per campaign, follow-ups additional, seven days per week',before,after:{policyVersion:SECTOR_VERSION,capScope:'per_campaign_new',dailyNewLimits:Object.fromEntries(SECTOR_KEYS.map(key=>[key,HISTORICAL_DAILY_NEW_PER_CAMPAIGN])),totalDailyCap:null,includesFollowups:false,sendSevenDays:true,followupBusinessDays:[4,8]},noSends:true,noEnrollment:true,copyUnchanged:true,approvalAt:null,sendingEnabled:false,researchEnabled:false})});
  const [after]=await tx.select().from(G).where(eq(G.slug,SECTOR_GROUP_SLUG));
  const afterCampaigns=await tx.select().from(C).where(eq(C.groupId,group.id));
  const allowed=new Set(['totalDailyCap','includesFollowups','capScope','sendSevenDays','policyVersion','updatedAt']);
  for(const [key,value]of Object.entries(group))if(!allowed.has(key)&&JSON.stringify((after as any)[key])!==JSON.stringify(value))throw new Error('Unexpected group change; transaction rolled back');
  for(const c of campaigns){const a=afterCampaigns.find(r=>r.id===c.id)!;for(const [key,value]of Object.entries(c))if(!['dailyNewLimit','updatedAt'].includes(key)&&JSON.stringify((a as any)[key])!==JSON.stringify(value))throw new Error('Unexpected campaign change; transaction rolled back');}
  if(!after||after.policyVersion!==SECTOR_VERSION||after.totalDailyCap!==null||after.includesFollowups!==0||after.capScope!=='per_campaign_new'||after.sendSevenDays!==1||afterCampaigns.some(c=>c.dailyNewLimit!==HISTORICAL_DAILY_NEW_PER_CAMPAIGN))throw new Error('Policy readback mismatch; transaction rolled back');
  return {changed:true,groupId:group.id,eventKey:SECTOR_POLICY_UPDATE_KEY,policyVersion:SECTOR_VERSION,perCampaignNewLimit:HISTORICAL_DAILY_NEW_PER_CAMPAIGN,followupsAdditional:true,sendSevenDays:true,inactive:true};
 });
}
