const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const logger = require('../utils/logger');
const { DATA_DIR, jsonFile, getFilePaths, billsManager } = require('../utils/fileManager');
const DEFAULT_COMMANDS = require('../config/defaultCommands');
const { db } = require('../config');

// Ensure WebCrypto API and encoders are available globally (required by Baileys)
// Some packaged runtimes (or older Node) do not expose `globalThis.crypto.subtle` by default
try {
    const { webcrypto } = require('node:crypto');
    if (!globalThis.crypto) {
        globalThis.crypto = webcrypto;
    }
} catch (e) {
    // ignore – fallback not available
}

try {
    if (typeof globalThis.TextEncoder === 'undefined' || typeof globalThis.TextDecoder === 'undefined') {
        const { TextEncoder, TextDecoder } = require('node:util');
        globalThis.TextEncoder = TextEncoder;
        globalThis.TextDecoder = TextDecoder;
    }
} catch (e) {
    // ignore – should exist on modern Node, but add if missing
}

const QR_FILE_PATH = getFilePaths().qrCode;
const AUTH_STATE_DIR = path.resolve(DATA_DIR, 'auth', 'baileys_auth_state');


// 动态导入 ES Module
let makeWASocket, DisconnectReason, useMultiFileAuthState;

function extractBaseUser(jid) {
    if (!jid || typeof jid !== 'string') {
        return '';
    }
    const [userPart] = jid.split('@');
    if (!userPart) {
        return '';
    }
    return userPart.split(':')[0];
}

function buildProxyAgentFromSettings(settings) {
    if (!settings || !settings.proxyEnabled) {
        return { agent: null, proxyKey: null };
    }

    const proxyHost = settings.proxyHost || '127.0.0.1';
    const proxyPort = settings.proxyPort || 0;
    if (!proxyHost || !proxyPort) {
        return { agent: null, proxyKey: null };
    }

    const rawType = (settings.proxyType || 'socks5').toString().toLowerCase();
    const proxyType = rawType.startsWith('http') ? 'http' : rawType.startsWith('socks') ? 'socks' : 'socks';
    const username = settings.proxyAuth?.username || '';
    const password = settings.proxyAuth?.password || '';
    const hasAuth = username.trim().length > 0;
    const encodedUser = hasAuth ? encodeURIComponent(username) : '';
    const encodedPass = hasAuth ? encodeURIComponent(password || '') : '';
    const authSegment = hasAuth ? `${encodedUser}${encodedPass ? `:${encodedPass}` : ''}@` : '';
    const schema = proxyType === 'http' ? (rawType === 'https' ? 'https' : 'http') : rawType;
    const proxyUrl = `${schema}://${authSegment}${proxyHost}:${proxyPort}`;
    const displayProxyUrl = hasAuth ? `${schema}://***@${proxyHost}:${proxyPort}` : proxyUrl;

    try {
        if (proxyType === 'http') {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            return { agent: new HttpsProxyAgent(proxyUrl), proxyKey: proxyUrl, displayProxyKey: displayProxyUrl };
        }
        const { SocksProxyAgent } = require('socks-proxy-agent');
        return { agent: new SocksProxyAgent(proxyUrl), proxyKey: proxyUrl, displayProxyKey: displayProxyUrl };
    } catch (error) {
        logger.whatsapp.error('创建代理失败', { error: error.message, proxy: displayProxyUrl });
        return { agent: null, proxyKey: null, displayProxyKey: displayProxyUrl };
    }
}

function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') {
        return '';
    }
    const [userPart, domainPart] = jid.split('@');
    const userWithoutDevice = extractBaseUser(userPart);
    return domainPart ? `${userWithoutDevice}@${domainPart}` : userWithoutDevice;
}

/**
 * 检查是否有有效的用户会话
 * 不依赖内存中的 authenticated 标志，而是检查数据库
 */
async function hasValidSession() {
    try {
        // 获取所有活跃的会话
        const sessions = await db.sessions.getAll();

        if (!sessions || sessions.length === 0) {
            return false;
        }

        // 检查是否有至少一个有效且未过期的会话
        for (const session of sessions) {
            if (session && session.users) {
                const user = session.users;

                // 如果是永久账户，直接返回 true
                if (user.is_permanent) {
                    return true;
                }

                // 如果不是永久账户，检查是否过期
                if (user.expires_at) {
                    if (new Date(user.expires_at) >= new Date()) {
                        return true; // 找到一个未过期的会话
                    }
                }
            }
        }

        return false; // 所有会话都已过期或无效
    } catch (error) {
        logger.whatsapp.error('检查会话失败:', error);
        return false; // 发生错误时，为了安全，返回 false
    }
}

class WhatsAppService {
    constructor() {
        this.sock = null;
        // Use 'initializing' so the UI shows "正在连接" during app startup
        this.status = 'initializing'; // initializing, disconnected, connecting, qr, connected, reconnecting
        this.qrCodeData = null;
        this.systemSettings = null;
        this.cachedGroups = [];
        this.reconnectAttempts = 0; // 用于指数退避
        this.wasConnected = false; // 用于区分是首次登录失败还是连接后断开
        this.lastProxySettings = null; // 记录上次的代理设置
        this.proxyCheckInterval = null; // 代理检查定时器
        this.networkCheckInterval = null; // 网络检查定时器
        this.heartbeatMonitorInterval = null; // 心跳监控定时器
        this.isUiActive = false; // UI活跃状态
        this.manualProxyActive = false; // 标记当前是否使用手动代理

        // 加载命令配置（带默认值保护）
        this.commands = this.loadCommands();
        logger.whatsapp.info('命令配置已加载:', this.commands);
    }

