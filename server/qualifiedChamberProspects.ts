import { z } from "zod";

export const qualifiedChamberMemberSchema = z.object({
  businessName: z.string().trim().min(2).max(220),
  category: z.string().trim().min(2).max(160),
  chamberUrl: z.string().url().max(500),
  website: z.union([z.string().url().max(500), z.literal("")]),
  publicEmail: z.string().trim().email().max(320),
  publicPhone: z.string().trim().max(100),
  contactName: z.string().trim().max(300),
  contactRole: z.string().trim().max(200),
  emailSourceUrl: z.string().url().max(500),
  fitScore: z.number().int().min(80).max(100),
  qualificationSummary: z.string().trim().min(20),
  fitReasons: z.array(z.string().trim().min(3)).min(1),
  recurringContentTriggers: z.array(z.string().trim().min(3)).min(1),
  projectAngles: z.array(z.string().trim().min(3)).min(1),
  claimsToAvoid: z.array(z.string().trim().min(3)).min(1),
  sourceUrls: z.array(z.string().url()).min(2),
});

export const qualifiedChamberMemberFileSchema = z.object({
  candidates: z.array(qualifiedChamberMemberSchema).min(1),
});

export type QualifiedChamberMember = z.infer<
  typeof qualifiedChamberMemberSchema
>;

export function normalizeProspectIdentity(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(
      /\b(inc|incorporated|llc|l\.l\.c|ltd|company|co|corp|corporation|pc)\b/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildContactName(candidate: QualifiedChamberMember) {
  if (!candidate.contactName) return null;
  if (!candidate.contactRole) return candidate.contactName;
  return `${candidate.contactName} — ${candidate.contactRole}`;
}

export function inferContactFirstName(candidate: QualifiedChamberMember) {
  const firstName = candidate.contactName.split(/\s+/)[0]?.trim();
  if (firstName && /^[A-Za-z][A-Za-z'.-]{1,40}$/.test(firstName)) {
    return firstName;
  }
  const localPart = candidate.publicEmail.toLowerCase().split("@")[0] || "";
  const genericAddresses = new Set([
    "admin",
    "contact",
    "corporate",
    "hello",
    "info",
    "media",
    "memberservices",
    "office",
    "outreach",
    "privatebank",
    "sales",
    "service",
    "support",
  ]);
  if (genericAddresses.has(localPart)) return "there";
  const inferred = localPart.split(/[._-]/)[0] || "there";
  return inferred.slice(0, 1).toUpperCase() + inferred.slice(1);
}

export function buildQualificationNotes(candidate: QualifiedChamberMember) {
  return [
    "Qualified from the current United Corpus Christi Chamber directory on September 21, 2026.",
    candidate.qualificationSummary,
    `Recurring content triggers: ${candidate.recurringContentTriggers.join("; ")}`,
    `Potential production angles: ${candidate.projectAngles.join("; ")}`,
    `Public email verified at: ${candidate.emailSourceUrl}`,
  ].join("\n\n");
}
