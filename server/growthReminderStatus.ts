import {
  getReminderDay,
  getReminderSchedule,
  REMINDER_TASK_UID,
} from "./growthReminderDeliveryDb";
import { growthLocalDate } from "../shared/growthChecklist";

export async function getGrowthReminderStatus() {
  const localDate = growthLocalDate();
  const schedule = await getReminderSchedule(REMINDER_TASK_UID);
  if (!schedule || schedule.status !== "active")
    return {
      localDate,
      state: "paused" as const,
      messageId: null,
      error: null,
      failureEmailSent: false,
    };
  const day = await getReminderDay(REMINDER_TASK_UID, localDate);
  const legacySent =
    schedule.lastSentDate === localDate && !!schedule.lastMessageId;
  return {
    localDate,
    state: legacySent ? ("sent" as const) : (day?.state ?? "pending"),
    messageId: legacySent ? schedule.lastMessageId : (day?.messageId ?? null),
    error: day?.error ?? null,
    failureEmailSent: day?.failureAlertState === "sent",
  };
}
