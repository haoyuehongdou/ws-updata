const fs = require('fs');
const path = require('path');

// 获取数据目录路径
const getDataDir = () => {
  // 如果从命令行参数接收到数据目录路径，使用它
  if (process.argv.length > 2 && process.argv[2]) {
    console.log('Using data directory from command line argument:', process.argv[2]);
    return process.argv[2];
  }
  
  // 如果设置了环境变量DATA_DIR，优先使用
  if (process.env.DATA_DIR) {
    console.log('Using data directory from environment variable:', process.env.DATA_DIR);
    return process.env.DATA_DIR;
  }
  
  // Electron环境的特殊处理
  if (process.env.ELECTRON_MODE === 'true') {
    // 在打包环境中，优先使用用户数据目录
    if (process.resourcesPath) {
      try {
        // 尝试获取electron的app对象
        const { app } = require('electron');
        if (app) {
          const userDataPath = path.join(app.getPath('userData'), 'data');
          console.log('Using Electron user data path:', userDataPath);
          return userDataPath;
        }
      } catch (e) {
        console.log('Failed to get electron app object, using fallback:', e.message);
      }
      
      // 如果无法获取app对象，使用用户数据目录
      const os = require('os');
      const platform = process.platform;
      let userDataPath;
      
      if (platform === 'win32') {
        userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'whatsapp-system', 'data');
      } else if (platform === 'darwin') {
        userDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'whatsapp-system', 'data');
      } else {
        userDataPath = path.join(os.homedir(), '.whatsapp-system', 'data');
      }
      
      console.log('Using fallback user data path:', userDataPath);
      return userDataPath;
    }
  }
  
  // 检查是否是ncc打包后的环境
  const isNccBundle = typeof process.pkg !== 'undefined' || 
                     (process.versions && process.versions.node && 
                      __dirname && !__dirname.includes('node_modules'));
  
  if (isNccBundle) {
    // ncc打包后的环境，使用当前目录下的data目录
    const nccDataPath = path.join(process.cwd(), 'data');
    console.log('Using NCC bundled data path:', nccDataPath);
    return nccDataPath;
  }
  
  // 开发环境，使用项目根目录下的data目录
  // 修复：确保在开发环境中正确识别项目根目录
  const projectRoot = path.join(__dirname, '../../');
  const devDataPath = path.join(projectRoot, 'data');
  console.log('Using development data path:', devDataPath);
  return devDataPath;
};

// 定义数据目录路径
const DATA_DIR = getDataDir();

console.log('Resolved DATA_DIR:', DATA_DIR);
console.log('ELECTRON_MODE:', process.env.ELECTRON_MODE);
console.log('resourcesPath:', process.resourcesPath);

// 数据文件夹路径
const QR_DIR = path.join(DATA_DIR, 'qr');
const AUTH_DIR = path.join(DATA_DIR, 'auth');
const BILLS_DIR = path.join(DATA_DIR, 'bills');
const GROUPS_DIR = path.join(DATA_DIR, 'groups');
const SETTINGS_DIR = path.join(DATA_DIR, 'settings');
const CONFIG_DIR = path.join(DATA_DIR, 'config'); // 添加CONFIG_DIR定义
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 确保文件夹存在
function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('Created directory:', dirPath);
    }
  } catch (error) {
    console.error('Failed to create directory:', dirPath, error);
    throw error;
  }
}

// 确保QR目录存在并具有正确的权限
function ensureQrDir() {
  try {
    ensureDir(QR_DIR);
    
    // 检查目录权限
    try {
      const testFile = path.join(QR_DIR, '.permission_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log('QR directory permissions verified:', QR_DIR);
    } catch (permError) {
      console.error('QR directory permission test failed:', permError);
      throw new Error('QR directory does not have write permissions');
    }
  } catch (error) {
    console.error('Failed to ensure QR directory exists:', error);
    throw error;
  }
}

// 初始化所有数据文件夹
function initializeDataFolders() {
  // 确保所有子目录都存在
  const subFolders = [QR_DIR, AUTH_DIR, BILLS_DIR, GROUPS_DIR, SETTINGS_DIR, CONFIG_DIR, LOGS_DIR];
  subFolders.forEach(folder => {
    ensureDir(folder);
  });

  // 每次启动都检查并创建丢失的默认配置文件
  initializeDefaultFiles();

  // 特别确保QR目录存在并具有正确的权限
  try {
    ensureQrDir();
  } catch (error) {
    console.error('Failed to initialize QR directory:', error);
    // 不抛出错误，允许系统继续运行，但QR功能可能不可用
  }
}

// 初始化默认配置文件
function initializeDefaultFiles() {
  // 默认命令配置
  const commandsFile = path.join(CONFIG_DIR, 'commands.json');
  if (!fs.existsSync(commandsFile)) {
    const defaultCommands = {
      show: '/show',
      js: '/js',
      back: '/back',
      on: '/on',
      off: '/off',
      myid: '/myid'
    };
    fs.writeFileSync(commandsFile, JSON.stringify(defaultCommands, null, 2));
    console.log('Created default commands.json:', commandsFile);
  }

  // 默认系统设置
  const systemFile = path.join(SETTINGS_DIR, 'system.json');
  if (!fs.existsSync(systemFile)) {
    const defaultSystem = {
      broadcastDelay: 2000,
      autoConnect: true,
      maxRetries: 3,
      proxy: {
        enabled: false,
        url: '' // 例如: socks5://127.0.0.1:10808
      }
    };
    fs.writeFileSync(systemFile, JSON.stringify(defaultSystem, null, 2));
  }

  // 管理员列表
  const adminsFile = path.join(CONFIG_DIR, 'admins.json');
  if (!fs.existsSync(adminsFile)) {
    fs.writeFileSync(adminsFile, JSON.stringify([], null, 2));
  }

  // 群组分组配置
  const groupCategoriesFile = path.join(GROUPS_DIR, 'categories.json');
  if (!fs.existsSync(groupCategoriesFile)) {
    fs.writeFileSync(groupCategoriesFile, JSON.stringify([], null, 2));
  }
}

// JSON文件操作
const jsonFile = {
  read(filePath, defaultValue = null) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
      return defaultValue;
    } catch (error) {
      console.error(`读取文件失败 ${filePath}:`, error);
      return defaultValue;
    }
  },

  write(filePath, data) {
    try {
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error(`写入文件失败 ${filePath}:`, error);
      return false;
    }
  },

  append(filePath, data) {
    try {
      const existing = this.read(filePath, []);
      if (Array.isArray(existing)) {
        existing.push(data);
        return this.write(filePath, existing);
      }
      return false;
    } catch (error) {
      console.error(`追加文件失败 ${filePath}:`, error);
      return false;
    }
  }
};

