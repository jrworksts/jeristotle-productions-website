import {
  int,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const projectInquiries = mysqlTable("projectInquiries", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 120 }).notNull(),
  businessName: varchar("businessName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  projectType: varchar("projectType", { length: 100 }).notNull(),
  promotionGoal: varchar("promotionGoal", { length: 140 }),
  investment: varchar("investment", { length: 100 }).notNull(),
  timeline: varchar("timeline", { length: 100 }).notNull(),
  goals: text("goals").notNull(),
  discoverySource: varchar("discoverySource", { length: 160 }),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "closed"])
    .default("new")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProjectInquiry = typeof projectInquiries.$inferSelect;
export type InsertProjectInquiry = typeof projectInquiries.$inferInsert;

export const chamberBenefits = mysqlTable("chamberBenefits", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  benefitGroup: varchar("benefitGroup", { length: 80 }).notNull(),
  allowance: int("allowance").default(1).notNull(),
  used: int("used").default(0).notNull(),
  status: mysqlEnum("status", [
    "not_started",
    "scheduled",
    "in_progress",
    "complete",
  ])
    .default("not_started")
    .notNull(),
  activation: text("activation").notNull(),
  metric: text("metric").notNull(),
  notes: text("notes"),
  officialUrl: varchar("officialUrl", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chamberActions = mysqlTable("chamberActions", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  phase: mysqlEnum("phase", ["first_30", "days_31_60", "days_61_90"]).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description").notNull(),
  owner: varchar("owner", { length: 100 }).notNull(),
  sortOrder: int("sortOrder").notNull(),
  status: mysqlEnum("status", [
    "not_started",
    "in_progress",
    "blocked",
    "complete",
  ])
    .default("not_started")
    .notNull(),
  dueDate: timestamp("dueDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Shared team daily routine history; Central calendar dates do not erase previous days. */
export const growthDailyChecks = mysqlTable(
  "growthDailyChecks",
  {
    id: int("id").autoincrement().primaryKey(),
    localDate: varchar("localDate", { length: 10 }).notNull(),
    routineSlug: varchar("routineSlug", { length: 100 }).notNull(),
    complete: int("complete").default(0).notNull(),
    completedAt: timestamp("completedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("growthDailyDateRoutineUnique").on(
      table.localDate,
      table.routineSlug
    ),
  ]
);

export const chamberEvents = mysqlTable("chamberEvents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 220 }).notNull().unique(),
  eventDate: timestamp("eventDate").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  strategicGoal: text("strategicGoal").notNull(),
  status: mysqlEnum("status", ["considering", "planned", "attended", "skipped"])
    .default("considering")
    .notNull(),
  contactsCount: int("contactsCount").default(0).notNull(),
  meetingsBooked: int("meetingsBooked").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chamberProspects = mysqlTable("chamberProspects", {
  id: int("id").autoincrement().primaryKey(),
  priority: int("priority").notNull(),
  name: varchar("name", { length: 220 }).notNull().unique(),
  category: varchar("category", { length: 140 }).notNull(),
  website: varchar("website", { length: 500 }),
  email: text("email"),
  phone: varchar("phone", { length: 160 }),
  contactPerson: text("contactPerson"),
  address: text("address"),
  fit: mysqlEnum("fit", ["high", "medium"]).default("medium").notNull(),
  sourceUrl: varchar("sourceUrl", { length: 500 }).notNull(),
  stage: mysqlEnum("stage", [
    "identified",
    "researching",
    "contacted",
    "meeting",
    "brand_refresh_proposal",
    "brand_refresh_client",
    "monthly_conversation",
    "monthly_client",
    "nurture",
    "not_fit",
  ])
    .default("identified")
    .notNull(),
  lastContact: timestamp("lastContact"),
  nextFollowup: timestamp("nextFollowup"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chamberWeeklyScores = mysqlTable("chamberWeeklyScores", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: timestamp("weekStart").notNull().unique(),
  eventsAttended: int("eventsAttended").default(0).notNull(),
  targetConversations: int("targetConversations").default(0).notNull(),
  decisionMakersFound: int("decisionMakersFound").default(0).notNull(),
  followupsCompleted: int("followupsCompleted").default(0).notNull(),
  meetingsBooked: int("meetingsBooked").default(0).notNull(),
  brandRefreshProposals: int("brandRefreshProposals").default(0).notNull(),
  brandRefreshClients: int("brandRefreshClients").default(0).notNull(),
  monthlyConversations: int("monthlyConversations").default(0).notNull(),
  monthlyClients: int("monthlyClients").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chamberReminderSchedules = mysqlTable("chamberReminderSchedules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 80 }).notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["active", "paused"]).default("active").notNull(),
  lastSentDate: varchar("lastSentDate", { length: 10 }),
  lastTaskId: int("lastTaskId"),
  lastMessageId: varchar("lastMessageId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Daily delivery ledger: uncertain SMTP attempts stay reserved instead of being resent. */
export const growthReminderDeliveries = mysqlTable(
  "growthReminderDeliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    taskUid: varchar("taskUid", { length: 65 }).notNull(),
    localDate: varchar("localDate", { length: 10 }).notNull(),
    actionId: int("actionId"),
    state: mysqlEnum("state", [
      "pending",
      "sending",
      "sent",
      "failed",
      "uncertain",
    ])
      .default("pending")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    messageId: varchar("messageId", { length: 255 }),
    error: text("error"),
    progressComplete: int("progressComplete"),
    failureAlertState: mysqlEnum("failureAlertState", [
      "pending",
      "sending",
      "sent",
      "uncertain",
    ])
      .default("pending")
      .notNull(),
    failureMessageId: varchar("failureMessageId", { length: 255 }),
    ownerNotified: int("ownerNotified").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("growthReminderTaskDateUnique").on(
      table.taskUid,
      table.localDate
    ),
  ]
);

export const chamberOutreachCampaigns = mysqlTable("chamberOutreachCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  status: mysqlEnum("status", [
    "draft",
    "review",
    "paused",
    "active",
    "completed",
  ])
    .default("draft")
    .notNull(),
  senderName: varchar("senderName", { length: 140 }).notNull(),
  senderEmail: varchar("senderEmail", { length: 320 }).notNull(),
  dailyNewLimit: int("dailyNewLimit").default(10).notNull(),
  followupDelayDays: int("followupDelayDays").default(3).notNull(),
  maxFollowups: int("maxFollowups").default(3).notNull(),
  sendHourLocal: int("sendHourLocal").default(9).notNull(),
  timezone: varchar("timezone", { length: 80 })
    .default("America/Chicago")
    .notNull(),
  physicalPostalAddress: text("physicalPostalAddress"),
  dailyTaskUid: varchar("dailyTaskUid", { length: 65 }).unique(),
  recapTaskUid: varchar("recapTaskUid", { length: 65 }).unique(),
  approvedAt: timestamp("approvedAt"),
  activatedAt: timestamp("activatedAt"),
  lastRunAt: timestamp("lastRunAt"),
  lastReplyCheckAt: timestamp("lastReplyCheckAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chamberOutreachProspects = mysqlTable(
  "chamberOutreachProspects",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    businessName: varchar("businessName", { length: 220 }).notNull(),
    website: varchar("website", { length: 500 }),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 100 }),
    category: varchar("category", { length: 160 }).notNull(),
    contactName: text("contactName"),
    contactFirstName: varchar("contactFirstName", { length: 100 }),
    contactConfidence: varchar("contactConfidence", { length: 30 })
      .default("directory")
      .notNull(),
    unsubscribeToken: varchar("unsubscribeToken", { length: 64 })
      .notNull()
      .unique(),
    sourceUrl: varchar("sourceUrl", { length: 500 }).notNull(),
    fitScore: int("fitScore").default(50).notNull(),
    status: mysqlEnum("status", [
      "queued",
      "researching",
      "review",
      "approved",
      "in_sequence",
      "replied",
      "unsubscribed",
      "bounced",
      "meeting",
      "not_fit",
      "complete",
    ])
      .default("queued")
      .notNull(),
    researchStatus: mysqlEnum("researchStatus", [
      "unresearched",
      "approved",
      "failed",
    ])
      .default("unresearched")
      .notNull(),
    personalizedSubject: varchar("personalizedSubject", { length: 240 }),
    personalizedOpening: text("personalizedOpening"),
    questionAboutGoals: text("questionAboutGoals"),
    personalizedHelpAngle: text("personalizedHelpAngle"),
    researchSummary: text("researchSummary"),
    researchSources: text("researchSources"),
    claimsToAvoid: text("claimsToAvoid"),
    manualNotes: text("manualNotes"),
    firstSentAt: timestamp("firstSentAt"),
    lastSentAt: timestamp("lastSentAt"),
    nextFollowupAt: timestamp("nextFollowupAt"),
    repliedAt: timestamp("repliedAt"),
    unsubscribedAt: timestamp("unsubscribedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("outreachCampaignEmailUnique").on(
      table.campaignId,
      table.email
    ),
  ]
);

export const chamberOutreachMessages = mysqlTable(
  "chamberOutreachMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    prospectId: int("prospectId").notNull(),
    sequenceStep: int("sequenceStep").notNull(),
    kind: mysqlEnum("kind", [
      "initial",
      "followup_one",
      "followup_two",
      "followup_three",
    ]).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "approved",
      "scheduled",
      "sent",
      "skipped",
      "failed",
    ])
      .default("draft")
      .notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    htmlBody: text("htmlBody").notNull(),
    textBody: text("textBody").notNull(),
    scheduledAt: timestamp("scheduledAt"),
    sentAt: timestamp("sentAt"),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    // Durable Chamber sender ownership; NULL historical rows are never reclaimed.
    sendClaimToken: varchar("sendClaimToken", { length: 64 }),
    sendClaimedAt: timestamp("sendClaimedAt", { fsp: 3 }),
    sendAttemptedAt: timestamp("sendAttemptedAt", { fsp: 3 }),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("outreachProspectStepUnique").on(
      table.prospectId,
      table.sequenceStep
    ),
  ]
);

export const chamberOutreachEvents = mysqlTable("chamberOutreachEvents", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  prospectId: int("prospectId"),
  messageId: int("messageId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  detail: text("detail"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export const chamberOutreachSuppressions = mysqlTable(
  "chamberOutreachSuppressions",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    reason: mysqlEnum("reason", [
      "unsubscribed",
      "replied",
      "bounced",
      "manual",
    ]).notNull(),
    source: varchar("source", { length: 160 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("outreachSuppressionEmailUnique").on(table.email)]
);

export const chamberOutreachDailyRuns = mysqlTable(
  "chamberOutreachDailyRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    runDate: varchar("runDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["started", "complete", "skipped", "failed"])
      .default("started")
      .notNull(),
    // Both non-NULL markers distinguish new resumable runs from permanently fenced history.
    leaseToken: varchar("leaseToken", { length: 64 }),
    leaseExpiresAt: timestamp("leaseExpiresAt", { fsp: 3 }),
    newReserved: int("newReserved").default(0).notNull(),
    newSent: int("newSent").default(0).notNull(),
    followupsSent: int("followupsSent").default(0).notNull(),
    repliesDetected: int("repliesDetected").default(0).notNull(),
    unsubscribes: int("unsubscribes").default(0).notNull(),
    bounces: int("bounces").default(0).notNull(),
    meetings: int("meetings").default(0).notNull(),
    errorCount: int("errorCount").default(0).notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("outreachCampaignRunDateUnique").on(
      table.campaignId,
      table.runDate
    ),
  ]
);

export type ChamberBenefit = typeof chamberBenefits.$inferSelect;
export type ChamberAction = typeof chamberActions.$inferSelect;
export type ChamberEvent = typeof chamberEvents.$inferSelect;
export type ChamberProspect = typeof chamberProspects.$inferSelect;
export type ChamberWeeklyScore = typeof chamberWeeklyScores.$inferSelect;
export type ChamberReminderSchedule =
  typeof chamberReminderSchedules.$inferSelect;
export type ChamberOutreachCampaign =
  typeof chamberOutreachCampaigns.$inferSelect;
export type ChamberOutreachProspect =
  typeof chamberOutreachProspects.$inferSelect;
export type ChamberOutreachMessage =
  typeof chamberOutreachMessages.$inferSelect;
export type ChamberOutreachEvent = typeof chamberOutreachEvents.$inferSelect;
export type ChamberOutreachSuppression =
  typeof chamberOutreachSuppressions.$inferSelect;
export type ChamberOutreachDailyRun =
  typeof chamberOutreachDailyRuns.$inferSelect;

/**
 * Texas Credit Union outreach is intentionally isolated from the active Chamber
 * campaign. JSON-shaped research is stored as text to keep source metadata and
 * all named contacts portable across MySQL/TiDB deployments.
 */
export const creditUnionCampaigns = mysqlTable("creditUnionCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["review", "paused", "active"])
    .default("review")
    .notNull(),
  listApprovedAt: timestamp("listApprovedAt"),
  configApprovedAt: timestamp("configApprovedAt"),
  dailyNewLimit: int("dailyNewLimit").default(10).notNull(),
  sendHourLocal: int("sendHourLocal").default(9).notNull(),
  timezone: varchar("timezone", { length: 80 })
    .default("America/Chicago")
    .notNull(),
  senderName: varchar("senderName", { length: 140 })
    .default("Jeremy Wells")
    .notNull(),
  senderEmail: varchar("senderEmail", { length: 320 })
    .default("jeremy@jeristotleproductions.com")
    .notNull(),
  physicalPostalAddress: text("physicalPostalAddress").notNull(),
  /** { dayOffsets:[0,3,8], rollWeekends:true, maxActiveContactsPerOrganization:1 } */
  sequenceConfig: text("sequenceConfig").notNull(),
  dailyScheduleTaskUid: varchar("dailyScheduleTaskUid", {
    length: 65,
  }).unique(),
  replyMonitorTaskUid: varchar("replyMonitorTaskUid", { length: 65 }).unique(),
  /** Last bounded IMAP scan attempted by the app-owned maintenance callback. */
  lastReplyCheckAt: timestamp("lastReplyCheckAt"),
  /** Last maintenance callback that completed its campaign-scoped work. */
  lastRunAt: timestamp("lastRunAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const creditUnionProspects = mysqlTable(
  "creditUnionProspects",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    creditUnionName: varchar("creditUnionName", { length: 220 }).notNull(),
    normalizedOrganization: varchar("normalizedOrganization", {
      length: 255,
    }).notNull(),
    website: varchar("website", { length: 500 }),
    normalizedDomain: varchar("normalizedDomain", { length: 255 }),
    headquartersCity: varchar("headquartersCity", { length: 160 }),
    branchCount: int("branchCount"),
    branchCountNote: text("branchCountNote"),
    operatingStatus: varchar("operatingStatus", { length: 120 }),
    qualified: int("qualified").default(1).notNull(),
    fitScore: int("fitScore").default(0).notNull(),
    fitReason: text("fitReason"),
    /** Every discovered named contact, including missing or unsuitable email. */
    contactsJson: text("contactsJson").notNull(),
    /** Source-backed personalization, limitations, and top-25 metadata. */
    researchJson: text("researchJson").notNull(),
    sourcesJson: text("sourcesJson").notNull(),
    primaryContactName: varchar("primaryContactName", { length: 180 }),
    primaryContactTitle: varchar("primaryContactTitle", { length: 220 }),
    primaryEmail: varchar("primaryEmail", { length: 320 }),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }),
    emailConfidence: mysqlEnum("emailConfidence", [
      "officially_published",
      "independently_verified",
      "unverified",
      "not_found",
    ])
      .default("not_found")
      .notNull(),
    primaryEmailSourceUrl: varchar("primaryEmailSourceUrl", { length: 500 }),
    primaryRoleSourceUrl: varchar("primaryRoleSourceUrl", { length: 500 }),
    status: mysqlEnum("status", [
      "review",
      "verification_needed",
      "approved",
      "replied",
      "unsubscribed",
      "bounced",
      "meeting",
      "consultation_complete",
      "qualified_opportunity",
      "not_fit",
      "complete",
    ])
      .default("verification_needed")
      .notNull(),
    outreachStatus: mysqlEnum("outreachStatus", [
      "blocked",
      "draft",
      "approved",
      "scheduled",
      "in_sequence",
      "cancelled",
      "complete",
    ])
      .default("blocked")
      .notNull(),
    manualNotes: text("manualNotes"),
    /** Explains a live/sent Chamber or other identity collision; never bypassed automatically. */
    crossCampaignBlock: text("crossCampaignBlock"),
    unsubscribeToken: varchar("unsubscribeToken", { length: 64 })
      .notNull()
      .unique(),
    draftVersion: varchar("draftVersion", { length: 80 }).notNull(),
    firstSentAt: timestamp("firstSentAt"),
    lastSentAt: timestamp("lastSentAt"),
    repliedAt: timestamp("repliedAt"),
    unsubscribedAt: timestamp("unsubscribedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("creditUnionCampaignOrganizationUnique").on(
      table.campaignId,
      table.normalizedOrganization
    ),
    uniqueIndex("creditUnionCampaignDomainUnique").on(
      table.campaignId,
      table.normalizedDomain
    ),
    uniqueIndex("creditUnionCampaignEmailUnique").on(
      table.campaignId,
      table.normalizedEmail
    ),
  ]
);

export const creditUnionMessages = mysqlTable(
  "creditUnionMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    prospectId: int("prospectId").notNull(),
    sequenceStep: int("sequenceStep").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "approved",
      "scheduled",
      "sent",
      "skipped",
      "cancelled",
      "failed",
    ])
      .default("draft")
      .notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    /** Stored only as fallback metadata: follow-ups use subject/Re: thread. */
    alternativeSubject: varchar("alternativeSubject", { length: 240 }),
    htmlBody: text("htmlBody").notNull(),
    textBody: text("textBody").notNull(),
    dayOffset: int("dayOffset").notNull(),
    plannedAt: timestamp("plannedAt"),
    scheduledAt: timestamp("scheduledAt"),
    sentAt: timestamp("sentAt"),
    smtpAcceptedAt: timestamp("smtpAcceptedAt"),
    deliveredAt: timestamp("deliveredAt"),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    /** Existing `scheduled` status is the send claim; these fence its owner. */
    sendClaimToken: varchar("sendClaimToken", { length: 80 }),
    sendClaimedAt: timestamp("sendClaimedAt"),
    /** Written immediately before SMTP so an interrupted attempt is review-only. */
    sendAttemptedAt: timestamp("sendAttemptedAt"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("creditUnionProspectStepUnique").on(
      table.prospectId,
      table.sequenceStep
    ),
  ]
);

