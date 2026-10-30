import { describe, expect, it } from 'vitest'
import { SqlGuardError, SQL_LIMIT, assertReadOnlySql } from './sql-guard'

describe('assertReadOnlySql', () => {
  it('放行普通 SELECT 并追加默认 LIMIT', () => {
    expect(assertReadOnlySql('SELECT * FROM `order`')).toBe(
      `SELECT * FROM \`order\` LIMIT ${SQL_LIMIT}`
    )
  })

  it('保留合法的 LIMIT', () => {
    expect(assertReadOnlySql('SELECT id FROM `order` LIMIT 20')).toBe(
      'SELECT id FROM `order` LIMIT 20'
    )
  })

  it('把超限 LIMIT 收缩到 200', () => {
    expect(assertReadOnlySql('SELECT id FROM `order` LIMIT 500')).toBe(
      `SELECT id FROM \`order\` LIMIT ${SQL_LIMIT}`
    )
    expect(assertReadOnlySql('SELECT id FROM `order` LIMIT 10, 500')).toBe(
      `SELECT id FROM \`order\` LIMIT 10, ${SQL_LIMIT}`
    )
    expect(assertReadOnlySql('SELECT id FROM `order` LIMIT 500 OFFSET 20')).toBe(
      `SELECT id FROM \`order\` LIMIT ${SQL_LIMIT} OFFSET 20`
    )
  })

  it('拒绝多语句与注释', () => {
    expect(() => assertReadOnlySql('SELECT 1; DELETE FROM `order`')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT 1 -- 注释')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT 1 # 注释')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT 1 /* 注释 */')).toThrow(SqlGuardError)
  })

  it('拒绝非 SELECT 与写操作', () => {
    expect(() => assertReadOnlySql('UPDATE `order` SET orderStatus = "refund"')).toThrow(
      '只允许执行 SELECT 查询'
    )
    expect(() => assertReadOnlySql('SELECT * FROM `order` FOR UPDATE')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT * FROM `order` LOCK IN SHARE MODE')).toThrow(
      SqlGuardError
    )
    expect(() => assertReadOnlySql('SELECT load_file("/etc/passwd")')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT sleep(10)')).toThrow(SqlGuardError)
    expect(() => assertReadOnlySql('SELECT * FROM `order` INTO OUTFILE "/tmp/x"')).toThrow(
      SqlGuardError
    )
  })

  it('拒绝空 SQL 与超长 SQL', () => {
    expect(() => assertReadOnlySql('   ')).toThrow('SQL 不能为空')
    expect(() => assertReadOnlySql(`SELECT '${'a'.repeat(5000)}'`)).toThrow('SQL 过长')
  })

  it('不误伤普通字段名', () => {
    expect(assertReadOnlySql('SELECT createdAt, updatedAt FROM `order` LIMIT 10')).toBe(
      'SELECT createdAt, updatedAt FROM `order` LIMIT 10'
    )
  })
})
