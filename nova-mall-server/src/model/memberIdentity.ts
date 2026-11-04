import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 微信 openid 与会员手机号绑定表，用于 token 过期后免手机号授权静默续期
const MemberIdentity = sequelize.define('MemberIdentity', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  openid: {
    comment: '微信 openid',
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  phone: {
    comment: '会员手机号',
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  unionId: {
    comment: '微信 unionId，预留字段',
    type: DataTypes.STRING(64),
    allowNull: true,
  },
}, {
  tableName: 'MemberIdentity',
  indexes: [
    { name: 'uk_member_identity_openid', unique: true, fields: ['openid'] },
    { name: 'idx_member_identity_phone', fields: ['phone'] },
  ],
});

export { MemberIdentity };
