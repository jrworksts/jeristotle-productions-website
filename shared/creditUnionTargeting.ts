export type CreditUnionGeographicPriority = {
  tier: 0 | 1 | 2 | 3;
  label: string;
  reason: string;
  southTexas: boolean;
};

type ProspectGeography = {
  headquartersCity?: string | null;
  branchCountNote?: string | null;
};

/** Operational launch regions, not a claim that all Texas regions share a fixed boundary. */
export function getCreditUnionGeographicPriority(
  prospect: ProspectGeography
): CreditUnionGeographicPriority {
  const city = prospect.headquartersCity || "";
  if (
    /\b(Corpus Christi|Kingsville|Alice|Portland|Port Aransas|Robstown|Beeville|Victoria|Harlingen|McAllen|Edinburg|Brownsville|Laredo|Weslaco|Mission|San Benito)\b/i.test(
      city
    )
  ) {
    return {
      tier: 0,
      label: "South Texas first: Coastal Bend / Valley / Laredo",
      reason: `Recorded headquarters: ${city}. Start with the Coastal Bend, Rio Grande Valley, and Laredo region.`,
      southTexas: true,
    };
  }
  if (
    /\b(San Antonio|Live Oak|Selma|Schertz|New Braunfels|Del Rio|Eagle Pass|Uvalde)\b/i.test(
      city
    )
  ) {
    return {
      tier: 1,
      label: "South Texas next: San Antonio / border region",
      reason: `Recorded headquarters: ${city}. Next South Texas outreach wave after the closest regional institutions.`,
      southTexas: true,
    };
  }
  const note = prospect.branchCountNote || "";
  if (
    /\b(Corpus Christi|San Antonio|Edinburg|McAllen|Brownsville|Harlingen|Laredo|Kingsville|Victoria)\b/i.test(
      note
    )
  ) {
    return {
      tier: 2,
      label: "South Texas branch footprint",
      reason:
        "Recorded physical-branch evidence includes a South Texas market, although headquarters are elsewhere. Review branch-access caveats before outreach.",
      southTexas: true,
    };
  }
  return {
    tier: 3,
    label: "Texas expansion queue",
    reason:
      "Keep for expansion after the eligible South Texas queue is exhausted. No South Texas physical footprint is established by the recorded headquarters or branch note.",
    southTexas: false,
  };
}

export function compareCreditUnionLaunchPriority(
  a: ProspectGeography & {
    creditUnionName: string;
    fitScore?: number | null;
    primaryEmail?: string | null;
  },
  b: ProspectGeography & {
    creditUnionName: string;
    fitScore?: number | null;
    primaryEmail?: string | null;
  }
) {
  return (
    getCreditUnionGeographicPriority(a).tier -
      getCreditUnionGeographicPriority(b).tier ||
    (b.fitScore || 0) - (a.fitScore || 0) ||
    Number(Boolean(b.primaryEmail)) - Number(Boolean(a.primaryEmail)) ||
    a.creditUnionName.localeCompare(b.creditUnionName)
  );
}
