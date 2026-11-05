-- 奖池调整（2026-11-05，人工执行）
-- 1) 原「满 100 减 10 券」门槛提高到 199，避免与新会员首抽「满 100 减 5 券」同门槛
-- 2) 新增「满 100 减 5 券」：新会员首抽保底直接发这张券，同时作为普通奖品进入奖池（共 7 项）
UPDATE `LotteryPrize`
SET `name` = '满 199 减 10 券',
    `couponCondition` = 199.00,
    `couponDesc` = '满 199 减 10 元券'
WHERE `name` = '满 100 减 10 券';

INSERT INTO `LotteryPrize`
  (`name`, `prizeType`, `points`, `couponCondition`, `couponValue`, `couponDesc`, `couponValidDays`, `weight`, `stock`, `status`, `sort`)
SELECT '满 100 减 5 券', 'coupon', 0, 100.00, 5.00, '满 100 减 5 元券', 30, 8, NULL, 'active', 7
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `LotteryPrize` WHERE `name` = '满 100 减 5 券'
);
