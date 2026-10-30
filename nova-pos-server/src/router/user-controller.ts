import { Request, Response } from 'express';
import logger from '../logger';
import { User } from '../model/user';
import {
  hashPassword,
  isHashedPassword,
  verifyPassword,
} from '../auth/password';

/** 对外返回的用户信息：始终剔除密码 */
const toPublicUser = (row: any) => {
  const user = row.toJSON ? row.toJSON() : { ...row };
  delete user.password;
  return user;
};

// 新增一个用户（注册）：角色固定为导购员，是否停用由管理员后续调整
export const createUser = async (req: Request, res: Response) => {
  const { avatar, name, password, email, realName } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: '请填写用户名' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' });
    return;
  }

  try {
    const result = await User.findOne({ where: { name: name.trim() } });
    if (result !== null) {
      res.json({ error: '用户名已存在', code: 1 });
      return;
    }

    const created = await User.create({
      avatar: avatar ?? null,
      name: name.trim(),
      realName: typeof realName === 'string' && realName.trim() ? realName.trim() : null,
      password: hashPassword(password),
      email: email ?? null,
      role: 'clerk',
      status: 'normal',
    });
    res.status(200).json(toPublicUser(created));
  } catch (error) {
    logger.error('Error creating user:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询用户详情
export const getUserInfo = async (req: Request, res: Response) => {
  const { id } = req.query;
  try {
    const result = await User.findByPk(Number(id));
    if (result) {
      res.json(toPublicUser(result));
    } else {
      res.json({ error: 'User not found' });
    }
  } catch (error) {
    logger.error('Error getting User by ID:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新用户信息（管理员）
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.query;
  const { avatar, name, password, email, realName, role, status } = req.body || {};
  try {
    const result: any = await User.findByPk(Number(id));
    if (!result) {
      res.json({ error: 'user not found' });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (avatar !== undefined) patch.avatar = avatar;
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email;
    if (realName !== undefined) patch.realName = realName;
    if (status !== undefined) patch.status = status;
    if (role !== undefined) patch.role = role === 'admin' ? 'admin' : 'clerk';
    if (typeof password === 'string' && password.length > 0) {
      patch.password = isHashedPassword(password) ? password : hashPassword(password);
    }

    await result.update(patch);
    res.json(toPublicUser(result));
  } catch (error) {
    logger.error('Error updating user:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 用户登录：账号密码来自 User 表，历史明文密码校验通过后自动升级为哈希
export const userLogin = async (req: Request, res: Response) => {
  const { name, password } = req.body || {};

  if (typeof name !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: '请输入用户名和密码' });
    return;
  }

  try {
    const result: any = await User.findOne({ where: { name: name.trim() } });
    if (!result || !verifyPassword(result.password, password)) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }
    if (result.status !== 'normal') {
      res.status(403).json({ error: '账号已停用，请联系管理员' });
      return;
    }

    if (!isHashedPassword(result.password)) {
      // 老库明文密码：首次登录成功后立即落成哈希，后续不再保存明文
      await result.update({ password: hashPassword(password) });
    }

    res.json(toPublicUser(result));
  } catch (error) {
    logger.error('Error login user:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 本人修改密码：需要校验原密码，身份取自 JWT 载荷
export const changePassword = async (req: Request, res: Response) => {
  const userId = res.locals.userId as string | undefined;
  const { currentPassword, newPassword } = req.body || {};

  if (!userId) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: '请填写原密码与新密码' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: '新密码至少 6 位' });
    return;
  }

  try {
    const result: any = await User.findByPk(Number(userId));
    if (!result || !verifyPassword(result.password, currentPassword)) {
      res.status(400).json({ error: '原密码不正确' });
      return;
    }

    await result.update({ password: hashPassword(newPassword) });
    res.json({ code: 0 });
  } catch (error) {
    logger.error('Error changing password:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 用户列表
export const getUserList = async (req: Request, res: Response) => {
  try {
    const { count, rows } = await User.findAndCountAll({
      order: [['createdAt', 'DESC']],
    });
    res.json({
      count: count || 0,
      // 不向下游返回密码字段
      data: (rows || []).map((row: any) => toPublicUser(row)),
    });
  } catch (error) {
    logger.error('Error getting user list:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
