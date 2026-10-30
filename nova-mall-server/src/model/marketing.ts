import { DataTypes } from 'sequelize';
import { sequelize } from './index';

// 营销活动表
const Marketing = sequelize.define('Marketing', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  marketingName: {
    comment: '营销活动名称', // 开业优惠活动，首单优惠
    type: DataTypes.STRING,
    allowNull: false,
  },
  marketingDesc: {
    comment: '营销活动描述', // 开业优惠活动，满300送300元优惠券，首单优惠活动，满300减30元
    type: DataTypes.STRING,
    allowNull: true,
  },
  marketingType: {
    comment: '营销活动类型', // 满送活动（满多少元送多少钱，拆分成N张满M减Y元的满减券），满减活动（满多少元减多少元），满赠活动（满N件送M件）
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'full_send', // 'full_send' or 'full_reduce' or 'full_gift'
  },
  marketingCondition: {
    comment: '营销活动条件', // 满送活动：满多少元，满减活动：满多少元，满赠活动：满多少件
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  marketingValue: {
    comment: '营销活动值', // 满送活动：送多少钱，满减活动：减多少钱，满赠活动：送多少件
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  // 后台逻辑
  // 1、满送活动，在用户下单后，根据订单金额，计算可以获得的优惠券数量，发放到用户的优惠券表（MemberCoupon）
  // 2、满减活动，在活动创建之后，在店铺优惠券表（StoreCoupon）中创建优惠券，用于下单前店铺优惠直接使用
  // 3、满赠活动，在用户下单后，根据订单中满足条件的商品，直接赠送最低的那个商品，暂未实现
  startTime: {
    comment: '营销活动开始时间',
    type: DataTypes.DATE,
    allowNull: false,
  },
  endTime: {
    comment: '营销活动结束时间',
    type: DataTypes.DATE,
    allowNull: false,
  },
  extra: {
    comment: '额外信息',
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  // 这是其他模型参数
  tableName: 'Marketing',
});

export { Marketing };
