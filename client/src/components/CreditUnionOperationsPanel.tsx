import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function central(value: Date | string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) + " Central"
    : "Not recorded";
}

export default function CreditUnionOperationsPanel() {
  const utils = trpc.useUtils();
  const query = trpc.creditUnion.operations.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const sending = trpc.creditUnion.setSending.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.creditUnion.operations.invalidate(),
        utils.creditUnion.workspace.invalidate(),
      ]);
      toast.success(
        result.enabled
          ? "Credit-union sending enabled for the next daily Central window"
          : "Credit-union sending paused"
      );
    },
    onError: async error => {
      await query.refetch();
      toast.error(error.message);
    },
  });
  const refresh = async () => {
    await Promise.all([
      utils.creditUnion.operations.invalidate(),
      utils.creditUnion.workspace.invalidate(),
    ]);
  };
  const prepare = trpc.creditUnion.prepareBatch.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        `${result.health.readyInitialCount} verified introductions ready; no email sent`
      );
    },
    onError: error => toast.error(error.message),
  });
  const scan = trpc.creditUnion.scanReplies.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        `${result.repliesDetected} replies and ${result.bouncesDetected} bounces detected; no email sent`
      );
    },
    onError: error => toast.error(error.message),
  });
  const data = query.data;
  const active = data?.campaignStatus === "active" && data.scheduler?.isEnable;
  return (
    <section
      className="border border-[#ddc789] bg-[#fff8e7] p-5 sm:p-6"
      aria-label="Credit-union sending operations"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#916100]">
            App-owned sending · Separate credit-union campaign
          </p>
          <h3 className="mt-2 text-2xl font-black">
            {active
              ? "Credit-union sending is active"
              : data?.launchAuthorized
                ? "Authorized · sending is paused"
                : "Credit-union sending setup"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">
            {data?.dailyNewLimit ?? 10} new verified contacts every Central day
            at 9 a.m., plus due follow-ups on Days 4 and 9. South Texas first. A
            detected reply, opt-out, or bounce stops the remaining sequence.
          </p>
        </div>
        <Button
          className="rounded-none"
          variant="outline"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}{" "}
          Refresh status
        </Button>
      </div>
      {query.error ? (
        <p className="mt-4 text-sm text-red-800">{query.error.message}</p>
      ) : null}
      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Ready reserve", `${data.readyCount}/${data.bufferTarget}`],
              ["Eligible review drafts", data.eligibleReviewCount],
              ["Contact verification needed", data.verificationNeeded],
              ["Next send window", central(data.nextSendAt)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="border border-black/10 bg-white p-4"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/50">
                  {label}
                </p>
                <p className="mt-2 break-words text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>
          {data.schedulerError ? (
            <p className="mt-4 border-l-2 border-[#b58417] pl-3 text-sm leading-6 text-black/65">
              {data.schedulerError}
            </p>
          ) : null}
          {data.lowSupply ? (
            <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950">
              The verified credit-union supply is below the {data.bufferTarget}
              -contact target. Only exact, sourced contacts can be approved
              automatically. Missing addresses stay blocked rather than being
              guessed or sent to customer-service inboxes.
            </p>
          ) : null}
          <p className="mt-4 text-xs leading-6 text-black/60">
            Next maintenance: {central(data.nextMaintenanceAt)}. Inbox checks
            and approved-draft top-up run every half hour during Central
            business hours every day once enabled. Both campaigns appear as
            separate sections in the existing Saturday recap; no second recap is
            created.
          </p>
          <p className="mt-2 text-xs leading-6 text-black/60">
            Proactive research checks every half hour from 5 a.m. through 9:59
            p.m. Central. Below {data.refillThreshold} ready contacts, bounded
            research works toward a {data.bufferTarget}-contact reserve. Named
            marketing contacts come first; verified official marketing or
            communications inboxes use a truthful team greeting. Research does
            not send emails, and verified supply is not guaranteed.
          </p>
          <p className="mt-2 text-xs leading-6 text-black/60">
            Last reply check: {central(data.health.lastReplyCheckAt)}. Last
            daily run:{" "}
            {data.lastRun
              ? `${data.lastRun.runDate} · ${data.lastRun.status} · ${data.lastRun.newSent} new / ${data.lastRun.followupsSent} follow-ups / ${data.lastRun.errorCount} errors`
              : "Not run yet"}
            .
          </p>
          {data.lastRun?.summary ? (
            <p className="mt-2 text-xs leading-6 text-black/60">
              {data.lastRun.summary}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              className="rounded-none bg-[#ffb627] font-bold text-black hover:bg-[#e5a31d]"
              disabled={sending.isPending || !data.transportConfigured}
              onClick={() => sending.mutate({ enabled: !active })}
            >
              {sending.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : active ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}
              {active
                ? "Pause credit-union sending"
                : "Enable credit-union sending"}
            </Button>
            <Button
              variant="outline"
              className="rounded-none"
              disabled={prepare.isPending}
              onClick={() => prepare.mutate()}
            >
              {prepare.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : null}
              Prepare verified batch
            </Button>
            <Button
              variant="outline"
              className="rounded-none"
              disabled={scan.isPending}
              onClick={() => scan.mutate()}
            >
              {scan.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : null}
              Check replies
            </Button>
          </div>
          <p className="mt-3 text-xs text-black/55">
            Enable schedules the next daily 9 a.m. Central window. It does not
            send a batch immediately or change Chamber sending.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-black/55">Loading sender status…</p>
      )}
    </section>
  );
}
