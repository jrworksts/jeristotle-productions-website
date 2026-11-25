import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { sponsoredReviewBatchSchema } from '@shared/hustleSponsoredReview';

/** Existing authenticated owner routes only. Rendering a proposal never grants approval. */
export default function HustleSponsoredReviewPanel() {
  const [packet, setPacket] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const utils = trpc.useUtils();
  const review = trpc.hustle.sponsoredReview.useQuery({ reviewId }, { enabled: /^[a-f0-9]{48}$/.test(reviewId), retry: false, refetchOnWindowFocus: false });
  const stage = trpc.hustle.stageSponsoredReview.useMutation({ onSuccess: r => { setReviewId(r.reviewId); setConfirmed(false); toast.success('Review saved only. No email sent or approved.'); }, onError: e => toast.error(e.message) });
  const approve = trpc.hustle.approveSponsoredReview.useMutation({ onSuccess: () => { setConfirmed(false); utils.hustle.workspace.invalidate(); review.refetch(); toast.success('Exact approval recorded. This operation does not send email or activate the campaign.'); }, onError: e => toast.error(e.message) });
  const register = trpc.hustle.registerFirstBatch.useMutation({onSuccess:r=>{if(r.registered)toast.success('Native first-batch job registered. No email sent now.');else toast.error('Registration held. Inspect existing intent; do not create another job.');},onError:e=>toast.error(e.message)});
  const stagePacket = () => { try { stage.mutate(sponsoredReviewBatchSchema.parse(JSON.parse(packet))); } catch { toast.error('Invalid source-backed review packet. Nothing was staged or approved.'); } };
  return <section className="space-y-4 border-l-4 border-[#ffb627] bg-white text-black p-6 [overflow-wrap:anywhere]" data-hustle-sponsored-review>
    <h3 className="text-xl font-bold">Sponsored-business exact review</h3>
    <p className="text-sm leading-6">Businesses with documented local sponsorship and published general business contact routes. No owner, company-size, marketing-title or budget proof is required. Known stops, banking holds, source identity and duplicate protections remain.</p>
    <p className="text-xs text-black/60">This review proposes 12 episodes, 5 new contacts/day, a 30-contact buffer, and follow-ups 2 then 3 calendar days after the previous actual SMTP acceptance. Existing threads keep their original copy and timing. These settings are not applied by saving or viewing a review.</p>
    <details><summary className="cursor-pointer text-sm font-semibold">Save a source-backed review packet, without approval</summary>
      <label className="mt-3 block text-xs font-semibold">Load the exact JSON file<input type="file" accept=".json,application/json" className="mt-2 block max-w-full" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>800000){toast.error('Review file exceeds safe size.');return;}try{const text=await file.text();sponsoredReviewBatchSchema.parse(JSON.parse(text));setPacket(text);setConfirmed(false);}catch{toast.error('Invalid review file. No records changed.');}}}/></label>
      <label className="mt-3 block text-xs font-semibold">Exact review JSON<textarea value={packet} onChange={e => { setPacket(e.target.value); setConfirmed(false); }} maxLength={800000} rows={6} className="mt-2 w-full min-w-0 border border-black/15 p-3 font-mono text-xs" /></label>
      <Button className="mt-3" disabled={stage.isPending || !packet.trim()} onClick={stagePacket}>Save review only</Button>
      {stage.data && <p className="mt-3 text-xs">{stage.data.eligibleCount} source/history-eligible out of {stage.data.researchStockCount} reviewed. {stage.data.blocked.length} protection issues. {stage.data.healthBlockers.join(', ') || 'Local health checks passed at staging.'} No approval recorded.</p>}
    </details>
    <label className="block text-xs font-semibold">Read an existing signed review ID<input value={reviewId} onChange={e => { setReviewId(e.target.value.trim()); setConfirmed(false); }} maxLength={48} className="mt-2 block w-full min-w-0 border border-black/15 p-2 font-mono" /></label>
    {review.isLoading && <p className="text-sm">Reading the stored owner review.</p>}
    {review.error && <p className="text-sm text-red-800">{review.error.message}</p>}
    {review.data && <div className="space-y-4">
      <p className="text-xs">Exact signed review hash: <code>{review.data.reviewHash}</code></p>
      <p className="text-sm font-semibold">{review.data.approvalRecorded?'Actual stored owner approval verified.':'No stored owner approval yet.'}</p>
      {review.data.manifest.initialSendWindow&&<p className="text-xs">Initials not before {new Date(review.data.manifest.initialSendWindow.notBefore).toLocaleString('en-US',{timeZone:'America/Chicago'})} America/Chicago. Initial window ends {new Date(review.data.manifest.initialSendWindow.expiresAt).toLocaleString('en-US',{timeZone:'America/Chicago'})}. Follow-up consent remains tied to the unchanged exact messages and actual acceptance dates.</p>}
      {review.data.records.map((r: any, i: number) => <details className="border border-black/15 p-4" key={i}>
        <summary className="cursor-pointer font-semibold">{r.organization}: {r.email}</summary>
        <p className="mt-2 text-sm">{r.phone || 'No verified phone'} | {r.routingLabel}</p>
        <p className="mt-2 text-sm">{r.sponsorRecognition.program}. {r.sponsorRecognition.recognitionEvidence}</p>
        <a className="text-xs underline" href={r.emailEvidence.url} target="_blank" rel="noreferrer">Published email source</a>
        {r.messages.map((m: any) => <details className="mt-4 bg-[#f4f1e9] p-3" key={m.sequenceStep}>
          <summary className="cursor-pointer text-sm font-semibold">Email {m.sequenceStep + 1}: {m.subject}</summary>
          <p className="mt-2 text-xs">From: {m.from} | Reply-To: {m.replyTo} | To: {m.to}</p>
          <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6">{m.textBody}</pre>
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Exact white/gold HTML preview</summary><iframe title={`${r.organization} email ${m.sequenceStep + 1}`} srcDoc={m.htmlBody} sandbox="" className="mt-2 h-[700px] w-full border bg-white" /></details>
        </details>)}
      </details>)}
      <p className="text-xs text-black/60">Current eligibility, sources, unchanged record history, complete inbox coverage, and configuration are checked again when approving and before dispatch. A checkbox is not a bypass. No email is sent by this button.</p>
      {!review.data.approvalRecorded&&<><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>I have reviewed every recipient and all three exact subjects, plain text, HTML, From/Reply-To, the 319 N Mesquite St postal footer, homepage signature and prospective 12/5/30/+2/+3 mapping. Record my approval for this unchanged exact stored batch and policy.</span></label>
      <Button disabled={!confirmed || approve.isPending} onClick={() => approve.mutate({ reviewId: review.data!.reviewId, reviewHash: review.data!.reviewHash, confirmExactRecipientsMessagesFooterAndPolicy: true })}>Record this exact approval</Button></>}
      {review.data.manifest.initialSendWindow?.notBefore==='2026-11-18T15:00:00Z'&&<div className="space-y-2 border-t pt-4"><Button disabled={!review.data.approvalRecorded||register.isPending} onClick={()=>register.mutate({reviewId:review.data!.reviewId,reviewHash:review.data!.reviewHash})}>Schedule approved first five for Nov18 at 9AM Central</Button><p className="text-xs">One native, date-guarded job using the existing sender. No email now. Known stops, reply health, duplicate and uncertainty checks still apply.</p>{register.data&&<pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(register.data,null,2)}</pre>}</div>}
    </div>}
  </section>;
}
