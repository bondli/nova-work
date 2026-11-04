-- nova-pos-server 数据库结构参考（MySQL 8+）
-- 注意：本文件仅用于新建库时参考，默认不包含 DROP TABLE，避免误删生产数据。
-- 已存在库的结构变更请使用 migrations/ 下的增量脚本。

-- 用户表
CREATE TABLE IF NOT EXISTS `User` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `avatar` VARCHAR(255),
    `name` VARCHAR(255) NOT NULL,
    `realName` VARCHAR(255),
    `password` VARCHAR(255) NOT NULL DEFAULT '123456',
    `role` VARCHAR(255) NOT NULL DEFAULT 'clerk',
    `email` VARCHAR(255),
    `status` VARCHAR(255) NOT NULL DEFAULT 'normal',
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单表
CREATE TABLE IF NOT EXISTS `Order` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `orderSn` VARCHAR(255) NOT NULL,
    `orderStatus` VARCHAR(255) NOT NULL,
    `orderType` VARCHAR(255) NOT NULL DEFAULT 'sale',
    `orderItems` INT DEFAULT 0,
    `originalAmount` DECIMAL(10,2) DEFAULT 0,
    `orderAmount` DECIMAL(10,2) DEFAULT 0,
    `orderActualAmount` DECIMAL(10,2) DEFAULT 0,
    `payType` VARCHAR(255) DEFAULT 'other',
    `userPhone` VARCHAR(255) DEFAULT '',
    `usePoint` INT DEFAULT 0,
    `useBalance` DECIMAL(10,2) DEFAULT 0,
    `useCoupon` DECIMAL(10,2) DEFAULT 0,
    `salerId` INT NOT NULL DEFAULT 0,
    `salerName` VARCHAR(255) DEFAULT '',
    `remark` VARCHAR(255) DEFAULT '',
    `source` VARCHAR(255) DEFAULT 'inshop',
    `extra` TEXT,
    `showStatus` VARCHAR(255) DEFAULT 'normal',
    `printStatus` VARCHAR(255) DEFAULT 'normal',
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_order_orderSn` (`orderSn`),
    KEY `idx_order_createdAt` (`createdAt`),
    KEY `idx_order_userPhone` (`userPhone`),
    KEY `idx_order_salerId` (`salerId`),
    KEY `idx_order_status_type` (`orderStatus`, `orderType`),
    KEY `idx_order_showStatus` (`showStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单商品表
CREATE TABLE IF NOT EXISTS `OrderItems` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `sn` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(255) NOT NULL,
    `size` VARCHAR(255) NOT NULL,
    `brand` VARCHAR(255) NOT NULL DEFAULT '戴维贝拉',
    `originalPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(10,2) DEFAULT 100,
    `actualPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `counts` INT NOT NULL DEFAULT 0,
    `orderSn` VARCHAR(255) NOT NULL,
    `status` VARCHAR(255) NOT NULL DEFAULT 'normal',
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_order_items_orderSn` (`orderSn`),
    KEY `idx_order_items_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会员表
CREATE TABLE IF NOT EXISTS `Member` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(255) NOT NULL UNIQUE,
    `actual` DECIMAL(10,2) DEFAULT 0,
    `point` INT DEFAULT 0,
    `balance` DECIMAL(10,2) DEFAULT 0,
    `coupon` INT DEFAULT 0,
    `name` VARCHAR(255),
    `birthday` VARCHAR(255),
    `level` VARCHAR(255) DEFAULT 'normal',
    `status` VARCHAR(255) DEFAULT 'normal',
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_member_name` (`name`),
    KEY `idx_member_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会员积分记录表
