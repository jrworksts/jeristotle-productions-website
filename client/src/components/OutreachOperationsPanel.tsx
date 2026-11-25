import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  CalendarClock,
  Loader2,
  MailCheck,
  PauseCircle,
  Play,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

function centralDate(value: Date | string | null | undefined) {
  if (!value) return "Not scheduled";
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value)) + " Central"
  );
}

export default function OutreachOperationsPanel({
  onUpdate,
}: {
  onUpdate: () => Promise<unknown>;
}) {
  const utils = trpc.useUtils();
  const operations = trpc.chamber.outreachOperations.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      utils.chamber.outreachOperations.invalidate(),
      onUpdate(),
    ]);
  };
  const toggle = trpc.chamber.setOutreachSending.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Automatic sending settings updated");
    },
    onError: async error => {
      toast.error(error.message);
      await refresh();
    },
  });
  const prepare = trpc.chamber.prepareOutreachBatch.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        `${result.readyCount} introductions ready. No emails sent.`
      );
      if (result.researchFailures > 0)
        toast.warning(
          `${result.researchFailures} research issue(s). Review the pipeline for details.`
        );
    },
    onError: error => toast.error(error.message),
  });
  const replies = trpc.chamber.scanOutreachReplies.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        `Reply check complete: ${result.repliesDetected} new replies. No emails sent.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const data = operations.data;
  const busy = toggle.isPending || prepare.isPending || replies.isPending;
  const enabled =
    data?.campaignStatus === "active" && data?.sender?.isEnable === true;
  const unknown = operations.error || data?.statusUnavailable;

  return (
    <section
      className="border border-black/10 bg-white p-5 sm:p-6"
      aria-label="Outreach sending controls"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Settings2 className="mt-1 shrink-0 text-[#9b6a00]" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
              App-owned delivery
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              Manage outreach here
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
              The deployed app researches companies, sends approved emails,
              checks replies, and follows up automatically. It runs when this
              page and the Manus chat are closed.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="shrink-0 rounded-none"
          disabled={busy || operations.isFetching}
          onClick={refresh}
        >
          {operations.isFetching ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}{" "}
          Refresh status
        </Button>
      </div>

      {operations.isLoading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-black/55">
          <Loader2 size={16} className="animate-spin" /> Checking live schedule…
        </p>
      ) : null}
      {unknown ? (
        <p
          role="alert"
          className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
        >
          Live schedule status could not be verified.{" "}
          {operations.error?.message || data?.statusUnavailable} Refresh before
          resuming automatic sending.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Automatic sending",
                unknown
                  ? "Status unavailable"
                  : enabled
                    ? "Active"
                    : "Paused / not enabled",
              ],
              [
                "Next preparation",
                enabled && !unknown
                  ? centralDate(data.nextPreparationAt)
                  : "Paused / not verified",
              ],
              [
                "Next send window",
                enabled && !unknown
                  ? centralDate(data.nextSendAt)
                  : "Paused / not verified",
              ],
              [
                "Saturday recap",
                data.recap?.isEnable && !unknown
                  ? centralDate(data.nextRecapAt)
                  : "Not enabled / not verified",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 border border-black/10 bg-[#f8f5ee] p-4"
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-black/45">
                  {label}
                </p>
                <p className="mt-2 break-words text-sm font-black leading-6">
                  {value}
                </p>
              </div>
            ))}
          </div>
          {data.queueHealth ? (
            <div className="mt-4 border border-black/10 bg-[#fff8e7] p-4 text-sm leading-6">
              <p className="font-black">
                Ready reserve: {data.queueHealth.readyCount} /{" "}
                {data.bufferTarget} introductions
              </p>
              <p className="text-black/60">
                {data.queueHealth.eligibleQueuedCount} source-backed prospects
                available for preparation. {data.queueHealth.blockedCount}{" "}
                excluded by responses, suppression, or completed status.
              </p>
              <p className="mt-1 text-black/60">
                {data.continuousMaintenanceEnabled
                  ? `The app checks replies and tops up the reserve every 30 minutes from 8 AM to 5:30 PM Central, seven days a week. New sends remain capped at ${data.dailyNewLimit} per day.`
                  : enabled
                    ? "Daily preparation is active. The expanded automatic reserve schedule is awaiting activation."
                    : "Automatic preparation is paused with sending."}
              </p>
              {data.queueHealth.lowSupply ? (
                <p role="alert" className="mt-2 font-bold text-red-800">
                  Verified prospect supply is running low. Source replenishment
                  is needed before the queue runs out.
                </p>
              ) : null}
            </div>
          ) : null}
          {!data.transportConfigured ? (
            <p className="mt-4 text-sm text-red-800">
              The app’s Gmail credential is missing. Sending and reply
              monitoring need it configured before operation.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              className={`rounded-none font-black ${enabled ? "bg-black text-white hover:bg-black/80" : "bg-[#ffb627] text-black hover:bg-[#e5a116]"}`}
              disabled={
                busy ||
                operations.isFetching ||
                Boolean(unknown) ||
                !data.sender ||
                (!enabled && !data.transportConfigured)
              }
              onClick={() => toggle.mutate({ enabled: !enabled })}
            >
              {toggle.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : enabled ? (
                <PauseCircle size={17} />
              ) : (
                <Play size={17} />
              )}
              {enabled ? "Pause automatic sending" : "Resume automatic sending"}
            </Button>
            <Button
              variant="outline"
              className="rounded-none"
              disabled={busy}
              onClick={() => prepare.mutate()}
            >
              {prepare.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <CalendarClock size={17} />
              )}{" "}
              Top up ready reserve
            </Button>
            <Button
              variant="outline"
              className="rounded-none"
              disabled={busy || !data.transportConfigured}
              onClick={() => replies.mutate()}
            >
              {replies.isPending ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <MailCheck size={17} />
              )}{" "}
              Check replies
            </Button>
          </div>
          <p className="mt-4 text-xs leading-6 text-black/55">
            Preparation does not send emails. Resuming uses the next weekday 9
            a.m. Central window, never an immediate blast. Pause stops unsent
            messages; it cannot recall an email already accepted by Gmail. The
            single Saturday recap stays on when sending is paused.
          </p>
          <p className="mt-2 text-xs leading-6 text-black/45">
            {data.dailyNewLimit} new introductions per business day, plus due
            follow-ups. Reply checks also run before scheduled delivery. All
            activity is tracked below; no daily update emails are added.
          </p>
        </>
      ) : null}
    </section>
  );
}
