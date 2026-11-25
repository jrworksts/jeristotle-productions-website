import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { CircleAlert, Loader2, ShieldAlert } from "lucide-react";

type OutreachAlert = {
  id: number;
  label: string;
  localDate: string;
  kind: string;
  detail: string;
  newAccepted: number;
  followupAccepted: number;
  readyCount: number | null;
  emailState: "pending" | "sending" | "sent" | "uncertain";
  ownerState: "pending" | "sending" | "sent" | "uncertain";
  resolvedAt: Date | null;
  createdAt: Date;
};

type CurrentIssue = {
  label: string;
  kind: string;
  detail: string;
  newAccepted: number;
  followupAccepted: number;
  readyCount: number | null;
};

function centralDate(value: Date | string | null | undefined) {
  if (!value) return "Not checked yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";

  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + " Central"
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function deliveryStateLabel(value: OutreachAlert["emailState"]) {
  return value === "sent" ? "SMTP accepted" : statusLabel(value);
}

function countSummary({
  newAccepted,
  followupAccepted,
  readyCount,
}: Pick<OutreachAlert, "newAccepted" | "followupAccepted" | "readyCount">) {
  return `${newAccepted} new accepted · ${followupAccepted} follow-ups accepted · ${readyCount ?? "—"} ready`;
}

function Incident({ alert }: { alert: OutreachAlert }) {
  const unresolved = !alert.resolvedAt;

  return (
    <article
      className={`border p-3 ${
        unresolved
          ? "border-amber-300 bg-[#fff8e7]"
          : "border-black/10 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black leading-5">{alert.label}</p>
          <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
            {alert.localDate} · {statusLabel(alert.kind)}
          </p>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
            unresolved
              ? "border-amber-400 bg-[#ffb627] text-black"
              : "border-black/15 text-black/60"
          }`}
        >
          {unresolved ? "Unresolved" : "Resolved"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-black/70">{alert.detail}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-black/75">
        {countSummary(alert)}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-5 text-black/65">
        <span>
          Alert email:{" "}
          <strong className="text-black">
            {alert.emailState === "pending" &&
            alert.kind !== "owner_action_required" &&
            alert.kind !== "ready_new_empty"
              ? "Not requested (dashboard only)"
              : deliveryStateLabel(alert.emailState)}
          </strong>
        </span>
        <span>
          Jeremy notification:{" "}
          <strong className="text-black">
            {alert.ownerState === "pending" &&
            alert.kind !== "owner_action_required"
              ? "Not requested (dashboard only)"
              : statusLabel(alert.ownerState)}
          </strong>
        </span>
        {alert.resolvedAt ? (
          <span>Resolved {centralDate(alert.resolvedAt)}</span>
        ) : null}
      </div>
    </article>
  );
}

function CurrentIssueCard({ issue }: { issue: CurrentIssue }) {
  return (
    <article className="border border-amber-200 bg-[#fff8e7] p-3">
      <p className="text-xs font-black">{issue.label}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
        {statusLabel(issue.kind)}
      </p>
      <p className="mt-2 text-xs leading-5 text-black/70">{issue.detail}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-black/75">
        {countSummary(issue)}
      </p>
    </article>
  );
}

/**
 * Read-only monitoring for the app-owned outreach scheduler. This deliberately
 * has no controls for delivery, retries, or recipient changes.
 */
export default function OutreachAlertsPanel() {
  const status = trpc.outreachAlerts.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
  });
  const data = status.data;

  if (status.isLoading) {
    return (
      <section
        aria-label="Outreach delivery alerts"
        className="border border-[#d9c28a] bg-[#fff9ec] p-4 shadow-[0_12px_35px_rgba(114,79,10,.04)]"
      >
        <div className="flex items-center gap-3 text-sm text-black/60">
          <Loader2 className="animate-spin text-[#895b00]" size={17} />
          Checking outreach delivery alerts…
        </div>
      </section>
    );
  }

  if (status.error || !data || data.schedulerState === "unavailable") {
    return (
      <section
        aria-label="Outreach delivery alerts"
        className="border border-amber-200 bg-[#fff9ec] p-4 shadow-[0_12px_35px_rgba(114,79,10,.04)]"
      >
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-800" size={19} />
          <div>
            <h2 className="text-base font-black">Outreach delivery alerts</h2>
            <p className="mt-1 text-sm leading-6 text-black/65">
              Alert status is temporarily unavailable. No delivery,
              notification, or inbox outcome is implied until the next monitor
              check completes.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const monitoringActive =
    data.monitorStatus === "active" && data.schedulerState === "enabled";
  const awaitingConnection = !monitoringActive;
  const incidents = [...data.alerts].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
  const displayedIncidents = incidents.slice(0, 3);
  const remainingIncidents = incidents.slice(3);
  const unresolvedCount = incidents.filter(alert => !alert.resolvedAt).length;
  const displayedIssues = data.currentIssues.slice(0, 2);
  const remainingIssues = data.currentIssues.slice(2);

  const connectionNote =
    data.monitorStatus === "active" && data.schedulerState === "enabled"
      ? "Monitoring is connected to its enabled outreach-alert schedule."
      : data.monitorStatus === "paused"
        ? "Monitoring is paused. No delivery-alert emails will be initiated."
        : data.schedulerState === "not_linked"
          ? "Monitoring is not yet connected to a published outreach-alert schedule."
          : data.monitorStatus === "not_configured"
            ? "Monitoring has not yet been configured or connected to live delivery."
            : "Monitoring is awaiting a valid published schedule connection.";

  return (
    <section
      aria-label="Outreach delivery alerts"
      className="border border-[#d9c28a] bg-[#fff9ec] p-4 shadow-[0_12px_35px_rgba(114,79,10,.04)] sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {monitoringActive ? (
            <ShieldAlert className="mt-0.5 shrink-0 text-[#895b00]" size={19} />
          ) : (
            <CircleAlert className="mt-0.5 shrink-0 text-amber-800" size={19} />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#895b00]">
              Read-only monitor · {data.runtimeVersion}
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">
              Outreach delivery alerts
            </h2>
            <p className="mt-1 text-sm leading-6 text-black/65">
              {connectionNote}
            </p>
          </div>
        </div>
        <Badge
          className={`w-fit shrink-0 rounded-none px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.13em] ${
            monitoringActive
              ? "bg-black text-[#ffb627]"
              : "bg-[#ffb627] text-black"
          }`}
        >
          {monitoringActive ? "Active" : "Awaiting publish / connection"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 border-y border-black/10 py-3 text-xs leading-5 text-black/65 sm:grid-cols-3">
        <p>
          <span className="font-bold text-black">Recipient:</span> Jeremy only
          {data.recipient ? ` · ${data.recipient}` : ""}
        </p>
        <p>
          <span className="font-bold text-black">Last check:</span>{" "}
          {centralDate(data.lastCheckedAt)}
        </p>
        <p>
          <span className="font-bold text-black">Cadence:</span> Every 30
          minutes, 9:30 a.m. to 5:30 p.m. Central
        </p>
      </div>

      <p className="mt-3 text-xs leading-5 text-black/65">
        Verified empty READY NEW reserves share one HTML email to Jeremy per
        empty episode, with at most one grouped initial attempt per day. A
        verified owner action retains its existing notification path. Low but
        nonzero supply, partial batches, research holds and technical conditions
        stay quiet. Unknown counts never mean zero; uncertain sends never retry.
      </p>

      {data.campaignHealth?.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-black">
            All {data.campaignHealth.length} campaign reserves
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {data.campaignHealth.map(campaign => (
              <article
                key={campaign.key}
                className="border border-black/10 bg-white p-3 text-xs leading-5"
              >
                <p className="font-black">{campaign.label}</p>
                <p className="text-black/65">
                  {statusLabel(campaign.campaignStatus)} · READY NEW:{" "}
                  <strong className="text-black">
                    {campaign.readError || !campaign.readinessVerified
                      ? "Unknown"
                      : campaign.readyCount}
                  </strong>
                </p>
                <p className="text-black/65">
                  Requested reserve: {campaign.desiredReserve ?? "Unknown"} ·
                  Current NEW cap: {campaign.dailyLimit}/day
                </p>
                {campaign.requestedDailyLimit != null &&
                campaign.requestedDailyLimit !== campaign.dailyLimit ? (
                  <p className="font-bold text-amber-900">
                    Requested NEW: {campaign.requestedDailyLimit}/day — pending
                    policy persistence / activation
                  </p>
                ) : null}
                {campaign.persistedReserveTarget != null ? (
                  <p className="text-black/65">
                    Stored reserve target: {campaign.persistedReserveTarget}
                  </p>
                ) : null}
                <p className="text-black/65">
                  {campaign.readError
                    ? "Acceptance counts unavailable"
                    : `${campaign.newAccepted} new / ${campaign.followupAccepted} follow-ups accepted today`}
                </p>
                <p className="text-black/65">
                  Next refill opportunity:{" "}
                  {campaign.nextRefillOpportunityAt
                    ? centralDate(campaign.nextRefillOpportunityAt)
                    : "Not verified"}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-black/55">
        Chamber batch checks start at 10 a.m. to allow its 9:30 retry. Expected
        pauses and weekends respect campaign cadence. “SMTP accepted” records
        sender acceptance only; it is not inbox delivery confirmation.
      </p>

      {data.lastErrorCode ? (
        <p className="mt-3 border-l-2 border-amber-500 pl-3 text-xs leading-5 text-black/65">
          Last monitor code:{" "}
          <span className="font-bold">{data.lastErrorCode}</span>
        </p>
      ) : null}

      {data.currentIssues.length ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black">Current conditions</h3>
            <span className="text-xs font-bold text-amber-900">
              {data.currentIssues.length} open
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {displayedIssues.map((issue: CurrentIssue, index: number) => (
              <CurrentIssueCard
                key={`${issue.label}-${issue.kind}-${index}`}
                issue={issue}
              />
            ))}
          </div>
          {remainingIssues.length ? (
            <details className="mt-2 border-t border-black/10 pt-2">
              <summary className="cursor-pointer text-xs font-bold text-[#895b00]">
                Show {remainingIssues.length} more current condition
                {remainingIssues.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-2">
                {remainingIssues.map((issue: CurrentIssue, index: number) => (
                  <CurrentIssueCard
                    key={`${issue.label}-${issue.kind}-${index + displayedIssues.length}`}
                    issue={issue}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-black">Latest incidents</h3>
          {unresolvedCount ? (
            <span className="text-xs font-bold text-amber-900">
              {unresolvedCount} unresolved
            </span>
          ) : null}
        </div>
        {displayedIncidents.length ? (
          <div className="mt-2 space-y-2">
            {displayedIncidents.map(alert => (
              <Incident key={alert.id} alert={alert} />
            ))}
          </div>
        ) : (
          <p className="mt-2 border border-black/10 bg-white p-3 text-xs leading-5 text-black/55">
            No delivery-alert incidents have been recorded.
          </p>
        )}
        {remainingIncidents.length ? (
          <details className="mt-2 border-t border-black/10 pt-2">
            <summary className="cursor-pointer text-xs font-bold text-[#895b00]">
              Show {remainingIncidents.length} earlier incident
              {remainingIncidents.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-2 space-y-2">
              {remainingIncidents.map(alert => (
                <Incident key={alert.id} alert={alert} />
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {awaitingConnection ? (
        <p className="mt-4 text-xs leading-5 text-black/55">
          No send, retry, or scheduler controls are available here. This panel
          reports monitor status only.
        </p>
      ) : null}
    </section>
  );
}
