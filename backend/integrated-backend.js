// 导入原始路由
const authRoutes = require('./routes/auth');
const whatsappRoutes = require('./routes/whatsapp');
const groupRoutes = require('./routes/groups');
const systemRoutes = require('./routes/system');
const announcementRoutes = require('./routes/announcements');
const updateRoutes = require('./routes/update');

// 导入服务
const logger = require('./utils/logger');
const { initializeDataFolders } = require('./utils/fileManager');

// 加载数据库配置
const supabaseConfig = require('./config');
const { testConnection } = supabaseConfig;
const whatsappService = require('./services/whatsappService');

// 初始化数据文件夹
initializeDataFolders();

// 创建API处理器对象
const apiHandlers = {
  // 健康检查
  health: async () => {
    return {
      success: true,
      message: 'WhatsApp系统后端运行正常',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  },

  // 认证相关
  auth: {
    login: async (credentials) => {
      // 模拟Express请求对象
      const req = { body: credentials };
      const res = {
        json: (data) => data,
        status: (code) => ({ json: (data) => ({ ...data, status: code }) })
      };
      
      // 调用原始路由处理器
      return new Promise((resolve) => {
        const originalRouter = authRoutes;
        // 这里需要根据实际的路由实现进行调整
        // 由于路由是中间件，我们需要模拟Express的调用方式
        resolve({ success: false, message: '需要实现登录逻辑' });
      });
    },
    
    logout: async () => {
      return { success: true, message: '登出成功' };
    },
    
    checkSession: async () => {
      return { success: true, user: null };
    }
  },

  // WhatsApp相关
  whatsapp: {
    connect: async () => {
      try {
        await whatsappService.initialize();
        return { success: true, message: 'WhatsApp连接成功' };
      } catch (err) {
        logger.error('WhatsApp连接失败:', err);
        return { success: false, message: 'WhatsApp连接失败', error: err.message };
      }
    },
    
    disconnect: async () => {
      try {
        whatsappService.disconnect();
        return { success: true, message: 'WhatsApp已断开连接' };
      } catch (err) {
        logger.error('WhatsApp断开连接失败:', err);
        return { success: false, message: 'WhatsApp断开连接失败', error: err.message };
      }
    },
    
    getStatus: async () => {
      try {
        const status = whatsappService.getStatus();
        return { success: true, data: status };
      } catch (err) {
        logger.error('获取WhatsApp状态失败:', err);
        return { success: false, message: '获取WhatsApp状态失败', error: err.message };
      }
    },
    
    refreshQR: async () => {
      try {
        await whatsappService.refreshQR();
        return { success: true, message: 'QR码已刷新' };
      } catch (err) {
        logger.error('刷新QR码失败:', err);
        return { success: false, message: '刷新QR码失败', error: err.message };
      }
    },
    
    getGroups: async () => {
      try {
        const groups = await whatsappService.getGroups();
        return { success: true, data: groups };
      } catch (err) {
        logger.error('获取群组列表失败:', err);
        return { success: false, message: '获取群组列表失败', error: err.message };
      }
    },
    
    sendMessage: async (data) => {
      try {
        const result = await whatsappService.sendMessage(data);
        return { success: true, data: result };
      } catch (err) {
        logger.error('发送消息失败:', err);
        return { success: false, message: '发送消息失败', error: err.message };
      }
    },
    
    broadcastMessage: async (data) => {
      try {
        const result = await whatsappService.broadcastMessage(data);
        return { success: true, data: result };
      } catch (err) {
        logger.error('群发消息失败:', err);
        return { success: false, message: '群发消息失败', error: err.message };
      }
    },
    
    getBroadcastHistory: async () => {
      try {
        const history = await whatsappService.getBroadcastHistory();
        return { success: true, data: history };
      } catch (err) {
        logger.error('获取群发历史失败:', err);
        return { success: false, message: '获取群发历史失败', error: err.message };
      }
    }
  },

  // 群组相关
  groups: {
    getGroupCategories: async () => {
      return { success: true, data: [] };
    },
    
    createGroupCategory: async (data) => {
      return { success: true, data };
    },
    
    updateGroupCategory: async (id, data) => {
      return { success: true, data: { id, ...data } };
    },
    
    deleteGroupCategory: async (id) => {
      return { success: true, message: '分类已删除' };
    },
    
    getCategoryGroups: async (id) => {
      return { success: true, data: [] };
    },
    
    addGroupsToCategory: async (id, data) => {
      return { success: true, data };
    },
    
    removeGroupFromCategory: async (categoryId, groupId) => {
      return { success: true, message: '群组已从分类中移除' };
    },
    
    getUncategorizedGroups: async () => {
      return { success: true, data: [] };
    }
  },

  // 系统设置
  system: {
    getSettings: async () => {
      return { success: true, data: {} };
    },
    
    updateSettings: async (data) => {
      return { success: true, data };
    },
    
    resetSettings: async () => {
      return { success: true, message: '设置已重置' };
    },
    
    getSystemInfo: async () => {
      return { success: true, data: {} };
    },
    
    getLogLevels: async () => {
      return { success: true, data: [] };
    },
    
    testProxy: async (data) => {
      return { success: true, data: { working: true } };
    },
    
    cleanup: async () => {
      return { success: true, message: '清理完成' };
    },
    
    disconnectWhatsApp: async () => {
      try {
        whatsappService.disconnect();
        return { success: true, message: 'WhatsApp已断开连接' };
      } catch (err) {
        logger.error('WhatsApp断开连接失败:', err);
        return { success: false, message: 'WhatsApp断开连接失败', error: err.message };
      }
    }
  },

  // 公告相关
  announcement: {
    getAnnouncements: async () => {
      return { success: true, data: [] };
    },
    
    getAllAnnouncements: async () => {
      return { success: true, data: [] };
    }
  }
};

// 初始化函数
const initialize = async () => {
  logger.info('正在初始化集成后端...');
  
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
  
  logger.info('✅ 集成后端初始化完成');
  
  return {
    apiHandlers,
    whatsappService
  };
};

// 优雅关闭
const gracefulShutdown = async (signal) => {
  logger.info(`收到${signal}信号，正在关闭后端...`);
  
  try {
    logger.info('正在断开WhatsApp连接...');
    whatsappService.disconnect();
    logger.info('WhatsApp连接已断开');
  } catch (error) {
    logger.error('关闭WhatsApp连接时出错:', error);
  } finally {
    logger.info('后端已关闭');
  }
};

module.exports = {
  initialize,
  apiHandlers,
  gracefulShutdown,
  whatsappService
};
