/**
 * 账号与登录相关的共享类型。
 * 目前为桌面端本地账号体系，后续接入 nova-pos-server 时保持字段不变。
 */

/** 系统仅保留两种角色：管理员与导购员 */
export type Role = 'admin' | 'clerk'

/** 渲染层可见的用户信息，绝不包含密码等敏感字段 */
export interface AuthUser {
  id: string
  username: string
  name: string
  role: Role
}

export interface LoginInput {
  /** remember 为 false 时仅保留内存会话，关闭应用即退出登录 */
  username: string
  password: string
  remember: boolean
}

/** 注册输入：用户名、姓名、密码；角色由主进程强制写为 clerk */
export interface RegisterInput {
  username: string
  name: string
  password: string
}

/** 修改密码需要同时提供原密码与新密码 */
export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}
