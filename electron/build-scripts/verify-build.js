const fs = require('fs');
const path = require('path');

console.log('🔍 验证构建结果...');

// 检查ncc打包后的后端文件
const backendPath = path.join(__dirname, '../build-output', 'ncc-backend', 'index.js');
const backendExists = fs.existsSync(backendPath);

console.log(`ncc打包后端文件: ${backendExists ? '✅' : '❌'} ${backendPath}`);

if (backendExists) {
  const stats = fs.statSync(backendPath);
  console.log(`文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`修改时间: ${stats.mtime}`);
  
  // 检查是否是单文件打包（ncc打包后的文件应该是单一的JS文件）
  const content = fs.readFileSync(backendPath, 'utf8');
  const hasRequire = content.includes('require(');
  const linesCount = content.split('\n').length;
  
  console.log(`包含require语句: ${hasRequire ? '✅' : '❌'} ${hasRequire ? '(正常，ncc打包后仍然保留require)' : '(异常)'}`);
  console.log(`文件行数: ${linesCount} ${linesCount > 1000 ? '(打包成功)' : '(可能打包失败)'}`);
  
  // 检查是否包含关键依赖
  const hasExpress = content.includes('express');
  const hasBaileys = content.includes('baileys') || content.includes('WhatsApp');
  
  console.log(`包含Express: ${hasExpress ? '✅' : '❌'}`);
  console.log(`包含Baileys/WhatsApp: ${hasBaileys ? '✅' : '❌'}`);
} else {
  console.log('❌ ncc打包后端文件不存在，请先运行: npm run build:backend');
}

// 检查前端构建文件
const frontendPath = path.join(__dirname, '../..', 'frontend', 'dist', 'index.html');
const frontendExists = fs.existsSync(frontendPath);

console.log(`前端构建文件: ${frontendExists ? '✅' : '❌'} ${frontendPath}`);

// 检查数据目录
const dataPath = path.join(__dirname, '../..', 'data');
const dataExists = fs.existsSync(dataPath);

console.log(`数据目录: ${dataExists ? '✅' : '❌'} ${dataPath}`);

if (dataExists) {
  const dataFiles = fs.readdirSync(dataPath);
  console.log(`数据文件数量: ${dataFiles.length}`);
}

console.log('\n📋 构建检查完成');

if (backendExists && frontendExists && dataExists) {
  console.log('✅ 所有必要文件都已准备就绪，可以开始打包');
  console.log('📦 后端已使用ncc打包，源码已隐藏');
} else {
  console.log('❌ 缺少必要文件，请检查构建步骤');
  if (!backendExists) {
    console.log('  - 请运行: cd backend && npm run build');
  }
  if (!frontendExists) {
    console.log('  - 请运行: cd frontend && npm run build');
  }
  process.exit(1);
}