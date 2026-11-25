import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { HUSTLE_STOP_STAGES } from "@shared/hustleOutreach";
import { HUSTLE_SPONSORED_CONFIG_VERSION } from "@shared/hustleSponsoredReview";
import HustleSponsoredReviewPanel from "./HustleSponsoredReviewPanel";

type Evidence = { roleEvidence?: string; sourceDateNotes?: string; sponsorFit?: string; verifiedObservation?: string; limitations?: string[] };
function evidenceFor(raw: string): Evidence {
  try { return JSON.parse(raw) as Evidence; } catch { return {}; }
}

export default function HustleOutreachPipeline() {
  const auth = useAuth();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const workspace = trpc.hustle.workspace.useQuery(undefined, { enabled: auth.isAuthenticated, retry: false, refetchOnWindowFocus: false });
  const reserve = trpc.hustle.prepareReserve.useMutation({ onSuccess: () => utils.hustle.workspace.invalidate(), onError: e => toast.error(e.message) });
  const track = trpc.hustle.updateTracking.useMutation({ onSuccess: () => utils.hustle.workspace.invalidate(), onError: e => toast.error(e.message) });
  const assign = trpc.hustle.assignEpisode.useMutation({ onSuccess: () => utils.hustle.workspace.invalidate(), onError: e => toast.error(e.message) });
  if (auth.loading) return <p className="p-8 text-black">Checking owner access…</p>;
  if (!auth.isAuthenticated) return <div className="bg-white p-8 text-black"><h2 className="text-2xl font-bold">Private sponsorship workspace</h2><p className="my-4">Sign in as Jeremy to view marketing contacts, review messages and track episode sponsors.</p><Button onClick={() => startLogin()}>Sign in to Growth Hub</Button></div>;
  if (workspace.isLoading) return <p className="p-8 text-black">Loading sponsorship pipeline…</p>;
  if (workspace.error || !workspace.data) return <div className="bg-white p-8 text-black"><h2 className="text-xl font-bold">Sponsorship workspace unavailable</h2><p className="mt-3">{workspace.error?.message || "No campaign data returned."}</p><Button className="mt-4" onClick={() => workspace.refetch()}>Try again</Button></div>;
  const w = workspace.data;
  const prospects = w.prospects.filter(p => (filter === "all" || filter === "financial" && p.category !== "other_sponsor" || filter === "other" && p.category === "other_sponsor" || filter === "holds" && p.qualification !== "qualified") && `${p.name} ${p.contactName || ""} ${p.stage}`.toLowerCase().includes(query.toLowerCase()));
  const sendingConfigured = w.campaign.status === "active" && Boolean(w.campaign.launchApprovedAt && w.campaign.schedulerTaskUid);
  const sponsoredMode = w.campaign.configVersion === HUSTLE_SPONSORED_CONFIG_VERSION;
  return <div className="space-y-6 text-black" data-hustle-workspace>
    <div className="border-l-4 border-[#ffb627] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">One story. One sponsor.</h2><Badge className="bg-black text-[#ffb627]">2027 · {w.campaign.episodeGoal} episode goal</Badge></div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-black/65">Permission-first outreach to financial-institution marketing teams and suitable local sponsors. Lead with a single mini-documentary episode, proposed local promotion and agreed measurement. No season-wide banking exclusivity, guaranteed reach, accounts or loans.</p>
      <p className="mt-3 text-sm font-semibold">Sending: {sendingConfigured ? "Configured active" : "Not active, pending publication and launch setup"} · Replenishment: {w.campaign.researchConnected ? "Connected" : "Not connected yet"}</p>
      <p className="mt-2 text-xs text-black/60">{sponsoredMode ? "Prospective exact-approved sponsor messages: 2 then 3 calendar days after the previous actual acceptance; at most 5 new/day, follow-ups additional. Historical threads retain original copy and timing." : "Existing policy: 4 days after the first acceptance and 5 after the second, with weekday follow-up adjustment; at most 10 new/day, follow-ups additional."} Replies, out-of-office, bounces, owner holds and opt-outs stop follow-ups. Configured active is not a send receipt or inbox confirmation.</p>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Institutions / sponsors", w.prospects.length], ["Ready reserve", `${w.health.readyInitialCount}/${w.health.target}`], ["Research / overlap holds", w.health.holds], ["SMTP accepted", w.health.smtpAccepted]].map(([label, value]) => <div key={label} className="bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-black/50">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p></div>)}</div>
    <HustleSponsoredReviewPanel />
    <div className="flex flex-wrap gap-3">
      <label className="min-w-0 flex-1"><span className="sr-only">Search sponsorship prospects</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search institution, contact or stage" className="w-full border border-black/15 bg-white px-4 py-3" /></label>
      <select aria-label="Prospect category" value={filter} onChange={e => setFilter(e.target.value)} className="border border-black/15 bg-white px-4"><option value="all">All prospects</option><option value="financial">Financial institutions</option><option value="other">Other sponsors</option><option value="holds">Research / overlap holds</option></select>
      <Button disabled={reserve.isPending || sponsoredMode} onClick={() => reserve.mutate()}>Prepare legacy verified reserve</Button>
    </div>
    {!prospects.length && <div className="bg-white p-8"><p className="font-semibold">No matching prospects yet.</p><p className="mt-2 text-sm text-black/60">Missing marketing emails stay visible as holds, not fabricated ready contacts.</p></div>}
    <div className="space-y-4">{prospects.map(p => {
      const evidence = evidenceFor(p.evidenceJson);
      return <details key={p.id} className="border border-black/10 bg-white">
        <summary className="cursor-pointer p-5"><div className="flex flex-wrap justify-between gap-2"><strong className="min-w-0 break-words text-lg">{p.name}</strong><span className="text-xs uppercase text-black/55">{p.stage.replaceAll("_", " ")} · {p.category.replaceAll("_", " ")}</span></div><p className="mt-2 break-words text-sm text-black/65">{p.email || "Marketing email not yet verified"} {p.contactName ? `· ${p.contactName}` : ""}</p>{p.holdReason && <p className="mt-2 text-xs text-[#8b5f00]">{p.holdReason}</p>}</summary>
        <div className="space-y-4 border-t border-black/10 p-5 text-sm leading-6 [overflow-wrap:anywhere]">
          <p>{p.localEvidence}</p>
          <div className="flex flex-wrap gap-4 underline"><a href={p.localSourceUrl} target="_blank" rel="noreferrer">Local presence source</a>{p.emailSourceUrl && <a href={p.emailSourceUrl} target="_blank" rel="noreferrer">Exact email source</a>}{p.roleSourceUrl && <a href={p.roleSourceUrl} target="_blank" rel="noreferrer">Role source</a>}</div>
          <p>Published phone: {p.phone || "Not found"} {p.phoneSourceUrl && <a className="underline" href={p.phoneSourceUrl} target="_blank" rel="noreferrer">Source</a>}</p>
          {p.contactTitle && <p><strong>Published role:</strong> {p.contactTitle}</p>}
          {evidence.roleEvidence && <p><strong>Role and routing evidence:</strong> {evidence.roleEvidence}</p>}
          {p.emailSourceQuote && <blockquote className="border-l-2 border-black/20 pl-4 whitespace-pre-line"><strong>Published email evidence</strong><br />{p.emailSourceQuote}</blockquote>}
          {evidence.verifiedObservation && <p><strong>Observed fact:</strong> {evidence.verifiedObservation}</p>}
          {evidence.sponsorFit && <p><strong>Proposed sponsorship fit:</strong> {evidence.sponsorFit}</p>}
          {evidence.sourceDateNotes && <p className="text-black/60"><strong>Source dates:</strong> {evidence.sourceDateNotes}</p>}
          {!!evidence.limitations?.length && <details className="bg-[#f4f1e9] p-4"><summary className="cursor-pointer font-semibold">Evidence limitations and routing notes</summary><ul className="mt-3 list-disc space-y-2 pl-5">{evidence.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
          <label className="block text-xs font-semibold">Record response / outcome<select aria-label={`Record outcome for ${p.name}`} value="" onChange={e => { if (e.target.value) track.mutate({ id: p.id, stage: e.target.value as typeof HUSTLE_STOP_STAGES[number] }); }} className="mt-2 block max-w-full border bg-white p-2"><option value="">Select an outcome</option>{HUSTLE_STOP_STAGES.map(s => <option value={s} key={s}>{s.replaceAll("_", " ")}</option>)}</select></label>
          <label className="block text-xs font-semibold">Owner notes<textarea defaultValue={p.manualNotes || ""} maxLength={4000} className="mt-2 w-full border border-black/15 bg-white p-3 text-sm" onBlur={e => { if (e.target.value !== (p.manualNotes || "")) track.mutate({ id: p.id, manualNotes: e.target.value }); }} /></label>
          {w.messages.filter(m => m.prospectId === p.id).map(m => <details key={m.id} className="bg-[#f4f1e9] p-4"><summary className="cursor-pointer text-sm font-bold">Email {m.sequenceStep + 1} · {m.status} · {m.subject}</summary><p className="mt-3 whitespace-pre-line text-sm leading-6">{m.textBody}</p></details>)}
        </div>
      </details>;
    })}</div>
    <section className="bg-white p-6"><h3 className="text-xl font-bold">2027 episode sponsor ledger</h3><p className="mt-2 text-sm text-black/60">One sponsor per episode. Reserving a slot is internal planning, not a signed agreement or a publication commitment.</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{w.episodes.map(e => <div className="border border-black/10 p-3" key={e.id}><p className="font-bold">Episode {e.episodeNumber}</p><p className="my-2 min-h-8 text-xs">{w.prospects.find(p => p.id === e.sponsorProspectId)?.name || "Unassigned"}</p><select aria-label={`Sponsor for episode ${e.episodeNumber}`} disabled={Boolean(e.sponsorProspectId) || assign.isPending} value={e.sponsorProspectId || ""} onChange={event => { if (event.target.value) assign.mutate({ episodeNumber: e.episodeNumber, prospectId: Number(event.target.value), notes: "Owner reserved this episode in the internal planning ledger. Agreement pending." }); }} className="w-full border bg-white p-1 text-xs"><option value="">Reserve sponsor</option>{w.prospects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>)}</div></section>
  </div>;
}
