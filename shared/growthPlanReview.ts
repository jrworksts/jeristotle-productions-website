import { z } from "zod";
import { GROWTH_SCHEDULED_TASKS } from "./growthDailyPlan";
import {
  isValidGrowthDate,
  pendingGrowthDependencies,
} from "./growthChecklist";

export const GROWTH_POSTING_REVIEW_SLUG = "growth-posting-review-v1";
export const GROWTH_POSTING_REVIEW_VERSION = "posting-review-2026-11-16-v1";

const text = z.string().refine(value => value.trim().length > 0);
const reviewTaskSchema = z
  .object({
    slug: text,
    disposition: z.enum([
      "active",
      "conditional",
      "deferred",
      "merged",
      "superseded",
    ]),
    priorityOrder: z.number().int().nonnegative(),
    title: text.optional(),
    description: text.optional(),
    steps: z.array(text).optional(),
    doneWhen: text.optional(),
    minutes: z.number().int().positive().optional(),
    dependencies: z.array(text).optional(),
  })
  .strict();
const reviewSchema = z
  .object({
    version: z.literal(GROWTH_POSTING_REVIEW_VERSION),
    tasks: z.array(reviewTaskSchema).max(GROWTH_SCHEDULED_TASKS.length),
  })
  .strict();

export type GrowthPostingReviewTask = z.infer<typeof reviewTaskSchema>;
export type GrowthPostingReview = z.infer<typeof reviewSchema>;

/**
 * Owner-authorized, dated growthDailyChecks row; notes is this exact JSON contract.
 * No ids, state, owners, dates, access, rights or approvals can be supplied here.
 * Missing entries are not automatic homework. An empty tasks array pauses selection.
 * Parsing never writes a routine, resets a plan, or changes any task state.
 */
export function parseGrowthPostingReview(
  notes: string | null | undefined
): GrowthPostingReview {
  let input: unknown;
  try {
    input = JSON.parse(notes ?? "");
  } catch {
    throw new Error("Invalid growth posting review JSON.");
  }
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Invalid growth posting review contract.");
  const review = parsed.data;
  const canonical = new Set(GROWTH_SCHEDULED_TASKS.map(task => task.slug));
  const entries = new Map<string, GrowthPostingReviewTask>();
  for (const entry of review.tasks) {
    if (!canonical.has(entry.slug))
      throw new Error(`Unknown growth posting review task: ${entry.slug}.`);
    if (entries.has(entry.slug))
      throw new Error(`Duplicate growth posting review task: ${entry.slug}.`);
    for (const slug of entry.dependencies ?? []) {
      if (!canonical.has(slug))
        throw new Error(`Unknown growth posting review prerequisite: ${slug}.`);
    }
    if (new Set(entry.dependencies).size !== (entry.dependencies?.length ?? 0))
      throw new Error(
        `Duplicate growth posting review prerequisites: ${entry.slug}.`
      );
    entries.set(entry.slug, entry);
  }
  // Check the full effective canonical graph, not only the reviewed/active subset.
  assertAcyclicGrowthReviewDependencies(
    GROWTH_SCHEDULED_TASKS.map(task => ({
      slug: task.slug,
      dependsOn: entries.get(task.slug)?.dependencies ?? task.dependsOn,
    }))
  );
  return review;
}

function assertAcyclicGrowthReviewDependencies(
  actions: readonly { slug: string; dependsOn?: readonly string[] }[]
) {
  const graph = new Map(actions.map(task => [task.slug, task.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (slug: string) => {
    if (visiting.has(slug))
      throw new Error("Cyclic growth posting review prerequisites.");
    if (visited.has(slug)) return;
    if (!graph.has(slug))
      throw new Error("Missing growth posting review prerequisite.");
    visiting.add(slug);
    for (const dependency of graph.get(slug)!) visit(dependency);
    visiting.delete(slug);
    visited.add(slug);
  };
  graph.forEach((_dependencies, slug) => visit(slug));
}

/** Presentation-only replacements: never spread untrusted review state into a task. */
export function applyGrowthPostingReview<
  T extends { slug: string; status: string; dependsOn?: string[] },
>(actions: readonly T[], review: GrowthPostingReview): T[] {
  const entries = new Map(review.tasks.map(entry => [entry.slug, entry]));
  const reviewed = actions.map(task => {
    const entry = entries.get(task.slug);
    if (!entry || task.status === "complete") return task;
    return {
      ...task,
      ...(entry.title === undefined ? {} : { title: entry.title }),
      ...(entry.description === undefined
        ? {}
        : { description: entry.description }),
      ...(entry.steps === undefined ? {} : { steps: [...entry.steps] }),
      ...(entry.doneWhen === undefined ? {} : { doneWhen: entry.doneWhen }),
      ...(entry.minutes === undefined ? {} : { minutes: entry.minutes }),
      ...(entry.dependencies === undefined
        ? {}
        : { dependsOn: [...entry.dependencies] }),
    };
  });
  // Completed tasks keep canonical prerequisites, so also validate the actual overlay.
  assertAcyclicGrowthReviewDependencies(reviewed);
  return reviewed;
}

/** Only an unassigned day uses this; stored dates remain intact but do not gate reprioritization. */
export function reviewedGrowthTaskForDate<
  T extends {
    slug: string;
    status: string;
    scheduledDay: number;
    dependsOn?: string[];
  },
>(
  actions: readonly T[],
  review: GrowthPostingReview,
  localDate: string
): T | null {
  if (!isValidGrowthDate(localDate)) throw new Error("Invalid calendar date.");
  const active = new Map(
    review.tasks
      .filter(entry => entry.disposition === "active")
      .map(entry => [entry.slug, entry.priorityOrder])
  );
  return (
    [...actions]
      .filter(task => active.has(task.slug) && task.status !== "complete")
      .sort(
        (a, b) =>
          active.get(a.slug)! - active.get(b.slug)! ||
          a.scheduledDay - b.scheduledDay
      )
      .find(
        task => pendingGrowthDependencies(task, [...actions]).length === 0
      ) ?? null
  );
}
