import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { chamberOutreachUnsubscribeHandler } from "./outreachUnsubscribe";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const app = express();
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || "127.0.0.1";
const staticRoot =
  process.env.STATIC_ROOT || path.resolve(process.cwd(), "dist", "public");

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "jeristotle-productions" });
});

app.get("/unsubscribe/:token", chamberOutreachUnsubscribeHandler);
app.post("/unsubscribe/:token", chamberOutreachUnsubscribeHandler);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }): TrpcContext => ({ req, res, user: null }),
  })
);

if (!fs.existsSync(staticRoot)) {
  throw new Error(`Static site not found at ${staticRoot}`);
}

app.use(
  express.static(staticRoot, {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  })
);

app.get("*", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

app.listen(port, host, () => {
  console.log(`Jeristotle self-hosted service ready on ${host}:${port}`);
});
