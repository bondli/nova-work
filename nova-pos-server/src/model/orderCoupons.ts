import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 订单优惠券表
const OrderCoupons = sequelize.define('OrderCoupons', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  orderSn: {
    comment: '订单号',
    type: DataTypes.STRING,
    allowNull: false,
  },
  couponId: {
    comment: '优惠券ID',
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  couponDesc: {
    comment: '优惠券描述',
    type: DataTypes.STRING,
    allowNull: true,
  },
  couponType: {
    comment: '优惠券类型',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'store', // 'store' or 'member'
  },
  usedValue: {
    comment: '使用金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
  },
  usedTime: {
    comment: '使用时间',
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
  tableName: 'OrderCoupons',
});

export { OrderCoupons };
