CREATE TABLE `sectorOutreachCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`campaignKey` enum('tourism','real_estate','industrial','healthcare') NOT NULL,
	`name` varchar(180) NOT NULL,
	`status` enum('review') NOT NULL DEFAULT 'review',
	`criteriaJson` text NOT NULL,
	`sequenceJson` text NOT NULL,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sectorOutreachCampaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `sectorGroupCampaignUnique` UNIQUE(`groupId`,`campaignKey`)
);
--> statement-breakpoint
CREATE TABLE `sectorOutreachEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`campaignKey` enum('tourism','real_estate','industrial','healthcare'),
	`eventKey` varchar(220) NOT NULL,
	`eventType` enum('draft_setup','review_notes_updated') NOT NULL,
	`detailJson` text NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sectorOutreachEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `sectorOutreachEvents_eventKey_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `sectorOutreachGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`status` enum('review') NOT NULL DEFAULT 'review',
	`timeZone` varchar(80) NOT NULL DEFAULT 'America/Chicago',
	`totalDailyCap` int NOT NULL DEFAULT 5,
	`includesFollowups` int NOT NULL DEFAULT 1,
	`followupBusinessDaysJson` text NOT NULL,
	`policyVersion` varchar(80) NOT NULL,
	`approvalAt` timestamp,
	`sendingEnabled` int NOT NULL DEFAULT 0,
	`researchEnabled` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sectorOutreachGroups_id` PRIMARY KEY(`id`),
	CONSTRAINT `sectorOutreachGroups_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `sectorOutreachMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`campaignKey` enum('tourism','real_estate','industrial','healthcare') NOT NULL,
	`prospectId` int NOT NULL,
	`messageNumber` int NOT NULL,
	`subject` varchar(240) NOT NULL,
	`textBody` text NOT NULL,
	`htmlBody` text NOT NULL,
	`status` enum('draft') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`replyAt` timestamp,
	`optoutAt` timestamp,
	`attemptedAt` timestamp,
	`smtpAcceptedAt` timestamp,
	`deliveredAt` timestamp,
	`bouncedAt` timestamp,
	`providerMessageId` varchar(255),
	`receiptJson` text,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sectorOutreachMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `sectorProspectMessageUnique` UNIQUE(`prospectId`,`messageNumber`)
);
--> statement-breakpoint
CREATE TABLE `sectorOutreachProspects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`campaignKey` enum('tourism','real_estate','industrial','healthcare') NOT NULL,
	`company` varchar(220) NOT NULL,
	`website` varchar(500),
	`contactName` varchar(180),
	`contactRole` varchar(220),
	`email` varchar(320),
	`emailSourceUrl` varchar(500),
	`emailSourceQuote` text,
	`roleSourceUrl` varchar(500),
	`phone` varchar(100),
	`phoneSourceUrl` varchar(500),
	`verifiedFact` text,
	`factSourceUrl` varchar(500),
	`personalization` text,
	`proposedAngle` text,
	`angleSourceUrl` varchar(500),
	`evidenceJson` text NOT NULL,
	`verifiedAt` timestamp,
	`qualification` enum('review','verification_needed','qualified','not_fit') NOT NULL DEFAULT 'review',
	`status` enum('review','replied','opted_out','bounced','stopped','meeting','complete') NOT NULL DEFAULT 'review',
	`replyAt` timestamp,
	`optoutAt` timestamp,
	`bounceAt` timestamp,
	`stoppedAt` timestamp,
	`nextAction` text,
	`manualNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sectorOutreachProspects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sectorMessageGroupCampaignIndex` ON `sectorOutreachMessages` (`groupId`,`campaignKey`);--> statement-breakpoint
CREATE INDEX `sectorProspectGroupCampaignIndex` ON `sectorOutreachProspects` (`groupId`,`campaignKey`);