import { JERISTOTLE_EMAIL } from '../shared/const';

export const HUSTLE_SIGNED_INBOX_MAX_AGE_MS = 8 * 60 * 1000;
/** A timestamp alone is not coverage. Failure wins a timestamp tie conservatively. */
export function hasHustleCompleteInboxAnchor(campaign: {id:number;lastInboxScanAt:Date|null}, events:Array<{eventType:string;occurredAt:Date;detailJson:string}>, now=new Date()) {
  const outcomes=events.filter(e=>['hustle_inbox_complete','hustle_inbox_failed'].includes(e.eventType)).sort((a,b)=>b.occurredAt.getTime()-a.occurredAt.getTime() || Number(b.eventType==='hustle_inbox_failed')-Number(a.eventType==='hustle_inbox_failed'));
  const event=outcomes[0];
  if (!event || event.eventType!=='hustle_inbox_complete' || !campaign.lastInboxScanAt || !Number.isFinite(now.getTime())) return false;
  try {
    const a=JSON.parse(event.detailJson);
    const start=Date.parse(a.scanStartedAt),end=Date.parse(a.scanCompletedAt),through=Date.parse(a.coveredThroughAt);
    if(a.version!==1 || a.campaignId!==campaign.id || a.mailboxIdentity!==JERISTOTLE_EMAIL || ![start,end,through].every(Number.isFinite) || start>through || through>end || end>now.getTime() || now.getTime()-start>HUSTLE_SIGNED_INBOX_MAX_AGE_MS || Math.abs(campaign.lastInboxScanAt.getTime()-start)>=1000) return false;
    if(!Array.isArray(a.folders)||a.folders.length!==3) return false;
    return ['all','junk','trash'].every(kind=>a.folders.filter((f:any)=>f.kind===kind && /^\d+$/.test(f.uidValidity) && BigInt(f.uidValidity)>BigInt(0) && Number.isSafeInteger(f.throughUid) && f.throughUid>=0).length===1);
  }catch{return false;}
}
