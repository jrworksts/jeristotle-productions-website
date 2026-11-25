import { Button } from "@/components/ui/button";
import { OUTREACH_CAMPAIGN_NAVIGATION } from "@shared/growthCampaignNavigation";
import type { ChamberSection } from "./DashboardLayout";
import { ArrowRight, LayoutGrid } from "lucide-react";
import React, { type ReactNode } from "react";

export default function UnifiedCampaignWorkspace({
  section,
  onSectionChange,
  children,
}: {
  section: ChamberSection;
  onSectionChange: (section: ChamberSection) => void;
  children?: ReactNode;
}) {
  const overview = section === "campaigns";
  const selected = section === "sectors" ? "tourism" : section;
  const current = OUTREACH_CAMPAIGN_NAVIGATION.find(
    campaign => campaign.section === selected
  );

  return (
    <div data-campaign-workspace={overview ? "overview" : selected}>
      <nav
        aria-label="Campaign navigation"
        className="border-b border-black/10 bg-[#fffaf0] px-5 py-5 sm:px-8 lg:px-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="campaign-selector"
              className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#865900]"
            >
              Choose a campaign
            </label>
            <select
              id="campaign-selector"
              value={overview ? "campaigns" : selected}
              className="min-h-11 w-full max-w-md rounded-none border border-black/20 bg-white px-3 py-2 text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00]"
              onChange={event => {
                const next = event.target.value;
                if (next === "campaigns") onSectionChange("campaigns");
                else {
                  const campaign = OUTREACH_CAMPAIGN_NAVIGATION.find(
                    item => item.section === next
                  );
                  if (campaign)
                    onSectionChange(campaign.section as ChamberSection);
                }
              }}
            >
              <option value="campaigns">All campaigns</option>
              {OUTREACH_CAMPAIGN_NAVIGATION.map(campaign => (
                <option key={campaign.section} value={campaign.section}>
                  {campaign.label}
                </option>
              ))}
            </select>
          </div>
          {!overview && (
            <Button
              variant="outline"
              className="min-h-11 rounded-none bg-white"
              onClick={() => onSectionChange("campaigns")}
            >
              <LayoutGrid size={16} /> All campaigns
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs leading-6 text-black/60">
          {overview
            ? "Every campaign has its own contacts, queue, messages and recorded performance. Choose one to inspect its actual state."
            : `Viewing ${current?.label ?? "this campaign"} only. Its contacts, queue and results remain separate from the other campaigns.`}
        </p>
      </nav>

      {overview ? (
        <section
          aria-label="All outreach campaigns"
          className="grid gap-4 p-5 sm:grid-cols-2 sm:p-8 xl:grid-cols-3 lg:p-10"
        >
          {OUTREACH_CAMPAIGN_NAVIGATION.map(campaign => (
            <button
              type="button"
              key={campaign.section}
              data-campaign-card={campaign.section}
              className="group flex min-w-0 flex-col items-start border border-black/10 bg-white p-6 text-left shadow-[0_12px_40px_rgba(0,0,0,.03)] transition-colors hover:border-[#9b6a00] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6a00]"
              onClick={() =>
                onSectionChange(campaign.section as ChamberSection)
              }
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#865900]">
                Independent campaign
              </span>
              <h2 className="mt-3 text-xl font-black leading-tight text-black">
                {campaign.label}
              </h2>
              <p className="mt-3 text-sm leading-6 text-black/60">
                {campaign.description}
              </p>
              <span className="mt-5 flex items-center gap-2 text-xs font-bold text-black group-hover:text-[#865900]">
                View queue, messages and results <ArrowRight size={15} />
              </span>
            </button>
          ))}
        </section>
      ) : (
        children
      )}
    </div>
  );
}
