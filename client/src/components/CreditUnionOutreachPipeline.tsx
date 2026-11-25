import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { CreditUnionObservedOutcomeEvent } from "../../../shared/creditUnionOutreach";
import {
  compareCreditUnionLaunchPriority,
  getCreditUnionGeographicPriority,
} from "../../../shared/creditUnionTargeting";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import CreditUnionOperationsPanel from "./CreditUnionOperationsPanel";

const statusLabels: Record<string, string> = {
  review: "Needs review",
  verification_needed: "Contact verification needed",
  approved: "Drafts approved",
  replied: "Replied",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  meeting: "Consultation booked",
  consultation_complete: "Consultation completed",
  qualified_opportunity: "Qualified opportunity",
  not_fit: "Not fit",
  complete: "Complete",
};
const confidenceLabels: Record<string, string> = {
  officially_published: "Exact email published by the organization",
  independently_verified: "Independently verified email",
  unverified: "Unverified: blocked from sending",
  not_found: "No verified business email found",
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

export default function CreditUnionOutreachPipeline() {
  const utils = trpc.useUtils();
  const workspace = trpc.creditUnion.workspace.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [region, setRegion] = useState("south-texas");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("positive_reply");
  const [outcomeDetail, setOutcomeDetail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [emailSource, setEmailSource] = useState("");
  const [roleSource, setRoleSource] = useState("");
  const [emailConfidence, setEmailConfidence] = useState("not_found");
  const invalidate = () => utils.creditUnion.workspace.invalidate();
  const approve = trpc.creditUnion.approveSequence.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(
        "Three messages approved for the next eligible scheduled window."
      );
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.creditUnion.updateProspect.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Review notes saved");
    },
    onError: error => toast.error(error.message),
  });
  const recordOutcome = trpc.creditUnion.recordEvent.useMutation({
    onSuccess: async () => {
      await invalidate();
      setOutcomeDetail("");
      toast.success("Outcome recorded. No email was sent.");
    },
    onError: error => toast.error(error.message),
  });
  const data = workspace.data;
  const sorted = useMemo(
    () => [...(data?.prospects ?? [])].sort(compareCreditUnionLaunchPriority),
    [data?.prospects]
  );
  const visible = sorted.filter(p => {
    const haystack =
      `${p.creditUnionName} ${p.headquartersCity} ${p.primaryContactName ?? ""} ${p.primaryContactTitle ?? ""} ${p.primaryEmail ?? ""}`.toLowerCase();
    return (
      haystack.includes(search.toLowerCase()) &&
      (region === "all" ||
        (region === "south-texas"
          ? getCreditUnionGeographicPriority(p).southTexas
          : !getCreditUnionGeographicPriority(p).southTexas)) &&
      (filter === "all" ||
        (filter === "email-ready"
          ? p.readiness.ready
          : filter === "verification"
            ? p.status === "verification_needed"
            : filter === "top25"
              ? Boolean(
                  p.research?.shortlistRank && p.research.shortlistRank <= 25
                )
              : p.status === filter))
    );
  });
  const selected = visible.find(p => p.id === selectedId) ?? visible[0];
  useEffect(() => {
    setNotes(selected?.manualNotes ?? "");
    setContactName(selected?.primaryContactName ?? "");
    setContactTitle(selected?.primaryContactTitle ?? "");
    setContactEmail(selected?.primaryEmail ?? "");
    setEmailSource(selected?.primaryEmailSourceUrl ?? "");
    setRoleSource(selected?.primaryRoleSourceUrl ?? "");
    setEmailConfidence(selected?.emailConfidence ?? "not_found");
    setStep(0);
    setOutcomeDetail("");
  }, [
    selected?.id,
    selected?.manualNotes,
    selected?.primaryContactName,
    selected?.primaryContactTitle,
    selected?.primaryEmail,
    selected?.primaryEmailSourceUrl,
    selected?.primaryRoleSourceUrl,
    selected?.emailConfidence,
  ]);
  const selectedMessages = (data?.messages ?? [])
    .filter(m => m.prospectId === selected?.id)
    .sort((a, b) => a.sequenceStep - b.sequenceStep);
  const message = selectedMessages.find(m => m.sequenceStep === step);
  if (workspace.isLoading)
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-3 text-black/60">
        <Loader2 className="animate-spin" />
        Loading credit-union review pipeline…
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
  const { campaign, stats } = data;

  return (
    <div className="space-y-7 p-5 sm:p-8 lg:p-10">
      <div className="border border-[#ddc789] bg-[#fff8e7] p-6 sm:flex sm:items-start sm:justify-between sm:gap-6">
        <div className="flex gap-4">
          <LockKeyhole className="mt-1 shrink-0 text-[#9b6a00]" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
              Separate campaign · Credit-union outreach
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Texas credit-union content campaign
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/65">
              Review researched organizations, exact contact evidence, and all
              three personalized messages here. Sending and tracking are
              app-owned; the Chamber pipeline stays separate.
            </p>
          </div>
        </div>
        <Badge className="mt-4 shrink-0 rounded-none bg-black px-4 py-2 text-[#ffb627] sm:mt-0">
          Credit-union campaign · {campaign.status}
        </Badge>
      </div>
      <CreditUnionOperationsPanel />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Qualified organizations"
          value={stats.qualifiedOrganizations}
          note="Distinct researched credit unions, not assumed email-ready contacts."
        />
        <Metric
          label="Named contacts"
          value={stats.namedContacts}
          note="Researched contacts and stakeholders. Marketing remit and exact email must be verified."
        />
        <Metric
          label="Verified contacts"
          value={stats.emailReady}
          note="Named contacts with exact email and current-role evidence."
        />
        <Metric
          label="Verification needed"
          value={stats.verificationNeeded}
          note="Missing or uncertain business contact data stays blocked."
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <section className="border border-black/10 bg-black p-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ffb627]">
            Sending configuration
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              [
                "Days 1, 4, and 9",
                "Follow-ups use offsets 3 and 8 days from the actual first send; their weekend dates roll to weekdays. New introductions run every day.",
              ],
              [
                `${campaign.dailyNewLimit} new contacts per day, seven days a week`,
                "Follow-ups are additional. One active contact per organization.",
              ],
              [
                "Credit-union social content",
                "Reach the next generation, keep content current, then connect interest to measurable follow-up. One new concern per email.",
              ],
              [
                "South Texas first",
                "Start with the Coastal Bend, Valley and Laredo, then San Antonio and nearby border markets. Keep wider Texas for expansion.",
              ],
              [
                "Reply-aware",
                "Inbox reply checks run before sending. A detected reply, opt-out, or bounce cancels remaining touches.",
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
            <h3 className="text-xl font-black">Sending safeguards</h3>
          </div>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-black/65">
            <li>Preserve the approved regional priority and exact messages.</li>
            <li>
              Confirm addresses, roles, duplicate checks, and suppression.
            </li>
            <li>
              {campaign.dailyNewLimit} new contacts per day, including weekends;
              follow-ups do not consume that limit.
            </li>
            <li>
              Only verified contacts enter the ready queue. Unknown addresses
              remain blocked.
            </li>
          </ul>
          <p className="mt-4 border-t border-black/10 pt-4 text-xs text-black/50">
            Sender: {campaign.senderEmail}. Free 15–20-minute consultation is
            the only primary invitation. No prices, packages, or claimed
            credit-union results.
          </p>
        </section>
      </div>
      <section className="border border-black/10 bg-white">
        <div className="border-b border-black/10 p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
            Prospect and message review
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Your credit-union shortlist and three-email sequences
          </h2>
          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_210px_210px]">
            <label className="flex items-center gap-2 border border-black/15 bg-[#f8f5ee] px-3">
              <Search size={17} />
              <input
                aria-label="Search credit union prospects"
                className="h-11 w-full bg-transparent text-sm outline-none"
                placeholder="Search institution, city, contact, or email"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter credit union region"
              className="h-11 border border-black/15 bg-white px-3 text-sm"
              value={region}
              onChange={e => setRegion(e.target.value)}
            >
              <option value="south-texas">South Texas first</option>
              <option value="expansion">Texas expansion queue</option>
              <option value="all">All Texas prospects</option>
            </select>
            <select
              aria-label="Filter credit union prospects"
              className="h-11 border border-black/15 bg-white px-3 text-sm"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">All prospects</option>
              <option value="top25">Top 25 launch priority</option>
              <option value="email-ready">Ready for draft approval</option>
              <option value="verification">Verification needed</option>
              <option value="approved">Drafts approved</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-black/45">
            {visible.length} matching organizations. Source links and
            missing-data notices are retained.
          </p>
        </div>
        <div className="grid lg:grid-cols-[310px_1fr]">
          <div className="max-h-[840px] overflow-y-auto border-b border-black/10 lg:border-b-0 lg:border-r">
            {visible.length ? (
              visible.map((p, index) => (
                <button
                  key={p.id}
                  className={`w-full border-b border-black/10 p-4 text-left ${p.id === selected?.id ? "bg-black text-white" : "bg-white hover:bg-[#fff8e7]"}`}
                  onClick={() => {
                    setSelectedId(p.id);
                    setStep(0);
                  }}
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-bold">{p.creditUnionName}</p>
                    <span className="text-[#b58417]">{p.fitScore}</span>
                  </div>
                  <p className="mt-2 text-xs opacity-65">
                    {p.headquartersCity} ·{" "}
                    {p.primaryContactName || "Contact not found"}
                  </p>
                  <p className="mt-2 text-xs opacity-65">
                    {statusLabels[p.status] ?? p.status}
                  </p>
                  <p className="mt-2 text-xs opacity-65">
                    {getCreditUnionGeographicPriority(p).label}
                  </p>
                </button>
              ))
            ) : (
              <p className="p-6 text-sm text-black/55">
                {sorted.length
                  ? "No matching records."
                  : "Research is in progress. No placeholder leads have been imported."}
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
                      {selected.creditUnionName}
                    </h3>
                    <p className="mt-2 text-sm text-black/60">
                      {selected.primaryContactName ||
                        "Named contact not verified"}
                      {selected.primaryContactTitle
                        ? ` · ${selected.primaryContactTitle}`
                        : ""}
                    </p>
                    <p className="mt-1 break-all text-sm text-black/60">
                      {selected.primaryEmail ||
                        "No verified business email. Do not send."}
                    </p>
                    <p className="mt-2 text-xs text-black/50">
                      {confidenceLabels[selected.emailConfidence] ??
                        selected.emailConfidence}
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
                <p className="mt-5 text-sm leading-6 text-black/65">
                  {selected.fitReason}
                </p>
                <p className="mt-3 text-xs font-bold text-[#916100]">
                  {getCreditUnionGeographicPriority(selected).label}
                </p>
                {selected.research?.shortlistRank ? (
                  <p className="mt-3 border border-[#ddc789] bg-[#fff8e7] p-3 text-xs leading-6 text-black/65">
                    <strong>
                      Priority {selected.research.shortlistRank} of 25.
                    </strong>{" "}
                    {selected.research.shortlistReason}
                  </p>
                ) : null}
                <div className="mt-4 border-l-2 border-[#ffb627] pl-4">
                  <p className="text-xs font-bold uppercase tracking-wider">
                    Content opportunities to discuss
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-6 text-black/65">
                    {(Array.isArray(selected.research?.observedOpportunities)
                      ? selected.research.observedOpportunities
                      : []
                    ).map((idea: unknown, index: number) => (
                      <li key={index}>{String(idea)}</li>
                    ))}
                  </ul>
                </div>
                {selected.readiness.reasons.filter(
                  reason =>
                    !(
                      selected.status === "approved" &&
                      reason ===
                        "Exactly three unapproved draft messages are required."
                    )
                ).length ? (
                  <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
                    <strong>Review blockers:</strong>
                    <ul>
                      {selected.readiness.reasons
                        .filter(
                          reason =>
                            !(
                              selected.status === "approved" &&
                              reason ===
                                "Exactly three unapproved draft messages are required."
                            )
                        )
                        .map(reason => (
                          <li key={reason}>{reason}</li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-2">
                  {selectedMessages.map(m => (
                    <Button
                      key={m.id}
                      variant={step === m.sequenceStep ? "default" : "outline"}
                      className="rounded-none"
                      onClick={() => setStep(m.sequenceStep)}
                    >
                      Email {m.sequenceStep + 1} · Day {m.dayOffset + 1}
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
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-black/55">
                      Planned:{" "}
                      {message.plannedAt
                        ? new Date(message.plannedAt).toLocaleString("en-US", {
                            timeZone: "America/Chicago",
                          }) + " Central"
                        : "After initial send"}
                      . SMTP accepted:{" "}
                      {message.smtpAcceptedAt
                        ? new Date(message.smtpAcceptedAt).toLocaleString()
                        : "Not sent"}
                      .{message.error ? ` Status note: ${message.error}` : ""}
                    </p>
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-black/80">
                      {message.textBody}
                    </p>
                  </article>
                ) : (
                  <p className="mt-6 border border-black/10 bg-[#f8f5ee] p-6 text-sm text-black/55">
                    No reviewed draft for this step yet.
                  </p>
                )}
                <Button
                  className="mt-4 rounded-none bg-[#ffb627] font-bold text-black hover:bg-[#e5a31d]"
                  disabled={
                    approve.isPending ||
                    !selected.readiness.ready ||
                    selectedMessages.length !== 3 ||
                    selectedMessages.every(m => m.status === "approved")
                  }
                  onClick={() => approve.mutate({ prospectId: selected.id })}
                >
                  {approve.isPending ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}
                  Approve these three messages
                </Button>
                <p className="mt-2 text-xs text-black/50">
                  Approving this sequence does not send immediately. The
                  scheduler uses the campaign status, daily limit, and reply
                  checks.
                </p>
                {selectedMessages.length === 3 ? (
                  <p className="mt-2 text-xs text-black/50">
                    Follow-up dates are anchored to the actual initial send, not
                    to draft creation. Accepted sends and upcoming dates are
                    tracked below.
                  </p>
                ) : null}
                <details className="mt-7 border-t border-black/10 pt-4">
                  <summary className="cursor-pointer text-sm font-bold">
                    Research evidence and contact sources
                  </summary>
                  <p className="mt-4 text-xs leading-6 text-black/60">
                    {selected.branchCount == null
                      ? "Branch count not confirmed"
                      : `${selected.branchCount} branches`}
                    {selected.branchCountNote
                      ? ` · ${selected.branchCountNote}`
                      : ""}
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
                  <div className="mt-5 space-y-3">
                    {selected.contacts.map((contact, index) => (
                      <div
                        key={index}
                        className="border border-black/10 p-3 text-xs leading-6"
                      >
                        <p className="font-bold">
                          {contact.name} · {contact.title}
                        </p>
                        <p>
                          {contact.businessEmail || "Business email not found"}{" "}
                          · {contact.emailStatus}
                        </p>
                        {safeUrl(contact.roleSourceUrl) ? (
                          <a
                            className="mr-3 text-[#916100] underline"
                            href={safeUrl(contact.roleSourceUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Role evidence
                          </a>
                        ) : null}
                        {safeUrl(contact.emailSourceUrl) ? (
                          <a
                            className="text-[#916100] underline"
                            href={safeUrl(contact.emailSourceUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Email evidence
                          </a>
                        ) : null}
                        <p className="text-black/60">{contact.notes}</p>
                      </div>
                    ))}
                  </div>
                </details>
                <label className="mt-6 block text-xs font-bold uppercase tracking-wider">
                  Review notes
                  <textarea
                    className="mt-2 min-h-24 w-full border border-black/15 p-3 text-sm font-normal normal-case tracking-normal"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Record verification, relevance, or message edits to request."
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
                    Verify or update the primary contact
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-black/55">
                    Use an exact published or independently verified work email
                    and a current role source. Do not guess an address or assign
                    a departmental inbox to a person. An official general
                    marketing inbox must use “Marketing team” and “Marketing
                    department” with official email and department source URLs;
                    communications uses the equivalent team and department
                    labels. General service or restricted-purpose inboxes stay
                    blocked. Saving only updates research and drafts, never
                    sends.
                  </p>
                  <form
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                    onSubmit={event => {
                      event.preventDefault();
                      update.mutate({
                        id: selected.id,
                        primaryContactName: contactName.trim() || null,
                        primaryContactTitle: contactTitle.trim() || null,
                        primaryEmail: contactEmail.trim() || null,
                        primaryEmailSourceUrl: emailSource.trim() || null,
                        primaryRoleSourceUrl: roleSource.trim() || null,
                        emailConfidence: emailConfidence as
                          | "officially_published"
                          | "independently_verified"
                          | "unverified"
                          | "not_found",
                      });
                    }}
                  >
                    {[
                      {
                        label: "Contact name",
                        value: contactName,
                        setter: setContactName,
                        type: "text",
                      },
                      {
                        label: "Current role",
                        value: contactTitle,
                        setter: setContactTitle,
                        type: "text",
                      },
                      {
                        label: "Exact work email",
                        value: contactEmail,
                        setter: setContactEmail,
                        type: "email",
                      },
                      {
                        label: "Email evidence URL",
                        value: emailSource,
                        setter: setEmailSource,
                        type: "url",
                      },
                      {
                        label: "Current role evidence URL",
                        value: roleSource,
                        setter: setRoleSource,
                        type: "url",
                      },
                    ].map(field => (
                      <label key={field.label} className="text-xs font-bold">
                        {field.label}
                        <input
                          className="mt-2 h-11 w-full border border-black/15 px-3 text-sm font-normal"
                          value={field.value}
                          type={field.type}
                          onChange={event => field.setter(event.target.value)}
                        />
                      </label>
                    ))}
                    <label className="text-xs font-bold">
                      Email evidence status
                      <select
                        className="mt-2 h-11 w-full border border-black/15 bg-white px-3 text-sm font-normal"
                        value={emailConfidence}
                        onChange={event =>
                          setEmailConfidence(event.target.value)
                        }
                      >
                        {Object.entries(confidenceLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      className="rounded-none sm:col-span-2"
                      disabled={update.isPending}
                    >
                      Save contact evidence
                    </Button>
                  </form>
                </details>
                <details className="mt-6 border-t border-black/10 pt-4">
                  <summary className="cursor-pointer text-sm font-bold">
                    Log an actual reply or consultation outcome
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-black/55">
                    Only record an observed event, never a projected result.
                    Reply, opt-out, and bounce events cancel remaining drafts.
                  </p>
                  <label className="mt-3 block text-xs font-bold">
                    Event
                    <select
                      className="mt-2 h-11 w-full border border-black/15 bg-white px-3 text-sm font-normal"
                      value={outcome}
                      onChange={e => setOutcome(e.target.value)}
                    >
                      {[
                        ["reply", "Reply received"],
                        ["positive_reply", "Positive reply"],
                        ["meeting", "Consultation booked"],
                        ["consultation_complete", "Consultation completed"],
                        ["qualified_opportunity", "Qualified opportunity"],
                        ["unsubscribed", "Opt-out requested"],
                        ["bounced", "Bounce received"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 block text-xs font-bold">
                    Evidence or context
                    <textarea
                      className="mt-2 min-h-20 w-full border border-black/15 p-3 text-sm font-normal"
                      value={outcomeDetail}
                      onChange={e => setOutcomeDetail(e.target.value)}
                      placeholder="Meeting date, reply summary, or relevant evidence."
                    />
                  </label>
                  <Button
                    className="mt-3 rounded-none"
                    variant="outline"
                    disabled={recordOutcome.isPending || !outcomeDetail.trim()}
                    onClick={() =>
                      recordOutcome.mutate({
                        prospectId: selected.id,
                        eventType: outcome as CreditUnionObservedOutcomeEvent,
                        detail: outcomeDetail.trim(),
                      })
                    }
                  >
                    Record observed outcome
                  </Button>
                </details>
              </>
            ) : (
              <p className="py-20 text-center text-black/50">
                No prospects match this view. Change the filters to see the
                remaining queue.
              </p>
            )}
          </div>
        </div>
      </section>
      <section>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
          Campaign-specific reporting
        </p>
        <h2 className="mt-2 text-2xl font-black">
          Consultations and opportunities, not vanity metrics
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="SMTP accepted"
            value={stats.smtpAccepted}
            note="Accepted by sender transport, not a delivery guarantee."
          />
          <Metric
            label="Confirmed delivery"
            value={stats.confirmedDelivered}
            note="Only explicit delivery evidence is counted."
          />
          <Metric
            label="Replies"
            value={stats.replies}
            note={`${stats.positiveReplies} positive replies logged.`}
          />
          <Metric
            label="Consultations booked"
            value={stats.meetings}
            note={`${stats.completedConsultations} completed; ${stats.qualifiedOpportunities} qualified opportunities.`}
          />
        </div>
        <p className="mt-4 text-xs leading-6 text-black/50">
          Metrics count observed outcomes only. No automatic membership growth,
          positive response, or revenue is assumed. Outcome logging is separate
          from live email sending.
        </p>
      </section>
      <section className="border border-black/10 bg-white p-5 sm:p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#916100]">
          Persisted campaign activity
        </p>
        <h3 className="mt-2 text-xl font-black">
          Sends, reply checks, and operational status
        </h3>
        <div className="mt-4 max-h-96 overflow-y-auto divide-y divide-black/10">
          {data.events.slice(0, 50).map(event => (
            <div key={event.id} className="py-3">
              <p className="text-xs font-bold">
                {event.eventType.replaceAll("_", " ")} ·{" "}
                {new Date(event.occurredAt).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })}{" "}
                Central
              </p>
              <p className="mt-1 text-xs leading-6 text-black/60">
                {event.detail || "Activity recorded"}
              </p>
            </div>
          ))}
          {!data.events.length ? (
            <p className="py-4 text-sm text-black/55">
              No campaign activity recorded yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
