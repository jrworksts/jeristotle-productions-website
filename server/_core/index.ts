import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { chamberOutreachDailyHandler } from "../outreachAutomation";
import { creditUnionScheduledHandler } from "../creditUnionAutomation";
import { brandVideoScheduledHandler } from "../brandVideoAutomation";
import { brandVideoUnsubscribeHandler } from "../brandVideoUnsubscribe";
import { trainingScheduledHandler } from "../trainingAutomation";
import { trainingResearchScheduledHandler } from "../trainingResearch";
import { hustleScheduledHandler, hustleUnsubscribeHandler } from "../hustleAutomation";
import { hustleFirstBatchScheduledHandler } from "../hustleFirstBatch";
import { sectorScheduledHandler } from "../sectorAutomation";
import { trainingUnsubscribeHandler } from "../trainingUnsubscribe";
import { outreachAlertsScheduledHandler } from "../outreachAlerts";
import { chamberOutreachRecapHandler } from "../outreachRecap";
import { chamberOutreachUnsubscribeHandler } from "../outreachUnsubscribe";
import { chamberTaskReminderHandler } from "../chamberReminder";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { brandLogoHandler } from "../brandLogo";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/brand-logo", brandLogoHandler);
  app.post("/api/scheduled/chamber-task-reminder", chamberTaskReminderHandler);
  app.post("/api/scheduled/chamber-outreach", chamberOutreachDailyHandler);
  app.post("/api/scheduled/credit-union-outreach", creditUnionScheduledHandler);
  app.post("/api/scheduled/brand-video-outreach", brandVideoScheduledHandler);
  app.get("/brand-video-unsubscribe/:token", brandVideoUnsubscribeHandler);
  app.post("/brand-video-unsubscribe/:token", brandVideoUnsubscribeHandler);
  app.post("/api/scheduled/training-outreach", trainingScheduledHandler);
  app.post(
    "/api/scheduled/training-research",
    trainingResearchScheduledHandler
  );
  app.get("/training-unsubscribe/:token", trainingUnsubscribeHandler);
  app.post("/training-unsubscribe/:token", trainingUnsubscribeHandler);
  app.post("/api/scheduled/outreach-alerts", outreachAlertsScheduledHandler);
  app.post("/api/scheduled/hustle-outreach", hustleScheduledHandler);
  app.post("/api/scheduled/hustle-first-batch", hustleFirstBatchScheduledHandler);
  app.get("/hustle-unsubscribe/:token", hustleUnsubscribeHandler);
  app.post("/hustle-unsubscribe/:token", hustleUnsubscribeHandler);
  app.post("/api/scheduled/sector-outreach", sectorScheduledHandler);
  app.post(
    "/api/scheduled/chamber-outreach-recap",
    chamberOutreachRecapHandler
  );
  app.get("/unsubscribe/:token", chamberOutreachUnsubscribeHandler);
  app.post("/unsubscribe/:token", chamberOutreachUnsubscribeHandler);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
