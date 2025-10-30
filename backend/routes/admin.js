const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { jsonFile, getFilePaths } = require('../utils/fileManager');
const logger = require('../utils/logger');

const router = express.Router();

// 获取管理员列表
router.get('/', authenticateToken, (req, res) => {
  try {
    const admins = jsonFile.read(getFilePaths().admins, []);
    res.json({ success: true, admins });
  } catch (error) {
    logger.error('获取管理员列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取管理员列表失败' });
  }
});

// 添加管理员
router.post('/', authenticateToken, (req, res) => {
  try {
    const { adminId, note } = req.body;
    if (!adminId) {
      return res.status(400).json({ success: false, message: '管理员ID不能为空' });
    }

    const admins = jsonFile.read(getFilePaths().admins, []);
    if (admins.some(admin => (typeof admin === 'string' ? admin : admin.id) === adminId)) {
      return res.status(400).json({ success: false, message: '该用户已是管理员' });
    }

    const newAdmin = {
      id: adminId,
      note: note || '',
      createdAt: new Date().toISOString(),
    };

    admins.push(newAdmin);
    jsonFile.write(getFilePaths().admins, admins);

    logger.info('添加管理员', { adminId, note });
    res.status(201).json({ success: true, message: '管理员添加成功', admin: newAdmin });
  } catch (error) {
    logger.error('添加管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '添加管理员失败' });
  }
});

// 更新管理员
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    
    const admins = jsonFile.read(getFilePaths().admins, []);
    const adminIndex = admins.findIndex(admin => (typeof admin === 'string' ? admin : admin.id) === id);

    if (adminIndex === -1) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }

    // 更新管理员信息
    const originalAdmin = admins[adminIndex];
    const updatedAdmin = {
      id: typeof originalAdmin === 'string' ? originalAdmin : originalAdmin.id,
      note: note || '',
      createdAt: typeof originalAdmin === 'object' ? originalAdmin.createdAt : new Date().toISOString(),
    };
    admins[adminIndex] = updatedAdmin;

    jsonFile.write(getFilePaths().admins, admins);

    logger.info('更新管理员', { adminId: id, note });
    res.json({ success: true, message: '管理员更新成功', admin: updatedAdmin });
  } catch (error) {
    logger.error('更新管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新管理员失败' });
  }
});

// 删除管理员
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    let admins = jsonFile.read(getFilePaths().admins, []);
    const initialLength = admins.length;
    
    admins = admins.filter(admin => (typeof admin === 'string' ? admin : admin.id) !== id);

    if (admins.length === initialLength) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }

    jsonFile.write(getFilePaths().admins, admins);

    logger.info('删除管理员', { adminId: id });
    res.json({ success: true, message: '管理员删除成功' });
  } catch (error) {
    logger.error('删除管理员失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除管理员失败' });
  }
});

module.exports = router;
