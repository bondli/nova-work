import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 会员抽奖记录表（与 pos-server 同表）；requestId 用于客户端重试幂等
const MemberDrawRecord = sequelize.define('MemberDrawRecord', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  phone: {
    comment: '手机号',
    type: DataTypes.STRING,
    allowNull: false,
  },
  info: {
    comment: '抽奖活动',
    type: DataTypes.STRING,
    allowNull: false,
  },
  award: {
    comment: '奖品',
    type: DataTypes.STRING,
    allowNull: true,
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
  requestId: {
    comment: '客户端请求幂等标识',
    type: DataTypes.STRING(64),
    allowNull: true,
  },
}, {
  tableName: 'MemberDrawRecord',
  indexes: [
    { name: 'uk_member_draw_phone_request', unique: true, fields: ['phone', 'requestId'] },
  ],
});

export { MemberDrawRecord };
