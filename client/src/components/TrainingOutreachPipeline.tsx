import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import TrainingOperationsPanel from "@/components/TrainingOperationsPanel";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  research: "Research in progress",
  needs_review: "Needs evidence review",
  review: "Needs evidence review",
  qualified: "Qualified for review",
  selected_for_draft: "Selected for drafts",
  drafted: "Drafts prepared",
  approved: "Approved for campaign queue",
  not_fit: "Not a fit",
  replied: "Reply received — review",
  bounced: "Bounced — stopped",
  unsubscribed: "Opted out — stopped",
  meeting: "Meeting recorded",
  complete: "Sequence complete",
};

const draftTabs = [
  { step: 0, label: "Initial" },
  { step: 1, label: "+4 business days after initial" },
  { step: 2, label: "+5 business days after follow-up 1" },
] as const;

type ResearchSource = { url: string; supports: string };

function safeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function messageStageLabel(status: string) {
  return (
    {
      draft: "Draft",
      approved: "Approved",
      scheduled: "Scheduled",
      sent: "Sent",
      cancelled: "Cancelled",
      failed: "Failed",
    }[status] ?? status
  );
}

function SourceLink({
  href,
  children,
}: {
  href?: string | null;
  children: string;
}) {
  const url = safeUrl(href);
  if (!url) return null;
  return (
    <a
      className="inline-flex max-w-full items-center gap-1 break-all text-[#895b00] underline underline-offset-2 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00]"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="min-w-0 break-all">{children}</span>
      <ExternalLink className="shrink-0" size={13} />
    </a>
  );
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
    <div className="border border-black/10 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,.035)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-black/50">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black tracking-[-0.05em] text-black">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-black/55">{note}</p>
    </div>
  );
}

