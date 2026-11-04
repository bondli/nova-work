-- 会员小程序互动功能迁移（签到 / 抽奖 / 积分兑换）
-- MySQL 8+，仅执行一次；本文件不会自动执行，请在数据库变更前人工审核并备份。
--
-- 说明：
-- 1. MemberDrawRecord 新增 requestId 列并建立 UNIQUE(phone, requestId)；
--    InnoDB 唯一索引允许多个 NULL，历史数据（requestId 为 NULL）可正常共存。
-- 2. 5 张新表结构与 nova-pos-server/src/model/schema.sql 保持一致。
-- 3. 末尾插入初始奖池 6 条与初始兑换礼品 4 条，重复执行会产生重复数据。

-- 1) 抽奖记录幂等标识
ALTER TABLE `MemberDrawRecord`
  ADD COLUMN `requestId` VARCHAR(64) NULL COMMENT '客户端请求幂等标识',
  ADD UNIQUE INDEX `uk_member_draw_phone_request` (`phone`, `requestId`);

-- 2) 新增表
CREATE TABLE IF NOT EXISTS `MemberIdentity` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `openid` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(20) NOT NULL COMMENT '会员手机号',
    `unionId` VARCHAR(64) NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_member_identity_openid` (`openid`),
    KEY `idx_member_identity_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MemberSignIn` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(20) NOT NULL,
    `signDate` DATE NOT NULL COMMENT '签到自然日',
    `points` INT NOT NULL DEFAULT 0,
    `streakDays` INT NOT NULL DEFAULT 1,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_member_sign_in_phone_date` (`phone`, `signDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `LotteryPrize` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL COMMENT '奖品名',
    `prizeType` VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT 'none / points / coupon',
    `points` INT DEFAULT 0 COMMENT 'points 类型发放积分',
    `couponCondition` DECIMAL(10,2) NULL COMMENT '券门槛',
    `couponValue` DECIMAL(10,2) NULL COMMENT '券面额',
    `couponDesc` VARCHAR(255) NULL,
    `couponValidDays` INT DEFAULT 30,
    `weight` INT NOT NULL DEFAULT 1 COMMENT '抽取权重',
    `stock` INT NULL COMMENT '库存，NULL 表示不限',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active / inactive',
    `sort` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_lottery_prize_status_sort` (`status`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RedeemItem` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `image` VARCHAR(255) DEFAULT '',
    `description` VARCHAR(255) NULL,
    `detail` TEXT NULL,
    `points` INT NOT NULL DEFAULT 0,
    `totalStock` INT NOT NULL DEFAULT 0,
    `stock` INT NOT NULL DEFAULT 0,
    `perMemberLimit` INT NOT NULL DEFAULT 1,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active / inactive',
    `sort` INT NOT NULL DEFAULT 0,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_redeem_item_status_sort` (`status`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RedeemOrder` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `orderNo` VARCHAR(32) NOT NULL COMMENT '兑换单号',
    `phone` VARCHAR(20) NOT NULL,
    `itemId` INT NOT NULL,
    `itemName` VARCHAR(64) NOT NULL,
    `itemImage` VARCHAR(255) DEFAULT '',
    `points` INT NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending_pickup' COMMENT 'pending_pickup / picked / cancelled / expired',
    `pickupCode` VARCHAR(8) NOT NULL COMMENT '6 位取货码',
    `expiredAt` DATETIME NOT NULL,
    `pickedAt` DATETIME NULL,
    `requestId` VARCHAR(64) NULL,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_redeem_order_no` (`orderNo`),
    UNIQUE KEY `uk_redeem_order_phone_request` (`phone`, `requestId`),
    KEY `idx_redeem_order_phone_status_created` (`phone`, `status`, `createdAt`),
    KEY `idx_redeem_order_pickup_code_status` (`pickupCode`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) 初始奖池（权重 40/25/15/8/8/4，stock 为 NULL 表示不限）
INSERT INTO `LotteryPrize`
  (`name`, `prizeType`, `points`, `couponCondition`, `couponValue`, `couponDesc`, `couponValidDays`, `weight`, `stock`, `status`, `sort`)
VALUES
  ('谢谢参与', 'none', 0, NULL, NULL, NULL, 30, 40, NULL, 'active', 1),
  ('10 积分', 'points', 10, NULL, NULL, NULL, 30, 25, NULL, 'active', 2),
  ('50 积分', 'points', 50, NULL, NULL, NULL, 30, 15, NULL, 'active', 3),
  ('100 积分', 'points', 100, NULL, NULL, NULL, 30, 8, NULL, 'active', 4),
  ('满 100 减 10 券', 'coupon', 0, 100.00, 10.00, '满 100 减 10 元券', 30, 8, NULL, 'active', 5),
  ('满 200 减 30 券', 'coupon', 0, 200.00, 30.00, '满 200 减 30 元券', 30, 4, NULL, 'active', 6);

-- 4) 初始兑换礼品（图片留空，由前端渐变兜底；兑换后 30 天内到店自提）
INSERT INTO `RedeemItem`
  (`name`, `image`, `description`, `detail`, `points`, `totalStock`, `stock`, `perMemberLimit`, `status`, `sort`)
VALUES
  ('儿童保温杯 450ml', '', '316 不锈钢 · 450ml', '兑换后 30 天内到店自提，逾期作废且积分不退', 800, 60, 18, 1, 'active', 1),
  ('纯棉浴巾', '', 'A 类纯棉 · 70×140cm', '兑换后 30 天内到店自提，逾期作废且积分不退', 1200, 50, 12, 1, 'active', 2),
  ('帆布托特包', '', '加厚帆布 · 大容量', '兑换后 30 天内到店自提，逾期作废且积分不退', 1500, 30, 6, 1, 'active', 3),
  ('晴雨两用伞', '', '黑胶防晒 · 折叠便携', '兑换后 30 天内到店自提，逾期作废且积分不退', 600, 80, 25, 1, 'active', 4);
