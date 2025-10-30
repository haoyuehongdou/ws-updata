const express = require('express');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { db } = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// 获取活跃公告（公开接口）
router.get('/', optionalAuth, async (req, res) => {
  try {
    const announcements = await db.announcements.getActive();
    
    res.json({
      success: true,
      announcements
    });
    
  } catch (error) {
    logger.error('获取公告失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取公告失败',
      announcements: []
    });
  }
});

// 获取所有公告（需要认证）
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const announcements = await db.announcements.getAll();
    
    res.json({
      success: true,
      announcements
    });
    
  } catch (error) {
    logger.error('获取所有公告失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取公告失败'
    });
  }
});

module.exports = router;