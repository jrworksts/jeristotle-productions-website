/** Private fixed Nov19 continuation. Historical proof is evidence, never a source waiver.
 * No new batch, sender, timer, retry or relaxed claim/stop/quota/payload guards. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hustleEvents } from '../drizzle/schema';
import { ENV } from './_core/env';
import release from '../shared/outreachRepairRelease.json';
import { getOutreachLocalMoment } from '../shared/outreachSchedule';
import { sponsoredCanonicalJson, getHustleSponsoredFollowupAt } from '../shared/hustleSponsoredReview';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import { HUSTLE_BEFORE_CLAIM_RECOVERY as recovery, assertRecoveryHistoricalEvents, recoveryHash, recoveryByteHash, recoveryActorProvenance, signRecoveryTaskEvent } from './hustleBeforeClaimRecovery';
import { isHustleManagedOperatorActor, type HustleManagedOperatorActor } from './hustleManagedOperatorGrant';

export const HUSTLE_PARTIAL_CONTINUATION = Object.freeze({
  version:'hustle-nov19-original-partial-continuation-v1',
  key:'hustle-first-batch-continuation:2026-11-19:v1',
  reviewId:'e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2',
  reviewHash:'9abfd50e84a5c1179bea6a4456986e607bc386c93888e2199378e19203001002',
  sourceHash:'adad26757867c583c1e18dfef6587dfd0f474145e33a051ee450a20b9745be78',
  sourceMapHash:'f465982b3479ff84f96c182ccfbb76cb4d2a619fab1ac279d5a3009b69724843',
  resultKey:'hustle-first-batch-task-manifest:2026-11-19:result',
  remaining:[90004,90007,90010,90013],
  budget:{messageId:90001,attemptedAt:'2026-11-19T18:29:55.000Z',smtpAcceptedAt:'2026-11-19T18:29:56.000Z',providerMessageId:'<hustle-90001-8a56b965493f5fae936bf44c54960553723764c1d6d174ee@jeristotleproductions.com>'},
});
const pins=HUSTLE_PARTIAL_CONTINUATION;
type Row=Record<string,any>;
// Exact noncredential immutable DB-event byte digests supplied by the parent SELECT.
export const HUSTLE_PARTIAL_HISTORICAL_EVENTS: Readonly<Record<string,string>> = Object.freeze({
  "hustle-sponsored-review:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:0": "8258725d194722787cb19ee215a5cd8a0f6961df124d673af4a3f27200c0e31a",
  "hustle-sponsored-review:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:1": "1c051d39cec6eae2422eff248f9dd6840c75d9cde4659134008238079f38575b",
  "hustle-sponsored-review:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:2": "9345e2869dceca5bbdaba0531c5f80561f35dae120ee91b11ff835de8dbbe5fb",
  "hustle-sponsored-review:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:3": "cd92601b02f27f36011b7bcb27d3463e75530a6d4d6692dfe00f64a2421e4470",
  "hustle-sponsored-review:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:4": "89435916d1457f4721e63ba0d608a68f59d9b9ec0141b480aa6a45598015f66a",
  "hustle-sponsored-before-claim-stage:hustle-nov19-before-claim-recovery-v1:efdfd8935ea5dd904b01e74b7cbd5846afbdd7e44bc732a9390e0b828034b29b": "30e902caddd274258c4821db3847e4ca744f2bfa5f68293e5934b765988ba8db",
  "hustle-sponsored-authorization:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:210001": "0456c53543711bdba1eb6c4e99e5f711f74f9662009732e42a410c17f153ff9c",
  "hustle-sponsored-authorization:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:480001": "f54a4544dba8d61c4f6c9a0db50e48a69bca1ad48742afa34675dc94b6cfae50",
  "hustle-sponsored-authorization:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:210010": "1050f491c7ffac9f677e454c9e8ff9d4ca18532eb828cf2fdd17ebd71957b1b2",
  "hustle-sponsored-authorization:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:240001": "e9e329c985288cc58edadb4119291337a17e3e56f8acca84d2c6eb8f80bcb63f",
  "hustle-sponsored-authorization:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2:240003": "ec297c64ad45d04db39499f5e91006223fd68c6995c7909b7c1acf13a7e3d9b5",
  "hustle-sponsored-policy:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2": "79444cbbc0f54052c0cc361609f71b0e94f00aee2ac5ac9b11ed516694d29d57",
  "hustle-sponsored-approved:e921003bdfe2c879662d3d240c565b900d5ddafbd3cc9ee2": "d22afe205d93565a7c7ff009671c1daef8c02ee1016fc0c408f3d537e738ead7",
  "hustle-first-batch-renewed-start:2026-11-19:before-claim-recovery-v1": "a9addea3f5755ef4aad82769c85a00e20d3904d2c5b379de3f23723896a6ec29",
  "hustle-first-batch-task-manifest:2026-11-19:before-claim-recovery-v1": "88786e16261fba1a6e54d467a076247ea8981a3182dadb84e004889ae788c83e",
  "hustle-before-claim-recovery:2026-11-19:v1": "929e8c3d3419ae6e884715d2a60fb88513169dd9c289e327d78d2415ba0a1b8a",
  "hustle-first-batch-shared-attempt:2026-11-18": "1a6caa07934930f0cf0ebce2e8988c178920cb455d83e4dc60c60c45e31f7f91",
  "hustle-first-batch-task-manifest:2026-11-19:result": "ad9552248c0b417a6d7b1aaa872c44ab10c18a238303fcee1b9232ce90179eab"
});
function taskMac(payload:unknown) { return createHmac('sha256',hustleExistingSigningAuthority(ENV.cookieSecret)).update('jeristotle/hustle-task-first-batch/v1\n').update(sponsoredCanonicalJson(payload)).digest('hex'); }
export function continuationTaskPayload(row:Row|undefined,key:string,type:string):Row {
  if(!row||row.campaignId!==1||row.eventKey!==key||row.eventType!==type)throw new Error('Exact committed continuation event required');
  const e=JSON.parse(row.detailJson);
  if(Object.keys(e).sort().join(',')!=='payload,signature'||!/^[a-f0-9]{64}$/.test(e.signature)||!timingSafeEqual(Buffer.from(e.signature,'hex'),Buffer.from(taskMac(e.payload),'hex')))throw new Error('Continuation signature mismatch');
  return e.payload;
}
export function assertPartialHistoricalEvents(events:Row[]) {
  const original=assertRecoveryHistoricalEvents(events);
  for(const [key,digest] of Object.entries(HUSTLE_PARTIAL_HISTORICAL_EVENTS)) {
    const rows=events.filter(e=>e.eventKey===key),row=rows[0];
    if(rows.length!==1||row.campaignId!==1||recoveryByteHash(row.detailJson)!==digest)throw new Error('Immutable partial incident changed: '+key);
    if(row.eventType.startsWith('hustle_sponsored_')) {
      const e=JSON.parse(row.detailJson),{signature,...unsigned}=e;
      const keyBytes=createHmac('sha256',hustleExistingSigningAuthority(ENV.cookieSecret)).update('jeristotle/hustle-sponsored-review/signing-key/v1').digest();
      const expected=createHmac('sha256',keyBytes).update('jeristotle/hustle-sponsored-review/envelope/v1\n').update(sponsoredCanonicalJson(unsigned)).digest('hex');
      if(e.sourceHash!==pins.sourceHash||e.kind!==row.eventType||!isHustleManagedOperatorActor(e.actor)||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))throw new Error('Historical partial consent HMAC/source mismatch');
    }else continuationTaskPayload(row,key,row.eventType);
  }
  const task=continuationTaskPayload(events.find(e=>e.eventKey===recovery.taskKey),recovery.taskKey,'hustle_first_batch_task_manifest');
  const fence=continuationTaskPayload(events.find(e=>e.eventKey===recovery.fenceKey),recovery.fenceKey,'hustle_first_batch_shared_attempt');
  const result=continuationTaskPayload(events.find(e=>e.eventKey===pins.resultKey),pins.resultKey,'hustle_first_batch_task_result');
  if(task.serverSourceHash!==pins.sourceHash||task.consent.reviewId!==pins.reviewId||task.consent.reviewHash!==pins.reviewHash||
    recoveryHash(recoveryActorProvenance(task.actor))!==recoveryHash(recoveryActorProvenance(original.actor))||
    fence.serverSourceHash!==pins.sourceHash||fence.reviewId!==pins.reviewId||fence.reviewHash!==pins.reviewHash||
    result.manifestHash!==recoveryHash(task)||result.result?.partial!==true||result.result?.noAutomaticRetry!==true||
    recoveryHash(result.result.counts)!==recoveryHash({expected:5,attempted:1,accepted:1,failed:0,uncertain:0,affected:task.consent.organizations.slice(1)}))throw new Error('Exact historical one-accepted terminal result required');
  return task;
}
export function assertContinuationDate(now:Date) {
  const actual=new Date();
  if(!Number.isFinite(now.getTime())||Math.abs(actual.getTime()-now.getTime())>5000||getOutreachLocalMoment(now).dateKey!=='2026-11-19'||now.getTime()<Date.parse('2026-11-19T15:00:00Z')||now.getTime()>=Date.parse('2026-11-20T00:00:00Z'))throw new Error('Actual fixed Nov19 continuation window required');
}
export function initialReceipt(m:Row) {
  if(m.status!=='sent'||!(m.attemptedAt instanceof Date)||!(m.smtpAcceptedAt instanceof Date)||m.smtpAcceptedAt<m.attemptedAt||!m.claimToken||!/^<[^<>\s]+@jeristotleproductions\.com>$/.test(m.providerMessageId)||m.error!==null)throw new Error('Accepted receipt required; no attempted/uncertain retry');
  return {messageId:m.id,attemptedAt:m.attemptedAt.toISOString(),smtpAcceptedAt:m.smtpAcceptedAt.toISOString(),providerMessageId:m.providerMessageId,claimToken:m.claimToken};
}
/** Real locked rows only. Own claimed current target may advance to attempt; all other
 * pending originals must be unclaimed and every accepted receipt stays byte-exact. */
