// Cloudflare Pages Function: POST /api/inquiry
// Validates a consultation brief and forwards it to the HighLevel inbound
// webhook set in the HIGHLEVEL_WEBHOOK_URL environment variable.

const LIMITS = {
  fullName: [2, 120],
  businessName: [2, 160],
  email: [3, 320],
  phone: [0, 40],
  projectType: [2, 100],
  promotionGoal: [2, 140],
  investment: [2, 100],
  timeline: [2, 100],
  goals: [20, 3000],
  discoverySource: [0, 160],
};
const OPTIONAL = new Set(["phone", "discoverySource"]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }
  if (!input || typeof input !== "object") {
    return json(400, { ok: false, error: "Invalid body" });
  }

  // Honeypot: real visitors never fill the hidden "website" field.
  if (typeof input.website === "string" && input.website.length > 0) {
    return json(200, { ok: true });
  }

  const data = {};
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    const raw = input[field];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value && OPTIONAL.has(field)) continue;
    if (value.length < min || value.length > max) {
      return json(400, { ok: false, error: `Invalid ${field}` });
    }
    data[field] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return json(400, { ok: false, error: "Invalid email" });
  }

  const webhook = env.HIGHLEVEL_WEBHOOK_URL;
  if (!webhook) {
    console.error("[inquiry] HIGHLEVEL_WEBHOOK_URL is not set");
    return json(503, { ok: false, error: "Inquiry delivery is not configured" });
  }

  const [firstName, ...rest] = data.fullName.split(/\s+/);
  const payload = {
    // Standard contact fields HighLevel maps automatically
    first_name: firstName,
    last_name: rest.join(" "),
    full_name: data.fullName,
    email: data.email,
    phone: data.phone || "",
    company_name: data.businessName,
    source: "jeristotleproductions.com consultation form",
    // Project brief (map these to custom fields in the HighLevel workflow)
    project_type: data.projectType,
    promotion_goal: data.promotionGoal,
    investment: data.investment,
    timeline: data.timeline,
    goals: data.goals,
    discovery_source: data.discoverySource || "",
    submitted_at: new Date().toISOString(),
  };

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("[inquiry] HighLevel webhook failed", response.status);
    return json(502, { ok: false, error: "Delivery failed" });
  }
  return json(200, { ok: true });
}

export function onRequest() {
  return json(405, { ok: false, error: "Method not allowed" });
}