// 获取配置文件路径
const getFilePaths = () => ({
  commands: path.join(CONFIG_DIR, 'commands.json'),
  system: path.join(SETTINGS_DIR, 'system.json'), // 修复：系统设置文件应该位于SETTINGS_DIR而不是CONFIG_DIR
  admins: path.join(CONFIG_DIR, 'admins.json'),
  groupCategories: path.join(DATA_DIR, 'groups', 'categories.json'),
  groupAssignments: path.join(DATA_DIR, 'groups', 'assignments.json'),
  broadcastHistory: path.join(DATA_DIR, 'broadcast-history.json'),
  qrCode: path.join(QR_DIR, 'latest.png'),
  authState: path.join(DATA_DIR, 'auth', 'state.json')
});

// 账单文件操作
const billsManager = {
  getGroupBillPath(groupId) {
    return path.join(BILLS_DIR, `${groupId}.json`);
  },

  getGroupBill(groupId) {
    const filePath = this.getGroupBillPath(groupId);
    const bill = jsonFile.read(filePath, {
      groupId,
      groupName: '',
      isActive: false,
      transactions: [],
      total: 0,
      lastUpdated: new Date().toISOString()
    });
    
    // 确保participantHistory字段存在
    if (!bill.participantHistory) {
      bill.participantHistory = [];
    }
    
    return bill;
  },

  saveGroupBill(groupId, billData) {
    const filePath = this.getGroupBillPath(groupId);
    billData.lastUpdated = new Date().toISOString();
    return jsonFile.write(filePath, billData);
  },

  getAllBills() {
    const bills = [];
    try {
      const files = fs.readdirSync(BILLS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const groupId = file.replace('.json', '');
          const bill = this.getGroupBill(groupId);
          bills.push(bill);
        }
      }
    } catch (error) {
      console.error('读取账单文件夹失败:', error);
    }
    return bills;
  },

  deleteGroupBill(groupId) {
    const filePath = this.getGroupBillPath(groupId);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`删除账单失败 ${groupId}:`, error);
      return false;
    }
  }
};

// 清理临时文件
function cleanupTempFiles() {
  try {
    // 清理QR码文件（增加到20分钟，给用户更多时间扫描）
    if (fs.existsSync(QR_DIR)) {
      const files = fs.readdirSync(QR_DIR);
      let cleanedCount = 0;
      const now = Date.now();
      const maxAge = 20 * 60 * 1000; // 20分钟
      
      files.forEach(file => {
        try {
          const filePath = path.join(QR_DIR, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile() && (now - stats.mtime.getTime() > maxAge)) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old QR file: ${file}`);
            cleanedCount++;
          }
        } catch (fileError) {
          console.error(`Error processing file ${file} during cleanup:`, fileError);
        }
      });
      
      console.log(`QR cleanup completed. Cleaned ${cleanedCount} files.`);
      return { success: true, cleanedCount };
    } else {
      console.log('QR directory does not exist, skipping cleanup.');
      return { success: true, cleanedCount: 0 };
    }
  } catch (error) {
    console.error('Error during temp files cleanup:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  DATA_DIR,
  QR_DIR,
  AUTH_DIR,
  BILLS_DIR,
  GROUPS_DIR,
  SETTINGS_DIR,
  CONFIG_DIR,
  LOGS_DIR,
  initializeDataFolders,
  ensureDir,
  jsonFile,
  getFilePaths,
  billsManager,
  cleanupTempFiles
};