export function assertContinuationRows(state:Row, accepted:Row[], pending:number[], now:Date, activeId?:number) {
  assertContinuationDate(now);
  if(state.complete!==true||recoveryHash([...accepted.map(r=>r.messageId),...pending].sort((a,b)=>a-b))!==recoveryHash([90001,90004,90007,90010,90013]))throw new Error('Exact accepted/remainder partition required');
  const target=state.messages.filter((m:Row)=>recovery.prospectIds.includes(m.prospectId));
  if(target.length!==15||recoveryHash(target.map((m:Row)=>m.id).sort((a:number,b:number)=>a-b))!==recoveryHash(recovery.messageIds))throw new Error('Exact original fifteen rows required');
  for(let i=0;i<5;i++) {
    const p=state.prospects.find((p:Row)=>p.id===recovery.prospectIds[i]);
    const receipt=accepted.find(r=>r.messageId===90001+i*3);
    if(!p||p.campaignId!==1||p.qualification!=='qualified'||['stoppedAt','manualNotes','holdReason'].some(k=>!(k in p)||p[k]!==null)||p.stage!==(receipt?'contacted':'ready')||(!receipt&&['firstSentAt','lastSentAt'].some(k=>!(k in p)||p[k]!==null)))throw new Error('Current disposition/stop/hold blocks continuation');
    for(let step=0;step<3;step++) {
      const m=target.find((m:Row)=>m.id===90001+i*3+step);
      if(!m||m.campaignId!==1||m.prospectId!==p.id||m.sequenceStep!==step)throw new Error('Original ID/prospect/step mapping changed');
      if(step===0&&receipt) {
        if(recoveryHash(initialReceipt(m))!==recoveryHash(receipt)||!(p.firstSentAt instanceof Date)||p.firstSentAt.getTime()!==m.smtpAcceptedAt.getTime()||!(p.lastSentAt instanceof Date)||p.lastSentAt.getTime()!==m.smtpAcceptedAt.getTime())throw new Error('Known accepted receipt changed');
      }else {
        const own=step===0&&m.id===activeId&&m.status==='claimed';
        if(m.status!==(own?'claimed':'approved')||['attemptedAt','smtpAcceptedAt','error'].some(k=>!(k in m)||m[k]!==null)||(!own&&['claimToken','providerMessageId'].some(k=>!(k in m)||m[k]!==null))||(own&&(!m.claimToken||!m.providerMessageId)))throw new Error('Untouched original required; no claim/attempt/uncertain retry');
        if(step===0) {
          if(!(m.scheduledAt instanceof Date)||m.scheduledAt>now||m.scheduledAt.getTime()<Date.parse('2026-11-19T15:00:00Z')||m.scheduledAt.getTime()>=Date.parse('2026-11-20T00:00:00Z'))throw new Error('Original schedule changed');
        }else if(receipt&&step===1) {
          if(!(m.scheduledAt instanceof Date)||m.scheduledAt.getTime()!==getHustleSponsoredFollowupAt(new Date(receipt.smtpAcceptedAt),1).getTime())throw new Error('Accepted followup schedule changed');
        }else if(m.scheduledAt!==null)throw new Error('Original unscheduled followup changed');
      }
    }
  }
  const budget=accepted.find(r=>r.messageId===90001)!;
  const {claimToken:_claim,...known}=budget;
  if(recoveryHash(known)!==recoveryHash(pins.budget)||target.find((m:Row)=>m.id===90002)?.scheduledAt?.toISOString()!=='2026-11-21T15:00:00.000Z'||target.find((m:Row)=>m.id===90003)?.scheduledAt!==null)throw new Error('Budget acceptance/followup schedule must stay intact');
  const used=state.messages.filter((m:Row)=>m.campaignId===1&&m.sequenceStep===0&&((m.attemptedAt&&getOutreachLocalMoment(m.attemptedAt).dateKey==='2026-11-19')||(m.smtpAcceptedAt&&getOutreachLocalMoment(m.smtpAcceptedAt).dateKey==='2026-11-19')||(!m.attemptedAt&&m.claimToken&&m.id!==activeId))).length;
  if(used!==accepted.length||used+pending.length>5)throw new Error('Exact original global five/day capacity unavailable');
}
export const continuationStepKey=(id:number)=>pins.key+':step:'+id;
export async function appendContinuationTaskEvent(tx:any,key:string,type:string,payload:Row) {
  const detailJson=JSON.stringify(signRecoveryTaskEvent(payload));if(Buffer.byteLength(detailJson)>=60000)throw new Error('Continuation event exceeds bound');
  await tx.insert(hustleEvents).values({campaignId:1,eventKey:key,eventType:type,detailJson});
}
export async function readContinuationTaskManifest(tx:any,now=new Date(),actor?:HustleManagedOperatorActor) {
  const events:Row[]=await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId,1));
  if(!events.some(e=>e.eventKey===pins.key))return null;
  const {readHustlePartialContinuationAuthority,HUSTLE_SPONSORED_SERVER_SOURCE_HASH}=await import('./hustleSponsoredReviewDb');
  const a=readHustlePartialContinuationAuthority(events,now);
  if(!a)throw new Error('Current signed continuation authority required');
  const key=a.version===HUSTLE_FINAL_ORIGINAL.version?HUSTLE_FINAL_ORIGINAL.key:pins.key;
  const m=continuationTaskPayload(events.find(e=>e.eventKey===key+':manifest'),key+':manifest','hustle_first_batch_task_manifest');
  if(m.serverSourceHash!==HUSTLE_SPONSORED_SERVER_SOURCE_HASH||m.moduleSourceHash!==(release.sourceHashes as Record<string,string>)['server/hustleTaskFirstBatch.ts']||m.registeredAt!==a.registeredAt||recoveryHash(m.consent)!==recoveryHash(a.consent)||(actor&&recoveryHash(recoveryActorProvenance(actor))!==recoveryHash(recoveryActorProvenance(a.actor))))throw new Error('Continuation task/source/provenance mismatch');
  return m;
}