export default function TrainingOutreachPipeline() {
  const utils = trpc.useUtils();
  const workspace = trpc.training.workspace.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const update = trpc.training.updateProspect.useMutation({
    onSuccess: async (_result, variables) => {
      await utils.training.workspace.invalidate();
      toast.success(
        variables.status === "not_fit"
          ? "Removed from this draft-only campaign. Nothing was sent or scheduled."
          : "Training review notes saved. Nothing was sent or scheduled."
      );
    },
    onError: error => toast.error(error.message),
  });
  const updateLeadOutcome = trpc.training.updateLeadOutcome.useMutation({
    onSuccess: async () => {
      await utils.training.workspace.invalidate();
      toast.success("Lead outcome saved. Delivery history was not changed.");
      setOutcomeDialogOpen(false);
      setNotClosedReason("");
    },
    onError: error => toast.error(error.message),
  });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [notClosedReason, setNotClosedReason] = useState("");
  const data = workspace.data;

  const ranked = useMemo(
    () =>
      [...(data?.prospects ?? [])].sort(
        (a, b) =>
          a.priorityRank - b.priorityRank ||
          b.fitScore - a.fitScore ||
          a.id - b.id
      ),
    [data?.prospects]
  );

  const hasPublicEmailEvidence = (prospect: (typeof ranked)[number]) =>
    Boolean(prospect.primaryEmail && safeUrl(prospect.primaryEmailSourceUrl));
  const needsEvidence = (prospect: (typeof ranked)[number]) =>
    !prospect.verifiedObservation ||
    !prospect.useCase ||
    !prospect.facts.length ||
    !hasPublicEmailEvidence(prospect);
  const isTopTen = (prospect: (typeof ranked)[number]) =>
    Boolean(prospect.selectedForDraft);

  const visible = ranked.filter(prospect => {
    const haystack = [
      prospect.businessName,
      prospect.location,
      prospect.industry,
      prospect.primaryContactName,
      prospect.primaryContactTitle,
      prospect.primaryEmail,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      haystack.includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "top10" && isTopTen(prospect)) ||
        (filter === "verified" && hasPublicEmailEvidence(prospect)) ||
        (filter === "needs-evidence" && needsEvidence(prospect)) ||
        (filter === "overlap" && Boolean(prospect.crossCampaignBlock)) ||
        (filter === "not-fit" && prospect.status === "not_fit"))
    );
  });

  const selected =
    visible.find(prospect => prospect.id === selectedId) ?? visible[0] ?? null;
  const approachFirst = ranked
    .filter(
      prospect =>
        prospect.status === "review" &&
        prospect.qualificationStatus === "qualified" &&
        prospect.selectedForDraft &&
        hasPublicEmailEvidence(prospect) &&
        !prospect.crossCampaignBlock
    )
    .slice(0, 3);

  useEffect(() => {
    setNotes(selected?.manualNotes ?? "");
    setStep(0);
  }, [selected?.id, selected?.manualNotes]);

  const selectedLeadOutcome = selected;

  const copyDraft = async (subject: string, textBody: string) => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${textBody}`);
      toast.success("Exact draft copied to the clipboard.");
    } catch {
      toast.error(
        "Could not copy the draft. Select the text and copy it manually."
      );
    }
  };

  if (workspace.isLoading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-3 p-8 text-black/60">
        <Loader2 className="animate-spin" /> Loading training research and
        drafts…
      </div>
    );
  }

  if (workspace.error || !data) {
    return (
      <div className="p-5 sm:p-8 lg:p-10">
        <div className="border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-black">Training workspace unavailable</h2>
          <p className="mt-2 text-sm leading-6">
            {workspace.error?.message ?? "Campaign data is not available yet."}
          </p>
          <Button
            className="mt-4 rounded-none bg-red-900 text-white hover:bg-red-800"
            onClick={() => workspace.refetch()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const selectedMessages = data.messages
    .filter(message => message.prospectId === selected?.id)
    .sort((a, b) => a.sequenceStep - b.sequenceStep);
  const activeMessage = selectedMessages.find(
    message => message.sequenceStep === step
  );
  const researchTarget = data.stats.researchTarget;
  const researchBacklog = Math.max(0, researchTarget - data.stats.qualified);
  const selectedCanShowMessages = Boolean(selected && selectedMessages.length);
  const campaignStatus = data.campaign.status;
  const campaignStatusLabel =
    campaignStatus === "active"
      ? "Active status recorded"
      : campaignStatus === "paused"
        ? "Paused"
        : "Review status";

  return (
    <div className="space-y-7 p-5 sm:p-8 lg:p-10">
      <section className="border border-[#d9c28a] bg-[#fff9ec] p-5 shadow-[0_18px_50px_rgba(114,79,10,.06)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <LockKeyhole className="mt-1 shrink-0 text-[#926000]" />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#926000]">
                Internal Training & Knowledge Capture · Campaign workspace
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-black sm:text-3xl">
                Capture team expertise through one private workflow.
              </h2>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-black/65">
                This workspace holds source-backed prospect research and
                persisted message review for Jeristotle&apos;s internal training
                offer. Campaign and message stages below are recorded state;
                they do not promise delivery, interest, meetings, or sales.
              </p>
            </div>
          </div>
          <Badge className="w-fit shrink-0 rounded-none bg-black px-4 py-2 text-[#ffb627] hover:bg-black">
            {campaignStatusLabel}
          </Badge>
        </div>
        <div className="mt-6 grid gap-3 border-t border-[#d9c28a] pt-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="font-bold text-black">Campaign status</p>
            <p className="mt-1 break-all text-black/60">
              {campaignStatusLabel}. Runtime availability must come from the
              scoped operations record; no active state is inferred here.
            </p>
          </div>
          <div>
            <p className="font-bold text-black">Research target</p>
            <p className="mt-1 text-black/60">
              {researchTarget} qualified companies
            </p>
          </div>
          <div>
            <p className="font-bold text-black">Message preparation</p>
            <p className="mt-1 text-black/60">
              {data.stats.drafts} persisted messages ·{" "}
              {data.stats.selectedForDraft} selected from the prioritized
              research set
            </p>
          </div>
          <div>
            <p className="font-bold text-black">Research backlog to target</p>
            <p className="mt-1 text-black/60">
              {researchBacklog} remaining · recurring research availability is
              shown only when the live operations record confirms it
            </p>
          </div>
        </div>
      </section>

      <TrainingOperationsPanel />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Researched"
          value={data.stats.researched}
          note="Records with a documented research pass."
        />
        <Metric
          label="Qualified"
          value={data.stats.qualified}
          note="Fit and evidence reviewed for the private-pilot premise."
        />
        <Metric
          label="Evidence gaps"
          value={data.stats.needsReview}
          note="Missing qualification or email evidence; a draft is not a send-ready contact."
        />
        <Metric
          label="Prepared messages"
          value={data.stats.selectedForDraft}
          note={`${data.stats.drafts} persisted messages exist; preparation is not outgoing activity.`}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_.92fr]">
        <div className="border border-black/10 bg-black p-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ffb627]">
            Priority research review
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {approachFirst.length ? (
              approachFirst.map((prospect, index) => (
                <button
                  className="min-w-0 border border-white/15 bg-white/5 p-4 text-left transition hover:border-[#ffb627] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffb627]"
                  key={prospect.id}
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setSelectedId(prospect.id);
                  }}
                  type="button"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#ffb627]">
                    {index + 1} · Rank {prospect.priorityRank}
                  </p>
                  <p className="mt-2 break-words font-bold">
                    {prospect.businessName}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-white/60">
                    {prospect.fitReason}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-sm leading-6 text-white/60">
                No prioritized source-backed prospects are available for review
                yet. No placeholder records were created.
              </p>
            )}
          </div>
        </div>

        <aside className="border border-black/10 bg-white p-6">
          <div className="flex gap-3">
            <ShieldCheck className="shrink-0 text-[#926000]" />
            <div>
              <h3 className="text-xl font-black">Campaign safeguards</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-black/65">
                <li>
                  Public email evidence verifies the source, not mailbox
                  deliverability.
                </li>
                <li>
                  Cross-campaign overlap stays blocked from this training
                  campaign.
                </li>
                <li>
                  A reply, opt-out, or bounce must stop remaining messages and
                  route the record for review.
                </li>
                <li>
                  A sender must not restart automatically on a stated return
                  date. Campaign status never substitutes for a scheduler
                  receipt or SMTP acceptance.
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </section>

      <section className="border border-black/10 bg-white shadow-[0_16px_50px_rgba(0,0,0,.035)]">
        <div className="border-b border-black/10 p-5 sm:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#926000]">
            Ranked research queue
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
            Evidence before a campaign stage changes.
          </h2>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="flex min-w-0 items-center gap-2 border border-black/15 bg-[#faf7ef] px-3">
              <Search className="shrink-0 text-black/50" size={17} />
              <input
                aria-label="Search training prospects"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={event => setSearch(event.target.value)}
                placeholder="Search business, industry, location, contact, or email"
                value={search}
              />
            </label>
            <select
              aria-label="Filter training prospects"
              className="h-11 border border-black/15 bg-white px-3 text-sm"
              onChange={event => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">All prospects</option>
              <option value="top10">Top 10 only</option>
              <option value="verified">Public email source recorded</option>
              <option value="needs-evidence">Needs evidence</option>
              <option value="overlap">Cross-campaign overlap</option>
              <option value="not-fit">Not a fit</option>
            </select>
          </div>
          <p className="mt-3 text-xs leading-5 text-black/50">
            {visible.length} matching prospects · ranked by priority, then fit
            score. A published company inbox is not necessarily the named
            leader's address, and a source does not prove deliverability.
          </p>
        </div>

        <div className="grid min-w-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="max-h-[820px] overflow-y-auto border-b border-black/10 lg:border-b-0 lg:border-r">
            {visible.length ? (
              visible.map(prospect => {
                const contactVerified = hasPublicEmailEvidence(prospect);
                return (
                  <button
                    className={`w-full border-b border-black/10 p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#9b6a00] ${prospect.id === selected?.id ? "bg-black text-white" : "bg-white hover:bg-[#fff8e7]"}`}
                    key={prospect.id}
                    onClick={() => setSelectedId(prospect.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-bold">
                        {prospect.businessName}
                      </p>
                      <span
                        className={
                          prospect.id === selected?.id
                            ? "shrink-0 text-[#ffb627]"
                            : "shrink-0 text-[#926000]"
                        }
                      >
                        #{prospect.priorityRank}
                      </span>
                    </div>
                    <p className="mt-2 text-xs opacity-65">
                      {prospect.industry} · Fit {prospect.fitScore}
                    </p>
                    <p className="mt-2 text-xs opacity-65">
                      {contactVerified
                        ? "Public email source recorded"
                        : "Contact evidence incomplete"}
                    </p>
                    <p className="mt-2 text-xs opacity-65">
                      {statusLabels[prospect.status] ?? prospect.status}
                    </p>
                  </button>
                );
              })
            ) : (
              <p className="p-6 text-sm leading-6 text-black/55">
                {ranked.length
                  ? "No prospects match this filter."
                  : "Research is not populated yet. No placeholder prospects were created."}
              </p>
            )}
          </div>

          <div className="min-w-0 p-5 sm:p-7">
            {selected ? (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#926000]">
                      Priority {selected.priorityRank} · Fit score{" "}
                      {selected.fitScore}
                    </p>
                    <h3 className="mt-2 break-words text-2xl font-black tracking-[-0.04em]">
                      {selected.businessName}
                    </h3>
                    <p className="mt-2 text-sm text-black/60">
                      {[selected.location, selected.industry]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {safeUrl(selected.website) ? (
                    <a
                      className="inline-flex shrink-0 items-center gap-2 border border-black/15 px-3 py-2 text-xs font-bold transition hover:border-[#9b6a00] hover:bg-[#fff8e7]"
                      href={safeUrl(selected.website)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Official website <ExternalLink size={13} />
                    </a>
                  ) : null}
                </div>

                {selected.crossCampaignBlock ? (
                  <div className="mt-5 flex gap-3 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                    <AlertTriangle className="mt-1 shrink-0" size={18} />
                    <p>
                      <strong>Cross-campaign overlap blocked.</strong>{" "}
                      {selected.crossCampaignBlock}
                      <br />
                      This prospect remains research-only in this workspace.
                    </p>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <article className="border-l-4 border-[#ffb627] bg-[#fffaf0] p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#895b00]">
                      Evidence · observed facts
                    </p>
                    <p className="mt-3 text-sm leading-6 text-black/75">
                      {selected.verifiedObservation ||
                        "No verified observation recorded yet."}
                    </p>
                    <p className="mt-4 text-xs leading-5 text-black/60">
                      {selected.fitReason}
                    </p>
                  </article>
                  <article className="border-l-4 border-black bg-[#f7f5ef] p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-black/55">
                      Hypothesis · proposed use case
                    </p>
                    <p className="mt-3 text-sm leading-6 text-black/75">
                      {selected.useCase || "No proposed use case recorded yet."}
                    </p>
                    <p className="mt-4 text-xs leading-5 text-black/60">
                      This is a draft premise to validate with the client, not a
                      claim about their operation.
                    </p>
                  </article>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="border border-black/10 bg-white p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/50">
                      Client-approved pilot scope
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/70">
                      {selected.pilotScope || "Scope not recorded yet."}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-black/50">
                      One workflow · short private modules + checklist · not
                      safety consultancy · not an LMS.
                    </p>
                  </div>
                  <div className="border border-black/10 bg-white p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-black/50">
                      Organization facts not assumed
                    </p>
                    <dl className="mt-3 space-y-2 text-sm text-black/70">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>Budget</dt>
                        <dd className="font-semibold">Unknown</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>Employee count</dt>
                        <dd className="font-semibold">Unknown</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>Public size signal</dt>
                        <dd className="max-w-full break-words text-right font-semibold">
                          {selected.sizeIndicator || "Unknown"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 text-xs">
                      <SourceLink href={selected.sizeSourceUrl}>
                        Size-signal source
                      </SourceLink>
                    </div>
                  </div>
                </div>

                <section className="mt-6 border-t border-black/10 pt-6">
                  <div className="flex items-center gap-2">
                    <UsersRound className="text-[#926000]" size={18} />
                    <h4 className="font-black">Public contact evidence</h4>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="border border-black/10 bg-[#faf8f2] p-4">
                      <p className="text-xs font-bold text-black/70">
                        {selected.primaryContactName ||
                          "No named contact recorded"}
                      </p>
                      <p className="mt-1 text-xs text-black/55">
                        {selected.primaryContactTitle || "Title unknown"}
                      </p>
                      <div className="mt-3 text-xs">
                        <SourceLink href={selected.contactSourceUrl}>
                          Contact source
                        </SourceLink>
                      </div>
                    </div>
                    <div className="border border-black/10 bg-[#faf8f2] p-4">
                      <p className="text-xs font-bold text-black/70">
                        Public email evidence
                      </p>
                      <p className="mt-1 break-all text-sm text-black/65">
                        {selected.primaryEmail || "No public email recorded"}
                      </p>
                      <div className="mt-3 text-xs">
                        <SourceLink href={selected.primaryEmailSourceUrl}>
                          {hasPublicEmailEvidence(selected)
                            ? "Public email source (verified source)"
                            : "Public email source unavailable"}
                        </SourceLink>
                      </div>
                      <p className="mt-3 text-[11px] leading-4 text-black/50">
                        Source verification is not a promise of mailbox
                        deliverability.
                      </p>
                    </div>
                    <div className="border border-black/10 bg-[#faf8f2] p-4">
                      <p className="text-xs font-bold text-black/70">
                        Public phone evidence
                      </p>
                      <p className="mt-1 break-all text-sm text-black/65">
                        {selected.primaryPhone || "No public phone recorded"}
                      </p>
                      <div className="mt-3 text-xs">
                        <SourceLink href={selected.phoneSourceUrl}>
                          Phone source
                        </SourceLink>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mt-6 grid gap-4 xl:grid-cols-2">
                  <div className="border border-black/10 bg-white p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#895b00]">
                      Sourced facts
                    </p>
                    {selected.facts.length ? (
                      <ul className="mt-4 space-y-4">
                        {selected.facts.map((fact, index) => (
                          <li
                            className="text-sm leading-6 text-black/70"
                            key={`${fact.text}-${index}`}
                          >
                            <p>{fact.text}</p>
                            <div className="mt-1 text-xs">
                              <SourceLink href={fact.url}>
                                {fact.url}
                              </SourceLink>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-black/55">
                        No sourced facts recorded.
                      </p>
                    )}
                  </div>
                  <div className="border border-black/10 bg-white p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#895b00]">
                      Operational signals
                    </p>
                    {selected.operationalSignals.length ? (
                      <ul className="mt-4 space-y-4">
                        {selected.operationalSignals.map((signal, index) => (
                          <li
                            className="text-sm leading-6 text-black/70"
                            key={`${signal.text}-${index}`}
                          >
                            <p>{signal.text}</p>
                            <div className="mt-1 text-xs">
                              <SourceLink href={signal.url}>
                                {signal.url}
                              </SourceLink>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-black/55">
                        No operational signals recorded.
                      </p>
                    )}
                  </div>
                </section>

                <details className="mt-5 border border-black/10 bg-[#faf8f2] p-5">
                  <summary className="cursor-pointer font-bold">
                    All research sources and uncertainties
                  </summary>
                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/50">
                        Sources
                      </p>
                      {selected.sources.length ? (
                        <ul className="mt-3 space-y-4">
                          {selected.sources.map(
                            (source: ResearchSource, index: number) => (
                              <li
                                className="text-sm leading-5 text-black/70"
                                key={`${source.url}-${index}`}
                              >
                                <p>{source.supports}</p>
                                <div className="mt-1 text-xs">
                                  <SourceLink href={source.url}>
                                    {source.url}
                                  </SourceLink>
                                </div>
                              </li>
                            )
                          )}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-black/55">
                          No additional sources recorded.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/50">
                        Known unknowns
                      </p>
                      {selected.uncertainties.length ? (
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-5 text-black/70">
                          {selected.uncertainties.map(
                            (uncertainty: string, index: number) => (
                              <li key={`${uncertainty}-${index}`}>
                                {uncertainty}
                              </li>
                            )
                          )}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-black/55">
                          No additional uncertainties recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </details>

                <section className="mt-7 border-t border-black/10 pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#895b00]">
                        Exact message records
                      </p>
                      <h4 className="mt-1 text-xl font-black">
                        Three-step review sequence
                      </h4>
                    </div>
                    <p className="text-xs leading-5 text-black/50">
                      Planned, scheduled, sent, and SMTP receipt timestamps are
                      shown only when persisted by the campaign runtime.
                    </p>
                  </div>

                  {selectedCanShowMessages ? (
                    <>
                      <div
                        aria-label="Training message sequence"
                        className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
                        role="tablist"
                      >
                        {draftTabs.map(tab => (
                          <button
                            aria-controls={`training-draft-${tab.step}`}
                            aria-selected={step === tab.step}
                            className={`min-h-11 border px-4 py-2 text-left text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00] ${step === tab.step ? "border-black bg-black text-[#ffb627]" : "border-black/15 bg-white text-black hover:border-[#9b6a00] hover:bg-[#fff8e7]"}`}
                            key={tab.step}
                            id={`training-draft-tab-${tab.step}`}
                            onClick={() => setStep(tab.step)}
                            role="tab"
                            type="button"
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      {activeMessage ? (
                        <article
                          aria-labelledby={`training-draft-tab-${step}`}
                          className="mt-4 border border-black/10 bg-[#fffdf8] p-5 sm:p-6"
                          id={`training-draft-${step}`}
                          role="tabpanel"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-black/50">
                                <FileText size={15} /> Message stage ·{" "}
                                {messageStageLabel(activeMessage.status)}
                              </div>
                              <p className="mt-3 break-words text-lg font-black">
                                {activeMessage.subject}
                              </p>
                            </div>
                            <Button
                              className="shrink-0 rounded-none border-black/15 bg-white text-black hover:bg-black hover:text-white"
                              onClick={() =>
                                copyDraft(
                                  activeMessage.subject,
                                  activeMessage.textBody
                                )
                              }
                              type="button"
                              variant="outline"
                            >
                              <Clipboard /> Copy exact draft
                            </Button>
                          </div>
                          <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-black/80">
                            {activeMessage.textBody}
                          </p>
                          <dl className="mt-5 grid gap-3 border-t border-black/10 pt-4 text-xs text-black/65 sm:grid-cols-2">
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                Planned
                              </dt>
                              <dd className="mt-1">
                                {formatDateTime(activeMessage.plannedAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                Scheduled
                              </dt>
                              <dd className="mt-1">
                                {formatDateTime(activeMessage.scheduledAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                Sent
                              </dt>
                              <dd className="mt-1">
                                {formatDateTime(activeMessage.sentAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                SMTP receipt
                              </dt>
                              <dd className="mt-1">
                                {formatDateTime(activeMessage.smtpAcceptedAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                Provider receipt ID
                              </dt>
                              <dd className="mt-1 break-all">
                                {activeMessage.providerMessageId ||
                                  "Not recorded"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-bold uppercase tracking-[0.12em] text-black/45">
                                Provider delivery receipt
                              </dt>
                              <dd className="mt-1">
                                {formatDateTime(activeMessage.deliveredAt)}
                              </dd>
                            </div>
                            {activeMessage.error ? (
                              <div>
                                <dt className="font-bold uppercase tracking-[0.12em] text-red-700">
                                  Error
                                </dt>
                                <dd className="mt-1 break-words text-red-800">
                                  {activeMessage.error}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </article>
                      ) : (
                        <p className="mt-4 border border-black/10 bg-[#faf8f2] p-5 text-sm leading-6 text-black/55">
                          No reviewed draft is available for this sequence step.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="mt-5 border border-dashed border-black/20 bg-[#faf8f2] p-5 text-sm leading-6 text-black/60">
                      No persisted message sequence is available for this
                      record. Research remains available above; no message stage
                      or send history is inferred.
                    </div>
                  )}
                </section>

                <section className="mt-7 border-t border-black/10 pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#895b00]">
                        Lead outcome
                      </p>
                      <h4 className="mt-1 text-xl font-black">
                        Record commercial result separately
                      </h4>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
                        Outcome tracking does not alter a message, SMTP receipt,
                        reply status, opt-out, or any delivery control.
                      </p>
                    </div>
                    <Badge
                      className={`rounded-none px-3 py-1.5 ${selectedLeadOutcome.leadOutcome === "closed" ? "bg-emerald-700 text-white hover:bg-emerald-700" : selectedLeadOutcome.leadOutcome === "not_closed" ? "bg-black text-[#ffb627] hover:bg-black" : "bg-[#f4f0e6] text-black hover:bg-[#f4f0e6]"}`}
                    >
                      {selectedLeadOutcome.leadOutcome === "closed"
                        ? "Closed"
                        : selectedLeadOutcome.leadOutcome === "not_closed"
                          ? "Not Closed"
                          : "No outcome recorded"}
                    </Badge>
                  </div>
                  {selectedLeadOutcome.leadOutcome === "not_closed" &&
                  selectedLeadOutcome.notClosedReason ? (
                    <div className="mt-4 border-l-4 border-black bg-[#f7f5ef] p-4 text-sm leading-6 text-black/75">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/50">
                        Not Closed reason
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words">
                        {selectedLeadOutcome.notClosedReason}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button
                      className="rounded-none bg-emerald-700 text-white hover:bg-emerald-800"
                      disabled={updateLeadOutcome.isPending}
                      onClick={() =>
                        updateLeadOutcome.mutate({
                          prospectId: selected.id,
                          leadOutcome: "closed",
                          notClosedReason: null,
                        })
                      }
                      type="button"
                    >
                      {updateLeadOutcome.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}
                      Mark Closed
                    </Button>
                    <Button
                      className="rounded-none border-black/15 bg-white text-black hover:bg-[#fff8e7]"
                      disabled={updateLeadOutcome.isPending}
                      onClick={() => {
                        setNotClosedReason(
                          selectedLeadOutcome.notClosedReason ?? ""
                        );
                        setOutcomeDialogOpen(true);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Mark Not Closed
                    </Button>
                    {selectedLeadOutcome.leadOutcome ? (
                      <Button
                        className="rounded-none border-black/15 bg-white text-black hover:bg-black hover:text-white"
                        disabled={updateLeadOutcome.isPending}
                        onClick={() =>
                          updateLeadOutcome.mutate({
                            prospectId: selected.id,
                            leadOutcome: null,
                            notClosedReason: null,
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        Clear outcome
                      </Button>
                    ) : null}
                  </div>
                  <Dialog
                    onOpenChange={open => {
                      if (!updateLeadOutcome.isPending) {
                        setOutcomeDialogOpen(open);
                        if (!open) setNotClosedReason("");
                      }
                    }}
                    open={outcomeDialogOpen}
                  >
                    <DialogContent className="rounded-none border-black/15 bg-white">
                      <DialogHeader>
                        <DialogTitle className="text-xl font-black">
                          Mark {selected.businessName} as Not Closed
                        </DialogTitle>
                        <DialogDescription className="leading-6 text-black/60">
                          A nonempty reason is required. This records a lead
                          outcome only and does not change delivery history.
                        </DialogDescription>
                      </DialogHeader>
                      <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-black/55">
                        Reason <span className="text-red-700">Required</span>
                        <Textarea
                          aria-label="Not Closed reason"
                          className="mt-3 min-h-28 rounded-none border-black/15 text-sm font-normal leading-6 normal-case tracking-normal focus-visible:border-[#9b6a00] focus-visible:ring-[#ffcf5d]/40"
                          maxLength={4000}
                          onChange={event =>
                            setNotClosedReason(event.target.value)
                          }
                          placeholder="Record why this lead did not close."
                          value={notClosedReason}
                        />
                      </label>
                      <DialogFooter>
                        <Button
                          className="rounded-none"
                          disabled={updateLeadOutcome.isPending}
                          onClick={() => setOutcomeDialogOpen(false)}
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                        <Button
                          className="rounded-none bg-black text-[#ffb627] hover:bg-black/85"
                          disabled={
                            updateLeadOutcome.isPending ||
                            !notClosedReason.trim()
                          }
                          onClick={() =>
                            updateLeadOutcome.mutate({
                              prospectId: selected.id,
                              leadOutcome: "not_closed",
                              notClosedReason,
                            })
                          }
                          type="button"
                        >
                          {updateLeadOutcome.isPending ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          Save Not Closed
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </section>

                <section className="mt-7 border-t border-black/10 pt-6">
                  <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-black/55">
                    Manual review notes
                    <textarea
                      className="mt-3 min-h-28 w-full rounded-none border border-black/15 bg-white p-3 text-sm font-normal leading-6 normal-case tracking-normal text-black outline-none focus:border-[#9b6a00] focus:ring-2 focus:ring-[#ffcf5d]/40"
                      onChange={event => setNotes(event.target.value)}
                      placeholder="Record evidence gaps, relevance, or an edit request."
                      value={notes}
                    />
                  </label>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button
                      className="rounded-none border-black/15 bg-white text-black hover:bg-black hover:text-white"
                      disabled={
                        update.isPending ||
                        notes === (selected.manualNotes ?? "")
                      }
                      onClick={() =>
                        update.mutate({ id: selected.id, manualNotes: notes })
                      }
                      type="button"
                      variant="outline"
                    >
                      {update.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}
                      Save notes
                    </Button>
                    <Button
                      className="rounded-none border-red-200 bg-white text-red-800 hover:bg-red-50"
                      disabled={
                        update.isPending || selected.status === "not_fit"
                      }
                      onClick={() =>
                        update.mutate({ id: selected.id, status: "not_fit" })
                      }
                      type="button"
                      variant="outline"
                    >
                      Remove from campaign
                    </Button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-black/50">
                    Removal records this prospect as Not a fit. Terminal and
                    excluded records have no automatic revival, and this screen
                    does not infer authorization or a send from a saved review.
                  </p>
                </section>
              </>
            ) : (
              <p className="py-20 text-center text-sm text-black/55">
                No prospect matches this view. Adjust the search or filter to
                review research.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="border border-black/10 bg-white p-5 sm:p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#895b00]">
          Actual outgoing activity only
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-2xl font-black">{data.stats.smtpAccepted}</p>
            <p className="mt-1 text-xs leading-5 text-black/55">
              SMTP accepted — only actual persisted acceptance; prepared or
              scheduled messages are excluded.
            </p>
          </div>
          <div>
            <p className="text-2xl font-black">{data.stats.replies}</p>
            <p className="mt-1 text-xs leading-5 text-black/55">
              Recorded replies only. Any reply, including out-of-office, stops
              remaining messages for that prospect.
            </p>
          </div>
          <div>
            <p className="text-2xl font-black">{data.stats.meetings}</p>
            <p className="mt-1 text-xs leading-5 text-black/55">
              Meetings — only actual API-recorded outcomes; no inferred result
              is counted.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
