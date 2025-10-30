const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { jsonFile, getFilePaths } = require('../utils/fileManager');
const logger = require('../utils/logger');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

// 获取系统设置
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const settings = jsonFile.read(getFilePaths().system, {
      broadcastDelay: 2000,
      maxRetries: 5,
      reconnectDelay: 5000,
      qrTimeout: 60000,
      keepAliveInterval: 10000,
      autoReconnect: true,
      proxyEnabled: true,
      proxyHost: '127.0.0.1',
      proxyPort: 10808,
      logLevel: 'info',
      maxConcurrentSends: 1,
      sendTimeout: 30000,
      groupLoadDelay: 2000,
      messageRetryCount: 3,
      enableNotifications: true,
      theme: 'light'
    });
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.whatsapp.error('获取系统设置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取系统设置失败'
    });
  }
});

// 更新系统设置
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: '设置格式错误'
      });
    }
    
    // 验证设置项
    const validationRules = {
      broadcastDelay: { type: 'number', min: 1000, max: 60000 },
      maxRetries: { type: 'number', min: 1, max: 10 },
      reconnectDelay: { type: 'number', min: 1000, max: 60000 },
      qrTimeout: { type: 'number', min: 30000, max: 300000 },
      keepAliveInterval: { type: 'number', min: 5000, max: 60000 },
      proxyPort: { type: 'number', min: 1, max: 65535 },
      maxConcurrentSends: { type: 'number', min: 1, max: 10 },
      sendTimeout: { type: 'number', min: 10000, max: 120000 },
      groupLoadDelay: { type: 'number', min: 1000, max: 10000 },
      messageRetryCount: { type: 'number', min: 1, max: 5 }
    };
    
    // 验证数值设置
    for (const [key, rule] of Object.entries(validationRules)) {
      if (settings[key] !== undefined) {
        const value = settings[key];
        if (typeof value !== rule.type) {
          return res.status(400).json({
            success: false,
            message: `${key}必须是${rule.type}类型`
          });
        }
        if (rule.min !== undefined && value < rule.min) {
          return res.status(400).json({
            success: false,
            message: `${key}不能小于${rule.min}`
          });
        }
        if (rule.max !== undefined && value > rule.max) {
          return res.status(400).json({
            success: false,
            message: `${key}不能大于${rule.max}`
          });
        }
      }
    }
    
    // 验证代理主机
    if (settings.proxyHost && typeof settings.proxyHost !== 'string') {
      return res.status(400).json({
        success: false,
        message: '代理主机必须是字符串'
      });
    }
    
    // 获取当前设置并合并
    const currentSettings = jsonFile.read(getFilePaths().system, {});
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    jsonFile.write(getFilePaths().system, updatedSettings);
    
    logger.whatsapp.info('系统设置已更新', { 
      updatedKeys: Object.keys(settings),
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '设置已更新',
      settings: updatedSettings
    });
  } catch (error) {
    logger.whatsapp.error('更新系统设置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新设置失败'
    });
  }
});

// 重置系统设置
router.post('/settings/reset', authenticateToken, async (req, res) => {
  try {
    const defaultSettings = {
      broadcastDelay: 2000,
      maxRetries: 5,
      reconnectDelay: 5000,
      qrTimeout: 60000,
      keepAliveInterval: 10000,
      autoReconnect: true,
      proxyEnabled: true,
      proxyHost: '127.0.0.1',
      proxyPort: 10808,
      logLevel: 'info',
      maxConcurrentSends: 1,
      sendTimeout: 30000,
      groupLoadDelay: 2000,
      messageRetryCount: 3,
      enableNotifications: true,
      theme: 'light',
      resetAt: new Date().toISOString(),
      resetBy: req.user.id
    };
    
    jsonFile.write(getFilePaths().system, defaultSettings);
    
    logger.whatsapp.info('系统设置已重置', { 
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '设置已重置为默认值',
      settings: defaultSettings
    });
  } catch (error) {
    logger.whatsapp.error('重置系统设置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '重置设置失败'
    });
  }
});

// 获取系统信息
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const os = require('os');
    const packageInfo = require('../package.json');
    
    const systemInfo = {
      version: packageInfo.version,
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: process.memoryUsage()
      },
      cpu: {
        model: os.cpus()[0]?.model || 'Unknown',
        cores: os.cpus().length
      },
      network: os.networkInterfaces(),
      loadAverage: os.loadavg(),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      systemInfo
    });
  } catch (error) {
    logger.whatsapp.error('获取系统信息失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取系统信息失败'
    });
  }
});

