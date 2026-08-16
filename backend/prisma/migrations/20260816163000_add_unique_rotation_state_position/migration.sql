-- Add unique constraint on rotation_states.position_id
ALTER TABLE `rotation_states` DROP INDEX `rotation_states_position_id_idx`;
ALTER TABLE `rotation_states` ADD UNIQUE INDEX `rotation_states_position_id_key` (`position_id`);