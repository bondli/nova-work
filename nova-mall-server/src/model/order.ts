import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  orderSn: {
    comment: '订单编码',
    type: DataTypes.STRING,
    allowNull: false,
  },
  orderStatus: {
    comment: '付款状态', // 用于对账，uncheck|checked
    type: DataTypes.STRING,
    allowNull: false,
  },
  orderItems: {
    comment: '订单中包含商品数量',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  originalAmount: {
    comment: '商品吊牌总金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('originalAmount');
      return value === null ? null : Number(value);
    }
  },
  orderAmount: {
    comment: '商品折扣之后的应付金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('orderAmount');
      return value === null ? null : Number(value);
    }
  },
  orderActualAmount: {
    comment: '订单实付金额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('orderActualAmount');
      return value === null ? null : Number(value);
    }
  },
  payType: {
    comment: '付款方式',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'other',
  },
  userPhone: {
    comment: '会员手机号',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  usePoint: {
    comment: '使用积分',
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  },
  useBalance: {
    comment: '使用余额',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('useBalance');
      return value === null ? null : Number(value);
    }
  },
  useCoupon: {
    comment: '使用优惠券',
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('useCoupon');
      return value === null ? null : Number(value);
    }
  },
  salerId: {
    comment: '导购员ID',
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  salerName: {
    comment: '导购员名称',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  remark: {
    comment: '备注',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  source: {
    comment: '订单来源',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'inshop', // inshop|outlet
  },
  extra: {
    comment: '额外信息', // 用于存储导入订单的额外信息，下单时的所有参数信息，便于导出的时候直接导入，走下单重放
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '{}',
  },
  printStatus: {
    comment: '打印状态',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal', // normal|printed
  },
  showStatus: {
    comment: '订单展示状态',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal', // normal|hidden
  },
  orderType: {
    comment: '订单类型',
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'normal', // normal|income
  },
}, {
  // 这是其他模型参数
  tableName: 'Order',
});

export { Order };
