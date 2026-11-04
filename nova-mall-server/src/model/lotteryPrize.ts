import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 积分抽奖奖池；weight 为整数权重，stock 为 NULL 表示不限库存
const LotteryPrize = sequelize.define('LotteryPrize', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    comment: '奖品展示名',
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  prizeType: {
    comment: '奖品类型：none 未中奖 / points 积分 / coupon 优惠券',
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'none',
  },
  points: {
    comment: '积分类型发放的积分数量',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  couponCondition: {
    comment: '券门槛金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue('couponCondition');
      return value === null ? null : Number(value);
    },
  },
  couponValue: {
    comment: '券面额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue('couponValue');
      return value === null ? null : Number(value);
    },
  },
  couponDesc: {
    comment: '券描述',
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  couponValidDays: {
    comment: '券有效天数',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 30,
  },
  weight: {
    comment: '抽取权重（正整数）',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  stock: {
    comment: '库存，NULL 表示不限',
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    comment: '状态：active / inactive',
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'active',
  },
  sort: {
    comment: '展示顺序',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'LotteryPrize',
  indexes: [
    { name: 'idx_lottery_prize_status_sort', fields: ['status', 'sort'] },
  ],
});

export { LotteryPrize };
