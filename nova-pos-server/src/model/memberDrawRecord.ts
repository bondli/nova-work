import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 会员抽奖记录表
const MemberDrawRecord = sequelize.define('MemberDrawRecord', {
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
  // 这是其他模型参数
  tableName: 'MemberDrawRecord',
});

export { MemberDrawRecord };
