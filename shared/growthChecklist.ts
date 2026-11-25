import type { ChecklistAction } from "./chamberChecklist";

export const GROWTH_SLUG_PREFIX = "authority-";

export function isGrowthAction(action: { slug: string }) {
  return action.slug.startsWith(GROWTH_SLUG_PREFIX);
}

export function splitGrowthActions<T extends { slug: string }>(actions: T[]) {
  return {
    actions: actions.filter(isGrowthAction),
    legacyActions: actions.filter(
      action => !isGrowthAction(action) && !action.slug.startsWith("ddb-")
    ),
    archivedGrowthActions: actions.filter(action =>
      action.slug.startsWith("ddb-")
    ),
  };
}

export function growthLocalDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isValidGrowthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function pendingGrowthDependencies(
  task: { dependsOn?: string[] },
  actions: Array<{ slug: string; status: string }>
) {
  const completed = new Set(
    actions
      .filter(action => action.status === "complete")
      .map(action => action.slug)
  );
  return (task.dependsOn ?? []).filter(slug => !completed.has(slug));
}

export function recommendGrowthAction<
  T extends ChecklistAction & { slug: string; dependsOn?: string[] },
>(actions: T[]) {
  const ready = [...actions]
    .sort(
      (a, b) =>
        (a.dispatchOrder ?? a.sortOrder) - (b.dispatchOrder ?? b.sortOrder)
    )
    .filter(action => pendingGrowthDependencies(action, actions).length === 0);
  return (
    ready.find(action => action.status === "in_progress") ??
    ready.find(action => action.status === "not_started") ??
    null
  );
}
