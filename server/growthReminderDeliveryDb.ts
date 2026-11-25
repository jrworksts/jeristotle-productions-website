import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  chamberReminderSchedules,
  growthReminderDeliveries,
} from "../drizzle/schema";
import { getDb } from "./db";

export const REMINDER_TASK_UID = "K6dnDWoR9QrgbxmSV3XABq";
export const REMINDER_RETRY_CRON = "0 0,15,30,45 13-17 * * *";
async function dbRequired() {
  const db = await getDb();
  if (!db) throw new Error("Reminder database unavailable");
  return db;
}
export async function getReminderSchedule(taskUid: string) {
  const db = await dbRequired();
  const [row] = await db
    .select()
    .from(chamberReminderSchedules)
    .where(eq(chamberReminderSchedules.scheduleCronTaskUid, taskUid))
    .limit(1);
  return row;
}
export async function ensureReminderDay(taskUid: string, localDate: string) {
  const db = await dbRequired();
  await db
    .insert(growthReminderDeliveries)
    .values({ taskUid, localDate })
    .onDuplicateKeyUpdate({
      set: { taskUid: sql`${growthReminderDeliveries.taskUid}` },
    });
  return (await getReminderDay(taskUid, localDate))!;
}
export async function getReminderDay(taskUid: string, localDate: string) {
  const db = await dbRequired();
  const [row] = await db
    .select()
    .from(growthReminderDeliveries)
    .where(
      and(
        eq(growthReminderDeliveries.taskUid, taskUid),
        eq(growthReminderDeliveries.localDate, localDate)
      )
    )
    .limit(1);
  return row;
}
export async function claimReminderDay(
  taskUid: string,
  localDate: string,
  actionId: number,
  progressComplete: number
) {
  const db = await dbRequired();
  const r = await db
    .update(growthReminderDeliveries)
    .set({
      state: "sending",
      actionId,
      progressComplete,
      attempts: sql`${growthReminderDeliveries.attempts}+1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(growthReminderDeliveries.taskUid, taskUid),
        eq(growthReminderDeliveries.localDate, localDate),
        inArray(growthReminderDeliveries.state, ["pending", "failed"])
      )
    );
  return Number(r[0].affectedRows) > 0;
}
export async function patchReminderDay(
  taskUid: string,
  localDate: string,
  patch: Partial<typeof growthReminderDeliveries.$inferInsert>
) {
  const db = await dbRequired();
  await db
    .update(growthReminderDeliveries)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(growthReminderDeliveries.taskUid, taskUid),
        eq(growthReminderDeliveries.localDate, localDate)
      )
    );
}
export async function claimReminderFailureAlert(
  taskUid: string,
  localDate: string
) {
  const db = await dbRequired();
  const r = await db
    .update(growthReminderDeliveries)
    .set({ failureAlertState: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(growthReminderDeliveries.taskUid, taskUid),
        eq(growthReminderDeliveries.localDate, localDate),
        eq(growthReminderDeliveries.failureAlertState, "pending")
      )
    );
  return Number(r[0].affectedRows) > 0;
}
export async function previousReminderProgress(
  taskUid: string,
  localDate: string
) {
  const db = await dbRequired();
  const [row] = await db
    .select()
    .from(growthReminderDeliveries)
    .where(
      and(
        eq(growthReminderDeliveries.taskUid, taskUid),
        lt(growthReminderDeliveries.localDate, localDate),
        eq(growthReminderDeliveries.state, "sent")
      )
    )
    .orderBy(desc(growthReminderDeliveries.localDate))
    .limit(1);
  return row;
}
