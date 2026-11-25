CREATE TABLE `chamberReminderSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`recipient` varchar(320) NOT NULL,
	`cronExpression` varchar(80) NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`lastSentDate` varchar(10),
	`lastTaskId` int,
	`lastMessageId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chamberReminderSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `chamberReminderSchedules_name_unique` UNIQUE(`name`),
	CONSTRAINT `chamberReminderSchedules_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`)
);
