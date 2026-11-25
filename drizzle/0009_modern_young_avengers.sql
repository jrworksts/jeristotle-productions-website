CREATE TABLE `creditUnionDailyRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`runDate` varchar(10) NOT NULL,
	`status` enum('started','complete','skipped','failed') NOT NULL DEFAULT 'started',
	`leaseToken` varchar(80),
	`leaseExpiresAt` timestamp,
	`newReserved` int NOT NULL DEFAULT 0,
	`newSent` int NOT NULL DEFAULT 0,
	`followupsSent` int NOT NULL DEFAULT 0,
	`repliesDetected` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creditUnionDailyRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditUnionCampaignRunDateUnique` UNIQUE(`campaignId`,`runDate`)
);
--> statement-breakpoint
ALTER TABLE `creditUnionCampaigns` ADD `lastReplyCheckAt` timestamp;--> statement-breakpoint
ALTER TABLE `creditUnionCampaigns` ADD `lastRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `creditUnionMessages` ADD `sendClaimToken` varchar(80);--> statement-breakpoint
ALTER TABLE `creditUnionMessages` ADD `sendClaimedAt` timestamp;--> statement-breakpoint
ALTER TABLE `creditUnionMessages` ADD `sendAttemptedAt` timestamp;