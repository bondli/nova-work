/**
 * 轻量级文件日志工具
 * API 兼容 electron-log 的 logger.info/warn/error 接口
 * - 日志目录取自 mall-config.json 的 storage.logDir（默认 ~/.nova/logs，与 POS 同构）
 * - 同时输出到 stdout/stderr，pm2 / docker 仍可查看
 * - 单文件超过 10MB 滚动为 mall-server.log.1
 */
import fs from 'node:fs';
import path from 'node:path';

import { getLogDir } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type Logger = {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
};

// 检测是否被 Electron fork（子进程有 IPC 通道）
const isForked = Boolean(process.send || process.channel);

/** 单个日志文件上限 10MB */
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const ROTATE_CHECK_EVERY = 500;

let logFilePath: string | null | undefined;
let writeCount = 0;

/** 懒解析日志文件路径；目录创建失败时退回仅控制台输出 */
const resolveLogFile = (): string | null => {
  if (logFilePath !== undefined) return logFilePath;
  try {
    logFilePath = path.join(getLogDir(), 'mall-server.log');
  } catch {
    logFilePath = null;
  }
  return logFilePath;
};

const rotateIfNeeded = (logFile: string): void => {
  writeCount += 1;
  if (writeCount % ROTATE_CHECK_EVERY !== 0) return;
  try {
    if (fs.statSync(logFile).size < MAX_LOG_SIZE) return;
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    // 文件不存在或改名失败时忽略，不影响写日志
  }
};

const formatMessage = (level: LogLevel, message: string, args: unknown[]): string => {
  const timestamp = new Date().toISOString();
  const formattedArgs =
    args.length > 0
      ? ' ' +
        args
          .map((arg) => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }

            return String(arg);
          })
          .join(' ')
      : '';

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
};

const writeLog = (level: LogLevel, message: string, args: unknown[]): void => {
  const formatted = formatMessage(level, message, args);

  const logFile = resolveLogFile();
  if (logFile) {
    rotateIfNeeded(logFile);
    // 异步追加，失败不影响业务流程
    fs.appendFile(logFile, formatted + '\n', () => undefined);
  }

  if (isForked) {
    // Electron fork 模式：输出到 stdout/stderr，由主进程捕获
    if (level === 'error') {
      process.stderr.write(formatted + '\n');
    } else {
      process.stdout.write(formatted + '\n');
    }

    return;
  }

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else if (level === 'debug') {
    console.debug(formatted);
  } else {
    console.log(formatted);
  }
};

export const logger: Logger = {
  info: (message: string, ...args: unknown[]) => writeLog('info', message, args),
  warn: (message: string, ...args: unknown[]) => writeLog('warn', message, args),
  error: (message: string, ...args: unknown[]) => writeLog('error', message, args),
  debug: (message: string, ...args: unknown[]) => writeLog('debug', message, args),
};

export default logger;
