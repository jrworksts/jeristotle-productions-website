import DashboardLayout, { ChamberSection } from "@/components/DashboardLayout";
import BrandVideoOutreachPipeline from "@/components/BrandVideoOutreachPipeline";
import ChamberOutreachPipeline from "@/components/ChamberOutreachPipeline";
import CreditUnionOutreachPipeline from "@/components/CreditUnionOutreachPipeline";
import TrainingOutreachPipeline from "@/components/TrainingOutreachPipeline";
import HustleOutreachPipeline from "@/components/HustleOutreachPipeline";
import SectorCampaignPipeline from "@/components/SectorCampaignPipeline";
import UnifiedCampaignWorkspace from "@/components/UnifiedCampaignWorkspace";
import {
  getSectorKeyForSection,
  isCampaignSection,
  isSectorTrackingSection,
} from "@shared/growthCampaignNavigation";
import OutreachAlertsPanel from "@/components/OutreachAlertsPanel";
import GrowthDailyChecklist, {
  GrowthBlueprintGuide,
} from "@/components/GrowthDailyChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import {
  getChecklistProgress,
  getNextChecklistAction,
} from "@shared/chamberChecklist";
import {
  CHAMBER_COMPLIANCE_GUARDRAILS,
  CHAMBER_CONTENT_CALENDAR,
  CHAMBER_EVENT_PLAYBOOK,
  CHAMBER_FUNNEL_GUIDE,
  CHAMBER_LINKS,
  CHAMBER_PORTAL_OPPORTUNITIES,
  CHAMBER_PORTAL_PROFILE_AUDIT,
  CHAMBER_PRIMARY_CONTACT,
  CHAMBER_RELATIONSHIP_PLAYS,
  CHAMBER_SCRIPTS,
  CHAMBER_SHARED_EVENT_SERIES,
  TARGET_CATEGORY_SEEDS,
} from "@shared/chamberPlan";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Gift,
  Loader2,
  Mail,
  Phone,
  RadioTower,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const stageLabels: Record<string, string> = {
  identified: "Identified",
  researching: "Researching",
  contacted: "Contacted",
  meeting: "Meeting",
  brand_refresh_proposal: "Brand Refresh proposal",
  brand_refresh_client: "Brand Refresh client",
  monthly_conversation: "Monthly conversation",
  monthly_client: "Monthly client",
  nurture: "Nurture",
  not_fit: "Not fit",
};

const benefitStatusLabels: Record<string, string> = {
  not_started: "Not started",
  scheduled: "Scheduled",
  in_progress: "In progress",
  complete: "Complete",
};

const actionStatusLabels: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Complete",
};

const eventStatusLabels: Record<string, string> = {
  considering: "Considering",
  planned: "Planned",
  attended: "Attended",
  skipped: "Skipped",
};

const sectionCopy: Record<ChamberSection, { title: string; kicker: string }> = {
  today: {
    kicker: "Jeristotle Productions · Local authority",
    title: "One task. Today.",
  },
  blueprint: {
    kicker: "Foundation → Growth → Optimization",
    title: "Make marketing easy.",
  },
  legacy: {
    kicker: "Original Chamber checklist · Progress preserved",
    title: "Your Chamber work, kept intact.",
  },
  archive: {
    kicker: "Previous Blueprint plan · Progress preserved",
    title: "Your earlier plan, kept intact.",
  },
  overview: {
    kicker: "Propeller command center",
    title:
      "Turn the Chamber membership into Brand Refresh clients, then monthly accounts.",
  },
  benefits: {
    kicker: "Benefit activation",
    title: "Use every Propeller benefit deliberately, not passively.",
  },
  roadmap: {
    kicker: "From zero to local authority · 100 practical steps",
    title: "Your complete growth plan.",
  },
  prospects: {
    kicker: "Qualified member outreach",
    title:
      "Start with Chamber members already matched against retainer-fit research.",
  },
  outreach: {
    kicker: "Approval-first automation",
    title:
      "Research, review, send, follow up, and track the Chamber pipeline in one place.",
  },
  "credit-unions": {
    kicker: "Texas credit unions · Separate outreach campaign",
    title: "Texas credit-union outreach.",
  },
  "brand-video": {
    kicker: "Corpus Christi · Separate outreach campaign",
    title: "Professional brand-video outreach.",
  },
  training: {
    kicker: "Internal training & knowledge capture · Campaign workspace",
    title: "Private pilot research, messages, and operations.",
  },
  hustle: {
    kicker: "Corpus Christi Hustle · 2027 sponsorship outreach",
    title: "Local stories. Episode partners.",
  },
  sectors: {
    kicker: "Four audiences · Campaign tracking",
    title: "Better content. Clearer conversations.",
  },
  campaigns: {
    kicker: "Jeristotle outreach · Independent campaign tracking",
    title: "Every campaign. One workspace.",
  },
  tourism: {
    kicker: "Tourism & hospitality · Separate outreach campaign",
    title: "Tourism & hospitality outreach.",
  },
  "real-estate": {
    kicker: "Real estate · Separate outreach campaign",
    title: "Real estate outreach.",
  },
  industrial: {
    kicker: "Industrial B2B · Separate outreach campaign",
    title: "Industrial B2B outreach.",
  },
  healthcare: {
    kicker: "Healthcare · Separate outreach campaign",
    title: "Healthcare outreach.",
  },
  events: {
    kicker: "Rooms and relationships",
    title:
      "Show up where decision-makers gather, then follow up with one clear idea.",
  },
  content: {
    kicker: "Chamber media calendar",
    title:
      "Sequence the included promotion benefits into one connected campaign.",
  },
  scripts: {
    kicker: "Field language",
    title:
      "Keep the offer clear: Brand Refresh first, monthly services only after fit.",
  },
  scorecard: {
    kicker: "Weekly accountability",
    title:
      "Track the actions that create meetings, proposals, and eventual retainers.",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="border border-black/10 bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-black/45">
        {label}
      </p>
      <p className="mt-3 font-display text-4xl leading-none tracking-[-0.05em] text-black">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-black/55">{helper}</p>
    </div>
  );
}

