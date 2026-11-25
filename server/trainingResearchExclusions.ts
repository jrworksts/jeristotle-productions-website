import {
  normalizeTrainingBusiness,
  normalizeTrainingDomain,
  normalizeTrainingEmail,
  trainingIdentityAliases,
} from "../shared/trainingOutreach";
import { TRAINING_RESEARCH_MAX_EXISTING_IDENTITIES } from "../shared/trainingResearch";

/** Query-sized pages are not source quotas. Every source shares both global bounds. */
export const TRAINING_RESEARCH_EXCLUSION_PAGE_SIZE = 500;
/** Bounds work even when many rows repeat aliases (or have no usable identity). */
export const TRAINING_RESEARCH_EXCLUSION_MAX_ROWS = 100_000;

export type TrainingResearchIdentityRecord = {
  id: number;
  businessName?: string | null;
  website?: string | null;
  normalizedBusiness?: string | null;
  normalizedDomain?: string | null;
  email?: string | null;
  normalizedEmail?: string | null;
};

export type TrainingResearchExclusionSource = {
  name: string;
  /** Ascending primary-key keyset page, strictly after the supplied cursor. */
  readPage: (
    afterId: number | null,
    limit: number
  ) => Promise<TrainingResearchIdentityRecord[]>;
};

export type TrainingResearchExclusionCompleteness = {
  complete: boolean;
  reason: "unique_alias_limit" | "row_scan_limit" | null;
  rowScanLimit: number;
  pageSize: number;
  sources: {
    name: string;
    status: "complete" | "incomplete" | "not_read";
    rowsRead: number;
    pagesRead: number;
    uniqueAliasesAdded: number;
  }[];
};

/** Keep the published normalization and stored-normalized-field precedence exact. */
export function trainingResearchAliasesForIdentity(
  record: TrainingResearchIdentityRecord
) {
  const business =
    record.normalizedBusiness || normalizeTrainingBusiness(record.businessName);
  const domain =
    record.normalizedDomain || normalizeTrainingDomain(record.website);
  const email = record.normalizedEmail || normalizeTrainingEmail(record.email);
  return trainingIdentityAliases({
    businessName: business || record.businessName,
    website: domain ? `https://${domain}` : record.website,
    email,
  });
}

/**
 * The caller supplies readers from ONE consistent read-only database snapshot.
 * No per-source quotas: continue through duplicate aliases and later pages even
 * at the exact alias limit. Only an observed additional unique alias overflows.
 * A full page is not proof of incompleteness: read the next page (including a
 * one-row probe at the row-scan limit). Failures/invalid pages throw, never
 * return an apparently complete partial context.
 */
export async function collectTrainingResearchExclusions(
  sources: TrainingResearchExclusionSource[],
  limits: {
    maxAliases?: number;
    maxRows?: number;
    pageSize?: number;
  } = {}
) {
  const maxAliases =
    limits.maxAliases ?? TRAINING_RESEARCH_MAX_EXISTING_IDENTITIES;
  const maxRows = limits.maxRows ?? TRAINING_RESEARCH_EXCLUSION_MAX_ROWS;
  const pageSize = limits.pageSize ?? TRAINING_RESEARCH_EXCLUSION_PAGE_SIZE;
  if (
    [maxAliases, maxRows, pageSize].some(
      value => !Number.isSafeInteger(value) || value <= 0
    ) ||
    new Set(sources.map(source => source.name)).size !== sources.length
  ) {
    throw new Error("Invalid Training exclusion snapshot bounds or sources");
  }
  const aliases = new Set<string>();
  let identityCount = 0;
  const completeness: TrainingResearchExclusionCompleteness = {
    complete: false,
    reason: null,
    rowScanLimit: maxRows,
    pageSize,
    sources: sources.map(source => ({
      name: source.name,
      status: "not_read",
      rowsRead: 0,
      pagesRead: 0,
      uniqueAliasesAdded: 0,
    })),
  };
  const result = () => ({
    aliases: Array.from(aliases).sort(),
    truncated: !completeness.complete,
    // Exact only if complete; otherwise an explicitly labelled observed count.
    identityCount,
    completeness,
  });

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    const progress = completeness.sources[index]!;
    progress.status = "incomplete";
    let afterId: number | null = null;
    for (;;) {
      const remaining = maxRows - identityCount;
      const limit = remaining > 0 ? Math.min(pageSize, remaining) : 1;
      let rows: TrainingResearchIdentityRecord[];
      try {
        rows = await source.readPage(afterId, limit);
      } catch {
        // Do not leak raw driver errors or connection details to context clients.
        throw new Error(`Training exclusion source ${source.name} failed`);
      }
      progress.pagesRead += 1;
      if (!Array.isArray(rows) || rows.length > limit) {
        throw new Error(
          `Training exclusion source ${source.name} returned an invalid page`
        );
      }
      let previousId: number | null = afterId;
      for (const row of rows) {
        if (
          !row ||
          !Number.isSafeInteger(row.id) ||
          (previousId !== null && row.id <= previousId)
        ) {
          throw new Error(
            `Training exclusion source ${source.name} has invalid pagination`
          );
        }
        previousId = row.id;
      }
      if (remaining === 0 && rows.length > 0) {
        completeness.reason = "row_scan_limit";
        return result();
      }
      identityCount += rows.length;
      progress.rowsRead += rows.length;
      for (const row of rows) {
        for (const alias of trainingResearchAliasesForIdentity(row)) {
          if (aliases.has(alias)) continue;
          if (aliases.size === maxAliases) {
            completeness.reason = "unique_alias_limit";
            return result();
          }
          aliases.add(alias);
          progress.uniqueAliasesAdded += 1;
        }
      }
      if (rows.length < limit) {
        progress.status = "complete";
        break;
      }
      afterId = previousId;
    }
  }
  completeness.complete = true;
  return result();
}
