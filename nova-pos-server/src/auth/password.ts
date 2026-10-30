/**
 * 用户密码哈希。
 * 历史数据是明文（老系统直接存明文），因此校验同时兼容两种格式；
 * 明文校验通过后由登录接口自动升级为 scrypt 哈希，无需批量改库。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PREFIX = 'scrypt$';
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}${salt}$${hash}`;
}

export function isHashedPassword(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function verifyPassword(stored: string, plain: string): boolean {
  if (!isHashedPassword(stored)) return stored === plain;

  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(plain, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
