const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { jsonFile, getFilePaths } = require('../utils/fileManager');
const logger = require('../utils/logger');

const router = express.Router();

// 获取命令配置
router.get('/commands', authenticateToken, async (req, res) => {
  try {
    const commands = jsonFile.read(getFilePaths().commands, {});
    
    res.json({
      success: true,
      commands
    });
  } catch (error) {
    logger.error('获取命令配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取命令配置失败'
    });
  }
});

// 更新命令配置
router.put('/commands', authenticateToken, async (req, res) => {
  try {
    const { commands } = req.body;
    
    if (!commands || typeof commands !== 'object') {
      return res.status(400).json({
        success: false,
        message: '命令配置格式错误'
      });
    }

    const currentCommands = jsonFile.read(getFilePaths().commands, {});
    const updatedCommands = { ...currentCommands, ...commands };
    
    jsonFile.write(getFilePaths().commands, updatedCommands);

    logger.info('更新命令配置', { updatedBy: req.user.id });

    res.json({
      success: true,
      message: '命令配置更新成功',
      commands: updatedCommands
    });

  } catch (error) {
    logger.error('更新命令配置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新命令配置失败'
    });
  }
});

// 获取系统设置
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const systemSettings = jsonFile.read(getFilePaths().system, {});
    
    res.json({
      success: true,
      settings: systemSettings
    });
  } catch (error) {
    logger.error('获取系统设置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取系统设置失败'
    });
  }
});

// 更新系统设置
router.put('/system', authenticateToken, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: '系统设置格式错误'
      });
    }

    const currentSettings = jsonFile.read(getFilePaths().system, {});
    const updatedSettings = { ...currentSettings, ...settings };
    
    jsonFile.write(getFilePaths().system, updatedSettings);

    logger.info('更新系统设置', { updatedBy: req.user.id });

    res.json({
      success: true,
      message: '系统设置更新成功',
      settings: updatedSettings
    });

  } catch (error) {
    logger.error('更新系统设置失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新系统设置失败'
    });
  }
});

module.exports = router;