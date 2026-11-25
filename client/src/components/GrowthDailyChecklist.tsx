import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { GROWTH_PLAN_NOTE, GROWTH_PILLARS } from "@shared/growthPlan";
import { growthLocalDate } from "@shared/growthChecklist";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";

type Workspace = inferRouterOutputs<AppRouter>["growth"]["workspace"];
type Task = Workspace["actions"][number];
type DailyPlanWorkspace = Workspace & {
  planStartDate: string;
  planDay: number | null;
  planStarted: boolean;
  dailyTask: Task | null;
  dailyTaskDate: string;
  dailyTaskIsPreview: boolean;
};

const inputClass =
  "h-11 w-full rounded-none border border-black/15 bg-white px-3 text-sm text-black focus:outline-none focus:ring-2 focus:ring-[#ffb627]";

const statusLabel: Record<Task["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Complete",
};

function dayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function shortDateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scheduledDate(task: Task, planStartDate: string) {
  if (task.dueDate) return new Date(task.dueDate).toISOString().slice(0, 10);
  const date = new Date(`${planStartDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + task.scheduledDay - 1);
  return date.toISOString().slice(0, 10);
}

function orderedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.scheduledDay - b.scheduledDay);
}

/** The reference material remains separate from the one-task workspace. */
export function GrowthBlueprintGuide() {
  return (
    <div className="space-y-6 p-5 sm:p-8 lg:p-10">
      <div className="border-l-4 border-[#ffb627] bg-white p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-[#916100]">
          The teaching platform
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight">
          Give away the WHAT. Charge for the HOW.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-black/65">
          Make marketing easy for owners. Teach the system openly, help them
          identify their gaps, and offer movie-level content and implementation
          support when they want help. Independent implementation is also a
          successful educational outcome.
        </p>
        <p className="mt-4 font-bold">
          Attract → Educate → Convert → Retain → Repeat
        </p>
        <details className="mt-5 border-t border-black/10 pt-4 text-sm leading-6">
          <summary className="cursor-pointer font-bold">
            Hormozi & GaryVee: advice adapted to Corpus Christi
          </summary>
          <p className="mt-3">
            Teach useful lessons, document real work, turn strong ideas into
            platform-appropriate pieces, listen to owner questions, and connect
            attention to a bounded offer and follow-up. Choose the pace that
            matches available capacity and audience response.
          </p>
          <p className="mt-3">
            The plan prioritizes working pages, published content, a real
            funnel, and learning loops before a larger content backlog.
            LinkedIn-first is a test, not a prescription or endorsement from
            either creator.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 font-bold underline">
            <a
              href="https://www.acquisition.com/leads-gifts"
              target="_blank"
              rel="noreferrer"
            >
              Hormozi: public lead resources
            </a>
            <a
              href="https://garyvaynerchuk.com/creating-content-that-builds-your-personal-brand/"
              target="_blank"
              rel="noreferrer"
            >
              GaryVee: document real work
            </a>
            <a
              href="https://garyvaynerchuk.com/content-marketing-strategy/"
              target="_blank"
              rel="noreferrer"
            >
              GaryVee: pillar-to-micro content
            </a>
          </div>
        </details>
        <a
          className="mt-5 inline-flex items-center gap-2 bg-[#ffb627] px-4 py-3 text-sm font-bold text-black hover:bg-[#e5a31d]"
          href="/manus-storage/DigitalDominanceBlueprint_b7b12848.pdf"
          target="_blank"
          rel="noreferrer"
        >
          View original Blueprint (PDF)
          <ArrowUpRight size={16} />
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {GROWTH_PILLARS.map((pillar, index) => (
          <article
            key={pillar.name}
            className="border border-black/10 bg-white p-6"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-[#916100]">
              0{index + 1}
            </p>
            <h3 className="mt-3 text-xl font-black">{pillar.name}</h3>
            <p className="mt-2 text-sm text-black/60">{pillar.subtitle}</p>
            <ul className="mt-6 space-y-3">
              {pillar.components.map(component => (
                <li
                  key={component}
                  className="border-t border-black/10 pt-3 text-sm font-semibold"
                >
                  {component}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <article className="bg-black p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ffb627]">
            Readiness score
          </p>
          <h3 className="mt-3 text-2xl font-black">
            Nine components. 90 possible points.
          </h3>
          <p className="mt-4 text-sm leading-7 text-white/70">
            In Place = 10 · Needs Work = 5 · Not Started = 0.
            <br />
            70–90: Strong Presence · 40–65: Growing · 0–35: At Risk.
          </p>
          <p className="mt-3 text-xs leading-6 text-white/60">
            Scores occur in five-point increments. This is a self-assessed
            digital readiness score, not an independently validated measure of
            marketing performance.
          </p>
        </article>
        <article className="border border-black/10 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#916100]">
            Owner freedom
          </p>
          <h3 className="mt-3 text-2xl font-black">
            Build your life, not just your business.
          </h3>
          <p className="mt-4 text-sm leading-7 text-black/65">
            Use content, promotion, clear next steps, follow-up, and measurement
            as one connected system. Keep sustainable capacity and ownership of
            your work in view. Strategy sessions are complimentary
            introductions; deeper advisory and execution are scoped paid work.
          </p>
        </article>
      </div>

      <div className="border border-amber-200 bg-[#fff8e5] p-5 text-sm leading-6 text-black/65">
        <strong>Plan source:</strong> {GROWTH_PLAN_NOTE}
        <p className="mt-2">
          This workspace tracks work to create the requested PDFs, decks,
          scripts, and funnels. Those deliverables are not marked complete or
          presented as built just because their tasks appear here.
        </p>
      </div>
    </div>
  );
}

export default function GrowthDailyChecklist({
  mode = "today",
  onNavigate,
}: {
  mode?: "today" | "plan";
  onNavigate?: (
    section: "roadmap" | "outreach" | "credit-unions" | "brand-video" | "events"
  ) => void;
}) {
  const utils = trpc.useUtils();
  const [localDate, setLocalDate] = useState(growthLocalDate);
  const [search, setSearch] = useState("");
  const queryInput = useMemo(() => ({ localDate }), [localDate]);
  const workspace = trpc.growth.workspace.useQuery(queryInput, {
    refetchOnWindowFocus: true,
  });

  const update = trpc.growth.updateTask.useMutation({
    onMutate: async variables => {
      await utils.growth.workspace.cancel();
      const previous = utils.growth.workspace.getData(queryInput) as
        | DailyPlanWorkspace
        | undefined;

      if (previous) {
        const patchTask = (task: Task) =>
          task.id === variables.id ? { ...task, ...variables } : task;
        utils.growth.workspace.setData(queryInput, {
          ...previous,
          actions: previous.actions.map(patchTask),
          dailyTask:
            previous.dailyTask?.id === variables.id
              ? { ...previous.dailyTask, ...variables }
              : previous.dailyTask,
        } as Workspace);
      }

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        utils.growth.workspace.setData(
          queryInput,
          context.previous as Workspace
        );
      }
      toast.error(error.message);
    },
    onSuccess: (_result, variables) => {
      if (variables.status === "complete") {
        toast.success("Done for today. Your next task is available tomorrow.");
      } else {
        toast.success("Task notes saved.");
      }
    },
    onSettled: () => {
      // The server owns the frozen daily assignment; invalidation must not select
      // another client-side task after completion.
      utils.growth.workspace.invalidate();
    },
  });

  if (workspace.isLoading) {
    return (
      <div className="flex min-h-96 items-center justify-center gap-3 text-black/60">
        <Loader2 className="animate-spin" /> Loading the growth plan…
      </div>
    );
  }

  if (workspace.error || !workspace.data) {
    return (
      <div className="m-5 border border-red-200 bg-red-50 p-6 text-red-900">
        <h2 className="font-bold">Unable to load the growth plan</h2>
        <p className="mt-2 text-sm">{workspace.error?.message}</p>
        <Button
          className="mt-4 rounded-none"
          onClick={() => workspace.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  // The backend contract adds these fields. The fallback only keeps an older
  // response renderable while a rolling deployment catches up.
  const data = workspace.data as DailyPlanWorkspace;
  const planStartDate = data.planStartDate ?? "2026-10-22";
  const dailyTaskDate = data.dailyTaskDate ?? localDate;
  const planStarted = data.planStarted ?? localDate >= planStartDate;
  const dailyTaskIsPreview =
    data.dailyTaskIsPreview ?? (!planStarted || localDate > data.today);
  const tasks = orderedTasks(data.actions);
  const completed = tasks.filter(task => task.status === "complete").length;

  return mode === "plan" ? (
    <GrowthPlan
      tasks={tasks}
      completed={completed}
      planStartDate={planStartDate}
      search={search}
      onSearchChange={setSearch}
    />
  ) : (
    <TodayTask
      task={data.dailyTask ?? null}
      localDate={localDate}
      today={data.today}
      planStartDate={planStartDate}
      planStarted={planStarted}
      planDay={data.planDay ?? null}
      taskDate={dailyTaskDate}
      isPreview={dailyTaskIsPreview}
      busy={update.isPending}
      onDateChange={setLocalDate}
      onComplete={task => update.mutate({ id: task.id, status: "complete" })}
      onSaveNotes={(task, notes) => update.mutate({ id: task.id, notes })}
      onOpenPlan={() => onNavigate?.("roadmap")}
    />
  );
}

function DailyReminderStatus() {
  const result = trpc.growth.reminderStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  if (result.isLoading) return null;
  if (result.error || !result.data)
    return (
      <p className="mt-3 text-xs text-red-800">
        Daily email status could not be verified.
      </p>
    );
  const status = result.data;
  const problem = status.state === "failed" || status.state === "uncertain";
  return (
    <div
      className={`mt-3 text-xs leading-5 ${problem ? "text-red-800" : "text-black/60"}`}
    >
      <p>
        Daily email:{" "}
        {status.state === "sent"
          ? "SMTP accepted for today"
          : status.state === "sending"
            ? "Sending"
            : status.state === "paused"
              ? "Paused"
              : status.state === "uncertain"
                ? "Delivery uncertain; duplicate resend blocked"
                : status.state === "failed"
                  ? "Send failed; recovery pending"
                  : "Not recorded yet"}{" "}
        · 8:00 a.m. Central
      </p>
      {status.error && (
        <p>
          {status.error}{" "}
          {status.failureEmailSent
            ? "Failure email accepted by SMTP."
            : "Failure alert email is not confirmed."}
        </p>
      )}
    </div>
  );
}

function TodayTask({
  task,
  localDate,
  today,
  planStartDate,
  planStarted,
  planDay,
  taskDate,
  isPreview,
  busy,
  onDateChange,
  onComplete,
  onSaveNotes,
  onOpenPlan,
}: {
  task: Task | null;
  localDate: string;
  today: string;
  planStartDate: string;
  planStarted: boolean;
  planDay: number | null;
  taskDate: string;
  isPreview: boolean;
  busy: boolean;
  onDateChange: (date: string) => void;
  onComplete: (task: Task) => void;
  onSaveNotes: (task: Task, notes: string) => void;
  onOpenPlan: () => void;
}) {
  const complete = task?.status === "complete";
  const readOnly = isPreview || !planStarted;
  const isCurrentDate = localDate === today;

  return (
    <div className="space-y-7 p-5 sm:p-8 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-black/10 pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#916100]">
            One thing at a time
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            {dayLabel(taskDate)}
          </h2>
          {!planStarted ? (
            <p className="mt-2 text-sm font-bold text-[#916100]">
              Starts tomorrow · {dayLabel(planStartDate)}
            </p>
          ) : isPreview ? (
            <p className="mt-2 text-sm text-black/55">
              Scheduled preview · read only
            </p>
          ) : (
            <p className="mt-2 text-sm text-black/55">
              Today&apos;s assigned task stays here until tomorrow.
            </p>
          )}
          {isCurrentDate && <DailyReminderStatus />}
        </div>

        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous date"
            className="rounded-none"
            onClick={() => onDateChange(shiftDate(localDate, -1))}
            variant="outline"
          >
            <ChevronLeft size={17} />
          </Button>
          <input
            aria-label="Task date"
            className={`${inputClass} max-w-40`}
            onChange={event =>
              event.target.value && onDateChange(event.target.value)
            }
            type="date"
            value={localDate}
          />
          <Button
            aria-label="Next date"
            className="rounded-none"
            onClick={() => onDateChange(shiftDate(localDate, 1))}
            variant="outline"
          >
            <ChevronRight size={17} />
          </Button>
          {!isCurrentDate ? (
            <Button
              className="rounded-none"
              onClick={() => onDateChange(today)}
              variant="outline"
            >
              Today
            </Button>
          ) : null}
        </div>
      </header>

      {task ? (
        <article className="overflow-hidden border border-black/10 bg-white shadow-[0_16px_50px_rgba(0,0,0,.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[#fff4d6] p-5 sm:p-7">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#916100]">
                {readOnly
                  ? "Scheduled task preview"
                  : complete
                    ? "Completed task"
                    : `Plan day ${planDay ?? 1}`}
              </p>
              <p className="mt-2 text-xs font-semibold text-black/55">
                Scheduled for {shortDateLabel(taskDate)}
              </p>
            </div>
            <span
              className={`border px-3 py-1 text-xs font-bold ${complete ? "border-emerald-700 bg-emerald-700 text-white" : "border-black bg-black text-[#ffb627]"}`}
            >
              {complete ? "Done" : readOnly ? "Preview" : "Assigned"}
            </span>
          </div>

          <div className="p-5 sm:p-7">
            <h3 className="max-w-4xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              {task.title}
            </h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-black/65">
              {task.description}
            </p>

            {complete ? (
              <div className="mt-6 flex items-center gap-3 border-l-4 border-emerald-700 bg-emerald-50 p-4 text-sm font-bold text-emerald-950">
                <CheckCircle2 className="shrink-0" size={20} />
                Done for today. Your next task is available tomorrow.
              </div>
            ) : readOnly ? (
              <p className="mt-6 border-l-4 border-[#ffb627] bg-[#faf8f2] p-4 text-sm leading-6 text-black/65">
                This is a preview. Completion is available only on its assigned
                date.
              </p>
            ) : (
              <Button
                className="mt-6 h-12 rounded-none bg-[#ffb627] px-5 font-bold text-black hover:bg-[#e5a31d]"
                disabled={busy}
                onClick={() => onComplete(task)}
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                Mark complete
              </Button>
            )}

            <details className="mt-7 border-t border-black/10 pt-4">
              <summary className="cursor-pointer text-sm font-bold">
                Steps and done when
              </summary>
              <ol className="mt-4 space-y-3">
                {task.steps.map((step, index) => (
                  <li
                    className="flex gap-3 text-sm leading-6 text-black/75"
                    key={index}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-[#f4f1e9] text-xs font-bold">
                      {index + 1}
                    </span>
                    <span>{step.replace(/^\d+[.)]\s*/, "")}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 border-l-4 border-[#ffb627] bg-[#faf8f2] p-4">
                <p className="text-xs font-bold">Done when</p>
                <p className="mt-2 text-sm leading-6 text-black/65">
                  {task.doneWhen}
                </p>
              </div>
              {task.requiresApproval ? (
                <p className="mt-4 text-xs leading-6 text-black/55">
                  Complete only the work described here. This workspace does not
                  publish, send, purchase, or change an external campaign.
                </p>
              ) : null}
            </details>

            {!readOnly ? (
              <TaskNotes task={task} busy={busy} onSave={onSaveNotes} />
            ) : task.notes ? (
              <details className="mt-5 border-t border-black/10 pt-4">
                <summary className="cursor-pointer text-sm font-bold">
                  Task notes
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/65">
                  {task.notes}
                </p>
              </details>
            ) : null}
          </div>
        </article>
      ) : (
        <div className="border border-black/10 bg-white p-8">
          <CheckCircle2 className="text-emerald-700" />
          <h3 className="mt-4 text-2xl font-black">No task assigned</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
            The current plan has no task for this date. Review the complete plan
            for its scheduled work.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          className="rounded-none bg-black text-white"
          onClick={onOpenPlan}
        >
          Open full plan
        </Button>
      </div>
    </div>
  );
}

function TaskNotes({
  task,
  busy,
  onSave,
}: {
  task: Task;
  busy: boolean;
  onSave: (task: Task, notes: string) => void;
}) {
  const [notes, setNotes] = useState(task.notes ?? "");

  useEffect(() => {
    setNotes(task.notes ?? "");
  }, [task.id, task.notes]);

  return (
    <details className="mt-5 border-t border-black/10 pt-4">
      <summary className="cursor-pointer text-sm font-bold">
        Task notes (optional)
      </summary>
      <label className="sr-only" htmlFor="growth-task-notes">
        Task notes
      </label>
      <textarea
        className="mt-4 min-h-28 w-full rounded-none border border-black/15 bg-[#faf8f2] p-3 text-sm leading-6"
        id="growth-task-notes"
        maxLength={4000}
        onChange={event => setNotes(event.target.value)}
        placeholder="Save a draft link, outcome, decision, or blocker."
        value={notes}
      />
      <Button
        className="mt-3 rounded-none bg-black text-white"
        disabled={busy || notes === (task.notes ?? "")}
        onClick={() => onSave(task, notes)}
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : null}
        Save notes
      </Button>
    </details>
  );
}

function GrowthPlan({
  tasks,
  completed,
  planStartDate,
  search,
  onSearchChange,
}: {
  tasks: Task[];
  completed: number;
  planStartDate: string;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const total = tasks.length || 100;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const query = search.trim().toLowerCase();
  const visible = tasks.filter(task =>
    `${task.title} ${task.description}`.toLowerCase().includes(query)
  );

  return (
    <div className="space-y-7 p-5 sm:p-8 lg:p-10">
      <header className="border-b border-black/10 pb-5">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#916100]">
          The complete plan
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-3xl font-black tracking-tight">
              100-day growth plan
            </h2>
            <p className="mt-2 text-sm text-black/55">
              One scheduled task per day, beginning{" "}
              {shortDateLabel(planStartDate)}.
            </p>
          </div>
          <div className="border-l-4 border-[#ffb627] bg-white px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-black/45">
              Plan progress
            </p>
            <p className="mt-1 text-4xl font-black tracking-tight">
              {completed}/{total}
            </p>
          </div>
        </div>
        <div
          className="mt-5 h-2 bg-black/10"
          aria-label={`${completed} of ${total} tasks complete`}
        >
          <div
            className="h-full bg-[#ffb627]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3.5 text-black/40" size={16} />
        <input
          aria-label="Search full growth plan"
          className={`${inputClass} pl-9`}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search the plan"
          value={search}
        />
      </div>

      <div className="divide-y divide-black/10 border border-black/10 bg-white">
        {visible.map(task => {
          const date = scheduledDate(task, planStartDate);
          const day = task.scheduledDay;
          return (
            <details className="group" key={task.id}>
              <summary className="flex cursor-pointer list-none items-start gap-4 p-4 hover:bg-[#fff8e5]">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold ${task.status === "complete" ? "border-emerald-700 bg-emerald-700 text-white" : "border-black/20 text-black/55"}`}
                >
                  {task.status === "complete" ? "✓" : day}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-black">
                    {task.title}
                  </span>
                  <span className="mt-1 block text-xs text-black/50">
                    Day {day} · {shortDateLabel(date)}
                  </span>
                </span>
                <span className="text-xs font-semibold text-black/50">
                  {statusLabel[task.status]}
                </span>
              </summary>
              <div className="border-t border-black/10 bg-[#faf8f2] px-5 py-4 sm:pl-14">
                <p className="max-w-3xl text-sm leading-6 text-black/65">
                  {task.description}
                </p>
                <p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-[#916100]">
                  Done when
                </p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-black/65">
                  {task.doneWhen}
                </p>
              </div>
            </details>
          );
        })}
        {!visible.length ? (
          <p className="p-6 text-sm text-black/55">
            No plan tasks match that search.
          </p>
        ) : null}
      </div>

      <details className="border-t border-black/10 pt-5 text-xs leading-6 text-black/50">
        <summary className="cursor-pointer font-semibold">
          Plan source and scope
        </summary>
        <p className="mt-3">
          {GROWTH_PLAN_NOTE} Tasks are implementation work to do, not promised
          results or already-produced assets. Existing outbound campaigns and
          email schedules are unchanged by this plan.
        </p>
      </details>
    </div>
  );
}
