const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { billsManager, jsonFile, getFilePaths } = require('../utils/fileManager');
const logger = require('../utils/logger');

const router = express.Router();

// 获取所有群组的账单
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const bills = billsManager.getAllBills();
    
    res.json({
      success: true,
      bills
    });
  } catch (error) {
    logger.error('获取群组账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群组账单失败'
    });
  }
});

// 获取单个群组的账单详情
router.get('/history/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    // 修复：添加参数验证
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;

    // 确保参数有效
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 500) limit = 500; // 限制最大值防止性能问题

    const bill = billsManager.getGroupBill(groupId);

    // 分页处理交易记录
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = bill.transactions.slice().reverse().slice(startIndex, endIndex);
    
    res.json({
      success: true,
      bill: {
        ...bill,
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
    logger.error('获取账单详情失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取账单详情失败'
    });
  }
});

// 导出账单
router.get('/export/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { format = 'json' } = req.query;
    
    const bill = billsManager.getGroupBill(groupId);
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bill_${groupId}_${Date.now()}.json"`);
      res.json(bill);
    } else if (format === 'csv') {
      // 生成CSV格式
      let csvContent = 'Time,Amount,Note,UserId\n';
      bill.transactions.forEach(transaction => {
        const time = new Date(transaction.timestamp).toLocaleString('zh-CN');
        const amount = transaction.amount;
        const note = (transaction.note || '').replace(/"/g, '""'); // 转义双引号
        const userId = transaction.userId || transaction.user || ''; // 修复：兼容两种字段名
        csvContent += `"${time}","${amount}","${note}","${userId}"\n`;
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="bill_${groupId}_${Date.now()}.csv"`);
      res.send(csvContent);
    } else {
      return res.status(400).json({
        success: false,
        message: '不支持的导出格式'
      });
    }

    logger.billing.info('账单导出', { 
      groupId, 
      format, 
      transactionCount: bill.transactions.length,
      userId: req.user.id 
    });

  } catch (error) {
    logger.error('导出账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '导出账单失败'
    });
  }
});

// 导入账单
router.post('/import/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { billData, overwrite = false } = req.body;
    
    if (!billData || !billData.transactions) {
      return res.status(400).json({
        success: false,
        message: '账单数据格式错误'
      });
    }

    let currentBill = billsManager.getGroupBill(groupId);
    
    if (overwrite) {
      // 覆盖现有账单
      currentBill = {
        groupId,
        groupName: billData.groupName || currentBill.groupName,
        isActive: billData.isActive !== undefined ? billData.isActive : currentBill.isActive,
        transactions: billData.transactions || [],
        total: 0
      };
    } else {
      // 合并账单
      currentBill.transactions = [...currentBill.transactions, ...billData.transactions];
    }

    // 重新计算总额
    currentBill.total = currentBill.transactions.reduce((sum, transaction) => {
      return sum + (transaction.amount || 0);
    }, 0);

    billsManager.saveGroupBill(groupId, currentBill);

    logger.billing.info('账单导入', { 
      groupId, 
      transactionCount: billData.transactions.length,
      overwrite,
      userId: req.user.id 
    });

    res.json({
      success: true,
      message: '账单导入成功',
      importedCount: billData.transactions.length
    });

  } catch (error) {
    logger.error('导入账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '导入账单失败'
    });
  }
});

// 清空群组账单
router.delete('/clear/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const bill = billsManager.getGroupBill(groupId);
    const transactionCount = bill.transactions.length;
    
    bill.transactions = [];
    bill.total = 0;
    billsManager.saveGroupBill(groupId, bill);

    logger.billing.info('账单清空', { 
      groupId, 
      transactionCount,
      userId: req.user.id 
    });

    res.json({
      success: true,
      message: '账单已清空',
      transactionCount
    });

  } catch (error) {
    logger.error('清空账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '清空账单失败'
    });
  }
});

// 手动添加交易记录
router.post('/transaction', authenticateToken, async (req, res) => {
  try {
    const { groupId, amount, note } = req.body;
    
    if (!groupId || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: '群组ID和金额不能为空'
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

    logger.billing.transaction(groupId, 'manual_add', transaction.amount, note, req.user.id);

    res.json({
      success: true,
      message: '交易记录添加成功',
      transaction,
      newTotal: bill.total
    });

  } catch (error) {
    logger.error('添加交易记录失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '添加交易记录失败'
    });
  }
});

// 删除交易记录
router.delete('/transaction/:groupId/:transactionIndex', authenticateToken, async (req, res) => {
  try {
    const { groupId, transactionIndex } = req.params;
    const index = parseInt(transactionIndex);
    
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

    logger.billing.info('删除交易记录', { 
      groupId, 
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
    logger.error('删除交易记录失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '删除交易记录失败'
    });
  }
});

// 开启群组账单
router.post('/enable/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const bill = billsManager.getGroupBill(groupId);
    bill.isActive = true;
    billsManager.saveGroupBill(groupId, bill);

    logger.billing.info('开启账单', { 
      groupId, 
      userId: req.user.id 
    });

    res.json({
      success: true,
      message: '账单已开启'
    });

  } catch (error) {
    logger.error('开启账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '开启账单失败'
    });
  }
});

// 关闭群组账单
router.post('/disable/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const bill = billsManager.getGroupBill(groupId);
    bill.isActive = false;
    billsManager.saveGroupBill(groupId, bill);

    logger.billing.info('关闭账单', { 
      groupId, 
      userId: req.user.id 
    });

    res.json({
      success: true,
      message: '账单已关闭'
    });

  } catch (error) {
    logger.error('关闭账单失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '关闭账单失败'
    });
  }
});

// 撤销最后一笔交易
router.post('/undo/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
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

    logger.billing.info('撤销交易', { 
      groupId, 
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
    logger.error('撤销交易失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '撤销交易失败'
    });
  }
});

module.exports = router;