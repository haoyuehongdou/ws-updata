const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');
const { jsonFile, getFilePaths } = require('../utils/fileManager');

const router = express.Router();

// 连接WhatsApp（需要鉴权）
router.post('/connect', authenticateToken, (req, res) => {
  try {
    const status = whatsappService.getStatus();
    if (status.status !== 'disconnected') {
      return res.status(400).json({
        success: false,
        message: `无法启动连接，因为当前状态是 '${status.status}'。`
      });
    }
    whatsappService.initialize();
    res.json({
      success: true,
      message: '连接初始化请求已发送。请轮询 /status 接口获取当前状态。'
    });
  } catch (error) {
    logger.whatsapp.error('连接请求失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '连接失败'
    });
  }
});

// 断开连接
router.post('/disconnect', optionalAuth, async (req, res) => {
  try {
    const result = await whatsappService.disconnect();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({
        success: false,
        message: result.error || '断开连接失败'
      });
    }
  } catch (error) {
    logger.whatsapp.error('断开连接失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '断开连接失败'
    });
  }
});

// 获取连接状态
router.get('/status', optionalAuth, async (req, res) => {
  try {
    const status = whatsappService.getStatus();
    
    // 添加详细的状态信息
    let groupCount = 0;
    if (status.status === 'connected') {
      try {
        const groups = await whatsappService.getGroups();
        groupCount = groups.length;
      } catch (e) {
        logger.whatsapp.error('获取群组数量失败', { error: e.message });
      }
    }
    
    const response = {
      success: true,
      status: status.status,
      isLoggedIn: status.isConnected,
      qrAvailable: status.qrAvailable,
      groupCount,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
      uptime: process.uptime(),
      isConnecting: ['connecting', 'initializing'].includes(status.status),
      retryCount: 0 // 暂时硬编码为0，后续可根据实际实现添加重试计数
    };
    
    // 在日志中记录状态检查（但不过多）
    if (Math.random() < 0.1) { // 10%的概率记录日志，避免过多输出
      logger.whatsapp.debug('📊 状态检查', { 
        status: status.status,
        groupCount,
        isConnecting: response.isConnecting
      });
    }
    
    res.json(response);
  } catch (error) {
    logger.whatsapp.error('获取状态失败', { error: error.stack });
    res.status(500).json({
      success: false,
      message: '获取状态失败',
      status: 'disconnected',
      isConnecting: false,
      groupCount: 0,
      retryCount: 0,
      qrAvailable: false
    });
  }
});

// 获取二维码图片 - 简化版本
router.get('/qr', (req, res) => {
  try {
    const qrPath = getFilePaths().qrCode;
    const status = whatsappService.getStatus();

    if (status.status === 'qr' && fs.existsSync(qrPath)) {
      // 使用绝对路径发送文件
      const resolvedPath = path.resolve(qrPath);
      
      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({
          success: false,
          message: 'QR码不可用'
        });
      }
      
      // 检查文件大小
      const stats = fs.statSync(resolvedPath);
      if (stats.size === 0) {
        return res.status(500).json({
          success: false,
          message: 'QR码文件为空'
        });
      }
      
      // 直接发送文件
      res.sendFile(resolvedPath, (err) => {
        if (err) {
          logger.whatsapp.error('发送QR码文件失败:', { error: err.message });
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: '发送QR码失败'
            });
          }
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'QR码不可用'
      });
    }
  } catch (error) {
    logger.whatsapp.error('获取QR码失败:', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取QR码失败'
    });
  }
});

// 刷新二维码 - 简化版本
router.post('/refresh-qr', optionalAuth, async (req, res) => {
  try {
    // 断开当前连接
    await whatsappService.disconnect();
    
    // 等待一小段时间确保连接完全断开
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 重新初始化连接
    await whatsappService.initialize();
    
    res.json({
      success: true,
      message: '二维码刷新请求已发送，请稍候获取新的二维码'
    });
  } catch (error) {
    logger.whatsapp.error('刷新二维码失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '刷新二维码失败'
    });
  }
});