/**
 * One Central-calendar-day fence per campaign. `newReserved` is allocated
 * atomically before an initial message claim, preserving the five-message cap
 * across concurrent callbacks and partial retries without inventing a new
 * message status.
 */
export const creditUnionDailyRuns = mysqlTable(
  "creditUnionDailyRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    runDate: varchar("runDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["started", "complete", "skipped", "failed"])
      .default("started")
      .notNull(),
    leaseToken: varchar("leaseToken", { length: 80 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    newReserved: int("newReserved").default(0).notNull(),
    newSent: int("newSent").default(0).notNull(),
    followupsSent: int("followupsSent").default(0).notNull(),
    repliesDetected: int("repliesDetected").default(0).notNull(),
    errorCount: int("errorCount").default(0).notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("creditUnionCampaignRunDateUnique").on(
      table.campaignId,
      table.runDate
    ),
  ]
);

export const creditUnionEvents = mysqlTable("creditUnionEvents", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  prospectId: int("prospectId"),
  messageId: int("messageId"),
  /** Deliverability plus reply/meeting/consultation/opportunity and outcome events. */
  eventType: varchar("eventType", { length: 80 }).notNull(),
  detail: text("detail"),
  metadataJson: text("metadataJson"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CreditUnionCampaign = typeof creditUnionCampaigns.$inferSelect;
export type CreditUnionProspect = typeof creditUnionProspects.$inferSelect;
export type CreditUnionMessage = typeof creditUnionMessages.$inferSelect;
export type CreditUnionEvent = typeof creditUnionEvents.$inferSelect;
export type CreditUnionDailyRun = typeof creditUnionDailyRuns.$inferSelect;

/**
 * Corpus Christi professional brand-video outreach is review-only until a
 * separate explicit launch decision. Its tables never share a send queue with
 * Chamber or credit-union outreach.
 */
export const brandVideoCampaigns = mysqlTable("brandVideoCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["review", "paused", "active"])
    .default("review")
    .notNull(),
  listApprovedAt: timestamp("listApprovedAt"),
  configApprovedAt: timestamp("configApprovedAt"),
  /** User-authorized source-backed Brand Video imports become send-eligible automatically. */
  autoApproveQualifiedProspects: int("autoApproveQualifiedProspects")
    .default(0)
    .notNull(),
  dailyNewLimit: int("dailyNewLimit").default(10).notNull(),
  sendHourLocal: int("sendHourLocal").default(9).notNull(),
  timezone: varchar("timezone", { length: 80 })
    .default("America/Chicago")
    .notNull(),
  senderName: varchar("senderName", { length: 140 })
    .default("Jeremy Wells")
    .notNull(),
  senderEmail: varchar("senderEmail", { length: 320 })
    .default("jeremy@jeristotleproductions.com")
    .notNull(),
  physicalPostalAddress: text("physicalPostalAddress").notNull(),
  /** { dayOffsets:[0,4,9], rollWeekends:true, maxActiveContactsPerOrganization:1 } */
  sequenceConfig: text("sequenceConfig").notNull(),
  /** Reserved for a separately authorized future application-owned sender. */
  dailyScheduleTaskUid: varchar("dailyScheduleTaskUid", {
    length: 65,
  }).unique(),
  lastReplyCheckAt: timestamp("lastReplyCheckAt"),
  lastRunAt: timestamp("lastRunAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const brandVideoProspects = mysqlTable(
  "brandVideoProspects",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    businessName: varchar("businessName", { length: 220 }).notNull(),
    normalizedBusiness: varchar("normalizedBusiness", {
      length: 255,
    }).notNull(),
    industry: varchar("industry", { length: 180 }).notNull(),
    website: varchar("website", { length: 500 }).notNull(),
    normalizedDomain: varchar("normalizedDomain", { length: 255 }),
    localAuthorityEvidence: text("localAuthorityEvidence").notNull(),
    qualified: int("qualified").default(1).notNull(),
    fitScore: int("fitScore").default(0).notNull(),
    fitReason: text("fitReason").notNull(),
    verifiedObservation: text("verifiedObservation").notNull(),
    videoAngle: text("videoAngle").notNull(),
    videoScenes: text("videoScenes").notNull(),
    /** All source-backed contacts, including a missing individual contact. */
    contactsJson: text("contactsJson").notNull(),
    /** Supporting research and the tested first-subject variant. */
    researchJson: text("researchJson").notNull(),
    sourcesJson: text("sourcesJson").notNull(),
    primaryContactName: varchar("primaryContactName", { length: 180 }),
    primaryContactTitle: varchar("primaryContactTitle", { length: 220 }),
    primaryEmail: varchar("primaryEmail", { length: 320 }).notNull(),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }).notNull(),
    primaryEmailSourceUrl: varchar("primaryEmailSourceUrl", {
      length: 500,
    }).notNull(),
    primaryRoleSourceUrl: varchar("primaryRoleSourceUrl", { length: 500 }),
    status: mysqlEnum("status", [
      "review",
      "approved",
      "replied",
      "unsubscribed",
      "bounced",
      "meeting",
      "not_fit",
      "complete",
    ])
      .default("review")
      .notNull(),
    outreachStatus: mysqlEnum("outreachStatus", [
      "draft",
      "approved",
      "scheduled",
      "in_sequence",
      "cancelled",
      "complete",
    ])
      .default("draft")
      .notNull(),
    manualNotes: text("manualNotes"),
    /** A live or historical contact collision in another campaign; never bypassed automatically. */
    crossCampaignBlock: text("crossCampaignBlock"),
    unsubscribeToken: varchar("unsubscribeToken", { length: 64 })
      .notNull()
      .unique(),
    draftVersion: varchar("draftVersion", { length: 80 }).notNull(),
    firstSentAt: timestamp("firstSentAt"),
    lastSentAt: timestamp("lastSentAt"),
    repliedAt: timestamp("repliedAt"),
    unsubscribedAt: timestamp("unsubscribedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("brandVideoCampaignBusinessUnique").on(
      table.campaignId,
      table.normalizedBusiness
    ),
    uniqueIndex("brandVideoCampaignDomainUnique").on(
      table.campaignId,
      table.normalizedDomain
    ),
    uniqueIndex("brandVideoCampaignEmailUnique").on(
      table.campaignId,
      table.normalizedEmail
    ),
  ]
);

