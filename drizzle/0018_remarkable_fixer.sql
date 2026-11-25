CREATE TABLE `training_outreach_daily_runs` (
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
	CONSTRAINT `training_outreach_daily_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainingOutreachCampaignRunDateUnique` UNIQUE(`campaignId`,`runDate`)
);
--> statement-breakpoint
UPDATE `training_outreach_campaigns` SET `dailyNewLimit` = 10 WHERE `dailyNewLimit` IS NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` MODIFY COLUMN `dailyNewLimit` int NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` MODIFY COLUMN `status` enum('draft','approved','scheduled','sent','cancelled','failed') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` MODIFY COLUMN `status` enum('review','approved','not_fit','replied','bounced','unsubscribed','meeting','complete') NOT NULL DEFAULT 'review';--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `autoApproveQualifiedProspects` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `sendHourLocal` int DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `timezone` varchar(80) DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `researchTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `researchWebhookUrl` text;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `researchLastRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `researchLeaseExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `runtimeVersion` varchar(100);--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `lastReplyCheckAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_campaigns` ADD `lastRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `scheduledAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `smtpAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `deliveredAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `sendClaimToken` varchar(80);--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `sendClaimedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `sendAttemptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_messages` ADD `error` text;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `outreachStatus` enum('draft','approved','scheduled','in_sequence','cancelled','complete') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `unsubscribeToken` varchar(64);--> statement-breakpoint
UPDATE `training_outreach_prospects` SET `unsubscribeToken` = LEFT(SHA2(CONCAT(UUID(), UUID()), 256), 48) WHERE `unsubscribeToken` IS NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` MODIFY COLUMN `unsubscribeToken` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `leadOutcome` enum('closed','not_closed');--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `notClosedReason` text;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `firstSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `lastSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `repliedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD `unsubscribedAt` timestamp;--> statement-breakpoint
ALTER TABLE `training_outreach_prospects` ADD CONSTRAINT `training_outreach_prospects_unsubscribeToken_unique` UNIQUE(`unsubscribeToken`);--> statement-breakpoint
CREATE INDEX `trainingOutreachResearchTaskUidIndex` ON `training_outreach_campaigns` (`researchTaskUid`);--> statement-breakpoint
CREATE INDEX `trainingOutreachResearchLeaseIndex` ON `training_outreach_campaigns` (`researchLeaseExpiresAt`);
