import {
  GROWTH_SCHEDULED_TASKS,
  readAssignedTaskId,
  shiftGrowthDate,
} from "./growthDailyPlan";
import { isValidGrowthDate } from "./growthChecklist";
import { LINKEDIN_PRIORITY_EFFECTIVE_DATE } from "./linkedinPriorityPlan";

type Action = {
  id: number;
  slug: string;
  status: string;
  dueDate: Date | null;
};
type Assignment = { localDate: string; notes: string | null };

export function planLinkedInPriorityDates(
  actions: readonly Action[],
  assignments: readonly Assignment[],
  today: string
) {
  if (!isValidGrowthDate(today))
    throw new Error("Invalid current calendar date.");
  const canonical = new Map(
    GROWTH_SCHEDULED_TASKS.map(task => [task.slug, task])
  );
  if (
    actions.length !== canonical.size ||
    new Set(actions.map(task => task.slug)).size !== canonical.size ||
    actions.some(task => !canonical.has(task.slug))
  )
    throw new Error("The exact complete 100-task active plan is required.");
  const ids = new Set(actions.map(task => task.id));
  if (ids.size !== actions.length)
    throw new Error("Duplicate active task identity.");
  const frozenIds = new Set<number>();
  const reservedDates = new Set<string>();
  for (const assignment of assignments) {
    if (!isValidGrowthDate(assignment.localDate))
      throw new Error("Invalid saved assignment date.");
    const id = readAssignedTaskId(assignment.notes);
    if (id !== null && ids.has(id)) {
      frozenIds.add(id);
      reservedDates.add(assignment.localDate);
    }
  }
  const protectedTasks = actions.filter(
    task => task.status !== "not_started" || frozenIds.has(task.id)
  );
  const protectedIds = new Set(protectedTasks.map(task => task.id));
  for (const task of protectedTasks) {
    if (task.dueDate)
      reservedDates.add(task.dueDate.toISOString().slice(0, 10));
  }
  const bySlug = new Map(actions.map(task => [task.slug, task]));
  let nextDate = shiftGrowthDate(today, 1);
  if (nextDate < LINKEDIN_PRIORITY_EFFECTIVE_DATE)
    nextDate = LINKEDIN_PRIORITY_EFFECTIVE_DATE;
  const planned: {
    id: number;
    slug: string;
    beforeDate: Date | null;
    dueDate: Date;
    localDate: string;
  }[] = [];
  for (const canonicalTask of GROWTH_SCHEDULED_TASKS) {
    const task = bySlug.get(canonicalTask.slug)!;
    if (protectedIds.has(task.id)) continue;
    while (reservedDates.has(nextDate)) nextDate = shiftGrowthDate(nextDate, 1);
    planned.push({
      id: task.id,
      slug: task.slug,
      beforeDate: task.dueDate,
      dueDate: new Date(`${nextDate}T00:00:00Z`),
      localDate: nextDate,
    });
    reservedDates.add(nextDate);
    nextDate = shiftGrowthDate(nextDate, 1);
  }
  return {
    planned,
    changes: planned.filter(
      task => task.beforeDate?.getTime() !== task.dueDate.getTime()
    ),
    protectedIds: Array.from(protectedIds),
  };
}