/** Completed results are receipts, not a retry signal. One missing/failed result holds
 * all later steps; every step key is exclusive and is never removed or reused. */
export function continuationProgress(events:Row[],authority:Row,now:Date,activeId?:number) {
  let accepted:Row[]=authority.accepted.slice(),pending:number[]=pins.remaining.slice();
  for(const id of pins.remaining) {
    const key=continuationStepKey(id),intents=events.filter(e=>e.eventKey===key),results=events.filter(e=>e.eventKey===key+':result');
    if(!intents.length) {if(results.length)throw new Error('Continuation result without intent');continue;}
    if(intents.length!==1||pending[0]!==id)throw new Error('Competing or out-of-order continuation');
    const intent=continuationTaskPayload(intents[0],key,'hustle_first_batch_continuation_intent');
    if(intent.version!==pins.version||intent.reviewId!==authority.consent.reviewId||intent.reviewHash!==authority.consent.reviewHash||intent.serverSourceHash!==authority.serverSourceHash||intent.messageId!==id||intent.recordedAt>now.getTime()||intent.noAutomaticRetry!==true||recoveryHash(intent.accepted)!==recoveryHash(accepted)||recoveryHash(intent.pending)!==recoveryHash(pending))throw new Error('Committed continuation source/receipt/subset mismatch');
    if(!results.length) {
      if(pending.slice(1).some(next=>events.some(e=>e.eventKey===continuationStepKey(next)||e.eventKey===continuationStepKey(next)+':result')))throw new Error('Competing continuation beyond unresolved intent');
      if(id!==activeId)throw new Error('Prior unresolved continuation intent; inspect, never retry');
      return {accepted,pending,intent};
    }
    if(results.length!==1)throw new Error('Ambiguous continuation result');
    const result=continuationTaskPayload(results[0],key+':result','hustle_first_batch_continuation_result');
    if(result.intentHash!==recoveryHash(intent)||result.serverSourceHash!==authority.serverSourceHash||result.ok!==true||result.receipt?.messageId!==id)throw new Error('Prior failed/uncertain continuation; inspect, never retry');
    accepted=accepted.concat(result.receipt);pending=pending.slice(1);
  }
  if(activeId!==undefined)throw new Error('No exclusive active continuation intent');
  return {accepted,pending,intent:undefined};
}
export async function readContinuationExecutionScope(tx:any,grant:unknown,actor:HustleManagedOperatorActor,stepId:number|undefined,now:Date) {
  const {readHustlePartialContinuationAuthority,HUSTLE_SPONSORED_SERVER_SOURCE_HASH}=await import('./hustleSponsoredReviewDb');
  const {readHustleLaunchState}=await import('./hustleDb');
  // Actual locking SELECTs, not projected/faked contexts. The existing authorization
  // reader independently performs FULL live exclusions/inbox reads at claim/attempt.
  const state={...await readHustleLaunchState(tx,true),complete:true},authority=readHustlePartialContinuationAuthority(state.events,now);
  if(!authority)throw new Error('Current-source continuation authority corrupt/stale');
  if(stepId===undefined)return null;
  assertContinuationDate(now);
  if(!pins.remaining.includes(stepId)||recoveryHash(recoveryActorProvenance(actor))!==recoveryHash(recoveryActorProvenance(authority.actor)))throw new Error('Only untouched original continuation permitted');
  const a={...authority,serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH};
  const progress=authority.version===HUSTLE_FINAL_ORIGINAL.version?finalOriginalProgress(state.events,a,now,stepId):continuationProgress(state.events,a,now,stepId);
  if(progress.intent?.grantId!==actor.grantId)throw new Error('Exclusive current executor grant required');
  assertContinuationRows(state,progress.accepted,progress.pending,now,stepId);
  if(authority.version===HUSTLE_FINAL_ORIGINAL.version)assertFinalOriginalKnownHistory(state.events,authority);
  return {...authority.consent,initialMessageIds:[stepId]};
}
/** Caller owns orchestration; each invocation has ONE existing 27s maintenance call.
 * No deadline encloses/reuses the sender's opportunity and no provider code is added. */
