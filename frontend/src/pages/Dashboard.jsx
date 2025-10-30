import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Alert,
  Typography,
  Space,
  Button,
  List,
  Tag,
  Progress,
  Divider,
  Modal,
  message
} from 'antd';
import {
  WhatsAppOutlined,
  SendOutlined,
  TeamOutlined,
  CalculatorOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { whatsappAPI, groupsAPI, systemAPI, announcementAPI } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const { user, refreshAuth, getLoginTime } = useAuth();
  const { status: whatsappStatus, connect, groups } = useWhatsApp();
  const navigate = useNavigate();

  // 获取公告
  const fetchAnnouncements = async () => {
    try {
      // 先从本地存储获取上次缓存的公告
      const cachedAnnouncements = localStorage.getItem('cachedAnnouncements');
      let lastAnnouncements = [];
      
      if (cachedAnnouncements) {
        try {
          lastAnnouncements = JSON.parse(cachedAnnouncements);
          // 先显示上次缓存的公告
          setAnnouncements(lastAnnouncements);
        } catch (e) {
          console.error('解析缓存的公告失败:', e);
        }
      }
      
      // 从服务器获取最新公告
      const response = await announcementAPI.getAnnouncements();
      
      if (response.data.success) {
        const newAnnouncements = response.data.announcements || [];
        
        // 检查公告是否有变化
        const hasChanged = !areAnnouncementsEqual(lastAnnouncements, newAnnouncements);
        
        if (hasChanged) {
          // 如果有变化，更新显示并缓存新公告
          setAnnouncements(newAnnouncements);
          localStorage.setItem('cachedAnnouncements', JSON.stringify(newAnnouncements));
          localStorage.setItem('lastAnnouncementUpdate', new Date().toISOString());
        }
        // 如果没有变化，保持显示上次缓存的公告
      } else {
        // 如果获取失败，使用默认公告
        const defaultAnnouncements = [
          {
            id: 1,
            title: '欢迎使用WhatsApp群发系统',
            content: '系统已成功部署，请先连接WhatsApp后开始使用。',
            created_at: new Date().toISOString()
          }
        ];
        
        // 如果没有缓存公告，则显示默认公告
        if (!cachedAnnouncements) {
          setAnnouncements(defaultAnnouncements);
        }
      }
    } catch (error) {
      console.error('获取公告失败:', error);
      
      // 如果网络错误，尝试使用缓存的公告
      const cachedAnnouncements = localStorage.getItem('cachedAnnouncements');
      if (cachedAnnouncements) {
        try {
          const lastAnnouncements = JSON.parse(cachedAnnouncements);
          setAnnouncements(lastAnnouncements);
        } catch (e) {
          console.error('解析缓存的公告失败:', e);
          // 如果解析失败，使用默认公告
          setAnnouncements([
            {
              id: 1,
              title: '欢迎使用WhatsApp群发系统',
              content: '系统已成功部署，请先连接WhatsApp后开始使用。',
              created_at: new Date().toISOString()
            }
          ]);
        }
      } else {
        // 如果没有缓存，使用默认公告
        setAnnouncements([
          {
            id: 1,
            title: '欢迎使用WhatsApp群发系统',
            content: '系统已成功部署，请先连接WhatsApp后开始使用。',
            created_at: new Date().toISOString()
          }
        ]);
      }
    }
  };

  // 比较两组公告是否相同
  const areAnnouncementsEqual = (announcements1, announcements2) => {
    if (announcements1.length !== announcements2.length) {
      return false;
    }
    
    for (let i = 0; i < announcements1.length; i++) {
      const a1 = announcements1[i];
      const a2 = announcements2[i];
      
      if (a1.id !== a2.id || 
          a1.title !== a2.title || 
          a1.content !== a2.content || 
          a1.is_active !== a2.is_active) {
        return false;
      }
    }
    
    return true;
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // 在加载数据时刷新认证状态
      refreshAuth && refreshAuth();
      
      await fetchAnnouncements();
      setLoading(false);
    };

    loadData();
    
    // 每10分钟刷新一次认证状态
    const interval = setInterval(() => {
      if (refreshAuth) {
        refreshAuth();
        console.log('🔄 Dashboard: 定时刷新认证状态');
      }
    }, 10 * 60 * 1000); // 10分钟

    return () => clearInterval(interval);
  }, [refreshAuth]);

  const handleConnect = () => {
    // Navigate to the connect page and start the connection process
    navigate('/whatsapp-connect');
    connect();
  };

  const handleDisconnect = async () => {
    Modal.confirm({
      title: '确认要切换账号吗？',
      content: '此操作将注销当前的WhatsApp登录状态，并允许您扫描新的二维码以登录另一个账号。',
      okText: '确认切换',
      cancelText: '取消',
      onOk: async () => {
        try {
          await systemAPI.disconnectWhatsApp();
          // 注销后，状态将自动更新，并由上下文处理页面跳转
          message.success('正在注销当前账号...');
        } catch (error) {
          console.error('切换账号失败:', error);
          message.error('切换账号失败，请重试。');
        }
      }
    });
  };

  const getStatusIcon = () => {
    switch (whatsappStatus) {
      case 'connected':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'connecting':
        return <SyncOutlined spin style={{ color: '#faad14' }} />;
      case 'qr':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      case 'disconnected':
        return <SyncOutlined spin style={{ color: '#f5222d' }} />;
      default:
        return <ExclamationCircleOutlined style={{ color: '#f5222d' }} />;
    }
  };

  const getStatusText = () => {
    switch (whatsappStatus) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'qr':
        return '等待扫码';
      case 'disconnected':
        return '已断开，正在尝试自动重连...';
      default:
        return '未连接';
    }
  };

  const getDaysUntilExpiry = () => {
    if (!user?.expires_at || user.is_permanent) return null;
    const expiryDate = new Date(user.expires_at);
    const now = new Date();
    return Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  };

  const daysUntilExpiry = getDaysUntilExpiry();

  return (
    <div>
      {/* 账户状态提醒 */}
      {!user?.is_permanent && daysUntilExpiry !== null && (
        <Alert
          message={
            daysUntilExpiry <= 0
              ? "账户已过期"
              : daysUntilExpiry <= 7
                ? `账户将在 ${daysUntilExpiry} 天后过期`
                : `账户剩余 ${daysUntilExpiry} 天`
          }
          type={daysUntilExpiry <= 0 ? "error" : daysUntilExpiry <= 7 ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 系统公告 */}
      <Card title="系统公告" extra={<Button type="link">查看全部</Button>} style={{ marginBottom: 24 }}>
        {announcements.length > 0 ? (
          <List
            dataSource={announcements.slice(0, 5)}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      {item.title}
                      {item.expires_at && (
                        <Tag color="orange" size="small">限时</Tag>
                      )}
                    </Space>
                  }
                  description={
                    <div>
                      <div>{item.content}</div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">暂无公告</Text>
          </div>
        )}
      </Card>

      {/* WhatsApp连接状态 */}
      <Card style={{ marginBottom: 24 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size="large">
              <div style={{ fontSize: 24 }}>
                {getStatusIcon()}
              </div>
              <div>
                <Title level={4} style={{ margin: 0 }}>WhatsApp 连接状态</Title>
                <Text type="secondary">{getStatusText()}</Text>
              </div>
            </Space>
          </Col>
          <Col>
            {whatsappStatus === 'connected' ? (
              <Button
                danger
                icon={<SyncOutlined />}
                onClick={handleDisconnect}
              >
                切换 WhatsApp
              </Button>
            ) : whatsappStatus === 'disconnected' ? (
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                onClick={handleConnect}
              >
                立即重连
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                onClick={handleConnect}
              >
                连接 WhatsApp
              </Button>
            )}
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default Dashboard;
