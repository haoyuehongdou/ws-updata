import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Input, 
  Space, 
  Modal, 
  message, 
  Form, 
  ColorPicker, 
  Tag, 
  Tooltip, 
  Empty,
  Transfer,
  Typography,
  Popconfirm,
  Badge
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  UsergroupAddOutlined,
  SearchOutlined,
  FolderOutlined,
  GroupOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { groupsAPI } from '../utils/api';

const { Title, Text } = Typography;

export default function GroupCategories() {
  const { isConnected, groups } = useWhatsApp();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [assigningCategory, setAssigningCategory] = useState(null);
  const [transferData, setTransferData] = useState([]);
  const [transferTargetKeys, setTransferTargetKeys] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (isConnected) {
      loadCategories();
    }
  }, [isConnected]);

  // 加载分组列表
  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await groupsAPI.getGroupCategories();
      if (response.data.success) {
        setCategories(response.data.categories || []);
      }
    } catch (error) {
      message.error('加载群组分组失败');
      console.error('加载群组分组失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建分组
  const handleCreateCategory = () => {
    setEditingCategory(null);
    form.resetFields();
    form.setFieldsValue({
      color: '#1890ff'
    });
    setCategoryModalVisible(true);
  };

  // 编辑分组
  const handleEditCategory = (category) => {
    setEditingCategory(category);
    form.setFieldsValue({
      name: category.name,
      description: category.description,
      color: category.color
    });
    setCategoryModalVisible(true);
  };

  // 删除分组
  const handleDeleteCategory = async (categoryId) => {
    try {
      const response = await groupsAPI.deleteGroupCategory(categoryId);
      if (response.data.success) {
        message.success('分组删除成功');
        loadCategories();
      } else {
        message.error('删除失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('删除分组失败');
      console.error('删除分组失败:', error);
    }
  };

  // 保存分组
  const handleSaveCategory = async (values) => {
    try {
      setLoading(true);
      
      if (editingCategory) {
        // 更新分组
        const response = await groupsAPI.updateGroupCategory(editingCategory.id, values);
        if (response.data.success) {
          message.success('分组更新成功');
          setCategoryModalVisible(false);
          loadCategories();
        } else {
          message.error('更新失败: ' + response.data.message);
        }
      } else {
        // 创建分组
        const response = await groupsAPI.createGroupCategory(values);
        if (response.data.success) {
          message.success('分组创建成功');
          setCategoryModalVisible(false);
          loadCategories();
        } else {
          message.error('创建失败: ' + response.data.message);
        }
      }
    } catch (error) {
      message.error(editingCategory ? '更新分组失败' : '创建分组失败');
      console.error('保存分组失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 分配群组
  const handleAssignGroups = async (category) => {
    setAssigningCategory(category);
    
    // 获取未分组的群组
    try {
      const response = await groupsAPI.getUncategorizedGroups();
      if (response.data.success) {
        const uncategorizedGroups = response.data.groups || [];
        
        // 获取当前分组中的群组
        const categoryGroupsResponse = await groupsAPI.getCategoryGroups(category.id);
        const categoryGroups = categoryGroupsResponse.data.success ? 
          categoryGroupsResponse.data.groups || [] : [];
        
        // 准备穿梭框数据
        const allAvailableGroups = [...uncategorizedGroups, ...categoryGroups];
        const transferItems = allAvailableGroups.map(group => ({
          key: group.id,
          title: group.name,
          description: '',
          disabled: false
        }));
        
        setTransferData(transferItems);
        setTransferTargetKeys(categoryGroups.map(g => g.id));
        setAssignModalVisible(true);
      }
    } catch (error) {
      message.error('获取群组列表失败');
      console.error('获取群组列表失败:', error);
    }
  };

  // 保存群组分配
  const handleSaveAssignment = async () => {
    if (!assigningCategory) return;
    
    try {
      setLoading(true);
      
      // 获取当前分组中的群组
      const categoryGroupsResponse = await groupsAPI.getCategoryGroups(assigningCategory.id);
      const currentGroupIds = categoryGroupsResponse.data.success ? 
        (categoryGroupsResponse.data.groups || []).map(g => g.id) : [];
      
      // 计算需要添加和移除的群组
      const toAdd = transferTargetKeys.filter(id => !currentGroupIds.includes(id));
      const toRemove = currentGroupIds.filter(id => !transferTargetKeys.includes(id));
      
      // 添加新群组
      if (toAdd.length > 0) {
        const addResponse = await groupsAPI.addGroupsToCategory(assigningCategory.id, {
          groupIds: toAdd
        });
        if (!addResponse.data.success) {
          throw new Error('添加群组失败');
        }
      }
      
      // 移除群组
      for (const groupId of toRemove) {
        const removeResponse = await groupsAPI.removeGroupFromCategory(assigningCategory.id, groupId);
        if (!removeResponse.data.success) {
          console.warn(`移除群组 ${groupId} 失败`);
        }
      }
      
      message.success('群组分配已更新');
      setAssignModalVisible(false);
      loadCategories();
    } catch (error) {
      message.error('保存群组分配失败');
      console.error('保存群组分配失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <div 
            style={{ 
              width: 16, 
              height: 16, 
              backgroundColor: record.color, 
              borderRadius: 4 
            }} 
          />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text) => text || '无描述',
    },
    {
      title: '群组数量',
      dataIndex: 'groupCount',
      key: 'groupCount',
      width: 120,
      render: (count) => (
        <Badge 
          count={count} 
          style={{ backgroundColor: '#52c41a' }}
          overflowCount={999}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="分配群组">
            <Button 
              type="text" 
              icon={<UsergroupAddOutlined />}
              onClick={() => handleAssignGroups(record)}
            />
          </Tooltip>
          <Tooltip title="编辑分组">
            <Button 
              type="text" 
              icon={<EditOutlined />}
              onClick={() => handleEditCategory(record)}
            />
          </Tooltip>
          <Tooltip title="删除分组">
            <Popconfirm
              title="确定要删除此分组吗？"
              description="删除后群组将变为未分组状态"
              onConfirm={() => handleDeleteCategory(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>群组分组管理</Title>
      
      {!isConnected && (
        <Card>
          <Empty 
            description="WhatsApp未连接，请先连接WhatsApp" 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}

      {isConnected && (
        <>
          <Card 
            title={
              <Space>
                <FolderOutlined />
                <span>分组列表</span>
                <Badge count={categories.length} style={{ backgroundColor: '#1890ff' }} />
              </Space>
            }
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleCreateCategory}
              >
                创建分组
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={categories}
              rowKey="id"
              loading={loading}
              pagination={{
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
              }}
              locale={{
                emptyText: (
                  <Empty 
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无分组，点击上方按钮创建"
                  />
                )
              }}
            />
          </Card>

          {/* 创建/编辑分组对话框 */}
          <Modal
            title={editingCategory ? '编辑分组' : '创建分组'}
            open={categoryModalVisible}
            onCancel={() => setCategoryModalVisible(false)}
            onOk={() => form.submit()}
            confirmLoading={loading}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveCategory}
            >
              <Form.Item
                label="分组名称"
                name="name"
                rules={[
                  { required: true, message: '请输入分组名称' },
                  { max: 50, message: '分组名称不能超过50个字符' }
                ]}
              >
                <Input placeholder="请输入分组名称" />
              </Form.Item>

              <Form.Item
                label="分组描述"
                name="description"
                rules={[
                  { max: 200, message: '描述不能超过200个字符' }
                ]}
              >
                <Input.TextArea 
                  placeholder="请输入分组描述（可选）"
                  rows={3}
                />
              </Form.Item>

              <Form.Item
                label="分组颜色"
                name="color"
                rules={[{ required: true, message: '请选择分组颜色' }]}
              >
                <ColorPicker 
                  showText
                  format="hex"
                  presets={[
                    {
                      label: '推荐颜色',
                      colors: [
                        '#1890ff', '#52c41a', '#faad14', '#f5222d',
                        '#722ed1', '#13c2c2', '#eb2f96', '#fa541c'
                      ]
                    }
                  ]}
                />
              </Form.Item>
            </Form>
          </Modal>

          {/* 分配群组对话框 */}
          <Modal
            title={`为 "${assigningCategory?.name}" 分配群组`}
            open={assignModalVisible}
            onCancel={() => setAssignModalVisible(false)}
            onOk={handleSaveAssignment}
            confirmLoading={loading}
            width={800}
          >
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">
                左侧为可用群组，右侧为已分配群组。可以通过拖拽或点击箭头来分配群组。
              </Text>
            </div>
            
            <Transfer
              dataSource={transferData}
              targetKeys={transferTargetKeys}
              onChange={setTransferTargetKeys}
              render={item => (
                <div>
                  <div>{item.title}</div>
                  <div style={{ color: '#999', fontSize: '12px' }}>
                    {item.description}
                  </div>
                </div>
              )}
              titles={['可用群组', '已分配群组']}
              listStyle={{
                width: 300,
                height: 400,
              }}
              showSearch
              filterOption={(inputValue, item) => {
                // 确保title和description是字符串类型
                const title = typeof item.title === 'string' ? item.title : '';
                const description = typeof item.description === 'string' ? item.description : '';
                const searchValue = typeof inputValue === 'string' ? inputValue.toLowerCase() : '';
                
                // 在title和description中搜索
                return title.toLowerCase().includes(searchValue) || 
                       description.toLowerCase().includes(searchValue);
              }}
              searchPlaceholder="搜索群组"
              notFoundContent="暂无群组"
              locale={{
                searchPlaceholder: '搜索群组',
                itemUnit: '个群组',
                itemsUnit: '个群组',
                notFoundContent: '列表为空',
                selectAll: '全选',
                selectCurrent: '选择当前页',
                selectInvert: '反选当前页',
                remove: '删除',
                removeCurrent: '删除当前页',
                removeAll: '删除全部',
                selectAllText: '全选',
                selectCurrentText: '选择当前页',
                selectInvertText: '反选当前页',
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
