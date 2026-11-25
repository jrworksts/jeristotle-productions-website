import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs/promises";
import path from "node:path";
import { CHAMBER_PROSPECT_SEEDS } from "../shared/chamberProspects";
import {
  CHAMBER_BENEFIT_SEEDS,
  CHAMBER_EVENT_SEEDS,
  CHAMBER_TASK_SEEDS,
} from "../shared/chamberPlan";
import { GROWTH_SCHEDULED_TASKS as GROWTH_TASKS } from "../shared/growthDailyPlan";
import { GROWTH_TASKS as ARCHIVED_GROWTH_TASKS } from "../shared/blueprintGrowthPlan";
import { splitGrowthActions } from "../shared/growthChecklist";
import { reassignInactiveJeristotleOwner } from "../shared/personnelPolicy";
import {
  chamberActions,
  chamberBenefits,
  chamberEvents,
  chamberProspects,
  chamberReminderSchedules,
  chamberWeeklyScores,
  InsertProjectInquiry,
  InsertUser,
  projectInquiries,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getOutreachScopedDb } from "./outreachDeadline";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const scoped = await getOutreachScopedDb();
  if (scoped) return scoped;
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createProjectInquiry(inquiry: InsertProjectInquiry) {
  const selfHostedDataDir = process.env.SELF_HOSTED_DATA_DIR;
  if (selfHostedDataDir) {
    await fs.mkdir(selfHostedDataDir, { recursive: true, mode: 0o750 });
    const id = Date.now();
    const record = {
      id,
      ...inquiry,
      status: inquiry.status || "new",
      createdAt: new Date().toISOString(),
    };
    await fs.appendFile(
      path.join(selfHostedDataDir, "inquiries.jsonl"),
      `${JSON.stringify(record)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    return { id };
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  const result = await db.insert(projectInquiries).values(inquiry);
  return { id: Number(result[0].insertId) };
}

async function rowCount(table: typeof chamberBenefits) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(table);
  return Number(result?.count ?? 0);
}

export async function ensureChamberWorkspace() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  if ((await rowCount(chamberBenefits)) === 0) {
    await db.insert(chamberBenefits).values(
      CHAMBER_BENEFIT_SEEDS.map(benefit => ({
        ...benefit,
        status: "not_started" as const,
        used: 0,
      }))
    );
  }

  const [actionCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberActions);
  if (Number(actionCount?.count ?? 0) === 0) {
    await db.insert(chamberActions).values(
      CHAMBER_TASK_SEEDS.map(
        ([slug, phase, category, title, description, owner, sortOrder]) => ({
          slug,
          phase,
          category,
          title,
          description,
          owner,
          sortOrder,
          status: "not_started" as const,
        })
      )
    );
  }

  const [eventCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberEvents);
  if (Number(eventCount?.count ?? 0) === 0) {
    await db.insert(chamberEvents).values(
      CHAMBER_EVENT_SEEDS.map(event => ({
        ...event,
        eventDate: new Date(event.eventDate),
        status: "considering" as const,
      }))
    );
  }

  const [prospectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chamberProspects);
  if (Number(prospectCount?.count ?? 0) === 0) {
    await db.insert(chamberProspects).values(
      CHAMBER_PROSPECT_SEEDS.map(prospect => ({
        ...prospect,
        stage: "identified" as const,
      }))
    );
  }
}

export async function getChamberWorkspace() {
  await ensureChamberWorkspace();
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [benefits, actions, events, prospects, weeklyScores] =
    await Promise.all([
      db.select().from(chamberBenefits).orderBy(asc(chamberBenefits.id)),
      db.select().from(chamberActions).orderBy(asc(chamberActions.sortOrder)),
      db.select().from(chamberEvents).orderBy(asc(chamberEvents.eventDate)),
      db
        .select()
        .from(chamberProspects)
        .orderBy(asc(chamberProspects.priority)),
      db
        .select()
        .from(chamberWeeklyScores)
        .orderBy(asc(chamberWeeklyScores.weekStart)),
    ]);

  const split = splitGrowthActions(actions);
  const metadata = new Map(GROWTH_TASKS.map(task => [task.slug, task]));
  const activeActions = split.actions.length
    ? split.actions
        .filter(action => metadata.has(action.slug))
        .map(action => ({
          ...action,
          ...metadata.get(action.slug)!,
          owner: action.owner,
        }))
    : split.legacyActions;
  const archivedMetadata = new Map(
    ARCHIVED_GROWTH_TASKS.map(task => [task.slug, task])
  );
  return {
    benefits,
    actions: activeActions,
    legacyActions: split.legacyActions,
    archivedGrowthActions: split.archivedGrowthActions.map(action => ({
      ...archivedMetadata.get(action.slug),
      ...action,
    })),
    events,
    prospects,
    weeklyScores,
  };
}

const CHAMBER_REMINDER_NAME = "chamber-next-action-reminder";

export async function ensureChamberReminderSchedule() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db
    .insert(chamberReminderSchedules)
    .values({
      name: CHAMBER_REMINDER_NAME,
      recipient: "jeremy@jeristotleproductions.com",
      cronExpression: "0 0 13,14 * * *",
      timezone: "America/Chicago",
      status: "active",
    })
    .onDuplicateKeyUpdate({
      set: {
        recipient: "jeremy@jeristotleproductions.com",
        cronExpression: "0 0 13,14 * * *",
        timezone: "America/Chicago",
      },
    });

  const [schedule] = await db
    .select()
    .from(chamberReminderSchedules)
    .where(eq(chamberReminderSchedules.name, CHAMBER_REMINDER_NAME))
    .limit(1);
  if (!schedule) throw new Error("Chamber reminder schedule was not created");
  return schedule;
}

export async function setChamberReminderTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureChamberReminderSchedule();
  await db
    .update(chamberReminderSchedules)
    .set({ scheduleCronTaskUid: taskUid, status: "active" })
    .where(eq(chamberReminderSchedules.name, CHAMBER_REMINDER_NAME));
}

export async function reserveChamberReminderSend(
  taskUid: string,
  localDate: string,
  actionId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db
    .update(chamberReminderSchedules)
    .set({ lastSentDate: localDate, lastTaskId: actionId, lastMessageId: null })
    .where(
      and(
        eq(chamberReminderSchedules.scheduleCronTaskUid, taskUid),
        eq(chamberReminderSchedules.status, "active"),
        or(
          isNull(chamberReminderSchedules.lastSentDate),
          ne(chamberReminderSchedules.lastSentDate, localDate)
        )
      )
    );

  return Number(result[0].affectedRows ?? 0) > 0;
}

export async function recordChamberReminderDelivery(
  taskUid: string,
  localDate: string,
  actionId: number,
  messageId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(chamberReminderSchedules)
    .set({ lastMessageId: messageId })
    .where(
      and(
        eq(chamberReminderSchedules.scheduleCronTaskUid, taskUid),
        eq(chamberReminderSchedules.lastSentDate, localDate),
        eq(chamberReminderSchedules.lastTaskId, actionId)
      )
    );
}

export async function releaseChamberReminderSend(
  taskUid: string,
  localDate: string,
  actionId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(chamberReminderSchedules)
    .set({ lastSentDate: null, lastTaskId: null, lastMessageId: null })
    .where(
      and(
        eq(chamberReminderSchedules.scheduleCronTaskUid, taskUid),
        eq(chamberReminderSchedules.lastSentDate, localDate),
        eq(chamberReminderSchedules.lastTaskId, actionId),
        isNull(chamberReminderSchedules.lastMessageId)
      )
    );
}

export async function updateChamberBenefit(
  id: number,
  values: {
    status?: "not_started" | "scheduled" | "in_progress" | "complete";
    used?: number;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(chamberBenefits)
    .set(values)
    .where(eq(chamberBenefits.id, id));
}

export async function updateChamberAction(
  id: number,
  values: {
    status?: "not_started" | "in_progress" | "blocked" | "complete";
    owner?: string;
    dueDate?: Date | null;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const patch = {
    ...values,
    ...(values.owner === undefined
      ? {}
      : { owner: reassignInactiveJeristotleOwner(values.owner) }),
  };
  await db.update(chamberActions).set(patch).where(eq(chamberActions.id, id));
}

export async function updateChamberEvent(
  id: number,
  values: {
    status?: "considering" | "planned" | "attended" | "skipped";
    contactsCount?: number;
    meetingsBooked?: number;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(chamberEvents).set(values).where(eq(chamberEvents.id, id));
}

export async function updateChamberProspect(
  id: number,
  values: {
    stage?:
      | "identified"
      | "researching"
      | "contacted"
      | "meeting"
      | "brand_refresh_proposal"
      | "brand_refresh_client"
      | "monthly_conversation"
      | "monthly_client"
      | "nurture"
      | "not_fit";
    contactPerson?: string | null;
    email?: string | null;
    phone?: string | null;
    lastContact?: Date | null;
    nextFollowup?: Date | null;
    notes?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(chamberProspects)
    .set(values)
    .where(eq(chamberProspects.id, id));
}

export async function upsertChamberWeeklyScore(values: {
  weekStart: Date;
  eventsAttended: number;
  targetConversations: number;
  decisionMakersFound: number;
  followupsCompleted: number;
  meetingsBooked: number;
  brandRefreshProposals: number;
  brandRefreshClients: number;
  monthlyConversations: number;
  monthlyClients: number;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(chamberWeeklyScores)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}
