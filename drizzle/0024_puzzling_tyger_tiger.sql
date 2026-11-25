ALTER TABLE `sectorOutreachCampaigns` MODIFY COLUMN `status` enum('review','active','paused','archived') NOT NULL DEFAULT 'review';--> statement-breakpoint
ALTER TABLE `sectorOutreachEvents` MODIFY COLUMN `eventType` enum('draft_setup','review_notes_updated','policy_updated','activation','archived','research_requested','research_request_uncertain','research_claim','research_finished','research_import','reserve_prepared','prospect_stopped','message_attempt','smtp_accepted','smtp_uncertain','maintenance_result') NOT NULL;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` MODIFY COLUMN `status` enum('review','active','paused','archived') NOT NULL DEFAULT 'review';--> statement-breakpoint
ALTER TABLE `sectorOutreachMessages` MODIFY COLUMN `status` enum('draft','approved','claimed','sent','uncertain','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` MODIFY COLUMN `status` enum('review','replied','opted_out','bounced','stopped','meeting','complete','ready','contacted') NOT NULL DEFAULT 'review';--> statement-breakpoint
ALTER TABLE `sectorOutreachCampaigns` ADD `schedulerTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `sectorOutreachCampaigns` ADD `lastInboxScanAt` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachCampaigns` ADD `reserveTarget` int DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `runtimeVersion` varchar(80);--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `approvedCopyVersion` varchar(80);--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `researchWebhookUrl` text;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `researchLeaseToken` varchar(64);--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `researchRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachGroups` ADD `researchLeaseUntil` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachMessages` ADD `claimToken` varchar(64);--> statement-breakpoint
ALTER TABLE `sectorOutreachMessages` ADD `claimedAt` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachMessages` ADD `attemptDate` varchar(10);--> statement-breakpoint
ALTER TABLE `sectorOutreachMessages` ADD `copyVersion` varchar(80);--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` ADD `identityKey` varchar(220);--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` ADD `holdReason` text;--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` ADD `firstSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` ADD `lastSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `sectorOutreachCampaigns` ADD CONSTRAINT `sectorSchedulerTaskUnique` UNIQUE(`schedulerTaskUid`);--> statement-breakpoint
ALTER TABLE `sectorOutreachProspects` ADD CONSTRAINT `sectorGroupIdentityUnique` UNIQUE(`groupId`,`identityKey`);