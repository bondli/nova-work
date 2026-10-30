import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 余额流水表
const MemberBalance = sequelize.define('MemberBalance', {
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
  value: {
    comment: '变动的余额',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  type: {
    comment: '变动的方式',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'use', // `use`, `income`, `send`, `refund`, `manualReduce`
  },
  reason: {
    comment: '变动的原因',
    type: DataTypes.STRING,
    allowNull: false,
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'MemberBalance',
});

export { MemberBalance };
