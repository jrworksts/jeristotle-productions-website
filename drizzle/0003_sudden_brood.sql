CREATE TABLE `chamberActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`phase` enum('first_30','days_31_60','days_61_90') NOT NULL,
	`category` varchar(80) NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text NOT NULL,
	`owner` varchar(100) NOT NULL,
	`sortOrder` int NOT NULL,
	`status` enum('not_started','in_progress','blocked','complete') NOT NULL DEFAULT 'not_started',
	`dueDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberActions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberActions_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `chamberBenefits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name` varchar(180) NOT NULL,
	`benefitGroup` varchar(80) NOT NULL,
	`allowance` int NOT NULL DEFAULT 1,
	`used` int NOT NULL DEFAULT 0,
	`status` enum('not_started','scheduled','in_progress','complete') NOT NULL DEFAULT 'not_started',
	`activation` text NOT NULL,
	`metric` text NOT NULL,
	`notes` text,
	`officialUrl` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberBenefits_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberBenefits_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `chamberEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(220) NOT NULL,
	`eventDate` timestamp NOT NULL,
	`category` varchar(100) NOT NULL,
	`url` varchar(500) NOT NULL,
	`strategicGoal` text NOT NULL,
	`status` enum('considering','planned','attended','skipped') NOT NULL DEFAULT 'considering',
	`contactsCount` int NOT NULL DEFAULT 0,
	`meetingsBooked` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberEvents_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `chamberProspects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`priority` int NOT NULL,
	`name` varchar(220) NOT NULL,
	`category` varchar(140) NOT NULL,
	`website` varchar(500),
	`email` text,
	`phone` varchar(160),
	`contactPerson` text,
	`address` text,
	`fit` enum('high','medium') NOT NULL DEFAULT 'medium',
	`sourceUrl` varchar(500) NOT NULL,
	`stage` enum('identified','researching','contacted','meeting','brand_refresh_proposal','brand_refresh_client','monthly_conversation','monthly_client','nurture','not_fit') NOT NULL DEFAULT 'identified',
	`lastContact` timestamp,
	`nextFollowup` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberProspects_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberProspects_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `chamberWeeklyScores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` timestamp NOT NULL,
	`eventsAttended` int NOT NULL DEFAULT 0,
	`targetConversations` int NOT NULL DEFAULT 0,
	`decisionMakersFound` int NOT NULL DEFAULT 0,
	`followupsCompleted` int NOT NULL DEFAULT 0,
	`meetingsBooked` int NOT NULL DEFAULT 0,
	`brandRefreshProposals` int NOT NULL DEFAULT 0,
	`brandRefreshClients` int NOT NULL DEFAULT 0,
	`monthlyConversations` int NOT NULL DEFAULT 0,
	`monthlyClients` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberWeeklyScores_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberWeeklyScores_weekStart_unique` UNIQUE(`weekStart`)
);
