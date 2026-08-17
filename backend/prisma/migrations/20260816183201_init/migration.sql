-- CreateTable
CREATE TABLE `habits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `unit` VARCHAR(32) NOT NULL DEFAULT 'times',
    `target` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_habits_user`(`user_id`, `archived_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `habit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `habit_id` INTEGER NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `log_date` DATE NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `logged_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_logs_user_date`(`user_id`, `log_date`),
    UNIQUE INDEX `uniq_habit_day`(`habit_id`, `log_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `habit_logs` ADD CONSTRAINT `habit_logs_habit_id_fkey` FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints Prisma's schema language cannot express, added by hand.
-- A habit with a non-positive target would make every day trivially complete,
-- and a negative log value is never meaningful.
ALTER TABLE `habits` ADD CONSTRAINT `chk_habits_target_positive` CHECK (`target` > 0);
ALTER TABLE `habit_logs` ADD CONSTRAINT `chk_logs_value_non_negative` CHECK (`value` >= 0);
