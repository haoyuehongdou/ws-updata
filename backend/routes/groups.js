const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { jsonFile, getFilePaths } = require('../utils/fileManager');
const whatsappService = require('../services/whatsappService');
const logger = require('../utils/logger');

const router = express.Router();

// 获取所有群组分组
router.get('/group-categories', authenticateToken, async (req, res) => {
  try {
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    
    // 添加每个分组的群组数量
    const categoriesWithCount = categories.map(category => ({
      ...category,
      groupCount: category.groupIds ? category.groupIds.length : 0
    }));
    
    res.json({
      success: true,
      categories: categoriesWithCount
    });
  } catch (error) {
    logger.whatsapp.error('获取群组分组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取群组分组失败'
    });
  }
});

// 创建群组分组
router.post('/group-categories', authenticateToken, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '分组名称不能为空'
      });
    }
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    
    // 检查名称是否已存在
    if (categories.some(cat => cat.name === name.trim())) {
      return res.status(400).json({
        success: false,
        message: '分组名称已存在'
      });
    }
    
    const newCategory = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description?.trim() || '',
      color: color || '#1890ff',
      groupIds: [],
      createdAt: new Date().toISOString(),
      createdBy: req.user.id
    };
    
    categories.push(newCategory);
    jsonFile.write(getFilePaths().groupCategories, categories);
    
    logger.whatsapp.info('群组分组已创建', { 
      categoryId: newCategory.id,
      name: newCategory.name,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '分组创建成功',
      category: {
        ...newCategory,
        groupCount: 0
      }
    });
  } catch (error) {
    logger.whatsapp.error('创建群组分组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '创建分组失败'
    });
  }
});

// 更新群组分组
router.put('/group-categories/:categoryId', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, color } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '分组名称不能为空'
      });
    }
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '分组不存在'
      });
    }
    
    // 检查名称是否与其他分组重复
    if (categories.some(cat => cat.id !== categoryId && cat.name === name.trim())) {
      return res.status(400).json({
        success: false,
        message: '分组名称已存在'
      });
    }
    
    categories[categoryIndex] = {
      ...categories[categoryIndex],
      name: name.trim(),
      description: description?.trim() || '',
      color: color || categories[categoryIndex].color,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    jsonFile.write(getFilePaths().groupCategories, categories);
    
    logger.whatsapp.info('群组分组已更新', { 
      categoryId,
      name: categories[categoryIndex].name,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '分组更新成功',
      category: {
        ...categories[categoryIndex],
        groupCount: categories[categoryIndex].groupIds.length
      }
    });
  } catch (error) {
    logger.whatsapp.error('更新群组分组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '更新分组失败'
    });
  }
});

// 删除群组分组
router.delete('/group-categories/:categoryId', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '分组不存在'
      });
    }
    
    const deletedCategory = categories[categoryIndex];
    categories.splice(categoryIndex, 1);
    jsonFile.write(getFilePaths().groupCategories, categories);
    
    logger.whatsapp.info('群组分组已删除', { 
      categoryId,
      name: deletedCategory.name,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '分组删除成功'
    });
  } catch (error) {
    logger.whatsapp.error('删除群组分组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '删除分组失败'
    });
  }
});

// 获取分组中的群组列表
router.get('/group-categories/:categoryId/groups', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const category = categories.find(cat => cat.id === categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: '分组不存在'
      });
    }
    
    const allGroups = await whatsappService.getGroups();
    const categoryGroups = allGroups.filter(group => 
      category.groupIds.includes(group.id)
    );
    
    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color
      },
      groups: categoryGroups
    });
  } catch (error) {
    logger.whatsapp.error('获取分组群组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取分组群组失败'
    });
  }
});

// 添加群组到分组
router.post('/group-categories/:categoryId/groups', authenticateToken, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { groupIds } = req.body;
    
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要添加的群组'
      });
    }
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '分组不存在'
      });
    }
    
    // 验证群组是否存在
    const allGroups = await whatsappService.getGroups();
    const validGroupIds = groupIds.filter(groupId => 
      allGroups.some(group => group.id === groupId)
    );
    
    if (validGroupIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有有效的群组'
      });
    }
    
    // 添加群组（避免重复）
    const currentGroupIds = categories[categoryIndex].groupIds || [];
    const newGroupIds = [...new Set([...currentGroupIds, ...validGroupIds])];
    
    categories[categoryIndex].groupIds = newGroupIds;
    categories[categoryIndex].updatedAt = new Date().toISOString();
    categories[categoryIndex].updatedBy = req.user.id;
    
    jsonFile.write(getFilePaths().groupCategories, categories);
    
    logger.whatsapp.info('群组已添加到分组', { 
      categoryId,
      addedGroups: validGroupIds.length,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: `成功添加${validGroupIds.length}个群组到分组`,
      addedCount: validGroupIds.length
    });
  } catch (error) {
    logger.whatsapp.error('添加群组到分组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '添加群组到分组失败'
    });
  }
});

// 从分组中移除群组
router.delete('/group-categories/:categoryId/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const { categoryId, groupId } = req.params;
    
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '分组不存在'
      });
    }
    
    const currentGroupIds = categories[categoryIndex].groupIds || [];
    const groupIndex = currentGroupIds.indexOf(groupId);
    
    if (groupIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '群组不在此分组中'
      });
    }
    
    currentGroupIds.splice(groupIndex, 1);
    categories[categoryIndex].groupIds = currentGroupIds;
    categories[categoryIndex].updatedAt = new Date().toISOString();
    categories[categoryIndex].updatedBy = req.user.id;
    
    jsonFile.write(getFilePaths().groupCategories, categories);
    
    logger.whatsapp.info('群组已从分组移除', { 
      categoryId,
      groupId,
      userId: req.user.id 
    });
    
    res.json({
      success: true,
      message: '群组已从分组中移除'
    });
  } catch (error) {
    logger.whatsapp.error('从分组移除群组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '从分组移除群组失败'
    });
  }
});

// 获取未分组的群组
router.get('/uncategorized-groups', authenticateToken, async (req, res) => {
  try {
    const categories = jsonFile.read(getFilePaths().groupCategories, []);
    const allGroups = await whatsappService.getGroups();
    
    // 获取所有已分组的群组ID
    const categorizedGroupIds = new Set();
    categories.forEach(category => {
      if (category.groupIds) {
        category.groupIds.forEach(groupId => categorizedGroupIds.add(groupId));
      }
    });
    
    // 过滤出未分组的群组
    const uncategorizedGroups = allGroups.filter(group => 
      !categorizedGroupIds.has(group.id)
    );
    
    res.json({
      success: true,
      groups: uncategorizedGroups
    });
  } catch (error) {
    logger.whatsapp.error('获取未分组群组失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '获取未分组群组失败'
    });
  }
});

module.exports = router;
