import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 积分兑换礼品；stock 为剩余库存，totalStock 为总库存（用于前端展示进度）
const RedeemItem = sequelize.define('RedeemItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    comment: '礼品名',
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  image: {
    comment: '礼品图',
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: '',
  },
  description: {
    comment: '规格 / 说明',
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  detail: {
    comment: '详情（领取说明、门店限制）',
    type: DataTypes.TEXT,
    allowNull: true,
  },
  points: {
    comment: '所需积分',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  totalStock: {
    comment: '总库存',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  stock: {
    comment: '剩余库存',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  perMemberLimit: {
    comment: '每人限兑数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
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
  tableName: 'RedeemItem',
  indexes: [
    { name: 'idx_redeem_item_status_sort', fields: ['status', 'sort'] },
  ],
});

export { RedeemItem };
