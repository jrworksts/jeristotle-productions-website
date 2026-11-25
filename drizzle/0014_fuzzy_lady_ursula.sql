CREATE TABLE `growthDailyChecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localDate` varchar(10) NOT NULL,
	`routineSlug` varchar(100) NOT NULL,
	`complete` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `growthDailyChecks_id` PRIMARY KEY(`id`),
	CONSTRAINT `growthDailyDateRoutineUnique` UNIQUE(`localDate`,`routineSlug`)
);
