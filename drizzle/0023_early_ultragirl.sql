ALTER TABLE `sectorOutreachEvents` MODIFY COLUMN `eventType` enum('draft_setup','review_notes_updated','policy_updated') NOT NULL;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` MODIFY COLUMN `totalDailyCap` int;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` MODIFY COLUMN `includesFollowups` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sectorOutreachCampaigns` ADD `dailyNewLimit` int DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `capScope` varchar(50) DEFAULT 'per_campaign_new' NOT NULL;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `sendSevenDays` int DEFAULT 1 NOT NULL;