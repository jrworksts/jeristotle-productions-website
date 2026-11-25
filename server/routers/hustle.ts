import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../_core/trpc';
import { ENV } from '../_core/env';
import { getHustleWorkspace,prepareHustleReserve,updateHustleTracking,assignHustleEpisode } from '../hustleDb';
import { HUSTLE_STOP_STAGES } from '../../shared/hustleOutreach';
import { hustleExactPayloadSchema,previewHustleExactPayload,HUSTLE_EXACT_PAYLOAD_APPROVAL_BLOCKER } from '../hustleExactPayloadApproval';
import { sponsoredReviewBatchSchema, sponsoredReviewApprovalSchema } from '../../shared/hustleSponsoredReview';
import { stageHustleSponsoredReview, readHustleSponsoredReview, approveHustleSponsoredReview } from '../hustleSponsoredReviewDb';
import { registerHustleFirstBatch } from '../hustleFirstBatch';
const ownerProcedure=protectedProcedure.use(({ctx,next})=>{
 if(!ENV.ownerOpenId || ctx.user.openId!==ENV.ownerOpenId)throw new TRPCError({code:'FORBIDDEN',message:'Only Jeremy, the project owner, can access sponsorship outreach.'});
 return next({ctx});
});
export const hustleRouter=router({
 workspace:ownerProcedure.query(()=>getHustleWorkspace()),
 prepareReserve:ownerProcedure.mutation(()=>prepareHustleReserve()),
 // No caller actor, checksum, old template approval or cron can authorize these records.
 stageSponsoredReview:ownerProcedure.input(sponsoredReviewBatchSchema).mutation(({ctx,input})=>stageHustleSponsoredReview(ctx,input)),
 sponsoredReview:ownerProcedure.input(z.object({reviewId:z.string().regex(/^[a-f0-9]{48}$/)}).strict()).query(({ctx,input})=>readHustleSponsoredReview(ctx,input.reviewId)),
 approveSponsoredReview:ownerProcedure.input(sponsoredReviewApprovalSchema).mutation(({ctx,input})=>approveHustleSponsoredReview(ctx,input)),
 registerFirstBatch:ownerProcedure.input(z.object({reviewId:z.string().regex(/^[a-f0-9]{48}$/),reviewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).mutation(({ctx,input})=>registerHustleFirstBatch(ctx,input)),
 // Provisional strict hash preview only. No source-state assertion, signature, enrollment or DB writes.
 exactPayloadPreview:ownerProcedure.input(hustleExactPayloadSchema).query(({input})=>previewHustleExactPayload(input)),
 // The legacy prototype remains disabled. Use the real owner-authenticated sponsored-review operations above.
 approveExactPayload:ownerProcedure.input(z.object({payloadHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).mutation(()=>{
  throw new TRPCError({code:'PRECONDITION_FAILED',message:HUSTLE_EXACT_PAYLOAD_APPROVAL_BLOCKER});
 }),
 updateTracking:ownerProcedure.input(z.object({id:z.number().int().positive(),stage:z.enum(HUSTLE_STOP_STAGES).optional(),manualNotes:z.string().max(4000).optional()}).strict()).mutation(({input})=>updateHustleTracking(input)),
 assignEpisode:ownerProcedure.input(z.object({episodeNumber:z.number().int().min(1).max(24),prospectId:z.number().int().positive(),notes:z.string().trim().min(5).max(4000)}).strict()).mutation(({input})=>assignHustleEpisode(input)),
});
