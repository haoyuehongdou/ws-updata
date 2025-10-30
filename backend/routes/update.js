const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const router = express.Router();

// 从package.json读取当前版本号
let CURRENT_VERSION = '1.0.5'; // 默认版本号（如果读取失败）
try {
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    CURRENT_VERSION = packageJson.version;
    logger.info('读取到当前版本号:', CURRENT_VERSION);
  } else {
    logger.warn('package.json 不存在，使用默认版本号:', CURRENT_VERSION);
  }
} catch (error) {
  logger.warn('无法读取package.json版本号，使用默认版本:', CURRENT_VERSION, error.message);
}

// 获取当前版本和最新版本信息
router.get('/check', authenticateToken, async (req, res) => {
  try {
    // 使用硬编码的版本号，确保打包后也能正确读取
    let currentVersion = CURRENT_VERSION;

    // 从GitHub Releases获取最新版本
    let latestVersion = currentVersion;
    let downloadUrl = '';
    let releaseNotes = '';
    let hasUpdate = false;

    try {
      const response = await axios.get('https://api.github.com/repos/haoyuehongdou/ws-updata/releases/latest', {
        timeout: 10000,
        headers: {
          'User-Agent': 'WhatsApp-System'
        }
      });

      if (response.data && response.data.tag_name) {
        // 移除tag_name中的'v'前缀（如果有）
        latestVersion = response.data.tag_name.replace(/^v/, '');
        releaseNotes = response.data.body || '';

        // 获取下载链接 - 优先选择.exe文件
        const assets = response.data.assets || [];
        const exeAsset = assets.find(asset => asset.name.endsWith('.exe'));
        if (exeAsset) {
          downloadUrl = exeAsset.browser_download_url;
        }

        // 比较版本号
        hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

        logger.info('版本检查完成', {
          currentVersion,
          latestVersion,
          hasUpdate,
          downloadUrl
        });
      }
    } catch (fetchError) {
      logger.warn('无法获取GitHub最新版本信息', { error: fetchError.message });
      // 如果获取失败，继续使用当前版本作为最新版本
    }

    res.json({
      success: true,
      currentVersion,
      latestVersion,
      hasUpdate,
      downloadUrl,
      releaseNotes
    });
  } catch (error) {
    logger.error('检查更新失败', { error: error.message });
    // 即使检查更新失败，也返回成功，避免阻塞前端
    res.json({
      success: true,
      currentVersion: '0.0.0',
      latestVersion: '0.0.0',
      hasUpdate: false,
      error: '检查更新失败',
    });
  }
});

// 版本比较函数
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

// 执行更新
router.post('/now', authenticateToken, async (req, res) => {
  try {
    res.json({ success: true, message: '正在开始更新...' });

    // 异步执行更新脚本
    exec('git pull && npm install && pm2 restart all', (error, stdout, stderr) => {
      if (error) {
        logger.error('更新失败', { error: error.message, stderr });
        return;
      }
      logger.info('更新成功', { stdout });
    });
  } catch (error) {
    logger.error('执行更新失败', { error: error.message });
    res.status(500).json({ success: false, message: '执行更新失败' });
  }
});

// 下载更新文件 - 通过后端代理下载，利用后端的网络配置
router.post('/download', authenticateToken, async (req, res) => {
  const https = require('https');
  const http = require('http');

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, message: '缺少下载URL' });
    }

    // 设置长超时时间用于大文件下载 (10分钟)
    req.setTimeout(600000);
    res.setTimeout(600000);

    logger.info('开始下载更新文件', { url });

    // 使用Node.js原生https模块
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    // 使用和WhatsApp服务相同的方式获取系统代理
    const { getProxySettings } = require('get-proxy-settings');
    const { HttpsProxyAgent } = require('https-proxy-agent');

    const proxySettings = await getProxySettings();

    let requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'WhatsApp-System-Update'
      }
    };

    // 如果有代理配置，使用代理
    if (proxySettings && proxySettings.http) {
      const proxyUrl = `${proxySettings.http.protocol}://${proxySettings.http.host}:${proxySettings.http.port}`;
      requestOptions.agent = new HttpsProxyAgent(proxyUrl);
      logger.info('使用系统代理下载', { proxy: proxyUrl });
    } else {
      logger.info('直接连接下载（无代理）');
    }

    const fileName = url.split('/').pop().split('?')[0];

    // 发起请求
    const request = protocol.request(requestOptions, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        logger.info('重定向到', { redirectUrl });

        // 重新构建请求处理重定向
        const redirectUrlObj = new URL(redirectUrl);
        const redirectProtocol = redirectUrlObj.protocol === 'https:' ? https : http;

        let redirectOptions = {
          hostname: redirectUrlObj.hostname,
          port: redirectUrlObj.port || (redirectUrlObj.protocol === 'https:' ? 443 : 80),
          path: redirectUrlObj.pathname + redirectUrlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': 'WhatsApp-System-Update'
          }
        };

        // 重定向也使用代理
        if (proxySettings && proxySettings.http) {
          const proxyUrl = `${proxySettings.http.protocol}://${proxySettings.http.host}:${proxySettings.http.port}`;
          redirectOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        const redirectRequest = redirectProtocol.request(redirectOptions, (redirectResponse) => {
          const contentLength = redirectResponse.headers['content-length'];
          logger.info('开始传输文件', { fileName, contentLength });

          // 设置响应头
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

          if (contentLength) {
            res.setHeader('Content-Length', contentLength);
          }

          // 将响应流pipe到客户端
          redirectResponse.pipe(res);

          redirectResponse.on('end', () => {
            logger.info('文件传输完成', { url });
          });

          redirectResponse.on('error', (error) => {
            logger.error('响应流错误', { error: error.message });
            if (!res.headersSent) {
              res.status(500).json({ success: false, message: '下载失败' });
            }
          });
        });

        redirectRequest.on('error', (error) => {
          logger.error('重定向请求错误', {
            message: error.message,
            code: error.code,
            url: redirectUrl
          });
          if (!res.headersSent) {
            res.status(500).json({ success: false, message: '下载失败: ' + error.message });
          }
        });

        redirectRequest.end();
        return;
      }

      const contentLength = response.headers['content-length'];
      logger.info('开始传输文件', { fileName, contentLength });

      // 设置响应头
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // 将响应流pipe到客户端
      response.pipe(res);

      response.on('end', () => {
        logger.info('文件传输完成', { url });
      });

      response.on('error', (error) => {
        logger.error('响应流错误', { error: error.message });
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: '下载失败' });
        }
      });
    });

    request.on('error', (error) => {
      logger.error('请求错误', {
        message: error.message,
        code: error.code,
        url: url
      });
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: '下载失败: ' + error.message });
      }
    });

    request.end();

  } catch (error) {
    logger.error('下载更新文件失败', {
      message: error.message,
      stack: error.stack,
      url: req.body.url
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '下载失败: ' + error.message });
    }
  }
});

module.exports = router;
