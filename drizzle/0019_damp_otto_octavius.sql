CREATE TABLE `outreachAlertMonitors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`status` enum('paused','active') NOT NULL DEFAULT 'paused',
	`scheduleCronTaskUid` varchar(65),
	`activatedAt` timestamp,
	`lastCheckedAt` timestamp,
	`lastErrorCode` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outreachAlertMonitors_id` PRIMARY KEY(`id`),
	CONSTRAINT `outreachAlertMonitors_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `outreachAlertMonitors_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `outreachDeliveryAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dedupeKey` varchar(200) NOT NULL,
	`campaignKey` varchar(32) NOT NULL,
	`localDate` varchar(10) NOT NULL,
	`kind` varchar(80) NOT NULL,
	`label` varchar(140) NOT NULL,
	`detail` text NOT NULL,
	`newAccepted` int NOT NULL DEFAULT 0,
	`followupAccepted` int NOT NULL DEFAULT 0,
	`readyCount` int,
	`emailState` enum('pending','sending','sent','uncertain') NOT NULL DEFAULT 'pending',
	`emailAttemptedAt` timestamp,
	`emailAcceptedAt` timestamp,
	`emailMessageId` varchar(255),
	`ownerState` enum('pending','sending','sent','uncertain') NOT NULL DEFAULT 'pending',
	`ownerNotifiedAt` timestamp,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outreachDeliveryAlerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `outreachDeliveryAlerts_dedupeKey_unique` UNIQUE(`dedupeKey`)
);
