import { withOutreachDeadline, authenticateOutreach, outreachDeadline, outreachDeadlineCheck, outreachFailureDiagnostic, outreachPhase, OUTREACH_PERSISTENCE_BUDGET_MS } from "./outreachDeadline";
import { randomBytes } from 'node:crypto';
import { and, eq, desc, isNull } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { hustleCampaigns, hustleMessages, hustleProspects, hustleEvents, hustleEpisodes } from '../drizzle/schema';
import { HUSTLE_SLUG, HUSTLE_LAUNCH_CONFIG_VERSION, HUSTLE_DAILY_NEW_LIMIT, HUSTLE_RESERVE_TARGET, HUSTLE_EPISODE_GOAL, HUSTLE_SEQUENCE_DELAYS, isHustleContactQualified, hustleRequiresExactMessageReview, isHustleCanonicalMessage } from '../shared/hustleOutreach';
import { getOutreachLocalMoment, getNextFollowupAt } from '../shared/outreachSchedule';
import { isOutreachResearchWindow } from '../shared/outreachResearchWindow';
import { OUTREACH_INITIAL_REFILL_START_BELOW, OUTBOUND_REPLENISHMENT_MAX_REQUESTS_PER_DAY, OUTBOUND_REPLENISHMENT_COOLDOWN_MS } from '../shared/outboundReplenishmentPolicy';
import { shouldRefillInitialReserve } from '../shared/outreachReserveRefill';
import { sdk } from './_core/sdk';
import { buildHustleEmail, sendHustleEmail, hustleEmailTransportConfigured, HUSTLE_SMTP_DEADLINE_MS } from './hustleEmail';
import { hustleDatabase, getHustleWorkspace, getHustleExclusions, hustleConflictReason, hustleResearchSchemaRead, hustleStoredEvidenceMatches, prepareHustleReserve } from './hustleDb';
import { checkHustleInbox } from './hustleInbox';
import { HUSTLE_SPONSORED_CONFIG_VERSION, HUSTLE_SPONSORED_POLICY, HUSTLE_SPONSORED_HEADERS, isHustleSponsoredProspect, sponsoredAuthorizationMatches, getHustleSponsoredPayload, getHustleSponsoredFollowupAt, type HustleSponsoredAuthorization } from '../shared/hustleSponsoredReview';
import { readHustleSponsoredAuthorization, getHustleSponsoredCampaignPolicy } from './hustleSponsoredReviewDb';
import { JERISTOTLE_EMAIL } from '../shared/const';
import { readHustleTaskFirstBatchManifest, readHustleTaskFirstBatchExecutionScope } from './hustleTaskFirstBatch';

type TaskOperation = { grant: unknown; reviewId: string; reviewHash: string; continuationStepId?: number };

