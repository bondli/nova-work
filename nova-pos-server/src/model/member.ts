import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 会员表
const Member = sequelize.define('Member', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  phone: {
    comment: '手机号',
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  actual: {
    comment: '消费金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('actual');
      return value === null ? null : Number(value);
    }
  },
  point: {
    comment: '积分余额',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  balance: {
    comment: '余额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('balance');
      return value === null ? null : Number(value);
    }
  },
  coupon: {
    comment: '优惠券',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  name: {
    comment: '会员名',
    type: DataTypes.STRING,
    allowNull: true,
  },
  birthday: {
    comment: '生日',
    type: DataTypes.STRING,
    allowNull: true,
  },
  level: {
    comment: '会员等级',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal', // normal (普通会员), super (超级会员)
  },
  status: {
    comment: '会员状态',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal', // normal (正常), disabled (禁用)
  },
}, {
  // 这是其他模型参数
  tableName: 'Member',
});

export { Member };
