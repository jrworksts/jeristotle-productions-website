import type { Request, Response } from "express";
import { unsubscribeByToken } from "./outreachDb";

function page(title: string, message: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#f4f1e9;color:#181818;font-family:Arial,Helvetica,sans-serif;">
    <main style="max-width:620px;margin:10vh auto;padding:44px;background:#ffffff;border-top:8px solid #ffb627;box-shadow:0 16px 50px rgba(36,31,20,.1);">
      <p style="margin:0 0 12px;color:#9b6a00;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Jeristotle Productions</p>
      <h1 style="margin:0 0 16px;font-size:36px;line-height:1.05;">${title}</h1>
      <p style="margin:0;color:#625c52;font-size:17px;line-height:1.65;">${message}</p>
    </main>
  </body>
</html>`;
}

export async function chamberOutreachUnsubscribeHandler(
  req: Request,
  res: Response
) {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    return res
      .status(404)
      .type("html")
      .send(page("Link not found", "This unsubscribe link is not valid."));
  }
  const removed = await unsubscribeByToken(token);
  if (!removed) {
    return res
      .status(404)
      .type("html")
      .send(page("Link not found", "This unsubscribe link is not valid."));
  }
  return res
    .status(200)
    .type("html")
    .send(
      page(
        "You are unsubscribed.",
        "We will not send additional marketing email to this address."
      )
    );
}
