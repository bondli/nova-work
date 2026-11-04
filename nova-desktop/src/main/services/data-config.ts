/**
 * 数据设置聚合层。
 * POS 服务地址写 ~/.nova/api-config.json（桌面端专用，不覆盖服务端配置）；
 * Agent 只读数据库写 ~/.nova/agent-config.json，两者互不覆盖。
 * 文件目录、POS 自身监听地址与数据库属于服务端配置，不经过桌面端编辑。
 */
import { z } from 'zod'
import type { DataSettingsInput, DataSettingsView } from '@shared/types/data-config'
import {
  getServerConfigView,
  saveServerConnection,
  serverConnectionInputSchema
} from './server-config'
import {
  agentDatabaseInputSchema,
  getAgentDatabaseView,
  saveAgentDatabase
} from '../agent/config'
import { closeMysql } from '../db/mysql'

export const dataSettingsInputSchema = z.object({
  ...serverConnectionInputSchema.shape,
  database: agentDatabaseInputSchema
})

export async function getDataSettingsView(): Promise<DataSettingsView> {
  const [server, agent] = await Promise.all([getServerConfigView(), getAgentDatabaseView()])

  return {
    baseUrl: server.baseUrl,
    database: agent.database,
    apiConfigPath: server.configPath,
    agentConfigPath: agent.configPath
  }
}

export async function saveDataSettings(input: DataSettingsInput): Promise<DataSettingsView> {
  await saveServerConnection({ baseUrl: input.baseUrl })
  await saveAgentDatabase(input.database)
  // 连接参数已变化，释放旧连接池，下一次查询按新配置重建
  await closeMysql()
  return getDataSettingsView()
}
