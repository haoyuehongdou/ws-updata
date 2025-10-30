const fs = require('fs');
const path = require('path');

// 数据文件夹路径
const DATA_DIR = path.join(__dirname, '../data');
const QR_DIR = path.join(DATA_DIR, 'qr');
const AUTH_DIR = path.join(DATA_DIR, 'auth');
const BILLS_DIR = path.join(DATA_DIR, 'bills');
const GROUPS_DIR = path.join(DATA_DIR, 'groups');
const SETTINGS_DIR = path.join(DATA_DIR, 'settings');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 确保文件夹存在
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`创建目录: ${dirPath}`);
  }
}

// 初始化所有数据文件夹
function initializeDataFolders() {
  const folders = [DATA_DIR, QR_DIR, AUTH_DIR, BILLS_DIR, GROUPS_DIR, SETTINGS_DIR, LOGS_DIR];
  
  folders.forEach(folder => {
    ensureDir(folder);
  });

  // 创建默认配置文件
  initializeDefaultFiles();
}

// 初始化默认配置文件
function initializeDefaultFiles() {
  // 默认命令配置
  const commandsFile = path.join(SETTINGS_DIR, 'commands.json');
  if (!fs.existsSync(commandsFile)) {
    const defaultCommands = {
      show: '/show',
      clear: '/js',
      back: '/back',
      on: '/on',
      off: '/off',
      myid: '/myid'
    };
    fs.writeFileSync(commandsFile, JSON.stringify(defaultCommands, null, 2));
    console.log(`创建文件: ${commandsFile}`);
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
    console.log(`创建文件: ${systemFile}`);
  }

  // 管理员列表
  const adminsFile = path.join(SETTINGS_DIR, 'admins.json');
  if (!fs.existsSync(adminsFile)) {
    fs.writeFileSync(adminsFile, JSON.stringify([], null, 2));
    console.log(`创建文件: ${adminsFile}`);
  }

  // 群组分组配置
  const groupCategoriesFile = path.join(GROUPS_DIR, 'categories.json');
  if (!fs.existsSync(groupCategoriesFile)) {
    fs.writeFileSync(groupCategoriesFile, JSON.stringify([], null, 2));
    console.log(`创建文件: ${groupCategoriesFile}`);
  }
}

// 执行初始化
initializeDataFolders();
console.log('数据目录初始化完成！');