export function hustleSendMoment(now:Date){const m=getOutreachLocalMoment(now);return {...m,maintenance:m.hour>=8&&m.hour<17,send:m.hour>=9&&m.hour<17};}
// Dedicated Hustle transport owns and hard-aborts its connection at an absolute 5s deadline.
// Legacy inquiry/other campaign transports remain unchanged.
export const HUSTLE_SMTP_BUDGET_MS=HUSTLE_SMTP_DEADLINE_MS;
export const HUSTLE_PERSISTENCE_BUDGET_MS=OUTREACH_PERSISTENCE_BUDGET_MS;
export function hustleHasSendBudget(deadline:number,now=Date.now(),smtpBudget=HUSTLE_SMTP_BUDGET_MS){return Number.isFinite(deadline)&&Number.isFinite(now)&&Number.isFinite(smtpBudget)&&smtpBudget>0&&deadline-now>=smtpBudget+HUSTLE_PERSISTENCE_BUDGET_MS;}
type Campaign=typeof hustleCampaigns.$inferSelect;
type Prospect=typeof hustleProspects.$inferSelect;
type Message=typeof hustleMessages.$inferSelect;
type Exclusions=Awaited<ReturnType<typeof getHustleExclusions>>;
async function readHustleSponsoredCampaignPolicy(db:any,c:Campaign,now:Date){
 const events=await db.select().from(hustleEvents).where(eq(hustleEvents.campaignId,c.id)).limit(100001);
 if(events.length>100000||!Number.isFinite(now.getTime()))return null;
 return getHustleSponsoredCampaignPolicy(c,events,now);
}
export function hustleCampaignAuthorized(c:Campaign|undefined,taskUid:string,signedPolicy=false){return Boolean(c&&c.id===1&&c.slug===HUSTLE_SLUG&&((c.configVersion===HUSTLE_LAUNCH_CONFIG_VERSION&&c.episodeGoal===24)||(signedPolicy&&c.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION&&c.episodeGoal===12))&&taskUid&&c.schedulerTaskUid===taskUid&&c.status==='active'&&c.launchApprovedAt&&Number.isFinite(c.launchApprovedAt.getTime())&&c.launchApprovedAt<=new Date());}
export function hustleMessageEligible(input:{campaign:Campaign|undefined;prospect:Prospect|undefined;message:Message|undefined;previous?:Message;taskUid:string;token?:string;phase:'claim'|'attempt';now:Date;deadline:number;episodes:Array<{sponsorProspectId:number|null;seasonYear:number}>;exclusions:Exclusions;smtpBudget?:number;signedPolicy?:boolean;authorization?:HustleSponsoredAuthorization|null}){
 const {campaign:c,prospect:p,message:m,previous,now}=input;
 const sponsored=p?isHustleSponsoredProspect(p):false;
 if(!hustleCampaignAuthorized(c,input.taskUid,input.signedPolicy)||!c||!p||!m||!hustleHasSendBudget(input.deadline,now.getTime(),input.smtpBudget)||!hustleSendMoment(now).send)return false;
 if(input.episodes.filter(e=>e.seasonYear===2027&&e.sponsorProspectId!==null).length>=(sponsored?HUSTLE_SPONSORED_POLICY.episodeGoal:HUSTLE_EPISODE_GOAL)||input.episodes.some(e=>e.seasonYear===2027&&e.sponsorProspectId===p.id))return false;
 if(p.campaignId!==c.id||m.campaignId!==c.id||m.prospectId!==p.id||p.qualification!=='qualified'||p.holdReason||p.manualNotes||p.stoppedAt||!p.email||m.attemptedAt||m.smtpAcceptedAt||m.sequenceStep<0||m.sequenceStep>2||(!sponsored&&!isHustleCanonicalMessage(p,m)))return false;
 if(input.phase==='claim'?(m.status!=='approved'||Boolean(m.claimToken)):(m.status!=='claimed'||!input.token||m.claimToken!==input.token||!m.providerMessageId))return false;
 if(sponsored){if(!sponsoredAuthorizationMatches({authorization:input.authorization??null,campaign:c,prospect:p,message:m,now}))return false;}
 else {try{const evidence=hustleResearchSchemaRead(p.evidenceJson);if(hustleRequiresExactMessageReview(evidence)||!hustleStoredEvidenceMatches(p,evidence)||!isHustleContactQualified(evidence,undefined,now)||hustleConflictReason(evidence,input.exclusions))return false;}catch{return false;}}
 if(input.signedPolicy&&!sponsored&&m.sequenceStep===0)return false; // Unseen old-season initials are not grandfathered.
 if(m.sequenceStep===0)return p.stage==='ready'&&!p.firstSentAt&&(!m.scheduledAt||m.scheduledAt<=now);
 if(p.stage!=='contacted'||!p.firstSentAt||p.firstSentAt>now||!m.scheduledAt||m.scheduledAt>now||!previous)return false;
 if(previous.campaignId!==c.id||previous.prospectId!==p.id||previous.sequenceStep!==m.sequenceStep-1||previous.status!=='sent'||!previous.attemptedAt||!previous.smtpAcceptedAt||previous.smtpAcceptedAt>now||!previous.providerMessageId)return false;
 return (sponsored?getHustleSponsoredFollowupAt(previous.smtpAcceptedAt,m.sequenceStep as 1|2):getNextFollowupAt(previous.smtpAcceptedAt,HUSTLE_SEQUENCE_DELAYS[m.sequenceStep],9))<=now;
}
export async function claimHustleMessage(input:{campaignId:number;prospectId:number;messageId:number;token:string;providerId:string;taskUid:string;deadline:number;phase:'claim'|'attempt';exclusions:Exclusions;taskOperation?:TaskOperation}){
 if(!hustleHasSendBudget(input.deadline))return null;
 const db=await hustleDatabase();return db.transaction(async tx=>{
  const [c]=await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,input.campaignId)).for('update');
  if(input.taskOperation){
   const plan=await readHustleTaskFirstBatchExecutionScope(tx,input.taskOperation.grant,new Date(),input.taskOperation.continuationStepId);
   if(!plan||plan.reviewId!==input.taskOperation.reviewId||plan.reviewHash!==input.taskOperation.reviewHash||plan.canonicalSchedulerTaskUid!==input.taskUid||!plan.initialMessageIds.includes(input.messageId))return null;
  }else if(['2026-11-18','2026-11-19'].includes(getOutreachLocalMoment(new Date()).dateKey)){
   const reserved=await readHustleTaskFirstBatchManifest(tx,new Date());
   if(reserved?.initialMessageIds.includes(input.messageId))return null;
  }
  const episodes=await tx.select().from(hustleEpisodes).where(eq(hustleEpisodes.campaignId,input.campaignId));
  const [fresh]=await tx.select().from(hustleProspects).where(eq(hustleProspects.id,input.prospectId)).for('update');
  const [msg]=await tx.select().from(hustleMessages).where(eq(hustleMessages.id,input.messageId)).for('update');
  const [previous]=msg?.sequenceStep?await tx.select().from(hustleMessages).where(and(eq(hustleMessages.campaignId,input.campaignId),eq(hustleMessages.prospectId,input.prospectId),eq(hustleMessages.sequenceStep,msg.sequenceStep-1))).for('update'):[];
  if(!fresh||fresh.stoppedAt||!msg||msg.attemptedAt)return null;
  if(input.phase==='attempt'&&msg.providerMessageId!==input.providerId)return null;
  const signedPolicy=c?.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION?Boolean(await readHustleSponsoredCampaignPolicy(tx,c,new Date())):false;
  const authorization=isHustleSponsoredProspect(fresh)?await readHustleSponsoredAuthorization(tx,c,fresh,msg,new Date(),{taskGrant:input.taskOperation?.grant}):null;
  // The verified authorization reader rechecks complete locked identities and inbox coverage.
  if(!hustleMessageEligible({campaign:c,prospect:fresh,message:msg,previous,signedPolicy,authorization,taskUid:input.taskUid,token:input.token,phase:input.phase,now:new Date(),deadline:input.deadline,episodes,exclusions:input.exclusions}))return null;
  const attempted=await tx.select().from(hustleMessages).where(eq(hustleMessages.campaignId,input.campaignId));
  const day=getOutreachLocalMoment(new Date()).dateKey;
  const used=attempted.filter(m=>m.sequenceStep===0&&((m.attemptedAt&&getOutreachLocalMoment(m.attemptedAt).dateKey===day)||(m.smtpAcceptedAt&&getOutreachLocalMoment(m.smtpAcceptedAt).dateKey===day)||(!m.attemptedAt&&m.claimToken&&m.id!==msg.id))).length;
  const newLimit=signedPolicy?HUSTLE_SPONSORED_POLICY.dailyNewLimit:HUSTLE_DAILY_NEW_LIMIT;
  if(msg.sequenceStep===0&&used>=newLimit)return null;
  outreachDeadlineCheck(HUSTLE_SMTP_BUDGET_MS+HUSTLE_PERSISTENCE_BUDGET_MS);
  if(input.phase==='claim')await tx.update(hustleMessages).set({status:'claimed',claimToken:input.token,providerMessageId:input.providerId}).where(eq(hustleMessages.id,msg.id));
  else await tx.update(hustleMessages).set({attemptedAt:new Date()}).where(eq(hustleMessages.id,msg.id));
  return {prospect:fresh,message:msg,previous,authorization};
 });
}
export async function requestHustleResearch(now=new Date(),deadline=Date.now()+80000){
 if(!isOutreachResearchWindow(now))return {requested:false,reason:'outside-central-research-window'};
 const db=await hustleDatabase();
 const w=await getHustleWorkspace();if(w.health.readyInitialCount>=HUSTLE_RESERVE_TARGET)return {requested:false,reason:'reserve-full'};
 const [finish]=await db.select({detailJson:hustleEvents.detailJson}).from(hustleEvents).where(and(eq(hustleEvents.campaignId,w.campaign.id),eq(hustleEvents.eventType,'research_completed'))).orderBy(desc(hustleEvents.occurredAt)).limit(1);
 const completed=finish?JSON.parse(finish.detailJson):null;
 if(!shouldRefillInitialReserve(w.health.readyInitialCount,completed))return {requested:false,reason:'reserve-sufficient-no-active-refill'};
 const request=await db.transaction(async tx=>{
  const [c]=await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.slug,HUSTLE_SLUG)).for('update');
  if(Date.now()+15000+HUSTLE_PERSISTENCE_BUDGET_MS>deadline||!c||!c.schedulerTaskUid||!hustleCampaignAuthorized(c,c.schedulerTaskUid)||!c.researchWebhookUrl||c.researchLeaseUntil&&c.researchLeaseUntil>now)return null;
  const day=getOutreachLocalMoment(now).dateKey;
  const prior=await tx.select().from(hustleEvents).where(and(eq(hustleEvents.campaignId,c.id),eq(hustleEvents.eventType,'research_requested')));
  const count=prior.filter(e=>getOutreachLocalMoment(e.occurredAt).dateKey===day).length;
  if(count>=OUTBOUND_REPLENISHMENT_MAX_REQUESTS_PER_DAY||c.researchRequestedAt&&now.getTime()-c.researchRequestedAt.getTime()<OUTBOUND_REPLENISHMENT_COOLDOWN_MS)return null;
  const incident=`hustle-low-supply:${day}:${count+1}`,requestToken=randomBytes(24).toString('hex');
  // MySQL timestamps have second precision; store exactly the same timestamp in ownership metadata.
  const requestedAt=new Date(Math.floor(now.getTime()/1000)*1000),expiresAt=requestedAt.getTime()+6*60*60*1000;
  const payload={kind:'hustle_low_supply',campaign:HUSTLE_SLUG,incident,requestToken,requestedAt:requestedAt.toISOString(),expiresAt,readyCount:w.health.readyInitialCount,target:HUSTLE_RESERVE_TARGET,refillThreshold:OUTREACH_INITIAL_REFILL_START_BELOW,noSends:true};
  await tx.update(hustleCampaigns).set({researchRequestedAt:requestedAt,researchLeaseUntil:new Date(expiresAt)}).where(eq(hustleCampaigns.id,c.id));
  await tx.insert(hustleEvents).values({campaignId:c.id,eventKey:incident,eventType:'research_requested',detailJson:JSON.stringify(payload)});
  return {campaignId:c.id,url:c.researchWebhookUrl,payload};
 });
 if(!request)return {requested:false,reason:'not-active-connected-or-research-bound'};
 try{
  if(Date.now()+15000+HUSTLE_PERSISTENCE_BUDGET_MS>deadline)throw new Error('Request deadline');
  const result=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.payload),signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new Error('Unconfirmed request');
  return {requested:true,incident:request.payload.incident};
 }catch{
  // Keep the lease on all ambiguous HTTP outcomes. Never expose the private URL or auto retry.
  await db.insert(hustleEvents).ignore().values({campaignId:request.campaignId,eventKey:request.payload.incident+':error',eventType:'research_request_failed',detailJson:JSON.stringify({incident:request.payload.incident,requestToken:request.payload.requestToken,requestedAt:request.payload.requestedAt,reason:'Request failed or uncertain; preserve lease and inspect. No automatic retry.',noSends:true})});
  return {requested:false,inspectionRequired:true,incident:request.payload.incident};
 }
}
export function hustleEmailFor(p:Prospect,m:Message,providerId:string,previous?:Message,authorization?:HustleSponsoredAuthorization|null){
 if(isHustleSponsoredProspect(p)){
  if(!authorization||!sponsoredAuthorizationMatches({authorization,campaign:{id:1,slug:HUSTLE_SLUG,configVersion:HUSTLE_SPONSORED_CONFIG_VERSION,episodeGoal:12},prospect:p,message:m,now:new Date()}))throw new Error('Signed exact payload required');
  const exact=getHustleSponsoredPayload(authorization,m.sequenceStep);
  if(!/^<[^<>\s]+@jeristotleproductions\.com>$/.test(providerId)||previous?.providerMessageId&&!/^<[^<>\s]+@[^<>\s]+>$/.test(previous.providerMessageId))throw new Error('Invalid outbound identifier');
  return {to:exact.to,replyTo:JERISTOTLE_EMAIL,subject:exact.subject,text:exact.textBody,html:exact.htmlBody,messageId:providerId,inReplyTo:previous?.providerMessageId||undefined,references:previous?.providerMessageId||undefined,headers:{...HUSTLE_SPONSORED_HEADERS}};
 }
 return buildHustleEmail({to:p.email!,subject:m.subject,text:m.textBody,unsubscribeToken:p.unsubscribeToken,messageId:providerId,previousMessageId:previous?.providerMessageId,linkFree:m.sequenceStep===0});}