export const brandVideoMessages = mysqlTable(
  "brandVideoMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    prospectId: int("prospectId").notNull(),
    sequenceStep: int("sequenceStep").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "approved",
      "scheduled",
      "sent",
      "cancelled",
      "failed",
    ])
      .default("draft")
      .notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    alternativeSubject: varchar("alternativeSubject", { length: 240 }),
    htmlBody: text("htmlBody").notNull(),
    textBody: text("textBody").notNull(),
    dayOffset: int("dayOffset").notNull(),
    plannedAt: timestamp("plannedAt"),
    scheduledAt: timestamp("scheduledAt"),
    sentAt: timestamp("sentAt"),
    smtpAcceptedAt: timestamp("smtpAcceptedAt"),
    deliveredAt: timestamp("deliveredAt"),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    /** Durable pre-SMTP claim; attempted messages never receive automatic retries. */
    sendClaimToken: varchar("sendClaimToken", { length: 80 }),
    sendClaimedAt: timestamp("sendClaimedAt"),
    sendAttemptedAt: timestamp("sendAttemptedAt"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("brandVideoProspectStepUnique").on(
      table.prospectId,
      table.sequenceStep
    ),
  ]
);

export const brandVideoEvents = mysqlTable("brandVideoEvents", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  prospectId: int("prospectId"),
  messageId: int("messageId"),
  /** Imported, approved, reply, opt-out, delivery, and verified outcome events only. */
  eventType: varchar("eventType", { length: 80 }).notNull(),
  detail: text("detail"),
  metadataJson: text("metadataJson"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BrandVideoCampaign = typeof brandVideoCampaigns.$inferSelect;
export type BrandVideoProspect = typeof brandVideoProspects.$inferSelect;
export type BrandVideoMessage = typeof brandVideoMessages.$inferSelect;
export type BrandVideoEvent = typeof brandVideoEvents.$inferSelect;

/** One Central calendar-day fence; reservations survive retries and partial SMTP outcomes. */
export const brandVideoDailyRuns = mysqlTable(
  "brandVideoDailyRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    runDate: varchar("runDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["started", "complete", "skipped", "failed"])
      .default("started")
      .notNull(),
    leaseToken: varchar("leaseToken", { length: 80 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    newReserved: int("newReserved").default(0).notNull(),
    /** SMTP acceptances, not delivery confirmations. */
    newSent: int("newSent").default(0).notNull(),
    followupsSent: int("followupsSent").default(0).notNull(),
    repliesDetected: int("repliesDetected").default(0).notNull(),
    errorCount: int("errorCount").default(0).notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("brandVideoCampaignRunDateUnique").on(
      table.campaignId,
      table.runDate
    ),
  ]
);

export type BrandVideoDailyRun = typeof brandVideoDailyRuns.$inferSelect;
export type InsertBrandVideoDailyRun = typeof brandVideoDailyRuns.$inferInsert;

/**
 * Internal Training & Knowledge Capture is a standalone campaign. It is
 * paused by default; durable queue state exists so a later authorized runtime
 * can fail closed rather than infer delivery history.
 */
export const trainingOutreachCampaigns = mysqlTable(
  "training_outreach_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    status: mysqlEnum("status", ["paused", "review", "active"])
      .default("paused")
      .notNull(),
    /** Both timestamps are explicit user approvals; neither is set by ensure. */
    launchApprovedAt: timestamp("launchApprovedAt"),
    listApprovedAt: timestamp("listApprovedAt"),
    /** Qualifying source-backed imports may be approved only when this is on. */
    autoApproveQualifiedProspects: int("autoApproveQualifiedProspects")
      .default(0)
      .notNull(),
    dailyNewLimit: int("dailyNewLimit").default(10).notNull(),
    sendHourLocal: int("sendHourLocal").default(9).notNull(),
    timezone: varchar("timezone", { length: 80 })
      .default("America/Chicago")
      .notNull(),
    /** Persisted platform task UID; scheduled callbacks scope only by this value. */
    schedulerTaskUid: varchar("schedulerTaskUid", { length: 65 }).unique(),
    /** Optional agentic research callback ownership, never created or enabled by ensure. */
    researchTaskUid: varchar("researchTaskUid", { length: 65 }),
    /** Optional trigger endpoint; a null URL is an intentional no-op. */
    researchWebhookUrl: text("researchWebhookUrl"),
    /** Durable one-day request lease for an external replenishment trigger. */
    researchLastRequestedAt: timestamp("researchLastRequestedAt"),
    researchLeaseExpiresAt: timestamp("researchLeaseExpiresAt"),
    /** Retained for backwards compatibility with the research workspace. */
    autoEnroll: int("autoEnroll").default(0).notNull(),
    senderName: varchar("senderName", { length: 140 }).notNull(),
    senderEmail: varchar("senderEmail", { length: 320 }).notNull(),
    physicalPostalAddress: text("physicalPostalAddress").notNull(),
    sequenceConfig: text("sequenceConfig").notNull(),
    runtimeVersion: varchar("runtimeVersion", { length: 100 }),
    lastReplyCheckAt: timestamp("lastReplyCheckAt"),
    lastRunAt: timestamp("lastRunAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("trainingOutreachResearchTaskUidIndex").on(table.researchTaskUid),
    index("trainingOutreachResearchLeaseIndex").on(
      table.researchLeaseExpiresAt
    ),
  ]
);

export const trainingOutreachProspects = mysqlTable(
  "training_outreach_prospects",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    businessName: varchar("businessName", { length: 220 }).notNull(),
    normalizedBusiness: varchar("normalizedBusiness", {
      length: 255,
    }).notNull(),
    website: varchar("website", { length: 500 }),
    normalizedDomain: varchar("normalizedDomain", { length: 255 }),
    location: varchar("location", { length: 240 }),
    industry: varchar("industry", { length: 180 }),
    priorityRank: int("priorityRank").notNull(),
    fitScore: int("fitScore").default(0).notNull(),
    fitReason: text("fitReason"),
    qualificationStatus: mysqlEnum("qualificationStatus", [
      "qualified",
      "needs_review",
      "not_qualified",
    ]).notNull(),
    verifiedObservation: text("verifiedObservation"),
    useCase: text("useCase"),
    pilotScope: text("pilotScope"),
    primaryContactName: varchar("primaryContactName", { length: 180 }),
    primaryContactTitle: varchar("primaryContactTitle", { length: 220 }),
    contactSourceUrl: varchar("contactSourceUrl", { length: 500 }),
    primaryEmail: varchar("primaryEmail", { length: 320 }),
    normalizedEmail: varchar("normalizedEmail", { length: 320 }),
    primaryEmailSourceUrl: varchar("primaryEmailSourceUrl", { length: 500 }),
    /** Unknown is deliberately the default until research explicitly classifies the inbox. */
    emailRecipientType: mysqlEnum("emailRecipientType", [
      "named",
      "general",
      "unknown",
    ])
      .default("unknown")
      .notNull(),
    primaryPhone: varchar("primaryPhone", { length: 100 }),
    phoneSourceUrl: varchar("phoneSourceUrl", { length: 500 }),
    sizeIndicator: varchar("sizeIndicator", { length: 500 }),
    sizeSourceUrl: varchar("sizeSourceUrl", { length: 500 }),
    localAuthorityEvidence: text("localAuthorityEvidence"),
    uncertaintiesJson: text("uncertaintiesJson").notNull(),
    factsJson: text("factsJson").notNull(),
    operationalSignalsJson: text("operationalSignalsJson").notNull(),
    sourcesJson: text("sourcesJson").notNull(),
    manualNotes: text("manualNotes"),
    /** A source-backed record is approved only under campaign auto-approval. */
    status: mysqlEnum("status", [
      "review",
      "approved",
      "not_fit",
      "replied",
      "bounced",
      "unsubscribed",
      "meeting",
      "complete",
    ])
      .default("review")
      .notNull(),
    contactReadiness: mysqlEnum("contactReadiness", [
      "verified",
      "unverified",
      "blocked",
    ])
      .default("unverified")
      .notNull(),
    /** Read-only collision result from other outreach campaigns. */
    crossCampaignBlock: text("crossCampaignBlock"),
    selectedForDraft: int("selectedForDraft").default(0).notNull(),
    outreachStatus: mysqlEnum("outreachStatus", [
      "draft",
      "approved",
      "scheduled",
      "in_sequence",
      "cancelled",
      "complete",
    ])
      .default("draft")
      .notNull(),
    unsubscribeToken: varchar("unsubscribeToken", { length: 64 })
      .notNull()
      .unique(),
    /** Sales outcome is intentionally distinct from email delivery state. */
    leadOutcome: mysqlEnum("leadOutcome", ["closed", "not_closed"]),
    notClosedReason: text("notClosedReason"),
    firstSentAt: timestamp("firstSentAt"),
    lastSentAt: timestamp("lastSentAt"),
    repliedAt: timestamp("repliedAt"),
    unsubscribedAt: timestamp("unsubscribedAt"),
    researchedOn: varchar("researchedOn", { length: 10 }).notNull(),
    draftVersion: varchar("draftVersion", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("trainingOutreachCampaignBusinessUnique").on(
      table.campaignId,
      table.normalizedBusiness
    ),
    uniqueIndex("trainingOutreachCampaignDomainUnique").on(
      table.campaignId,
      table.normalizedDomain
    ),
    uniqueIndex("trainingOutreachCampaignEmailUnique").on(
      table.campaignId,
      table.normalizedEmail
    ),
  ]
);

/** Durable claims and SMTP receipts make interrupted attempts review-only. */
export const trainingOutreachMessages = mysqlTable(
  "training_outreach_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    prospectId: int("prospectId").notNull(),
    sequenceStep: int("sequenceStep").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "approved",
      "scheduled",
      "sent",
      "cancelled",
      "failed",
    ])
      .default("draft")
      .notNull(),
    subject: varchar("subject", { length: 240 }).notNull(),
    htmlBody: text("htmlBody").notNull(),
    textBody: text("textBody").notNull(),
    /** 0 for initial, then 4 and 5 business days after accepted prior sends. */
    dueAfterBusinessDays: int("dueAfterBusinessDays").notNull(),
    plannedAt: timestamp("plannedAt"),
    scheduledAt: timestamp("scheduledAt"),
    sentAt: timestamp("sentAt"),
    smtpAcceptedAt: timestamp("smtpAcceptedAt"),
    deliveredAt: timestamp("deliveredAt"),
    providerMessageId: varchar("providerMessageId", { length: 255 }),
    sendClaimToken: varchar("sendClaimToken", { length: 80 }),
    sendClaimedAt: timestamp("sendClaimedAt"),
    /** Written before SMTP; a non-null value prevents blind automated retries. */
    sendAttemptedAt: timestamp("sendAttemptedAt"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("trainingOutreachProspectStepUnique").on(
      table.prospectId,
      table.sequenceStep
    ),
  ]
);

