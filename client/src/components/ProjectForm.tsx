import { trpc } from "@/lib/trpc";
import { continueToConsultationCalendar } from "@shared/consultation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type FormState = {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  projectType: string;
  promotionGoal: string;
  investment: string;
  timeline: string;
  goals: string;
  discoverySource: string;
  website: string;
};

const initialForm: FormState = {
  fullName: "",
  businessName: "",
  email: "",
  phone: "",
  projectType: "",
  promotionGoal: "",
  investment: "",
  timeline: "",
  goals: "",
  discoverySource: "",
  website: "",
};

const fieldClass =
  "w-full border-0 border-b border-white/20 bg-transparent px-0 py-3 text-[15px] text-white outline-none transition-colors placeholder:text-white/35 focus:border-[#ffb627] focus:ring-0";

export default function ProjectForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitted, setSubmitted] = useState(false);
  const submitInquiry = trpc.inquiries.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setForm(initialForm);
      continueToConsultationCalendar();
    },
    onError: () =>
      toast.error(
        "We couldn't send that yet. Please check your details and try again."
      ),
  });

  const update = (field: keyof FormState, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitInquiry.mutate({
      ...form,
      phone: form.phone || undefined,
      discoverySource: form.discoverySource || undefined,
    });
  };

  if (submitted) {
    return (
      <div className="flex min-h-[520px] flex-col justify-between rounded-sm border border-[#ffb627]/35 bg-[#0b0b0b] p-7 sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ffb627] text-black">
          <Check size={22} strokeWidth={2.5} />
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.26em] text-[#ffb627]">
            Inquiry received
          </p>
          <h3 className="font-display text-5xl leading-[0.9] text-white sm:text-6xl">
            Your story is in motion.
          </h3>
          <p className="mt-6 max-w-md text-base leading-7 text-white/60">
            We will review your goals, timeline, and project fit, then follow up
            with the clearest practical next step.
          </p>
        </div>
        <button
          className="w-fit text-xs font-bold uppercase tracking-[0.2em] text-white underline decoration-[#ffb627] underline-offset-8"
          onClick={() => setSubmitted(false)}
          type="button"
        >
          Submit another project
        </button>
      </div>
    );
  }

  return (
    <form className="grid gap-x-8 gap-y-7" onSubmit={handleSubmit}>
      <div className="grid gap-7 sm:grid-cols-2">
        <label className="form-field">
          <span>Your name *</span>
          <input
            className={fieldClass}
            name="fullName"
            onChange={event => update("fullName", event.target.value)}
            placeholder="First and last name"
            required
            value={form.fullName}
          />
        </label>
        <label className="form-field">
          <span>Business / organization *</span>
          <input
            className={fieldClass}
            name="businessName"
            onChange={event => update("businessName", event.target.value)}
            placeholder="Company name"
            required
            value={form.businessName}
          />
        </label>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <label className="form-field">
          <span>Email *</span>
          <input
            className={fieldClass}
            name="email"
            onChange={event => update("email", event.target.value)}
            placeholder="you@company.com"
            required
            type="email"
            value={form.email}
          />
        </label>
        <label className="form-field">
          <span>Phone</span>
          <input
            className={fieldClass}
            name="phone"
            onChange={event => update("phone", event.target.value)}
            placeholder="(361) 555-0000"
            type="tel"
            value={form.phone}
          />
        </label>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <label className="form-field">
          <span>What do you need most right now? *</span>
          <select
            className={fieldClass}
            name="projectType"
            onChange={event => update("projectType", event.target.value)}
            required
            value={form.projectType}
          >
            <option disabled value="">
              Select what you need most
            </option>
            <option value="Content production or commercial">
              Content production or commercial
            </option>
            <option value="Brand story or social content">
              Brand story or social content
            </option>
            <option value="Launch, campaign, or event content">
              Launch, campaign, or event content
            </option>
            <option value="Content and campaign planning">
              Content and campaign planning
            </option>
            <option value="Marketing strategy session">
              Marketing strategy session
            </option>
            <option value="Promotion and lead systems">
              Promotion and lead systems
            </option>
            <option value="Recurring content system">
              Recurring content system
            </option>
            <option value="Documentary or original film">
              Documentary or original film
            </option>
            <option value="Not sure yet">Not sure yet</option>
          </select>
        </label>
        <label className="form-field">
          <span>Planned investment *</span>
          <select
            className={fieldClass}
            name="investment"
            onChange={event => update("investment", event.target.value)}
            required
            value={form.investment}
          >
            <option disabled value="">
              Select a range
            </option>
            <option value="Under $10K">Under $10K</option>
            <option value="$10K–$25K">$10K–$25K</option>
            <option value="$25K–$50K">$25K–$50K</option>
            <option value="$50K–$100K">$50K–$100K</option>
            <option value="$100K+">$100K+</option>
            <option value="Need guidance">I need guidance</option>
          </select>
        </label>
      </div>

      <label className="form-field">
        <span>What should happen after someone sees it? *</span>
        <select
          className={fieldClass}
          name="promotionGoal"
          onChange={event => update("promotionGoal", event.target.value)}
          required
          value={form.promotionGoal}
        >
          <option disabled value="">
            Select a customer-path goal
          </option>
          <option value="Build local awareness">Build local awareness</option>
          <option value="Introduce or explain an offer">
            Introduce or explain an offer
          </option>
          <option value="Drive consultation or inquiry opportunities">
            Drive consultation or inquiry opportunities
          </option>
          <option value="Support event registration or promotion">
            Support event registration or promotion
          </option>
          <option value="Build a recurring content system">
            Build a recurring content system
          </option>
          <option value="Improve the customer follow-up path">
            Improve the customer follow-up path
          </option>
          <option value="Need a recommendation">I need a recommendation</option>
        </select>
      </label>

      <div className="grid gap-7 sm:grid-cols-2">
        <label className="form-field">
          <span>Ideal timeline *</span>
          <select
            className={fieldClass}
            name="timeline"
            onChange={event => update("timeline", event.target.value)}
            required
            value={form.timeline}
          >
            <option disabled value="">
              Select a timeline
            </option>
            <option value="ASAP / urgent">ASAP / urgent</option>
            <option value="Within 30 days">Within 30 days</option>
            <option value="1–3 months">1–3 months</option>
            <option value="3–6 months">3–6 months</option>
            <option value="Exploring for later">Exploring for later</option>
          </select>
        </label>
        <label className="form-field">
          <span>How did you find us?</span>
          <input
            className={fieldClass}
            name="discoverySource"
            onChange={event => update("discoverySource", event.target.value)}
            placeholder="Referral, search, social..."
            value={form.discoverySource}
          />
        </label>
      </div>

      <label className="form-field">
        <span>
          What business goal should this content and campaign support? *
        </span>
        <textarea
          className={`${fieldClass} min-h-28 resize-y`}
          minLength={20}
          name="goals"
          onChange={event => update("goals", event.target.value)}
          placeholder="Tell us about your audience, the business goal, and the customer path you want to improve."
          required
          value={form.goals}
        />
      </label>

      <label aria-hidden="true" className="hidden">
        Website
        <input
          autoComplete="off"
          name="website"
          onChange={event => update("website", event.target.value)}
          tabIndex={-1}
          value={form.website}
        />
      </label>

      <button
        className="group mt-2 flex w-full items-center justify-between bg-[#ffb627] px-6 py-5 text-left text-sm font-extrabold uppercase tracking-[0.16em] text-black transition-colors hover:bg-[#ffd072] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitInquiry.isPending}
        type="submit"
      >
        <span>
          {submitInquiry.isPending
            ? "Saving your consultation request"
            : "Schedule a consultation"}
        </span>
        {submitInquiry.isPending ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <ArrowUpRight
            className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
            size={21}
          />
        )}
      </button>
      <p className="text-xs leading-5 text-white/35">
        We’ll save your brief, email it to our team, then take you to the
        calendar to choose a consultation time.
      </p>
      <p className="text-xs leading-6 text-white/60">
        We use your details to respond to this request. See our{" "}
        <a
          href="/privacy-policy"
          className="text-[#ffb627] underline underline-offset-4"
        >
          Privacy Policy
        </a>
        . Providing a phone number does not enroll you in promotional texts.
      </p>
    </form>
  );
}