async function maintenance(input:{taskUid:string;now?:Date;initialMessageIds?:number[];taskOperation?:TaskOperation},deadline:number){
 const now=input.now||new Date(),moment=hustleSendMoment(now),db=await hustleDatabase();
 const time=()=>{if(Date.now()>=deadline)throw new Error('Hustle overall maintenance deadline exceeded; no send retry.');};
 time();const [campaign]=await db.select().from(hustleCampaigns).where(and(eq(hustleCampaigns.slug,HUSTLE_SLUG),eq(hustleCampaigns.schedulerTaskUid,input.taskUid)));
 const signedPolicy=campaign?.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION?Boolean(await readHustleSponsoredCampaignPolicy(db,campaign,now)):false;
 if(!hustleCampaignAuthorized(campaign,input.taskUid,signedPolicy))return {ok:true,skipped:'inactive-or-wrong-task'};
 if(isOutreachResearchWindow(now))return {ok:true,researchOnly:true,replenishment:signedPolicy?{requested:false,reason:'sponsored-records-require-owner-exact-review',target:30}:await requestHustleResearch(now,deadline),sent:0};
 if(!moment.maintenance)return {ok:true,skipped:'outside-maintenance-window'};
 // Stop monitoring stays active even after every episode has an assigned sponsor.
 outreachPhase('hustle-inbox');
 await checkHustleInbox(now,deadline-HUSTLE_PERSISTENCE_BUDGET_MS);time();
 const episodes=await db.select().from(hustleEpisodes).where(eq(hustleEpisodes.campaignId,campaign.id));
 if(episodes.filter(e=>e.seasonYear===2027&&e.sponsorProspectId!==null).length>=(signedPolicy?12:24))return {ok:true,skipped:'all-episode-sponsor-slots-reserved',inboxChecked:true};
 if(!signedPolicy)await prepareHustleReserve();time();
 const replenishment=null;
 if(!moment.send)return {ok:true,maintenance:true,replenishment,sent:0};
 if(!hustleHasSendBudget(deadline))return {ok:true,skipped:'insufficient-bounded-smtp-and-persistence-budget',replenishment,sent:0};
 if(!hustleEmailTransportConfigured())return {ok:true,skipped:'hustle-smtp-not-configured',replenishment,sent:0};
 const claimedDay=await db.transaction(async tx=>{
  const [c]=await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
  const currentSigned=c?.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION?Boolean(await readHustleSponsoredCampaignPolicy(tx,c,new Date())):false;
  if(!hustleCampaignAuthorized(c,input.taskUid,currentSigned)||!hustleHasSendBudget(deadline))return false;
  const key='daily-send:'+moment.dateKey;const [exists]=await tx.select().from(hustleEvents).where(eq(hustleEvents.eventKey,key));
  if(exists){if(exists.campaignId!==campaign.id||exists.eventType!=='daily_send_claim')return false;try{return JSON.parse(exists.detailJson).boundedContinuation===true;}catch{return false;}}
  await tx.insert(hustleEvents).values({campaignId:campaign.id,eventKey:key,eventType:'daily_send_claim',detailJson:JSON.stringify({newLimit:signedPolicy?5:HUSTLE_DAILY_NEW_LIMIT,date:moment.dateKey,boundedContinuation:true,noAutomaticRetry:true})});return true;
 });
 if(!claimedDay)return {ok:true,skipped:'historical-daily-batch-fenced'};
 const w=await getHustleWorkspace();time();
 const candidates=w.messages.filter(m=>m.status==='approved'&&!m.claimToken&&!m.attemptedAt&&!m.smtpAcceptedAt&&(input.initialMessageIds?m.sequenceStep===0&&input.initialMessageIds.includes(m.id):(m.sequenceStep===0||m.scheduledAt&&m.scheduledAt<=now))).sort((a,b)=>a.sequenceStep-b.sequenceStep);
 let initials=0,followupAttempts=0,sent=0,ambiguous=0,cancelledBeforeAttempt=0,preAttemptGuardRefusals=0;
 for(const m of candidates){
  if(!hustleHasSendBudget(deadline)||!hustleSendMoment(new Date()).send)break;
  if(m.sequenceStep===0&&initials>=(signedPolicy?5:HUSTLE_DAILY_NEW_LIMIT)||m.sequenceStep>0&&followupAttempts>=20)continue;
  const token=randomBytes(24).toString('hex'),providerId=`<hustle-${m.id}-${token}@jeristotleproductions.com>`;
  // Deterministic/configuration failures before a message claim never open SMTP.
  if(!hustleEmailTransportConfigured())break;
  const previewProspect=w.prospects.find(p=>p.id===m.prospectId);
  if(!previewProspect)continue;
  if(!isHustleSponsoredProspect(previewProspect)){try{hustleEmailFor(previewProspect,m,providerId);}catch{continue;}}
  const claimInput={campaignId:campaign.id,prospectId:m.prospectId,messageId:m.id,token,providerId,taskUid:input.taskUid,deadline,taskOperation:input.taskOperation};
  outreachPhase('hustle-claim');
  const claim=await claimHustleMessage({...claimInput,phase:'claim',exclusions:await getHustleExclusions()});
  if(!claim)continue;
  // Re-read all source evidence and permission fields under the campaign lock at the final boundary.
  outreachPhase('hustle-attempt');
  const attempt=await claimHustleMessage({...claimInput,phase:'attempt',exclusions:await getHustleExclusions()});
  if(!attempt){
   preAttemptGuardRefusals++;
   const [cancelled]=await db.update(hustleMessages).set({status:'cancelled',error:'Final pre-attempt guard refused; exact predicate unknown. No SMTP attempt; cancellation retained, never retry.'}).where(and(eq(hustleMessages.id,m.id),eq(hustleMessages.claimToken,token),eq(hustleMessages.status,'claimed'),isNull(hustleMessages.attemptedAt),isNull(hustleMessages.smtpAcceptedAt)));
   if(cancelled?.affectedRows===1)cancelledBeforeAttempt++;
   continue;
  }
  if(m.sequenceStep===0)initials++;else followupAttempts++;
  const {prospect:p,message:msg,previous,authorization}=attempt;
  try{
   // The existing transactional helper committed attemptedAt and exact claim/ID
   // BEFORE any connection. Even setup/timeouts now remain uncertain, never retry.
   outreachPhase('hustle-smtp');
   const delivery=await sendHustleEmail(hustleEmailFor(p,msg,providerId,previous,authorization),{deadline:deadline-HUSTLE_PERSISTENCE_BUDGET_MS});
   if(!delivery.sent)throw new Error('SMTP acceptance not confirmed');
   outreachPhase('hustle-persistence');
   const at=new Date();await db.transaction(async tx=>{
    await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,campaign.id)).for('update');
    const [fresh]=await tx.select().from(hustleProspects).where(eq(hustleProspects.id,p.id)).for('update');
    await tx.update(hustleMessages).set({status:'sent',smtpAcceptedAt:at,providerMessageId:delivery.messageId||providerId}).where(and(eq(hustleMessages.id,m.id),eq(hustleMessages.claimToken,token)));
    await tx.update(hustleProspects).set({firstSentAt:fresh.firstSentAt||at,lastSentAt:at,...(!fresh.stoppedAt?{stage:m.sequenceStep===2?'sequence_complete':'contacted'}:{})}).where(eq(hustleProspects.id,p.id));
    if(m.sequenceStep<2&&!fresh.stoppedAt)await tx.update(hustleMessages).set({scheduledAt:isHustleSponsoredProspect(p)?getHustleSponsoredFollowupAt(at,(m.sequenceStep+1) as 1|2):getNextFollowupAt(at,HUSTLE_SEQUENCE_DELAYS[m.sequenceStep+1],9)}).where(and(eq(hustleMessages.prospectId,p.id),eq(hustleMessages.sequenceStep,m.sequenceStep+1),eq(hustleMessages.status,'approved')));
   });sent++;
  }catch{ambiguous++;await db.update(hustleMessages).set({status:'uncertain',error:'SMTP or persistence outcome uncertain. Inspect; never retry attempted email.'}).where(and(eq(hustleMessages.id,m.id),eq(hustleMessages.claimToken,token)));}
 }
 time();await db.insert(hustleEvents).values({campaignId:campaign.id,eventKey:'daily-result:'+moment.dateKey+':'+randomBytes(12).toString('hex'),eventType:'daily_send_result',detailJson:JSON.stringify({initialAttempts:initials,followupAttempts,smtpAccepted:sent,uncertain:ambiguous,cancelledBeforeAttempt,preAttemptGuardRefusals,noAutoResend:true})});
 return {ok:ambiguous===0&&preAttemptGuardRefusals===0,smtpAccepted:sent,uncertain:ambiguous,cancelledBeforeAttempt,preAttemptGuardRefusals,...(preAttemptGuardRefusals?{inspectionRequired:true}: {})};
}
export async function runHustleMaintenance(input:{taskUid:string;now?:Date;initialMessageIds?:number[]}){
 if(process.env.NODE_ENV!=='production')return {ok:true,skipped:'development-sending-disabled'};
 return withOutreachDeadline(()=>maintenance(input,outreachDeadline()));
}
/** Private managed-task entry, not cron authentication or a browser impersonation.
 * The canonical scheduler field remains a campaign binding only; actual authority
 * comes from the sealed task grant, durable consent and committed shared claim.
 */
