import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  sn: {
    comment: '货号',
    type: DataTypes.STRING,
    allowNull: false,
  },
  sku: {
    comment: 'SKU',
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  name: {
    comment: '商品名称',
    type: DataTypes.STRING,
    allowNull: false,
  },
  color: {
    comment: '颜色',
    type: DataTypes.STRING,
    allowNull: false,
  },
  size: {
    comment: '尺码',
    type: DataTypes.STRING,
    allowNull: false,
  },
  brand: {
    comment: '品牌',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'db',
  },
  costPrice: {
    comment: '成本价',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  originalPrice: {
    comment: '吊牌价',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  saleCounts: {
    comment: '销售数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  counts: {
    comment: '库存数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'Inventory',
});

export { Inventory };
