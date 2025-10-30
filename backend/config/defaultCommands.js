/**
 * 默认命令配置
 * 这个文件定义了所有WhatsApp机器人命令的默认值
 * 即使配置文件丢失或损坏，系统也会使用这些默认值
 */

const DEFAULT_COMMANDS = {
    show: '/show',
    js: '/js',
    back: '/back',
    on: '/on',
    off: '/off',
    myid: '/myid',
    clear: '/js'  // 兼容旧版本
};

module.exports = DEFAULT_COMMANDS;