CREATE TABLE IF NOT EXISTS `MemberScore` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(255) NOT NULL,
    `point` INT NOT NULL DEFAULT 0,
    `type` VARCHAR(255) NOT NULL DEFAULT 'earn',
    `reason` VARCHAR(255) NOT NULL,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_member_score_phone_createdAt` (`phone`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单优惠券使用记录表
CREATE TABLE IF NOT EXISTS `OrderCoupons` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `orderSn` VARCHAR(255) NOT NULL,
    `couponId` INT NOT NULL,
    `couponDesc` VARCHAR(255),
    `couponType` VARCHAR(255) NOT NULL DEFAULT 'store',
    `usedValue` DECIMAL(10,2) DEFAULT 0,
    `usedTime` DATETIME,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_order_coupons_orderSn` (`orderSn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会员余额变动记录表
CREATE TABLE IF NOT EXISTS `MemberBalance` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(255) NOT NULL,
    `value` INT NOT NULL DEFAULT 0,
    `type` VARCHAR(255) NOT NULL DEFAULT 'use',
    `reason` VARCHAR(255) NOT NULL,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_member_balance_phone_createdAt` (`phone`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会员优惠券表
CREATE TABLE IF NOT EXISTS `MemberCoupon` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(255) NOT NULL,
    `couponId` VARCHAR(255) NOT NULL,
    `couponCondition` DECIMAL(10,2),
    `couponDesc` VARCHAR(255),
    `couponValue` DECIMAL(10,2) NOT NULL,
    `couponCount` INT NOT NULL DEFAULT 1,
    `couponStatus` VARCHAR(255) NOT NULL DEFAULT 'active',
    `couponExpiredTime` DATETIME,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_member_coupon_phone_status` (`phone`, `couponStatus`),
    KEY `idx_member_coupon_couponId` (`couponId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会员抽奖记录表
CREATE TABLE IF NOT EXISTS `MemberDrawRecord` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(255) NOT NULL,
    `info` VARCHAR(255) NOT NULL,
    `award` VARCHAR(255),
    `extra` TEXT,
    `requestId` VARCHAR(64) NULL COMMENT '客户端请求幂等标识',
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_member_draw_phone_request` (`phone`, `requestId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 店铺优惠券表
CREATE TABLE IF NOT EXISTS `StoreCoupon` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `activityId` INT NOT NULL,
    `couponCondition` DECIMAL(10,2),
    `couponDesc` VARCHAR(255),
    `couponValue` DECIMAL(10,2) NOT NULL,
    `couponCount` INT NOT NULL DEFAULT 1,
    `couponStatus` VARCHAR(255) NOT NULL DEFAULT 'active',
    `couponExpiredTime` DATETIME,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 营销活动表
CREATE TABLE IF NOT EXISTS `Marketing` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `marketingName` VARCHAR(255) NOT NULL,
    `marketingDesc` VARCHAR(255),
    `marketingType` VARCHAR(255) NOT NULL DEFAULT 'full_send',
    `marketingCondition` DECIMAL(10,2) NOT NULL,
    `marketingValue` DECIMAL(10,2) NOT NULL,
    `startTime` DATETIME NOT NULL,
    `endTime` DATETIME NOT NULL,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_marketing_type_time` (`marketingType`, `startTime`, `endTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 库存表
CREATE TABLE IF NOT EXISTS `Inventory` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `sn` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(255) NOT NULL UNIQUE,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(255) NOT NULL,
    `size` VARCHAR(255) NOT NULL,
    `brand` VARCHAR(255) NOT NULL DEFAULT '戴维贝拉',
    `costPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `originalPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `counts` INT NOT NULL DEFAULT 0,
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `saleCounts` INT NOT NULL DEFAULT 0,
    KEY `idx_inventory_sn` (`sn`),
    KEY `idx_inventory_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 库存变动记录表
CREATE TABLE IF NOT EXISTS `InventoryRecord` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `sku` VARCHAR(255) NOT NULL,
    `count` INT NOT NULL DEFAULT 0,
    `info` VARCHAR(255) NOT NULL DEFAULT '',
    `type` VARCHAR(255) NOT NULL DEFAULT 'sale',
    `extra` TEXT,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_inventory_record_sku` (`sku`),
    KEY `idx_inventory_record_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 操作日志表
CREATE TABLE IF NOT EXISTS `OpLog` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `type` VARCHAR(255) NOT NULL DEFAULT 'return',
    `info` VARCHAR(255),
    `userId` VARCHAR(255),
    `userOS` VARCHAR(255),
    `appVersion` VARCHAR(255),
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_oplog_createdAt` (`createdAt`),
    KEY `idx_oplog_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 门店月度汇总表
CREATE TABLE IF NOT EXISTS `storeMonthlySummary` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `year` INT NOT NULL,
    `month` INT NOT NULL,
    `totalAmount` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `totalCost` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_year_month` (`year`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== 会员小程序互动（签到 / 抽奖 / 积分兑换） =====

-- 微信 openid 与会员手机号绑定表
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

-- 每日签到记录表
CREATE TABLE IF NOT EXISTS `MemberSignIn` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `phone` VARCHAR(20) NOT NULL,
    `signDate` DATE NOT NULL COMMENT '签到自然日',
    `points` INT NOT NULL DEFAULT 0,
    `streakDays` INT NOT NULL DEFAULT 1,
    `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_member_sign_in_phone_date` (`phone`, `signDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 积分抽奖奖池
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

-- 积分兑换礼品
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

-- 积分兑换单 / 取货凭证
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