    /**
     * 加载命令配置，如果文件不存在或损坏，使用默认值
     * 这个方法保证命令配置永远不会是undefined或空对象
     */
    loadCommands() {
        try {
            const commandsPath = getFilePaths().commands;
            const fileCommands = jsonFile.read(commandsPath, null);

            if (fileCommands && typeof fileCommands === 'object') {
                // 合并文件配置和默认配置（文件配置优先）
                const mergedCommands = { ...DEFAULT_COMMANDS, ...fileCommands };
                logger.whatsapp.info('从配置文件加载命令:', commandsPath);
                return mergedCommands;
            } else {
                logger.whatsapp.warn('命令配置文件不存在或无效，使用默认配置');
                return { ...DEFAULT_COMMANDS };
            }
        } catch (error) {
            logger.whatsapp.error('加载命令配置失败，使用默认配置:', error.message);
            return { ...DEFAULT_COMMANDS };
        }
    }

    async loadBaileysModules() {
        try {
            const baileys = await import('@whiskeysockets/baileys');
            // Baileys 7.x 使用 ESM，不再需要 .default
            makeWASocket = baileys.default || baileys.makeWASocket;
            DisconnectReason = baileys.DisconnectReason;
            useMultiFileAuthState = baileys.useMultiFileAuthState;
            return true;
        } catch (error) {
            logger.error('Failed to load Baileys modules:', error);
            return false;
        }
    }

    async loadSystemSettings() {
        const settingsPath = getFilePaths().system;
        logger.info(`[SETTINGS] Loading system settings from: ${settingsPath}`);
        console.log(`[SETTINGS] Loading system settings from: ${settingsPath}`);

        try {
            const systemSettings = jsonFile.read(settingsPath, null); // 改为null，以便区分文件不存在和解析失败

            if (systemSettings === null) {
                logger.warn(`[SETTINGS] system.json not found or is empty. Using default settings.`);
                console.log(`[SETTINGS] system.json not found or is empty. Using default settings.`);
                // 抛出错误以进入catch块来使用统一的默认设置逻辑
                throw new Error("Settings file not found or empty");
            }
            
            logger.info('[SETTINGS] Successfully read and parsed system.json.');
            console.log('[SETTINGS] Successfully read and parsed system.json:', JSON.stringify(systemSettings, null, 2));

            // 转换代理配置格式以兼容现有代码
            const nestedProxy = systemSettings.proxy || {};
            const proxyEnabled = systemSettings.proxyEnabled !== undefined
                ? systemSettings.proxyEnabled
                : (systemSettings.enableProxy !== undefined
                    ? systemSettings.enableProxy
                    : nestedProxy.enabled || false);
            const proxyType = systemSettings.proxyType || nestedProxy.type || 'socks5';
            const proxyHost = systemSettings.proxyHost || nestedProxy.host || '127.0.0.1';
            const proxyPort = systemSettings.proxyPort || nestedProxy.port || 10808;
            const proxyAuth = {
                username: (systemSettings.proxyAuth?.username ?? nestedProxy.username ?? '').toString(),
                password: (systemSettings.proxyAuth?.password ?? nestedProxy.password ?? '').toString()
            };

            this.systemSettings = {
                ...systemSettings,
                proxyEnabled,
                proxyHost,
                proxyPort,
                proxyType,
                proxyAuth,
                autoReconnect: systemSettings.autoReconnect !== undefined ? systemSettings.autoReconnect : true,
                reconnectDelay: systemSettings.reconnectDelay || 10000,
                connectTimeoutMs: systemSettings.connectTimeoutMs || 120000 // 超时时间改为120秒(2分钟)，提高连接成功率
            };
        } catch (error) {
            logger.whatsapp.error('加载系统设置失败', { error: error.message });
            console.error('[SETTINGS] Failed to load settings, using defaults.', error);
            // 使用默认设置
            this.systemSettings = {
                broadcastDelay: 2000,
                proxyEnabled: false,
                enableProxy: false,
                proxyType: "socks5",
                proxyHost: "127.0.0.1",
                proxyPort: 10808,
                proxyAuth: {
                    username: "",
                    password: ""
                },
                autoConnect: true,
                maxRetries: 3,
                autoReconnect: true,
                reconnectDelay: 10000,
                connectTimeoutMs: 120000 // 超时时间改为120秒(2分钟)，提高连接成功率
            };
        }
    }

    async checkInternetConnection() {
        try {
            const { default: fetch } = await import('node-fetch');
            const { getProxySettings } = require('get-proxy-settings');

            let agent = null;

            if (this.systemSettings?.proxyEnabled) {
                const { agent: manualAgent, proxyKey, displayProxyKey } = buildProxyAgentFromSettings(this.systemSettings);
                if (manualAgent) {
                    agent = manualAgent;
                    logger.whatsapp.info(`网络连接检查: 使用手动代理: ${displayProxyKey}`);
                } else {
                    logger.whatsapp.warn('网络连接检查: 手动代理配置无效，尝试系统代理');
                }
            }

            if (!agent) {
                const proxySettings = await getProxySettings();
                if (proxySettings && proxySettings.http) {
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    const proxyUrl = `${proxySettings.http.protocol}://${proxySettings.http.host}:${proxySettings.http.port}`;
                    logger.whatsapp.info(`网络连接检查: 使用系统代理: ${proxyUrl}`);
                    agent = new HttpsProxyAgent(proxyUrl);
                }
            }

            // 使用多个备用 URL 进行网络检查，提高连接成功率
            const testUrls = [
                'https://web.whatsapp.com',  // WhatsApp 官方地址
                'https://www.baidu.com',      // 国内可访问
                'https://www.cloudflare.com', // 全球 CDN
            ];

            for (const url of testUrls) {
                try {
                    const response = await fetch(url, { agent, method: 'HEAD', timeout: 10000 });
                    if (response.ok) {
                        logger.whatsapp.info(`网络连接检查成功: ${url}`);
                        return true;
                    }
                } catch (urlError) {
                    logger.whatsapp.debug(`无法连接到 ${url}: ${urlError.message}`);
                    continue; // 尝试下一个 URL
                }
            }

            logger.whatsapp.warn('所有网络连接检查均失败');
            return false;
        } catch (error) {
            logger.whatsapp.warn('Internet connection check failed:', error.message);
            return false;
        }
    }

