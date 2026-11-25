import { trpc } from "@/lib/trpc";
import {
  BRAND_REFRESH_OFFER,
  BRAND_REFRESH_TIMELINES,
  buildBrandRefreshInquiry,
  type BrandRefreshApplication,
} from "@shared/brandRefresh";
import { continueToConsultationCalendar } from "@shared/consultation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

const initialApplication: BrandRefreshApplication = {
  fullName: "",
  businessName: "",
  email: "",
  phone: "",
  timeline: "",
  goals: "",
  discoverySource: "",
  website: "",
};

const fieldClass =
  "w-full border-0 border-b border-white/20 bg-transparent px-0 py-3 text-[15px] text-white outline-none transition-colors placeholder:text-white/32 focus:border-[#ffb627] focus:ring-0";

export default function BrandRefreshForm() {
  const [form, setForm] = useState<BrandRefreshApplication>(() => ({
    ...initialApplication,
  }));
  const [submitted, setSubmitted] = useState(false);

  const submitInquiry = trpc.inquiries.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setForm({ ...initialApplication });
      continueToConsultationCalendar();
    },
    onError: () =>
      toast.error(
        "We could not send that yet. Please check your details and try again."
      ),
  });

  const update = (field: keyof BrandRefreshApplication, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitInquiry.mutate(buildBrandRefreshInquiry(form));
  };

  if (submitted) {
    return (
      <div className="flex min-h-[520px] flex-col justify-between border border-[#ffb627]/35 bg-[#0b0b0b] p-7 sm:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ffb627] text-black">
          <Check size={22} strokeWidth={2.5} />
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.26em] text-[#ffb627]">
            Application received
          </p>
          <h3 className="font-display text-5xl uppercase leading-[0.86] text-white sm:text-6xl">
            Your 2027 refresh is in motion.
          </h3>
          <p className="mt-6 max-w-md text-base leading-7 text-white/60">
            We will review your business, goals, and timeline.
            <br />
            Then we will follow up with the clearest next step.
          </p>
        </div>
        <button
          className="w-fit text-xs font-bold uppercase tracking-[0.2em] text-white underline decoration-[#ffb627] underline-offset-8"
          onClick={() => setSubmitted(false)}
          type="button"
        >
          Submit another application
        </button>
      </div>
    );
  }

  return (
    <form className="grid gap-x-7 gap-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-7">
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

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-7">
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

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-7">
        <label className="form-field">
          <span>Production timeline *</span>
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
            {BRAND_REFRESH_TIMELINES.map(timeline => (
              <option key={timeline} value={timeline}>
                {timeline}
              </option>
            ))}
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
        <span>What should your new content help accomplish? *</span>
        <textarea
          className={`${fieldClass} min-h-32 resize-y`}
          minLength={20}
          name="goals"
          onChange={event => update("goals", event.target.value)}
          placeholder="Tell us what is changing in the business, who you need to reach, and what a successful 2027 would look like."
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
        className="group flex w-full items-center justify-between bg-[#ffb627] px-6 py-5 text-left text-sm font-extrabold uppercase tracking-[0.16em] text-black hover:bg-[#ffd072] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitInquiry.isPending}
        type="submit"
      >
        <span>
          {submitInquiry.isPending ? "Sending application" : "Apply now"}
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
      <p className="border-l-2 border-[#ffb627] bg-[#ffb627]/10 px-4 py-3 text-sm font-semibold leading-6 text-white/78">
        Only {BRAND_REFRESH_OFFER.spots} businesses will be accepted.
        <br />
        After submitting, choose a consultation time on our calendar. We review
        each application for fit before confirming a production spot.
      </p>
      <p className="text-xs leading-6 text-white/60">
        We use your details to respond to this application. See our{" "}
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
