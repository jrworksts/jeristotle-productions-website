import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  PauseCircle,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import OutreachOperationsPanel from "./OutreachOperationsPanel";

const statusLabels: Record<string, string> = {
  queued: "Queued",
  researching: "Researching",
  review: "Needs review",
  approved: "Approved",
  in_sequence: "In sequence",
  replied: "Replied",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  meeting: "Meeting",
  not_fit: "Not fit",
  complete: "Sequence complete",
};

const sequenceLabels: Record<number, string> = {
  0: "Introduction",
  1: "Follow-up 1",
  2: "Follow-up 2",
  3: "Follow-up 3",
};

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="border border-black/10 bg-white p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-black/45">
        {label}
      </p>
      <p className="mt-3 font-display text-4xl leading-none tracking-[-0.05em]">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-black/55">{helper}</p>
    </div>
  );
}

export default function ChamberOutreachPipeline() {
  const utils = trpc.useUtils();
  const workspace = trpc.chamber.outreachWorkspace.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [selectedProspectId, setSelectedProspectId] = useState<number | null>(
    null
  );
  const [selectedStep, setSelectedStep] = useState(0);
  const [postalAddress, setPostalAddress] = useState("");

  const invalidate = () => utils.chamber.outreachWorkspace.invalidate();
  const saveCampaign = trpc.chamber.updateOutreachCampaign.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Outreach settings saved");
    },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.chamber.approveOutreachSequence.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Four-message sequence approved");
    },
    onError: error => toast.error(error.message),
  });
  const updateProspect = trpc.chamber.updateOutreachProspect.useMutation({
    onSuccess: invalidate,
    onError: error => toast.error(error.message),
  });

  const data = workspace.data;
  const messagesByProspect = useMemo(() => {
    const map = new Map<number, NonNullable<typeof data>["messages"]>();
    for (const message of data?.messages || []) {
      const current = map.get(message.prospectId) || [];
      current.push(message);
      map.set(message.prospectId, current);
    }
    return map;
  }, [data]);
  useEffect(() => {
    if (selectedProspectId !== null || !data) return;
    const first =
      data.prospects.find(
        prospect =>
          ["approved", "review"].includes(prospect.status) &&
          messagesByProspect.has(prospect.id)
      ) || data.prospects.find(prospect => messagesByProspect.has(prospect.id));
    if (first) setSelectedProspectId(first.id);
  }, [data, messagesByProspect, selectedProspectId]);

  if (workspace.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-black/55">
        <Loader2 className="animate-spin" /> Loading outreach pipeline…
      </div>
    );
  }
  if (workspace.error || !data?.campaign) {
    return (
      <div className="p-5 sm:p-8 lg:p-10">
        <div className="border border-red-200 bg-red-50 p-6 text-red-900">
          {workspace.error?.message || "Outreach campaign is unavailable."}
        </div>
      </div>
    );
  }

  const { campaign, prospects, messages, runs, recentEvents } = data;
  const totalSent = messages.filter(
    message => message.status === "sent"
  ).length;
  const approvedProspectIds = new Set(
    prospects
      .filter(prospect => prospect.status === "approved")
      .map(prospect => prospect.id)
  );
  const readyApprovals = messages.filter(
    message =>
      message.sequenceStep === 0 &&
      message.status === "approved" &&
      approvedProspectIds.has(message.prospectId)
  ).length;
  const blockedResearch = prospects.filter(
    prospect => prospect.researchStatus === "failed"
  ).length;
  const incompleteRuns = runs.filter(run => run.status === "started").length;
  const latestRun = [...runs].sort((left, right) => {
    const byDate = right.runDate.localeCompare(left.runDate);
    if (byDate !== 0) return byDate;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0];
  const latestRunSentNothing = Boolean(
    campaign.status === "active" && latestRun && latestRun.newSent === 0
  );
  const operationalState =
    campaign.status !== "active"
      ? `Campaign ${campaign.status}`
      : incompleteRuns > 0
        ? `${incompleteRuns} run${incompleteRuns === 1 ? "" : "s"} incomplete`
        : latestRunSentNothing
          ? "Latest run sent 0 new messages"
          : readyApprovals === 0
            ? "Active, no approved new messages ready"
            : "Automatic sends active";
  const replyCount = prospects.filter(
    prospect => prospect.status === "replied"
  ).length;
  const meetingCount = prospects.filter(
    prospect => prospect.status === "meeting"
  ).length;
  const reviewProspects = prospects
    .filter(prospect => messagesByProspect.has(prospect.id))
    .sort((a, b) => {
      const priority = (status: string) =>
        status === "approved" ? 0 : status === "review" ? 1 : 2;
      return priority(a.status) - priority(b.status) || b.fitScore - a.fitScore;
    });
  const selectedProspect = reviewProspects.find(
    prospect => prospect.id === selectedProspectId
  );
  const selectedMessages = selectedProspect
    ? (messagesByProspect.get(selectedProspect.id) || []).sort(
        (a, b) => a.sequenceStep - b.sequenceStep
      )
    : [];
  const selectedMessage = selectedMessages.find(
    message => message.sequenceStep === selectedStep
  );
  const filteredProspects = prospects
    .filter(prospect => {
      const query = search.toLowerCase();
      return (
        !query ||
        prospect.businessName.toLowerCase().includes(query) ||
        prospect.email.toLowerCase().includes(query) ||
        prospect.category.toLowerCase().includes(query)
      );
    })
    .slice(0, 50);

  return (
    <div className="space-y-8 p-5 sm:p-8 lg:p-10">
      <OutreachOperationsPanel onUpdate={invalidate} />
      <div className="border border-[#e4ca84] bg-[#fff8e7] p-6 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div className="flex gap-4">
          <PauseCircle className="mt-1 shrink-0 text-[#9b6a00]" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
              Approval-first automation
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              Campaign status: {campaign.status}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
              The system is built for {campaign.dailyNewLimit} new Chamber
              introductions each business day. Follow-ups are additional, spaced
              three days apart, and stop when a reply or opt-out is detected.
              Company research is prepared separately from the delivery window.
              Approved messages remain available to review here.
            </p>
          </div>
        </div>
        <Badge
          className={`mt-5 whitespace-normal break-words rounded-none px-4 py-2 lg:mt-0 ${
            campaign.status === "active" &&
            !latestRunSentNothing &&
            incompleteRuns === 0 &&
            readyApprovals > 0
              ? "bg-black text-[#ffb627]"
              : "bg-[#8f2d20] text-white"
          }`}
        >
          {operationalState}
        </Badge>
      </div>

      {latestRunSentNothing ? (
        <div className="flex gap-4 border border-[#e4a79b] bg-[#fff1ee] p-5 text-[#5d241b]">
          <AlertTriangle className="mt-1 shrink-0 text-[#a03322]" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#a03322]">
              Recent run warning
            </p>
            <p className="mt-2 text-sm leading-6">
              The active campaign's latest run on {latestRun?.runDate} sent 0
              new messages.{" "}
              {latestRun?.summary || "Review the run and ready queue."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <Metric
          label="Qualified pool"
          value={prospects.length}
          helper="Chamber members with an outreach route."
        />
        <Metric
          label="Needs review"
          value={prospects.filter(p => p.status === "review").length}
          helper="Personalized sequences awaiting approval."
        />
        <Metric
          label="Ready approvals"
          value={readyApprovals}
          helper="Approved introductions available to the next run."
        />
        <Metric
          label="Blocked research"
          value={blockedResearch}
          helper="Prospects whose research failed and need attention."
        />
        <Metric
          label="Messages sent"
          value={totalSent}
          helper="Introductions plus follow-ups."
        />
        <Metric
          label="Replies"
          value={replyCount}
          helper="Reply detection stops the sequence."
        />
        <Metric
          label="Meetings"
          value={meetingCount}
          helper="Qualified conversations logged in the portal."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-black/10 bg-white p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 text-[#9b6a00]" />
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
                Compliance gate
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                Business postal address
              </h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-black/58">
            US commercial email rules require a valid postal address in every
            message. Saving it here refreshes every unsent email footer.
          </p>
          <textarea
            className="mt-4 min-h-24 w-full rounded-none border border-black/15 bg-[#f8f5ee] p-3 text-sm leading-6"
            placeholder="Enter Jeristotle Productions' valid business postal address"
            value={postalAddress || campaign.physicalPostalAddress || ""}
            onChange={event => setPostalAddress(event.target.value)}
          />
          <Button
            className="mt-3 rounded-none bg-black text-white hover:bg-black/80"
            disabled={
              saveCampaign.isPending ||
              (postalAddress || campaign.physicalPostalAddress || "").trim()
                .length < 10
            }
            onClick={() =>
              saveCampaign.mutate({
                physicalPostalAddress:
                  postalAddress || campaign.physicalPostalAddress || "",
              })
            }
          >
            {saveCampaign.isPending ? (
              <Loader2 className="animate-spin" />
            ) : null}
            Save address
          </Button>
        </div>

        <div className="border border-black/10 bg-black p-6 text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#ffb627]">
            Approved operating rules
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              [
                `${campaign.dailyNewLimit} new per day, seven days a week`,
                "Follow-ups do not count against the new-contact limit.",
              ],
              [
                "3 follow-ups",
                "Each is scheduled three days after the prior message.",
              ],
              [
                "Reply-aware",
                "Any reply suppresses every remaining follow-up.",
              ],
              [
                "Saturday recap",
                "Sent to Jeremy with sends, replies, opt-outs, errors, and pipeline totals.",
              ],
            ].map(([title, body]) => (
              <div
                className="border border-white/12 bg-white/5 p-4"
                key={title}
              >
                <p className="font-black text-[#ffb627]">{title}</p>
                <p className="mt-2 text-sm leading-6 text-white/62">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
              Personalized sequence review
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">
              Review the current personalized queue
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-6 text-black/55">
            Each company has an introduction and three follow-ups. Approval
            changes draft status only. It does not send an email.
          </p>
        </div>
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            {reviewProspects.slice(0, 25).map(prospect => {
              const prospectMessages =
                messagesByProspect.get(prospect.id) || [];
              const approved = prospectMessages.every(
                message => message.status === "approved"
              );
              return (
                <button
                  className={`w-full border p-4 text-left transition ${
                    selectedProspectId === prospect.id
                      ? "border-black bg-black text-white"
                      : "border-black/10 bg-white hover:border-[#c68a00]"
                  }`}
                  key={prospect.id}
                  onClick={() => {
                    setSelectedProspectId(prospect.id);
                    setSelectedStep(0);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black leading-5">
                        {prospect.businessName}
                      </p>
                      <p
                        className={`mt-1 text-xs ${selectedProspectId === prospect.id ? "text-white/55" : "text-black/48"}`}
                      >
                        {prospect.contactFirstName || "Contact"} ·{" "}
                        {prospect.contactConfidence}
                      </p>
                    </div>
                    {approved ? (
                      <CheckCircle2
                        className="shrink-0 text-emerald-500"
                        size={18}
                      />
                    ) : (
                      <Eye className="shrink-0 text-[#c68a00]" size={18} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="min-h-[620px] border border-black/10 bg-white">
            {selectedProspect && selectedMessage ? (
              <>
                <div className="border-b border-black/10 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
                        {selectedProspect.businessName}
                      </p>
                      <h3 className="mt-2 text-xl font-black">
                        {selectedMessage.subject}
                      </h3>
                      <p className="mt-2 text-xs text-black/48">
                        To {selectedProspect.email} · Source confidence:{" "}
                        {selectedProspect.contactConfidence}
                      </p>
                    </div>
                    <Button
                      className="rounded-none bg-[#ffb627] font-black text-black hover:bg-[#e5a116]"
                      disabled={
                        approve.isPending ||
                        !["review", "approved"].includes(
                          selectedProspect.status
                        ) ||
                        Boolean(selectedProspect.firstSentAt) ||
                        selectedMessages.every(
                          message => message.status === "approved"
                        )
                      }
                      onClick={() =>
                        approve.mutate({ prospectId: selectedProspect.id })
                      }
                    >
                      {approve.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <CheckCircle2 />
                      )}
                      Approve all 4 messages
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedMessages.map(message => (
                      <Button
                        className="rounded-none"
                        key={message.id}
                        size="sm"
                        variant={
                          selectedStep === message.sequenceStep
                            ? "default"
                            : "outline"
                        }
                        onClick={() => setSelectedStep(message.sequenceStep)}
                      >
                        {sequenceLabels[message.sequenceStep]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="bg-[#f4f1e9] p-5 sm:p-8">
                  <article className="mx-auto max-w-2xl border border-black/10 bg-white p-6 shadow-[0_18px_55px_rgba(0,0,0,.07)] sm:p-9">
                    <p className="mb-6 border-b border-black/10 pb-4 text-xs text-black/45">
                      Exact message copy
                    </p>
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-black/78">
                      {selectedMessage.textBody}
                    </p>
                  </article>
                </div>
              </>
            ) : (
              <div className="flex min-h-[620px] items-center justify-center p-10 text-center text-black/45">
                <div>
                  <Mail className="mx-auto mb-4" size={34} />
                  Select a company to review its complete sequence.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border border-black/10 bg-white">
        <div className="flex flex-col gap-4 border-b border-black/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
              Live prospect queue
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              Research, sequence, reply, and meeting tracking
            </h2>
            <p className="mt-2 text-xs text-black/45">
              Showing the first 50 matches. Search runs across all{" "}
              {prospects.length} qualified records.
            </p>
          </div>
          <label className="flex h-11 items-center gap-2 border border-black/15 bg-[#f8f5ee] px-3 sm:w-80">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search company, email, or category"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-black text-white">
              <tr>
                {[
                  "Company",
                  "Contact route",
                  "Fit",
                  "Research",
                  "Status",
                  "Last sent",
                  "Next follow-up",
                  "Outcome",
                ].map(label => (
                  <th
                    className="px-4 py-3 text-[10px] uppercase tracking-[0.14em]"
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProspects.map(prospect => (
                <tr className="border-b border-black/8" key={prospect.id}>
                  <td className="px-4 py-4">
                    <p className="font-bold">{prospect.businessName}</p>
                    <p className="mt-1 text-xs text-black/45">
                      {prospect.category}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p>{prospect.email}</p>
                    <p className="mt-1 text-xs text-black/45">
                      {prospect.contactConfidence}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-black">{prospect.fitScore}</td>
                  <td className="px-4 py-4 capitalize">
                    {prospect.researchStatus}
                  </td>
                  <td className="px-4 py-4">
                    <Badge className="rounded-none bg-[#f2ead8] text-black hover:bg-[#f2ead8]">
                      {statusLabels[prospect.status] || prospect.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-black/55">
                    {prospect.lastSentAt
                      ? new Date(prospect.lastSentAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-4 text-black/55">
                    {prospect.nextFollowupAt
                      ? new Date(prospect.nextFollowupAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      className="h-9 rounded-none border border-black/15 bg-white px-2 text-xs"
                      value={prospect.status}
                      onChange={event =>
                        updateProspect.mutate({
                          id: prospect.id,
                          status: event.target.value as
                            | "queued"
                            | "researching"
                            | "review"
                            | "approved"
                            | "in_sequence"
                            | "replied"
                            | "unsubscribed"
                            | "bounced"
                            | "meeting"
                            | "not_fit"
                            | "complete",
                        })
                      }
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="border border-black/10 bg-white p-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-[#9b6a00]" />
            <h2 className="text-2xl font-black tracking-[-0.04em]">
              Daily activity
            </h2>
          </div>
          <div className="mt-5 divide-y divide-black/10">
            {runs.length ? (
              runs.slice(0, 10).map(run => (
                <div
                  className="grid grid-cols-[110px_1fr_auto] gap-3 py-3 text-sm"
                  key={run.id}
                >
                  <span className="font-bold">{run.runDate}</span>
                  <span className="text-black/55">
                    {run.newSent} new · {run.followupsSent} follow-ups ·{" "}
                    {run.repliesDetected} replies
                  </span>
                  <Badge className="rounded-none bg-[#f2ead8] text-black">
                    {run.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-black/45">
                No outreach runs yet. The campaign is still in review.
              </p>
            )}
          </div>
        </section>

        <section className="border border-black/10 bg-white p-6">
          <div className="flex items-center gap-3">
            <Users className="text-[#9b6a00]" />
            <h2 className="text-2xl font-black tracking-[-0.04em]">
              Recent pipeline events
            </h2>
          </div>
          <div className="mt-5 divide-y divide-black/10">
            {recentEvents.length ? (
              recentEvents.slice(0, 12).map(event => (
                <div className="py-3" key={event.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black capitalize">
                      {event.eventType.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-black/40">
                      {new Date(event.occurredAt).toLocaleString()}
                    </p>
                  </div>
                  {event.detail ? (
                    <p className="mt-1 text-xs leading-5 text-black/52">
                      {event.detail}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-black/45">
                Pipeline events will appear after research, approvals, sends,
                replies, and recaps.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
