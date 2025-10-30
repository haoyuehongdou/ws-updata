const winston = require('winston');
const path = require('path');
const { LOGS_DIR, ensureDir } = require('./fileManager');

// 确保日志目录存在
ensureDir(LOGS_DIR);

// 创建Winston日志器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-system' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // 合并日志文件
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 如果不是生产环境，也输出到控制台
if (process.env.NODE_ENV !== 'production' || process.env.ELECTRON_MODE === 'true' || process.env.LOG_LEVEL === 'debug') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
      })
    )
  }));
}

// 日志方法封装
const logMethods = {
  // 系统日志
  info: (message, meta = {}) => logger.info(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),

  // WhatsApp相关日志
  whatsapp: {
    info: (message, meta = {}) => logger.info(message, { ...meta, component: 'whatsapp' }),
    error: (message, meta = {}) => logger.error(message, { ...meta, component: 'whatsapp' }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, component: 'whatsapp' }),
    debug: (message, meta = {}) => logger.debug(message, { ...meta, component: 'whatsapp' })
  },

  // 账单相关日志
  billing: {
    info: (message, meta = {}) => logger.info(message, { ...meta, component: 'billing' }),
    error: (message, meta = {}) => logger.error(message, { ...meta, component: 'billing' }),
    transaction: (groupId, operation, amount, note, userId) => {
      logger.info('账单操作', {
        groupId,
        operation,
        amount,
        note,
        userId,
        timestamp: new Date().toISOString(),
        component: 'billing'
      });
    }
  },

  // 群发相关日志
  broadcast: {
    info: (message, meta = {}) => logger.info(message, { ...meta, component: 'broadcast' }),
    error: (message, meta = {}) => logger.error(message, { ...meta, component: 'broadcast' }),
    start: (totalGroups, message) => {
      logger.info('群发开始', {
        totalGroups,
        message: message.substring(0, 100), // 只记录前100个字符
        timestamp: new Date().toISOString(),
        component: 'broadcast'
      });
    },
    complete: (totalGroups, successCount, errorCount) => {
      logger.info('群发完成', {
        totalGroups,
        successCount,
        errorCount,
        timestamp: new Date().toISOString(),
        component: 'broadcast'
      });
    },
    groupResult: (groupId, groupName, success, error) => {
      logger.info('群发结果', {
        groupId,
        groupName,
        success,
        error: error || null,
        timestamp: new Date().toISOString(),
        component: 'broadcast'
      });
    }
  }
};

module.exports = logMethods;