/** One Central weekday fence per campaign; initial reservations persist across retries. */
export const trainingOutreachDailyRuns = mysqlTable(
  "training_outreach_daily_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    runDate: varchar("runDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["started", "complete", "skipped", "failed"])
      .default("started")
      .notNull(),
    leaseToken: varchar("leaseToken", { length: 80 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    newReserved: int("newReserved").default(0).notNull(),
    newSent: int("newSent").default(0).notNull(),
    followupsSent: int("followupsSent").default(0).notNull(),
    repliesDetected: int("repliesDetected").default(0).notNull(),
    errorCount: int("errorCount").default(0).notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("trainingOutreachCampaignRunDateUnique").on(
      table.campaignId,
      table.runDate
    ),
  ]
);

/** Audit-only research imports and manually recorded dispositions. */
export const trainingOutreachEvents = mysqlTable("training_outreach_events", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  prospectId: int("prospectId"),
  messageId: int("messageId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  detail: text("detail"),
  metadataJson: text("metadataJson"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TrainingOutreachCampaign =
  typeof trainingOutreachCampaigns.$inferSelect;
export type TrainingOutreachProspect =
  typeof trainingOutreachProspects.$inferSelect;
export type TrainingOutreachMessage =
  typeof trainingOutreachMessages.$inferSelect;
export type TrainingOutreachEvent = typeof trainingOutreachEvents.$inferSelect;
export type TrainingOutreachDailyRun =
  typeof trainingOutreachDailyRuns.$inferSelect;

/** One app-owned, read-only delivery monitor. It never owns prospect sending. */
export const outreachAlertMonitors = mysqlTable("outreachAlertMonitors", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", ["paused", "active"]).default("paused").notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
  activatedAt: timestamp("activatedAt"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lastErrorCode: varchar("lastErrorCode", { length: 80 }),
  campaignBaselinesJson: text("campaignBaselinesJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Alert attempts are separate from every campaign's send/SMTP history. */
export const outreachDeliveryAlerts = mysqlTable("outreachDeliveryAlerts", {
  id: int("id").autoincrement().primaryKey(),
  dedupeKey: varchar("dedupeKey", { length: 200 }).notNull().unique(),
  campaignKey: varchar("campaignKey", { length: 32 }).notNull(),
  localDate: varchar("localDate", { length: 10 }).notNull(),
  kind: varchar("kind", { length: 80 }).notNull(),
  label: varchar("label", { length: 140 }).notNull(),
  detail: text("detail").notNull(),
  newAccepted: int("newAccepted").default(0).notNull(),
  followupAccepted: int("followupAccepted").default(0).notNull(),
  readyCount: int("readyCount"),
  emailState: mysqlEnum("emailState", [
    "pending",
    "sending",
    "sent",
    "uncertain",
  ])
    .default("pending")
    .notNull(),
  emailAttemptedAt: timestamp("emailAttemptedAt"),
  emailAcceptedAt: timestamp("emailAcceptedAt"),
  emailMessageId: varchar("emailMessageId", { length: 255 }),
  ownerState: mysqlEnum("ownerState", [
    "pending",
    "sending",
    "sent",
    "uncertain",
  ])
    .default("pending")
    .notNull(),
  ownerNotifiedAt: timestamp("ownerNotifiedAt"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Corpus Christi Hustle uses its own campaign and immutable delivery ledger. */
export const hustleCampaigns = mysqlTable('hustleCampaigns', {
  id: int('id').autoincrement().primaryKey(),
  slug: varchar('slug', {length:100}).notNull().unique(),
  status: varchar('status', {length:30}).default('review').notNull(),
  configVersion: varchar('configVersion', {length:60}).notNull(),
  launchApprovedAt: timestamp('launchApprovedAt'),
  schedulerTaskUid: varchar('schedulerTaskUid', {length:65}).unique(),
  researchWebhookUrl: text('researchWebhookUrl'),
  researchRequestedAt: timestamp('researchRequestedAt'),
  researchLeaseUntil: timestamp('researchLeaseUntil'),
  lastInboxScanAt: timestamp('lastInboxScanAt'),
  episodeGoal: int('episodeGoal').default(24).notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export const hustleProspects = mysqlTable('hustleProspects', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  organizationKey: varchar('organizationKey', {length:240}).notNull(),
  name: varchar('name', {length:220}).notNull(),
  website: varchar('website', {length:500}).notNull(),
  category: varchar('category', {length:40}).notNull(),
  localEvidence: text('localEvidence').notNull(),
  localSourceUrl: varchar('localSourceUrl', {length:500}).notNull(),
  contactName: varchar('contactName', {length:180}),
  contactTitle: varchar('contactTitle', {length:220}),
  recipientType: varchar('recipientType', {length:40}).notNull(),
  email: varchar('email', {length:320}),
  emailSourceUrl: varchar('emailSourceUrl', {length:500}),
  emailSourceQuote: text('emailSourceQuote'),
  roleSourceUrl: varchar('roleSourceUrl', {length:500}),
  phone: varchar('phone', {length:100}),
  phoneSourceUrl: varchar('phoneSourceUrl', {length:500}),
  evidenceJson: text('evidenceJson').notNull(),
  qualification: varchar('qualification', {length:30}).default('review').notNull(),
  holdReason: text('holdReason'),
  stage: varchar('stage', {length:40}).default('identified').notNull(),
  manualNotes: text('manualNotes'),
  unsubscribeToken: varchar('unsubscribeToken', {length:48}).notNull().unique(),
  firstSentAt: timestamp('firstSentAt'),
  lastSentAt: timestamp('lastSentAt'),
  stoppedAt: timestamp('stoppedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, table=>[uniqueIndex('hustleOrganizationUnique').on(table.campaignId,table.organizationKey),index('hustleQualificationIndex').on(table.campaignId,table.qualification)]);
export const hustleMessages = mysqlTable('hustleMessages', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  prospectId: int('prospectId').notNull(),
  sequenceStep: int('sequenceStep').notNull(),
  subject: varchar('subject', {length:240}).notNull(),
  textBody: text('textBody').notNull(),
  status: varchar('status', {length:30}).default('draft').notNull(),
  scheduledAt: timestamp('scheduledAt'),
  claimToken: varchar('claimToken', {length:48}),
  attemptedAt: timestamp('attemptedAt'),
  smtpAcceptedAt: timestamp('smtpAcceptedAt'),
  providerMessageId: varchar('providerMessageId', {length:255}),
  error: text('error'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
},table=>[uniqueIndex('hustleProspectStepUnique').on(table.prospectId,table.sequenceStep),index('hustleMessageStatusIndex').on(table.campaignId,table.status)]);
export const hustleEvents = mysqlTable('hustleEvents', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  prospectId: int('prospectId'),
  messageId: int('messageId'),
  eventKey: varchar('eventKey', {length:220}).notNull().unique(),
  eventType: varchar('eventType', {length:80}).notNull(),
  detailJson: text('detailJson').notNull(),
  occurredAt: timestamp('occurredAt').defaultNow().notNull(),
});

export const hustleEpisodes = mysqlTable('hustleEpisodes', {
  id: int('id').autoincrement().primaryKey(),
  campaignId: int('campaignId').notNull(),
  seasonYear: int('seasonYear').default(2027).notNull(),
  episodeNumber: int('episodeNumber').notNull(),
  sponsorProspectId: int('sponsorProspectId'),
  status: varchar('status', {length:30}).default('unassigned').notNull(),
  notes: text('notes'),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
},table=>[uniqueIndex('hustleEpisodeSlotUnique').on(table.campaignId,table.seasonYear,table.episodeNumber)]);

/**
 * Four-sector drafts plus separately authorized production runtime.
 * Migration adds no approval and enables no gate; CLI activation is explicit.
 */
export const sectorOutreachGroups = mysqlTable("sectorOutreachGroups", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  status: mysqlEnum("status", ["review", "active", "paused", "archived"]).default("review").notNull(),
  timeZone: varchar("timeZone", { length: 80 }).default("America/Chicago").notNull(),
  /** Legacy shared total budget is disabled; five NEW contacts belongs to each campaign. */
  totalDailyCap: int("totalDailyCap"),
  includesFollowups: int("includesFollowups").default(0).notNull(),
  capScope: varchar("capScope", { length: 50 }).default("per_campaign_new").notNull(),
  sendSevenDays: int("sendSevenDays").default(1).notNull(),
  followupBusinessDaysJson: text("followupBusinessDaysJson").notNull(),
  policyVersion: varchar("policyVersion", { length: 80 }).notNull(),
  approvalAt: timestamp("approvalAt"),
  sendingEnabled: int("sendingEnabled").default(0).notNull(),
  researchEnabled: int("researchEnabled").default(0).notNull(),
  runtimeVersion: varchar("runtimeVersion", { length: 80 }),
  approvedCopyVersion: varchar("approvedCopyVersion", { length: 80 }),
  researchWebhookUrl: text("researchWebhookUrl"),
  researchLeaseToken: varchar("researchLeaseToken", { length: 64 }),
  researchRequestedAt: timestamp("researchRequestedAt"),
  researchLeaseUntil: timestamp("researchLeaseUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sectorOutreachCampaigns = mysqlTable("sectorOutreachCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  campaignKey: mysqlEnum("campaignKey", ["tourism", "real_estate", "industrial", "healthcare"]).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["review", "active", "paused", "archived"]).default("review").notNull(),
  dailyNewLimit: int("dailyNewLimit").default(5).notNull(),
  schedulerTaskUid: varchar("schedulerTaskUid", { length: 65 }),
  lastInboxScanAt: timestamp("lastInboxScanAt"),
  reserveTarget: int("reserveTarget").default(20).notNull(),
  /** Public business-only qualification criteria; never patient information. */
  criteriaJson: text("criteriaJson").notNull(),
  /** Three unresolved review templates, not prospect message instances. */
  sequenceJson: text("sequenceJson").notNull(),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("sectorGroupCampaignUnique").on(table.groupId, table.campaignKey), uniqueIndex("sectorSchedulerTaskUnique").on(table.schedulerTaskUid)]);

/** Reserved source-backed BUSINESS contacts only. There is no import route. */
export const sectorOutreachProspects = mysqlTable("sectorOutreachProspects", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  campaignKey: mysqlEnum("campaignKey", ["tourism", "real_estate", "industrial", "healthcare"]).notNull(),
  company: varchar("company", { length: 220 }).notNull(),
  website: varchar("website", { length: 500 }),
  contactName: varchar("contactName", { length: 180 }),
  contactRole: varchar("contactRole", { length: 220 }),
  email: varchar("email", { length: 320 }),
  emailSourceUrl: varchar("emailSourceUrl", { length: 500 }),
  emailSourceQuote: text("emailSourceQuote"),
  roleSourceUrl: varchar("roleSourceUrl", { length: 500 }),
  phone: varchar("phone", { length: 100 }),
  phoneSourceUrl: varchar("phoneSourceUrl", { length: 500 }),
  verifiedFact: text("verifiedFact"),
  factSourceUrl: varchar("factSourceUrl", { length: 500 }),
  personalization: text("personalization"),
  proposedAngle: text("proposedAngle"),
  angleSourceUrl: varchar("angleSourceUrl", { length: 500 }),
  evidenceJson: text("evidenceJson").notNull(),
  identityKey: varchar("identityKey", { length: 220 }),
  holdReason: text("holdReason"),
  firstSentAt: timestamp("firstSentAt"),
  lastSentAt: timestamp("lastSentAt"),
  verifiedAt: timestamp("verifiedAt"),
  qualification: mysqlEnum("qualification", ["review", "verification_needed", "qualified", "not_fit"]).default("review").notNull(),
  status: mysqlEnum("status", ["review", "replied", "opted_out", "bounced", "stopped", "meeting", "complete", "ready", "contacted"]).default("review").notNull(),
  replyAt: timestamp("replyAt"),
  optoutAt: timestamp("optoutAt"),
  bounceAt: timestamp("bounceAt"),
  stoppedAt: timestamp("stoppedAt"),
  nextAction: text("nextAction"),
  manualNotes: text("manualNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("sectorProspectGroupCampaignIndex").on(table.groupId, table.campaignKey), uniqueIndex("sectorGroupIdentityUnique").on(table.groupId, table.identityKey)]);

/** Empty at setup. Nullable receipt fields reserve truthful future history. */
export const sectorOutreachMessages = mysqlTable("sectorOutreachMessages", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  campaignKey: mysqlEnum("campaignKey", ["tourism", "real_estate", "industrial", "healthcare"]).notNull(),
  prospectId: int("prospectId").notNull(),
  messageNumber: int("messageNumber").notNull(),
  subject: varchar("subject", { length: 240 }).notNull(),
  textBody: text("textBody").notNull(),
  htmlBody: text("htmlBody").notNull(),
  status: mysqlEnum("status", ["draft", "approved", "claimed", "sent", "uncertain", "cancelled"]).default("draft").notNull(),
  claimToken: varchar("claimToken", { length: 64 }),
  claimedAt: timestamp("claimedAt"),
  attemptDate: varchar("attemptDate", { length: 10 }),
  copyVersion: varchar("copyVersion", { length: 80 }),
  scheduledAt: timestamp("scheduledAt"),
  replyAt: timestamp("replyAt"),
  optoutAt: timestamp("optoutAt"),
  attemptedAt: timestamp("attemptedAt"),
  smtpAcceptedAt: timestamp("smtpAcceptedAt"),
  deliveredAt: timestamp("deliveredAt"),
  bouncedAt: timestamp("bouncedAt"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  receiptJson: text("receiptJson"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("sectorProspectMessageUnique").on(table.prospectId, table.messageNumber),
  index("sectorMessageGroupCampaignIndex").on(table.groupId, table.campaignKey),
]);

export const sectorOutreachEvents = mysqlTable("sectorOutreachEvents", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  campaignKey: mysqlEnum("campaignKey", ["tourism", "real_estate", "industrial", "healthcare"]),
  eventKey: varchar("eventKey", { length: 220 }).notNull().unique(),
  eventType: mysqlEnum("eventType", ["draft_setup", "review_notes_updated", "policy_updated", "activation", "archived", "research_requested", "research_request_uncertain", "research_claim", "research_finished", "research_import", "reserve_prepared", "prospect_stopped", "message_attempt", "smtp_accepted", "smtp_uncertain", "maintenance_result"]).notNull(),
  detailJson: text("detailJson").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
});

export type SectorOutreachGroup = typeof sectorOutreachGroups.$inferSelect;
export type SectorOutreachCampaign = typeof sectorOutreachCampaigns.$inferSelect;
export type SectorOutreachProspect = typeof sectorOutreachProspects.$inferSelect;
export type SectorOutreachMessage = typeof sectorOutreachMessages.$inferSelect;
export type SectorOutreachEvent = typeof sectorOutreachEvents.$inferSelect;
