const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const isPackaged = app.isPackaged;

let mainWindow;
let backendProcess;

// 复制目录的辅助函数
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function createWindow() {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  log(`isPackaged: ${isPackaged}`);
  log(`app.getAppPath(): ${app.getAppPath()}`);
  log(`process.resourcesPath: ${process.resourcesPath}`);
  log(`__dirname: ${__dirname}`);

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: path.join(__dirname, 'build/icon.png'),
    show: false
  });

  // 加载应用的 index.html
  let startUrl;
  
  if (isPackaged) {
    // 在打包环境中，前端文件在resources/app目录
    startUrl = `file://${path.join(process.resourcesPath, 'app/index.html')}`;
    log('Packaged mode, loading from:', startUrl);
  } else {
    // 在开发环境中，使用前端开发服务器端口
    startUrl = 'http://localhost:9000';
    log('Development mode, loading from:', startUrl);
  }
  
  // 确保URL格式正确
  if (!startUrl.startsWith('file://') && !startUrl.startsWith('http://') && !startUrl.startsWith('https://')) {
    startUrl = `file://${startUrl}`;
  }
  
  log('Final URL to load:', startUrl);
  mainWindow.loadURL(startUrl).catch(err => {
    log('Failed to load URL:', err);
    // 如果加载失败，尝试使用备用路径
    if (isPackaged) {
      const fallbackUrl = `file://${path.join(__dirname, 'resources/app/index.html')}`;
      log('Trying fallback URL:', fallbackUrl);
      mainWindow.loadURL(fallbackUrl);
    }
  });
  
  // 隐藏菜单栏
  mainWindow.setMenu(null);

  // 当窗口准备好时显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发工具
  if (!isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // 当窗口被关闭时发出
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 初始化后端服务
async function initializeBackend() {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  try {
    log('Initializing backend server...');
    
    // 确定后端路径
    let backendPath;
    let dataDir;
    
    if (isPackaged) {
      // 在打包环境中，使用ncc打包后的单文件后端
      backendPath = path.join(process.resourcesPath, 'backend/index.js');
      // 数据目录在用户数据目录中，如果不存在则复制默认数据
      dataDir = path.join(app.getPath('userData'), 'data');
      const resourceDataDir = path.join(process.resourcesPath, 'data');
      
      // 如果用户数据目录不存在，从资源目录复制
      if (!fs.existsSync(dataDir) && fs.existsSync(resourceDataDir)) {
        log('Copying data directory from resources to user data...');
        copyRecursiveSync(resourceDataDir, dataDir);
      }
    } else {
      // 在开发环境中，使用相对路径
      backendPath = path.join(__dirname, '../backend/index.js');
      dataDir = path.join(__dirname, '../data');
    }
    
    log('Backend path:', backendPath);
    log('Data directory:', dataDir);
    
    // 使用spawn启动后端服务，传递数据目录路径作为参数
    log('Starting backend with data directory:', dataDir);
    
    // 在所有环境中都使用spawn启动独立进程
    // ncc打包后的后端可以作为独立进程运行
    const nodeExecutable = 'node';
    const nodeArgs = [backendPath, dataDir];
    
    log('Node executable:', nodeExecutable);
    log('Node arguments:', nodeArgs);
    
    backendProcess = spawn(nodeExecutable, nodeArgs, {
      env: { 
        ...process.env, 
        ELECTRON_MODE: 'true',
        NODE_ENV: isPackaged ? 'production' : 'development',
        DATA_DIR: dataDir
      },
      stdio: 'pipe',
      cwd: path.dirname(backendPath)
    });
    
    // 输出处理
    backendProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      log(`Backend stdout: ${message}`);
      console.log(`[Backend] ${message}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      log(`Backend stderr: ${message}`);
      console.error(`[Backend Error] ${message}`);
    });
    
    backendProcess.on('close', (code) => {
      const message = `Backend process exited with code ${code}`;
      log(message);
      console.log(message);
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('backend-status', {
          running: false,
          message: `Backend process exited with code ${code}`
        });
      }
    });
    
    backendProcess.on('error', (err) => {
      const message = `Failed to start backend: ${err.message}`;
      log(message);
      console.error(message);
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('backend-status', {
          running: false,
          error: err.message
        });
      }
    });
    
    // 监听后端进程消息（如果有）
    if (backendProcess.on) {
      backendProcess.on('message', (message) => {
        log('Backend message:', message);
        if (message.type === 'backend-started') {
          log('Backend started successfully on port:', message.port);
          
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('backend-status', {
              running: true,
              port: message.port,
              dataDir: message.dataDir,
              message: message.message
            });
          }
        }
      });
    }
    
    // 设置简单的IPC处理器
    setupIpcHandlers();
    
    log('Backend server initialized successfully');
    
    return { gracefulShutdown: shutdownBackend };
  } catch (error) {
    log('Failed to initialize backend:', error);
    
    // 通知前端后端启动失败
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('backend-status', {
        running: false,
        error: error.message
      });
    }
    
    throw error;
  }
}

// 关闭后端服务
async function shutdownBackend() {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  return new Promise((resolve) => {
    if (backendProcess && backendProcess.kill) {
      log('Shutting down backend server...');
      
      // 发送SIGTERM信号给后端进程
      backendProcess.kill('SIGTERM');
      
      // 设置超时，如果进程没有在5秒内退出，则强制终止
      const timeout = setTimeout(() => {
        log('Backend did not exit gracefully, forcing termination');
        if (backendProcess && backendProcess.kill) {
          backendProcess.kill('SIGKILL');
        }
        backendProcess = null;
        resolve();
      }, 5000);
      
      // 监听进程退出事件
      backendProcess.on('close', () => {
        clearTimeout(timeout);
        backendProcess = null;
        log('Backend server shutdown complete');
        resolve();
      });
    } else {
      log('No backend process to shutdown');
      resolve();
    }
  });
}

// 设置IPC处理器
function setupIpcHandlers() {
  const { shell } = require('electron');
  const https = require('https');
  const http = require('http');

  // 处理API调用 - 现在后端是独立进程，不需要处理API调用
  ipcMain.handle('api', async (event, { endpoint, method, data }) => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const log = (message) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };

    try {
      log(`API call: ${endpoint}.${method}`, data);

      // 由于后端现在是独立进程，这里返回一个错误
      // 前端应该使用HTTP请求与后端通信
      return {
        success: false,
        message: 'Backend is running as a separate process, use HTTP API instead of IPC'
      };
    } catch (error) {
      log(`API error: ${endpoint}.${method}`, error);
      return {
        success: false,
        message: error.message || 'API call failed',
        error: error.toString()
      };
    }
  });

  // 保存更新文件（从渲染进程接收数据并保存）
  ipcMain.handle('save-update-file', async (event, { fileName, data }) => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const log = (message) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };

    try {
      const updatesDir = path.join(app.getPath('userData'), 'updates');

      // 确保updates目录存在
      if (!fs.existsSync(updatesDir)) {
        fs.mkdirSync(updatesDir, { recursive: true });
      }

      // 使用时间戳生成唯一文件名
      const timestamp = Date.now();
      const uniqueFileName = `update-${timestamp}-${fileName}`;
      const filePath = path.join(updatesDir, uniqueFileName);

      log(`Saving update file to: ${filePath}`);

      // 将数组转换为Buffer并保存
      const buffer = Buffer.from(data);
      fs.writeFileSync(filePath, buffer);

      log(`Update file saved successfully: ${filePath}, size: ${buffer.length} bytes`);

      return { success: true, filePath };
    } catch (error) {
      log(`Failed to save update file: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // 通过后端API下载更新文件（主进程调用后端API并保存）
  ipcMain.handle('download-update-via-backend', async (event, { url }) => {
    const http = require('http');
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const log = (message) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };

    return new Promise((resolve) => {
      try {
        const updatesDir = path.join(app.getPath('userData'), 'updates');

        // 确保updates目录存在
        if (!fs.existsSync(updatesDir)) {
          fs.mkdirSync(updatesDir, { recursive: true });
        }

        // 使用时间戳生成唯一文件名
        const timestamp = Date.now();
        const originalFileName = url.split('/').pop().split('?')[0];
        const fileName = `update-${timestamp}-${originalFileName}`;
        const filePath = path.join(updatesDir, fileName);

        log(`Downloading update via backend API from: ${url}`);
        log(`Save to: ${filePath}`);

        // 如果文件已存在，先删除
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            log(`Removed existing file: ${filePath}`);
          } catch (err) {
            log(`Failed to remove existing file: ${err.message}`);
          }
        }

        // 获取token
        event.sender.executeJavaScript('localStorage.getItem("token")').then(token => {
          const writer = fs.createWriteStream(filePath);
          let downloadedBytes = 0;
          let totalBytes = 0;

          // 构建请求数据
          const postData = JSON.stringify({ url });

          // 通过本地后端API下载
          const options = {
            hostname: 'localhost',
            port: 9001,
            path: '/api/update/download',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 600000 // 10分钟
          };

          log(`Requesting backend API: http://localhost:9001/api/update/download`);

          const req = http.request(options, (res) => {
            if (res.statusCode !== 200) {
              log(`Backend API returned status code: ${res.statusCode}`);
              writer.close();
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              resolve({ success: false, error: `HTTP ${res.statusCode}: ${res.statusMessage}` });
              return;
            }

            totalBytes = parseInt(res.headers['content-length'], 10);
            log(`Total file size: ${totalBytes} bytes`);

            res.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              if (totalBytes > 0) {
                const progress = Math.round((downloadedBytes / totalBytes) * 100);
                // 发送进度到渲染进程
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('update-download-progress', progress);
                }
              }
            });

            res.pipe(writer);

            writer.on('finish', () => {
              writer.close(() => {
                log(`Download completed: ${filePath}`);
                resolve({ success: true, filePath });
              });
            });

            writer.on('error', (err) => {
              log(`File write error: ${err.message}`);
              if (fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath);
                } catch (unlinkErr) {
                  log(`Failed to delete file after error: ${unlinkErr.message}`);
                }
              }
              resolve({ success: false, error: err.message });
            });
          });

          req.on('error', (err) => {
            log(`Request error: ${err.message}`);
            writer.close();
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch (unlinkErr) {
                log(`Failed to delete file after error: ${unlinkErr.message}`);
              }
            }
            resolve({ success: false, error: err.message });
          });

          req.on('timeout', () => {
            log(`Request timeout`);
            req.destroy();
            writer.close();
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
              } catch (unlinkErr) {
                log(`Failed to delete file after error: ${unlinkErr.message}`);
              }
            }
            resolve({ success: false, error: 'Request timeout' });
          });

          // 发送请求数据
          req.write(postData);
          req.end();
        }).catch(err => {
          log(`Failed to get token: ${err.message}`);
          resolve({ success: false, error: 'Failed to get authentication token' });
        });
      } catch (error) {
        log(`Failed to download update: ${error.message}`);
        resolve({ success: false, error: error.message });
      }
    });
  });

  // 执行安装更新
  ipcMain.handle('install-update', async (event, filePath) => {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const log = (message) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };

    try {
      log(`Installing update from: ${filePath}`);

      // 使用shell.openPath打开安装程序
      await shell.openPath(filePath);

      log('Installer launched, quitting app in 1 second...');

      // 延迟1秒后退出应用
      setTimeout(() => {
        app.quit();
      }, 1000);

      return { success: true };
    } catch (error) {
      log(`Failed to install update: ${error.message}`);
      console.error('Failed to install update:', error);
      return { success: false, error: error.message };
    }
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(async () => {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  log('App is ready, initializing backend server...');
  
  try {
    // 设置代理
    await setupProxy();

    // 初始化后端服务
    const { gracefulShutdown } = await initializeBackend();
    
    // 存储gracefulShutdown函数以供后续使用
    app.gracefulShutdown = gracefulShutdown;
    
    // 创建窗口
    createWindow();
  } catch (error) {
    log('Failed to initialize backend, creating window anyway:', error);
    createWindow();
  }

  app.on('activate', () => {
    // 在macOS上，当单击dock图标并且没有其他窗口打开时
    // 通常会重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  log('All windows closed, checking if should quit');
  
  // 在macOS上，应用和它们的菜单栏通常保持活动状态
  // 直到用户使用Cmd + Q明确退出
  if (process.platform !== 'darwin') {
    log('Not macOS, quitting app');
    quitApp();
  }
});

// 处理应用退出
function quitApp() {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  log('Quitting app...');
  
  // 如果有存储的gracefulShutdown函数，调用它
  if (app.gracefulShutdown) {
    log('Performing graceful shutdown of backend server...');
    app.gracefulShutdown()
      .then(() => {
        log('Backend server shutdown complete, quitting app');
        app.quit();
      })
      .catch((error) => {
        log('Error during backend shutdown:', error);
        app.quit();
      });
  } else {
    log('No graceful shutdown function available, quitting immediately');
    app.quit();
  }
}

// 处理应用退出前的清理工作
app.on('before-quit', (event) => {
  const logPath = path.join(app.getPath('userData'), 'app.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (message) => {
    console.log(message);
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
  };

  log('App is about to quit');
  
  // 如果有存储的gracefulShutdown函数，阻止默认退出行为
  if (app.gracefulShutdown && !app.isQuitting) {
    log('Preventing default quit to perform graceful shutdown');
    event.preventDefault();
    app.isQuitting = true;
    
    // 调用gracefulShutdown
    app.gracefulShutdown()
      .then(() => {
        log('Backend server shutdown complete, quitting app');
        app.quit();
      })
      .catch((error) => {
        log('Error during backend shutdown:', error);
        app.quit();
      });
  }
});

// 设置代理
async function setupProxy() {
  let dataDir;
  if (isPackaged) {
    dataDir = path.join(process.resourcesPath, 'data');
  } else {
    dataDir = path.join(__dirname, '../data');
  }
  // 修复：system.json文件应该在settings子目录中
  const settingsPath = path.join(dataDir, 'settings', 'system.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.enableProxy && settings.proxyHost && settings.proxyPort) {
        const proxyUrl = `${settings.proxyType}://${settings.proxyHost}:${settings.proxyPort}`;
        app.commandLine.appendSwitch('proxy-server', proxyUrl);
        const logPath = path.join(app.getPath('userData'), 'app.log');
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        const log = (message) => {
          console.log(message);
          logStream.write(`${new Date().toISOString()} - ${message}\n`);
        };
        log(`Proxy enabled: ${proxyUrl}`);
      }
    }
  } catch (error) {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const log = (message) => {
      console.log(message);
      logStream.write(`${new Date().toISOString()} - ${message}\n`);
    };
    log('Failed to read or apply proxy settings:', error);
  }
}

// Menu is removed for a frameless window experience.