// 获取日志级别
router.get('/log-levels', authenticateToken, async (req, res) => {
  try {
    const logLevels = [
      { value: 'error', label: '错误' },
      { value: 'warn', label: '警告' },
      { value: 'info', label: '信息' },
      { value: 'debug', label: '调试' }
    ];
    
    res.json({
      success: true,
      logLevels
    });
  } catch (error) {
    logger.whatsapp.error('获取日志级别失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取日志级别失败'
    });
  }
});

// 测试代理连接
router.post('/test-proxy', authenticateToken, async (req, res) => {
  try {
    const { host, port } = req.body;
    
    if (!host || !port) {
      return res.status(400).json({
        success: false,
        message: '代理主机和端口不能为空'
      });
    }
    
    const net = require('net');
    
    const testResult = await new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          message: '连接超时',
          latency: -1
        });
      }, 5000);

      const startTime = Date.now();
      
      socket.connect(port, host, () => {
        const latency = Date.now() - startTime;
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: true,
          message: '连接成功',
          latency
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          message: `连接失败: ${err.message}`,
          latency: -1
        });
      });
    });
    
    logger.whatsapp.info('代理连接测试', { 
      host,
      port,
      result: testResult,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      testResult
    });
  } catch (error) {
    logger.whatsapp.error('代理连接测试失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '代理连接测试失败'
    });
  }
});

// 清理系统缓存
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { QR_DIR, AUTH_DIR, cleanupTempFiles } = require('../utils/fileManager');
    
    let cleanedFiles = 0;
    let qrCleanedCount = 0;
    
    // 使用专门的清理函数清理QR码文件
    try {
      const qrResult = cleanupTempFiles();
      if (qrResult.success) {
        qrCleanedCount = qrResult.cleanedCount || 0;
        cleanedFiles += qrCleanedCount;
        logger.whatsapp.info(`已使用cleanupTempFiles函数清理QR码文件，清理了 ${qrCleanedCount} 个文件`);
      } else {
        logger.whatsapp.warn('使用cleanupTempFiles函数清理QR码文件失败:', { error: qrResult.error });
      }
    } catch (error) {
      logger.whatsapp.warn('使用cleanupTempFiles函数清理QR码文件失败:', { error: error.message });
    }
    
    // 清理认证文件（可选）
    let authCleanedCount = 0;
    if (req.body.clearAuth === true) {
      try {
        if (fs.existsSync(AUTH_DIR)) {
          const authFiles = fs.readdirSync(AUTH_DIR);
          authFiles.forEach(file => {
            const filePath = path.join(AUTH_DIR, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
              authCleanedCount++;
              cleanedFiles++;
            }
          });
          logger.whatsapp.info(`已清理认证文件，清理了 ${authCleanedCount} 个文件`);
        }
      } catch (authError) {
        logger.whatsapp.warn('清理认证文件失败:', { error: authError.message });
      }
    }
    
    // 清理临时文件
    let tempCleanedCount = 0;
    const tempDir = path.join(__dirname, '../../temp');
    try {
      if (fs.existsSync(tempDir)) {
        const tempFiles = fs.readdirSync(tempDir);
        tempFiles.forEach(file => {
          const filePath = path.join(tempDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            tempCleanedCount++;
            cleanedFiles++;
          }
        });
        logger.whatsapp.info(`已清理临时文件，清理了 ${tempCleanedCount} 个文件`);
      }
    } catch (tempError) {
      logger.whatsapp.warn('清理临时文件失败:', { error: tempError.message });
    }
    
    logger.whatsapp.info('系统缓存已清理', { 
      cleanedFiles,
      qrCleanedCount,
      authCleanedCount,
      tempCleanedCount,
      clearAuth: req.body.clearAuth === true,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: `已清理系统缓存${req.body.clearAuth === true ? '和认证文件' : ''}`,
      cleanedFiles,
      details: {
        qrFiles: qrCleanedCount,
        authFiles: authCleanedCount,
        tempFiles: tempCleanedCount
      }
    });
  } catch (error) {
    logger.whatsapp.error('清理系统缓存失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '清理缓存失败'
    });
  }
});

// 断开WhatsApp连接
router.post('/whatsapp/disconnect', authenticateToken, async (req, res) => {
  try {
    logger.whatsapp.info('收到断开连接请求', { userId: req.user.id });
    const result = await whatsappService.disconnect();
    
    if (result.success) {
      // 在成功断开后，立即开始新的初始化流程
      logger.whatsapp.info('断开成功，立即触发新的初始化流程');
      whatsappService.initialize();
      res.json({ success: true, message: 'WhatsApp已成功断开并开始重新初始化' });
    } else {
      res.status(500).json({ success: false, message: result.error || '断开连接失败' });
    }
  } catch (error) {
    logger.whatsapp.error('处理断开连接请求失败', { error: error.message });
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

module.exports = router;
