/**
 * 轻量级文件日志工具
 * API 兼容 electron-log 的 logger.info/warn/error 接口
 * - Electron fork 模式：输出到 stdout/stderr，由主进程捕获写入日志
 * - 独立运行模式：使用 console.log
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type Logger = {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
};

// 检测是否被 Electron fork（子进程有 IPC 通道）
const isForked = Boolean(process.send || process.channel);

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

  if (isForked) {
    // Electron fork 模式：输出到 stdout/stderr，由主进程捕获。
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
