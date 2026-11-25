import { and, eq, inArray, isNotNull, or, type SQL } from "drizzle-orm";
import {
  trainingOutreachMessages,
  trainingOutreachProspects,
} from "../drizzle/schema";
import {
  normalizeTrainingBusiness,
  normalizeTrainingDomain,
  normalizeTrainingEmail,
} from "../shared/trainingOutreach";
import { getDb } from "./db";
import { getHustleCampaignIdentityConflict } from "./hustleCrossCampaignGuard";

/**
 * This deliberately imports only shared normalizers, not the Training server
 * module. Existing campaign senders can therefore use the reciprocal guard
 * without creating a server-module runtime cycle.
 */
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type TrainingCampaignIdentity = {
  businessName?: string | null;
  domain?: string | null;
  email?: string | null;
};

const TERMINAL_TRAINING_STATUSES = new Set([
  "replied",
  "bounced",
  "unsubscribed",
  "meeting",
  "not_fit",
  "complete",
]);

const IDENTITY_MATCH_LIMIT = 25;

function normalizedIdentity(input: TrainingCampaignIdentity) {
  return {
    business: normalizeTrainingBusiness(input.businessName),
    domain: normalizeTrainingDomain(input.domain),
    email: normalizeTrainingEmail(input.email),
  };
}

function holdsTrainingIdentity(row: {
  status: string;
  outreachStatus: string;
}) {
  return (
    row.status === "approved" ||
    row.status === "in_sequence" ||
    row.outreachStatus === "approved" ||
    row.outreachStatus === "in_sequence" ||
    TERMINAL_TRAINING_STATUSES.has(row.status)
  );
}

/**
 * Bounded, read-only reciprocal collision check for a single identity.
 *
 * Review/draft records alone intentionally do not reserve an identity. A
 * reservation begins when Training is approved/in sequence (or terminal), or
 * when a matching Training message contains legacy-safe evidence that SMTP
 * may already have been involved. The latter uses only columns present before
 * the SMTP-receipt migration so pre-migration draft databases remain readable.
 */
export async function getTrainingCampaignIdentityConflict(
  db: Database,
  input: TrainingCampaignIdentity
): Promise<string | null> {
  const identity = normalizedIdentity(input);
  const matches: SQL[] = [];
  if (identity.business) {
    matches.push(
      eq(trainingOutreachProspects.normalizedBusiness, identity.business)
    );
  }
  if (identity.domain) {
    matches.push(
      eq(trainingOutreachProspects.normalizedDomain, identity.domain)
    );
  }
  if (identity.email) {
    matches.push(eq(trainingOutreachProspects.normalizedEmail, identity.email));
  }
  if (!matches.length) return null;

  const prospects = await db
    .select({
      id: trainingOutreachProspects.id,
      status: trainingOutreachProspects.status,
      outreachStatus: trainingOutreachProspects.outreachStatus,
    })
    .from(trainingOutreachProspects)
    .where(or(...matches))
    .limit(IDENTITY_MATCH_LIMIT);

  if (prospects.some(holdsTrainingIdentity)) {
    return "Matching company identity is reserved in Training outreach.";
  }
  if (!prospects.length) return getHustleCampaignIdentityConflict(db, input);

  // Do not add smtpAcceptedAt/sendAttemptedAt here until the migration is a
  // guaranteed baseline. A durable provider ID is written before uncertain
  // SMTP work, while sentAt/status cover completed legacy sends.
  const [transportEvidence] = await db
    .select({ id: trainingOutreachMessages.id })
    .from(trainingOutreachMessages)
    .where(
      and(
        inArray(
          trainingOutreachMessages.prospectId,
          prospects.map(prospect => prospect.id)
        ),
        or(
          eq(trainingOutreachMessages.status, "sent"),
          isNotNull(trainingOutreachMessages.sentAt),
          isNotNull(trainingOutreachMessages.providerMessageId)
        )
      )
    )
    .limit(1);

  return transportEvidence
    ? "Matching company identity has Training SMTP delivery evidence."
    : getHustleCampaignIdentityConflict(db, input);
}
