import type { Request, Response } from "express";
import { unsubscribeBrandVideoByToken } from "./brandVideoSendingDb";

function page(title: string, message: string, token?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px Arial;color:#181818;background:#f4f1e9"><main style="max-width:620px;margin:10vh auto;padding:40px;background:white"><h1>${title}</h1><p>${message}</p>${token ? `<form method="post" action="/brand-video-unsubscribe/${token}"><button type="submit" style="padding:12px 20px">Unsubscribe from Brand Video emails</button></form>` : ""}</main></body></html>`;
}

/** GET is confirmation only (link scanners cannot opt a contact out); POST supports RFC 8058. */
export async function brandVideoUnsubscribeHandler(
  req: Request,
  res: Response
) {
  const token = String(req.params.token || "").toLowerCase();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return res
      .status(404)
      .type("html")
      .send(page("Link not found", "This unsubscribe link is not valid."));
  }
  if (req.method === "GET") {
    return res
      .status(200)
      .type("html")
      .send(
        page(
          "Stop Brand Video emails?",
          "Confirm below to stop additional Brand Video outreach emails. No other campaign is changed.",
          token
        )
      );
  }
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  try {
    const removed = await unsubscribeBrandVideoByToken(token);
    if (!removed)
      return res
        .status(404)
        .type("html")
        .send(page("Link not found", "This unsubscribe link is not valid."));
    return res
      .status(200)
      .type("html")
      .send(
        page(
          "You are unsubscribed.",
          "We will not send additional Brand Video outreach emails to this address."
        )
      );
  } catch (error) {
    console.error("[BrandVideoUnsubscribe] Opt-out could not be saved:", error);
    return res
      .status(500)
      .json({
        error:
          "Could not save your opt-out. Please reply unsubscribe to the email, or retry this link.",
      });
  }
}
