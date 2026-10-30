import { DataTypes } from 'sequelize';
import { sequelize } from './index';

const StoreMonthlySummary = sequelize.define('StoreMonthlySummary', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  year: {
    comment: '年份',
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  month: {
    comment: '月份 1-12',
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  totalAmount: {
    comment: '总营业额',
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('totalAmount');
      return value === null ? 0 : Number(value);
    }
  },
  totalCost: {
    comment: '总成本',
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    get() {
      const value = this.getDataValue('totalCost');
      return value === null ? 0 : Number(value);
    }
  },
}, {
  tableName: 'storeMonthlySummary',
  indexes: [
    {
      unique: true,
      fields: ['year', 'month'],
      name: 'uk_year_month'
    }
  ]
});

export { StoreMonthlySummary };
