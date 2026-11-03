CREATE TABLE `earmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_name` text NOT NULL,
	`recipient_name` text NOT NULL,
	`sentence` text NOT NULL,
	`contract` text NOT NULL,
	`contract_hash` text,
	`cap_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`frozen` integer DEFAULT false NOT NULL,
	`paypal_order_id` text,
	`authorization_id` text,
	`authorized_at` integer,
	`expires_at` integer NOT NULL,
	`captured_minor` integer DEFAULT 0 NOT NULL,
	`released_minor` integer DEFAULT 0 NOT NULL,
	`recipient_confirmed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`earmark_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_earmark_seq_uq` ON `events` (`earmark_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_earmark_idx` ON `events` (`earmark_id`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`paypal_email` text NOT NULL,
	`public_key` text,
	`verified` integer DEFAULT false NOT NULL,
	`country` text DEFAULT 'KE' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`earmark_id` text NOT NULL,
	`source` text NOT NULL,
	`file_hash` text NOT NULL,
	`invoice_number` text,
	`institution_id` text,
	`payee_name` text,
	`payee_account` text,
	`amount_minor` integer,
	`currency` text,
	`extracted` text,
	`signature` text,
	`verdict` text NOT NULL,
	`reasons` text NOT NULL,
	`approved_by` text,
	`storage_path` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`earmark_id`) REFERENCES `earmarks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_file_hash_uq` ON `invoices` (`file_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_inst_num_uq` ON `invoices` (`institution_id`,`invoice_number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`earmark_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`capture_id` text,
	`payout_batch_id` text,
	`payout_item_id` text,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoice_uq` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_ticket_uq` ON `payments` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`earmark_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`payee_email` text NOT NULL,
	`mac` text NOT NULL,
	`expires_at` integer NOT NULL,
	`redeemed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`verified` integer NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL
);
