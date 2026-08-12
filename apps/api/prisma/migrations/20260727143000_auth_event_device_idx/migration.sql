-- Speed up bootstrap device reuse / daily caps
CREATE INDEX `user_auth_events_device_id_hash_created_at_idx` ON `user_auth_events`(`device_id_hash`, `created_at`);