// 获取群组列表
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await whatsappService.getGroups();
    
    res.json({
      success: true,
      groups
    });
  } catch (error) {
    logger.whatsapp.error('获取群组列表失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群组列表失败'
    });
  }
});

// 发送消息
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { groupId, message } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({
        success: false,
        message: '群组ID和消息内容不能为空'
      });
    }

    const result = await whatsappService.sendMessage(groupId, message);
    
    if (result.success) {
      logger.whatsapp.info('消息发送成功', { 
        groupId, 
        messageLength: message.length,
        userId: req.user.id 
      });
      
      res.json({
        success: true,
        message: '消息发送成功'
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || '消息发送失败'
      });
    }
  } catch (error) {
    logger.whatsapp.error('发送消息失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '发送消息失败'
    });
  }
});

// 群发消息
router.post('/broadcast', authenticateToken, async (req, res) => {
  try {
    const { groupIds, message, delay = 2000 } = req.body;
    
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择至少一个群组'
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '消息内容不能为空'
      });
    }

    // 检查系统设置中的延迟配置
    const systemSettings = jsonFile.read(getFilePaths().system, {});
    const broadcastDelay = delay || systemSettings.broadcastDelay || 2000;

    const result = await whatsappService.broadcastMessage(groupIds, message, broadcastDelay);
    
    if (result.success) {
      // 保存群发历史（初始状态）
      const broadcastHistory = jsonFile.read(getFilePaths().broadcastHistory, []);
      const historyRecord = {
        id: result.jobId,
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        groupCount: groupIds.length,
        successCount: 0,
        errorCount: 0,
        delay: broadcastDelay,
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        status: 'in_progress'
      };
      
      broadcastHistory.unshift(historyRecord);
      // 只保留最近100条记录
      if (broadcastHistory.length > 100) {
        broadcastHistory.splice(100);
      }
      jsonFile.write(getFilePaths().broadcastHistory, broadcastHistory);

      logger.whatsapp.info('群发任务已创建', {
        userId: req.user.id,
        jobId: result.jobId,
        groupCount: groupIds.length
      });

      res.json({
        success: true,
        message: '群发任务已创建',
        jobId: result.jobId
      });
    } else {
      res.status(500).json({
        success: false,
        message: '创建群发任务失败'
      });
    }

  } catch (error) {
    logger.whatsapp.error('创建群发任务失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '创建群发任务失败'
    });
  }
});

// 获取群发任务状态
router.get('/broadcast/job/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = whatsappService.getBroadcastJobStatus(jobId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    logger.whatsapp.error('获取群发任务状态失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群发任务状态失败'
    });
  }
});

// 暂停群发任务
router.post('/broadcast/:jobId/pause', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = whatsappService.pauseBroadcastJob(jobId);
    
    if (result.success) {
      logger.whatsapp.info('群发任务已暂停', { jobId });
      res.json({
        success: true,
        message: '群发任务已暂停'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    logger.whatsapp.error('暂停群发任务失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '暂停群发任务失败'
    });
  }
});

// 恢复群发任务
router.post('/broadcast/:jobId/resume', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = whatsappService.resumeBroadcastJob(jobId);
    
    if (result.success) {
      logger.whatsapp.info('群发任务已恢复', { jobId });
      res.json({
        success: true,
        message: '群发任务已恢复'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    logger.whatsapp.error('恢复群发任务失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '恢复群发任务失败'
    });
  }
});