function SectionHeader({ section }: { section: ChamberSection }) {
  const copy = sectionCopy[section];
  return (
    <div className="border-b border-black/10 bg-[#f4f1e9] px-5 py-8 sm:px-8 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#9b6a00]">
        {copy.kicker}
      </p>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="max-w-5xl font-display text-[clamp(2.6rem,6vw,6.5rem)] uppercase leading-[0.78] tracking-[-0.07em] text-black">
          {copy.title}
        </h1>
        <div className="max-w-md border-l-4 border-[#ffb627] pl-5 text-sm leading-6 text-black/60">
          {["today", "roadmap", "blueprint"].includes(section) ? (
            <>
              <strong className="text-black">
                Content first. One connected system.
              </strong>{" "}
              Build your local presence: social pages, useful educational
              content, LinkedIn ads first, then Facebook and Instagram, lead
              capture, speaking, and continuous improvement. Teach the WHAT;
              support the HOW.
            </>
          ) : section === "credit-unions" ? (
            <>
              <strong className="text-black">App-owned outreach:</strong>{" "}
              content-first outreach for Texas credit unions. Three touches, a
              free consultation invitation, source-verified contacts, and
              separate app-owned sending controls.
            </>
          ) : section === "hustle" ? (
            <>
              <strong className="text-black">One episode first.</strong> Aim for
              24 mini-documentaries in 2027 with one sponsor per episode. Ask
              permission to send a tailored proposal, then agree on scope,
              promotion and measurement.
            </>
          ) : section === "campaigns" ? (
            <>
              <strong className="text-black">
                One place to track outreach.
              </strong>{" "}
              Open any campaign to review its contacts, queue, messages and
              recorded results. Campaigns keep their own targeting, limits and
              sending controls.
            </>
          ) : isSectorTrackingSection(section) ? (
            <>
              <strong className="text-black">Four separate campaigns.</strong>{" "}
              Each audience has three tailored messages and its own limit of 5
              new contacts/day. Follow-ups are additional, with sending seven
              days a week in America/Chicago. The workspace below shows actual
              recorded activation, queue and delivery state. A launch request is
              not a delivery receipt. Existing campaign limits remain unchanged.
            </>
          ) : section === "training" ? (
            <>
              <strong className="text-black">
                Runtime status is persisted:
              </strong>{" "}
              research, message review, and campaign operations are shown from
              recorded state below. A paused or unavailable runtime is not a
              sending claim; research appears as configured or not connected.
            </>
          ) : (
            <>
              <strong className="text-black">Operating rule:</strong> sell the
              $3,500 Brand Refresh as the first paid trial. Discuss
              $4,500–$7,500 monthly service only after successful delivery and
              mutual fit.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ complete, total }: { complete: number; total: number }) {
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold uppercase tracking-[0.12em] text-black/50">
        <span>
          {complete}/{total} complete
        </span>
        <span>{percent}%</span>
      </div>
      <div className="mt-2 h-2 bg-black/10">
        <div className="h-full bg-[#ffb627]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Overview({
  data,
  onSectionChange,
}: {
  data: Workspace;
  onSectionChange: (section: ChamberSection) => void;
}) {
  const completeBenefits = data.benefits.filter(
    item => item.status === "complete"
  ).length;
  const completeActions = data.actions.filter(
    item => item.status === "complete"
  ).length;
  const nextAction = getNextChecklistAction(data.actions);
  const activeProspects = data.prospects.filter(
    item => !["not_fit", "monthly_client"].includes(item.stage)
  ).length;
  const highFit = data.prospects.filter(item => item.fit === "high").length;
  const meetings = data.prospects.filter(item =>
    [
      "meeting",
      "brand_refresh_proposal",
      "brand_refresh_client",
      "monthly_conversation",
      "monthly_client",
    ].includes(item.stage)
  ).length;
  const brandRefreshClients = data.prospects.filter(item =>
    ["brand_refresh_client", "monthly_conversation", "monthly_client"].includes(
      item.stage
    )
  ).length;

  return (
    <div className="space-y-8 p-5 sm:p-8 lg:p-10">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Benefits activated"
          value={`${completeBenefits}/${data.benefits.length}`}
          helper="Propeller deliverables with tracked usage and next steps."
        />
        <StatCard
          label="90-day tasks"
          value={`${completeActions}/${data.actions.length}`}
          helper="Actions across visibility, events, content, and outreach."
        />
        <StatCard
          label="Chamber prospects"
          value={data.prospects.length}
          helper={`${highFit} high-fit Chamber-confirmed targets ready for research.`}
        />
        <StatCard
          label="Meetings or deeper"
          value={meetings}
          helper={`${brandRefreshClients} prospects have reached Brand Refresh client or later.`}
        />
      </div>

      <div className="grid overflow-hidden border border-[#d8c99f] bg-[#fffaf0] shadow-[0_16px_50px_rgba(0,0,0,.05)] lg:grid-cols-[1.25fr_.75fr]">
        <div className="p-6 sm:p-8">
          <Badge className="rounded-none bg-[#ffb627] text-black hover:bg-[#ffb627]">
            Membership active · Portal access confirmed
          </Badge>
          <h2 className="mt-4 max-w-2xl text-3xl font-black tracking-[-0.05em] text-black">
            The Jeristotle member account is open and ready to improve.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
            Sign-in was verified on {CHAMBER_PORTAL_PROFILE_AUDIT.checkedOn}.
            The company profile is {CHAMBER_PORTAL_PROFILE_AUDIT.overall}%
            complete, with organization information and the map pin complete.
            The only remaining profile-completion item is a real social network,
            which should stay empty until Jeristotle creates one.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              ["Open Member Portal", CHAMBER_LINKS.memberLogin],
              ["Review Events Calendar", CHAMBER_LINKS.events],
              ["View Public Directory", CHAMBER_LINKS.directory],
            ].map(([label, href]) => (
              <a
                className="inline-flex items-center gap-2 border border-black bg-black px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-[#9b6a00]"
                href={href}
                key={label}
                rel="noreferrer"
                target="_blank"
              >
                {label}
                <ArrowUpRight size={15} />
              </a>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-black/48">
            The portal exposes company information, categories, logos, photos,
            video, map pin, membership badge, events, reports, news, deals, job
            postings, MarketSpace, and request-for-proposal tools. No account
            settings or profile fields were changed during verification.
          </p>
        </div>
        <div className="border-t border-[#d8c99f] bg-white p-6 sm:p-8 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
            Membership contact
          </p>
          <h3 className="mt-3 text-xl font-black tracking-[-0.03em] text-black">
            {CHAMBER_PRIMARY_CONTACT.name}
          </h3>
          <p className="mt-1 text-sm text-black/55">
            {CHAMBER_PRIMARY_CONTACT.role}
          </p>
          <div className="mt-5 space-y-3 text-sm text-black/70">
            <a
              className="flex items-center gap-3 font-semibold hover:text-[#9b6a00]"
              href={`mailto:${CHAMBER_PRIMARY_CONTACT.email}`}
            >
              <Mail size={16} />
              {CHAMBER_PRIMARY_CONTACT.email}
            </a>
            <a
              className="flex items-center gap-3 font-semibold hover:text-[#9b6a00]"
              href={`tel:+1${CHAMBER_PRIMARY_CONTACT.directPhone.replace(/\D/g, "")}`}
            >
              <Phone size={16} />
              Direct: {CHAMBER_PRIMARY_CONTACT.directPhone}
            </a>
            <a
              className="flex items-center gap-3 font-semibold hover:text-[#9b6a00]"
              href={`tel:+1${CHAMBER_PRIMARY_CONTACT.mobilePhone.replace(/\D/g, "")}`}
            >
              <Phone size={16} />
              Mobile: {CHAMBER_PRIMARY_CONTACT.mobilePhone}
            </a>
            <p className="border-t border-black/10 pt-3 leading-5 text-black/55">
              {CHAMBER_PRIMARY_CONTACT.address}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
              Discovery findings
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-black">
              Verified portal audit and growth opportunities
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-black/55">
            The account is accessible. Finish the verified profile gaps first,
            then confirm specifications and approval steps for promotional
            benefits before submitting assets.
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CHAMBER_PORTAL_PROFILE_AUDIT.sections.map(section => (
            <div
              className="border border-black/10 bg-[#f8f5ee] p-4"
              key={section.name}
            >
              <div className="flex items-end justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/55">
                  {section.name}
                </p>
                <p className="text-2xl font-black text-black">
                  {section.completion}%
                </p>
              </div>
              <div className="mt-3 h-1.5 bg-black/8">
                <div
                  className="h-full bg-[#ffb627]"
                  style={{ width: `${section.completion}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-black/55">
                {section.next}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CHAMBER_PORTAL_OPPORTUNITIES.map(item => (
            <a
              className="group border border-black/10 bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.04)] transition hover:-translate-y-0.5 hover:border-[#ffb627]"
              href={item.url}
              key={item.name}
              rel="noreferrer"
              target="_blank"
            >
              <div className="flex items-start justify-between gap-3">
                <Badge
                  className={cx(
                    "rounded-none",
                    item.access === "Available now"
                      ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
                      : item.access === "Portal verified"
                        ? "bg-[#fff0bd] text-[#6b4800] hover:bg-[#fff0bd]"
                        : "bg-black text-white hover:bg-black"
                  )}
                >
                  {item.access}
                </Badge>
                <ArrowUpRight
                  className="text-black/25 transition group-hover:text-[#9b6a00]"
                  size={17}
                />
              </div>
              <h3 className="mt-4 text-lg font-black tracking-[-0.03em] text-black">
                {item.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-black/58">
                {item.action}
              </p>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="border border-black/10 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.05)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
                This week
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                Your next Chamber action
              </h2>
            </div>
            <Button
              className="hidden rounded-none bg-black text-white hover:bg-black/80 sm:flex"
              onClick={() => onSectionChange("roadmap")}
            >
              Open checklist
            </Button>
          </div>
          <div className="mt-6 grid gap-3">
            {nextAction ? (
              <button
                className="flex items-start gap-4 border border-black/10 bg-[#f8f5ee] p-4 text-left transition hover:border-[#ffb627] hover:bg-[#fff7df]"
                onClick={() => onSectionChange("roadmap")}
              >
                {nextAction.status === "complete" ? (
                  <CheckCircle2 className="mt-1 text-emerald-600" size={20} />
                ) : (
                  <Circle className="mt-1 text-black/30" size={20} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-black">{nextAction.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-black/55">
                    {nextAction.description}
                  </p>
                </div>
                <ChevronRight className="mt-1 text-black/25" />
              </button>
            ) : (
              <div className="border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900">
                Every Chamber growth action is complete.
              </div>
            )}
          </div>
        </div>

        <div className="border border-black/10 bg-black p-6 text-white shadow-[0_16px_50px_rgba(0,0,0,.08)]">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#ffb627]">
            Chamber ROI thesis
          </p>
          <h2 className="mt-3 font-display text-5xl uppercase leading-[0.8] tracking-[-0.06em]">
            Visibility is only useful when it creates follow-up.
          </h2>
          <p className="mt-5 text-sm leading-6 text-white/62">
            The Propeller level gives Jeristotle credibility, content
            placements, and rooms to build relationships. The hub turns each
            benefit into a trackable action so Chamber exposure becomes
            conversations, proposals, and qualified client relationships.
          </p>
          <div className="mt-7 space-y-4">
            <ProgressBar
              complete={completeBenefits}
              total={data.benefits.length}
            />
            <ProgressBar
              complete={completeActions}
              total={data.actions.length}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {TARGET_CATEGORY_SEEDS.slice(0, 6).map(
          ([category, priority, reason]) => (
            <div className="border border-black/10 bg-white p-5" key={category}>
              <Badge className="rounded-none bg-[#ffb627] text-black hover:bg-[#ffb627]">
                {priority}
              </Badge>
              <h3 className="mt-4 text-lg font-black tracking-[-0.03em]">
                {category}
              </h3>
              <p className="mt-2 text-sm leading-6 text-black/58">{reason}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

type Workspace = inferRouterOutputs<AppRouter>["chamber"]["workspace"];
type Benefit = Workspace["benefits"][number];
type Event = Workspace["events"][number];
type Prospect = Workspace["prospects"][number];

function Benefits({ data }: { data: Workspace }) {
  const utils = trpc.useUtils();
  const update = trpc.chamber.updateBenefit.useMutation({
    onSuccess: () => utils.chamber.workspace.invalidate(),
  });
  const grouped = useMemo(
    () => groupBy(data.benefits, item => item.benefitGroup),
    [data.benefits]
  );
  return (
    <div className="space-y-6 p-5 sm:p-8 lg:p-10">
      {Object.entries(grouped).map(([group, benefits]) => (
        <div key={group}>
          <h2 className="mb-3 text-xl font-black tracking-[-0.04em]">
            {group}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {benefits.map(benefit => (
              <BenefitCard
                benefit={benefit}
                key={benefit.id}
                onUpdate={values =>
                  update.mutate({ id: benefit.id, ...values })
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BenefitCard({
  benefit,
  onUpdate,
}: {
  benefit: Benefit;
  onUpdate: (values: { status?: Benefit["status"]; used?: number }) => void;
}) {
  return (
    <div className="border border-black/10 bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
            {benefit.benefitGroup}
          </p>
          <h3 className="mt-2 text-lg font-black tracking-[-0.03em]">
            {benefit.name}
          </h3>
        </div>
        <select
          className="rounded-none border border-black/10 bg-[#f8f5ee] px-3 py-2 text-sm"
          value={benefit.status}
          onChange={event =>
            onUpdate({ status: event.target.value as Benefit["status"] })
          }
        >
          {Object.entries(benefitStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-4 text-sm leading-6 text-black/60">
        {benefit.activation}
      </p>
      <div className="mt-5 grid gap-3 border-t border-black/10 pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">
            Success metric
          </p>
          <p className="mt-1 text-sm text-black/70">{benefit.metric}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-10 w-20 rounded-none border border-black/10 px-3 text-sm"
            min={0}
            max={benefit.allowance}
            type="number"
            value={benefit.used}
            onChange={event => onUpdate({ used: Number(event.target.value) })}
          />
          <span className="text-sm text-black/45">of {benefit.allowance}</span>
        </div>
      </div>
      <a
        className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-black hover:text-[#9b6a00]"
        href={benefit.officialUrl}
        rel="noreferrer"
        target="_blank"
      >
        Official source <ArrowUpRight size={14} />
      </a>
    </div>
  );
}

function Roadmap({ data }: { data: Workspace }) {
  const utils = trpc.useUtils();
  const ordered = useMemo(
    () => [...data.actions].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.actions]
  );
  const recommended = getNextChecklistAction(ordered);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    ordered.find(action => action.id === selectedId) ??
    recommended ??
    ordered.at(-1) ??
    null;
  const selectedIndex = selected
    ? ordered.findIndex(action => action.id === selected.id)
    : -1;
  const progress = getChecklistProgress(ordered);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(selected?.notes ?? "");
  }, [selected?.id, selected?.notes]);

  const update = trpc.chamber.updateAction.useMutation({
    onSuccess: async (_result, variables) => {
      if (variables.status === "complete") setSelectedId(null);
      await utils.chamber.workspace.invalidate();
      toast.success(
        variables.status === "complete"
          ? "Checked off. Your next action is ready."
          : "Checklist item updated."
      );
    },
    onError: error => toast.error(error.message),
  });

  if (!selected) {
    return (
      <div className="p-5 sm:p-8 lg:p-10">
        <div className="border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-950">
          <CheckCircle2 className="mx-auto" size={38} />
          <h2 className="mt-4 text-3xl font-black">Checklist complete</h2>
          <p className="mt-2 text-sm">
            Every Chamber growth action is checked off.
          </p>
        </div>
      </div>
    );
  }

  const phaseLabel =
    selected.phase === "first_30"
      ? "First 30 days"
      : selected.phase === "days_31_60"
        ? "Days 31–60"
        : "Days 61–90";

  return (
    <div className="p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <ProgressBar complete={progress.complete} total={progress.total} />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">
            {progress.blocked > 0 ? `${progress.blocked} blocked · ` : ""}
            Step {selectedIndex + 1} of {ordered.length}
          </p>
        </div>

        <article className="overflow-hidden border border-black/10 bg-white shadow-[0_24px_70px_rgba(0,0,0,.08)]">
          <div className="flex flex-col gap-5 border-b border-black/10 bg-[#fff4d6] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#9b6a00]">
                {phaseLabel} · {selected.category}
              </p>
              <p className="mt-2 text-sm font-bold text-black/55">
                One action only. Finish it, check it off, then continue.
              </p>
            </div>
            <Badge
              className={cx(
                "w-fit rounded-none px-3 py-1.5 text-[10px] uppercase tracking-[0.12em]",
                selected.status === "complete"
                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                  : selected.status === "blocked"
                    ? "bg-red-600 text-white hover:bg-red-600"
                    : "bg-black text-[#ffb627] hover:bg-black"
              )}
            >
              {actionStatusLabels[selected.status]}
            </Badge>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
              <div>
                <button
                  aria-label={
                    selected.status === "complete"
                      ? "Reopen this checklist item"
                      : "Mark this checklist item complete"
                  }
                  className={cx(
                    "flex h-16 w-16 items-center justify-center border-2 transition",
                    selected.status === "complete"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-black/20 bg-white text-black/20 hover:border-[#ffb627] hover:bg-[#ffb627] hover:text-black"
                  )}
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: selected.id,
                      status:
                        selected.status === "complete"
                          ? "not_started"
                          : "complete",
                    })
                  }
                  type="button"
                >
                  {update.isPending ? (
                    <Loader2 className="animate-spin" size={28} />
                  ) : (
                    <CheckCircle2 size={30} />
                  )}
                </button>
                <p className="mt-8 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
                  Action {selectedIndex + 1}
                </p>
                <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                  {selected.title}
                </h2>
                <p className="mt-5 max-w-3xl text-base leading-7 text-black/62">
                  {selected.description}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  {selected.status !== "in_progress" &&
                  selected.status !== "complete" ? (
                    <Button
                      className="h-11 rounded-none bg-black px-5 font-extrabold uppercase tracking-[0.12em] text-white hover:bg-black/80"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          id: selected.id,
                          status: "in_progress",
                        })
                      }
                    >
                      Start this item
                    </Button>
                  ) : null}
                  {selected.status !== "complete" ? (
                    <Button
                      className="h-11 rounded-none bg-[#ffb627] px-5 font-extrabold uppercase tracking-[0.12em] text-black hover:bg-[#f0a915]"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: selected.id, status: "complete" })
                      }
                    >
                      <CheckCircle2 size={18} /> Check off and continue
                    </Button>
                  ) : null}
                  {selected.status !== "blocked" &&
                  selected.status !== "complete" ? (
                    <Button
                      className="h-11 rounded-none border-black/15 bg-white px-5 font-bold text-black hover:bg-red-50 hover:text-red-700"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: selected.id, status: "blocked" })
                      }
                      variant="outline"
                    >
                      Mark blocked
                    </Button>
                  ) : null}
                </div>
              </div>

              <aside className="border-l-4 border-[#ffb627] bg-[#f8f5ee] p-5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-black/45">
                  Owner
                </p>
                <p className="mt-1 font-black">{selected.owner}</p>
                <label className="mt-6 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-black/45">
                  Working notes
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-none border border-black/10 bg-white p-3 text-sm font-normal leading-6 tracking-normal text-black"
                    onChange={event => setNotes(event.target.value)}
                    placeholder="Add the contact, deadline, result, or blocker."
                    value={notes}
                  />
                </label>
                <Button
                  className="mt-3 h-10 w-full rounded-none border-black/15 bg-white text-xs font-extrabold uppercase tracking-[0.12em] text-black hover:bg-black hover:text-white"
                  disabled={
                    update.isPending || notes === (selected.notes ?? "")
                  }
                  onClick={() => update.mutate({ id: selected.id, notes })}
                  variant="outline"
                >
                  Save notes
                </Button>
              </aside>
            </div>

            <div className="mt-10 flex items-center justify-between gap-4 border-t border-black/10 pt-5">
              <Button
                className="rounded-none"
                disabled={selectedIndex <= 0}
                onClick={() =>
                  setSelectedId(ordered[selectedIndex - 1]?.id ?? null)
                }
                variant="outline"
              >
                Previous item
              </Button>
              <Button
                className="rounded-none"
                disabled={selectedIndex >= ordered.length - 1}
                onClick={() =>
                  setSelectedId(ordered[selectedIndex + 1]?.id ?? null)
                }
                variant="outline"
              >
                Next item
              </Button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function Prospects({ data }: { data: Workspace }) {
  const utils = trpc.useUtils();
  const update = trpc.chamber.updateProspect.useMutation({
    onSuccess: () => utils.chamber.workspace.invalidate(),
  });
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("all");
  const [stage, setStage] = useState("all");
  const visible = data.prospects.filter(prospect => {
    const haystack =
      `${prospect.name} ${prospect.category} ${prospect.contactPerson ?? ""}`.toLowerCase();
    return (
      haystack.includes(query.toLowerCase()) &&
      (fit === "all" || prospect.fit === fit) &&
      (stage === "all" || prospect.stage === stage)
    );
  });

  return (
    <div className="space-y-5 p-5 sm:p-8 lg:p-10">
      <div className="overflow-x-auto border border-black/10 bg-black p-5 text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#ffb627]">
          Brand Refresh-to-monthly funnel
        </p>
        <div className="mt-4 flex min-w-max items-start gap-2">
          {CHAMBER_FUNNEL_GUIDE.map(([label, copy], index) => (
            <div className="flex items-start gap-2" key={label}>
              <div className="w-44 border border-white/15 p-3">
                <p className="text-xs font-black uppercase tracking-[0.08em]">
                  {label}
                </p>
                <p className="mt-2 text-xs leading-5 text-white/55">{copy}</p>
              </div>
              {index < CHAMBER_FUNNEL_GUIDE.length - 1 ? (
                <ChevronRight className="mt-3 text-[#ffb627]" size={18} />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 rounded-none border border-black/10 bg-white p-4 lg:grid-cols-[1fr_160px_220px]">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
            size={18}
          />
          <input
            className="h-11 w-full rounded-none border border-black/10 bg-[#f8f5ee] pl-10 pr-3 text-sm"
            placeholder="Search by business, category, or contact"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <select
          className="h-11 rounded-none border border-black/10 bg-[#f8f5ee] px-3 text-sm"
          value={fit}
          onChange={event => setFit(event.target.value)}
        >
          <option value="all">All fit levels</option>
          <option value="high">High fit</option>
          <option value="medium">Medium fit</option>
        </select>
        <select
          className="h-11 rounded-none border border-black/10 bg-[#f8f5ee] px-3 text-sm"
          value={stage}
          onChange={event => setStage(event.target.value)}
        >
          <option value="all">All stages</option>
          {Object.entries(stageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden border border-black/10 bg-white">
        <div className="hidden grid-cols-[70px_1.2fr_140px_1fr_170px] gap-4 border-b border-black/10 bg-black px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white lg:grid">
          <span>Rank</span>
          <span>Business</span>
          <span>Fit</span>
          <span>Contact path</span>
          <span>Stage</span>
        </div>
        <div className="divide-y divide-black/10">
          {visible.map(prospect => (
            <div
              className="grid gap-4 p-4 lg:grid-cols-[70px_1.2fr_140px_1fr_170px] lg:items-start"
              key={prospect.id}
            >
              <div className="font-display text-3xl leading-none tracking-[-0.05em] text-black/35">
                {prospect.priority}
              </div>
              <div>
                <a
                  className="text-lg font-black tracking-[-0.04em] text-black hover:text-[#9b6a00]"
                  href={prospect.website || prospect.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {prospect.name}
                </a>
                <p className="mt-1 text-sm text-black/52">
                  {prospect.category}
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-black/45">
                  {prospect.notes}
                </p>
              </div>
              <Badge
                className={cx(
                  "w-fit rounded-none",
                  prospect.fit === "high"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#fff4d6] text-[#7b5300]"
                )}
              >
                {prospect.fit} monthly fit
              </Badge>
              <div className="space-y-1 text-sm leading-5 text-black/60">
                <p
                  className="line-clamp-3 break-words font-semibold text-black/75"
                  title={prospect.contactPerson || undefined}
                >
                  {prospect.contactPerson || "Ask for marketing/ownership"}
                </p>
                {prospect.email ? (
                  <p className="line-clamp-2 break-all">{prospect.email}</p>
                ) : null}
                {prospect.phone ? (
                  <p className="line-clamp-1">{prospect.phone}</p>
                ) : null}
                <a
                  className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black hover:text-[#9b6a00]"
                  href={prospect.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Chamber lookup <ExternalLink size={12} />
                </a>
              </div>
              <select
                className="h-11 rounded-none border border-black/10 bg-[#f8f5ee] px-3 text-sm"
                value={prospect.stage}
                onChange={event =>
                  update.mutate({
                    id: prospect.id,
                    stage: event.target.value as Prospect["stage"],
                  })
                }
              >
                {Object.entries(stageLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Events({ data }: { data: Workspace }) {
  const utils = trpc.useUtils();
  const update = trpc.chamber.updateEvent.useMutation({
    onSuccess: () => utils.chamber.workspace.invalidate(),
  });
  const networkingEvents = data.events.filter(event =>
    event.category.startsWith("Chamber Networking")
  );
  return (
    <div className="space-y-10 p-5 sm:p-8 lg:p-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
              Shared by Gloria
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              Chamber networking series to watch
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
              These are the recurring opportunities named in the membership
              welcome email. Confirm the individual date and registration
              requirements before attending.
            </p>
          </div>
          <a
            className="inline-flex items-center gap-2 border border-black bg-black px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em] text-white hover:bg-[#ffb627] hover:text-black"
            href={CHAMBER_LINKS.events}
            rel="noreferrer"
            target="_blank"
          >
            Open official calendar <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {CHAMBER_SHARED_EVENT_SERIES.map((series, index) => (
            <article
              className="border border-black/10 bg-white p-5"
              key={series.name}
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-display text-4xl leading-none text-[#ffb627]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <Badge className="rounded-none bg-[#fff4d6] text-[#7b5300]">
                  {series.status}
                </Badge>
              </div>
              <h3 className="mt-5 text-xl font-black tracking-[-0.04em]">
                {series.name}
              </h3>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-black/35">
                {series.format}
              </p>
              <p className="mt-3 text-sm leading-6 text-black/60">
                {series.purpose}
              </p>
              <div className="mt-4 border-l-2 border-[#ffb627] pl-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9b6a00]">
                  Jeristotle play
                </p>
                <p className="mt-1 text-sm leading-6 text-black/65">
                  {series.bestUse}
                </p>
              </div>
              <p className="mt-4 text-xs font-semibold leading-5 text-black/40">
                {series.scheduleNote}
              </p>
              {series.nextEvent ? (
                <div className="mt-4 border-t border-black/10 pt-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9b6a00]">
                    Verified next event
                  </p>
                  <p className="mt-2 font-black text-black">
                    {new Date(series.nextEvent.start).toLocaleDateString(
                      undefined,
                      {
                        timeZone: "America/Chicago",
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    {new Date(series.nextEvent.start).toLocaleTimeString(
                      undefined,
                      {
                        timeZone: "America/Chicago",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                    {" to "}
                    {new Date(series.nextEvent.end).toLocaleTimeString(
                      undefined,
                      {
                        timeZone: "America/Chicago",
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-black/70">
                    {series.nextEvent.venue}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-black/45">
                    {series.nextEvent.address}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-black/55">
                    {series.nextEvent.price}
                  </p>
                  <a
                    className="mt-4 inline-flex items-center gap-2 bg-black px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em] text-white hover:bg-[#ffb627] hover:text-black"
                    href={series.nextEvent.registrationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Register <ArrowUpRight size={14} />
                  </a>
                </div>
              ) : null}
              <a
                className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-[0.12em] text-black hover:text-[#9b6a00]"
                href={series.url}
                rel="noreferrer"
                target="_blank"
              >
                {series.nextEvent ? "Event details" : "Watch calendar"}{" "}
                <ExternalLink size={12} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
          Verified upcoming networking dates
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
          Networking events to plan now
        </h2>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {networkingEvents.map(event => (
            <div className="border border-black/10 bg-white p-5" key={event.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#9b6a00]">
                    {event.category}
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.05em]">
                    {event.name}
                  </h3>
                  <p className="mt-1 text-sm text-black/50">
                    {new Date(event.eventDate).toLocaleDateString(undefined, {
                      timeZone: "America/Chicago",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" at "}
                    {new Date(event.eventDate).toLocaleTimeString(undefined, {
                      timeZone: "America/Chicago",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <select
                  className="rounded-none border border-black/10 bg-[#f8f5ee] px-3 py-2 text-sm"
                  value={event.status}
                  onChange={change =>
                    update.mutate({
                      id: event.id,
                      status: change.target.value as Event["status"],
                    })
                  }
                >
                  {Object.entries(eventStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-4 text-sm leading-6 text-black/60">
                {event.strategicGoal}
              </p>
              <div className="mt-5 grid gap-3 border-t border-black/10 pt-4 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black/45">
                  Contacts
                  <input
                    className="h-10 rounded-none border border-black/10 px-3 text-sm font-normal tracking-normal text-black"
                    min={0}
                    type="number"
                    value={event.contactsCount}
                    onChange={change =>
                      update.mutate({
                        id: event.id,
                        contactsCount: Number(change.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black/45">
                  Meetings
                  <input
                    className="h-10 rounded-none border border-black/10 px-3 text-sm font-normal tracking-normal text-black"
                    min={0}
                    type="number"
                    value={event.meetingsBooked}
                    onChange={change =>
                      update.mutate({
                        id: event.id,
                        meetingsBooked: Number(change.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <a
                className="mt-5 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-black hover:text-[#9b6a00]"
                href={event.url}
                rel="noreferrer"
                target="_blank"
              >
                Open event <ArrowUpRight size={14} />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
          Repeatable field workflow
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
          Every event runs on the same relationship system
        </h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {CHAMBER_EVENT_PLAYBOOK.map((item, index) => (
            <div
              className="border border-black/10 bg-white p-5"
              key={item.title}
            >
              <p className="font-display text-4xl leading-none text-[#ffb627]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9b6a00]">
                {item.phase}
              </p>
              <h3 className="mt-2 text-lg font-black tracking-[-0.03em]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-black/58">
                {item.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
          Relationship portfolio
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
          Where Jeristotle should invest its time
        </h2>
        <div className="mt-5 divide-y divide-black/10 border border-black/10 bg-white">
          {CHAMBER_RELATIONSHIP_PLAYS.map(play => (
            <div
              className="grid gap-3 p-5 md:grid-cols-[220px_220px_1fr]"
              key={play.name}
            >
              <h3 className="font-black tracking-[-0.03em]">{play.name}</h3>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#9b6a00]">
                {play.priority}
              </p>
              <p className="text-sm leading-6 text-black/58">{play.action}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContentCampaign() {
  return (
    <div className="space-y-8 p-5 sm:p-8 lg:p-10">
      <div className="grid gap-5 lg:grid-cols-3">
        {CHAMBER_CONTENT_CALENDAR.map((item, index) => (
          <div className="border border-black/10 bg-white p-5" key={item.asset}>
            <p className="font-display text-5xl leading-none tracking-[-0.06em] text-[#ffb627]">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-4 text-xl font-black tracking-[-0.04em]">
              {item.asset}
            </h3>
            <p className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-black/42">
              {item.timing}
            </p>
            <p className="mt-4 text-sm leading-6 text-black/60">
              {item.message}
            </p>
            <p className="mt-4 border-t border-black/10 pt-4 text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b6a00]">
              CTA: {item.cta}
            </p>
          </div>
        ))}
      </div>
      <div className="border border-black/10 bg-black p-6 text-white">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#ffb627]">
          Campaign architecture
        </p>
        <p className="mt-3 max-w-4xl text-lg leading-8 text-white/70">
          The content benefits should not be one-off announcements. The order is
          deliberate: directory credibility first, educational blog and reel
          next, podcast for authority, then the weekly flyers and dedicated
          e-blast once the Brand Refresh page, selected work, follow-up process,
          and CRM tracking are ready.
        </p>
      </div>
    </div>
  );
}

function Scripts() {
  return (
    <div className="space-y-8 p-5 sm:p-8 lg:p-10">
      <div className="columns-1 gap-5 xl:columns-2">
        {CHAMBER_SCRIPTS.map(script => (
          <div
            className="mb-5 break-inside-avoid border border-black/10 bg-white p-5"
            key={script.name}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-black tracking-[-0.04em]">
                {script.name}
              </h3>
              <Button
                className="rounded-none border-black/20"
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(script.copy)
                    .then(() => toast.success("Script copied"))
                }
              >
                <Copy size={14} /> Copy
              </Button>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-black/62">
              {script.copy}
            </p>
          </div>
        ))}
      </div>
      <div className="border border-black/10 bg-[#fff4d6] p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
          Outreach guardrails
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
          Protect the Chamber relationship and Jeristotle&apos;s reputation
        </h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {CHAMBER_COMPLIANCE_GUARDRAILS.map((guardrail, index) => (
            <div
              className="flex gap-3 border border-black/10 bg-white p-4"
              key={guardrail}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-black text-xs font-black text-[#ffb627]">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-black/62">{guardrail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const scoreFields = [
  ["eventsAttended", "Events attended"],
  ["targetConversations", "Target conversations"],
  ["decisionMakersFound", "Decision-makers found"],
  ["followupsCompleted", "Follow-ups completed"],
  ["meetingsBooked", "Meetings booked"],
  ["brandRefreshProposals", "Brand Refresh proposals"],
  ["brandRefreshClients", "Brand Refresh clients"],
  ["monthlyConversations", "Monthly conversations"],
  ["monthlyClients", "Monthly clients"],
] as const;

type ScoreField = (typeof scoreFields)[number][0];
type ScoreDraft = Record<ScoreField, number> & {
  weekStart: string;
  notes: string;
};

function mondayOfCurrentWeek() {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function Scorecard({ data }: { data: Workspace }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<ScoreDraft>(() => ({
    weekStart: mondayOfCurrentWeek(),
    eventsAttended: 0,
    targetConversations: 0,
    decisionMakersFound: 0,
    followupsCompleted: 0,
    meetingsBooked: 0,
    brandRefreshProposals: 0,
    brandRefreshClients: 0,
    monthlyConversations: 0,
    monthlyClients: 0,
    notes: "",
  }));
  const save = trpc.chamber.saveWeeklyScore.useMutation({
    onSuccess: async () => {
      await utils.chamber.workspace.invalidate();
      toast.success("Weekly scorecard saved");
    },
    onError: error => toast.error(error.message),
  });

  const submit = () => {
    const { weekStart, ...values } = draft;
    save.mutate({ ...values, weekStart: new Date(`${weekStart}T12:00:00`) });
  };

  return (
    <div className="space-y-6 p-5 sm:p-8 lg:p-10">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Weekly research"
          value="10–15"
          helper="Members researched before any visit or email."
        />
        <StatCard
          label="Target conversations"
          value="8–12"
          helper="Specific owners, marketers, or growth leaders engaged."
        />
        <StatCard
          label="Decision-makers found"
          value="5+"
          helper="Named contacts with a follow-up path."
        />
        <StatCard
          label="Follow-up window"
          value="48h"
          helper="Every conversation gets a next step quickly."
        />
      </div>
      <div className="border border-black/10 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
              Log observed activity
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
              This week&apos;s Chamber scorecard
            </h2>
          </div>
          <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black/45">
            Week starting
            <input
              className="h-10 rounded-none border border-black/10 px-3 text-sm font-normal tracking-normal text-black"
              type="date"
              value={draft.weekStart}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  weekStart: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scoreFields.map(([field, label]) => (
            <label
              className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black/45"
              key={field}
            >
              {label}
              <input
                className="h-11 rounded-none border border-black/10 bg-[#f8f5ee] px-3 text-sm font-normal tracking-normal text-black"
                min={0}
                type="number"
                value={draft[field]}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    [field]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <label className="mt-4 grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-black/45">
          Notes and learning
          <textarea
            className="min-h-28 rounded-none border border-black/10 bg-[#f8f5ee] p-3 text-sm font-normal leading-6 tracking-normal text-black"
            placeholder="Record useful introductions, repeated objections, and the one process change for next week."
            value={draft.notes}
            onChange={event =>
              setDraft(current => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
        <Button
          className="mt-4 h-11 rounded-none bg-black px-6 font-extrabold uppercase tracking-[0.12em] text-white hover:bg-black/80"
          disabled={save.isPending}
          onClick={submit}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : null}
          Save weekly score
        </Button>
      </div>

      {data.weeklyScores.length > 0 ? (
        <div className="overflow-hidden border border-black/10 bg-white">
          <div className="border-b border-black/10 bg-black px-5 py-4 text-white">
            <h2 className="text-lg font-black">Scorecard history</h2>
          </div>
          <div className="divide-y divide-black/10">
            {[...data.weeklyScores].reverse().map(score => (
              <div
                className="grid gap-4 p-5 md:grid-cols-[160px_repeat(3,1fr)]"
                key={score.id}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">
                    Week of
                  </p>
                  <p className="mt-1 font-bold">
                    {new Date(score.weekStart).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-black/45">Conversations</p>
                  <p className="mt-1 text-xl font-black">
                    {score.targetConversations}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-black/45">Meetings</p>
                  <p className="mt-1 text-xl font-black">
                    {score.meetingsBooked}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-black/45">Brand Refresh clients</p>
                  <p className="mt-1 text-xl font-black">
                    {score.brandRefreshClients}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border border-black/10 bg-white p-6">
        <h2 className="text-2xl font-black tracking-[-0.04em]">
          Weekly review questions
        </h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[
            "Which Chamber benefit created the most useful conversation this week?",
            "Which member category is showing real recurring-content demand?",
            "How many people gave us a named decision-maker and next follow-up date?",
            "Which objection repeated, and does our Brand Refresh offer answer it?",
            "Which leads should be removed because they cannot support the $3,500 trial or future monthly service?",
            "Which prospects are ready for a specific idea, not a generic sales pitch?",
          ].map(question => (
            <div
              className="border border-black/10 bg-[#f8f5ee] p-4 text-sm font-semibold leading-6"
              key={question}
            >
              {question}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function ChamberGrowth() {
  const [activeSection, setActiveSection] = useState<ChamberSection>(() => {
    const section = window.location.hash.slice(1) as ChamberSection;
    return Object.prototype.hasOwnProperty.call(sectionCopy, section)
      ? section
      : "today";
  });
  const workspace = trpc.chamber.workspace.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const changeSection = (section: ChamberSection) => {
    setActiveSection(section);
    if (window.location.hash !== `#${section}`)
      window.history.pushState(null, "", `#${section}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const syncHash = () => {
      const section = window.location.hash.slice(1) as ChamberSection;
      setActiveSection(
        Object.prototype.hasOwnProperty.call(sectionCopy, section)
          ? section
          : "today"
      );
    };
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Daily Growth Workspace | Jeristotle Productions";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const content = (() => {
    if (activeSection === "today" || activeSection === "roadmap")
      return (
        <GrowthDailyChecklist
          mode={activeSection === "today" ? "today" : "plan"}
          onNavigate={changeSection}
        />
      );
    if (activeSection === "blueprint") return <GrowthBlueprintGuide />;
    if (activeSection === "credit-unions")
      return <CreditUnionOutreachPipeline />;
    if (activeSection === "brand-video") return <BrandVideoOutreachPipeline />;
    if (activeSection === "training") return <TrainingOutreachPipeline />;
    if (activeSection === "hustle") return <HustleOutreachPipeline />;
    if (activeSection === "sectors") return <SectorCampaignPipeline />;
    const sectorKey = getSectorKeyForSection(activeSection);
    if (sectorKey) return <SectorCampaignPipeline campaignKey={sectorKey} />;
    if (activeSection === "campaigns") return null;
    if (workspace.isLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-10 text-black/60">
          <Loader2 className="mr-3 animate-spin" /> Loading Chamber operating
          system…
        </div>
      );
    }
    if (workspace.error) {
      return (
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="border border-red-200 bg-red-50 p-6 text-red-900">
            <h2 className="text-xl font-black">Access or data issue</h2>
            <p className="mt-2 text-sm leading-6">{workspace.error.message}</p>
          </div>
        </div>
      );
    }
    if (!workspace.data) return null;
    switch (activeSection) {
      case "overview":
        return (
          <Overview
            data={{ ...workspace.data, actions: workspace.data.legacyActions }}
            onSectionChange={section =>
              changeSection(section === "roadmap" ? "legacy" : section)
            }
          />
        );
      case "benefits":
        return <Benefits data={workspace.data} />;
      case "legacy":
        return (
          <Roadmap
            data={{ ...workspace.data, actions: workspace.data.legacyActions }}
          />
        );
      case "archive":
        return (
          <Roadmap
            data={{
              ...workspace.data,
              actions: workspace.data.archivedGrowthActions,
            }}
          />
        );
      case "prospects":
        return <Prospects data={workspace.data} />;
      case "outreach":
        return <ChamberOutreachPipeline />;
      case "events":
        return <Events data={workspace.data} />;
      case "content":
        return <ContentCampaign />;
      case "scripts":
        return <Scripts />;
      case "scorecard":
        return <Scorecard data={workspace.data} />;
      default:
        return null;
    }
  })();

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSectionChange={changeSection}
    >
      <SectionHeader section={activeSection} />
      {["outreach", "credit-unions", "brand-video", "training"].includes(
        activeSection
      ) && <OutreachAlertsPanel />}
      <div className="bg-[#f4f1e9]">
        {isCampaignSection(activeSection) ? (
          <UnifiedCampaignWorkspace
            section={activeSection}
            onSectionChange={changeSection}
          >
            {content}
          </UnifiedCampaignWorkspace>
        ) : (
          content
        )}
      </div>
      <div className="border-t border-black/10 bg-[#f4f1e9] px-5 py-6 text-xs text-black/45 sm:px-8 lg:px-10">
        {["today", "roadmap", "blueprint"].includes(activeSection) ? (
          <p>
            Local-authority plan · 100 practical steps, not a fame or
            market-performance score. The plan preserves the Blueprint's three
            pillars and nine components. Progress and task notes are saved;
            planned work does not guarantee leads, customers, sales, reach, or
            any market outcome.
          </p>
        ) : activeSection === "credit-unions" ? (
          <p>
            Credit-union research and contact evidence are recorded per
            prospect. This campaign is separate from the Chamber membership and
            does not imply a referral, endorsement, or proven credit-union
            client results. Sending status, verified queue, and activity are
            tracked separately in this campaign.
          </p>
        ) : activeSection === "brand-video" ? (
          <p>
            Brand Video outreach is a separate campaign with source-backed
            qualification and cross-campaign safeguards. Use its operations
            panel for actual sending status; checking off a growth task does not
            send a campaign message.
          </p>
        ) : activeSection === "hustle" ? (
          <p>
            Sponsorship outreach tracks proposal permission and episode
            reservations, not bank account data, signed agreements or guaranteed
            reach, accounts, loans or sales. Existing conversations and other
            campaigns remain protected. No proposal is attached to initial
            outreach.
          </p>
        ) : activeSection === "campaigns" ? (
          <p>
            Campaign navigation is unified, not campaign operations. Each
            campaign retains its own contacts, messages, source checks, sending
            rules and recorded performance. Viewing or switching campaigns does
            not send messages or change any queue or schedule.
          </p>
        ) : isSectorTrackingSection(activeSection) ? (
          <p>
            Four campaigns in the same Growth Hub. Verified identity, published
            contacts, fresh cross-campaign exclusions and
            stop-on-reply/OOO/bounce/opt-out handling are required before every
            send. Use the recorded state above for actual activation, schedules,
            readiness and acceptance. A template or launch request does not
            prove sending. Existing campaign limits remain unchanged.
          </p>
        ) : activeSection === "training" ? (
          <p>
            Internal Training &amp; Knowledge Capture has separate research,
            verified-contact, delivery and lead-outcome tracking. Use its
            operations panel for actual sending and replenishment status. The
            private pilot covers one client-approved workflow; it is not safety
            consultancy or an LMS, and completing a task does not send outreach.
          </p>
        ) : (
          <>
            Sources:{" "}
            <a
              className="font-semibold text-black hover:text-[#9b6a00]"
              href={CHAMBER_LINKS.membership}
              rel="noreferrer"
              target="_blank"
            >
              official Propeller benefits
            </a>
            ,{" "}
            <a
              className="font-semibold text-black hover:text-[#9b6a00]"
              href={CHAMBER_LINKS.directory}
              rel="noreferrer"
              target="_blank"
            >
              member directory
            </a>
            , and{" "}
            <a
              className="font-semibold text-black hover:text-[#9b6a00]"
              href={CHAMBER_LINKS.events}
              rel="noreferrer"
              target="_blank"
            >
              event calendar
            </a>
            . Recommendations are operating guidance only and do not guarantee
            leads, attendance, reach, sales, creator participation, or
            monthly-client conversion.
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