export async function executeHustlePartialContinuationStep(grant:unknown,messageId:number) {
  return executeContinuationStep(grant,messageId,false);
}
async function executeContinuationStep(grant:unknown,messageId:number,finalOriginal:boolean) {
  const {getDb}=await import('./db');
  const {hustleCampaigns,hustleMessages}=await import('../drizzle/schema');
  const {withOutreachDeadline,outreachRuntimeActive}=await import('./outreachDeadline');
  const {verifyHustleManagedOperatorGrant}=await import('./hustleManagedOperatorGrant');
  const {HUSTLE_SPONSORED_SERVER_SOURCE_HASH,readHustlePartialContinuationAuthority,readHustleSponsoredKnownState}=await import('./hustleSponsoredReviewDb');
  if(outreachRuntimeActive())throw new Error('Continuation needs a fresh existing per-call deadline, never nested');
  if(!pins.remaining.includes(messageId))throw new Error('Only remaining original IDs permitted');
  const key=finalOriginal?HUSTLE_FINAL_ORIGINAL.key+':intent':continuationStepKey(messageId);
  const resultKey=finalOriginal?HUSTLE_FINAL_ORIGINAL.key+':result':key+':result';
  const intent=await withOutreachDeadline(async()=>{
    const now=new Date();assertContinuationDate(now);
    const actor=verifyHustleManagedOperatorGrant(grant,{serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,requireProductionRelease:true},now);
    const db=await getDb();if(!db)throw new Error('Authoritative DB unavailable');
    return db.transaction(async tx=>{
      await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,1)).for('update');
      const state=await readHustleSponsoredKnownState(tx),authority=readHustlePartialContinuationAuthority(state.events,now);
      if(!authority||recoveryHash(recoveryActorProvenance(actor))!==recoveryHash(recoveryActorProvenance(authority.actor)))throw new Error('Same direct provenance/current-source authority required');
      if((authority.version===HUSTLE_FINAL_ORIGINAL.version)!==finalOriginal)throw new Error('Exact exclusive recovery operation required');
      const a={...authority,serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH};
      const progress=finalOriginal?finalOriginalProgress(state.events,a,now):continuationProgress(state.events,a,now);
      if(progress.pending[0]!==messageId||state.events.some((e:Row)=>e.eventKey===key))throw new Error('Exclusive next untouched original only; no retry');
      assertContinuationRows(state,progress.accepted,progress.pending,now);
      if(finalOriginal)assertFinalOriginalKnownHistory(state.events,authority);
      const value={version:finalOriginal?HUSTLE_FINAL_ORIGINAL.version:pins.version,reviewId:authority.consent.reviewId,reviewHash:authority.consent.reviewHash,
        messageId,grantId:actor.grantId,recordedAt:now.getTime(),serverSourceHash:HUSTLE_SPONSORED_SERVER_SOURCE_HASH,
        accepted:progress.accepted,pending:progress.pending,noAutomaticRetry:true};
      await appendContinuationTaskEvent(tx,key,'hustle_first_batch_continuation_intent',value);
      return value;
    });
  });
  let maintenance:unknown,error:string|undefined;
  try {
    const {runHustleTaskApprovedMaintenance}=await import('./hustleAutomation');
    maintenance=await runHustleTaskApprovedMaintenance({grant,reviewId:intent.reviewId,reviewHash:intent.reviewHash,initialMessageIds:[messageId],continuationStepId:messageId});
  }catch(caught) {error=sanitizedContinuationError(caught);}
  return withOutreachDeadline(async()=>{
    const db=await getDb();if(!db)throw new Error('Outcome DB unavailable; committed intent remains held');
    return db.transaction(async tx=>{
      await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,1)).for('update');
      const events:Row[]=await tx.select().from(hustleEvents).where(eq(hustleEvents.campaignId,1));
      if(events.some(e=>e.eventKey===resultKey))throw new Error('Exclusive step result already exists');
      const committed=continuationTaskPayload(events.find(e=>e.eventKey===key),key,'hustle_first_batch_continuation_intent');
      if(recoveryHash(committed)!==recoveryHash(intent))throw new Error('Step intent changed');
      const rows=await tx.select().from(hustleMessages).where(eq(hustleMessages.id,messageId)).for('update');
      let receipt:Row|undefined,receiptError:string|null=null;try{receipt=initialReceipt(rows.find(m=>m.id===messageId)!);}catch{receiptError='Actual accepted receipt unavailable; never retry this step.';error??=receiptError;}
      const reported=maintenance as any;
      const ok=!error&&Boolean(receipt)&&reported?.ok===true&&reported?.smtpAccepted===1&&reported?.uncertain===0;
      const result={ok,messageId,receipt:receipt??null,maintenance:maintenance??null,error:error??(ok?null:'Existing sender did not confirm exact original acceptance.'),receiptError,intentHash:recoveryHash(intent),serverSourceHash:intent.serverSourceHash,recordedAt:Date.now(),noAutomaticRetry:true,noNewNotification:true};
      await appendContinuationTaskEvent(tx,resultKey,'hustle_first_batch_continuation_result',result);
      return result;
    });
  });
}

