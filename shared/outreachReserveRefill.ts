import { OUTREACH_INITIAL_REFILL_START_BELOW, OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET } from "./outboundReplenishmentPolicy";

/** No payload or estimated count can create a refill episode. Completion is an owned stored receipt. */
export function shouldRefillInitialReserve(
  ready: number,
  completion?: { target?: unknown; readyCount?: unknown } | null
): boolean {
  if (!Number.isSafeInteger(ready) || ready < 0) throw new Error("Verified initial readiness is unavailable");
  if (ready >= OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET) return false;
  if (ready < OUTREACH_INITIAL_REFILL_START_BELOW) return true;
  return Boolean(completion && completion.target === OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET &&
    Number.isSafeInteger(completion.readyCount) && Number(completion.readyCount) >= 0 &&
    Number(completion.readyCount) < OUTREACH_VERIFIED_INITIAL_RESERVE_TARGET);
}
