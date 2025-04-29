/**
 * Logger utility for colored and formatted console logs
 * Supports different log levels with distinct colors and source information
 */
import { config } from '../config';

// ANSI color codes for terminal colors
const colors = {
  reset: '\x1b[0m',
  // Regular colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Log level configuration
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

// Log level numeric values for comparison
const logLevelValues: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

// Get the configured log level from our unified config
const configuredLogLevel = (config.logging.level as LogLevel) || LogLevel.INFO;

// Map log levels to colors
const logLevelColors = {
  [LogLevel.DEBUG]: colors.cyan,
  [LogLevel.INFO]: colors.green,
  [LogLevel.WARN]: colors.yellow,
  [LogLevel.ERROR]: colors.red,
  [LogLevel.FATAL]: colors.bgRed + colors.white,
};

// Format the timestamp for logs
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

// Get the calling source/file name and line number
function getCallerInfo(): string {
  try {
    const stackLines = new Error().stack?.split('\n') || [];
    
    // We need to skip Error creation, getCallerInfo, log, and logger method (e.g., logger.info)
    // So we start at index 4 to get the actual caller
    let callerLine = '';
    for (let i = 4; i < stackLines.length; i++) {
      // Skip any lines that refer to the logger itself
      if (!stackLines[i].includes('/utils/logger.ts') && 
          !stackLines[i].includes('\\utils\\logger.ts') &&
          !stackLines[i].includes('/node_modules/')) {
        callerLine = stackLines[i];
        break;
      }
    }
    
    if (!callerLine) {
      return 'unknown:0';
    }
    
    // Extract file and line information from the stack trace
    const match = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/) ||
                 callerLine.match(/at\s+()(.*):(\d+):(\d+)/);
                 
    if (match) {
      const [, functionName, filePath, line] = match;
      // Extract only the file name from the path
      const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
      return `${fileName}:${line}`;
    }
  } catch (error) {
    return 'unknown:0';
  }
  
  return 'unknown:0';
}

/**
 * Check if the given log level should be logged based on the configured threshold
 */
function shouldLog(level: LogLevel): boolean {
  return logLevelValues[level] >= logLevelValues[configuredLogLevel];
}

/**
 * Log a message with the specified level and source information
 * @param level Log level
 * @param message Message or object to log
 * @param optionalParams Additional objects to log
 */
function log(level: LogLevel, message: any, ...optionalParams: any[]): void {
  // Skip logging if the level is below the configured threshold
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = getTimestamp();
  const caller = getCallerInfo();
  const color = logLevelColors[level];
  
  // Format: [TIME] [LEVEL] [SOURCE] Message
  const prefix = `${colors.brightBlue}[${timestamp}]${colors.reset} ${color}[${level}]${colors.reset} ${colors.magenta}[${caller}]${colors.reset}`;
  
  // Handle objects specially for debug level
  if (typeof message === 'object' && message !== null && level === LogLevel.DEBUG) {
    console.log(`${prefix} ${color}`);
    console.dir(message, { depth: null, colors: true });
    
    optionalParams.forEach(param => {
      if (typeof param === 'object' && param !== null) {
        console.dir(param, { depth: null, colors: true });
      } else {
        console.log(param);
      }
    });
    
    console.log(colors.reset);
  } else {
    // Ensure all non-object messages (including undefined/null) are properly stringified
    const formattedMessage = message === null || message === undefined ? String(message) : message;
    console.log(`${prefix} ${color}${formattedMessage}${colors.reset}`, ...optionalParams);
  }
}

// Exported logger interface
export const logger = {
  debug: (message: any, ...optionalParams: any[]) => log(LogLevel.DEBUG, message, ...optionalParams),
  info: (message: any, ...optionalParams: any[]) => log(LogLevel.INFO, message, ...optionalParams),
  warn: (message: any, ...optionalParams: any[]) => log(LogLevel.WARN, message, ...optionalParams),
  error: (message: any, ...optionalParams: any[]) => log(LogLevel.ERROR, message, ...optionalParams),
  fatal: (message: any, ...optionalParams: any[]) => log(LogLevel.FATAL, message, ...optionalParams),
  
  // Allow checking if a level will be logged
  willLog: (level: LogLevel): boolean => shouldLog(level),
  
  // Get the current log level
  getLogLevel: (): LogLevel => configuredLogLevel,
};

export default logger;