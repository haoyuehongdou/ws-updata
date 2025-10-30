const jwt = require('jsonwebtoken');
const { db } = require('../config');
const logger = require('../utils/logger');

const JWT_SECRET = 'your-secret-key-change-in-production';

// 认证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    try {
      // 验证session是否有效
      const session = await db.sessions.findByToken(token);
      if (!session || !session.users) {
        return res.status(401).json({
          success: false,
          message: '会话无效或已过期'
        });
      }

      // 检查账户是否过期
      const user = session.users;
      if (!user.is_permanent && user.expires_at) {
        if (new Date(user.expires_at) < new Date()) {
          return res.status(401).json({
            success: false,
            message: '账户已过期'
          });
        }
      }

      // 更新最后访问时间（在后台静默处理，不阻塞响应）
      db.sessions.updateLastSeen(token).catch(err => {
        logger.error('更新最后访问时间失败:', err);
      });

      req.user = user;
      req.session = session;
      next();
      
    } catch (dbError) {
      logger.error('数据库会话检查失败:', dbError);
      return res.status(401).json({
        success: false,
        message: '会话验证失败'
      });
    }

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token已过期'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '无效的Token'
      });
    }
    
    logger.error('Token验证失败:', error);
    return res.status(401).json({
      success: false,
      message: '认证失败'
    });
  }
};

// 可选认证中间件（某些接口可能不需要认证）
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const session = await db.sessions.findByToken(token);
        
        if (session && session.users) {
          req.user = session.users;
          req.session = session;
        } else {
          // 数据库中没有session，但JWT有效
          req.user = {
            id: decoded.userId,
            username: decoded.username,
            is_permanent: true
          };
        }
      } catch (dbError) {
        // 数据库错误，尝试使用JWT信息
        logger.warn('可选认证数据库检查失败:', dbError.message);
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          req.user = {
            id: decoded.userId,
            username: decoded.username,
            is_permanent: true
          };
        } catch (jwtError) {
          // JWT也无效，忽略认证
          logger.warn('可选认证JWT验证失败:', jwtError.message);
        }
      }
    }

    next();
  } catch (error) {
    // 如果认证失败，继续执行但不设置用户信息
    logger.warn('可选认证失败:', error.message);
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  JWT_SECRET
};
