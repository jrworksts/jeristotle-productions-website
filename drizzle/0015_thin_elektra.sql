CREATE TABLE `growthReminderDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`localDate` varchar(10) NOT NULL,
	`actionId` int,
	`state` enum('pending','sending','sent','failed','uncertain') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`messageId` varchar(255),
	`error` text,
	`progressComplete` int,
	`failureAlertState` enum('pending','sending','sent','uncertain') NOT NULL DEFAULT 'pending',
	`failureMessageId` varchar(255),
	`ownerNotified` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `growthReminderDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `growthReminderTaskDateUnique` UNIQUE(`taskUid`,`localDate`)
);
