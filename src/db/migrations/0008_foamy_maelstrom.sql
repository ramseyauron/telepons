CREATE TABLE `token_volume_totals` (
	`token_address` text PRIMARY KEY NOT NULL,
	`pool_address` text NOT NULL,
	`buy_volume_wei` text DEFAULT '0' NOT NULL,
	`sell_volume_wei` text DEFAULT '0' NOT NULL,
	`gross_volume_wei` text DEFAULT '0' NOT NULL,
	`net_flow_wei` text DEFAULT '0' NOT NULL,
	`buy_count` integer DEFAULT 0 NOT NULL,
	`sell_count` integer DEFAULT 0 NOT NULL,
	`trade_count` integer DEFAULT 0 NOT NULL,
	`first_trade_block` integer,
	`last_trade_block` integer,
	`updated_at` integer NOT NULL
);
