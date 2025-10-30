import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Modal, 
  message, 
  Tag, 
  Tooltip, 
  Empty,
  Typography,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Input,
  DatePicker,
  Select,
  Badge,
  Descriptions
} from 'antd';
import { 
  DollarCircleOutlined, 
  DeleteOutlined, 
  DownloadOutlined, 
  EyeOutlined,
  CalculatorOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  ClearOutlined,
  StopOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { whatsappAPI } from '../utils/api';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function BillManagement() {
  const { isConnected } = useWhatsApp();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billDetails, setBillDetails] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  

  useEffect(() => {
    if (isConnected) {
      loadBills();
    }
  }, [isConnected]);

  

  // 加载账单列表
  const loadBills = async () => {
    setLoading(true);
    try {
      const response = await whatsappAPI.getBills();
      if (response.data.success) {
        setBills(response.data.bills || []);
      }
    } catch (error) {
      message.error('加载账单列表失败');
      console.error('加载账单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 查看账单详情
  const handleViewDetails = async (bill) => {
    setSelectedBill(bill);
    setLoading(true);
    try {
      const response = await whatsappAPI.getBillDetails(bill.groupId);
      if (response.data.success) {
        setBillDetails(response.data);
        setDetailModalVisible(true);
      } else {
        message.error('获取账单详情失败');
      }
    } catch (error) {
      message.error('获取账单详情失败');
      console.error('获取账单详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 开启账单
  const handleEnableBill = async (bill) => {
    try {
      const response = await whatsappAPI.enableBill(bill.groupId);
      if (response.data.success) {
        message.success('账单已开启');
        // 如果后端返回了账单数据，直接更新到列表中
        if (response.data.bill) {
          setBills(prevBills => {
            // 检查是否已存在该账单
            const existingIndex = prevBills.findIndex(b => b.groupId === bill.groupId);
            if (existingIndex >= 0) {
              // 更新现有账单
              const newBills = [...prevBills];
              newBills[existingIndex] = response.data.bill;
              return newBills;
            } else {
              // 添加新账单
              return [...prevBills, response.data.bill];
            }
          });
        } else {
          // 如果没有返回账单数据，则重新加载整个列表
          loadBills();
        }
      } else {
        message.error('开启失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('开启账单失败');
      console.error('开启账单失败:', error);
    }
  };

  // 关闭账单
  const handleDisableBill = async (bill) => {
    try {
      const response = await whatsappAPI.disableBill(bill.groupId);
      if (response.data.success) {
        message.success('账单已关闭');
        loadBills(); // 刷新账单列表
      } else {
        message.error('关闭失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('关闭账单失败');
      console.error('关闭账单失败:', error);
    }
  };

  // 清空账单
  const handleClearBill = async (bill) => {
    try {
      const response = await whatsappAPI.clearBill(bill.groupId);
      if (response.data.success) {
        message.success('账单已清空');
        loadBills();
      } else {
        message.error('清空失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('清空账单失败');
      console.error('清空账单失败:', error);
    }
  };

  // 导出账单
  const handleExportBill = async (bill) => {
    try {
      const response = await whatsappAPI.exportBill(bill.groupId);
      
      // 创建下载链接
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
        type: 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bill_${bill.groupName}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      message.success('账单已导出');
    } catch (error) {
      message.error('导出账单失败');
      console.error('导出账单失败:', error);
    }
  };

  // 过滤账单
  const filteredBills = bills.filter(bill => {
    const matchesSearch = bill.groupName.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && bill.isActive) ||
      (statusFilter === 'inactive' && !bill.isActive);
    return matchesSearch && matchesStatus;
  });

  // 统计数据
  const statistics = {
    totalBills: bills.length,
    activeBills: bills.filter(b => b.isActive).length,
    totalAmount: bills.reduce((sum, b) => sum + (b.total || 0), 0),
    totalTransactions: bills.reduce((sum, b) => sum + (b.transactionCount || 0), 0)
  };

  // 表格列定义
  const columns = [
    {
      title: '群组名称',
      dataIndex: 'groupName',
      key: 'groupName',
      ellipsis: true,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '账单金额',
      dataIndex: 'total',
      key: 'total',
      width: 120,
      render: (amount) => (
        <Statistic 
          value={amount || 0} 
          precision={2}
          valueStyle={{ 
            fontSize: 14,
            color: amount > 0 ? '#3f8600' : amount < 0 ? '#cf1322' : '#666'
          }}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? '开启' : '关闭'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button 
              type="text" 
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          <Tooltip title="清空账单">
            <Popconfirm
              title="确定要清空此账单吗？"
              description="清空后所有交易记录将被删除且无法恢复"
              onConfirm={() => handleClearBill(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                type="text" 
                danger 
                icon={<ClearOutlined />}
              />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="导出账单">
            <Button 
              type="text" 
              icon={<DownloadOutlined />}
              onClick={() => handleExportBill(record)}
            />
          </Tooltip>
          <Tooltip title={record.isActive ? "关闭账单" : "开启账单"}>
            <Popconfirm
              title={record.isActive ? "确定要关闭此账单吗？" : "确定要开启此账单吗？"}
              onConfirm={() => record.isActive ? handleDisableBill(record) : handleEnableBill(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                type="text" 
                icon={record.isActive ? <StopOutlined /> : <DollarCircleOutlined />}
                danger={record.isActive}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 交易详情表格列
  const transactionColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (time) => new Date(time).toLocaleString(),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount) => (
        <Text style={{ 
          color: amount > 0 ? '#3f8600' : '#cf1322',
          fontWeight: 'bold'
        }}>
          {amount > 0 ? '+' : ''}{amount}
        </Text>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (remark) => remark || '无备注',
    },
    {
      title: '用户',
      dataIndex: 'user',
      key: 'user',
      ellipsis: true,
      render: (user, record) => (
        <Text code style={{ fontSize: 12 }}>
          {record.userRemark || (user?.split('@')[0] || user)}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>账单管理</Title>
      
      {/* 当未连接且无任何数据显示时，显示提示 */}
      {!isConnected && bills.length === 0 && (
        <Card>
          <Empty 
            description="WhatsApp未连接，请先连接WhatsApp" 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}

      {/* 当已连接或已有数据显示时，渲染主界面 */}
      {(isConnected || bills.length > 0) && (
        <>
          {/* 当连接断开但有旧数据时，显示警告 */}
          {!isConnected && (
            <Alert
              message="WhatsApp 连接已断开"
              description="当前显示的是最后一次加载的数据。刷新等操作可能无法使用，请重新连接WhatsApp。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 统计卡片 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card>
                <Statistic 
                  title="总账单数" 
                  value={statistics.totalBills} 
                  prefix={<DollarCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic 
                  title="总金额" 
                  value={statistics.totalAmount} 
                  precision={2}
                  prefix={<DollarCircleOutlined />}
                  valueStyle={{ 
                    color: statistics.totalAmount > 0 ? '#3f8600' : '#cf1322' 
                  }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic 
                  title="总交易数" 
                  value={statistics.totalTransactions} 
                  prefix={<CalculatorOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* 操作栏 */}
          <Card style={{ marginBottom: 16 }}>
            <Space wrap>
              <Input
                placeholder="搜索群组名称"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 200 }}
                allowClear
              />
              
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 120 }}
              >
                <Option value="all">全部状态</Option>
                <Option value="active">已开启</Option>
                <Option value="inactive">已关闭</Option>
              </Select>

              <Button 
                icon={<ReloadOutlined />} 
                onClick={loadBills}
                loading={loading}
                disabled={!isConnected}
              >
                刷新
              </Button>
            </Space>
          </Card>

          {/* 账单列表 */}
          <Card title={`账单列表 (${filteredBills.length})`}>
            <Table
              columns={columns}
              dataSource={filteredBills}
              rowKey="groupId"
              loading={loading}
              pagination={false}
              locale={{
                emptyText: (
                  <Empty 
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="暂无账单数据"
                  />
                )
              }}
            />
          </Card>

          {/* 账单详情对话框 */}
          <Modal
            title={`账单详情 - ${selectedBill?.groupName}`}
            open={detailModalVisible}
            onCancel={() => setDetailModalVisible(false)}
            footer={[
              <Button key="export" onClick={() => handleExportBill(selectedBill)}>
                导出账单
              </Button>,
              <Button key="close" onClick={() => setDetailModalVisible(false)}>
                关闭
              </Button>
            ]}
            width={900}
          >
            {billDetails && (
              <div>
                {/* 群组信息 */}
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Descriptions column={3} size="small">
                    <Descriptions.Item label="群组ID">
                      <Text code>{billDetails.groupInfo.id}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="群组名称">
                      {billDetails.groupInfo.name}
                    </Descriptions.Item>
                    <Descriptions.Item label="成员数">
                      <Tag color="blue">
                        {billDetails.groupInfo.participants}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="账单状态">
                      <Tag color={billDetails.bill.isActive ? 'green' : 'default'}>
                        {billDetails.bill.isActive ? '开启' : '关闭'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="当前余额">
                      <Statistic 
                        value={billDetails.bill.total} 
                        precision={2}
                        valueStyle={{ 
                          fontSize: 16,
                          color: billDetails.bill.total > 0 ? '#3f8600' : '#cf1322'
                        }}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="交易笔数">
                      <Tag color="green">
                        {billDetails.bill.transactions.length}
                      </Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                {/* 交易记录 */}
                <Card title="交易记录" size="small">
                  <Table
                    columns={transactionColumns}
                    dataSource={billDetails.bill.transactions}
                    rowKey={(record) => record.timestamp}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total, range) => 
                        `第 ${range[0]}-${range[1]} 条，共 ${total} 条交易`,
                    }}
                    size="small"
                    locale={{
                      emptyText: '暂无交易记录'
                    }}
                  />
                </Card>
              </div>
            )}
          </Modal>
        </>
      )}
    </div>
  );
}