// 取消群发任务
router.post('/broadcast/:jobId/cancel', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = whatsappService.cancelBroadcastJob(jobId);
    
    if (result.success) {
      // 更新群发历史记录
      const broadcastHistory = jsonFile.read(getFilePaths().broadcastHistory, []);
      const historyIndex = broadcastHistory.findIndex(record => record.id === jobId);
      
      if (historyIndex !== -1) {
        broadcastHistory[historyIndex].status = 'cancelled';
        jsonFile.write(getFilePaths().broadcastHistory, broadcastHistory);
      }
      
      logger.whatsapp.info('群发任务已取消', { jobId });
      res.json({
        success: true,
        message: '群发任务已取消'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    logger.whatsapp.error('取消群发任务失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '取消群发任务失败'
    });
  }
});

// 获取群发历史
router.get('/broadcast-history', authenticateToken, async (req, res) => {
  try {
    // 修复：添加参数验证
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;

    // 确保参数有效
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100; // 限制最大值防止性能问题

    const history = jsonFile.read(getFilePaths().broadcastHistory, []);

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedHistory = history.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      history: paginatedHistory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: history.length,
        totalPages: Math.ceil(history.length / limit)
      }
    });
  } catch (error) {
    logger.whatsapp.error('获取群发历史失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群发历史失败'
    });
  }
});

// 获取记账命令配置
router.get('/billing/commands', authenticateToken, async (req, res) => {
  try {
    const commands = jsonFile.read(getFilePaths().commands, {
      show: '/show',
      js: '/js',
      back: '/back',
      on: '/on',
      off: '/off',
      myid: '/myid'
    });

    // 为了兼容前端，同时提供 js 和 clear 字段（都指向同一个值）
    if (commands.js && !commands.clear) {
      commands.clear = commands.js;
    }
    if (commands.clear && !commands.js) {
      commands.js = commands.clear;
    }

    res.json({
      success: true,
      commands
    });
  } catch (error) {
    logger.whatsapp.error('获取记账命令失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取记账命令失败'
    });
  }
});

// 更新记账命令配置
router.put('/billing/commands', authenticateToken, async (req, res) => {
  try {
    const { commands } = req.body;

    if (!commands || typeof commands !== 'object') {
      return res.status(400).json({
        success: false,
        message: '命令配置格式错误'
      });
    }

    // 获取当前命令配置
    const currentCommands = jsonFile.read(getFilePaths().commands, {});

    // 合并新旧命令配置
    const updatedCommands = { ...currentCommands, ...commands };

    // 兼容处理：如果前端发送了 clear，同时保存为 js
    if (updatedCommands.clear) {
      updatedCommands.js = updatedCommands.clear;
    }
    if (updatedCommands.js) {
      updatedCommands.clear = updatedCommands.js;
    }

    // 验证必需的命令
    const requiredCommands = ['show', 'js', 'back', 'on', 'off', 'myid'];
    for (const cmd of requiredCommands) {
      if (!updatedCommands[cmd] || typeof updatedCommands[cmd] !== 'string') {
        return res.status(400).json({
          success: false,
          message: `缺少必需的命令: ${cmd}`
        });
      }
    }

    jsonFile.write(getFilePaths().commands, updatedCommands);

    logger.whatsapp.info('记账命令已更新', {
      commands: updatedCommands,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: '命令配置已更新',
      commands: updatedCommands
    });
  } catch (error) {
    logger.whatsapp.error('更新记账命令失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新命令配置失败'
    });
  }
});

// 管理员相关路由
const adminRoutes = require('./admin');
router.use('/billing/admins', adminRoutes);

// 获取所有群组账单
router.get('/billing/groups', authenticateToken, async (req, res) => {
  try {
    const { billsManager } = require('../utils/fileManager');
    const groups = await whatsappService.getGroups();
    
    const bills = groups.map(group => {
      const bill = billsManager.getGroupBill(group.id);
      
      // 计算删除成员数（当前成员数与历史最大成员数的差值）
      let removedParticipants = 0;
      if (bill.participantHistory && bill.participantHistory.length > 0) {
        const maxParticipants = Math.max(...bill.participantHistory.map(h => h.count));
        removedParticipants = Math.max(0, maxParticipants - group.participantCount);
      }
      
      return {
        groupId: group.id,
        groupName: group.name,
        participants: group.participantCount,
        removedParticipants: removedParticipants,
        isActive: bill.isActive,
        total: bill.total,
        transactionCount: bill.transactions.length,
        lastTransaction: bill.transactions.length > 0 ? 
          bill.transactions[bill.transactions.length - 1] : null
      };
    }).filter(bill => bill.isActive); // 只显示已开启的账单
    
    res.json({
      success: true,
      bills
    });
  } catch (error) {
    logger.whatsapp.error('获取群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群组账单失败'
    });
  }
});

