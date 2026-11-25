import { useAuth } from '@/_core/hooks/useAuth';
import { startLogin } from '@/const';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SECTOR_KEYS, SECTOR_DAILY_NEW_PER_CAMPAIGN, type SectorKey, type SectorMessage } from '@shared/sectorOutreach';
import { OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET, OUTREACH_INITIAL_REFILL_START_BELOW } from '@shared/outboundReplenishmentPolicy';
import { Copy, LockKeyhole, Loader2, MessageSquareText, FileCheck2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const labels:Record<SectorKey,string>={tourism:'Tourism & experiences',real_estate:'Real estate',industrial:'Industrial B2B',healthcare:'Healthcare'};
const timing:Record<number,string>={1:'Initial email',2:'4 business days after email-one acceptance',3:'8 business days after email-two acceptance'};

export function SectorDraftMessage({message}:{message:SectorMessage}) {
 return <article className="min-w-0 border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,.03)]" data-sector-message={message.messageNumber}>
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[#f8f5ee] p-5">
   <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9b6a00]">Email {message.messageNumber} · {timing[message.messageNumber]}</p><h3 className="mt-2 break-words font-bold text-black">{message.subject}</h3></div>
   <Button variant="outline" className="rounded-none bg-white text-xs" onClick={async()=>{try{await navigator.clipboard.writeText(`Subject: ${message.subject}\n\n${message.body}`);toast.success('Draft copied. Nothing sent.');}catch{toast.error('Copy is unavailable. Select the draft text instead.');}}}><Copy size={14}/> Copy draft</Button>
  </div>
  <div className="whitespace-pre-wrap break-words p-5 text-sm leading-7 text-black/75 sm:p-6" data-draft-body>{message.body}</div>
 </article>;
}

export default function SectorOutreachDrafts() {
 const {user,loading}=useAuth();
 const [selected,setSelected]=useState<SectorKey>('tourism');
 const [notes,setNotes]=useState('');
 const utils=trpc.useUtils();
 const workspace=trpc.sectors.workspace.useQuery(undefined,{enabled:!!user,retry:false,refetchOnWindowFocus:false});
 const save=trpc.sectors.saveReviewNotes.useMutation({onSuccess:async()=>{await utils.sectors.workspace.invalidate();toast.success('Feedback saved. Campaigns remain inactive.');},onError:()=>toast.error('Feedback could not be saved. No sending settings changed.')});
 const campaign=workspace.data?.campaigns.find(c=>c.key===selected);
 useEffect(()=>{setNotes(campaign?.reviewNotes??'');},[selected,campaign?.reviewNotes]);
 if(loading)return <div className="flex items-center gap-3 p-8 text-black/60"><Loader2 size={20} className="animate-spin"/>Checking private review access.</div>;
 if(!user)return <div className="m-5 border border-[#d8c99f] bg-[#fffaf0] p-6 sm:m-8"><LockKeyhole size={26}/><h2 className="mt-3 text-xl font-black">Jeremy’s private campaign review</h2><p className="mt-3 text-sm leading-6">Sign in as the project owner to inspect saved drafts and leave feedback. No sender or replenishment is active for these new campaigns.</p><Button onClick={()=>startLogin()} className="mt-4 rounded-none bg-black text-white">Sign in to review</Button></div>;
 if(workspace.isLoading)return <div className="flex items-center gap-3 p-8 text-black/60"><Loader2 size={20} className="animate-spin"/>Loading saved campaign drafts.</div>;
 if(workspace.error)return <div className="m-5 border border-red-200 bg-red-50 p-6 text-red-900 sm:m-8"><h2 className="text-lg font-bold">Campaign review is unavailable</h2><p className="mt-2 text-sm">Owner access or the saved draft workspace could not be verified. No queue counts or activation are being assumed.</p><Button variant="outline" className="mt-4 rounded-none bg-white" onClick={()=>workspace.refetch()}>Try again</Button></div>;
 if(!workspace.data?.group)return <div className="m-5 border border-black/10 bg-white p-6 sm:m-8"><h2 className="font-bold">Draft setup is not saved yet</h2><p className="mt-2 text-sm">No active sender is configured. The existing campaign queues are unaffected.</p></div>;
 const data=workspace.data;
 return <div className="space-y-6 p-5 sm:p-8 lg:p-10" data-sector-review>
  <div className="grid gap-5 border border-[#d8c99f] bg-[#fffaf0] p-5 md:grid-cols-[1fr_auto] sm:p-6">
   <div><Badge className="rounded-none bg-black text-[#ffb627] hover:bg-black">Review only · Activation held</Badge><h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">Twelve messages. Your approval comes first.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-black/65">Three total touches for each audience. Bracketed fields are templates, not researched facts or real recipients. Research, enrollment, activation and actual sending remain on hold until Jeremy approves copy and launch integration. No automatic replenishment is active.</p></div>
   <div className="border-l-4 border-[#ffb627] pl-4 text-sm leading-6"><strong className="block">Approved requested policy: {SECTOR_DAILY_NEW_PER_CAMPAIGN} new contacts/day for each campaign</strong><span>Four separate limits, not a shared cap.<br/>Follow-ups additional; excluded from the new-contact cap.<br/>7 days/week · America/Chicago.<br/>Maximum planned NEW across four: {SECTOR_DAILY_NEW_PER_CAMPAIGN * SECTOR_KEYS.length}/day, not a shared budget.<br/>Reserve target: {OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET} per campaign; refill below {OUTREACH_INITIAL_REFILL_START_BELOW}.<br/>Persisted review limit: {campaign?.dailyNewLimit ?? 'Unavailable'} new/day. Review remains inactive; requested targets do not prove migration or a filled queue.<br/>Existing campaigns unchanged.</span></div>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[['Draft campaigns',data.campaigns.length],['Template messages',data.campaigns.reduce((n,c)=>n+c.messages.length,0)],['Prospect records',data.totals.prospects],['Recipient messages',data.totals.messages]].map(([label,value])=><div className="border border-black/10 bg-white p-4" key={label}><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/50">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
  </div>
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Choose an audience">
   {SECTOR_KEYS.map(key=><button type="button" key={key} data-sector-tab={key} aria-pressed={selected===key} className={`min-w-0 border px-4 py-4 text-left text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00] ${selected===key?'border-black bg-black text-[#ffb627]':'border-black/10 bg-white text-black hover:border-[#ffb627]'}`} onClick={()=>setSelected(key)}>{labels[key]}</button>)}
  </div>
  {campaign?<>
   <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
    <section className="border border-black/10 bg-white p-5"><h2 className="text-xl font-black">{campaign.name}</h2><p className="mt-3 text-sm leading-6 text-black/65"><strong>Targets:</strong> {campaign.targetCriteria}</p><p className="mt-3 text-sm leading-6 text-black/65"><strong>Buyer:</strong> {campaign.buyerCriteria}</p><p className="mt-3 text-sm leading-6 text-black/65"><strong>Business goal:</strong> {campaign.outcome}</p><details className="mt-4 border-t border-black/10 pt-4"><summary className="cursor-pointer text-sm font-bold">Source and personalization requirements</summary><p className="mt-3 text-sm leading-6 text-black/65">{campaign.personalizationFields.join(' · ')}</p><p className="mt-3 text-sm leading-6 text-black/65"><strong>Hold outside the send queue:</strong> {campaign.exclusions}</p></details></section>
    <section className="border border-black/10 bg-[#f8f5ee] p-5"><MessageSquareText size={22} className="text-[#9b6a00]"/><label htmlFor={`review-${selected}`} className="mt-3 block font-bold">Your copy feedback</label><textarea id={`review-${selected}`} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={4000} className="mt-3 min-h-32 w-full rounded-none border border-black/15 bg-white p-3 text-sm leading-6" placeholder="What should change before activation?"/><Button className="mt-3 rounded-none bg-black text-white" disabled={save.isPending||notes===(campaign.reviewNotes??'')} onClick={()=>save.mutate({key:selected,notes})}><FileCheck2 size={16}/> Save feedback</Button><p className="mt-3 text-xs leading-5 text-black/55">Saving feedback is not approval. There is no activate or send button in this review stage.</p></section>
   </div>
   <div className="space-y-5">{campaign.messages.map(message=><SectorDraftMessage key={message.messageNumber} message={message}/>)}</div>
  </>:<div className="border border-red-200 bg-red-50 p-5 text-sm text-red-900">This audience’s saved drafts are missing. No message is eligible to send.</div>}
  <div className="border-t border-black/10 pt-5 text-xs leading-6 text-black/60"><strong>Before launch:</strong> approve copy and sender details; connect and verify per-campaign new-contact cap dispatch, reply/OOO/bounce/opt-out stops and bounded Manus research. Every recipient needs a verified identity and exact contact route, with cross-campaign and shared suppression screening. Planned sending: 7 days/week in America/Chicago; follow-up one four business days after initial acceptance, follow-up two eight business days after the previous acceptance. Business-day intervals remain unchanged. No dates are scheduled during review.</div>
 </div>;
}
