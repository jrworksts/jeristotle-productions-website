import type { getGrowthWorkspace } from "./growthDb";
import type {
  DigestTask,
  GrowthReminderEmailData,
} from "./growthReminderEmail";
import {
  isValidGrowthDate,
  pendingGrowthDependencies,
} from "../shared/growthChecklist";
import { getChecklistProgress } from "../shared/chamberChecklist";

type WorkspaceResult = Awaited<ReturnType<typeof getGrowthWorkspace>>;

/**
 * The task-selection fields are persisted by the growth workspace query. They
 * deliberately travel with the workspace so this module never selects a new
 * task for an email snapshot.
 */
export type GrowthReminderWorkspace = WorkspaceResult & {
  planStartDate: string;
  planDay: number | null;
  planStarted: boolean;
  dailyTask: WorkspaceResult["actions"][number] | null;
  dailyTaskDate: string;
  dailyTaskIsPreview: boolean;
};

/** Target dates are calendar dates chosen in the app, not instants to shift by timezone. */
function targetDate(date: Date | null): string | null {
  return date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

function mapTask(
  task: GrowthReminderWorkspace["actions"][number],
  actions: GrowthReminderWorkspace["actions"]
): DigestTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    owner: task.owner,
    minutes: task.minutes,
    steps: task.steps,
    doneWhen: task.doneWhen,
    notes: task.notes,
    dueDate: targetDate(task.dueDate),
    status: task.status,
    pendingDependencies: pendingGrowthDependencies(task, actions).map(
      slug => actions.find(action => action.slug === slug)?.title ?? slug
    ),
  };
}

/**
 * Builds the email snapshot from the workspace's persisted daily task. This
 * function must not recommend, reorder, or advance work. The backend owns that
 * state transition after the selected task has been completed.
 */
export function buildGrowthReminderData(
  workspace: GrowthReminderWorkspace
): GrowthReminderEmailData {
  if (!isValidGrowthDate(workspace.localDate))
    throw new Error("Invalid task-digest date.");
  if (!isValidGrowthDate(workspace.planStartDate))
    throw new Error("Invalid plan start date.");
  if (!isValidGrowthDate(workspace.dailyTaskDate))
    throw new Error("Invalid daily task date.");

  const prestart =
    !workspace.planStarted || workspace.localDate < workspace.planStartDate;
  const preview =
    prestart ||
    workspace.dailyTaskIsPreview ||
    workspace.dailyTaskDate > workspace.localDate;
  const dailyTask = workspace.dailyTask
    ? mapTask(workspace.dailyTask, workspace.actions)
    : null;
  const progress = getChecklistProgress(workspace.actions);

  return {
    localDate: workspace.localDate,
    dateLabel: new Date(`${workspace.localDate}T12:00:00Z`).toLocaleDateString(
      "en-US",
      {
        timeZone: "America/Chicago",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    ),
    planStartDate: workspace.planStartDate,
    planDay: workspace.planDay,
    planStarted: workspace.planStarted,
    dailyTaskDate: workspace.dailyTaskDate,
    dailyTaskIsPreview: preview,
    state: prestart
      ? "prestart"
      : preview
        ? "preview"
        : dailyTask
          ? "task"
          : "finished",
    progress: { complete: progress.complete, total: progress.total },
    dailyTask,
    // Kept only for call-site compatibility. It is exactly the persisted task,
    // not a newly calculated recommendation.
    recommended: dailyTask,
  };
}