// 获取特定群组的详细账单
router.get('/billing/history/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    // 修复：添加参数验证
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;

    // 确保参数有效
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 500) limit = 500; // 限制最大值防止性能问题

    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    
    // 加载管理员列表以获取备注
    const admins = jsonFile.read(getFilePaths().admins, []);
    // 创建一个从用户ID前缀到备注的映射，以提高查找效率
    const remarkMap = new Map();
    admins.forEach(admin => {
        // 修复：管理员备注的字段是 'note' 而不是 'remark'
        if (admin && admin.id && admin.note) {
            const idPrefix = admin.id.split('@')[0];
            remarkMap.set(idPrefix, admin.note);
        }
    });

    // 分页处理交易记录并附加管理员备注
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = bill.transactions.slice().reverse().slice(startIndex, endIndex).map(tx => {
      const userId = tx.user || '';
      const userIdPrefix = userId.split('@')[0];
      const userRemark = remarkMap.get(userIdPrefix) || null;
      return {
        ...tx,
        userRemark: userRemark
      };
    });
    
    res.json({
      success: true,
      groupInfo: {
        id: group.id,
        name: group.name,
        participants: group.participantCount
      },
      bill: {
        isActive: bill.isActive,
        total: bill.total,
        transactions: paginatedTransactions
      },
      pagination: {
        page: page,
        limit: limit,
        total: bill.transactions.length,
        totalPages: Math.ceil(bill.transactions.length / limit)
      }
    });
  } catch (error) {
    logger.whatsapp.error('获取群组详细账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群组详细账单失败'
    });
  }
});

// 清空群组账单
router.delete('/billing/clear/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    const transactionCount = bill.transactions.length;
    bill.transactions = [];
    bill.total = 0;
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('群组账单已清空', { 
      groupId,
      groupName: group.name,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '账单已清空',
      transactionCount
    });
  } catch (error) {
    logger.whatsapp.error('清空群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '清空账单失败'
    });
  }
});

