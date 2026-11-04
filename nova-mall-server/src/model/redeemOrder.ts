import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 积分兑换单 / 取货凭证；v1 只写 pending_pickup，核销由 POS 二期接入
const RedeemOrder = sequelize.define('RedeemOrder', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  orderNo: {
    comment: '兑换单号',
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  phone: {
    comment: '会员手机号',
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  itemId: {
    comment: '礼品 id',
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  itemName: {
    comment: '礼品名快照',
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  itemImage: {
    comment: '礼品图快照',
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: '',
  },
  points: {
    comment: '扣除积分',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  status: {
    comment: '状态：pending_pickup / picked / cancelled / expired',
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending_pickup',
  },
  pickupCode: {
    comment: '6 位取货码',
    type: DataTypes.STRING(8),
    allowNull: false,
  },
  expiredAt: {
    comment: '取货截止时间',
    type: DataTypes.DATE,
    allowNull: false,
  },
  pickedAt: {
    comment: '核销时间',
    type: DataTypes.DATE,
    allowNull: true,
  },
  requestId: {
    comment: '客户端请求幂等标识',
    type: DataTypes.STRING(64),
    allowNull: true,
  },
}, {
  tableName: 'RedeemOrder',
  indexes: [
    { name: 'uk_redeem_order_no', unique: true, fields: ['orderNo'] },
    { name: 'uk_redeem_order_phone_request', unique: true, fields: ['phone', 'requestId'] },
    { name: 'idx_redeem_order_phone_status_created', fields: ['phone', 'status', 'createdAt'] },
    { name: 'idx_redeem_order_pickup_code_status', fields: ['pickupCode', 'status'] },
  ],
});

export { RedeemOrder };
