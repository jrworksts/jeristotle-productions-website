import { ownOutreachImap, withOutreachStage, OUTREACH_INBOX_BUDGET_MS } from "./outreachDeadline";
import { ImapFlow, type SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { hustleCampaigns, hustleEvents } from '../drizzle/schema';
import { JERISTOTLE_EMAIL } from '../shared/const';
import { getHustleWorkspace, hustleDatabase, stopHustleProspect } from './hustleDb';
import { HUSTLE_SPONSORED_CONFIG_VERSION } from '../shared/hustleSponsoredReview';

export type HustleInboxTarget = {id:number;email:string;firstSentAt:Date;messageIds:string[]};
const ids = (text:string):string[] => text.toLowerCase().match(/<[^<>\s]+>/g)||[];
export function buildHustleInboxTargets(prospects:Array<{id:number;email:string|null;firstSentAt:Date|null;stoppedAt:Date|null}>,messages:Array<{prospectId:number;attemptedAt:Date|null;providerMessageId:string|null}>):HustleInboxTarget[]{
 return prospects.filter(p=>p.email&&!p.stoppedAt).flatMap(p=>{
  const attempted=messages.filter(m=>m.prospectId===p.id&&m.attemptedAt);
  const anchors=[...(p.firstSentAt?[p.firstSentAt]:[]),...attempted.map(m=>m.attemptedAt!)];
  return anchors.length?[{id:p.id,email:p.email!,firstSentAt:new Date(Math.min(...anchors.map(d=>d.getTime()))),messageIds:attempted.flatMap(m=>m.providerMessageId?[m.providerMessageId]:[])}]:[];
 });
}
export function hustleInboxQueries(targets:HustleInboxTarget[],since:Date):SearchObject[]{
 const queries:SearchObject[]=[];
 for(let i=0;i<targets.length;i+=20)queries.push({or:targets.slice(i,i+20).map(t=>({from:t.email,since}))});
 // Thread searches deliberately do not constrain the sender: colleagues and alternate OOO addresses count.
 const known=Array.from(new Set(targets.flatMap(t=>t.messageIds)));
 if(known.length>600)throw new Error('Hustle inbox thread bound exceeded; sending blocked.');
 for(let i=0;i<known.length;i+=10)queries.push({or:known.slice(i,i+10).flatMap((id):SearchObject[]=>[{since,header:{'In-Reply-To':id}},{since,header:{References:id}},{since,body:id}])});
 queries.push({since,header:{'Content-Type':'multipart/report'}});
 queries.push({since,header:{'Content-Type':'message/delivery-status'}});
 queries.push({or:targets.map(t=>({since,body:'rfc822; '+t.email}))});
 return queries;
}
export function classifyHustleReply(input:{from:string;date:Date;subject:string;text:string;references:string;deliveryStatus?:string},targets:HustleInboxTarget[]){
 const from=input.from.toLowerCase(),body=input.text.slice(0,262144),references=ids(input.references);
 if(!Number.isFinite(input.date.getTime())||from===JERISTOTLE_EMAIL.toLowerCase())return null;
 const owner=targets.find(t=>t.messageIds.some(id=>references.includes(id.toLowerCase())));
 const dsn=input.deliveryStatus||(/^(mailer-daemon|postmaster)@/i.test(from)?body:'');
 if(dsn){
  const recipients=Array.from(dsn.matchAll(/(?:final-recipient|original-recipient)\s*:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/gi),m=>m[1].toLowerCase());
  const embedded=ids(dsn+'\n'+body);
  const target=owner||targets.find(t=>recipients.includes(t.email.toLowerCase()))||targets.find(t=>t.messageIds.some(id=>embedded.includes(id.toLowerCase())));
  return target&&input.date>=target.firstSentAt?{id:target.id,stage:'bounced',detail:'Delivery-status MIME matched exact recipient or outbound message ID; follow-ups stopped.'}:null;
 }
 const target=owner||targets.find(t=>t.email.toLowerCase()===from);
 if(!target||input.date<target.firstSentAt)return null;
 return {id:target.id,stage:/^\s*(unsubscribe|remove me|stop emailing|stop sending)\b/im.test(input.subject+'\n'+body)?'unsubscribed':'replied',detail:'Recipient or known-thread response, including automatic/out-of-office response. Follow-ups stopped.'};
}
export async function parseHustleInboxSource(source:Buffer,targets:HustleInboxTarget[],fallback?:{date?:Date;from?:string;subject?:string}){
 if(source.length>=262144)throw new Error('Hustle inbox message too large or truncated; sending blocked.');
 const mail=await simpleParser(source,{keepDeliveryStatus:true,skipHtmlToText:false,skipImageLinks:true});
 const deliveryStatus=mail.attachments.filter(a=>a.contentType.toLowerCase()==='message/delivery-status').map(a=>a.content.toString('utf8')).join('\n');
 const refs=Array.isArray(mail.references)?mail.references.join(' '):mail.references||'';
 const date=mail.date||fallback?.date;
 if(!date)throw new Error('Hustle inbox matching date missing; sending blocked.');
 return classifyHustleReply({from:mail.from?.value[0]?.address||fallback?.from||'',date,subject:mail.subject||fallback?.subject||'',text:mail.text||'',references:[mail.inReplyTo,refs].filter(Boolean).join(' '),deliveryStatus},targets);
}
async function checkHustleInboxImpl(now=new Date(),deadline=Date.now()+60000){
 const w=await getHustleWorkspace(),db=await hustleDatabase();
 const targets=buildHustleInboxTargets(w.prospects,w.messages);
 if(targets.length>200)throw new Error('Hustle inbox scan target bound exceeded; sending blocked.');
 const password=process.env.GMAIL_APP_PASSWORD||process.env.SMTP_PASS;
 if(!password)throw new Error('Company Gmail reply monitoring is not configured; sending blocked.');
 const checkTime=()=>{if(Date.now()>=deadline)throw new Error('Hustle inbox deadline exceeded; sending blocked.');};
 checkTime();
 const signedPolicy=w.campaign.configVersion===HUSTLE_SPONSORED_CONFIG_VERSION;
 if(!targets.length&&!signedPolicy){await db.update(hustleCampaigns).set({lastInboxScanAt:now}).where(eq(hustleCampaigns.id,w.campaign.id));return {scanned:0,stopped:0};}
 const since=new Date(targets.length?Math.min(...targets.map(t=>t.firstSentAt.getTime())):now.getTime());since.setUTCDate(since.getUTCDate()-1);
 const queries=targets.length?hustleInboxQueries(targets,since):[];
 const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,auth:{user:JERISTOTLE_EMAIL,pass:password}});
 const releaseSocket=ownOutreachImap(client);
 let scanned=0,stopped=0;
 const scanId=randomBytes(16).toString('hex');
 const coverage:Array<{kind:string;uidValidity:string;throughUid:number}>=[];
 const timer=setTimeout(()=>client.close(),Math.max(1,deadline-Date.now()));
 try{
  await client.connect();checkTime();
  const folders=await client.list();checkTime();
  if(signedPolicy&&['\\All','\\Junk','\\Trash'].some(kind=>!folders.some(f=>f.specialUse===kind)))throw new Error('Complete company All/Junk/Trash reply coverage required.');
  const all=folders.find(f=>f.specialUse==='\\All')?.path||'INBOX';
  const paths=Array.from(new Set([all,...folders.filter(f=>['\\Junk','\\Trash'].includes(f.specialUse||'')).map(f=>f.path)]));
  if(paths.length>3)throw new Error('Hustle inbox mailbox bound exceeded; sending blocked.');
  for(const path of paths){
   checkTime();const mailbox=await client.mailboxOpen(path,{readOnly:true});const uids=new Set<number>();
   const special=folders.find(f=>f.path===path)?.specialUse;
   if(mailbox&&mailbox.uidValidity&&Number.isSafeInteger(mailbox.uidNext)&&mailbox.uidNext>0)coverage.push({kind:special==='\\All'?'all':special==='\\Junk'?'junk':special==='\\Trash'?'trash':'other',uidValidity:String(mailbox.uidValidity),throughUid:mailbox.uidNext-1});
   for(const query of queries){checkTime();const found=await client.search(query,{uid:true});if(!Array.isArray(found))throw new Error('Hustle inbox search failed; sending blocked.');if(found.length>200)throw new Error('Hustle inbox query overflow; sending blocked.');found.forEach(n=>uids.add(n));if(uids.size+scanned>600)throw new Error('Hustle inbox scan overflow; sending blocked.');}
   if(uids.size){
    checkTime();const messages=await client.fetchAll(Array.from(uids),{envelope:true,source:{maxLength:262144},size:true},{uid:true});
    if(messages.length!==uids.size)throw new Error('Hustle inbox incomplete fetch; sending blocked.');
    for(const m of messages){
     checkTime();if(!Buffer.isBuffer(m.source)||(m.size??262144)>=262144)throw new Error('Hustle inbox source missing or oversized; sending blocked.');scanned++;
     const found=await parseHustleInboxSource(m.source,targets,{date:m.envelope?.date?new Date(m.envelope.date):undefined,from:m.envelope?.from?.[0]?.address,subject:m.envelope?.subject});
     checkTime();if(found&&await stopHustleProspect(found.id,found.stage,found.detail))stopped++;
    }
   }
  }
  const complete=coverage.length===3&&['all','junk','trash'].every(kind=>coverage.filter(f=>f.kind===kind).length===1);
  if(signedPolicy&&!complete)throw new Error('Reply UID coverage incomplete; sending blocked.');
  checkTime();await db.transaction(async tx=>{
   await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id,w.campaign.id)).for('update');
   if(complete)await tx.insert(hustleEvents).values({campaignId:w.campaign.id,eventKey:'hustle-inbox-complete:'+scanId,eventType:'hustle_inbox_complete',detailJson:JSON.stringify({version:1,campaignId:w.campaign.id,mailboxIdentity:JERISTOTLE_EMAIL,scanStartedAt:now.toISOString(),scanCompletedAt:new Date().toISOString(),coveredThroughAt:now.toISOString(),folders:coverage,noSends:true})});
   await tx.update(hustleCampaigns).set({lastInboxScanAt:now}).where(eq(hustleCampaigns.id,w.campaign.id));
  });return {scanned,stopped};
 }catch(error){
  await db.insert(hustleEvents).ignore().values({campaignId:w.campaign.id,eventKey:'hustle-inbox-failed:'+scanId,eventType:'hustle_inbox_failed',detailJson:JSON.stringify({version:1,scanStartedAt:now.toISOString(),reason:'Incomplete company reply coverage. No new scan watermark or send authorization.',noSends:true})}).catch(()=>undefined);
  throw error;
 }finally{releaseSocket();clearTimeout(timer);client.close();}
}

export async function checkHustleInbox(...args: Parameters<typeof checkHustleInboxImpl>) {
  return withOutreachStage(OUTREACH_INBOX_BUDGET_MS, () => checkHustleInboxImpl(...args));
}
