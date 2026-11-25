import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SECTOR_KEYS,
  SECTOR_DEFINITIONS,
  SECTOR_DAILY_NEW_PER_CAMPAIGN,
  type SectorKey,
} from "@shared/sectorOutreach";
import {
  OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET,
  OUTREACH_INITIAL_REFILL_START_BELOW,
  OUTREACH_PUBLIC_SUPPLY_NOTICE,
} from "@shared/outboundReplenishmentPolicy";
import { SectorDraftMessage } from "./SectorOutreachDrafts";
import {
  Loader2,
  LockKeyhole,
  RefreshCw,
  Mail,
  Users,
  BarChart3,
} from "lucide-react";
import React, { useState } from "react";

const labels: Record<SectorKey, string> = {
  tourism: "Tourism & hospitality",
  real_estate: "Real estate",
  industrial: "Industrial B2B",
  healthcare: "Healthcare",
};
function SourceLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
  } catch {
    return null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-xs font-semibold text-[#865900] underline underline-offset-4"
    >
      {label}
    </a>
  );
}
export default function SectorCampaignPipeline({
  campaignKey,
}: { campaignKey?: SectorKey } = {}) {
  const { user, loading } = useAuth();
  const [localSelection, setSelected] = useState<SectorKey>("tourism");
  const selected = campaignKey ?? localSelection;
  const workspace = trpc.sectors.liveWorkspace.useQuery(undefined, {
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (loading || (user && workspace.isLoading))
    return (
      <div className="flex items-center gap-3 p-8 text-black/60">
        <Loader2 size={20} className="animate-spin" />
        Reading recorded campaign state.
      </div>
    );
  if (!user)
    return (
      <div className="m-5 border border-[#d8c99f] bg-[#fffaf0] p-6 sm:m-8">
        <LockKeyhole size={26} />
        <h2 className="mt-3 text-xl font-black">
          Jeremy’s private campaign workspace
        </h2>
        <p className="mt-3 text-sm leading-6">
          Sign in as the project owner to inspect recipient evidence, messages,
          queues and recorded results. A sign-in screen does not mean sending is
          active.
        </p>
        <Button
          onClick={() => startLogin()}
          className="mt-4 rounded-none bg-black text-white"
        >
          Sign in to view campaigns
        </Button>
      </div>
    );
  if (workspace.error || !workspace.data?.group)
    return (
      <div className="m-5 border border-red-200 bg-red-50 p-6 text-red-900 sm:m-8">
        <h2 className="text-lg font-bold">
          Campaign state could not be verified
        </h2>
        <p className="mt-2 text-sm leading-6">
          No queue counts, sender activation or delivery are being assumed.
          Existing campaigns are unchanged.
        </p>
        <Button
          variant="outline"
          className="mt-4 rounded-none bg-white"
          onClick={() => workspace.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  const data = workspace.data,
    group = data.group;
  const isActive =
    group.status === "active" &&
    group.sendingEnabled === 1 &&
    !!group.approvalAt;
  const campaign = data.campaigns.find(c => c.campaignKey === selected);
  const definition = SECTOR_DEFINITIONS.find(d => d.key === selected)!;
  const prospects = data.prospects.filter(p => p.campaignKey === selected);
  const messages = data.messages.filter(m => m.campaignKey === selected);
  const acceptedNew = messages.filter(
    m => m.messageNumber === 1 && m.smtpAcceptedAt
  ).length;
  const acceptedFollowups = messages.filter(
    m => m.messageNumber > 1 && m.smtpAcceptedAt
  ).length;
  const campaignHealth = data.health.byCampaign.find(
    h => h.campaignKey === selected
  );
  const ready = campaignHealth?.readyInitialCount ?? null;
  const policyPending =
    campaign?.dailyNewLimit !== SECTOR_DAILY_NEW_PER_CAMPAIGN ||
    campaign?.reserveTarget !== OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET;
  const statItems = [
    ["Ready initial reserve", ready ?? "Unavailable"],
    ["Initial SMTP accepted", acceptedNew],
    ["Follow-up SMTP accepted", acceptedFollowups],
    ["Replies / OOO stops", prospects.filter(p => p.replyAt).length],
    ["Bounces", prospects.filter(p => p.bounceAt).length],
    ["Opt-outs", prospects.filter(p => p.optoutAt).length],
    ["Meetings recorded", prospects.filter(p => p.status === "meeting").length],
    [
      "Uncertain attempts",
      messages.filter(
        m =>
          m.status === "uncertain" ||
          (m.attemptedAt && !m.smtpAcceptedAt && m.status !== "cancelled")
      ).length,
    ],
  ] as const;
  return (
    <div
      className="space-y-6 p-5 sm:p-8 lg:p-10"
      data-sector-pipeline={selected}
    >
      <section className="grid gap-5 border border-[#d8c99f] bg-[#fffaf0] p-5 sm:p-6 md:grid-cols-[1fr_auto]">
        <div>
          <Badge className="rounded-none bg-black text-[#ffb627] hover:bg-black">
            {isActive
              ? "Recorded active controls · Readiness remains gated"
              : group.status === "paused"
                ? "Paused"
                : "Launch authorized · Deployment and connection pending"}
          </Badge>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
            {campaignKey
              ? `${labels[selected]}. Every conversation tracked.`
              : "Four campaigns. Every conversation tracked."}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/65">
            {isActive
              ? "Stored controls are active, not proof of a filled queue or a healthy callback. Policy, schedule, inbox and point-of-send eligibility remain required. Delivery is counted only after an SMTP receipt; the existence of a job is not proof that a message was sent."
              : "Your launch request is recorded in the setup history. No new campaign is described as live until its deployed callback and scheduler are verified."}{" "}
            The approved example-first messages use the professional white email
            template, with no links. Any response, out-of-office reply, bounce
            or opt-out stops follow-ups.
          </p>
        </div>
        <div className="border-l-4 border-[#ffb627] pl-4 text-sm leading-6">
          <strong className="block">Approved requested policy: {SECTOR_DAILY_NEW_PER_CAMPAIGN} new contacts/day per campaign</strong>
          <span>
            Four separate limits.
            <br />
            Follow-ups additional.
            <br />7 days/week · America/Chicago.
            <br />
            Maximum planned NEW across four: {SECTOR_DAILY_NEW_PER_CAMPAIGN * SECTOR_KEYS.length}/day, not a shared budget.
            <br />
            Reserve target: {OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET} per campaign; refill before supply drops below {OUTREACH_INITIAL_REFILL_START_BELOW}.
            <br />
            Existing campaign limits unchanged.
          </span>
        </div>
      </section>
      <section className="border border-black/10 bg-white p-5 text-sm leading-6" data-sector-policy-status={policyPending ? "migration-pending" : "persisted"}>
        <p><strong>Persisted selected-campaign settings:</strong> {campaign?.dailyNewLimit ?? "Unavailable"} new contacts/day · reserve {campaign?.reserveTarget ?? "Unavailable"}.</p>
        <p className="mt-2">{policyPending
          ? "Post-publication policy migration pending. Persisted old 5/day and reserve 20 remain unchanged until that migration; requested targets are not active configuration. No read or refresh migrates settings."
          : "Requested policy is persisted. This is not a delivery receipt or a guarantee of a filled queue."}</p>
        <p className="mt-2"><strong>Actual approved initial reserve:</strong> {ready ?? "Unavailable"} / {OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET}. {ready === null
          ? "Reserve health could not be verified; no zero count or sending readiness is assumed."
          : ready < OUTREACH_INITIAL_REFILL_START_BELOW
            ? "Below refill threshold; source-backed replenishment is needed."
            : ready < OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET
              ? "Below target; a complete reserve is not claimed."
              : "Recorded approved supply meets the target; sender and inbox gates still apply."}</p>
        <p className="mt-2 text-xs text-black/60">{OUTREACH_PUBLIC_SUPPLY_NOTICE}</p>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-6 text-black/60">
          Source-backed queues only. Shortage never authorizes guessed emails or
          duplicate companies.
        </p>
        <Button
          variant="outline"
          className="rounded-none bg-white text-xs"
          disabled={workspace.isFetching}
          onClick={() => workspace.refetch()}
        >
          <RefreshCw size={14} />
          Refresh recorded state
        </Button>
      </div>
      {!campaignKey && (
        <div
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Choose a campaign"
        >
          {SECTOR_KEYS.map(key => (
            <button
              type="button"
              key={key}
              data-sector-tab={key}
              aria-pressed={selected === key}
              className={`min-w-0 border px-4 py-4 text-left text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00] ${selected === key ? "border-black bg-black text-[#ffb627]" : "border-black/10 bg-white text-black hover:border-[#ffb627]"}`}
              onClick={() => setSelected(key)}
            >
              {labels[key]}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-black/55">
        Recorded totals below are all-time for this campaign. Dated weekly
        results appear in the Saturday tracker.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statItems.map(([label, value]) => (
          <div className="border border-black/10 bg-white p-4" key={label}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-black/50">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <section className="border border-black/10 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">
              {campaign?.name ?? definition.name}
            </h2>
            <p className="mt-2 text-xs text-black/55">
              Stored campaign: {campaign?.status ?? "missing"} · Schedule:{" "}
              {campaign?.schedulerTaskUid ? "task linked; callback health not inferred" : "not connected"} ·
              Research:{" "}
              {group.researchEnabled === 1 && group.researchConnected
                ? "enabled"
                : "not active / not connected"}
            </p>
          </div>
          <BarChart3 className="text-[#9b6a00]" size={22} />
        </div>
        <p className="mt-4 text-sm leading-6 text-black/65">
          <strong>Targets:</strong> {definition.targetCriteria}
        </p>
        <p className="mt-3 text-sm leading-6 text-black/65">
          <strong>Buyer:</strong> {definition.buyerCriteria}
        </p>
        <p className="mt-3 text-xs leading-6 text-black/55">
          Reply scans:{" "}
          {campaign?.lastInboxScanAt
            ? new Date(campaign.lastInboxScanAt).toLocaleString()
            : "No completed scan recorded"}
          . Open rates, clicks and inbox placement are not inferred. Weekly
          totals are included in the existing Saturday tracker after this
          version is deployed.
        </p>
      </section>
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-[#9b6a00]" />
          <h2 className="text-lg font-black">
            Researched contacts and recipient messages
          </h2>
        </div>
        {!prospects.length ? (
          <div className="border border-black/10 bg-white p-5 text-sm leading-6 text-black/60">
            No source-backed recipient records saved for this campaign yet. A
            template is not a filled queue.
          </div>
        ) : (
          prospects.map(p => (
            <article
              key={p.id}
              className="min-w-0 border border-black/10 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{p.company}</h3>
                  <p className="mt-1 break-words text-sm text-black/60">
                    {p.contactName ?? `${p.company} team`}
                    {p.contactRole ? ` · ${p.contactRole}` : ""}
                  </p>
                  <p className="mt-1 break-all text-xs text-black/55">
                    {p.email ?? "Email not verified"}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-none">
                  {p.qualification} · {p.status}
                </Badge>
              </div>
              {p.holdReason && (
                <p className="mt-3 border-l-2 border-[#ffb627] pl-3 text-xs leading-6 text-black/65">
                  Hold: {p.holdReason}
                </p>
              )}
              <p className="mt-3 text-sm leading-6 text-black/65">
                {p.verifiedFact}
              </p>
              <p className="mt-2 text-xs leading-6 text-black/55">
                <strong>Proposed creative:</strong> {p.proposedAngle}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                <SourceLink
                  url={p.emailSourceUrl}
                  label="Published email source"
                />
                <SourceLink
                  url={p.factSourceUrl}
                  label="Observed business fact"
                />
                <SourceLink
                  url={p.roleSourceUrl}
                  label="Published role / remit"
                />
                <SourceLink
                  url={p.phoneSourceUrl}
                  label="Company phone source"
                />
              </div>
              <details className="mt-4 border-t border-black/10 pt-4">
                <summary className="cursor-pointer text-sm font-bold">
                  Exact recipient messages and evidence
                </summary>
                <p className="mt-3 break-words text-xs leading-6 text-black/60">
                  {p.emailSourceQuote}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-black/55">
                  {p.manualNotes}
                </p>
                {messages
                  .filter(m => m.prospectId === p.id)
                  .sort((a, b) => a.messageNumber - b.messageNumber)
                  .map(m => (
                    <div key={m.id} className="mt-4 border border-black/10">
                      <div className="border-b border-black/10 bg-[#f8f5ee] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b6a00]">
                          Email {m.messageNumber} · {m.status}
                        </p>
                        <h4 className="mt-1 break-words text-sm font-bold">
                          {m.subject}
                        </h4>
                        <p className="mt-2 text-xs text-black/55">
                          {m.smtpAcceptedAt
                            ? `SMTP accepted ${new Date(m.smtpAcceptedAt).toLocaleString()}`
                            : m.attemptedAt
                              ? "Attempt recorded; acceptance not confirmed"
                              : "No send attempt"}
                        </p>
                      </div>
                      <div className="whitespace-pre-wrap break-words p-4 text-sm leading-7 text-black/70">
                        {m.textBody}
                      </div>
                      <details className="border-t border-black/10 p-4">
                        <summary className="cursor-pointer text-xs font-bold">
                          Professional HTML email preview
                        </summary>
                        <iframe
                          title={`${p.company} email ${m.messageNumber} HTML preview`}
                          sandbox=""
                          srcDoc={m.htmlBody}
                          className="mt-3 h-[640px] w-full border border-black/10 bg-white"
                        />
                      </details>
                    </div>
                  ))}
              </details>
            </article>
          ))
        )}
      </section>
      <details className="border border-black/10 bg-white p-5">
        <summary className="flex cursor-pointer items-center gap-2 text-lg font-black">
          <Mail size={20} className="text-[#9b6a00]" />
          Approved three-email templates
        </summary>
        <p className="my-4 text-xs leading-6 text-black/55">
          Bracketed fields are templates, not researched facts. They must be
          fully resolved from verified sources before sending. Follow-up one is
          four business days after initial acceptance; follow-up two is eight
          business days after the prior acceptance. Dispatch itself runs seven
          days weekly.
        </p>
        <div className="space-y-5">
          {definition.messages.map(message => (
            <SectorDraftMessage key={message.messageNumber} message={message} />
          ))}
        </div>
      </details>
    </div>
  );
}