    async initialize() {
        const isOnline = await this.checkInternetConnection();
        if (!isOnline) {
            logger.whatsapp.warn('No internet connection, skipping initialization.');
            // 不要呈现断开，让前端保持"连接中"提示
            this.status = this.wasConnected ? 'reconnecting' : 'connecting';
            setTimeout(() => this.initialize(), 15000); // Retry after 15 seconds
            return;
        }
        if (this.sock || ['connecting', 'reconnecting'].includes(this.status)) {
            logger.whatsapp.warn(`Initialization attempt blocked. Current status: ${this.status}`);
            return;
        }

        // 加载 Baileys 模块
        const modulesLoaded = await this.loadBaileysModules();
        if (!modulesLoaded) {
            logger.error('Failed to load Baileys modules, cannot initialize WhatsApp client');
            // 维持为连接中，稍后会自动重试（由外部触发或用户手动）
            this.status = this.wasConnected ? 'reconnecting' : 'connecting';
            return;
        }

        // 加载系统设置
        await this.loadSystemSettings();

        logger.whatsapp.info('Initializing WhatsApp client with Baileys...');
        this.status = 'connecting';


        let state, saveCreds;
        try {
            // 确保认证目录存在
            if (!fs.existsSync(AUTH_STATE_DIR)) {
                fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
            }

            // 使用Baileys库的标准方法
            const authState = await useMultiFileAuthState(AUTH_STATE_DIR);
            state = authState.state;
            saveCreds = authState.saveCreds;

        } catch (error) {
            logger.error('Failed to initialize auth state:', error);
            // 避免瞬时显示断开；改为连接中/重连中
            this.status = this.wasConnected ? 'reconnecting' : 'connecting';
            return;
        }

        // 准备socket配置
        const { getProxySettings } = require('get-proxy-settings');

        let agent = null;
        let proxyKey = null;
        this.manualProxyActive = false;

        if (this.systemSettings?.proxyEnabled) {
            const manualProxy = buildProxyAgentFromSettings(this.systemSettings);
            if (manualProxy.agent) {
                agent = manualProxy.agent;
                proxyKey = manualProxy.proxyKey;
                logger.whatsapp.info(`使用手动代理连接WhatsApp: ${manualProxy.displayProxyKey || proxyKey}`);
                this.manualProxyActive = true;
            } else {
                logger.whatsapp.warn('手动代理配置无效，尝试读取系统代理设置。');
            }
        }

        if (!agent) {
            const proxySettings = await getProxySettings();
            if (proxySettings && proxySettings.http) {
                const { HttpsProxyAgent } = require('https-proxy-agent');
                const proxyUrl = `${proxySettings.http.protocol}://${proxySettings.http.host}:${proxySettings.http.port}`;
                logger.whatsapp.info(`成功获取到系统HTTP代理设置: ${proxyUrl}`);
                agent = new HttpsProxyAgent(proxyUrl);
                proxyKey = JSON.stringify(proxySettings.http);
                this.manualProxyActive = false;
            }
        }

        this.lastProxySettings = proxyKey;

        const socketConfig = {
                auth: state,
                printQRInTerminal: false, // We handle QR manually
                logger: pino({ level: 'silent' }), // 减少日志输出
                browser: ['Chrome (Linux)', '', ''], // 更现代的浏览器标识
                // Baileys v7.0.0-rc.6: 使用最新的 WhatsApp Web 版本
                // 注意：不显式设置 version 时，Baileys 会自动使用最新版本
                connectTimeoutMs: this.systemSettings.connectTimeoutMs,
                agent: agent,
                fetchAgent: agent,
            };

        this.sock = makeWASocket(socketConfig);

        // 启动代理和网络监控
        this.startProxyMonitoring();
        this.startNetworkMonitoring();
        this.startHeartbeatMonitor();

        // 添加凭证更新监听
        this.sock.ev.on('creds.update', saveCreds);

        // 添加连接状态监控
        let connectionStartTime = Date.now();
        let connectionAttempts = 0;
        
        // 将定时器变量存储为实例属性，以便在其他方法中访问
        this.connectionTimeout = null;
        this.connectionCheckInterval = null;
        
        
        
        // 添加连接错误处理
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;

            if (qr) {
                logger.whatsapp.info('New QR code received, generating image...');
                try {
                    await this.generateQRCode(qr);
                    this.status = 'qr';
                    this.qrCodeData = qr;
                    logger.whatsapp.info('QR code generated and ready.');

                    // 设置 60 秒超时，如果未扫描则重新生成
                    if (this.qrTimeout) clearTimeout(this.qrTimeout);
                    this.qrTimeout = setTimeout(() => {
                        if (this.status === 'qr') {
                            logger.whatsapp.info('QR code expired after 60 seconds. Re-initializing to get a new QR code.');
                            // 直接销毁并重新初始化，以获取新的二维码
                            this.destroyClient();
                            // 添加一个小的延迟以确保所有清理工作完成
                            setTimeout(() => this.initialize(), 500);
                        }
                    }, 60000); // 延长至 60 秒
                } catch (error) {
                    logger.whatsapp.error('Failed to generate and process QR code:', error);
                    this.status = 'disconnected'; // 如果二维码生成失败，则设置为断开连接
                }
            }

            if (connection === 'close') {
                // 修复：添加lastDisconnect的空值检查
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || 'Unknown';
                const errorMessage = lastDisconnect?.error?.message || 'No error message';
                logger.whatsapp.warn(`Connection closed. Status Code: ${statusCode}, Reason: ${reason}. Error: ${errorMessage}`);

                // 检查是否是由于凭证无效或多设备冲突导致的断开
                const isAuthError = [
                    DisconnectReason.connectionReplaced,
                    DisconnectReason.multideviceMismatch,
                    401 // Unauthorized
                ].includes(statusCode);

                // 新增：将连接超时也视为需要重新扫描的错误
                const isTimeoutError = statusCode === DisconnectReason.timedOut;

                if (isAuthError || isTimeoutError) {
                    const errorType = isTimeoutError ? 'Connection timed out' : 'Authentication error';
                    logger.whatsapp.error(`${errorType} detected. Deleting credentials and forcing re-scan.`);
                    
                    // 销毁当前客户端
                    this.destroyClient();
                    
                    // 删除无效的认证文件
                    try {
                        if (fs.existsSync(AUTH_STATE_DIR)) {
                            fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
                            logger.whatsapp.info('Successfully deleted auth state directory.');
                        }
                    } catch (err) {
                        logger.whatsapp.error('Failed to delete auth state directory:', err);
                    }
                    
                    // 立即重新初始化以生成新的二维码
                    // 添加一个小的延迟以确保文件系统操作完成
                    setTimeout(() => this.initialize(), 1000);

                } else if (statusCode === DisconnectReason.loggedOut) {
                    logger.whatsapp.info('Connection logged out by user. Cleaning up.');
                    this.wasConnected = false;
                    this.destroyClient();
                    this.status = 'disconnected';
                } else {
                    // 对于所有其他错误（如网络问题），尝试使用退避策略重连
                    logger.whatsapp.info('Connection lost. Attempting to reconnect...');
                    this.handleDisconnection();
                }
            } else if (connection === 'open') {
                this.reconnectAttempts = 0; // 连接成功后重置尝试次数
                this.status = 'connected';
                this.wasConnected = true; // 标记已成功连接
                this.qrCodeData = null;
                logger.whatsapp.info('WhatsApp client is ready!');

                // 清除 QR 码超时定时器
                if (this.qrTimeout) {
                    clearTimeout(this.qrTimeout);
                    this.qrTimeout = null;
                }
                
                // 清理所有QR码文件
                try {
                    const { QR_DIR } = require('../utils/fileManager');
                    const fs = require('fs');
                    const path = require('path');
                    
                    if (fs.existsSync(QR_DIR)) {
                        const qrFiles = fs.readdirSync(QR_DIR);
                        qrFiles.forEach(file => {
                            const filePath = path.join(QR_DIR, file);
                            if (fs.statSync(filePath).isFile()) {
                                fs.unlinkSync(filePath);
                                logger.whatsapp.debug('连接成功后删除QR码文件:', filePath);
                            }
                        });
                        logger.whatsapp.info('连接成功后清理了所有QR码文件');
                    }
                } catch (error) {
                    logger.whatsapp.warn('清理QR码文件失败:', { error: error.message });
                }
            } else if (connection === 'connecting') {
                this.status = 'connecting';
                logger.whatsapp.info('WhatsApp client is connecting...');
            }
        });

        // 添加错误事件监听
        this.sock.ev.on('error', (error) => {
            logger.whatsapp.error(`WhatsApp socket error: ${error.message}`);
            
            // 如果是连接超时错误，尝试重新初始化连接
            if (error.message && (error.message.includes('ETIMEDOUT') || error.message.includes('timeout'))) {
                logger.whatsapp.info('Connection timeout detected, attempting to reconnect...');
                setTimeout(() => {
                    this.initialize();
                }, this.systemSettings.reconnectDelay || 10000);
            }
        });

        this.sock.ev.on('messages.upsert', async (m) => {
            // 添加最顶层的日志，确认事件被触发
            logger.whatsapp.info('========== messages.upsert 事件被触发 ==========');
            logger.whatsapp.info(`收到消息数量: ${m.messages.length}, 类型: ${m.type}`);

            // 检查是否有有效的用户会话（防止账户过期但 WhatsApp 仍连接的情况）
            const sessionValid = await hasValidSession();
            if (!sessionValid) {
                logger.whatsapp.warn('没有有效的用户会话，忽略消息（可能账户已过期）');
                return;
            }

            logger.whatsapp.info('会话有效，开始处理消息');

            const msg = m.messages[0];
            logger.whatsapp.info(`消息内容: ${JSON.stringify(msg, null, 2).substring(0, 500)}`);

            if (!msg.message) {
                logger.whatsapp.warn('消息体为空，跳过');
                return;
            }

            if (msg.key.fromMe) {
                logger.whatsapp.debug('消息来自自己，跳过');
                return;
            }

            try {
                const from = msg.key.remoteJid;
                logger.whatsapp.info(`消息来源: ${from}`);

                if (!from.endsWith('@g.us')) {
                    logger.whatsapp.debug('非群组消息，跳过');
                    return;
                }

                const messageBody = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                logger.whatsapp.info(`消息内容: ${messageBody}`);

                if (!messageBody) {
                    logger.whatsapp.warn('消息体为空，跳过');
                    return;
                }

                logger.whatsapp.info(`收到群消息: ${messageBody.substring(0, 50)}`);

                // 每次处理消息时重新加载命令配置，以支持动态更新
                const commands = this.loadCommands();
                const admins = jsonFile.read(getFilePaths().admins, []);

                // Baileys v7.0.0-rc.6: participantAlt 携带 LID，participant 仍可能是传统 JID
                const participant = msg.key.participant || '';
                const participantAlt = msg.key.participantAlt || '';
                const candidateJids = [participantAlt, participant].filter(Boolean);

                if (candidateJids.length === 0) {
                    logger.whatsapp.warn('无法识别发送者，消息 key:', JSON.stringify(msg.key));
                    return;
                }

                const primaryDisplayJid = participantAlt || participant;
                const primaryNumber = extractBaseUser(primaryDisplayJid) || extractBaseUser(participant);
                logger.whatsapp.info(`发送者: ${participant}`);
                if (participantAlt) {
                    logger.whatsapp.info(`发送者 LID: ${participantAlt}`);
                }

                const candidateNumbers = candidateJids.map(extractBaseUser).filter(Boolean);
                const isAdmin = admins.some(adminEntry => {
                    if (!adminEntry) {
                        return false;
                    }
                    const adminId = typeof adminEntry === 'string' ? adminEntry : adminEntry.id;
                    if (!adminId || typeof adminId !== 'string') {
                        return false;
                    }
                    const normalizedAdmin = normalizeJid(adminId);
                    const adminNumber = extractBaseUser(adminId);
                    return candidateJids.some(jid => normalizeJid(jid) === normalizedAdmin) ||
                        (adminNumber && candidateNumbers.includes(adminNumber));
                });

                // Command: /myid (public) - 返回最新的 LID/JID 信息
                if (messageBody.startsWith(commands.myid)) {
                    logger.whatsapp.info(`处理 /myid 命令，发送者: ${primaryDisplayJid}, 管理员: ${isAdmin}`);
                    const responseLines = [];
                    responseLines.push(`您的 ID: ${primaryDisplayJid}`);
                    if (participant && participant !== primaryDisplayJid) {
                        responseLines.push(`主设备 ID: ${participant}`);
                    }
                    if (primaryNumber) {
                        responseLines.push(`号码: ${primaryNumber}`);
                    }
                    responseLines.push(`管理员: ${isAdmin ? '是' : '否'}`);
                    const result = await this.sendMessage(from, responseLines.join('\n'));
                    logger.whatsapp.info(`/myid 回复结果:`, result);
                    return;
                }

                const bill = billsManager.getGroupBill(from);

                // Admin commands
                if (messageBody.startsWith(commands.on)) {
                    if (!isAdmin) return;
                    bill.isActive = true;
                    billsManager.saveGroupBill(from, bill);
                    this.sendMessage(from, '本群组账单功能已开启。');
                    return;
                }

                if (messageBody.startsWith(commands.off)) {
                    if (!isAdmin) return;
                    bill.isActive = false;
                    billsManager.saveGroupBill(from, bill);
                    this.sendMessage(from, '本群组账单功能已关闭。');
                    return;
                }
                
                if (messageBody.startsWith(commands.clear)) {
                    if (!isAdmin) return;
                    // 检查账单是否开启
                    if (!bill.isActive) {
                        this.sendMessage(from, '账单功能未开启，请先使用 /on 命令开启。');
                        return;
                    }
                    bill.transactions = [];
                    bill.total = 0;
                    billsManager.saveGroupBill(from, bill);
                    this.sendMessage(from, '账单已清空。');
                    return;
                }

                if (messageBody.startsWith(commands.back)) {
                    if (!isAdmin) return;
                    // 检查账单是否开启
                    if (!bill.isActive) {
                        this.sendMessage(from, '账单功能未开启，请先使用 /on 命令开启。');
                        return;
                    }
                    if (bill.transactions.length > 0) {
                        const lastTransaction = bill.transactions.pop();
                        bill.total -= lastTransaction.amount;
                        bill.total = parseFloat(bill.total.toFixed(2));
                        billsManager.saveGroupBill(from, bill);
                        const displayExpression = lastTransaction.expression || lastTransaction.description || '';
                        const displayRemark = lastTransaction.remark || '';
                        this.sendMessage(from, `已撤销上一笔交易: ${displayExpression.trim()} = ${lastTransaction.amount.toFixed(2)} ${displayRemark.trim()}`);
                    } else {
                        this.sendMessage(from, '没有可供撤销的交易。');
                    }
                    return;
                }

                // Admin command: /show (只有管理员可以使用)
                if (messageBody.startsWith(commands.show)) {
                    if (!isAdmin) return;
                    // 检查账单是否开启
                    if (!bill.isActive) {
                        this.sendMessage(from, '账单功能未开启，请先使用 /on 命令开启。');
                        return;
                    }

                    if (bill.transactions.length === 0) {
                        this.sendMessage(from, '📝 本群账单\n━━━━━━━━━━━━\n暂无记录\n━━━━━━━━━━━━\n💰 总计: 0.00');
                        return;
                    }

                    let response = `📝 本群账单\n━━━━━━━━━━━━\n`;
                    bill.transactions.forEach((t, index) => {
                        const displayExpression = t.expression || t.description || '';
                        const amount = t.amount.toFixed(2);
                        const remark = t.remark ? ` ${t.remark}` : '';
                        // 使用序号和对齐格式，显示表达式、结果和备注
                        response += `${(index + 1).toString().padStart(2, '0')}. ${displayExpression}=${amount}${remark}\n`;
                    });
                    response += `━━━━━━━━━━━━\n`;
                    response += `💰 总计: ${bill.total.toFixed(2)}`;
                    this.sendMessage(from, response);
                    return;
                }

                // Stop processing other messages if billing is off for the group
                if (!bill.isActive) return;

                // Regex to match math expressions and optional remarks
                // 匹配格式：+200 或 +200/5+5 或 +200/5 测试（带备注）
                const calculationRegex = /^([+\-*\/0-9\.()]+)(\s+.*)?$/;
                const match = messageBody.match(calculationRegex);

                if (match) {
                    let expression = match[1].trim();
                    let remark = (match[2] || '').trim();

                    // 直接尝试计算表达式
                    try {
                        const rawResult = new Function('return ' + expression)();
                        const result = parseFloat(rawResult.toFixed(2));

                        const transaction = {
                            expression: expression,
                            remark: remark,
                            amount: result,
                            user: participant,
                            timestamp: new Date().toISOString()
                        };
                        bill.transactions.push(transaction);
                        bill.total += result;
                        bill.total = parseFloat(bill.total.toFixed(2));
                        billsManager.saveGroupBill(from, bill);

                        // 回复格式：+200=200 或 +200/5=40 或 +200/5=40 测试（有备注时）
                        const response = `${expression}=${result.toFixed(2)}${remark ? ' ' + remark : ''}`;
                        this.sendMessage(from, response);
                    } catch (e) {
                        // 表达式无效，忽略消息
                        logger.whatsapp.debug('无效的数学表达式:', { expression, error: e.message });
                    }
                }

            } catch (error) {
                logger.whatsapp.error('Failed to process incoming message:', { error: error.message, stack: error.stack });
            }
        });
    }

    handleDisconnection() {
        // 关键修复：如果当前状态是'qr'，说明刚生成了二维码，
        // 不应立即进入重连，而应等待用户扫描。
        // Baileys可能会在发出QR后很快发出一个'close'事件，我们需要忽略它。
        if (this.status === 'qr') {
            logger.whatsapp.info('Ignoring connection close event because a QR code is active.');
            return;
        }

        // 如果已经在重连过程中，则不执行任何操作
        if (this.status === 'reconnecting') {
            logger.whatsapp.info('Reconnection already in progress.');
            return;
        }

        this.status = 'reconnecting';
        this.reconnectAttempts++;
        
        const maxRetries = this.systemSettings.maxRetries || 5;
        if (this.reconnectAttempts > maxRetries) {
            logger.whatsapp.error(`Reconnection failed after ${maxRetries} attempts. Stopping.`);
            this.status = 'disconnected';
            this.reconnectAttempts = 0;
            this.destroyClient(); // Clean up the client
            return;
        }

        // Exponential backoff strategy
        const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        logger.whatsapp.info(`Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts}/${maxRetries})`);

        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        this.reconnectTimeout = setTimeout(async () => {
            if (this.status !== 'reconnecting') {
                logger.whatsapp.info('Reconnection cancelled, status changed.');
                return;
            }
            
            // 在尝试重新初始化之前，先销毁旧的客户端实例
            this.destroyClient();
            
            const isOnline = await this.checkInternetConnection();
            if (isOnline) {
                logger.whatsapp.info('Internet connection confirmed. Re-initializing client...');
                // 关键修复：在调用initialize之前，必须将状态移出'reconnecting'
                // 否则initialize方法开头的保护性检查会阻止其执行。
                this.status = 'disconnected';
                this.initialize();
            } else {
                logger.whatsapp.warn('Still no internet connection. Scheduling next retry.');
                this.handleDisconnection(); // Schedule the next attempt
            }
        }, delay);
    }

    destroyClient() {
        // 清理连接超时和检查定时器
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        // 清理代理和网络监控定时器
        if (this.proxyCheckInterval) {
            clearInterval(this.proxyCheckInterval);
            this.proxyCheckInterval = null;
        }
        if (this.networkCheckInterval) {
            clearInterval(this.networkCheckInterval);
            this.networkCheckInterval = null;
        }

        if (this.sock) {
            const localSock = this.sock;
            this.sock = null;
            localSock.end(new Error('Client destroyed'));
        }
        // 不再清除会话文件，以保持登录状态
        // if (fs.existsSync(AUTH_STATE_DIR)) {
        //     fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
        // }
    }

    // 启动代理监控
    startProxyMonitoring() {
        // 如果已有定时器，先清除
        if (this.proxyCheckInterval) {
            clearInterval(this.proxyCheckInterval);
        }

        // 每30秒检查一次代理设置
        this.proxyCheckInterval = setInterval(async () => {
            try {
                if (this.manualProxyActive) {
                    // 手动代理启用时，代理变化由系统设置更新触发
                    return;
                }
                const { getProxySettings } = require('get-proxy-settings');
                const proxySettings = await getProxySettings();
                const currentProxySettings = proxySettings ? JSON.stringify(proxySettings) : null;

                // 如果代理设置发生变化
                if (currentProxySettings !== this.lastProxySettings) {
                    logger.whatsapp.info('检测到代理设置变化，准备重新连接WhatsApp');
                    this.lastProxySettings = currentProxySettings;

                    // 如果当前已连接，断开并重新连接
                    if (this.status === 'connected') {
                        logger.whatsapp.info('代理变更，重新连接WhatsApp...');
                        this.destroyClient();
                        setTimeout(() => this.initialize(), 2000);
                    }
                }
            } catch (error) {
                logger.whatsapp.error('检查代理设置失败:', error);
            }
        }, 30000); // 每30秒检查一次
    }

    // 启动网络监控
    startNetworkMonitoring() {
        // 如果已有定时器，先清除
        if (this.networkCheckInterval) {
            clearInterval(this.networkCheckInterval);
        }

        let wasOnline = true;

        // 每15秒检查一次网络连接
        this.networkCheckInterval = setInterval(async () => {
            try {
                const isOnline = await this.checkInternetConnection();

                // 网络从离线变为在线
                if (!wasOnline && isOnline) {
                    logger.whatsapp.info('网络恢复，准备重新连接WhatsApp');
                    wasOnline = true;

                    // 如果之前是连接状态，尝试重新连接
                    if (this.wasConnected && this.status !== 'connected') {
                        logger.whatsapp.info('网络恢复，重新连接WhatsApp...');
                        setTimeout(() => this.initialize(), 2000);
                    }
                }

                // 网络从在线变为离线
                if (wasOnline && !isOnline) {
                    logger.whatsapp.warn('网络断开');
                    wasOnline = false;
                }
            } catch (error) {
                logger.whatsapp.error('检查网络连接失败:', error);
            }
        }, 15000); // 每15秒检查一次
    }

    // 心跳监控 - 定期检查是否有有效会话
    startHeartbeatMonitor() {
        if (this.heartbeatMonitorInterval) {
            clearInterval(this.heartbeatMonitorInterval);
        }

        this.heartbeatMonitorInterval = setInterval(async () => {
            const sessionValid = await hasValidSession();

            // 状态发生变化
            if (sessionValid !== this.isUiActive) {
                this.isUiActive = sessionValid;
                logger.whatsapp.info(`会话有效状态变更: ${this.isUiActive}`);

                if (this.isUiActive) {
                    // 有有效会话，如果WhatsApp未连接，则尝试连接
                    if (this.status === 'disconnected') {
                        logger.whatsapp.info('检测到有效会话，尝试连接 WhatsApp...');
                        this.initialize();
                    }
                } else {
                    // 没有有效会话（可能账户过期），如果WhatsApp已连接，则断开
                    if (this.status === 'connected') {
                        logger.whatsapp.info('检测到无有效会话（账户可能过期），断开 WhatsApp...');
                        this.disconnect();
                    }
                }
            }
        }, 5000); // 每5秒检查一次
    }

    getStatus() {
        return {
            status: this.status,
            qrAvailable: this.status === 'qr' && this.qrCodeData !== null,
            isConnected: this.status === 'connected',
        };
    }

    async getGroups() {
        if (this.status !== 'connected' || !this.sock) {
            logger.whatsapp.warn('getGroups called while not connected, returning cached groups.');
            return this.cachedGroups || [];
        }
        try {
            const groups = await this.sock.groupFetchAllParticipating();
            const newGroups = Object.values(groups).map(g => ({
                id: g.id,
                name: g.subject,
                participantCount: g.participants.length,
            }));

            if (newGroups.length > 0) {
                this.cachedGroups = newGroups;
                logger.whatsapp.info(`Successfully fetched and cached ${newGroups.length} groups.`);
            } else {
                logger.whatsapp.warn('Fetched group list is empty, retaining existing cache of ${this.cachedGroups?.length || 0} groups.');
            }
            return this.cachedGroups || [];
        } catch (error) {
            logger.whatsapp.error('Failed to get group list, returning cached groups:', error);
            return this.cachedGroups || [];
        }
    }

    async disconnect() {
        try {
            logger.whatsapp.info('Disconnecting WhatsApp client...');
            
            // 清理所有QR码文件
            try {
                const qrDir = path.dirname(QR_FILE_PATH);
                if (fs.existsSync(qrDir)) {
                    const qrFiles = fs.readdirSync(qrDir);
                    qrFiles.forEach(file => {
                        const filePath = path.join(qrDir, file);
                        if (fs.statSync(filePath).isFile() && file.endsWith('.png')) {
                            fs.unlinkSync(filePath);
                            logger.whatsapp.debug('断开连接时删除QR码文件:', filePath);
                        }
                    });
                    logger.whatsapp.info('断开连接时清理了所有QR码文件');
                }
            } catch (error) {
                logger.whatsapp.warn('清理QR码文件失败:', { error: error.message });
            }
            
            // 注销WhatsApp账户 - 删除认证文件
            try {
                if (fs.existsSync(AUTH_STATE_DIR)) {
                    fs.rmSync(AUTH_STATE_DIR, { recursive: true, force: true });
                    logger.whatsapp.info('已删除认证文件，注销WhatsApp账户');
                }
            } catch (error) {
                logger.whatsapp.warn('删除认证文件失败:', { error: error.message });
            }
            
            const activeSock = this.sock;

            if (activeSock) {
                try {
                    await activeSock.logout();
                    logger.whatsapp.info('已向WhatsApp服务器发送注销请求');
                } catch (e) {
                    logger.whatsapp.warn('发送注销请求失败，可能连接已断开:', e.message);
                }
            }

            // 销毁客户端连接
            this.destroyClient();
            
            // 重置状态
            this.status = 'disconnected';
            this.qrCodeData = null;
            this.wasConnected = false;
            this.manualProxyActive = false;
            this.lastProxySettings = null;
            
            // 清除模块引用，以便下次重新加载
            makeWASocket = null;
            DisconnectReason = null;
            useMultiFileAuthState = null;
            
            logger.whatsapp.info('WhatsApp client disconnected successfully');

            return { success: true, message: '已断开连接并注销账户' };
        } catch (error) {
            logger.whatsapp.error('Error during disconnect:', error);
            return { success: false, error: error.message };
        }
    }

    async sendMessage(groupId, message) {
        if (this.status !== 'connected' || !this.sock) {
            return { success: false, error: 'WhatsApp not connected' };
        }
        try {
            await this.sock.sendMessage(groupId, { text: message });
            return { success: true };
        } catch (error) {
            logger.whatsapp.error('Failed to send message:', error);
            return { success: false, error: error.message };
        }
    }

    // 群发消息状态管理
    broadcastJobs = new Map();

    async broadcastMessage(groupIds, message, delay = 2000, jobId = null) {
        if (this.status !== 'connected' || !this.sock) {
            return {
                success: false,
                summary: { success: 0, error: groupIds.length },
                results: groupIds.map(id => ({ groupId: id, success: false, error: 'WhatsApp not connected' }))
            };
        }

        // 如果没有提供jobId，生成一个新的
        if (!jobId) {
            jobId = Date.now().toString();
        }

        // 创建群发任务
        const job = {
            id: jobId,
            groupIds,
            message,
            delay,
            results: [],
            successCount: 0,
            errorCount: 0,
            currentIndex: 0,
            isPaused: false,
            isCancelled: false,
            startTime: new Date(),
            endTime: null
        };

        this.broadcastJobs.set(jobId, job);

        // 异步执行群发任务
        this.executeBroadcastJob(jobId);

        return {
            success: true,
            jobId,
            summary: { success: 0, error: 0 },
            results: []
        };
    }

    async executeBroadcastJob(jobId) {
        const job = this.broadcastJobs.get(jobId);
        if (!job) return;

        const { groupIds, message, delay } = job;

        for (let i = job.currentIndex; i < groupIds.length; i++) {
            // 检查任务是否被取消
            if (job.isCancelled) {
                job.endTime = new Date();
                logger.whatsapp.info(`Broadcast job ${jobId} cancelled`);
                break;
            }

            // 检查任务是否被暂停
            while (job.isPaused && !job.isCancelled) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 如果任务被取消，跳出循环
            if (job.isCancelled) {
                job.endTime = new Date();
                logger.whatsapp.info(`Broadcast job ${jobId} cancelled during pause`);
                break;
            }

            const groupId = groupIds[i];

            try {
                await this.sock.sendMessage(groupId, { text: message });
                job.results.push({ groupId, success: true, error: null });
                job.successCount++;
                logger.whatsapp.info(`Message sent successfully to: ${groupId}`);
            } catch (error) {
                logger.whatsapp.error(`Failed to send message to: ${groupId}`, error);
                job.results.push({ groupId, success: false, error: error.message });
                job.errorCount++;
            }

            // 发送完成后立即更新 currentIndex，防止重复发送
            job.currentIndex = i + 1;

            // 更新任务状态
            this.broadcastJobs.set(jobId, job);

            // 如果不是最后一个消息，添加延迟
            if (delay > 0 && i < groupIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // 标记任务完成
        job.endTime = new Date();
        this.broadcastJobs.set(jobId, job);
        logger.whatsapp.info(`Broadcast job ${jobId} completed`);
    }

    // 获取群发任务状态
    getBroadcastJobStatus(jobId) {
        const job = this.broadcastJobs.get(jobId);
        if (!job) {
            return { success: false, error: 'Job not found' };
        }

        // 计算已处理的群组数量（包括成功和失败的）
        const processedCount = job.successCount + job.errorCount;
        
        return {
            success: true,
            current: processedCount,
            total: job.groupIds.length,
            status: job.isCancelled ? 'cancelled' : 
                   job.isPaused ? 'paused' : 
                   job.endTime ? 'completed' : 'in_progress',
            successCount: job.successCount,
            errorCount: job.errorCount
        };
    }

    // 暂停群发任务
    pauseBroadcastJob(jobId) {
        const job = this.broadcastJobs.get(jobId);
        if (!job) {
            return { success: false, error: 'Job not found' };
        }

        if (job.endTime) {
            return { success: false, error: 'Job already completed' };
        }

        job.isPaused = true;
        this.broadcastJobs.set(jobId, job);
        logger.whatsapp.info(`Broadcast job ${jobId} paused`);
        return { success: true };
    }

    // 恢复群发任务
    resumeBroadcastJob(jobId) {
        const job = this.broadcastJobs.get(jobId);
        if (!job) {
            return { success: false, error: 'Job not found' };
        }

        if (job.endTime) {
            return { success: false, error: 'Job already completed' };
        }

        job.isPaused = false;
        this.broadcastJobs.set(jobId, job);
        logger.whatsapp.info(`Broadcast job ${jobId} resumed`);
        
        return { success: true };
    }

    // 取消群发任务
    cancelBroadcastJob(jobId) {
        const job = this.broadcastJobs.get(jobId);
        if (!job) {
            return { success: false, error: 'Job not found' };
        }

        if (job.endTime) {
            return { success: false, error: 'Job already completed' };
        }

        job.isCancelled = true;
        job.endTime = new Date();
        this.broadcastJobs.set(jobId, job);
        logger.whatsapp.info(`Broadcast job ${jobId} cancelled`);
        return { success: true };
    }

    /**
     * 新的二维码生成方法 - 简化且更可靠
     * @param {string} qrData - 二维码数据
     */
    generateQRCode(qrData) {
        return new Promise((resolve, reject) => {
            try {
                // 确保QR目录存在
                const qrDir = path.dirname(QR_FILE_PATH);
                if (!fs.existsSync(qrDir)) {
                    logger.whatsapp.info('Creating QR directory:', qrDir);
                    fs.mkdirSync(qrDir, { recursive: true });
                }
                
                // 使用绝对路径保存QR码
                const absoluteQrPath = path.resolve(QR_FILE_PATH);
                
                // 生成QR码图片 - 使用更简单的配置
                const qrOptions = {
                    type: 'png',
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                };
                
                // 异步生成QR码
                qrcode.toFile(absoluteQrPath, qrData, qrOptions, (err) => {
                    if (err) {
                        logger.whatsapp.error('Failed to generate QR code:', { error: err.message });
                        return reject(err);
                    }
                    
                    // 验证文件是否成功创建
                    if (fs.existsSync(absoluteQrPath)) {
                        const stats = fs.statSync(absoluteQrPath);
                        if (stats.size > 0) {
                            logger.whatsapp.info('QR code image saved successfully.', { 
                                path: absoluteQrPath, 
                                size: stats.size 
                            });
                            resolve();
                        } else {
                            logger.whatsapp.error('QR code file is empty after saving.', { path: absoluteQrPath });
                            reject(new Error('QR code file is empty.'));
                        }
                    } else {
                        logger.whatsapp.error('QR code file was not created.', { path: absoluteQrPath });
                        reject(new Error('QR code file was not created.'));
                    }
                });
            } catch (error) {
                logger.whatsapp.error('Failed to generate QR code:', { error: error.message });
                reject(error);
            }
        });
    }
}

const whatsappService = new WhatsAppService();
module.exports = whatsappService;
