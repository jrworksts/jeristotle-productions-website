import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { chamberActions, growthDailyChecks } from "../drizzle/schema";
import { GROWTH_DAILY_ROUTINE } from "../shared/growthPlan";
import { GROWTH_TASKS as ARCHIVED_TASKS } from "../shared/blueprintGrowthPlan";
import {
  growthLocalDate,
  isValidGrowthDate,
  pendingGrowthDependencies,
  splitGrowthActions,
} from "../shared/growthChecklist";
import {
  GROWTH_DAILY_START_DATE,
  GROWTH_DAILY_PLAN_VERSION,
  GROWTH_DAY_ASSIGNMENT_SLUG,
  GROWTH_RESET_MARKER_SLUG,
  GROWTH_SCHEDULED_TASKS,
  growthPlanDay,
  initialSingleTaskTargetDate,
  previewGrowthTaskForDate,
  readAssignedTaskId,
  singleGrowthTaskForDate,
} from "../shared/growthDailyPlan";
import {
  GROWTH_POSTING_REVIEW_SLUG,
  GROWTH_POSTING_REVIEW_VERSION,
  applyGrowthPostingReview,
  parseGrowthPostingReview,
  reviewedGrowthTaskForDate,
  type GrowthPostingReview,
} from "../shared/growthPlanReview";
import { getDb, updateChamberAction } from "./db";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export function initialGrowthTargetDate(task: {
  slug?: string;
  category: string;
  sortOrder: number;
}) {
  const slug =
    task.slug ??
    GROWTH_SCHEDULED_TASKS.find(
      item =>
        item.sortOrder === task.sortOrder && item.category === task.category
    )?.slug;
  return slug ? initialSingleTaskTargetDate(slug) : null;
}

/** Reads never reset progress. Only missing canonical plan rows are inserted. */
export async function ensureGrowthPlan() {
  const db = await requireDb();
  const existing = await db
    .select({ slug: chamberActions.slug })
    .from(chamberActions);
  const slugs = new Set(existing.map(action => action.slug));
  const missing = GROWTH_SCHEDULED_TASKS.filter(task => !slugs.has(task.slug));
  if (missing.length) {
    await db
      .insert(chamberActions)
      .values(
        missing.map(task => ({
          slug: task.slug,
          phase: task.phase,
          category: task.category,
          title: task.title,
          description: task.description,
          owner: task.owner,
          sortOrder: task.sortOrder,
          status: "not_started" as const,
          dueDate: initialSingleTaskTargetDate(task.slug),
        }))
      )
      .onDuplicateKeyUpdate({ set: { slug: sql`${chamberActions.slug}` } });
  }
  return { inserted: missing.length };
}

/** Explicit, one-time user-authorized reset. The transaction and marker make reruns harmless. */
export async function restartSingleTaskGrowthPlan() {
  await ensureGrowthPlan();
  const db = await requireDb();
  return db.transaction(async tx => {
    const existing = await tx
      .select()
      .from(growthDailyChecks)
      .where(
        and(
          eq(growthDailyChecks.localDate, GROWTH_DAILY_START_DATE),
          eq(growthDailyChecks.routineSlug, GROWTH_RESET_MARKER_SLUG)
        )
      )
      .for("update");
    if (existing.length)
      return { reset: false, startDate: GROWTH_DAILY_START_DATE, taskCount: 0 };
    const activeSlugs = GROWTH_SCHEDULED_TASKS.map(task => task.slug);
    const before = await tx
      .select()
      .from(chamberActions)
      .where(inArray(chamberActions.slug, activeSlugs));
    if (before.length !== activeSlugs.length)
      throw new Error("The complete growth plan must exist before restart.");
    await tx.insert(growthDailyChecks).values({
      localDate: GROWTH_DAILY_START_DATE,
      routineSlug: GROWTH_RESET_MARKER_SLUG,
      complete: 1,
      completedAt: new Date(),
      notes: JSON.stringify({
        version: GROWTH_DAILY_PLAN_VERSION,
        previousActions: before.map(({ id, slug, status, dueDate }) => ({
          id,
          slug,
          status,
          dueDate,
        })),
      }),
    });
    for (const task of GROWTH_SCHEDULED_TASKS) {
      await tx
        .update(chamberActions)
        .set({
          status: "not_started",
          dueDate: initialSingleTaskTargetDate(task.slug),
          // Working notes and owners stay available; only completion and old dates restart.
          updatedAt: new Date(),
        })
        .where(eq(chamberActions.slug, task.slug));
    }
    return {
      reset: true,
      startDate: GROWTH_DAILY_START_DATE,
      taskCount: activeSlugs.length,
    };
  });
}

