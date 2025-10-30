const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../data');

// 定义需要保留的目录和文件
const keepDirs = [
    'auth',
    'bills',
    'config',
    'groups',
    'logs',
    'qr',
    'settings'
];

const keepFiles = [
    'config/admins.json',
    'config/commands.json',
    'groups/categories.json',
    'settings/.gitkeep'
];

function cleanDirectory(directory) {
    if (!fs.existsSync(directory)) {
        console.log(`Directory not found: ${directory}`);
        return;
    }

    const files = fs.readdirSync(directory);

    for (const file of files) {
        const filePath = path.join(directory, file);
        const stat = fs.lstatSync(filePath);

        if (stat.isDirectory()) {
            // 递归清理子目录
            cleanDirectory(filePath);
            // 如果子目录为空，则删除
            if (fs.readdirSync(filePath).length === 0) {
                fs.rmdirSync(filePath);
            }
        } else {
            // 删除文件
            fs.unlinkSync(filePath);
        }
    }
}

function setupDataDirectory() {
    console.log('Cleaning data directory for production build...');

    // 1. 清理整个 data 目录
    cleanDirectory(dataDir);

    // 2. 重新创建需要保留的目录结构
    for (const dir of keepDirs) {
        const dirPath = path.join(dataDir, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    // 3. 在空目录中创建 .gitkeep 文件
    for (const dir of keepDirs) {
        const dirPath = path.join(dataDir, dir);
        const gitkeepPath = path.join(dirPath, '.gitkeep');
        if (fs.readdirSync(dirPath).length === 0) {
            if (!fs.existsSync(gitkeepPath)) {
                fs.writeFileSync(gitkeepPath, '');
            }
        }
    }

    console.log('Data directory setup complete.');
}

function syncVersionNumbers() {
    console.log('Syncing version numbers...');

    // 读取 electron/package.json 的版本号（主版本号）
    const electronPackageJsonPath = path.join(__dirname, '../package.json');
    const electronPackageJson = JSON.parse(fs.readFileSync(electronPackageJsonPath, 'utf-8'));
    const version = electronPackageJson.version;

    console.log(`Main version: ${version}`);

    // 同步到 backend/package.json
    const backendPackageJsonPath = path.join(__dirname, '../../backend/package.json');
    if (fs.existsSync(backendPackageJsonPath)) {
        const backendPackageJson = JSON.parse(fs.readFileSync(backendPackageJsonPath, 'utf-8'));
        backendPackageJson.version = version;
        fs.writeFileSync(backendPackageJsonPath, JSON.stringify(backendPackageJson, null, 2) + '\n');
        console.log(`Updated backend/package.json to version ${version}`);
    }

    // 同步到 frontend/package.json
    const frontendPackageJsonPath = path.join(__dirname, '../../frontend/package.json');
    if (fs.existsSync(frontendPackageJsonPath)) {
        const frontendPackageJson = JSON.parse(fs.readFileSync(frontendPackageJsonPath, 'utf-8'));
        frontendPackageJson.version = version;
        fs.writeFileSync(frontendPackageJsonPath, JSON.stringify(frontendPackageJson, null, 2) + '\n');
        console.log(`Updated frontend/package.json to version ${version}`);
    }

    console.log('Version sync complete.');
}

// 执行清理和设置
syncVersionNumbers();
setupDataDirectory();
