import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Button,
  Input,
  Space,
  message,
  Checkbox,
  Tag,
  Progress,
  InputNumber,
  Empty,
  Typography,
  Row,
  Col,
  Alert,
  Divider,
  Tabs,
  List,
  Badge,
  Spin
} from 'antd';
import {
  SendOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { whatsappAPI, groupsAPI } from '../utils/api';

const { TextArea } = Input;
const { Text, Title } = Typography;

export default function Broadcast() {
  const { isConnected, groups, fetchGroups } = useWhatsApp();

  // 通用状态
  const [loading, setLoading] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(null);
  const [progressPolling, setProgressPolling] = useState(null);

  // 全部群发模块状态
  const [allBroadcastMessage, setAllBroadcastMessage] = useState('');
  const [allBroadcastDelay, setAllBroadcastDelay] = useState(3000);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [searchText, setSearchText] = useState('');

  // 分组群发模块状态
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryMessage, setCategoryMessage] = useState('');
  const [categoryDelay, setCategoryDelay] = useState(3000);

  // 加载数据
  useEffect(() => {
    if (isConnected) {
      loadGroupCategories();
      fetchGroups();
    }
  }, [isConnected]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (progressPolling) {
        clearInterval(progressPolling);
      }
    };
  }, [progressPolling]);

  // 加载分组
  const loadGroupCategories = async () => {
    try {
      const response = await groupsAPI.getGroupCategories();
      if (response.data.success) {
        setCategories(response.data.categories || []);
      }
    } catch (error) {
      console.error('加载群组分组失败:', error);
    }
  };

  // 刷新群组列表
  const handleRefreshGroups = async () => {
    setLoading(true);
    try {
      await fetchGroups();
      await loadGroupCategories();
      message.success('群组列表已刷新');
    } catch (error) {
      message.error('刷新群组列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    const filteredIds = filteredGroups.map(g => g.id);
    setSelectedGroups(filteredIds);
    message.success(`已选择 ${filteredIds.length} 个群组`);
  };

  const handleClearSelection = () => {
    setSelectedGroups([]);
    message.info('已清空选择');
  };

  // 单个群组选择
  const handleGroupToggle = (groupId) => {
    setSelectedGroups(prev => {
      if (prev.includes(groupId)) {
        return prev.filter(id => id !== groupId);
      } else {
        return [...prev, groupId];
      }
    });
  };

  // 过滤群组
  const filteredGroups = useMemo(() => {
    let filtered = groups || [];
    if (searchText) {
      const searchTerm = searchText.toLowerCase();
      filtered = filtered.filter(group => {
        const groupName = group.name || '';
        return typeof groupName === 'string' && groupName.toLowerCase().includes(searchTerm);
      });
    }
    return filtered;
  }, [groups, searchText]);

  // 进度轮询
  const startProgressPolling = (jobId) => {
    if (progressPolling) {
      clearInterval(progressPolling);
    }

    const polling = setInterval(async () => {
      try {
        const response = await whatsappAPI.getBroadcastJobStatus(jobId);
        if (response.data.success) {
          const { current, total, status, successCount, errorCount } = response.data;
          setBroadcastProgress({
            jobId,
            current,
            total,
            status,
            successCount,
            errorCount
          });

          if (status === 'completed' || status === 'cancelled') {
            clearInterval(polling);
            setProgressPolling(null);
            setLoading(false);
            if (status === 'completed') {
              message.success(`群发完成！成功: ${successCount}, 失败: ${errorCount}`);
            }
          }
        } else {
          clearInterval(polling);
          setProgressPolling(null);
        }
      } catch (error) {
        clearInterval(polling);
        setProgressPolling(null);
      }
    }, 1000);

    setProgressPolling(polling);
  };

  // 全部群发
  const handleAllBroadcast = async () => {
    if (!isConnected) {
      message.error('WhatsApp未连接');
      return;
    }
    if (selectedGroups.length === 0) {
      message.error('请选择至少一个群组');
      return;
    }
    if (!allBroadcastMessage.trim()) {
      message.error('请输入要发送的消息');
      return;
    }

    setLoading(true);
    try {
      const response = await whatsappAPI.broadcastMessage({
        groupIds: selectedGroups,
        message: allBroadcastMessage.trim(),
        delay: allBroadcastDelay,
      });

      if (response.data.success) {
        message.success('群发任务已创建');
        startProgressPolling(response.data.jobId);
        setAllBroadcastMessage('');
        setSelectedGroups([]);
      } else {
        message.error('创建群发任务失败');
        setLoading(false);
      }
    } catch (error) {
      message.error('群发失败');
      setLoading(false);
    }
  };

  // 分组群发
  const handleCategoryBroadcast = async () => {
    if (!isConnected) {
      message.error('WhatsApp未连接');
      return;
    }
    if (!selectedCategory) {
      message.error('请选择一个分组');
      return;
    }
    if (!categoryMessage.trim()) {
      message.error('请输入要发送的消息');
      return;
    }

    const category = categories.find(cat => cat.id === selectedCategory);
    if (!category || !category.groupIds || category.groupIds.length === 0) {
      message.error('该分组没有群组');
      return;
    }

    setLoading(true);
    try {
      const response = await whatsappAPI.broadcastMessage({
        groupIds: category.groupIds,
        message: categoryMessage.trim(),
        delay: categoryDelay,
      });

      if (response.data.success) {
        message.success(`已向分组 "${category.name}" 的 ${category.groupIds.length} 个群组发送`);
        startProgressPolling(response.data.jobId);
        setCategoryMessage('');
        setSelectedCategory(null);
      } else {
        message.error('创建群发任务失败');
        setLoading(false);
      }
    } catch (error) {
      message.error('群发失败');
      setLoading(false);
    }
  };

  // 取消任务
  const handleCancelBroadcast = async () => {
    if (!broadcastProgress?.jobId) return;
    try {
      await whatsappAPI.cancelBroadcastJob(broadcastProgress.jobId);
      message.success('群发任务已取消');
      if (progressPolling) {
        clearInterval(progressPolling);
        setProgressPolling(null);
      }
      setBroadcastProgress(null);
      setLoading(false);
    } catch (error) {
      message.error('取消群发失败');
    }
  };

  // 渲染进度条
  const renderProgress = () => {
    if (!broadcastProgress) return null;

    const percent = broadcastProgress.total > 0
      ? Math.round((broadcastProgress.current / broadcastProgress.total) * 100)
      : 0;

    return (
      <Card
        size="small"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 380,
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          borderRadius: 8
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row justify="space-between" align="middle">
            <Col>
              <Text strong style={{ fontSize: 14 }}>群发进度</Text>
            </Col>
            <Col>
              <Tag color={
                broadcastProgress.status === 'completed' ? 'success' :
                broadcastProgress.status === 'in_progress' ? 'processing' : 'default'
              }>
                {broadcastProgress.status === 'in_progress' ? '发送中' :
                 broadcastProgress.status === 'completed' ? '已完成' : '已取消'}
              </Tag>
            </Col>
          </Row>

          <Progress percent={percent} strokeColor="#52c41a" />

          <Row gutter={16}>
            <Col span={8} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                {broadcastProgress.total}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>总数</div>
            </Col>
            <Col span={8} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>
                {broadcastProgress.successCount}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>成功</div>
            </Col>
            <Col span={8} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#f5222d' }}>
                {broadcastProgress.errorCount}
              </div>
              <div style={{ fontSize: 12, color: '#999' }}>失败</div>
            </Col>
          </Row>

          {broadcastProgress.status === 'in_progress' && (
            <Button block danger size="small" onClick={handleCancelBroadcast}>
              取消任务
            </Button>
          )}
        </Space>
      </Card>
    );
  };

  // 全部群发模块
  const renderAllBroadcast = () => (
    <div style={{ padding: 24 }}>
      <Card bordered={false} style={{ marginBottom: 24 }}>
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          {/* 搜索和操作栏 */}
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Input
                size="large"
                placeholder="搜索群组名称..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col>
              <Space>
                <Button
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={handleSelectAll}
                  disabled={filteredGroups.length === 0}
                >
                  全选
                </Button>
                <Button
                  size="large"
                  icon={<CloseCircleOutlined />}
                  onClick={handleClearSelection}
                  disabled={selectedGroups.length === 0}
                >
                  取消全选
                </Button>
                <Button
                  size="large"
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={handleRefreshGroups}
                  disabled={loading}
                >
                  刷新
                </Button>
              </Space>
            </Col>
          </Row>

          {/* 选择统计 */}
          <Alert
            message={
              <Space>
                <Text>已选择</Text>
                <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                  {selectedGroups.length}
                </Text>
                <Text>个群组，共</Text>
                <Text strong style={{ fontSize: 16 }}>
                  {filteredGroups.length}
                </Text>
                <Text>个可用群组</Text>
              </Space>
            }
            type="info"
            showIcon
          />

          {/* 群组列表 */}
          <Card
            title={<Text strong>选择群组</Text>}
            style={{ maxHeight: 400, overflowY: 'auto' }}
            bodyStyle={{ padding: 0 }}
          >
            {filteredGroups.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={searchText ? '没有找到匹配的群组' : '暂无群组'}
                style={{ padding: 40 }}
              />
            ) : (
              <List
                dataSource={filteredGroups}
                renderItem={group => (
                  <List.Item
                    style={{
                      padding: '12px 24px',
                      cursor: 'pointer',
                      backgroundColor: selectedGroups.includes(group.id) ? '#f0f7ff' : 'transparent'
                    }}
                    onClick={() => handleGroupToggle(group.id)}
                  >
                    <List.Item.Meta
                      avatar={
                        <Checkbox
                          checked={selectedGroups.includes(group.id)}
                          onChange={() => handleGroupToggle(group.id)}
                        />
                      }
                      title={
                        <Space>
                          <Text strong>{group.name}</Text>
                          <Badge
                            count={group.participantCount}
                            style={{ backgroundColor: '#52c41a' }}
                            showZero
                          />
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Divider />

          {/* 消息编辑区 */}
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <div style={{ marginBottom: 8 }}>
                <Text strong>消息内容</Text>
                <Text type="secondary" style={{ float: 'right' }}>
                  {allBroadcastMessage.length} / 4096
                </Text>
              </div>
              <TextArea
                rows={6}
                maxLength={4096}
                value={allBroadcastMessage}
                onChange={(e) => setAllBroadcastMessage(e.target.value)}
                placeholder="请输入要群发的消息内容..."
                style={{ fontSize: 14 }}
              />
            </div>

            <Row gutter={16} align="middle">
              <Col>
                <Space>
                  <Text strong>发送延迟：</Text>
                  <InputNumber
                    value={allBroadcastDelay}
                    onChange={setAllBroadcastDelay}
                    min={1000}
                    max={60000}
                    step={500}
                    formatter={(value) => `${value} 毫秒`}
                    parser={(value) => value.replace(' 毫秒', '')}
                    style={{ width: 140 }}
                  />
                  <Text type="secondary">(建议 3000ms 以上)</Text>
                </Space>
              </Col>
              <Col flex="auto" style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<SendOutlined />}
                  onClick={handleAllBroadcast}
                  loading={loading}
                  disabled={selectedGroups.length === 0 || !allBroadcastMessage.trim()}
                  style={{ minWidth: 120 }}
                >
                  开始群发
                </Button>
              </Col>
            </Row>
          </Space>
        </Space>
      </Card>
    </div>
  );

  // 分组群发模块
  const renderCategoryBroadcast = () => (
    <div style={{ padding: 24 }}>
      <Row gutter={24}>
        {/* 左侧：分组选择 */}
        <Col span={10}>
          <Card
            title={
              <Space>
                <AppstoreOutlined />
                <Text strong>选择分组</Text>
              </Space>
            }
            extra={
              <Button
                icon={<ReloadOutlined spin={loading} />}
                onClick={handleRefreshGroups}
                disabled={loading}
              >
                刷新
              </Button>
            }
            style={{ height: '100%' }}
          >
            {categories.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无分组"
                style={{ padding: 40 }}
              />
            ) : (
              <List
                dataSource={categories}
                renderItem={category => {
                  const isSelected = selectedCategory === category.id;
                  const groupCount = category.groupIds?.length || 0;

                  return (
                    <List.Item
                      style={{
                        padding: '16px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#f0f7ff' : 'transparent',
                        border: isSelected ? '2px solid #1890ff' : '2px solid transparent',
                        borderRadius: 8,
                        marginBottom: 8
                      }}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <List.Item.Meta
                        avatar={
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 8,
                              backgroundColor: category.color || '#1890ff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: 18
                            }}
                          >
                            <TeamOutlined />
                          </div>
                        }
                        title={
                          <Space>
                            <Text strong style={{ fontSize: 15 }}>
                              {category.name}
                            </Text>
                            <Badge count={groupCount} style={{ backgroundColor: '#52c41a' }} />
                          </Space>
                        }
                        description={category.description || '暂无描述'}
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：消息编辑 */}
        <Col span={14}>
          <Card
            title={
              <Space>
                <SendOutlined />
                <Text strong>编写消息</Text>
              </Space>
            }
            style={{ height: '100%' }}
          >
            {!selectedCategory ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请先选择一个分组"
                style={{ padding: 60 }}
              />
            ) : (
              <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <Alert
                  message={
                    <Space>
                      <Text>将发送到分组：</Text>
                      <Text strong style={{ color: '#1890ff' }}>
                        {categories.find(c => c.id === selectedCategory)?.name}
                      </Text>
                      <Text>({categories.find(c => c.id === selectedCategory)?.groupIds?.length || 0} 个群组)</Text>
                    </Space>
                  }
                  type="info"
                  showIcon
                />

                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>消息内容</Text>
                    <Text type="secondary" style={{ float: 'right' }}>
                      {categoryMessage.length} / 4096
                    </Text>
                  </div>
                  <TextArea
                    rows={10}
                    maxLength={4096}
                    value={categoryMessage}
                    onChange={(e) => setCategoryMessage(e.target.value)}
                    placeholder="请输入要群发的消息内容..."
                    style={{ fontSize: 14 }}
                  />
                </div>

                <div>
                  <Space>
                    <Text strong>发送延迟：</Text>
                    <InputNumber
                      value={categoryDelay}
                      onChange={setCategoryDelay}
                      min={1000}
                      max={60000}
                      step={500}
                      formatter={(value) => `${value} 毫秒`}
                      parser={(value) => value.replace(' 毫秒', '')}
                      style={{ width: 140 }}
                    />
                    <Text type="secondary">(建议 3000ms 以上)</Text>
                  </Space>
                </div>

                <Button
                  type="primary"
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={handleCategoryBroadcast}
                  loading={loading}
                  disabled={!categoryMessage.trim()}
                  block
                  style={{ height: 48, fontSize: 16 }}
                >
                  立即发送
                </Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );

  // 未连接状态
  if (!isConnected) {
    return (
      <div style={{ padding: 24, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card style={{ maxWidth: 500, textAlign: 'center' }}>
          <Empty
            description="WhatsApp 未连接，请先完成设备登录"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => window.location.href = '#/whatsapp-connect'}>
              去连接
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  // 主界面
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      {/* 顶部标题栏 */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px 24px',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 0
      }}>
        <Title level={3} style={{ margin: 0 }}>
          <SendOutlined style={{ marginRight: 12, color: '#1890ff' }} />
          群发消息
        </Title>
      </div>

      {/* Tab切换 */}
      <Tabs
        defaultActiveKey="all"
        size="large"
        style={{ backgroundColor: 'white' }}
        items={[
          {
            key: 'all',
            label: (
              <span style={{ fontSize: 15 }}>
                <AppstoreOutlined style={{ marginRight: 8 }} />
                全部群发
              </span>
            ),
            children: renderAllBroadcast()
          },
          {
            key: 'category',
            label: (
              <span style={{ fontSize: 15 }}>
                <TeamOutlined style={{ marginRight: 8 }} />
                分组群发
              </span>
            ),
            children: renderCategoryBroadcast()
          }
        ]}
      />

      {/* 进度浮窗 */}
      {renderProgress()}
    </div>
  );
}
