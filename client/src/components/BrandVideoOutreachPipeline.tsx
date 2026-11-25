import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  review: "Evidence check pending",
  approved: "Auto-approved",
  replied: "Replied",
  unsubscribed: "Opted out",
  bounced: "Bounced",
  meeting: "Conversation booked",
  not_fit: "Not a fit",
  complete: "Complete",
};

function safeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function readText(value: Record<string, unknown> | undefined, field: string) {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate : "";
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="border border-black/10 bg-white p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/50">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-xs leading-5 text-black/55">{note}</p>
    </div>
  );
}

export default function BrandVideoOutreachPipeline() {
  const utils = trpc.useUtils();
  const workspace = trpc.brandVideo.workspace.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const operations = trpc.brandVideo.operations.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const sending = trpc.brandVideo.setSending.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.brandVideo.workspace.invalidate(),
        utils.brandVideo.operations.invalidate(),
      ]);
      toast.success(
        result.enabled
          ? "Brand Video sending enabled for the next daily 9 AM Central window."
          : "Brand Video sending paused."
      );
    },
    onError: error => toast.error(error.message),
  });
  const reserve = trpc.brandVideo.prepareBatch.useMutation({
    onSuccess: async () => {
      await utils.brandVideo.operations.invalidate();
      toast.success(
        "Approved reserve checked. No contacts were auto-approved or sent."
      );
    },
    onError: error => toast.error(error.message),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");
  const update = trpc.brandVideo.updateProspect.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.brandVideo.workspace.invalidate(),
        utils.brandVideo.operations.invalidate(),
      ]);
      toast.success("Brand Video review saved. Nothing was sent.");
    },
    onError: error => toast.error(error.message),
  });
  const data = workspace.data;
  const sorted = useMemo(
    () =>
      [...(data?.prospects ?? [])].sort(
        (a, b) => b.fitScore - a.fitScore || a.id - b.id
      ),
    [data?.prospects]
  );
  const visible = sorted.filter(prospect => {
    const haystack =
      `${prospect.businessName} ${prospect.industry} ${prospect.primaryContactName ?? ""} ${prospect.primaryEmail}`.toLowerCase();
    return (
      haystack.includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "review" ? prospect.status === "review" : false) ||
        (filter === "approved" ? prospect.status === "approved" : false) ||
        (filter === "blocked" ? Boolean(prospect.crossCampaignBlock) : false) ||
        (filter === "not_fit" ? prospect.status === "not_fit" : false))
    );
  });
  const selected =
    visible.find(prospect => prospect.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    setNotes(selected?.manualNotes ?? "");
    setStep(0);
  }, [selected?.id, selected?.manualNotes]);

  if (workspace.isLoading)
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-3 text-black/60">
        <Loader2 className="animate-spin" /> Loading Brand Video pipeline…
      </div>
    );
  if (workspace.error || !data)
    return (
      <div className="p-8">
        <div className="border border-red-200 bg-red-50 p-6 text-red-900">
          {workspace.error?.message ?? "Campaign data unavailable."}
          <Button
            className="mt-4 block rounded-none"
            onClick={() => workspace.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );

  const selectedMessages = data.messages
    .filter(message => message.prospectId === selected?.id)
    .sort((a, b) => a.sequenceStep - b.sequenceStep);
  const message = selectedMessages.find(item => item.sequenceStep === step);
  const selectedResearch = selected?.research as
    | Record<string, unknown>
    | undefined;

  return (
    <div className="space-y-7 p-5 sm:p-8 lg:p-10">
      <div className="border border-[#ddc789] bg-[#fff8e7] p-6 sm:flex sm:items-start sm:justify-between sm:gap-6">
        <div className="flex gap-4">
          <LockKeyhole className="mt-1 shrink-0 text-[#9b6a00]" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
              Separate campaign · Corpus Christi professional brand videos
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Show the story behind the business.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/65">
              This is a source-backed list for locally owned Corpus Christi
              businesses with something real to show. Every prospect must pass
              published-email, local-fit, specific-video-angle, and
              cross-campaign checks before it is automatically approved.
            </p>
          </div>
        </div>
        <Badge className="mt-4 shrink-0 rounded-none bg-black px-4 py-2 text-[#ffb627] sm:mt-0">
          {operations.data?.campaignStatus === "active"
            ? "Daily sending active"
            : "Sending paused / not scheduled"}
        </Badge>
      </div>

      <section className="border border-black/10 bg-white p-6">
        <h3 className="text-xl font-black">Daily outreach operations</h3>
        <p className="mt-3 text-sm leading-6 text-black/65">
          10 new contacts every day at 9 AM America/Chicago, including weekends.
          Days 5 and 10 follow-ups stay in the original thread. Maintenance and
          reply scans run every half hour from 8 AM to 5:30 PM Central. Only the
          9:00–9:14 window can send.
        </p>
        {operations.data ? (
          <>
            <p className="mt-4 text-sm font-bold">
              Ready approved reserve: {operations.data.readyCount}/
              {operations.data.bufferTarget}
              {operations.data.lowSupply
                ? " · LOW APPROVED SUPPLY"
                : " · reserve stocked"}
            </p>
            <p className="mt-2 text-xs text-black/60">
              {operations.data.qualifiedCount} qualified prospects ·{" "}
              {operations.data.eligibleReviewCount} source-backed sequences
              awaiting automatic processing. Next daily send:{" "}
              {operations.data.nextSendAt.toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })}{" "}
              Central.
            </p>
            <p className="mt-2 text-xs text-black/50">
              {operations.data.schedulerError ||
                (operations.data.scheduler?.isEnable
                  ? "Dedicated Brand Video scheduler enabled."
                  : "Dedicated scheduler paused.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                className="rounded-none"
                disabled={sending.isPending}
                onClick={() =>
                  sending.mutate({
                    enabled: operations.data?.campaignStatus !== "active",
                  })
                }
              >
                {operations.data.campaignStatus === "active"
                  ? "Pause Brand Video sending"
                  : "Enable after publishing"}
              </Button>
              <Button
                variant="outline"
                className="rounded-none"
                disabled={reserve.isPending}
                onClick={() => reserve.mutate()}
              >
                Check approved reserve
              </Button>
            </div>
            <p className="mt-3 text-xs text-black/50">
              Automatic approval applies only to complete, source-backed
              prospects with no cross-campaign conflict. It never invents a
              contact or sends immediately.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-black/60">
            {operations.error?.message || "Loading sender readiness…"}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <section className="border border-black/10 bg-black p-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ffb627]">
            Campaign setup
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              [
                "Professional brand video",
                "Lead with a focused story that shows what the business does, who is behind it, and what makes the experience distinct.",
              ],
              [
                "Two subject variations",
                "The first 25 drafts rotate “A video idea for…” and “Showing the story behind…” for a measured message test.",
              ],
              [
                "Days 1, 5, and 10",
                "Three short touches at calendar-day offsets 0, 4, and 9, including weekends. Ten new contacts every day at 9 AM Central.",
              ],
              [
                "Concept first",
                "The ask is only permission to send a tailored concept. It is not a free production, a price pitch, or a meeting-link email.",
              ],
            ].map(([title, text]) => (
              <div key={title}>
                <h3 className="font-bold text-[#ffb627]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-black/10 bg-white p-6">
          <div className="flex gap-3">
            <ShieldCheck className="text-[#9b6a00]" />
            <h3 className="text-xl font-black">Review safeguards</h3>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-black/65">
            <li>Keep only a real public business email with a source URL.</li>
            <li>Require a verified observation and a specific video angle.</li>
            <li>
              Block businesses or addresses already active, contacted, or
              suppressed in Chamber or credit-union outreach.
            </li>
            <li>
              Automatically approve only prospects that pass local-fit rules;
              exclude national chains without local purchase authority.
            </li>
          </ul>
          <p className="mt-4 border-t border-black/10 pt-4 text-xs text-black/50">
            Launch is authorized for ten new contacts every day, including
            weekends. Enabling remains blocked until the sending update is
            published. Reply, opt-out, or bounce cancels all remaining Brand
            Video messages.
          </p>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Qualified prospects"
          value={data.stats.qualified}
          note="Public-source local businesses with an identifiable brand-video story."
        />
        <Metric
          label="Evidence check pending"
          value={data.stats.reviewReady}
          note="Records awaiting the required source, local-fit, and conflict checks."
        />
        <Metric
          label="Auto-approved sequences"
          value={data.stats.approved}
          note="Source-backed sequences eligible when daily sending is enabled."
        />
        <Metric
          label="Overlap blocked"
          value={data.stats.crossCampaignBlocked}
          note="Contacts or businesses that overlap another Jeristotle outreach campaign."
        />
      </div>

      <section className="border border-black/10 bg-white">
        <div className="border-b border-black/10 p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
            Prospect and message review
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Local stories, specific angles, short asks.
          </h2>
          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_220px]">
            <label className="flex items-center gap-2 border border-black/15 bg-[#f8f5ee] px-3">
              <Search size={17} />
              <input
                aria-label="Search Brand Video prospects"
                className="h-11 w-full bg-transparent text-sm outline-none"
                placeholder="Search business, industry, contact, or email"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter Brand Video prospects"
              className="h-11 border border-black/15 bg-white px-3 text-sm"
              value={filter}
              onChange={event => setFilter(event.target.value)}
            >
              <option value="all">All prospects</option>
              <option value="review">Evidence check pending</option>
              <option value="approved">Auto-approved</option>
              <option value="blocked">Overlap blocked</option>
              <option value="not_fit">Not a fit</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-black/45">
            {visible.length} matching prospects · {data.stats.drafts} unsent
            message drafts · SMTP accepted: {data.stats.smtpAccepted}
          </p>
        </div>

        <div className="grid lg:grid-cols-[310px_1fr]">
          <div className="max-h-[840px] overflow-y-auto border-b border-black/10 lg:border-b-0 lg:border-r">
            {visible.length ? (
              visible.map(prospect => (
                <button
                  key={prospect.id}
                  className={`w-full border-b border-black/10 p-4 text-left ${prospect.id === selected?.id ? "bg-black text-white" : "bg-white hover:bg-[#fff8e7]"}`}
                  onClick={() => setSelectedId(prospect.id)}
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-bold">{prospect.businessName}</p>
                    <span className="text-[#b58417]">{prospect.fitScore}</span>
                  </div>
                  <p className="mt-2 text-xs opacity-65">{prospect.industry}</p>
                  <p className="mt-2 text-xs opacity-65">
                    {prospect.primaryContactName || "Business contact"}
                  </p>
                  <p className="mt-2 text-xs opacity-65">
                    {statusLabels[prospect.status] ?? prospect.status}
                  </p>
                </button>
              ))
            ) : (
              <p className="p-6 text-sm text-black/55">
                {sorted.length
                  ? "No prospects match this view."
                  : "Research is in progress. No placeholder prospects were imported."}
              </p>
            )}
          </div>

          <div className="min-w-0 p-5 sm:p-7">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#9b6a00]">
                      Selected prospect
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      {selected.businessName}
                    </h3>
                    <p className="mt-2 text-sm text-black/60">
                      {selected.primaryContactName ||
                        "Published business contact"}
                      {selected.primaryContactTitle
                        ? ` · ${selected.primaryContactTitle}`
                        : ""}
                    </p>
                    <p className="mt-1 break-all text-sm text-black/60">
                      {selected.primaryEmail}
                    </p>
                  </div>
                  {safeUrl(selected.website) ? (
                    <a
                      className="inline-flex items-center gap-2 border border-black/15 px-3 py-2 text-xs font-bold"
                      href={safeUrl(selected.website)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official website <ExternalLink size={13} />
                    </a>
                  ) : null}
                </div>

                {selected.crossCampaignBlock ? (
                  <div className="mt-5 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                    <strong>Overlap blocked:</strong>{" "}
                    {selected.crossCampaignBlock}
                    <br />
                    This record cannot be approved for this campaign unless the
                    cross-campaign conflict is resolved.
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 border-l-2 border-[#ffb627] pl-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-black/50">
                      Verified observation
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/70">
                      {selected.verifiedObservation}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-black/50">
                      Brand video angle
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/70">
                      {selected.videoAngle}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-black/65">
                  <strong>Suggested scenes:</strong> {selected.videoScenes}
                </p>
                <p className="mt-3 text-sm leading-6 text-black/65">
                  {selected.fitReason}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {selectedMessages.map(item => (
                    <Button
                      key={item.id}
                      variant={
                        step === item.sequenceStep ? "default" : "outline"
                      }
                      className="rounded-none"
                      onClick={() => setStep(item.sequenceStep)}
                    >
                      Email {item.sequenceStep + 1} · Day {item.dayOffset + 1}
                    </Button>
                  ))}
                </div>
                {message ? (
                  <article className="mt-4 border border-black/10 bg-[#faf8f2] p-5 sm:p-7">
                    <div className="flex items-start gap-3">
                      <FileText
                        className="mt-1 shrink-0 text-[#9b6a00]"
                        size={18}
                      />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">
                          Exact message · {message.status}
                        </p>
                        <h4 className="mt-2 text-lg font-black">
                          {message.subject}
                        </h4>
                        {message.alternativeSubject ? (
                          <p className="mt-1 text-xs text-black/50">
                            Test alternate: {message.alternativeSubject}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-black/80">
                      {message.textBody}
                    </p>
                  </article>
                ) : (
                  <p className="mt-6 border border-black/10 bg-[#f8f5ee] p-6 text-sm text-black/55">
                    No reviewed draft is available for this step.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    className="rounded-none"
                    disabled={update.isPending || selected.status === "not_fit"}
                    variant="outline"
                    onClick={() =>
                      update.mutate({ id: selected.id, status: "not_fit" })
                    }
                  >
                    Remove from campaign
                  </Button>
                </div>
                <p className="mt-2 text-xs text-black/50">
                  Source-backed prospects are approved automatically after every
                  required check passes. Daily sending never happens
                  immediately, outside the 9:00–9:14 AM Central window, or after
                  an ambiguous SMTP outcome.
                </p>

                <label className="mt-6 block border-t border-black/10 pt-5 text-xs font-bold uppercase tracking-wider">
                  Review notes
                  <textarea
                    className="mt-2 min-h-24 w-full border border-black/15 p-3 text-sm font-normal normal-case tracking-normal"
                    value={notes}
                    onChange={event => setNotes(event.target.value)}
                    placeholder="Record relevance, a concern, or an edit request."
                  />
                </label>
                <Button
                  className="mt-3 rounded-none"
                  variant="outline"
                  disabled={
                    update.isPending || notes === (selected.manualNotes ?? "")
                  }
                  onClick={() =>
                    update.mutate({ id: selected.id, manualNotes: notes })
                  }
                >
                  Save review notes
                </Button>

                <details className="mt-6 border-t border-black/10 pt-4">
                  <summary className="cursor-pointer text-sm font-bold">
                    Research and contact evidence
                  </summary>
                  <p className="mt-4 text-xs leading-6 text-black/60">
                    <strong>Local authority:</strong>{" "}
                    {readText(selectedResearch, "localAuthorityEvidence") ||
                      selected.localAuthorityEvidence}
                  </p>
                  <p className="mt-3 text-xs leading-6 text-black/60">
                    <strong>Public email source:</strong>{" "}
                    {safeUrl(selected.primaryEmailSourceUrl) ? (
                      <a
                        className="break-all text-[#916100] underline"
                        href={safeUrl(selected.primaryEmailSourceUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selected.primaryEmailSourceUrl}
                      </a>
                    ) : (
                      "Unavailable"
                    )}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {selected.sources.map((source, index) => (
                      <li
                        key={`${source.url}-${index}`}
                        className="text-xs leading-5"
                      >
                        <p className="text-black/65">{source.supports}</p>
                        {safeUrl(source.url) ? (
                          <a
                            className="mt-1 block break-all text-[#916100] underline"
                            href={safeUrl(source.url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.url}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p className="py-20 text-center text-black/50">
                No prospects match this view. Change the filters to see the
                research queue.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="border border-black/10 bg-white p-5 sm:p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#916100]">
          Campaign reporting
        </p>
        <h3 className="mt-2 text-xl font-black">
          Track actual SMTP acceptance and real responses.
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
          This separated campaign records sourced prospects, message approvals,
          overlap blocks, SMTP acceptance, replies and opt-outs. SMTP acceptance
          is not confirmed delivery, interest, or sales. Research replenishment
          must retain public email evidence and pass automated local-fit and
          cross-campaign checks before approval.
        </p>
      </section>
    </div>
  );
}
