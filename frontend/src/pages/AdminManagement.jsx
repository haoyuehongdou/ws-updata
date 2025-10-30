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
  Typography, 
  Empty,
  Popconfirm,
  Tag,
  Alert,
  List,
  Avatar,
  Tooltip
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  UserOutlined,
  CrownOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  CopyOutlined,
  EditOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { whatsappAPI } from '../utils/api';

const { Title, Text, Paragraph } = Typography;

export default function AdminManagement() {
  const { isConnected } = useWhatsApp();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    if (isConnected) {
      loadAdmins();
    }
  }, [isConnected]);

  // 加载管理员列表
  const loadAdmins = async () => {
    setLoading(true);
    try {
      const response = await whatsappAPI.getAdmins();
      if (response.data.success) {
        setAdmins(response.data.admins || []);
      }
    } catch (error) {
      message.error('加载管理员列表失败');
      console.error('加载管理员列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 添加管理员
  const handleAddAdmin = async (values) => {
    // 检查是否已存在相同的管理员
    if (admins.some(admin => (typeof admin === 'string' ? admin : admin.id) === values.adminId)) {
      message.error('该用户已是管理员，请勿重复添加');
      return;
    }

    try {
      setLoading(true);
      const response = await whatsappAPI.addAdmin(values);
      if (response.data.success) {
        message.success('管理员添加成功');
        setAddModalVisible(false);
        form.resetFields();
        loadAdmins();
      } else {
        message.error('添加失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('添加管理员失败');
      console.error('添加管理员失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 更新管理员
  const handleUpdateAdmin = async (values) => {
    try {
      setLoading(true);
      const response = await whatsappAPI.updateAdmin(editingAdmin.adminId, values);
      if (response.data.success) {
        message.success('管理员更新成功');
        setEditModalVisible(false);
        setEditingAdmin(null);
        editForm.resetFields();
        loadAdmins();
      } else {
        message.error('更新失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('更新管理员失败');
      console.error('更新管理员失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 删除管理员
  const handleDeleteAdmin = async (record) => {
    try {
      // 从记录中获取管理员ID
      const adminId = record.adminId || record.id;
      const response = await whatsappAPI.deleteAdmin(adminId);
      if (response.data.success) {
        message.success('管理员删除成功');
        loadAdmins();
      } else {
        message.error('删除失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('删除管理员失败');
      console.error('删除管理员失败:', error);
    }
  };

  // 复制ID到剪贴板
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
      message.success('ID已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // 表格列定义
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      render: (_, __, index) => index + 1,
    },
    {
      title: '管理员ID',
      dataIndex: 'adminId',
      key: 'adminId',
      render: (id) => (
        <Space>
          <Text code>{id}</Text>
          <Tooltip title="复制完整ID">
            <Button 
              type="text" 
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyId(id)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      render: (note) => note || '-',
    },
    {
      title: '添加时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (time) => time ? new Date(time).toLocaleString() : '未知',
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => (
        <Tag icon={<CrownOutlined />} color="gold">
          管理员
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingAdmin(record);
              editForm.setFieldsValue({ note: record.note });
              setEditModalVisible(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此管理员吗？"
            description="删除后该用户将失去管理员权限"
            onConfirm={() => handleDeleteAdmin(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="text" 
              danger 
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 转换管理员数据为表格格式
  const tableData = admins.map((admin, index) => {
    // 兼容新旧格式
    if (typeof admin === 'string') {
      // 旧格式：直接是ID字符串
      return {
        key: admin,
        adminId: admin,
        createdAt: null,
        note: '',
      };
    } else {
      // 新格式：包含id和createdAt的对象
      return {
        key: admin.id,
        adminId: admin.id,
        createdAt: admin.createdAt,
        note: admin.note,
      };
    }
  });

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>管理员管理</Title>
      
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
          {/* 说明卡片 */}
          <Alert
            message="管理员说明"
            description={
              <div>
                <p>• 管理员可以使用所有记账命令（开启/关闭群账单、清空账单、撤销等）</p>
                <p>• 普通用户只能使用查看命令和计算命令</p>
                <p>• 用户需要在群内发送 /myid 命令获取自己的唯一ID</p>
                <p>• 管理员ID格式为：手机号@lid</p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            action={
              <Button 
                size="small" 
                icon={<InfoCircleOutlined />}
                onClick={() => setHelpModalVisible(true)}
              >
                查看帮助
              </Button>
            }
          />

          {/* 操作卡片 */}
          <Card 
            title={
              <Space>
                <CrownOutlined />
                <span>管理员列表</span>
                <Tag color="blue">{admins.length}</Tag>
              </Space>
            }
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={() => setAddModalVisible(true)}
              >
                添加管理员
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={tableData}
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
                    description="暂无管理员，点击上方按钮添加"
                  />
                )
              }}
            />
          </Card>

          {/* 添加管理员对话框 */}
          <Modal
            title="添加管理员"
            open={addModalVisible}
            onCancel={() => {
              setAddModalVisible(false);
              form.resetFields();
            }}
            onOk={() => form.submit()}
            confirmLoading={loading}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleAddAdmin}
            >
              <Alert
                message="获取用户ID方法"
                description="请让用户在任意群组内发送 /myid 命令，系统会回复该用户的唯一ID"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              <Form.Item
                label="管理员ID"
                name="adminId"
                rules={[
                  { required: true, message: '请输入管理员ID' },
                  { 
                    pattern: /\S+@\S+/, 
                    message: '请输入有效的WhatsApp用户ID（格式：号码@lid）' 
                  }
                ]}
              >
                <Input 
                  placeholder="例如：1234567890@lid"
                  prefix={<UserOutlined />}
                />
              </Form.Item>

              <Form.Item
                label="备注"
                name="note"
              >
                <Input.TextArea 
                  rows={2}
                  placeholder="选填，例如：财务、运营"
                />
              </Form.Item>

              <div style={{ marginTop: 16 }}>
                <Text type="secondary">
                  💡 提示：
                </Text>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  <li>
                    <Text type="secondary">
                      用户ID通常以手机号开头，以 @lid 结尾
                    </Text>
                  </li>
                  <li>
                    <Text type="secondary">
                      确保输入的ID准确无误，否则无法正常授权
                    </Text>
                  </li>
                </ul>
              </div>
            </Form>
          </Modal>

          {/* 编辑管理员对话框 */}
          <Modal
            title="编辑管理员"
            open={editModalVisible}
            onCancel={() => {
              setEditModalVisible(false);
              setEditingAdmin(null);
              editForm.resetFields();
            }}
            onOk={() => editForm.submit()}
            confirmLoading={loading}
          >
            <Form
              form={editForm}
              layout="vertical"
              onFinish={handleUpdateAdmin}
            >
              <Form.Item
                label="管理员ID"
              >
                <Input 
                  value={editingAdmin?.adminId}
                  disabled
                />
              </Form.Item>

              <Form.Item
                label="备注"
                name="note"
              >
                <Input.TextArea 
                  rows={2}
                  placeholder="选填，例如：财务、运营"
                />
              </Form.Item>
            </Form>
          </Modal>

          {/* 帮助对话框 */}
          <Modal
            title="管理员系统使用帮助"
            open={helpModalVisible}
            onCancel={() => setHelpModalVisible(false)}
            footer={[
              <Button key="close" onClick={() => setHelpModalVisible(false)}>
                关闭
              </Button>
            ]}
            width={700}
          >
            <div>
              <Title level={4}>如何获取用户ID？</Title>
              <List
                size="small"
                dataSource={[
                  {
                    step: '1',
                    title: '用户发送命令',
                    description: '让需要设为管理员的用户在任意群组内发送 /myid 命令'
                  },
                  {
                    step: '2', 
                    title: '系统返回ID',
                    description: '系统会自动回复该用户的唯一ID，格式为：手机号@lid'
                  },
                  {
                    step: '3',
                    title: '复制ID',
                    description: '复制完整的用户ID，在上方输入框中粘贴并添加'
                  },
                  {
                    step: '4',
                    title: '确认权限',
                    description: '添加成功后，该用户即可使用所有管理员命令'
                  }
                ]}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar style={{ backgroundColor: '#1890ff' }}>{item.step}</Avatar>}
                      title={item.title}
                      description={item.description}
                    />
                  </List.Item>
                )}
              />

              <Title level={4} style={{ marginTop: 24 }}>管理员权限</Title>
              <List
                size="small"
                dataSource={[
                  { icon: '✅', text: '开启群账单 (/on)' },
                  { icon: '❌', text: '关闭群账单 (/off)' },
                  { icon: '🗑️', text: '清空账单 (/js)' },
                  { icon: '↩️', text: '撤销交易 (/back)' },
                  { icon: '👁️', text: '查看账单 (/show)' },
                  { icon: '🆔', text: '查看用户ID (/myid)' },
                  { icon: '🧮', text: '使用计算功能（如：+100、-50、10*2等）' }
                ]}
                renderItem={item => (
                  <List.Item>
                    <Text>
                      <span style={{ marginRight: 8 }}>{item.icon}</span>
                      {item.text}
                    </Text>
                  </List.Item>
                )}
              />

              <Title level={4} style={{ marginTop: 24 }}>普通用户权限</Title>
              <List
                size="small"
                dataSource={[
                  { icon: '👁️', text: '查看账单 (/show)' },
                  { icon: '🆔', text: '查看自己的ID (/myid)' },
                  { icon: '🧮', text: '使用计算功能（如：+100、-50、10*2等）' }
                ]}
                renderItem={item => (
                  <List.Item>
                    <Text>
                      <span style={{ marginRight: 8 }}>{item.icon}</span>
                      {item.text}
                    </Text>
                  </List.Item>
                )}
              />

              <Alert
                message="注意事项"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>管理员权限立即生效，无需重启系统</li>
                    <li>删除管理员后，该用户立即失去管理员权限</li>
                    <li>建议定期检查管理员列表，及时移除不需要的管理员</li>
                    <li>用户ID是唯一的，不会因为更换群组而改变</li>
                  </ul>
                }
                type="warning"
                style={{ marginTop: 16 }}
              />
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
