import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Modal,
  message,
  Typography,
  Tag,
  Tooltip,
  Select,
  Checkbox,
  Divider,
  Empty,
  Alert
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  SearchOutlined,
  FolderOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { groupsAPI } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const Groups = () => {
  const { isConnected, groups, fetchGroups } = useWhatsApp();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  
  // 模态框状态
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    if (isConnected) {
      loadCategories();
    }
  }, [isConnected]);

  // 加载分组
  const loadCategories = async () => {
    try {
      const response = await groupsAPI.getGroupCategories();
      if (response.data.success) {
        setCategories(response.data.categories || []);
      }
    } catch (error) {
      console.error('加载分组失败:', error);
    }
  };

  // 过滤后的群组列表
  const filteredGroups = groups.filter(group => {
    const matchesSearch = group.name.toLowerCase().includes(searchText.toLowerCase());
    
    if (selectedCategory === 'all') {
      return matchesSearch;
    } else if (selectedCategory === 'uncategorized') {
      const isUncategorized = !categories.some(cat => 
        cat.groupIds && cat.groupIds.includes(group.id)
      );
      return matchesSearch && isUncategorized;
    } else {
      const category = categories.find(cat => cat.id === selectedCategory);
      const isInCategory = category && category.groupIds && category.groupIds.includes(group.id);
      return matchesSearch && isInCategory;
    }
  });

  // 刷新群组列表
  const handleRefreshGroups = async () => {
    setLoading(true);
    try {
      await fetchGroups();
      message.success('群组列表已刷新');
    } catch (error) {
      message.error('刷新群组列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建/编辑分组
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      message.error('分组名称不能为空');
      return;
    }

    setLoading(true);
    try {
      if (editingCategory) {
        await groupsAPI.updateGroupCategory(editingCategory.id, categoryForm);
        message.success('分组更新成功');
      } else {
        await groupsAPI.createGroupCategory(categoryForm);
        message.success('分组创建成功');
      }
      
      setCategoryModalVisible(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '' });
      loadCategories();
      
    } catch (error) {
      message.error(editingCategory ? '分组更新失败' : '分组创建失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除分组
  const handleDeleteCategory = async (category) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除分组 "${category.name}" 吗？此操作不会删除群组本身。`,
      onOk: async () => {
        try {
          await groupsAPI.deleteGroupCategory(category.id);
          message.success('分组删除成功');
          loadCategories();
        } catch (error) {
          message.error('分组删除失败');
        }
      }
    });
  };

  // 编辑分组
  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || ''
    });
    setCategoryModalVisible(true);
  };

  // 添加群组到分组
  const handleAddToCategory = async (categoryId) => {
    if (selectedGroups.length === 0) {
      message.error('请选择要添加的群组');
      return;
    }

    try {
      await groupsAPI.addGroupsToCategory(categoryId, {
        groupIds: selectedGroups
      });
      message.success(`成功将 ${selectedGroups.length} 个群组添加到分组`);
      setSelectedGroups([]);
      loadCategories();
    } catch (error) {
      message.error('添加群组到分组失败');
    }
  };

  // 从分组移除群组
  const handleRemoveFromCategory = async (categoryId, groupId) => {
    try {
      await groupsAPI.removeGroupFromCategory(categoryId, groupId);
      message.success('群组已从分组中移除');
      loadCategories();
    } catch (error) {
      message.error('移除群组失败');
    }
  };

  // 群组选择
  const handleGroupSelection = (groupId, checked) => {
    if (checked) {
      setSelectedGroups(prev => [...prev, groupId]);
    } else {
      setSelectedGroups(prev => prev.filter(id => id !== groupId));
    }
  };

  // 全选/取消全选
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedGroups(filteredGroups.map(group => group.id));
    } else {
      setSelectedGroups([]);
    }
  };

  // 获取分组统计
  const getCategoryStats = () => {
    const uncategorizedCount = groups.filter(group => 
      !categories.some(cat => cat.groupIds && cat.groupIds.includes(group.id))
    ).length;

    return {
      total: groups.length,
      categorized: groups.length - uncategorizedCount,
      uncategorized: uncategorizedCount,
      categories: categories.length
    };
  };

  const stats = getCategoryStats();

  // 表格列定义
  const columns = [
    {
      title: (
        <Checkbox
          checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0}
          indeterminate={selectedGroups.length > 0 && selectedGroups.length < filteredGroups.length}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          选择
        </Checkbox>
      ),
      key: 'select',
      width: 80,
      render: (_, record) => (
        <Checkbox
          checked={selectedGroups.includes(record.id)}
          onChange={(e) => handleGroupSelection(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: '群组名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text strong>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '成员数',
      dataIndex: 'participants',
      key: 'participants',
      width: 100,
      render: (count) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: '分组',
      key: 'category',
      width: 150,
      render: (_, record) => {
        const groupCategories = categories.filter(cat => 
          cat.groupIds && cat.groupIds.includes(record.id)
        );
        
        if (groupCategories.length === 0) {
          return <Tag color="default">未分组</Tag>;
        }
        
        return groupCategories.map(cat => (
          <Tag key={cat.id} color="green">
            {cat.name}
          </Tag>
        ));
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => {
        const groupCategory = categories.find(cat => 
          cat.groupIds && cat.groupIds.includes(record.id)
        );
        
        return groupCategory ? (
          <Button
            size="small"
            danger
            onClick={() => handleRemoveFromCategory(groupCategory.id, record.id)}
          >
            移除分组
          </Button>
        ) : null;
      },
    }
  ];

  if (!isConnected) {
    return (
      <div>
        <Title level={2}>群组分组</Title>
        <Alert
          message="WhatsApp 未连接"
          description="请先连接 WhatsApp 后再使用群组分组功能。"
          type="warning"
          showIcon
          action={
            <Button 
              size="small" 
              type="primary"
              onClick={() => navigate('/whatsapp-connect')}
            >
              立即连接
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>群组分组管理</Title>
      
      {/* 统计信息 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <div>
            <Text type="secondary">总群组数</Text>
            <div><Text strong style={{ fontSize: 20 }}>{stats.total}</Text></div>
          </div>
          <Divider type="vertical" />
          <div>
            <Text type="secondary">已分组</Text>
            <div><Text strong style={{ fontSize: 20, color: '#52c41a' }}>{stats.categorized}</Text></div>
          </div>
          <Divider type="vertical" />
          <div>
            <Text type="secondary">未分组</Text>
            <div><Text strong style={{ fontSize: 20, color: '#faad14' }}>{stats.uncategorized}</Text></div>
          </div>
          <Divider type="vertical" />
          <div>
            <Text type="secondary">分组数</Text>
            <div><Text strong style={{ fontSize: 20, color: '#1890ff' }}>{stats.categories}</Text></div>
          </div>
        </Space>
      </Card>

      {/* 分组管理 */}
      <Card title="分组管理" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCategory(null);
              setCategoryForm({ name: '', description: '' });
              setCategoryModalVisible(true);
            }}
          >
            创建分组
          </Button>
          
          {categories.map(category => (
            <div key={category.id} style={{ display: 'inline-block', margin: '4px' }}>
              <Tag
                color="blue"
                style={{ padding: '4px 8px', fontSize: '14px' }}
              >
                <FolderOutlined /> {category.name} ({category.groupCount || 0})
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEditCategory(category)}
                  style={{ marginLeft: 8 }}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteCategory(category)}
                  danger
                />
              </Tag>
            </div>
          ))}
        </Space>
      </Card>

      {/* 群组列表 */}
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索群组名称"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          
          <Select
            value={selectedCategory}
            onChange={setSelectedCategory}
            style={{ width: 150 }}
            placeholder="选择分组"
          >
            <Option value="all">全部群组</Option>
            <Option value="uncategorized">未分组</Option>
            {categories.map(category => (
              <Option key={category.id} value={category.id}>
                {category.name}
              </Option>
            ))}
          </Select>

          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefreshGroups}
            loading={loading}
          >
            刷新群组
          </Button>

          {selectedGroups.length > 0 && (
            <>
              <Text>已选择 {selectedGroups.length} 个群组</Text>
              <Select
                placeholder="添加到分组"
                style={{ width: 150 }}
                onSelect={handleAddToCategory}
                value={undefined}
              >
                {categories.map(category => (
                  <Option key={category.id} value={category.id}>
                    {category.name}
                  </Option>
                ))}
              </Select>
              <Button onClick={() => setSelectedGroups([])}>
                取消选择
              </Button>
            </>
          )}
        </Space>

        <Table
          columns={columns}
          dataSource={filteredGroups}
          rowKey="id"
          pagination={false}
          loading={loading}
        />
      </Card>

      {/* 分组创建/编辑对话框 */}
      <Modal
        title={editingCategory ? '编辑分组' : '创建分组'}
        open={categoryModalVisible}
        onCancel={() => {
          setCategoryModalVisible(false);
          setEditingCategory(null);
          setCategoryForm({ name: '', description: '' });
        }}
        onOk={handleSaveCategory}
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>分组名称 *</Text>
            <Input
              value={categoryForm.name}
              onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="请输入分组名称"
              maxLength={50}
            />
          </div>
          <div>
            <Text strong>分组描述</Text>
            <Input.TextArea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="请输入分组描述（可选）"
              rows={3}
              maxLength={200}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default Groups;
