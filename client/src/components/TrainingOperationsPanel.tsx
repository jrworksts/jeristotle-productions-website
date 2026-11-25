import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  CalendarClock,
  CirclePause,
  Inbox,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

function centralDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
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

/**
 * Delivery is deliberately fail-closed. Every action is fixed to Training on the
 * server; the interface exposes neither recipients, scheduler IDs, webhook URLs,
 * cadence changes, nor an immediate-send control.
 */
export default function TrainingOperationsPanel() {
  const utils = trpc.useUtils();
  const operations = trpc.training.operations.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
  const workspace = trpc.training.workspace.useQuery(undefined, {
    refetchOnWindowFocus: true,
    retry: false,
  });

  const refresh = async () => {
    await Promise.all([
      utils.training.operations.invalidate(),
      utils.training.workspace.invalidate(),
    ]);
  };

  const prepareReserve = trpc.training.prepareReserve.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Ready-reserve preparation completed. No email was sent.");
    },
    onError: error => toast.error(error.message),
  });

  const scanInbox = trpc.training.scanInbox.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Inbox scan completed. No email was sent.");
    },
    onError: error => toast.error(error.message),
  });

  const setSending = trpc.training.setSending.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        result.enabled
          ? "Training sending resumed through the verified scheduler."
          : "Training sending paused. No email was sent by this action."
      );
    },
    onError: async error => {
      toast.error(error.message);
      await refresh();
    },
  });

  const data = operations.data;
  const busy =
    prepareReserve.isPending || scanInbox.isPending || setSending.isPending;
  const connected = Boolean(data?.scheduler);
  const schedulerEnabled = data?.scheduler?.isEnable === true;
  const active = data?.campaignStatus === "active" && schedulerEnabled;
  const canPause = data?.campaignStatus === "active";
  const actualStatus = !connected
    ? "Not connected"
    : active
      ? "Active"
      : "Paused";
  const lastSmtp = useMemo(
    () =>
      workspace.data?.messages.reduce<Date | string | null>(
        (latest, message) => {
          if (!message.smtpAcceptedAt) return latest;
          if (!latest) return message.smtpAcceptedAt;
          return new Date(message.smtpAcceptedAt).getTime() >
            new Date(latest).getTime()
            ? message.smtpAcceptedAt
            : latest;
        },
        null
      ) ?? null,
    [workspace.data?.messages]
  );
  const lastInbox = data?.health.lastReplyCheckAt ?? null;
  const lastRun = data?.health.lastRunAt ?? null;
  const latestRun = data?.health.latestRun;
  const sendingReady = Boolean(data?.sendingReady);

  return (
    <section
      aria-label="Training sending operations"
      className="border border-[#d9c28a] bg-[#fff9ec] p-5 shadow-[0_16px_50px_rgba(114,79,10,.05)] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {connected ? (
            <ShieldCheck className="mt-1 shrink-0 text-[#895b00]" size={20} />
          ) : (
            <ShieldAlert className="mt-1 shrink-0 text-amber-800" size={20} />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#895b00]">
              Training delivery controls · fail-closed
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              {actualStatus}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">
              Up to {data?.dailyNewLimit ?? 10} new contacts every Central
              calendar day at 9 a.m., including weekends. Follow-ups are due 4
              then 5 business days after actual accepted prior sends. This panel
              does not expose a recipient list, webhook URL, scheduler
              identifier, or an immediate-send action.
            </p>
          </div>
        </div>
        <Button
          className="shrink-0 rounded-none"
          disabled={busy || operations.isFetching}
          onClick={() => void refresh()}
          type="button"
          variant="outline"
        >
          {operations.isFetching ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh status
        </Button>
      </div>

      {operations.isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-black/55">
          <Loader2 className="animate-spin" size={16} /> Checking training
          delivery status…
        </p>
      ) : null}
      {operations.error ? (
        <p
          className="mt-5 border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900"
          role="alert"
        >
          Delivery status could not be verified: {operations.error.message}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="min-w-0 border border-black/10 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Actual status
              </p>
              <p className="mt-2 break-words text-sm font-black leading-6">
                {actualStatus}
              </p>
            </article>
            <article className="min-w-0 border border-black/10 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Ready reserve
              </p>
              <p className="mt-2 break-words text-sm font-black leading-6">
                {data.readyCount} / {data.bufferTarget} verified contacts
              </p>
            </article>
            <article className="min-w-0 border border-black/10 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Last SMTP acceptance
              </p>
              <p className="mt-2 break-words text-sm font-black leading-6">
                {centralDate(lastSmtp)}
              </p>
            </article>
            <article className="min-w-0 border border-black/10 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Last inbox scan
              </p>
              <p className="mt-2 break-words text-sm font-black leading-6">
                {centralDate(lastInbox)}
              </p>
            </article>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <article className="border border-black/10 bg-white p-4 text-sm leading-6 text-black/70">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Last maintenance run
              </p>
              <p className="mt-2 font-bold text-black">
                {centralDate(lastRun)}
              </p>
              {latestRun ? (
                <p className="mt-1 text-xs leading-5 text-black/60">
                  {latestRun.runDate} · {latestRun.status} · {latestRun.newSent}{" "}
                  new / {latestRun.followupsSent} follow-ups /{" "}
                  {latestRun.errorCount} errors
                </p>
              ) : null}
            </article>
            <article className="border border-black/10 bg-white p-4 text-sm leading-6 text-black/70">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Research connection
              </p>
              <p className="mt-2 font-bold text-black">
                {data.researchConfigured ? "Configured" : "Not configured"}
              </p>
              <p className="mt-1 text-xs leading-5 text-black/55">
                Research readiness is shown without exposing connection details.
              </p>
            </article>
            <article className="border border-black/10 bg-white p-4 text-sm leading-6 text-black/70">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                Sending verification
              </p>
              <p className="mt-2 font-bold text-black">
                {sendingReady
                  ? "Ready for safe control"
                  : "Not ready to resume"}
              </p>
              <p className="mt-1 text-xs leading-5 text-black/55">
                Resume stays disabled until deployed runtime and scheduler
                verification are complete.
              </p>
            </article>
          </div>

          {data.schedulerError ? (
            <p className="mt-4 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-black/65">
              {data.schedulerError}
            </p>
          ) : null}
          {data.lowSupply ? (
            <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              The verified reserve is below the {data.bufferTarget}-contact
              buffer. Records without source-backed qualification, email
              evidence, or conflict clearance remain blocked.
            </p>
          ) : null}
          {data.caveats.length ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-5 text-black/60">
              {data.caveats.map(caveat => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              className={`rounded-none font-black ${canPause ? "bg-black text-white hover:bg-black/80" : "bg-[#ffb627] text-black hover:bg-[#e5a116]"}`}
              disabled={
                busy || (!canPause && (operations.isFetching || !sendingReady))
              }
              onClick={() => setSending.mutate({ enabled: !canPause })}
              type="button"
            >
              {setSending.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : canPause ? (
                <CirclePause size={17} />
              ) : (
                <Play size={17} />
              )}
              {canPause
                ? "Pause automatic sending"
                : "Resume automatic sending"}
            </Button>
            <Button
              className="rounded-none"
              disabled={busy}
              onClick={() => prepareReserve.mutate()}
              type="button"
              variant="outline"
            >
              {prepareReserve.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <CalendarClock size={17} />
              )}
              Prepare ready reserve
            </Button>
            <Button
              className="rounded-none"
              disabled={busy}
              onClick={() => scanInbox.mutate()}
              type="button"
              variant="outline"
            >
              {scanInbox.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <Inbox size={17} />
              )}
              Scan inbox
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-black/55">
            Preparing reserve and scanning the inbox are maintenance actions
            only; neither sends email. Resume requires verified readiness;
            pausing remains available even if scheduler verification fails.
          </p>
        </>
      ) : null}
    </section>
  );
}
