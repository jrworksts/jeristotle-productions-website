export type ChecklistAction = {
  id: number;
  sortOrder: number;
  dispatchOrder?: number;
  status: "not_started" | "in_progress" | "blocked" | "complete";
  slug?: string;
  dependsOn?: string[];
};

export function getNextChecklistAction<T extends ChecklistAction>(
  actions: T[]
) {
  const complete = new Set(
    actions
      .filter(action => action.status === "complete")
      .map(action => action.slug)
  );
  const ordered = [...actions]
    .sort(
      (a, b) =>
        (a.dispatchOrder ?? a.sortOrder) - (b.dispatchOrder ?? b.sortOrder)
    )
    .filter(action =>
      (action.dependsOn ?? []).every(slug => complete.has(slug))
    );
  return (
    ordered.find(action => action.status === "in_progress") ??
    ordered.find(action => action.status === "not_started") ??
    null
  );
}

export function getChecklistProgress(actions: ChecklistAction[]) {
  const complete = actions.filter(
    action => action.status === "complete"
  ).length;
  const blocked = actions.filter(action => action.status === "blocked").length;
  return { complete, blocked, total: actions.length };
}
