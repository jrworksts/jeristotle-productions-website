ALTER TABLE `chamberOutreachDailyRuns` ADD `leaseToken` varchar(64);--> statement-breakpoint
ALTER TABLE `chamberOutreachDailyRuns` ADD `leaseExpiresAt` timestamp(3);--> statement-breakpoint
ALTER TABLE `chamberOutreachDailyRuns` ADD `newReserved` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chamberOutreachMessages` ADD `sendClaimToken` varchar(64);--> statement-breakpoint
ALTER TABLE `chamberOutreachMessages` ADD `sendClaimedAt` timestamp(3);--> statement-breakpoint
ALTER TABLE `chamberOutreachMessages` ADD `sendAttemptedAt` timestamp(3);