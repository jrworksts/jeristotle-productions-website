import { JERISTOTLE_EMAIL } from "./const";

/** Jeremy's authorized October 24, 2026 staffing update; preserve historical records. */
export const JERISTOTLE_CURRENT_TASK_OWNER = "Jeremy";
export const JERISTOTLE_INTERNAL_EMAIL_RECIPIENTS = [JERISTOTLE_EMAIL] as const;
const INACTIVE_JERISTOTLE_STAFF_EMAILS = new Set([
  "mariah@jeristotleproductions.com",
]);

export function reassignInactiveJeristotleOwner(owner: string) {
  if (!/\bmariah\b/i.test(owner)) return owner;
  return JERISTOTLE_CURRENT_TASK_OWNER;
}

/** Reject the exact departed business address before connecting to SMTP; no silent drops. */
export function assertActiveJeristotleEmailRecipients(to: string) {
  const addresses =
    to.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  if (
    addresses.some(address =>
      INACTIVE_JERISTOTLE_STAFF_EMAILS.has(address.toLowerCase())
    )
  ) {
    throw new Error(
      "Recipient is not authorized for Jeristotle communications"
    );
  }
}
