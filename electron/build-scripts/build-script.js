#!/usr/bin/env node

/**
 * 优化的打包脚本
 * 功能：
 * 1. 检查打包环境
 * 2. 构建前后端
 * 3. 复制构建产物到 electron/dist
 * 4. 打包 electron
 * 5. 移动 exe 到 release 文件夹
 * 6. 支持 --publish 参数上传到 GitHub
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 解析命令行参数
const args = process.argv.slice(2);
const publishIndex = args.indexOf('--publish');
const shouldPublish = publishIndex !== -1;
const publishType = shouldPublish ? (args[publishIndex + 1] || 'always') : null;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${step}`, 'cyan');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// 检查命令是否存在
function commandExists(command) {
  try {
    // 检测操作系统并使用相应的命令
    const checkCommand = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 获取命令版本
function getCommandVersion(command) {
  try {
    return execSync(`${command} --version`, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// 1. 检查打包环境
function checkEnvironment() {
  logStep('步骤 1/6: 检查打包环境');

  let hasError = false;

  // 检查 Node.js
  if (commandExists('node')) {
    const nodeVersion = getCommandVersion('node');
    logSuccess(`Node.js: ${nodeVersion}`);
  } else {
    logError('未安装 Node.js');
    hasError = true;
  }

  // 检查 npm
  if (commandExists('npm')) {
    const npmVersion = getCommandVersion('npm');
    logSuccess(`npm: ${npmVersion}`);
  } else {
    logError('未安装 npm');
    hasError = true;
  }

  // 检查必要的目录
  const requiredDirs = ['../../backend', '../../frontend', '../../data'];
  for (const dir of requiredDirs) {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      logSuccess(`目录存在: ${dir}`);
    } else {
      logError(`目录不存在: ${dir}`);
      hasError = true;
    }
  }

  // 检查依赖是否已安装
  const nodeModulesPaths = [
    path.join(__dirname, '../node_modules'),
    path.join(__dirname, '../../backend/node_modules'),
    path.join(__dirname, '../../frontend/node_modules')
  ];

  for (const nmPath of nodeModulesPaths) {
    if (fs.existsSync(nmPath)) {
      logSuccess(`依赖已安装: ${path.relative(path.join(__dirname, '../..'), nmPath)}`);
    } else {
      logWarning(`依赖未安装: ${path.relative(path.join(__dirname, '../..'), nmPath)}`);
    }
  }

  if (hasError) {
    logError('环境检查失败，无法继续打包');
    process.exit(1);
  }

  logSuccess('环境检查通过\n');
}

// 2. 清理旧的构建文件
function cleanBuildFiles() {
  logStep('步骤 2/6: 清理旧的构建文件');

  const dirsToClean = [
    path.join(__dirname, '../dist'),
    path.join(__dirname, '../build-output'),
    path.join(__dirname, '../../frontend/dist')
  ];

  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      logSuccess(`已清理: ${path.relative(path.join(__dirname, '../..'), dir)}`);
    }
  }

  logSuccess('清理完成\n');
}

// 3. 构建后端
function buildBackend() {
  logStep('步骤 3/6: 构建后端');

  try {
    logInfo('正在使用 ncc 打包后端...');
    execSync('npm run build', {
      cwd: path.join(__dirname, '../../backend'),
      stdio: 'inherit'
    });

    // 验证构建结果
    const backendBuildPath = path.join(__dirname, '../build-output/ncc-backend/index.js');
    if (fs.existsSync(backendBuildPath)) {
      const stats = fs.statSync(backendBuildPath);
      logSuccess(`后端构建成功 (${(stats.size / 1024 / 1024).toFixed(2)} MB)\n`);
    } else {
      throw new Error('后端构建文件不存在');
    }
  } catch (error) {
    logError('后端构建失败');
    console.error(error);
    process.exit(1);
  }
}

// 4. 构建前端
function buildFrontend() {
  logStep('步骤 4/6: 构建前端');

  try {
    logInfo('正在构建前端...');
    execSync('npm run build', {
      cwd: path.join(__dirname, '../../frontend'),
      stdio: 'inherit'
    });

    // 验证构建结果
    const frontendBuildPath = path.join(__dirname, '../../frontend/dist/index.html');
    if (fs.existsSync(frontendBuildPath)) {
      logSuccess('前端构建成功\n');
    } else {
      throw new Error('前端构建文件不存在');
    }
  } catch (error) {
    logError('前端构建失败');
    console.error(error);
    process.exit(1);
  }
}

// 5. 准备打包（运行 prepare-build.js）
function prepareBuild() {
  logStep('步骤 5/6: 准备打包');

  try {
    logInfo('正在同步版本号和准备数据目录...');
    execSync('node build-scripts/prepare-build.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    logInfo('正在验证构建结果...');
    execSync('node build-scripts/verify-build.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    logSuccess('准备工作完成\n');
  } catch (error) {
    logError('准备工作失败');
    console.error(error);
    process.exit(1);
  }
}

// 6. 打包 Electron
function buildElectron() {
  logStep('步骤 6/6: 打包 Electron 应用');

  try {
    // 构建命令
    let command = 'npx electron-builder --win';

    if (shouldPublish) {
      // 检查 GitHub Token
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (!token) {
        logError('未找到 GitHub Token (GH_TOKEN 或 GITHUB_TOKEN)');
        logWarning('请先设置环境变量：');
        log('  Windows CMD: set GH_TOKEN=your_token', 'cyan');
        log('  PowerShell: $env:GH_TOKEN="your_token"', 'cyan');
        process.exit(1);
      }

      command += ` --publish ${publishType}`;

      // 读取版本信息
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
      );

      logInfo(`正在打包并发布到 GitHub Releases...`);
      logInfo(`版本: v${packageJson.version}`);
      logInfo(`发布模式: ${publishType}`);
      log('');
    } else {
      logInfo('正在打包 Windows 应用...');
    }

    // 创建环境变量副本并移除签名相关变量
    const buildEnv = { ...process.env };

    // 禁用代码签名自动发现
    buildEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

    // 删除可能导致问题的签名相关环境变量
    delete buildEnv.CSC_LINK;
    delete buildEnv.WIN_CSC_LINK;
    delete buildEnv.CSC_KEY_PASSWORD;
    delete buildEnv.WIN_CSC_KEY_PASSWORD;

    execSync(command, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: buildEnv
    });

    if (shouldPublish) {
      // 读取版本信息
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
      );

      logSuccess('Electron 打包并发布成功！');

      const releaseUrl = `https://github.com/haoyuehongdou/ws-updata/releases/tag/v${packageJson.version}`;
      log('', 'reset');
      log('🎉 发布完成！', 'green');
      log(`📦 版本: v${packageJson.version}`, 'blue');
      log(`🔗 查看发布: ${releaseUrl}`, 'blue');
    } else {
      // 检查生成的文件
      const distPath = path.join(__dirname, '../dist');
      if (fs.existsSync(distPath)) {
        const files = fs.readdirSync(distPath);
        const exeFiles = files.filter(f => f.endsWith('.exe'));

        if (exeFiles.length > 0) {
          logSuccess(`Electron 打包成功，生成了 ${exeFiles.length} 个安装文件`);

          // 移动到 release 文件夹
          moveToRelease(exeFiles);
        } else {
          logWarning('未找到生成的 exe 文件');
        }
      }
    }
  } catch (error) {
    logError('Electron 打包失败');
    console.error(error);
    process.exit(1);
  }
}

// 移动文件到 release 文件夹
function moveToRelease(exeFiles) {
  logInfo('\n正在移动文件到 release 文件夹...');

  const releasePath = path.join(__dirname, '../../release');

  // 创建 release 文件夹
  if (!fs.existsSync(releasePath)) {
    fs.mkdirSync(releasePath, { recursive: true });
  }

  const distPath = path.join(__dirname, '../dist');

  for (const file of exeFiles) {
    const sourcePath = path.join(distPath, file);
    const targetPath = path.join(releasePath, file);

    try {
      // 如果目标文件已存在，先删除
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }

      // 复制文件
      fs.copyFileSync(sourcePath, targetPath);
      logSuccess(`已复制: ${file} -> release/`);

      // 显示文件大小
      const stats = fs.statSync(targetPath);
      logInfo(`   文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      logError(`移动文件失败: ${file}`);
      console.error(error);
    }
  }

  logSuccess(`\n所有文件已移动到: ${releasePath}`);
}

// 主函数
function main() {
  const startTime = Date.now();

  log('\n🚀 开始打包 WhatsApp 管理系统', 'cyan');
  log(`⏰ 开始时间: ${new Date().toLocaleString()}\n`, 'blue');

  try {
    checkEnvironment();
    cleanBuildFiles();
    buildBackend();
    buildFrontend();
    prepareBuild();
    buildElectron();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    log('\n' + '='.repeat(60), 'green');
    log('  🎉 打包完成！', 'green');
    log('='.repeat(60), 'green');
    log(`⏱️  总耗时: ${duration} 秒`, 'blue');
    log(`📦 输出目录: ${path.join(__dirname, '../release')}`, 'blue');
    log('');

  } catch (error) {
    logError('\n打包过程中出现错误');
    console.error(error);
    process.exit(1);
  }
}

// 运行主函数
main();
