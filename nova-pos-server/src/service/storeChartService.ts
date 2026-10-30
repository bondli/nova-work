import { Op } from 'sequelize';
import dayjs from 'dayjs';
import { sequelize } from '../model/index';
import { Order } from '../model/order';
import { Inventory } from '../model/inventory';
import { OrderItems } from '../model/orderItems';
import { StoreMonthlySummary } from '../model/storeMonthlySummary';

// 图表数据格式
interface ChartMonthData {
  month: string;       // "2025/04" 格式
  amounts: number;     // 营业额（保留2位小数）
  cost: number;        // 成本（保留2位小数）
  rate: number;        // 利润率（保留2位小数）
  year: number;
  monthNum: number;
  isArchived: boolean;
}

// 生成从2025-04到当前月份的月份列表
function generateMonthsFrom202504(): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const start = dayjs('2025-04');
  const now = dayjs();

  let current = start;
  while (current.isBefore(now) || current.isSame(now, 'month')) {
    months.push({
      year: current.year(),
      month: current.month() + 1,
    });
    current = current.add(1, 'month');
  }
  return months;
}

// 计算指定月份的订单数据（从订单表实时计算）
async function calculateMonthData(year: number, month: number): Promise<{ totalAmount: number; totalCost: number }> {
  const startTime = dayjs(`${year}-${String(month).padStart(2, '0')}`).startOf('month').toDate();
  const endTime = dayjs(`${year}-${String(month).padStart(2, '0')}`).endOf('month').toDate();

  const orderWhere = {
    createdAt: {
      [Op.between]: [startTime, endTime]
    },
    orderType: {
      [Op.eq]: 'normal',
    },
  };

  // 查询订单图表数据
  const orderCharts = await Order.findAll({
    where: orderWhere,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'amounts'],
      [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
    ],
    raw: true,
  });

  const amounts = Number((orderCharts[0] as any)?.amounts || 0);
  const totalBalance = Number((orderCharts[0] as any)?.totalBalance || 0);
  const totalAmount = amounts + totalBalance;

  // 计算成本
  const orders = await Order.findAll({
    where: orderWhere,
  });

  const orderList = orders.map(item => item.toJSON());
  const orderItemsResult = await OrderItems.findAll({
    where: {
      orderSn: { [Op.in]: orderList.map(item => item.orderSn) }
    },
  });

  const orderItems = orderItemsResult.map(item => item.toJSON());
  const inventoryList = await Inventory.findAll({
    where: { sku: { [Op.in]: orderItems.map(item => item.sku) } }
  });

  const inventoryMap = new Map(
    inventoryList.map(item => {
      const data = item.toJSON();
      return [data.sku, data];
    })
  );

  const orderSnToMonth = new Map<string, string>();
  orders.forEach(item => {
    const m = dayjs(item.get('createdAt') as string).format('YYYY/MM');
    orderSnToMonth.set(item.get('orderSn') as string, m);
  });

  let totalCost = 0;
  orderItems.forEach(item => {
    const inventory = inventoryMap.get(item.sku);
    const costPrice = inventory ? Number(inventory.costPrice) : 0;
    totalCost += costPrice * item.counts;
  });

  return { totalAmount, totalCost };
}

// 查询店铺营业额图表数据（从2025-04开始）
export async function getStoreCharts(): Promise<ChartMonthData[]> {
  const months = generateMonthsFrom202504();
  const archivedData = await StoreMonthlySummary.findAll({
    where: {
      [Op.or]: months.map(m => ({
        year: m.year,
        month: m.month,
      })),
    },
  });

  const archivedMap = new Map<string, { totalAmount: number; totalCost: number }>();
  archivedData.forEach(item => {
    const key = `${item.get('year')}-${item.get('month')}`;
    archivedMap.set(key, {
      totalAmount: Number(item.get('totalAmount')),
      totalCost: Number(item.get('totalCost')),
    });
  });

  const result: ChartMonthData[] = [];

  for (const m of months) {
    const key = `${m.year}-${m.month}`;
    const archived = archivedMap.get(key);
    const monthStr = `${m.year}/${String(m.month).padStart(2, '0')}`;

    let amounts = 0;
    let cost = 0;

    if (archived) {
      amounts = Number(archived.totalAmount.toFixed(2));
      cost = Number(archived.totalCost.toFixed(2));
    } else {
      // 未归档，实时计算
      const calculated = await calculateMonthData(m.year, m.month);
      amounts = Number(calculated.totalAmount.toFixed(2));
      cost = Number(calculated.totalCost.toFixed(2));
    }

    const rate = amounts > 0 ? Number(((amounts - cost) / amounts * 100).toFixed(2)) : 0;

    result.push({
      month: monthStr,
      amounts,
      cost,
      rate,
      year: m.year,
      monthNum: m.month,
      isArchived: !!archived,
    });
  }

  return result;
}

// 归档指定月份数据
export async function archiveMonthData(year: number, month: number): Promise<{ success: boolean; message: string }> {
  // 检查是否已归档
  const existing = await StoreMonthlySummary.findOne({
    where: { year, month },
  });

  if (existing) {
    return { success: false, message: '该月已归档' };
  }

  // 计算该月数据
  const { totalAmount, totalCost } = await calculateMonthData(year, month);

  // 写入归档表
  await StoreMonthlySummary.create({
    year,
    month,
    totalAmount,
    totalCost,
  });

  return { success: true, message: '归档成功' };
}

// 获取归档数据（用于AI分析）
export async function getArchivedData(): Promise<{ year: number; month: number; totalAmount: number; totalCost: number }[]> {
  const data = await StoreMonthlySummary.findAll({
    order: [['year', 'ASC'], ['month', 'ASC']],
  });

  return data.map(item => ({
    year: item.get('year') as number,
    month: item.get('month') as number,
    totalAmount: item.get('totalAmount') as number,
    totalCost: item.get('totalCost') as number,
  }));
}
