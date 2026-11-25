import { JERISTOTLE_EMAIL } from "@shared/const";
import { JERISTOTLE_LOGO_URL as logo } from "@shared/brandAssets";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import React, { useEffect } from "react";

const sections = [
  {
    id: "information",
    title: "Information we collect",
    paragraphs: [
      "When you request a consultation, submit a project brief or application, book a meeting, or contact us, we collect the information you provide. This may include your name, business name, email address, optional phone number, project interests, planned investment range, timeline, business goals, referral source, and correspondence.",
      "If you use an authenticated workspace, we also process account information such as your name, email address, sign-in identifier, and access permissions. Hosting and security providers may process technical information such as IP address, browser and device details, requested pages, and access logs. Our site analytics help us understand page visits, referral sources, and general website use.",
      "For business outreach, we may obtain publicly available professional information, including business names, work contact details, roles, websites, and relevant business activity. We also keep communication history and records of replies, delivery failures, and opt-out requests.",
      "Please do not include passwords, payment-card details, government identification numbers, health information, or other sensitive personal information in website forms. If a project requires sensitive information, we will agree on an appropriate process separately.",
    ],
  },
  {
    id: "use",
    title: "How we use information",
    paragraphs: [
      "We use information to respond to inquiries, evaluate project fit, arrange consultations, prepare proposals, provide agreed services, manage business relationships, and maintain our records. We also use it to operate and improve the website, protect our systems, comply with legal obligations, and honor communication preferences.",
      "We may use professional contact information for relevant business-to-business introductions and follow-up. Providing information through a form does not by itself enroll you in promotional text messages or authorize unrelated marketing. Any separate marketing consent or client permissions will be handled separately.",
    ],
  },
  {
    id: "sharing",
    title: "When information is shared",
    paragraphs: [
      "We do not sell personal information collected through this website. We share information with service providers as needed for hosting, data storage, authentication, email delivery, scheduling, analytics, customer-relationship management, and business administration. For example, contact details and project briefs may be stored in our lead records and delivered to the person handling your inquiry. Booking information is processed through our LeadConnector / HighLevel calendar.",
      "If you pay an invoice through a third-party payment provider such as Stripe, that provider processes your payment information under its own privacy notice. Our website inquiry forms do not collect card details.",
      "For an agreed project, relevant information may be shared with specialist production or marketing partners to perform the work. Public use of client stories, footage, testimonials, or likenesses is handled through separate project permissions, not granted by this privacy policy.",
      "We may disclose information when required by law, to protect legal rights or safety, or in connection with a business transfer subject to applicable protections. Mobile numbers and SMS opt-in information are not shared with third parties or affiliates for their marketing or promotional purposes. They may be shared with providers helping deliver authorized messages.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies, analytics, and embedded videos",
    paragraphs: [
      "Authentication features use cookies and browser storage to maintain secure sessions and account state. The site includes Umami analytics to understand website use. A privacy-focused analytics tool does not mean that all hosting, authentication, or third-party services are free of cookies or technical data processing.",
      "Our video previews load images from YouTube servers. The embedded video player loads when you choose to play a video and uses YouTube's privacy-enhanced domain. YouTube and Google may still receive technical information when an image or player loads and may process additional information during playback under their own policies. Privacy-enhanced mode does not make viewing anonymous or eliminate every third-party data transfer.",
      "The website also loads fonts from Google Fonts. Your browser connects to that provider to retrieve font files. You can control cookies and browser storage through your browser settings, although restricting them may affect sign-in or other features.",
    ],
  },
  {
    id: "communications",
    title: "Email and text-message choices",
    paragraphs: [
      "You can ask us to stop promotional emails by using an unsubscribe link where provided, replying with an opt-out request, or emailing us. We may retain a minimal suppression record so we do not contact you again. Opting out of promotional messages does not prevent necessary responses to a request you initiate or essential communication about an active project.",
      "If you separately opt in to a text-message program, its message purpose, frequency, and any applicable charges will be provided with that program. You can withdraw consent using its stated opt-out method, including replying STOP where supported. Listing a phone number in a project inquiry is not consent to automated promotional texts, and promotional SMS consent is not a condition of purchasing our services.",
    ],
  },
  {
    id: "retention",
    title: "Retention and security",
    paragraphs: [
      "We retain information for as long as reasonably needed for the purposes described here, including handling inquiries, fulfilling projects, keeping business and accounting records, resolving disputes, and honoring opt-outs. Retention varies with the type of record and applicable obligations. Deletion requests may be subject to these requirements, and backup copies may remain until their normal replacement cycle.",
      "We use reasonable administrative and technical safeguards to protect information and limit access to those who need it for their work. No internet transmission or storage system can be guaranteed completely secure. Our providers may process information in the United States or other countries where they operate.",
    ],
  },
  {
    id: "rights",
    title: "Privacy requests and your rights",
    paragraphs: [
      "You may contact us to ask what personal information we hold about you, request access or correction, request deletion, or withdraw a consent. Depending on your location and the law that applies, you may also have rights to receive a portable copy, opt out of certain processing, or appeal a denied request. Not every privacy law applies to every business or to professional contact information.",
      "Send a request to the email below with the subject Privacy request. You do not need to create an account. We may ask for information reasonably necessary to verify your identity and understand your request. Please do not send sensitive identity documents unless we have arranged a secure method.",
      "We will respond within the time required by applicable law. If we deny a request, you may reply with the subject Privacy appeal to request reconsideration. We will explain the decision and any applicable complaint route. We will not discriminate against you for exercising applicable privacy rights.",
    ],
  },
  {
    id: "scope",
    title: "Children, client projects, and other websites",
    paragraphs: [
      "This website is intended for businesses and adults, not children under 13. We do not knowingly collect personal information from children through this site. If you believe a child has provided information, contact us so we can review it and take appropriate action.",
      "This policy describes Jeristotle Productions' website and our own business communications. When we work on a client's website, campaign, or customer database under the client's instructions, the client's privacy notice and our agreed service terms may govern that activity. This policy does not grant permission to reuse private client or customer data.",
      "External booking pages, payment services, social platforms, and other linked websites have their own privacy practices. Review their notices when you use them.",
    ],
  },
  {
    id: "updates",
    title: "Updates to this policy",
    paragraphs: [
      "We may update this policy as our services or information practices change. The latest version will appear on this page with its last-updated date. Where required, we will provide additional notice or obtain consent for material changes before using information for a new purpose.",
    ],
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    const previousDescription = description?.content;
    const previousCanonical = canonical?.href;
    document.title = "Privacy Policy | Jeristotle Productions";
    description?.setAttribute(
      "content",
      "How Jeristotle Productions collects, uses, and protects information, and how to contact us about your privacy choices."
    );
    canonical?.setAttribute(
      "href",
      "https://jeristotleproductions.com/privacy-policy"
    );
    return () => {
      document.title = previousTitle;
      if (previousDescription !== undefined)
        description?.setAttribute("content", previousDescription);
      if (previousCanonical !== undefined)
        canonical?.setAttribute("href", previousCanonical);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-[#ffb627] focus:p-3 focus:text-black"
        href="#privacy-content"
      >
        Skip to privacy policy
      </a>
      <header className="border-b border-white/10">
        <div className="container flex min-h-[84px] items-center justify-between gap-4 py-4">
          <a href="/" aria-label="Jeristotle Productions home">
            <img
              src={logo}
              alt="Jeristotle Productions"
              className="h-12 w-12 object-contain"
            />
          </a>
          <a
            href="/"
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#ffb627] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to website
          </a>
        </div>
      </header>
      <main
        id="privacy-content"
        className="container pb-20 pt-14 sm:pb-28 sm:pt-20"
      >
        <div className="border-b border-white/15 pb-10 sm:pb-14">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#ffb627]">
            Jeristotle Productions / Your information
          </p>
          <h1 className="mt-6 font-display text-[clamp(3rem,8vw,6.5rem)] uppercase leading-[0.94] tracking-[-0.04em]">
            Privacy <span className="text-[#ffb627]">Policy</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
            How we handle information when you visit our website, contact us, or
            explore working with our Corpus Christi content and marketing team.
          </p>
          <p className="mt-6 text-xs text-white/60">
            Last updated: November 4, 2026
          </p>
        </div>
        <div className="grid gap-10 pt-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <nav
            aria-label="Privacy policy sections"
            className="self-start lg:sticky lg:top-8"
          >
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-[#ffb627]">
              On this page
            </p>
            <ol className="grid gap-3">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex gap-3 text-sm leading-6 text-white/65 hover:text-[#ffb627] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
                  >
                    <span className="font-mono text-xs text-[#ffb627]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#privacy-contact"
                  className="text-sm leading-6 text-[#ffb627] hover:text-white"
                >
                  Contact us
                </a>
              </li>
            </ol>
          </nav>
          <article className="min-w-0 max-w-3xl">
            <p className="mb-10 text-base leading-8 text-white/75">
              In this policy, “we,” “us,” and “our” mean Jeristotle Productions,
              based in Corpus Christi, Texas. This policy covers
              jeristotleproductions.com and our related business communications.
            </p>
            {sections.map((section, index) => (
              <section
                id={section.id}
                key={section.id}
                className="scroll-mt-8 border-t border-white/10 py-8 first:border-t-0 first:pt-0"
              >
                <h2 className="text-xl font-bold leading-8 text-white sm:text-2xl">
                  <span className="mr-3 font-mono text-sm text-[#ffb627]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.title}
                </h2>
                <div className="mt-5 space-y-5 text-base leading-8 text-white/75">
                  {section.paragraphs.map(paragraph => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.id === "cookies" && (
                  <p className="mt-5 text-sm leading-7 text-white/65">
                    Provider information:{" "}
                    <a
                      className="text-[#ffb627] underline underline-offset-4"
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Privacy Policy
                    </a>{" "}
                    and{" "}
                    <a
                      className="text-[#ffb627] underline underline-offset-4"
                      href="https://umami.is/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Umami documentation
                    </a>
                    .
                  </p>
                )}
                {section.id === "rights" && (
                  <p className="mt-5 text-sm leading-7 text-white/65">
                    Texas residents can learn about applicable privacy laws and
                    complaint options from the{" "}
                    <a
                      className="text-[#ffb627] underline underline-offset-4"
                      href="https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Texas Attorney General
                    </a>
                    .
                  </p>
                )}
              </section>
            ))}
            <section
              id="privacy-contact"
              className="mt-4 scroll-mt-8 border border-[#ffb627]/30 bg-[#ffb627]/5 p-6 sm:p-8"
            >
              <h2 className="text-2xl font-bold">Contact us about privacy</h2>
              <p className="mt-4 text-base leading-8 text-white/75">
                Jeremy Wells
                <br />
                Jeristotle Productions
                <br />
                Corpus Christi, Texas
              </p>
              <a
                className="mt-5 inline-flex max-w-full items-center gap-2 break-all text-base font-semibold text-[#ffb627] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffb627]"
                href={`mailto:${JERISTOTLE_EMAIL}?subject=Privacy%20request`}
              >
                {JERISTOTLE_EMAIL}
                <ArrowUpRight
                  size={16}
                  className="shrink-0"
                  aria-hidden="true"
                />
              </a>
            </section>
          </article>
        </div>
      </main>
      <footer className="border-t border-white/10 bg-black py-8">
        <div className="container flex flex-col gap-4 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Jeristotle Productions</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-6">
            <a href="/" className="hover:text-[#ffb627]">
              Home
            </a>
            <a
              href="/privacy-policy"
              aria-current="page"
              className="text-[#ffb627]"
            >
              Privacy Policy
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
