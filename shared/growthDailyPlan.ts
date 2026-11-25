import { GROWTH_TASKS } from "./growthPlan";
import { isValidGrowthDate } from "./growthChecklist";

export const GROWTH_DAILY_START_DATE = "2026-10-22";
export const GROWTH_DAILY_PLAN_VERSION = "single-task-2026-10-22";
export const GROWTH_DAY_ASSIGNMENT_SLUG = "growth-one-task-assignment-v1";
export const GROWTH_RESET_MARKER_SLUG = "growth-one-task-reset-v1";

export function shiftGrowthDate(localDate: string, days: number) {
  if (!isValidGrowthDate(localDate) || !Number.isInteger(days))
    throw new Error("Use a valid calendar date and whole-day offset.");
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function growthPlanDay(localDate: string) {
  if (!isValidGrowthDate(localDate)) throw new Error("Invalid calendar date.");
  if (localDate < GROWTH_DAILY_START_DATE) return null;
  return (
    Math.round(
      (Date.parse(`${localDate}T00:00:00Z`) -
        Date.parse(`${GROWTH_DAILY_START_DATE}T00:00:00Z`)) /
        86_400_000
    ) + 1
  );
}

/** Stable topological ordering keeps every prerequisite before its dependent task. */
export function orderGrowthDays<
  T extends {
    slug: string;
    sortOrder: number;
    dispatchOrder?: number;
    dependsOn?: string[];
  },
>(tasks: readonly T[]): T[] {
  const remaining = [...tasks].sort(
    (a, b) =>
      (a.dispatchOrder ?? a.sortOrder) - (b.dispatchOrder ?? b.sortOrder) ||
      a.sortOrder - b.sortOrder
  );
  const known = new Set(tasks.map(task => task.slug));
  if (known.size !== tasks.length)
    throw new Error("Duplicate growth task slug.");
  const completed = new Set<string>();
  const ordered: T[] = [];
  while (remaining.length) {
    const index = remaining.findIndex(task =>
      (task.dependsOn ?? []).every(
        slug => known.has(slug) && completed.has(slug)
      )
    );
    if (index < 0)
      throw new Error("Growth plan has missing or cyclic prerequisites.");
    const [task] = remaining.splice(index, 1);
    ordered.push(task);
    completed.add(task.slug);
  }
  return ordered;
}

export const GROWTH_SCHEDULED_TASKS = orderGrowthDays(GROWTH_TASKS).map(
  (task, index) => ({
    ...task,
    scheduledDay: index + 1,
    scheduledDate: shiftGrowthDate(GROWTH_DAILY_START_DATE, index),
  })
);

export function initialSingleTaskTargetDate(slug: string) {
  const task = GROWTH_SCHEDULED_TASKS.find(item => item.slug === slug);
  return task ? new Date(`${task.scheduledDate}T00:00:00Z`) : null;
}

export function readAssignedTaskId(notes: string | null | undefined) {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    return parsed.version === GROWTH_DAILY_PLAN_VERSION &&
      Number.isInteger(parsed.taskId) &&
      parsed.taskId > 0
      ? Number(parsed.taskId)
      : null;
  } catch {
    return null;
  }
}

export function singleGrowthTaskForDate<
  T extends {
    id: number;
    slug: string;
    status: string;
    dueDate: Date | null;
    scheduledDay: number;
  },
>(actions: readonly T[], localDate: string, assignedId: number | null = null) {
  if (!isValidGrowthDate(localDate)) throw new Error("Invalid calendar date.");
  if (assignedId !== null)
    return actions.find(task => task.id === assignedId) ?? null;
  return (
    [...actions]
      .sort((a, b) => a.scheduledDay - b.scheduledDay)
      .find(
        task =>
          task.status !== "complete" &&
          task.dueDate !== null &&
          new Date(task.dueDate).toISOString().slice(0, 10) <= localDate
      ) ?? null
  );
}

export function previewGrowthTaskForDate<
  T extends {
    scheduledDay: number;
    dueDate: Date | null;
  },
>(actions: readonly T[], localDate: string) {
  const date =
    localDate < GROWTH_DAILY_START_DATE ? GROWTH_DAILY_START_DATE : localDate;
  return (
    actions.find(
      task =>
        task.dueDate &&
        new Date(task.dueDate).toISOString().slice(0, 10) === date
    ) ?? null
  );
}
