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

// 中间件
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 初始化数据文件夹
initializeDataFolders();

// 静态文件服务
app.use('/qr', express.static(path.join(__dirname, '../data/qr')));

// 静态文件服务 - 用于生产环境
if (process.env.NODE_ENV === 'production') {
  // Electron环境中的路径处理
  const isElectron = process.env.ELECTRON_MODE === 'true';
  let frontendPath;
  
  if (isElectron) {
    // Electron环境中，前端文件在app目录
    frontendPath = path.join(process.resourcesPath, 'app');
  } else {
    // 普通生产环境中，前端文件在dist目录
    frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
  }
  
  // 检查前端文件是否存在
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    
    // 对于所有非API路由，返回index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  } else {
    logger.warn(`Frontend build not found at ${frontendPath}`);
  }
}

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/announcements', announcementRoutes);

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
const server = app.listen(PORT, async () => {
  logger.info(`WhatsApp系统后端启动成功`);
  logger.info(`服务器运行在端口: ${PORT}`);
  logger.info(`健康检查: http://localhost:${PORT}/api/health`);
  
  // 如果在Electron环境中，发送启动成功消息给主进程
  if (process.env.ELECTRON_MODE === 'true' && process.send) {
    process.send({
      type: 'backend-started',
      port: PORT,
      message: 'Backend started successfully'
    });
  }
  
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
});

// 优雅关闭
const gracefulShutdown = async (signal) => {
  logger.info(`收到${signal}信号，正在关闭服务器...`);
  
  try {
    logger.info('正在断开WhatsApp连接...');
    await whatsappService.disconnect();
    logger.info('WhatsApp连接已断开');
  } catch (error) {
    logger.error('关闭WhatsApp连接时出错:', error);
  } finally {
    logger.info('服务器已关闭');
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
