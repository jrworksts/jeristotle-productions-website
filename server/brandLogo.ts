import type { Request, Response } from "express";
import { JERISTOTLE_LOGO_STORAGE_KEY } from "../shared/brandAssets";
import { storageGetSignedUrl } from "./storage";

let cachedLogo: Buffer | undefined;
const MAX_LOGO_BYTES = 128 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function brandLogoHandler(_req: Request, res: Response) {
  try {
    if (!cachedLogo) {
      // No user-supplied path or URL is accepted. This is one public brand mark.
      const signedUrl = await storageGetSignedUrl(JERISTOTLE_LOGO_STORAGE_KEY);
      if (!signedUrl || new URL(signedUrl).protocol !== "https:") {
        throw new Error("Logo storage URL unavailable");
      }
      const upstream = await fetch(signedUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) throw new Error("Logo image unavailable");
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (
        bytes.length > MAX_LOGO_BYTES ||
        !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      ) {
        throw new Error("Invalid logo image");
      }
      cachedLogo = bytes;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.status(200).send(cachedLogo);
  } catch {
    // Do not reveal storage credentials, signed URLs or backend diagnostics.
    res.setHeader("Cache-Control", "no-store");
    res.status(503).send("Logo temporarily unavailable");
  }
}