/** Fixed last-original BEFORE-CLAIM recovery; not a retry facility. */
export const HUSTLE_FINAL_ORIGINAL = Object.freeze({
  version:'hustle-nov19-final-original-before-claim-v1',
  key:'hustle-first-batch-final-original:2026-11-19:90013:v1',
  reviewId:'f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413',
  reviewHash:'f35cc1c745b9d42e9a175431c5a6467f361ef452a97dda0657ab106aea64ad2e',
  sourceHash:'013224325ff8ee686e2a9712d06f8b25f6c69fa94987bf11baec88a144d23bdf',
  sourceMapHash:'ebc26d0e4b2e3b54508ef39c9562df6a813018a7518542cfc32e9895596e8ae6',
  messageId:90013,remaining:[90013],
});
export const HUSTLE_FINAL_HISTORICAL_EVENTS:Readonly<Record<string,string>>=Object.freeze({
  "hustle-sponsored-review:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:0":"2ef533dd43900f8cc5b25cd1f0fe19b8ce98367b50daf836b124408825e68547",
  "hustle-sponsored-review:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:1":"097ac7a0e2fc61218b37dffee79e909d208a85b3f453d0ff2ede625ccef3b5f4",
  "hustle-sponsored-review:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:2":"47ff7323401b277c2c83aa2a3b1cff8e580d3a3cf33983e38ca36922aaf6c29f",
  "hustle-sponsored-review:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:3":"b5d2d81fcf5951c5abff8c212b34ee2585593d70de72233e39f5a55d23893ea6",
  "hustle-sponsored-review:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:4":"08447900fd2f9f702744677bc2ed0f881e326add9bc46b5517516bb3ba4a9f8b",
  "hustle-first-batch-continuation:2026-11-19:v1:stage":"3af3dfa36dd2e30877975830793ce22f5b596dab68c4916d368645159c7d7207",
  "hustle-sponsored-authorization:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:210001":"9328592565210fae8c36d921ba754a2ce6d914eee6f01bf8e0e9b68e4ede61cd",
  "hustle-sponsored-authorization:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:480001":"d9b59fc8249d3043b46bbbff9b90b31d257a2960eee05573117ffa1d5c005981",
  "hustle-sponsored-authorization:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:210010":"1b674645208973abe7fcaa0b50834131db742ce03568c153c29d710ae702fdfb",
  "hustle-sponsored-authorization:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:240001":"1fb06117158bd0d68dfafd19a9dbd50a939e84117d0421b4008fc0da61da3111",
  "hustle-sponsored-authorization:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413:240003":"debdbfd86c39aa52f8a65687884ce2c789721a460f45495b7fb20ee1de483d40",
  "hustle-sponsored-policy:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413":"4cc939ec49cc1532f5518397e9604be039cfd7e4150eae9d58f4fdaeb2569ebe",
  "hustle-sponsored-approved:f50c04a90691b4bc9971eea3edf173f17c5b7e40c5682413":"da0e43a836149dd7249d60d0b239d5df58caf2099aa58464a623fef8d7cead98",
  "hustle-first-batch-continuation:2026-11-19:v1:manifest":"01de778b933c2d6ef264cb640e751a6fe03686a1809c84d7a79136bf8453621e",
  "hustle-first-batch-continuation:2026-11-19:v1":"9928d2b56b10c941384ea5a7dad4f36af275ffa2b32044fbc5f16747ff0e784f",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90004":"40877eed2081fba0d2d7983a9e6ebedf2e8918fbabb4796135cdf1a78d5f2235",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90004:result":"2a146677c0f181963fd8e7ba2d801a1e91efb55fb62e6ecb0789ae96bc6f43f1",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90007":"787fc85f976afbb81243f1c24c55e974e9536828dd76c79e10db18b2f9ad61ce",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90007:result":"86fa06fec311343d06a3c058f1e13b67ad9b233589e016a86bc0b9e6c7306da9",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90010":"4a983d707c99b82e50747e6135ce68ee8e58d7708ae10df9657b0aa6cb355385",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90010:result":"147d96ca581080731457057ef98b7a91e8c524e714e08e7887aa7ea8282077fb",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90013":"19819ee6884399ebb27c16300daaab5c81244b193b5dd98184d53d3eaca8996c",
  "hustle-first-batch-continuation:2026-11-19:v1:step:90013:result":"561625b4f0d0204d1ff8d8443ba7eda832d7929de79256cc71a7bcb82148cf5b",
});
export function assertFinalOriginalHistoricalEvents(events:Row[]):Row {
  const original=assertPartialHistoricalEvents(events),p=HUSTLE_FINAL_ORIGINAL;
  for(const [key,digest] of Object.entries(HUSTLE_FINAL_HISTORICAL_EVENTS)) {
    const rows=events.filter(e=>e.eventKey===key),row=rows[0];
    if(rows.length!==1||row.campaignId!==1||recoveryByteHash(row.detailJson)!==digest)throw new Error('Immutable final-original incident changed: '+key);
    if(row.eventType.startsWith('hustle_sponsored_')) {
      const e=JSON.parse(row.detailJson),{signature,...unsigned}=e;
      const keyBytes=createHmac('sha256',hustleExistingSigningAuthority(ENV.cookieSecret)).update('jeristotle/hustle-sponsored-review/signing-key/v1').digest();
      const expected=createHmac('sha256',keyBytes).update('jeristotle/hustle-sponsored-review/envelope/v1\n').update(sponsoredCanonicalJson(unsigned)).digest('hex');
      if(e.sourceHash!==p.sourceHash||e.kind!==row.eventType||!isHustleManagedOperatorActor(e.actor)||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))throw new Error('Historical final-original HMAC/source mismatch');
    }else continuationTaskPayload(row,key,row.eventType);
  }
  const task=continuationTaskPayload(events.find(e=>e.eventKey===pins.key+':manifest'),pins.key+':manifest','hustle_first_batch_task_manifest');
  const authority=JSON.parse(events.find(e=>e.eventKey===pins.key)!.detailJson);
  if(task.serverSourceHash!==p.sourceHash||task.consent.reviewId!==p.reviewId||task.consent.reviewHash!==p.reviewHash||recoveryHash(recoveryActorProvenance(task.actor))!==recoveryHash(recoveryActorProvenance(original.actor))||recoveryHash(authority.payload.consent)!==recoveryHash(task.consent))throw new Error('Exact historical94 continuation mapping/provenance required');
  const progress=finalOriginalHistoricalProgress(events,{...authority.payload,serverSourceHash:p.sourceHash},new Date());
  return {...task,accepted:progress.accepted};
}
/** Read ALL committed history including terminal failure; no filtered/projected execution evidence. */
export function finalOriginalHistoricalProgress(events:Row[],authority:Row,now:Date) {
  let accepted:Row[]=authority.accepted.slice(),pending:number[]=pins.remaining.slice();
  for(const id of pins.remaining) {
    const key=continuationStepKey(id),intents=events.filter(e=>e.eventKey===key),results=events.filter(e=>e.eventKey===key+':result');
    if(intents.length!==1||results.length!==1)throw new Error('Complete four-step historical proof required');
    const intent=continuationTaskPayload(intents[0],key,'hustle_first_batch_continuation_intent');
    const result=continuationTaskPayload(results[0],key+':result','hustle_first_batch_continuation_result');
    if(intent.version!==pins.version||intent.reviewId!==authority.consent.reviewId||intent.reviewHash!==authority.consent.reviewHash||intent.serverSourceHash!==authority.serverSourceHash||intent.messageId!==id||intent.recordedAt>now.getTime()||intent.noAutomaticRetry!==true||recoveryHash(intent.accepted)!==recoveryHash(accepted)||recoveryHash(intent.pending)!==recoveryHash(pending)||result.intentHash!==recoveryHash(intent)||result.messageId!==id||result.serverSourceHash!==authority.serverSourceHash||result.recordedAt<intent.recordedAt||result.recordedAt>now.getTime()||result.noAutomaticRetry!==true)throw new Error('Exact signed historical progress required');
    if(id===90013) {
      if(result.ok!==false||result.receipt!==null||result.maintenance!==null||result.error!=='Actual accepted receipt unavailable; never retry this step.'||pending.length!==1||accepted.length!==4)throw new Error('Exact terminal zero-receipt result required');
    }else {
      if(result.ok!==true||result.error!==null||result.receipt?.messageId!==id||result.maintenance?.ok!==true||result.maintenance?.smtpAccepted!==1||result.maintenance?.uncertain!==0)throw new Error('Three exact accepted signed steps required');
      accepted=accepted.concat(result.receipt);pending=pending.slice(1);
    }
  }
  return {accepted,pending};
}
export function finalOriginalProgress(events:Row[],authority:Row,now:Date,activeId?:number) {
  const p=HUSTLE_FINAL_ORIGINAL,key=p.key+':intent',intents=events.filter(e=>e.eventKey===key),results=events.filter(e=>e.eventKey===p.key+':result');
  if(!intents.length){if(results.length||activeId!==undefined)throw new Error('Exclusive final-original intent required');return {accepted:authority.accepted,pending:[90013],intent:undefined};}
  if(intents.length!==1||results.length||activeId!==90013)throw new Error('Final-original already committed/uncertain; never retry');
  const intent=continuationTaskPayload(intents[0],key,'hustle_first_batch_continuation_intent');
  if(intent.version!==p.version||intent.messageId!==90013||intent.serverSourceHash!==authority.serverSourceHash||intent.reviewId!==authority.consent.reviewId||intent.reviewHash!==authority.consent.reviewHash||intent.recordedAt>now.getTime()||intent.noAutomaticRetry!==true||recoveryHash(intent.accepted)!==recoveryHash(authority.accepted)||recoveryHash(intent.pending)!==recoveryHash([90013]))throw new Error('Exclusive current-source final-original scope required');
  return {accepted:authority.accepted,pending:[90013],intent};
}
/** No arbitrary SQL/provider strings: redact values, retain safe actual messages, hold unknowns. */
export function sanitizedContinuationError(error:unknown):string {
  if(!(error instanceof Error)||!error.message)return 'Unknown caught maintenance refusal; held, inspect without retry.';
  let message=error.message.replace(/https?:\/\/\S+|\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,'[redacted]')
    .replace(/\b(?:password|token|secret|authorization|credential|api[_-]?key)\s*[:=]\s*\S+/gi,'[redacted credential]')
    .replace(/[a-f0-9]{32,}|[A-Za-z0-9+/_=-]{48,}/g,'[redacted identifier]');
  if(/\b(?:select|insert|update|delete|sql:|parameters:|bearer|auth\s|grant|payload)\b/i.test(message))return 'Unknown caught maintenance refusal; unsafe detail withheld, held for inspection.';
  return message.replace(/[\r\n\t]/g,' ').slice(0,400);
}
export async function executeHustleFinalOriginal(grant:unknown){return executeContinuationStep(grant,90013,true);}
function assertFinalOriginalKnownHistory(events:Row[],authority:Row) {
  const known=new Set([...Object.keys(HUSTLE_PARTIAL_HISTORICAL_EVENTS),...Object.keys(HUSTLE_FINAL_HISTORICAL_EVENTS),
    `hustle-sponsored-review:${authority.consent.reviewId}:4`,`hustle-sponsored-authorization:${authority.consent.reviewId}:240003`]);
  // Older recovery events are already exact-digest checked by assertPartialHistoricalEvents.
  if(events.some(e=>e.prospectId===240003&&!known.has(e.eventKey)&&!e.eventKey?.startsWith('hustle-sponsored-review:'+recovery.reviewId+':')&&e.eventKey!==`hustle-sponsored-authorization:${recovery.reviewId}:240003`&&!['research_import','research_verified','research_review'].includes(e.eventType)))throw new Error('Unknown final-original claim/provider/contact history held');
}
