import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const InventoryRecord = sequelize.define('InventoryRecord', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sku: {
    comment: 'SKU',
    type: DataTypes.STRING,
    allowNull: false,
  },
  count: {
    comment: '变动数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  info: {
    comment: '变动明细',
    type: DataTypes.STRING,
    allowNull: true,
  },
  type: {
    comment: '变动类型',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'sale', // in|sale|exchangeOut|return|exchangeIn|adjust
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'InventoryRecord',
});

export { InventoryRecord };
