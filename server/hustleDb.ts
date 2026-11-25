import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { hustleCampaigns, hustleProspects, hustleMessages, hustleEvents, hustleEpisodes, chamberOutreachProspects, chamberOutreachSuppressions, creditUnionProspects, brandVideoProspects, trainingOutreachProspects } from '../drizzle/schema';
import { getDb } from './db';
import { HUSTLE_SLUG, HUSTLE_VERSION, HUSTLE_LAUNCH_CONFIG_VERSION, HUSTLE_EPISODE_GOAL, HUSTLE_RESERVE_TARGET, HUSTLE_STOP_STAGES, hustlePacketSchema, isHustleContactQualified, hustleRequiresExactMessageReview, organizationKey, buildHustleSequence, type HustleResearch } from '../shared/hustleOutreach';
import { trainingIdentityAliases } from '../shared/trainingOutreach';
import { getSectorReservedRows } from './sectorCrossCampaignGuard';
import { isHustleSponsoredProspect, HUSTLE_SPONSORED_CONFIG_VERSION } from '../shared/hustleSponsoredReview';
export const HUSTLE_EXACT_MESSAGE_REVIEW_HOLD='Qualification verified under the November 15 policy. Exact recipient, message, footer and campaign approval remain required; no automatic preparation or sending.';
/** Fail closed: research approval is never a caller-supplied message approval. */
export function hustleStoredResearchRequiresMessageReview(p:{evidenceJson:string;recipientType?:string}) {
 if(isHustleSponsoredProspect(p))return true;
 try{return hustleRequiresExactMessageReview(hustleResearchSchemaRead(p.evidenceJson));}catch{return true;}
}
export async function hustleDatabase(){const db=await getDb();if(!db)throw new Error('Sponsorship database unavailable');return db;}
/** Strict SELECT-only preflight: unlike getHustleWorkspace, never calls ensure/seed/prepare. */
export async function readHustleLaunchState(db:any,lock=false){
 const cq=db.select().from(hustleCampaigns).where(eq(hustleCampaigns.slug,HUSTLE_SLUG));
 const [campaign]=await (lock?cq.for('update'):cq);
 if(!campaign)throw new Error('Existing Hustle campaign required; preflight never initializes records');
 const rows=async(table:any)=>{const q=db.select().from(table).where(eq(table.campaignId,campaign.id));return lock?q.for('update'):q;};
 const prospects=await rows(hustleProspects),messages=await rows(hustleMessages),episodes=await rows(hustleEpisodes),events=await rows(hustleEvents);
 return {campaign,prospects,messages,episodes,events};
}
export function hustleStoredEvidenceMatches(p:any,e:HustleResearch){
 return ['name','website','category','recipientType','contactName','contactTitle','localEvidence','localSourceUrl','emailSourceUrl','emailSourceQuote','roleSourceUrl','phone','phoneSourceUrl'].every(k=>p[k]===(e as any)[k])&&p.email===e.email?.toLowerCase()&&p.organizationKey===organizationKey(e);
}
export async function ensureHustleCampaign(){
  const db=await hustleDatabase();
  await db.insert(hustleCampaigns).ignore().values({slug:HUSTLE_SLUG,status:'review',configVersion:HUSTLE_VERSION,episodeGoal:HUSTLE_EPISODE_GOAL});
  const [campaign]=await db.select().from(hustleCampaigns).where(eq(hustleCampaigns.slug,HUSTLE_SLUG));
  if(!campaign)throw new Error('Sponsorship campaign missing');
  await db.insert(hustleEpisodes).ignore().values(Array.from({length:24},(_,i)=>({campaignId:campaign.id,seasonYear:2027,episodeNumber:i+1,status:'unassigned'})));
  return campaign;
}
export async function getHustleExclusions(database?:Awaited<ReturnType<typeof hustleDatabase>>){
 const db=database??await hustleDatabase();
 const [chamber,credit,brand,training,suppressions]=await Promise.all([
 db.select({businessName:chamberOutreachProspects.businessName,website:chamberOutreachProspects.website,email:chamberOutreachProspects.email}).from(chamberOutreachProspects),
 db.select({businessName:creditUnionProspects.creditUnionName,website:creditUnionProspects.website,email:creditUnionProspects.primaryEmail}).from(creditUnionProspects),
 db.select({businessName:brandVideoProspects.businessName,website:brandVideoProspects.website,email:brandVideoProspects.primaryEmail}).from(brandVideoProspects),
 db.select({businessName:trainingOutreachProspects.businessName,website:trainingOutreachProspects.website,email:trainingOutreachProspects.primaryEmail}).from(trainingOutreachProspects),
 db.select().from(chamberOutreachSuppressions)]);
 const sectors=(await getSectorReservedRows(db)).map(r=>({businessName:r.name,website:r.website,email:r.email}));
 return {chamber,credit,brand,training,suppressions,sectors};
}
export function hustleConflictReason(p:HustleResearch,ex:Awaited<ReturnType<typeof getHustleExclusions>>){
 if(/coast\s*life/i.test(p.name)||/coastlifecu\./i.test(p.website))return 'Protected CoastLife client/contract conversation. No cold sequence.';
 if(/\bfrost\b/i.test(p.name)||/frostbank\./i.test(p.website))return 'Jeremy already sent Aaron a Frost proposal. Marketing introduction requires owner coordination; no duplicate cold sequence.';
 const aliases=new Set(trainingIdentityAliases({businessName:p.name,website:p.website,email:p.email}));
 const publicMailDomains=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','yahoo.com','aol.com','icloud.com','live.com','msn.com','proton.me','protonmail.com']);
 const institutionalEmailDomain=(email:string|null|undefined)=>{const domain=email?.toLowerCase().split('@')[1];return domain&&!publicMailDomains.has(domain)?domain:null;};
 const domains=new Set([organizationKey(p),institutionalEmailDomain(p.email)].filter(Boolean));
 for(const key of ['chamber','credit','brand','training'] as const)for(const row of ex[key])if(trainingIdentityAliases(row).some(x=>aliases.has(x))||Boolean(institutionalEmailDomain(row.email)&&domains.has(institutionalEmailDomain(row.email))))return `Organization/contact already recorded in ${key} outreach. Preserve existing history; coordinate before any additional sequence.`;
 for(const row of ex.sectors??[])if(trainingIdentityAliases(row).some(x=>aliases.has(x)))return 'Organization/contact is reserved in sector outreach. Preserve the existing sequence.';
 if(ex.suppressions.some(r=>r.email.toLowerCase()===p.email?.toLowerCase()))return 'Shared outreach suppression applies.';
 return null;
}
export async function getHustleWorkspace(){
 const campaign=await ensureHustleCampaign(),db=await hustleDatabase();
 const [prospects,messages,events,episodes]=await Promise.all([db.select().from(hustleProspects).where(eq(hustleProspects.campaignId,campaign.id)),db.select().from(hustleMessages).where(eq(hustleMessages.campaignId,campaign.id)),db.select().from(hustleEvents).where(eq(hustleEvents.campaignId,campaign.id)),db.select().from(hustleEpisodes).where(eq(hustleEpisodes.campaignId,campaign.id))]);
 const ready=messages.filter(m=>m.sequenceStep===0&&m.status==='approved'&&!m.attemptedAt&&!m.claimToken&&prospects.some(p=>p.id===m.prospectId&&p.qualification==='qualified'&&!p.firstSentAt&&!p.stoppedAt&&!hustleStoredResearchRequiresMessageReview(p))).length;
 const signedStock=campaign.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION?await (await import('./hustleSponsoredReviewDb')).readHustleSponsoredReadyStock(db,campaign,prospects,messages):null;
 const {researchWebhookUrl,...safeCampaign}=campaign;
 return {campaign:{...safeCampaign,researchConnected:Boolean(researchWebhookUrl)},prospects,messages,events:events.slice(-100),episodes,health:{readyInitialCount:signedStock?signedStock.readyInitialCount:ready,target:signedStock?.target??HUSTLE_RESERVE_TARGET,signedPolicyVerified:signedStock?.verified??false,signedDispatchBlocked:signedStock?.dispatchBlocked??false,qualified:prospects.filter(p=>p.qualification==='qualified').length,holds:prospects.filter(p=>p.qualification!=='qualified').length,smtpAccepted:messages.filter(m=>m.smtpAcceptedAt).length}};
}
export type HustleResearchOwner={incident:string;requestToken:string;requestedAt:string;ownerToken:string};
export function hustleLeaseMatches(c:{researchRequestedAt:Date|null;researchLeaseUntil:Date|null},lease:HustleResearchOwner & {expiresAt:number}){
 return c.researchRequestedAt?.toISOString()===lease.requestedAt&&c.researchLeaseUntil?.getTime()===lease.expiresAt;
}
export async function requireHustleResearchOwner(tx:any,c:any,owner:HustleResearchOwner,now=new Date(),allowExpired=false){
 const [request]=await tx.select().from(hustleEvents).where(and(eq(hustleEvents.campaignId,c.id),eq(hustleEvents.eventKey,owner.incident),eq(hustleEvents.eventType,'research_requested')));
 const [claim]=await tx.select().from(hustleEvents).where(and(eq(hustleEvents.campaignId,c.id),eq(hustleEvents.eventKey,owner.incident+':claim'),eq(hustleEvents.eventType,'research_lease')));
 if(!request||!claim)throw new Error('Real research request and owned claim required');
 const r=JSON.parse(request.detailJson),lease=JSON.parse(claim.detailJson);
 if(!owner.ownerToken||!owner.requestToken||r.incident!==owner.incident||r.requestToken!==owner.requestToken||r.requestedAt!==owner.requestedAt||lease.incident!==owner.incident||lease.requestToken!==owner.requestToken||lease.requestedAt!==owner.requestedAt||lease.ownerToken!==owner.ownerToken)throw new Error('Research ownership mismatch');
 const [finished]=await tx.select().from(hustleEvents).where(eq(hustleEvents.eventKey,owner.incident+':finish'));
 if(!allowExpired&&(finished||lease.expiresAt<=now.getTime()||!hustleLeaseMatches(c,lease)))throw new Error('Research claim finished, expired or superseded');
 return {lease,finished};
}
export async function importHustleResearch(value:unknown,apply=false,authorization?:{mode:'setup'}|({mode:'automated'} & HustleResearchOwner)){
 const packet=hustlePacketSchema.parse(value);const hash=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
 const ex=await getHustleExclusions();const db=await hustleDatabase();
 const [campaign]=await db.select().from(hustleCampaigns).where(eq(hustleCampaigns.slug,HUSTLE_SLUG));
 if(!campaign)throw new Error('Initialize fixed campaign before preview');
 const seen=new Set<string>();
 const staged=packet.prospects.map(p=>{
  const key=organizationKey(p);if(seen.has(key))throw new Error('Duplicate institution domain in packet: '+key);seen.add(key);
  const evidence={...p,verifiedOn:packet.checkedOn};
  const holdReason=hustleConflictReason(evidence,ex)||(isHustleContactQualified(evidence)?null:'Current unrestricted marketing email, role or local evidence is incomplete, stale or future-dated.');
  const exactMessageReviewRequired=!holdReason&&hustleRequiresExactMessageReview(evidence);
  return {p:evidence,key,holdReason,exactMessageReviewRequired,qualification:holdReason?'review':'qualified'};
 });
 const preview={packetHash:hash,total:staged.length,qualified:staged.filter(r=>!r.holdReason).length,held:staged.filter(r=>r.holdReason).map(r=>({name:r.p.name,reason:r.holdReason})),exactMessageReviewRequired:staged.filter(r=>r.exactMessageReviewRequired).map(r=>({name:r.p.name,reason:HUSTLE_EXACT_MESSAGE_REVIEW_HOLD})),noSends:true};
 if(!apply)return preview;
 return db.transaction(async tx=>{
  const [c]=await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
  if(!c||c.configVersion!==(c.status==='active'?HUSTLE_LAUNCH_CONFIG_VERSION:HUSTLE_VERSION))throw new Error('Fixed research campaign missing or version changed');
  if(authorization?.mode==='setup'){if(c.status!=='review')throw new Error('Explicit setup import allowed only in review; no SMTP');}
  else if(authorization?.mode==='automated'){
   if(c.status!=='active'||!c.launchApprovedAt)throw new Error('Automated import requires active approved campaign');
   await requireHustleResearchOwner(tx,c,authorization);
  }else throw new Error('Explicit setup mode or owned automated claim required for import');
  const key='research-import:'+hash;
  const [receipt]=await tx.select().from(hustleEvents).where(eq(hustleEvents.eventKey,key));
  if(receipt)return {...preview,alreadyRecorded:true,added:0,updated:0};
  let added=0,updated=0;const skipped:string[]=[];
  for(const row of staged){
   const [old]=await tx.select().from(hustleProspects).where(and(eq(hustleProspects.campaignId,campaign.id),eq(hustleProspects.organizationKey,row.key))).for('update');
   if(old){
    const messages=await tx.select().from(hustleMessages).where(eq(hustleMessages.prospectId,old.id));
    if(old.firstSentAt||old.stoppedAt||old.manualNotes||old.qualification==='qualified'||old.stage!=='identified'||messages.some(m=>m.attemptedAt||m.claimToken||m.smtpAcceptedAt||m.scheduledAt)){skipped.push(old.name);continue;}
    await tx.update(hustleProspects).set({...researchColumns(row.p),qualification:row.qualification,holdReason:row.holdReason||(row.exactMessageReviewRequired?HUSTLE_EXACT_MESSAGE_REVIEW_HOLD:null)}).where(eq(hustleProspects.id,old.id));updated++;
   }else{
    await tx.insert(hustleProspects).values({campaignId:campaign.id,organizationKey:row.key,...researchColumns(row.p),qualification:row.qualification,holdReason:row.holdReason||(row.exactMessageReviewRequired?HUSTLE_EXACT_MESSAGE_REVIEW_HOLD:null),unsubscribeToken:randomBytes(24).toString('hex'),stage:'identified'});added++;
   }
  }
  await tx.insert(hustleEvents).values({campaignId:campaign.id,eventKey:key,eventType:'research_import',detailJson:JSON.stringify({...preview,added,updated,skipped,checkedOn:packet.checkedOn,coverageNotes:packet.coverageNotes})});
  return {...preview,added,updated,skipped};
 });
}
function researchColumns(p:HustleResearch){return {name:p.name,website:p.website,category:p.category,localEvidence:p.localEvidence,localSourceUrl:p.localSourceUrl,contactName:p.contactName,contactTitle:p.contactTitle,recipientType:p.recipientType,email:p.email?.toLowerCase()||null,emailSourceUrl:p.emailSourceUrl,emailSourceQuote:p.emailSourceQuote,roleSourceUrl:p.roleSourceUrl,phone:p.phone,phoneSourceUrl:p.phoneSourceUrl,evidenceJson:JSON.stringify(p)};}
export async function prepareHustleReserve(){
 const campaign=await ensureHustleCampaign(),db=await hustleDatabase();let prepared=0;
 const ex=await getHustleExclusions();
 const all=await db.select().from(hustleProspects).where(and(eq(hustleProspects.campaignId,campaign.id),eq(hustleProspects.qualification,'qualified')));
 const existing=await db.select().from(hustleMessages).where(eq(hustleMessages.campaignId,campaign.id));
 let ready=existing.filter(m=>m.sequenceStep===0&&m.status==='approved'&&!m.claimToken&&!m.attemptedAt&&all.some(p=>p.id===m.prospectId&&!p.firstSentAt&&!p.stoppedAt&&!hustleStoredResearchRequiresMessageReview(p))).length;
 for(const p of all){if(ready>=HUSTLE_RESERVE_TARGET)break;if(isHustleSponsoredProspect(p)||p.firstSentAt||p.stoppedAt||(HUSTLE_STOP_STAGES as readonly string[]).includes(p.stage))continue;
  const evidence=hustleResearchSchemaRead(p.evidenceJson);if(hustleRequiresExactMessageReview(evidence)||hustleConflictReason(evidence,ex)||!isHustleContactQualified(evidence))continue;
  if(existing.some(m=>m.prospectId===p.id))continue;
  await db.transaction(async tx=>{
   const [c]=await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
   if(!c||c.configVersion!==(c.status==='active'?HUSTLE_LAUNCH_CONFIG_VERSION:HUSTLE_VERSION)||!['active','review'].includes(c.status)||(c.status==='active'&&!c.launchApprovedAt))return;
   const [fresh]=await tx.select().from(hustleProspects).where(eq(hustleProspects.id,p.id)).for('update');
   if(!fresh||isHustleSponsoredProspect(fresh)||fresh.campaignId!==c.id||fresh.qualification!=='qualified'||fresh.firstSentAt||fresh.stoppedAt||fresh.stage!=='identified')return;
   const current=hustleResearchSchemaRead(fresh.evidenceJson);
   if(hustleRequiresExactMessageReview(current)||fresh.holdReason||fresh.manualNotes||!hustleStoredEvidenceMatches(fresh,current)||!isHustleContactQualified(current)||hustleConflictReason(current,ex))return;
   const prior=await tx.select().from(hustleMessages).where(eq(hustleMessages.prospectId,p.id));if(prior.length)return;
   await tx.insert(hustleMessages).values(buildHustleSequence(fresh).map(m=>({campaignId:campaign.id,prospectId:p.id,sequenceStep:m.sequenceStep,subject:m.subject,textBody:m.textBody,status:'approved'})));
   await tx.update(hustleProspects).set({stage:'ready'}).where(eq(hustleProspects.id,p.id));prepared++;ready++;
  });
 }
 return {prepared,readyInitialCount:ready,target:HUSTLE_RESERVE_TARGET,noSends:true};
}
export function hustleResearchSchemaRead(raw:string){return hustlePacketSchema.shape.prospects.element.parse(JSON.parse(raw));}
export async function stopHustleProspect(id:number,stage:string,detail:string){
 const db=await hustleDatabase(),campaign=await ensureHustleCampaign();
 return db.transaction(async tx=>{
 await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
 const [p]=await tx.select().from(hustleProspects).where(and(eq(hustleProspects.id,id),eq(hustleProspects.campaignId,campaign.id))).for('update');if(!p)return false;
 const stoppedAt=p.stoppedAt||new Date();
 await tx.update(hustleProspects).set({stage,stoppedAt}).where(eq(hustleProspects.id,id));
 const messages=await tx.select().from(hustleMessages).where(eq(hustleMessages.prospectId,id)).for('update');
 for(const m of messages)if(!m.attemptedAt&&!m.smtpAcceptedAt&&['approved','draft','claimed'].includes(m.status))await tx.update(hustleMessages).set({status:'cancelled'}).where(eq(hustleMessages.id,m.id));
 const eventKey=`stop:${id}:${createHash('sha256').update(stage+detail).digest('hex').slice(0,40)}`;
 await tx.insert(hustleEvents).ignore().values({campaignId:campaign.id,prospectId:id,eventKey,eventType:stage,detailJson:JSON.stringify({detail,previousStage:p.stage,stage,stoppedAt:stoppedAt.toISOString(),noSends:true})});
 return true;
 });
}
export async function updateHustleTracking(input:{id:number;stage?:string;manualNotes?:string}){
 const db=await hustleDatabase(),campaign=await ensureHustleCampaign();
 if(input.stage && (HUSTLE_STOP_STAGES as readonly string[]).includes(input.stage))await stopHustleProspect(input.id,input.stage,'Owner recorded pipeline outcome; automated follow-ups stopped.');
 if(input.manualNotes!==undefined)await db.transaction(async tx=>{
  await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
  const [p]=await tx.select().from(hustleProspects).where(and(eq(hustleProspects.id,input.id),eq(hustleProspects.campaignId,campaign.id))).for('update');
  if(!p||p.manualNotes===input.manualNotes)return;
  await tx.insert(hustleEvents).ignore().values({campaignId:campaign.id,prospectId:p.id,eventKey:`owner-notes:${p.id}:${createHash('sha256').update(JSON.stringify([p.manualNotes,input.manualNotes])).digest('hex').slice(0,40)}`,eventType:'owner_notes_transition',detailJson:JSON.stringify({previousNotes:p.manualNotes,notes:input.manualNotes,noSends:true})});
  await tx.update(hustleProspects).set({manualNotes:input.manualNotes}).where(eq(hustleProspects.id,p.id));
 });
 return {success:true};
}
export async function assignHustleEpisode(input:{episodeNumber:number;prospectId:number;notes:string}){
 const campaign=await ensureHustleCampaign(),db=await hustleDatabase();
 return db.transaction(async tx=>{
  await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
  const [episode]=await tx.select().from(hustleEpisodes).where(and(eq(hustleEpisodes.campaignId,campaign.id),eq(hustleEpisodes.seasonYear,2027),eq(hustleEpisodes.episodeNumber,input.episodeNumber))).for('update');
  if(!episode)throw new Error('2027 episode slot not found');
  if(episode.sponsorProspectId && episode.sponsorProspectId!==input.prospectId)throw new Error('Episode already has a sponsor. Resolve existing assignment before replacing.');
  const [p]=await tx.select().from(hustleProspects).where(and(eq(hustleProspects.id,input.prospectId),eq(hustleProspects.campaignId,campaign.id))).for('update');
  if(!p)throw new Error('Sponsor is not in this campaign');
  await tx.update(hustleEpisodes).set({sponsorProspectId:p.id,status:'reserved',notes:input.notes}).where(eq(hustleEpisodes.id,episode.id));
  await tx.update(hustleProspects).set({stage:'held',stoppedAt:p.stoppedAt||new Date()}).where(eq(hustleProspects.id,p.id));
  const messages=await tx.select().from(hustleMessages).where(eq(hustleMessages.prospectId,p.id)).for('update');
  for(const m of messages)if(!m.attemptedAt&&!m.smtpAcceptedAt&&['approved','draft','claimed'].includes(m.status))await tx.update(hustleMessages).set({status:'cancelled'}).where(eq(hustleMessages.id,m.id));
  await tx.insert(hustleEvents).ignore().values({campaignId:campaign.id,prospectId:p.id,eventKey:`episode:${episode.id}:sponsor:${p.id}:${createHash('sha256').update(input.notes).digest('hex').slice(0,32)}`,eventType:'episode_assignment',detailJson:JSON.stringify({episodeNumber:input.episodeNumber,previousStatus:episode.status,previousNotes:episode.notes,previousStage:p.stage,notes:input.notes,coldSequenceStopped:true,noSends:true})});
  return {success:true,status:'reserved',notASignedAgreement:true};
 });
}
