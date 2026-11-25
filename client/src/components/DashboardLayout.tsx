import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  CalendarDays,
  CheckSquare2,
  Copy,
  ExternalLink,
  Gift,
  LayoutDashboard,
  Mail,
  RadioTower,
  Target,
  Users,
  BookOpen,
  Archive,
  ListChecks,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  isCampaignSection,
  isSectorTrackingSection,
  OUTREACH_CAMPAIGN_NAVIGATION,
  type SectorCampaignSection,
} from "@shared/growthCampaignNavigation";

import { JERISTOTLE_LOGO_URL as logo } from "@shared/brandAssets";

export type ChamberSection =
  | "today"
  | "blueprint"
  | "legacy"
  | "archive"
  | "overview"
  | "benefits"
  | "roadmap"
  | "prospects"
  | "outreach"
  | "credit-unions"
  | "brand-video"
  | "training"
  | "hustle"
  | "sectors"
  | "campaigns"
  | SectorCampaignSection
  | "events"
  | "content"
  | "scripts"
  | "scorecard";

type NavigationItem = {
  icon: typeof LayoutDashboard;
  label: string;
  section: ChamberSection;
};

const primaryMenuItems: NavigationItem[] = [
  { icon: CheckSquare2, label: "Today's task", section: "today" },
  { icon: ListChecks, label: "Full growth plan", section: "roadmap" },
  { icon: BookOpen, label: "Blueprint framework", section: "blueprint" },
  { icon: CalendarDays, label: "Events & relationships", section: "events" },
  { icon: Mail, label: "Campaigns", section: "campaigns" },
  { icon: BarChart3, label: "Weekly scorecard", section: "scorecard" },
];

const archivedMenuItems: NavigationItem[] = [
  { icon: Archive, label: "Original Chamber tasks", section: "legacy" },
  { icon: Archive, label: "Previous Blueprint plan", section: "archive" },
  { icon: LayoutDashboard, label: "Chamber overview", section: "overview" },
  { icon: Gift, label: "Propeller benefits", section: "benefits" },
  { icon: Users, label: "Member prospects", section: "prospects" },
  { icon: RadioTower, label: "Chamber content campaign", section: "content" },
  { icon: Copy, label: "Outreach scripts", section: "scripts" },
];

export default function DashboardLayout({
  children,
  activeSection,
  onSectionChange,
}: {
  children: ReactNode;
  activeSection: ChamberSection;
  onSectionChange: (section: ChamberSection) => void;
}) {
  return (
    <SidebarProvider
      className="chamber-dashboard"
      style={
        {
          "--sidebar-width": "17rem",
          "--sidebar": "#090909",
          "--sidebar-foreground": "#f7f3e9",
          "--sidebar-accent": "#1d1a14",
          "--sidebar-accent-foreground": "#ffb627",
          "--sidebar-border": "rgba(255,255,255,.1)",
          "--sidebar-ring": "#ffb627",
        } as CSSProperties
      }
    >
      <DashboardContent
        activeSection={activeSection}
        onSectionChange={onSectionChange}
      >
        {children}
      </DashboardContent>
    </SidebarProvider>
  );
}

function DashboardContent({
  children,
  activeSection,
  onSectionChange,
}: {
  children: ReactNode;
  activeSection: ChamberSection;
  onSectionChange: (section: ChamberSection) => void;
}) {
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const activeCampaign = OUTREACH_CAMPAIGN_NAVIGATION.find(
    item => item.section === activeSection
  );
  const activeItem = [...primaryMenuItems, ...archivedMenuItems].find(
    item => item.section === activeSection
  );
  const activeLabel = isCampaignSection(activeSection)
    ? (activeCampaign?.label ?? "Campaigns overview")
    : activeItem?.label;

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-white/10">
        <SidebarHeader className="border-b border-white/10 px-3 py-4">
          <div className="flex items-center gap-3 px-1">
            <img alt="Jeristotle" className="h-10 w-10 shrink-0" src={logo} />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#ffb627]">
                Jeristotle
              </p>
              <p className="truncate text-sm font-bold text-white">
                Growth workspace
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="pt-3">
          <SidebarGroup>
            <SidebarGroupLabel>Local authority growth</SidebarGroupLabel>
            <SidebarMenu>
              {primaryMenuItems.map(item => {
                const isActive =
                  item.section === "campaigns"
                    ? isCampaignSection(activeSection)
                    : activeSection === item.section;
                return (
                  <SidebarMenuItem key={item.section}>
                    <SidebarMenuButton
                      className="h-10 rounded-none font-medium"
                      isActive={isActive}
                      aria-current={isActive ? "page" : undefined}
                      data-campaign-navigation={
                        item.section === "campaigns" ? item.section : undefined
                      }
                      onClick={() => {
                        onSectionChange(item.section);
                        if (isMobile) setOpenMobile(false);
                      }}
                      tooltip={item.label}
                    >
                      <item.icon className={isActive ? "text-[#ffb627]" : ""} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <details
              open={
                archivedMenuItems.some(item => item.section === activeSection)
                  ? true
                  : undefined
              }
            >
              <summary className="cursor-pointer px-2 py-3 text-xs font-semibold text-white/60 group-data-[collapsible=icon]:hidden">
                Archived plans & Chamber tools
              </summary>
              <SidebarMenu>
                {archivedMenuItems.map(item => (
                  <SidebarMenuItem key={item.section}>
                    <SidebarMenuButton
                      className="h-10 rounded-none font-medium"
                      isActive={activeSection === item.section}
                      aria-current={
                        activeSection === item.section ? "page" : undefined
                      }
                      tooltip={item.label}
                      onClick={() => {
                        onSectionChange(item.section);
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <item.icon
                        className={
                          activeSection === item.section ? "text-[#ffb627]" : ""
                        }
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </details>
          </SidebarGroup>

          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Official resources</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Member directory">
                  <a
                    href="https://chamber.unitedcorpuschristi.org/list/"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Target /> <span>Member directory</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Event calendar">
                  <a
                    href="https://chamber.unitedcorpuschristi.org/events/"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <CalendarDays /> <span>Event calendar</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Public website">
                  <a href="/">
                    <ExternalLink /> <span>Public website</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-white/10 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#ffb627] group-data-[collapsible=icon]:hidden">
            Jeristotle team workspace
          </p>
          <p className="mt-1 text-xs leading-5 text-white/45 group-data-[collapsible=icon]:hidden">
            {activeSection === "hustle" ||
            isSectorTrackingSection(activeSection)
              ? "Owner sign-in required for campaign contacts and review controls."
              : "No sign-in required. Keep this link with the team."}
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-[#f4f1e9] text-[#121212]">
        {isMobile ? (
          <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-black/10 bg-[#f4f1e9]/95 px-3 backdrop-blur">
            <SidebarTrigger className="h-9 w-9 rounded-none" />
            <span className="text-sm font-bold">{activeLabel}</span>
          </div>
        ) : null}
        <main className="min-h-screen flex-1">{children}</main>
      </SidebarInset>
    </>
  );
}
