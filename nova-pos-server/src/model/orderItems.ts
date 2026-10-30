import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const OrderItems = sequelize.define('OrderItems', {
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
  originalPrice: {
    comment: '吊牌价',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('originalPrice');
      return value === null ? null : Number(value);
    }
  },
  discount: {
    comment: '折扣',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 100,
    get() {
      const value = this.getDataValue('discount');
      return value === null ? null : Number(value);
    }
  },
  actualPrice: {
    comment: '实收价',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('actualPrice');
      return value === null ? null : Number(value);
    }
  },
  counts: {
    comment: '销售数量',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  orderSn: {
    comment: '订单号',
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    comment: '状态',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'normal', // normal|refund
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'OrderItems',
});

export { OrderItems };
