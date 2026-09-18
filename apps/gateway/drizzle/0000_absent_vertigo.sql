CREATE TABLE `account_rate_limits` (
	`account_id` text NOT NULL,
	`window_name` text NOT NULL,
	`utilization` real NOT NULL,
	`resets_at` integer NOT NULL,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `window_name`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`adapter_id` text NOT NULL,
	`name` text NOT NULL,
	`sandbox_dir` text NOT NULL,
	`max_concurrent` integer DEFAULT 1 NOT NULL,
	`cooldown_until` integer,
	`cooldown_reason` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `group_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`tier` integer DEFAULT 1 NOT NULL,
	`account_id` text,
	`adapter_id` text NOT NULL,
	`model_id` text NOT NULL,
	`effort_override` text,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_effort` text,
	`allow_tools` integer DEFAULT false NOT NULL,
	`cache_ttl_sec` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text NOT NULL,
	`dialect` text NOT NULL,
	`model_requested` text NOT NULL,
	`group_id` text,
	`account_id` text,
	`adapter_id` text,
	`model_executed` text,
	`status` text NOT NULL,
	`error_kind` text,
	`input_tokens` integer,
	`cached_input_tokens` integer,
	`cache_write_tokens` integer,
	`output_tokens` integer,
	`reasoning_tokens` integer,
	`cost_usd` real,
	`ttft_ms` integer,
	`duration_ms` integer,
	`session_reused` integer,
	`failover_count` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `response_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`body_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`adapter_id` text NOT NULL,
	`model_id` text NOT NULL,
	`cli_session_id` text NOT NULL,
	`turns` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
