const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 导入路由
const authRoutes = require('./routes/auth');
const whatsappRoutes = require('./routes/whatsapp');
const groupRoutes = require('./routes/groups');
const systemRoutes = require('./routes/system');
const announcementRoutes = require('./routes/announcements');
const updateRoutes = require('./routes/update');

// 导入服务
const logger = require('./utils/logger');
const { initializeDataFolders } = require('./utils/fileManager');

// 根据环境选择配置文件
const env = process.env.NODE_ENV || 'development';
let supabaseConfig;

// 加载数据库配置
supabaseConfig = require('./config');
const { testConnection } = supabaseConfig;
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 9001;

console.log('🚀 正在启动WhatsApp系统后端服务器...');
console.log('📍 端口:', PORT);
console.log('📁 数据目录:', process.argv.length > 2 ? process.argv[2] : '默认');
console.log('🔧 环境:', process.env.NODE_ENV || 'development');
console.log('⚙️ Electron模式:', process.env.ELECTRON_MODE === 'true' ? '是' : '否');

// 中间件
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 初始化数据文件夹
initializeDataFolders();

// 静态文件服务 - 使用动态路径
const getQrDir = () => {
  // 如果从命令行参数接收到数据目录路径，使用它
  if (process.argv.length > 2 && process.argv[2]) {
    const qrDir = path.join(process.argv[2], 'qr');
    console.log('Using QR directory from command line argument:', qrDir);
    return qrDir;
  }
  
  // 如果设置了环境变量DATA_DIR，优先使用
  if (process.env.DATA_DIR) {
    const qrDir = path.join(process.env.DATA_DIR, 'qr');
    console.log('Using QR directory from environment variable:', qrDir);
    return qrDir;
  }
  
  // Electron环境的特殊处理
  if (process.env.ELECTRON_MODE === 'true') {
    // 在打包环境中，优先使用用户数据目录
    if (process.resourcesPath) {
      try {
        // 尝试获取electron的app对象
        const { app } = require('electron');
        if (app) {
          const userDataPath = path.join(app.getPath('userData'), 'data', 'qr');
          console.log('Using Electron user QR path:', userDataPath);
          return userDataPath;
        }
      } catch (e) {
        console.log('Failed to get electron app object for QR directory, using fallback:', e.message);
      }
      
      // 如果无法获取app对象，使用用户数据目录
      const os = require('os');
      const platform = process.platform;
      let qrDir;
      
      if (platform === 'win32') {
        qrDir = path.join(os.homedir(), 'AppData', 'Roaming', 'whatsapp-system', 'data', 'qr');
      } else if (platform === 'darwin') {
        qrDir = path.join(os.homedir(), 'Library', 'Application Support', 'whatsapp-system', 'data', 'qr');
      } else {
        qrDir = path.join(os.homedir(), '.whatsapp-system', 'data', 'qr');
      }
      
      console.log('Using fallback user QR path:', qrDir);
      return qrDir;
    }
  }
  
  // 检查是否是ncc打包后的环境
  const isNccBundle = typeof process.pkg !== 'undefined' || 
                     (process.versions && process.versions.node && 
                      __dirname && !__dirname.includes('node_modules'));
  
  if (isNccBundle) {
    // ncc打包后的环境，使用当前目录下的data/qr目录
    const qrDir = path.join(process.cwd(), 'data', 'qr');
    console.log('Using NCC bundled QR path:', qrDir);
    return qrDir;
  }
  
  // 否则使用默认路径
  const qrDir = path.join(__dirname, '../data/qr');
  console.log('Using default QR path:', qrDir);
  return qrDir;
};

// 确保QR目录存在
const ensureQrDirExists = (qrDir) => {
  try {
    if (!fs.existsSync(qrDir)) {
      console.log('QR directory does not exist, creating it:', qrDir);
      fs.mkdirSync(qrDir, { recursive: true });
    }
    
    // 检查目录权限
    const testFile = path.join(qrDir, '.permission_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('QR directory permissions verified:', qrDir);
  } catch (error) {
    console.error('Failed to ensure QR directory exists:', error);
    throw error;
  }
};

const qrDir = getQrDir();
ensureQrDirExists(qrDir);

// 配置静态文件服务，添加缓存控制
app.use('/qr', express.static(qrDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.png')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/update', updateRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp系统后端运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 启动服务器
app.listen(PORT, async () => {
  logger.info(`WhatsApp系统后端启动成功`);
  logger.info(`服务器运行在端口: ${PORT}`);
  logger.info(`健康检查: http://localhost:${PORT}/api/health`);
  logger.info(`数据目录: ${process.argv.length > 2 ? process.argv[2] : path.join(__dirname, '../data')}`);
  logger.info(`QR码目录: ${qrDir}`);
  
  // 设置定时清理QR码文件的任务，每10分钟执行一次
  const { cleanupTempFiles } = require('./utils/fileManager');
  setInterval(() => {
    logger.info('执行定时清理QR码文件任务');
    try {
      const result = cleanupTempFiles();
      if (result.success) {
        logger.info(`定时清理QR码文件任务完成，清理了 ${result.cleanedCount || 0} 个文件`);
      } else {
        logger.error('定时清理QR码文件任务失败:', result.error);
      }
    } catch (error) {
      logger.error('执行定时清理QR码文件任务时发生错误:', error);
    }
  }, 10 * 60 * 1000);
  
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (dbConnected) {
    logger.info('✅ 远程数据库连接成功');
  } else {
    logger.error('❌ 数据库连接失败，请检查Supabase配置');
  }

  // 尝试自动连接WhatsApp
  logger.info('🔄 正在尝试自动连接WhatsApp...');
  try {
    await whatsappService.initialize();
    logger.info('✅ WhatsApp服务初始化成功');
  } catch (err) {
    logger.error('❌ WhatsApp自动连接失败:', err);
  }
  
  // 如果在Electron环境中，发送启动成功消息给主进程
  if (process.env.ELECTRON_MODE === 'true' && process.send) {
    process.send({
      type: 'backend-started',
      port: PORT,
      message: 'Backend started successfully',
      dataDir: process.argv.length > 2 ? process.argv[2] : path.join(__dirname, '../data')
    });
  }
  
  // 输出成功启动消息到控制台
  console.log(`\n✅ 服务器启动成功!`);
  console.log(`🌐 端口: ${PORT}`);
  console.log(`📁 数据目录: ${process.argv.length > 2 ? process.argv[2] : path.join(__dirname, '../data')}`);
  console.log(`🔗 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`⚙️ 环境: ${process.env.NODE_ENV || 'development'}`);
});

// 捕获未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  console.error('未处理的Promise拒绝:', reason);
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  logger.error('未处理的异常:', error);
  console.error('未处理的异常:', error);
  process.exit(1);
});

// 优雅关闭
const gracefulShutdown = async (signal) => {
  logger.info(`收到${signal}信号，正在关闭服务器...`);
  
  // 在关闭时不主动断开WhatsApp连接，以允许会话持久化
  // Baileys的useMultiFileAuthState会在creds.update时自动保存状态
  logger.info('服务器准备关闭，WhatsApp会话将保持...');
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
