CREATE TABLE `projectInquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(120) NOT NULL,
	`businessName` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(40),
	`projectType` varchar(100) NOT NULL,
	`investment` varchar(100) NOT NULL,
	`timeline` varchar(100) NOT NULL,
	`goals` text NOT NULL,
	`discoverySource` varchar(160),
	`status` enum('new','contacted','qualified','closed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projectInquiries_id` PRIMARY KEY(`id`)
);