export async function getGrowthWorkspace(localDate = growthLocalDate()) {
  if (!isValidGrowthDate(localDate))
    throw new Error("Use a valid calendar date.");
  await ensureGrowthPlan();
  const db = await requireDb();
  const today = growthLocalDate();
  const [allActions, dailyChecks, recentChecks, reviewRows] = await Promise.all(
    [
      db.select().from(chamberActions),
      db
        .select()
        .from(growthDailyChecks)
        .where(eq(growthDailyChecks.localDate, localDate)),
      db
        .select()
        .from(growthDailyChecks)
        .orderBy(desc(growthDailyChecks.localDate))
        .limit(100),
      // Dedicated history lookup: a review cannot leak into an earlier day or from the future.
      db
        .select()
        .from(growthDailyChecks)
        .where(
          and(
            eq(growthDailyChecks.routineSlug, GROWTH_POSTING_REVIEW_SLUG),
            lte(growthDailyChecks.localDate, localDate),
            lte(growthDailyChecks.localDate, today)
          )
        )
        .orderBy(desc(growthDailyChecks.localDate))
        .limit(1),
    ]
  );
  const split = splitGrowthActions(allActions);
  const metadata = new Map(
    GROWTH_SCHEDULED_TASKS.map(task => [task.slug, task])
  );
  const archivedMetadata = new Map(
    ARCHIVED_TASKS.map(task => [task.slug, task])
  );
  let actions = split.actions
    .filter(action => metadata.has(action.slug))
    .map(action => ({
      ...action,
      ...metadata.get(action.slug)!,
      owner: action.owner,
    }))
    .sort((a, b) => a.scheduledDay - b.scheduledDay);

  const reviewRow = reviewRows[0];
  let review: GrowthPostingReview | null = null;
  let reviewError: string | null = null;
  if (reviewRow) {
    try {
      const parsed = parseGrowthPostingReview(reviewRow.notes);
      actions = applyGrowthPostingReview(actions, parsed);
      review = parsed;
    } catch (error) {
      // Never fall back to stale setup or persist an assignment from an invalid review.
      reviewError =
        error instanceof Error
          ? error.message
          : "Invalid growth posting review.";
    }
  }

  const saved = dailyChecks.find(
    check => check.routineSlug === GROWTH_DAY_ASSIGNMENT_SLUG
  );
  let dailyTask = saved
    ? (actions.find(task => task.id === readAssignedTaskId(saved.notes)) ??
      null)
    : null;
  const dailyTaskIsPreview =
    localDate !== today || localDate < GROWTH_DAILY_START_DATE;
  if (!saved && !reviewError) {
    if (dailyTaskIsPreview) {
      dailyTask = review
        ? reviewedGrowthTaskForDate(actions, review, localDate)
        : previewGrowthTaskForDate(actions, localDate);
    } else {
      const candidate = review
        ? reviewedGrowthTaskForDate(actions, review, localDate)
        : singleGrowthTaskForDate(actions, localDate);
      // Date+slug unique key freezes the winning assignment through completion and concurrent requests.
      await db
        .insert(growthDailyChecks)
        .values({
          localDate,
          routineSlug: GROWTH_DAY_ASSIGNMENT_SLUG,
          complete: candidate?.status === "complete" ? 1 : 0,
          notes: JSON.stringify({
            version: GROWTH_DAILY_PLAN_VERSION,
            taskId: candidate?.id ?? 0,
          }),
        })
        .onDuplicateKeyUpdate({
          set: { routineSlug: sql`${growthDailyChecks.routineSlug}` },
        });
      const [winner] = await db
        .select()
        .from(growthDailyChecks)
        .where(
          and(
            eq(growthDailyChecks.localDate, localDate),
            eq(growthDailyChecks.routineSlug, GROWTH_DAY_ASSIGNMENT_SLUG)
          )
        );
      dailyTask =
        actions.find(task => task.id === readAssignedTaskId(winner?.notes)) ??
        null;
    }
  }
  return {
    localDate,
    today,
    planStartDate: GROWTH_DAILY_START_DATE,
    planDay: growthPlanDay(localDate),
    planStarted: today >= GROWTH_DAILY_START_DATE,
    dailyTask,
    dailyTaskDate:
      localDate < GROWTH_DAILY_START_DATE ? GROWTH_DAILY_START_DATE : localDate,
    dailyTaskIsPreview,
    actions,
    legacyActions: split.legacyActions.sort(
      (a, b) => a.sortOrder - b.sortOrder
    ),
    archivedGrowthActions: split.archivedGrowthActions
      .map(action => ({
        ...archivedMetadata.get(action.slug),
        ...action,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    dailyChecks,
    recentChecks,
    ...(reviewRow
      ? {
          postingReview: {
            version: GROWTH_POSTING_REVIEW_VERSION,
            localDate: reviewRow.localDate,
            valid: review !== null,
            error: reviewError,
            tasks:
              review?.tasks.map(({ slug, disposition, priorityOrder }) => ({
                slug,
                disposition,
                priorityOrder,
              })) ?? [],
          },
        }
      : {}),
  };
}

export async function updateGrowthTask(
  id: number,
  values: {
    status?: "not_started" | "in_progress" | "blocked" | "complete";
    owner?: string;
    dueDate?: Date | null;
    notes?: string | null;
  }
) {
  const workspace = await getGrowthWorkspace();
  const task = workspace.actions.find(action => action.id === id);
  if (!task) throw new Error("This task is not in the active authority plan.");
  if (values.dueDate !== undefined)
    throw new Error(
      "Dates follow the one-task-per-day plan and cannot be changed individually."
    );
  if (values.status !== undefined && workspace.postingReview?.valid === false)
    throw new Error(
      "Resolve the invalid growth posting review before changing task status."
    );
  if (
    values.status !== undefined &&
    (workspace.dailyTaskIsPreview || workspace.dailyTask?.id !== id)
  ) {
    throw new Error(
      "Only today's assigned task can be checked off or started. The plan starts October 22."
    );
  }
  if (
    (values.status === "in_progress" || values.status === "complete") &&
    pendingGrowthDependencies(task, workspace.actions).length
  ) {
    throw new Error(
      "Complete the listed prerequisites first, or record the blocker in Working notes."
    );
  }
  await updateChamberAction(id, values);
  if (values.status !== undefined) {
    await (
      await requireDb()
    )
      .update(growthDailyChecks)
      .set({
        complete: values.status === "complete" ? 1 : 0,
        completedAt: values.status === "complete" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(growthDailyChecks.localDate, workspace.today),
          eq(growthDailyChecks.routineSlug, GROWTH_DAY_ASSIGNMENT_SLUG)
        )
      );
  }
  return { success: true } as const;
}

/** Compatibility only: old daily-routine history is retained but no longer shown or emailed. */
export async function saveGrowthDailyCheck(input: {
  localDate: string;
  routineSlug: string;
  complete?: boolean;
  notes?: string | null;
}) {
  if (!isValidGrowthDate(input.localDate))
    throw new Error("Use a valid calendar date.");
  if (!GROWTH_DAILY_ROUTINE.some(item => item.slug === input.routineSlug))
    throw new Error("Unknown daily routine item.");
  const db = await requireDb();
  const now = new Date();
  const patch = {
    ...(input.complete === undefined
      ? {}
      : {
          complete: input.complete ? 1 : 0,
          completedAt: input.complete ? now : null,
        }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    updatedAt: now,
  };
  await db
    .insert(growthDailyChecks)
    .values({
      localDate: input.localDate,
      routineSlug: input.routineSlug,
      ...patch,
    })
    .onDuplicateKeyUpdate({ set: patch });
  return { success: true } as const;
}
