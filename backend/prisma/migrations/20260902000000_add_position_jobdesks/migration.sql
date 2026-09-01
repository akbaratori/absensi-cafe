-- Daftar jobdesk yang bisa dirotasi harian per posisi (mis. Kitchen).
-- Penugasan harian per staff disimpan di kolom user_schedules.kitchen_station
-- (sudah ada). Database production: MySQL.
CREATE TABLE IF NOT EXISTS `position_jobdesks` (
  `id`          INTEGER      NOT NULL AUTO_INCREMENT,
  `position_id` INTEGER      NOT NULL,
  `name`        VARCHAR(191) NOT NULL,
  `order_index` INTEGER      NOT NULL DEFAULT 0,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `position_jobdesks_position_id_name_key`(`position_id`, `name`),
  INDEX        `position_jobdesks_position_id_idx`(`position_id`),
  PRIMARY KEY  (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