// 导出群组账单
router.get('/billing/export/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { format = 'json' } = req.query;
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    
    if (format === 'json') {
      const exportData = {
        groupInfo: {
          id: group.id,
          name: group.name,
          participantCount: group.participantCount // 修复：使用正确的字段名
        },
        bill: {
          isActive: bill.isActive,
          total: bill.total,
          transactions: bill.transactions
        },
        exportTime: new Date().toISOString(),
        exportedBy: req.user.id
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bill_${group.name}_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } else if (format === 'csv') {
      // 生成CSV格式
      let csvContent = 'Time,Amount,Note,UserId\n';
      bill.transactions.forEach(transaction => {
        const time = new Date(transaction.timestamp).toLocaleString('zh-CN');
        const amount = transaction.amount;
        const note = (transaction.note || '').replace(/"/g, '""'); // 转义双引号
        const userId = transaction.user || ''; // 修复：使用正确的字段名
        csvContent += `"${time}","${amount}","${note}","${userId}"\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bill_${group.name}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      return res.status(400).json({
        success: false,
        message: '不支持的导出格式'
      });
    }
    
    logger.whatsapp.info('群组账单已导出', { 
      groupId,
      groupName: group.name,
      format,
      userId: req.user.id 
    });
  } catch (error) {
    logger.whatsapp.error('导出群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '导出账单失败'
    });
  }
});

// 开启群组账单
router.post('/billing/enable/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    bill.isActive = true;
    
    // 记录当前成员数到历史记录
    if (!bill.participantHistory) {
      bill.participantHistory = [];
    }
    
    // 检查是否已有今天的记录
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = bill.participantHistory.find(h => h.date === today);
    
    if (todayRecord) {
      todayRecord.count = group.participantCount;
    } else {
      bill.participantHistory.push({
        date: today,
        count: group.participantCount,
        timestamp: new Date().toISOString()
      });
    }
    
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('群组账单已开启', { 
      groupId,
      groupName: group.name,
      participantCount: group.participantCount,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '账单已开启',
      bill: {
        groupId,
        groupName: group.name,
        participants: group.participantCount,
        isActive: true,
        total: bill.total,
        transactionCount: bill.transactions.length,
        lastTransaction: bill.transactions.length > 0 ? 
          bill.transactions[bill.transactions.length - 1] : null
      }
    });
  } catch (error) {
    logger.whatsapp.error('开启群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '开启账单失败'
    });
  }
});

// 关闭群组账单
router.post('/billing/disable/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    bill.isActive = false;
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('群组账单已关闭', { 
      groupId,
      groupName: group.name,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '账单已关闭'
    });
  } catch (error) {
    logger.whatsapp.error('关闭群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '关闭账单失败'
    });
  }
});

// 撤销最后一笔交易
router.post('/billing/undo/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    
    if (bill.transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有可撤销的交易记录'
      });
    }
    
    const lastTransaction = bill.transactions.pop();
    bill.total -= lastTransaction.amount;
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('撤销交易成功', { 
      groupId,
      groupName: group.name,
      revokedAmount: lastTransaction.amount,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '交易已撤销',
      revokedTransaction: lastTransaction,
      newTotal: bill.total
    });
  } catch (error) {
    logger.whatsapp.error('撤销交易失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '撤销交易失败'
    });
  }
});

// 手动添加交易记录
router.post('/billing/transaction', authenticateToken, async (req, res) => {
  try {
    const { groupId, amount, note } = req.body;
    const { billsManager } = require('../utils/fileManager');
    
    if (!groupId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: '群组ID和金额不能为空'
      });
    }
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    
    const transaction = {
      amount: parseFloat(amount),
      note: note || '',
      userId: req.user.id,
      timestamp: new Date().toISOString(),
      manual: true // 标记为手动添加
    };
    
    bill.transactions.push(transaction);
    bill.total += transaction.amount;
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('手动添加交易记录', { 
      groupId,
      groupName: group.name,
      amount: transaction.amount,
      note: transaction.note,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '交易记录添加成功',
      transaction,
      newTotal: bill.total
    });
  } catch (error) {
    logger.whatsapp.error('添加交易记录失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '添加交易记录失败'
    });
  }
});

// 删除交易记录
router.delete('/billing/transaction/:groupId/:transactionIndex', authenticateToken, async (req, res) => {
  try {
    const { groupId, transactionIndex } = req.params;
    const index = parseInt(transactionIndex);
    const { billsManager } = require('../utils/fileManager');
    
    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.id === groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: '群组不存在'
      });
    }
    
    const bill = billsManager.getGroupBill(groupId);
    
    if (index < 0 || index >= bill.transactions.length) {
      return res.status(400).json({
        success: false,
        message: '交易记录不存在'
      });
    }
    
    const removedTransaction = bill.transactions.splice(index, 1)[0];
    bill.total -= removedTransaction.amount;
    billsManager.saveGroupBill(groupId, bill);
    
    logger.whatsapp.info('删除交易记录', { 
      groupId,
      groupName: group.name,
      removedAmount: removedTransaction.amount,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '交易记录删除成功',
      removedTransaction,
      newTotal: bill.total
    });
  } catch (error) {
    logger.whatsapp.error('删除交易记录失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '删除交易记录失败'
    });
  }
});

module.exports = router;
