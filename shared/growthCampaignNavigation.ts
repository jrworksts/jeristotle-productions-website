import type { SectorKey } from "./sectorOutreach";

export const SECTOR_CAMPAIGN_NAVIGATION = [
  {
    section: "tourism",
    label: "Tourism & hospitality",
    campaignKey: "tourism",
  },
  { section: "real-estate", label: "Real estate", campaignKey: "real_estate" },
  { section: "industrial", label: "Industrial B2B", campaignKey: "industrial" },
  { section: "healthcare", label: "Healthcare", campaignKey: "healthcare" },
] as const satisfies ReadonlyArray<{
  section: string;
  label: string;
  campaignKey: SectorKey;
}>;

export type SectorCampaignSection =
  (typeof SECTOR_CAMPAIGN_NAVIGATION)[number]["section"];

export function getSectorKeyForSection(section: string): SectorKey | undefined {
  return SECTOR_CAMPAIGN_NAVIGATION.find(item => item.section === section)
    ?.campaignKey;
}

export function isSectorTrackingSection(section: string): boolean {
  return section === "sectors" || getSectorKeyForSection(section) !== undefined;
}

export const OUTREACH_CAMPAIGN_NAVIGATION = [
  {
    section: "outreach",
    label: "Chamber outreach",
    description: "Track outreach and follow-ups with Chamber businesses.",
  },
  {
    section: "credit-unions",
    label: "Credit union pipeline",
    description: "Track credit union prospects and outreach progress.",
  },
  {
    section: "brand-video",
    label: "Brand video pipeline",
    description: "Track brand video prospects and conversations.",
  },
  {
    section: "training",
    label: "Internal training pipeline",
    description: "Track internal training video prospects and follow-ups.",
  },
  {
    section: "hustle",
    label: "Hustle sponsorships",
    description: "Track sponsorship prospects and partner conversations.",
  },
  {
    section: "tourism",
    label: "Tourism & hospitality",
    description: "Track tourism and hospitality outreach independently.",
  },
  {
    section: "real-estate",
    label: "Real estate",
    description: "Track developer and brokerage outreach independently.",
  },
  {
    section: "industrial",
    label: "Industrial B2B",
    description: "Track industrial and technical B2B outreach independently.",
  },
  {
    section: "healthcare",
    label: "Healthcare",
    description: "Track healthcare group and clinic outreach independently.",
  },
] as const;

export function isCampaignSection(section: string): boolean {
  return (
    section === "campaigns" ||
    isSectorTrackingSection(section) ||
    OUTREACH_CAMPAIGN_NAVIGATION.some(item => item.section === section)
  );
}
