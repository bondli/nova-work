import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 店铺优惠券表
const StoreCoupon = sequelize.define('StoreCoupon', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  activityId: {
    comment: '营销活动ID',
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  couponCondition: {
    comment: '优惠券条件', // 满减券：满多少元
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  couponDesc: {
    comment: '优惠券描述', // 满减券：满300减30元
    type: DataTypes.STRING,
    allowNull: true,
  },
  couponValue: {
    comment: '优惠券面额', // 满减券：减30元
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  couponCount: {
    comment: '优惠券数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  couponStatus: {
    comment: '优惠券状态', // 有效、无效
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'active', // '' or 'invalid'
  },
  couponExpiredTime: {
    comment: '优惠券过期时间',
    type: DataTypes.DATE,
    allowNull: true,
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'StoreCoupon',
});

export { StoreCoupon };
