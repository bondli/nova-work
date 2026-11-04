import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 每日签到记录表；(phone, signDate) 唯一索引保证每天只签到一次
const MemberSignIn = sequelize.define('MemberSignIn', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  phone: {
    comment: '会员手机号',
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  signDate: {
    comment: '签到自然日（YYYY-MM-DD）',
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  points: {
    comment: '本次获得积分',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  streakDays: {
    comment: '本次签到后的连续天数',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'MemberSignIn',
  updatedAt: false,
  indexes: [
    { name: 'uk_member_sign_in_phone_date', unique: true, fields: ['phone', 'signDate'] },
  ],
});

export { MemberSignIn };
