import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 会员优惠券表
const MemberCoupon = sequelize.define('MemberCoupon', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  phone: {
    comment: '手机号',
    type: DataTypes.STRING,
    allowNull: false,
  },
  couponId: {
    comment: '优惠券ID', // 发券的时候通过uuid来生成
    type: DataTypes.STRING,
    allowNull: false,
  },
  couponCondition: {
    comment: '优惠券条件',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue('couponCondition');
      return value === null ? null : Number(value);
    }
  },
  couponDesc: {
    comment: '优惠券描述',
    type: DataTypes.STRING,
    allowNull: true,
  },
  couponValue: {
    comment: '优惠券面额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    get() {
      const value = this.getDataValue('couponValue');
      return value === null ? null : Number(value);
    }
  },
  couponCount: { // 这个字段估计要废弃，系统发券的时候，相同的直接实例化发给用户
    comment: '优惠券数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  couponStatus: {
    comment: '优惠券状态',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'active', // 'used' or 'expired'
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
  tableName: 'MemberCoupon',
});

export { MemberCoupon };
