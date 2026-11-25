CREATE TABLE `hustleCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'review',
	`configVersion` varchar(60) NOT NULL,
	`launchApprovedAt` timestamp,
	`schedulerTaskUid` varchar(65),
	`researchWebhookUrl` text,
	`researchRequestedAt` timestamp,
	`researchLeaseUntil` timestamp,
	`lastInboxScanAt` timestamp,
	`episodeGoal` int NOT NULL DEFAULT 24,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hustleCampaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `hustleCampaigns_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `hustleCampaigns_schedulerTaskUid_unique` UNIQUE(`schedulerTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `hustleEpisodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`seasonYear` int NOT NULL DEFAULT 2027,
	`episodeNumber` int NOT NULL,
	`sponsorProspectId` int,
	`status` varchar(30) NOT NULL DEFAULT 'unassigned',
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hustleEpisodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `hustleEpisodeSlotUnique` UNIQUE(`campaignId`,`seasonYear`,`episodeNumber`)
);
--> statement-breakpoint
CREATE TABLE `hustleEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`prospectId` int,
	`messageId` int,
	`eventKey` varchar(220) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`detailJson` text NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hustleEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `hustleEvents_eventKey_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `hustleMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`prospectId` int NOT NULL,
	`sequenceStep` int NOT NULL,
	`subject` varchar(240) NOT NULL,
	`textBody` text NOT NULL,
	`status` varchar(30) NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`claimToken` varchar(48),
	`attemptedAt` timestamp,
	`smtpAcceptedAt` timestamp,
	`providerMessageId` varchar(255),
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hustleMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `hustleProspectStepUnique` UNIQUE(`prospectId`,`sequenceStep`)
);
--> statement-breakpoint
CREATE TABLE `hustleProspects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`organizationKey` varchar(240) NOT NULL,
	`name` varchar(220) NOT NULL,
	`website` varchar(500) NOT NULL,
	`category` varchar(40) NOT NULL,
	`localEvidence` text NOT NULL,
	`localSourceUrl` varchar(500) NOT NULL,
	`contactName` varchar(180),
	`contactTitle` varchar(220),
	`recipientType` varchar(40) NOT NULL,
	`email` varchar(320),
	`emailSourceUrl` varchar(500),
	`emailSourceQuote` text,
	`roleSourceUrl` varchar(500),
	`phone` varchar(100),
	`phoneSourceUrl` varchar(500),
	`evidenceJson` text NOT NULL,
	`qualification` varchar(30) NOT NULL DEFAULT 'review',
	`holdReason` text,
	`stage` varchar(40) NOT NULL DEFAULT 'identified',
	`manualNotes` text,
	`unsubscribeToken` varchar(48) NOT NULL,
	`firstSentAt` timestamp,
	`lastSentAt` timestamp,
	`stoppedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hustleProspects_id` PRIMARY KEY(`id`),
	CONSTRAINT `hustleProspects_unsubscribeToken_unique` UNIQUE(`unsubscribeToken`),
	CONSTRAINT `hustleOrganizationUnique` UNIQUE(`campaignId`,`organizationKey`)
);
--> statement-breakpoint
CREATE INDEX `hustleMessageStatusIndex` ON `hustleMessages` (`campaignId`,`status`);--> statement-breakpoint
CREATE INDEX `hustleQualificationIndex` ON `hustleProspects` (`campaignId`,`qualification`);