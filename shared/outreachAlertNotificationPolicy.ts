import type {
  OutreachAlertIssue,
  OutreachAlertSnapshot,
} from "./outreachAlerts";

export const OUTREACH_ALERT_NOTIFICATION_POLICY =
  "verified-empty-reserve-and-owner-action-v2";
export const OUTREACH_MAIL_RECONNECT_ACTION =
  "Jeremy: reconnect or replace the Jeristotle sending mailbox credentials. A verified access check confirmed that your interactive reconnection is required. No prospect resend is authorized.";

export type OutreachOwnerActionEvidence = {
  action: "reconnect_mailbox";
  source: "verified_owner_access_check";
  requiresInteractiveOwner: true;
  confirmedAt: Date;
  supersededAt?: Date | null;
};

/** Legacy provider errors, "needs review", low supply and unavailable health
 * are NOT evidence of something Jeremy must do. No current snapshot producer
 * invents this signal from raw errors. A trusted owner-access check must
 * explicitly confirm interactive intervention before a notification is allowed.
 */
export function confirmedOutreachOwnerAction(
  evidence: OutreachOwnerActionEvidence | null | undefined,
  now: Date,
  lastSuccessAt?: Date | null
) {
  if (
    evidence?.action !== "reconnect_mailbox" ||
    evidence.source !== "verified_owner_access_check" ||
    evidence.requiresInteractiveOwner !== true ||
    !(evidence.confirmedAt instanceof Date)
  )
    return false;
  const confirmed = evidence.confirmedAt.getTime();
  const age = now.getTime() - confirmed;
  if (!Number.isFinite(age) || age < 0 || age > 90 * 60_000) return false;
  if (evidence.supersededAt != null) return false;
  if (lastSuccessAt && lastSuccessAt.getTime() >= confirmed) return false;
  return true;
}

export function outreachOwnerActionForSnapshot(
  snapshot: OutreachAlertSnapshot,
  now: Date
) {
  return confirmedOutreachOwnerAction(
    snapshot.ownerActionEvidence,
    now,
    snapshot.lastMaintenanceSuccessAt
  );
}

/** Second gate at the actual email/push boundary, including old uncertain
 * claims. A label or arbitrary nonempty action cannot bypass this gate.
 */
export function isOwnerActionOutreachNotification(
  issue: OutreachAlertIssue,
  now: Date
) {
  return (
    issue.kind === "owner_action_required" &&
    issue.ownerAction === "reconnect_mailbox" &&
    issue.detail === OUTREACH_MAIL_RECONNECT_ACTION &&
    confirmedOutreachOwnerAction(issue.ownerActionEvidence, now)
  );
}

/** User-authorized exception: verified zero READY NEW only; unknown/low stock is silent. */
export function isVerifiedEmptyOutreachNotification(issue: OutreachAlertIssue) {
  return (
    issue.kind === "ready_new_empty" &&
    issue.readinessVerified === true &&
    issue.readyCount === 0 &&
    Number.isFinite(issue.dailyLimit) &&
    (issue.dailyLimit ?? 0) > 0
  );
}

export function isAllowedOutreachNotification(
  issue: OutreachAlertIssue,
  now: Date
) {
  return (
    isVerifiedEmptyOutreachNotification(issue) ||
    isOwnerActionOutreachNotification(issue, now)
  );
}