export async function runHustleTaskApprovedMaintenance(input:TaskOperation&{initialMessageIds:number[]}){
 const db=await hustleDatabase();
 const plan=await db.transaction(async tx=>{
  await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,1)).for('update');
  return readHustleTaskFirstBatchExecutionScope(tx,input.grant,new Date(),input.continuationStepId);
 });
 const expected=input.continuationStepId===undefined?5:1;
 if(!plan||plan.reviewId!==input.reviewId||plan.reviewHash!==input.reviewHash||plan.initialMessageIds.length!==expected||input.initialMessageIds.length!==expected||new Set(input.initialMessageIds).size!==expected||input.initialMessageIds.some(id=>!plan.initialMessageIds.includes(id))||(input.continuationStepId!==undefined&&(input.initialMessageIds[0]!==input.continuationStepId||plan.initialMessageIds[0]!==input.continuationStepId)))throw new Error('Actual signed task scope and exclusive committed claim required');
 return withOutreachDeadline(()=>maintenance({taskUid:plan.canonicalSchedulerTaskUid,initialMessageIds:plan.initialMessageIds,taskOperation:{grant:input.grant,reviewId:input.reviewId,reviewHash:input.reviewHash,continuationStepId:input.continuationStepId}},outreachDeadline()));
}
export async function hustleScheduledHandler(req:Request,res:Response){
 try{return await withOutreachDeadline(async()=>{const user=await authenticateOutreach(options=>sdk.authenticateRequest(req,options));if(!user.isCron||!user.taskUid)return res.status(403).json({error:'cron-only'});return res.json(await runHustleMaintenance({taskUid:user.taskUid}));});}
 catch(error){const diagnostic=outreachFailureDiagnostic(error);console.warn('[Hustle bounded maintenance]',diagnostic);return res.status(200).json({ok:false,partial:true,inspectionRequired:true,error:'Hustle bounded maintenance stopped or uncertain; no automatic resend.',diagnostic,timestamp:new Date().toISOString()});}
}
export async function hustleUnsubscribeHandler(req:Request,res:Response){
 const token=String(req.params.token||'');if(!/^[a-f0-9]{48}$/.test(token))return res.status(400).send('Invalid unsubscribe link.');
 const {stopHustleProspect}=await import('./hustleDb');const db=await hustleDatabase();const [p]=await db.select().from(hustleProspects).where(eq(hustleProspects.unsubscribeToken,token));
 if(req.method==='GET')return res.type('html').send('<!doctype html><title>Stop sponsorship outreach</title><h1>Stop sponsorship outreach</h1><form method="post"><button type="submit">Confirm unsubscribe</button></form>');
 if(p)await stopHustleProspect(p.id,'unsubscribed','Recipient confirmed campaign unsubscribe.');return res.send('You will not receive further sponsorship outreach.');
}
