CREATE TABLE `brandVideoDailyRuns` (
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
	CONSTRAINT `brandVideoDailyRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `brandVideoCampaignRunDateUnique` UNIQUE(`campaignId`,`runDate`)
);
--> statement-breakpoint
ALTER TABLE `brandVideoMessages` ADD `sendClaimToken` varchar(80);--> statement-breakpoint
ALTER TABLE `brandVideoMessages` ADD `sendClaimedAt` timestamp;--> statement-breakpoint
ALTER TABLE `brandVideoMessages` ADD `sendAttemptedAt` timestamp;