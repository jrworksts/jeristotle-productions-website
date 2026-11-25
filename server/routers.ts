import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { createProjectInquiry } from "./db";
import { sendInquiryEmail } from "./inquiryEmail";
import { chamberRouter } from "./routers/chamber";
import { creditUnionRouter } from "./routers/creditUnion";
import { brandVideoRouter } from "./routers/brandVideo";
import { trainingRouter } from "./routers/training";
import { growthRouter } from "./routers/growth";
import { outreachAlertsRouter } from "./routers/outreachAlerts";
import { z } from "zod";
import { hustleRouter } from "./routers/hustle";
import { sectorRouter } from "./routers/sectors";
import { outreachRepairsRouter } from "./routers/outreachRepairs";

const inquiryInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional(),
  projectType: z.string().trim().min(2).max(100),
  promotionGoal: z.string().trim().min(2).max(140),
  investment: z.string().trim().min(2).max(100),
  timeline: z.string().trim().min(2).max(100),
  goals: z.string().trim().min(20).max(3000),
  discoverySource: z.string().trim().max(160).optional(),
  website: z.string().max(0).optional(),
});

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  inquiries: router({
    submit: publicProcedure.input(inquiryInput).mutation(async ({ input }) => {
      const { website: _website, ...inquiry } = input;
      const result = await createProjectInquiry(inquiry);

      try {
        const emailResult = await sendInquiryEmail(inquiry);
        if (emailResult.configured && emailResult.sent) {
          console.log(`[Inquiries] HTML email sent: ${emailResult.messageId}`);
        }
      } catch (error) {
        console.warn(
          "[Inquiries] HTML email unavailable; inquiry was preserved.",
          error
        );
      }

      try {
        await notifyOwner({
          title: `New Jeristotle inquiry: ${inquiry.businessName}`,
          content: [
            `${inquiry.fullName} submitted a new production inquiry.`,
            `Email: ${inquiry.email}`,
            `Phone: ${inquiry.phone || "Not provided"}`,
            `Project: ${inquiry.projectType}`,
            `Promotion goal: ${inquiry.promotionGoal}`,
            `Investment: ${inquiry.investment}`,
            `Timeline: ${inquiry.timeline}`,
            `Goals: ${inquiry.goals}`,
            `Lead source: ${inquiry.discoverySource || "Not provided"}`,
          ].join("\n"),
        });
      } catch (error) {
        console.warn(
          "[Inquiries] Owner notification unavailable; inquiry was preserved.",
          error
        );
      }

      return { success: true, inquiryId: result.id } as const;
    }),
  }),
  chamber: chamberRouter,
  creditUnion: creditUnionRouter,
  brandVideo: brandVideoRouter,
  training: trainingRouter,
  growth: growthRouter,
  outreachAlerts: outreachAlertsRouter,
  hustle: hustleRouter,
  sectors: sectorRouter,
  outreachRepairs: outreachRepairsRouter,
});

export type AppRouter = typeof appRouter;
