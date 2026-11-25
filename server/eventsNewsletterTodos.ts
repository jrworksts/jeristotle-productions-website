import { and, eq, inArray } from "drizzle-orm";
import { chamberActions, growthDailyChecks } from "../drizzle/schema";
import { getDb } from "./db";
import {
  GROWTH_DAY_ASSIGNMENT_SLUG,
  GROWTH_SCHEDULED_TASKS,
  readAssignedTaskId,
  shiftGrowthDate,
  singleGrowthTaskForDate,
} from "../shared/growthDailyPlan";
import {
  growthLocalDate,
  isValidGrowthDate,
  pendingGrowthDependencies,
} from "../shared/growthChecklist";
import type { NewsletterIssue } from "./eventsNewsletter";

type TaskRow = Pick<
  typeof chamberActions.$inferSelect,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "owner"
  | "status"
  | "dueDate"
  | "notes"
>;
type Assignment = Pick<typeof growthDailyChecks.$inferSelect, "notes">;

/** Pure selection: a newsletter is a planning view, never a task assignment. */
export function selectNewsletterTodos(
  actions: readonly TaskRow[],
  assignment: Assignment | null,
  weekStart: string,
  asOf: string
): NonNullable<NewsletterIssue["toDos"]> {
  if (
    !isValidGrowthDate(weekStart) ||
    new Date(`${weekStart}T12:00:00Z`).getUTCDay() !== 0 ||
    !isValidGrowthDate(asOf)
  )
    throw new Error("Invalid newsletter task snapshot date");
  const metadata = new Map(
    GROWTH_SCHEDULED_TASKS.map(task => [task.slug, task])
  );
  const plan = actions
    .filter(task => metadata.has(task.slug))
    .map(task => ({
      ...task,
      scheduledDay: metadata.get(task.slug)!.scheduledDay,
    }))
    .sort((a, b) => a.scheduledDay - b.scheduledDay);
  const weekEnd = shiftGrowthDate(weekStart, 6);
  const items: NonNullable<NewsletterIssue["toDos"]>["items"] = [];
  const actionable = (task: TaskRow) =>
    task.owner?.trim().toLowerCase() === "jeremy" && task.status !== "complete";
  const append = (task: TaskRow, timing: string, production = false) => {
    if (
      !actionable(task) ||
      items.some(item => item.taskId === task.id) ||
      items.length >= 3
    )
      return;
    const meta = metadata.get(task.slug)!;
    const dependencies = pendingGrowthDependencies(meta, [...actions]);
    const pendingTitles = dependencies.map(
      slug =>
        actions.find(row => row.slug === slug)?.title ??
        "Unverified prerequisite"
    );
    // Only compact unchecked checklist headings, never raw private working notes.
    const creativeSteps = production
      ? (task.notes ?? "")
          .split(/\r?\n/)
          .map(line => line.match(/^\s*(?:-\s*)?\[ \]\s+(.+)$/)?.[1])
          .filter((line): line is string => Boolean(line))
          .slice(0, 2)
      : [];
    const description = creativeSteps.length
      ? creativeSteps.join(" ")
      : meta.steps?.[0] || task.description;
    const gate = pendingTitles.length
      ? ` Prerequisites still open: ${pendingTitles.join("; ")}. Do not start dependent execution yet.`
      : "";
    items.push({
      taskId: task.id,
      title: production
        ? "Apply reference lessons to the next original business-story shoot"
        : task.title,
      detail: `${description}${gate}`.slice(0, 700),
      status: dependencies.length
        ? "blocked"
        : (task.status as "not_started" | "in_progress" | "blocked"),
      timing,
    });
  };
  // A saved assignment wins even when complete or empty: never replace it with more work today.
  const primary = assignment
    ? (plan.find(task => task.id === readAssignedTaskId(assignment.notes)) ??
      null)
    : singleGrowthTaskForDate(plan, asOf);
  if (primary)
    append(
      primary,
      assignment
        ? `Current assigned task for ${asOf}; status read from Growth Hub`
        : `Suggested current focus as of ${asOf}; not a saved daily assignment`
    );
  const production = plan.find(
    task =>
      actionable(task) &&
      task.slug.startsWith("authority-content_engine-") &&
      /Reference lessons applied to production/.test(task.notes ?? "") &&
      /\[ \]/.test(task.notes ?? "")
  );
  if (production)
    append(
      production,
      "Production backlog preview, not an extra task assigned today; final creative and public use require review",
      true
    );
  const upcoming = plan.find(
    task =>
      actionable(task) &&
      task.id !== primary?.id &&
      task.id !== production?.id &&
      task.dueDate &&
      task.dueDate.toISOString().slice(0, 10) >= asOf &&
      task.dueDate.toISOString().slice(0, 10) >= weekStart &&
      task.dueDate.toISOString().slice(0, 10) <= weekEnd
  );
  if (upcoming)
    append(
      upcoming,
      `This-week planning preview, original target ${upcoming.dueDate!.toISOString().slice(0, 10)}; not an assignment or authorization`
    );
  return {
    asOf,
    items,
    note: "One assigned implementation task per day. Other items are planning or production-backlog previews. Check the live Growth Hub before acting; completed work is omitted and approval gates remain in place. Reference lessons belong in original client-facing production, not guru-style teaching reels.",
  };
}

/** SELECT-only snapshot. Never call getGrowthWorkspace, which can freeze a new assignment. */
export async function readNewsletterTodos(weekStart: string, now = new Date()) {
  const asOf = growthLocalDate(now);
  const db = await getDb();
  if (!db) throw new Error("Current Growth Hub task data is unavailable");
  return db.transaction(
    async tx => {
      const actions = await tx
        .select({
          id: chamberActions.id,
          slug: chamberActions.slug,
          title: chamberActions.title,
          description: chamberActions.description,
          owner: chamberActions.owner,
          status: chamberActions.status,
          dueDate: chamberActions.dueDate,
          notes: chamberActions.notes,
        })
        .from(chamberActions)
        .where(
          inArray(
            chamberActions.slug,
            GROWTH_SCHEDULED_TASKS.map(task => task.slug)
          )
        );
      if (actions.length !== GROWTH_SCHEDULED_TASKS.length)
        throw new Error("Current Growth Hub plan is incomplete");
      const assignments = await tx
        .select({ notes: growthDailyChecks.notes })
        .from(growthDailyChecks)
        .where(
          and(
            eq(growthDailyChecks.localDate, asOf),
            eq(growthDailyChecks.routineSlug, GROWTH_DAY_ASSIGNMENT_SLUG)
          )
        );
      if (assignments.length > 1)
        throw new Error("Ambiguous daily task assignment");
      return selectNewsletterTodos(
        actions,
        assignments[0] ?? null,
        weekStart,
        asOf
      );
    },
    { isolationLevel: "repeatable read" }
  );
}
