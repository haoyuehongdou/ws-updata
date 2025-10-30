import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Badge,
  Typography,
  Space,
  Button,
  message
} from 'antd';
import {
  DashboardOutlined,
  SendOutlined,
  TeamOutlined,
  CalculatorOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  WhatsAppOutlined,
  CloudSyncOutlined,
  BellOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { systemAPI } from '../utils/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const { user, logout } = useAuth();
  const { status: whatsappStatus, resetWhatsAppState } = useWhatsApp();
  const navigate = useNavigate();
  const location = useLocation();

  // 检查更新
  const checkForUpdates = async () => {
    try {
      const response = await systemAPI.checkForUpdates();
      if (response.data.success) {
        setHasUpdate(response.data.hasUpdate);
        if (response.data.hasUpdate) {
          message.info('发现新版本，点击右上角按钮查看更新');
        }
      }
    } catch (error) {
      console.error('检查更新失败:', error);
    }
  };

  useEffect(() => {
    // 首次检查更新
    checkForUpdates();

    // 设置定时检查更新 - 每1小时检查一次
    const updateCheckInterval = setInterval(() => {
      console.log('自动检查更新...');
      checkForUpdates();
    }, 60 * 60 * 1000); // 1小时 = 60分钟 * 60秒 * 1000毫秒

    // 清理定时器
    return () => {
      clearInterval(updateCheckInterval);
    };
  }, []);

  // 检查账户是否到期
  useEffect(() => {
    const checkExpiry = () => {
      if (!user || user.is_permanent) return;

      if (user.expires_at) {
        const expiryDate = new Date(user.expires_at);
        const now = new Date();

        if (now >= expiryDate) {
          message.error('账户已过期，请联系管理员续期', 3);
          // 延迟退出，确保用户看到提示
          setTimeout(() => {
            handleLogout();
          }, 500);
        }
      }
    };

    // 立即检查一次
    checkExpiry();

    // 每5分钟检查一次账户是否到期
    const expiryCheckInterval = setInterval(checkExpiry, 5 * 60 * 1000);

    return () => {
      clearInterval(expiryCheckInterval);
    };
  }, [user]);

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/broadcast',
      icon: <SendOutlined />,
      label: '群发管理',
      disabled: whatsappStatus !== 'connected',
    },
    {
      key: '/groups',
      icon: <TeamOutlined />,
      label: '群组分组',
      disabled: whatsappStatus !== 'connected',
    },
    {
      key: '/billing',
      icon: <CalculatorOutlined />,
      label: '账单管理',
      disabled: whatsappStatus !== 'connected',
    },
    {
      key: '/admins',
      icon: <UserOutlined />,
      label: '管理员',
      disabled: whatsappStatus !== 'connected',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      disabled: whatsappStatus !== 'connected',
    },
  ];

  const handleMenuClick = (e) => {
    const menuItem = menuItems.find(item => item.key === e.key);
    if (menuItem && menuItem.disabled) {
      message.warning('请先连接 WhatsApp 后再使用此功能');
      return;
    }
    navigate(e.key);
  };

  const handleLogout = async () => {
    resetWhatsAppState();
    await logout(navigate);
  };

  const handleUpdate = () => {
    navigate('/update');
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  const getWhatsAppStatusColor = () => {
    switch (whatsappStatus) {
      case 'connected':
        return '#52c41a';
      case 'connecting':
        return '#faad14';
      case 'qr':
        return '#1890ff';
      default:
        return '#f5222d';
    }
  };

  const getWhatsAppStatusText = () => {
    switch (whatsappStatus) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'qr':
        return '等待扫码';
      default:
        return '未连接';
    }
  };

  const formatExpiryDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
  };

  const isExpiringSoon = () => {
    if (!user?.expires_at || user.is_permanent) return false;
    const expiryDate = new Date(user.expires_at);
    const now = new Date();
    const daysUntilExpiry = (expiryDate - now) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)'
        }}
      >
        <div style={{ 
          height: '64px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <WhatsAppOutlined style={{ fontSize: '24px', color: '#25D366' }} />
          {!collapsed && (
            <Text strong style={{ marginLeft: '12px', fontSize: '16px' }}>
              WhatsApp系统
            </Text>
          )}
        </div>
        
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, marginTop: '8px' }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'all 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <Space>
            <Badge
              color={getWhatsAppStatusColor()}
              text={getWhatsAppStatusText()}
            />
          </Space>

          <Space>
            <Button
              type={hasUpdate ? "primary" : "default"}
              icon={<CloudSyncOutlined />}
              size="small"
              onClick={handleUpdate}
            >
              {hasUpdate ? '有新版本' : '检查更新'}
            </Button>

            {isExpiringSoon() && (
              <Badge dot>
                <BellOutlined style={{ fontSize: '16px', color: '#faad14' }} />
              </Badge>
            )}

            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: '8px', transition: 'all 0.2s' }} className="user-info-hover">
                <Avatar icon={<UserOutlined />} size="small" />
                <div style={{ lineHeight: '1.2', textAlign: 'left' }}>
                  <div style={{ 
                    fontWeight: '500', 
                    fontSize: '14px',
                    color: '#262626',
                    marginBottom: '2px'
                  }}>
                    {user?.username}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#8c8c8c',
                    whiteSpace: 'nowrap'
                  }}>
                    {user?.is_permanent ? '永久账户' : `到期: ${formatExpiryDate(user?.expires_at)}`}
                  </div>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: '24px',
          padding: '24px',
          background: '#fff',
          borderRadius: '8px',
          minHeight: 'calc(100vh - 112px)'
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
