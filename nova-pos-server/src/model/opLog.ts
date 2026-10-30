import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const OpLog = sequelize.define('OpLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  type: {
    comment: '操作类型',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'return', // return | exchange | modifyOrder | inCome | modifyInventory | purchaseInventory | returnInventory
  },
  info: {
    comment: '操作信息详情',
    type: DataTypes.STRING,
    allowNull: true,
  },
  userId: {
    comment: '用户id',
    type: DataTypes.STRING,
    allowNull: true,
  },
  userOS: {
    comment: '用户操作系统',
    type: DataTypes.STRING,
    allowNull: true,
  },
  appVersion: {
    comment: '应用版本',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'OpLog',
});

export { OpLog };
