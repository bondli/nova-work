-- nova-pos-server 索引与唯一约束迁移（MySQL 8+，仅执行一次）
-- 说明：本文件不会自动执行，需在数据库变更前人工审核后运行。
-- 若历史数据中已存在重复 orderSn，请先清理重复记录，否则唯一索引会创建失败。

-- 订单号唯一：并发下单时依赖该约束触发重试，避免生成重复订单号
ALTER TABLE `Order` ADD UNIQUE INDEX `uk_order_orderSn` (`orderSn`);

-- 订单查询常用条件
ALTER TABLE `Order` ADD INDEX `idx_order_createdAt` (`createdAt`);
ALTER TABLE `Order` ADD INDEX `idx_order_userPhone` (`userPhone`);
ALTER TABLE `Order` ADD INDEX `idx_order_salerId` (`salerId`);
ALTER TABLE `Order` ADD INDEX `idx_order_status_type` (`orderStatus`, `orderType`);
ALTER TABLE `Order` ADD INDEX `idx_order_showStatus` (`showStatus`);

-- 订单明细按订单号、SKU 查询
ALTER TABLE `OrderItems` ADD INDEX `idx_order_items_orderSn` (`orderSn`);
ALTER TABLE `OrderItems` ADD INDEX `idx_order_items_sku` (`sku`);

-- 库存按款号、SKU 查询
ALTER TABLE `Inventory` ADD INDEX `idx_inventory_sn` (`sn`);
ALTER TABLE `Inventory` ADD INDEX `idx_inventory_name` (`name`);

-- 库存流水
ALTER TABLE `InventoryRecord` ADD INDEX `idx_inventory_record_sku` (`sku`);
ALTER TABLE `InventoryRecord` ADD INDEX `idx_inventory_record_createdAt` (`createdAt`);

-- 会员与流水
ALTER TABLE `Member` ADD INDEX `idx_member_name` (`name`);
ALTER TABLE `Member` ADD INDEX `idx_member_level` (`level`);
ALTER TABLE `MemberScore` ADD INDEX `idx_member_score_phone_createdAt` (`phone`, `createdAt`);
ALTER TABLE `MemberBalance` ADD INDEX `idx_member_balance_phone_createdAt` (`phone`, `createdAt`);
ALTER TABLE `MemberCoupon` ADD INDEX `idx_member_coupon_phone_status` (`phone`, `couponStatus`);
ALTER TABLE `MemberCoupon` ADD INDEX `idx_member_coupon_couponId` (`couponId`);

-- 订单优惠券
ALTER TABLE `OrderCoupons` ADD INDEX `idx_order_coupons_orderSn` (`orderSn`);

-- 营销活动按类型与时间筛选
ALTER TABLE `Marketing` ADD INDEX `idx_marketing_type_time` (`marketingType`, `startTime`, `endTime`);

-- 操作日志
ALTER TABLE `OpLog` ADD INDEX `idx_oplog_createdAt` (`createdAt`);
ALTER TABLE `OpLog` ADD INDEX `idx_oplog_type` (`type`);
