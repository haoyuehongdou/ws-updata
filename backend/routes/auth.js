const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const { setHeartbeat, clearHeartbeat, setAuthenticated } = require('../utils/appState');

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 查找用户
    const user = await db.users.findByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.hashed_password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查账户是否过期
    if (!user.is_permanent && user.expires_at) {
      if (new Date(user.expires_at) < new Date()) {
        return res.status(401).json({
          success: false,
          message: '账户已过期，请联系管理员续期'
        });
      }
    }

    // 清除该用户的其他会话（单点登录）
    await db.sessions.deleteByUserId(user.id);

    // 生成JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 创建会话记录
    await db.sessions.create({
      user_id: user.id,
      token,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'] || ''
    });

    // 记录登录日志
    logger.info('用户登录成功', { 
      userId: user.id, 
      username: user.username,
      ip: req.ip 
    });

    // 返回成功响应
    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        expires_at: user.expires_at,
        is_permanent: user.is_permanent,
        remarks: user.remarks
      }
    });
    // 前端登录成功后预置一次心跳，宽限到达第一轮心跳
    setHeartbeat();
    setAuthenticated(true);

  } catch (error) {
    logger.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录过程中发生错误'
    });
  }
});

// 登出
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (token) {
      await db.sessions.deleteByToken(token);
    }

    logger.info('用户登出', { userId: req.user.id, username: req.user.username });

    res.json({
      success: true,
      message: '已成功登出'
    });
    clearHeartbeat();
    setAuthenticated(false);

  } catch (error) {
    logger.error('登出失败:', error);
    res.status(500).json({
      success: false,
      message: '登出过程中发生错误'
    });
  }
});

// 检查会话状态
router.get('/session', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        expires_at: req.user.expires_at,
        is_permanent: req.user.is_permanent,
        remarks: req.user.remarks
      }
    });
  } catch (error) {
    logger.error('会话检查失败:', error);
    res.status(500).json({
      success: false,
      message: '会话检查失败'
    });
  }
});

module.exports = router;
 
// 心跳（保持前端活跃会话，用于限制 WhatsApp 的后台自动处理）
router.post('/heartbeat', authenticateToken, async (req, res) => {
  try {
    setHeartbeat();
    res.json({ success: true, timestamp: Date.now() });
  } catch (e) {
    res.status(500).json({ success: false, message: '心跳失败' });
  }
});
