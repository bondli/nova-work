/**
 * 轻量级文件日志工具
 * API 兼容 electron-log 的 logger.info/warn/error 接口
 * - Electron fork 模式：输出到 stdout/stderr，由主进程捕获写入日志
 * - 独立运行模式：使用 console.log
 * - 两种模式都会追加到 server-config.json 配置的日志目录
 */
import fs from 'node:fs';
import path from 'node:path';

import { getLogDir } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

// 检测是否被 Electron fork（子进程有 IPC 通道）
const isForked = Boolean(process.send || process.channel);

let logFilePath: string | null | undefined;

/** 懒解析日志文件路径；配置读取失败时退回仅控制台输出 */
const resolveLogFile = (): string | null => {
  if (logFilePath !== undefined) return logFilePath;
  try {
    logFilePath = path.join(getLogDir(), 'pos-server.log');
  } catch {
    logFilePath = null;
  }
  return logFilePath;
};

/** 单个日志文件上限 10MB，超出后滚动为 pos-server.log.1 */
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const ROTATE_CHECK_EVERY = 500;
let writeCount = 0;

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
  const formattedArgs = args.length > 0 ? ' ' + args.map(a => {
    if (typeof a === 'object') {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  }).join(' ') : '';

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
  } else {
    // 独立运行模式：使用 console
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else if (level === 'debug') {
      console.debug(formatted);
    } else {
      console.log(formatted);
    }
  }
};

export const logger: Logger = {
  info: (message: string, ...args: unknown[]) => writeLog('info', message, args),
  warn: (message: string, ...args: unknown[]) => writeLog('warn', message, args),
  error: (message: string, ...args: unknown[]) => writeLog('error', message, args),
  debug: (message: string, ...args: unknown[]) => writeLog('debug', message, args),
};

export default logger;
