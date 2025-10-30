import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Alert, Typography, Spin } from 'antd';
import { UserOutlined, LockOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { whatsappAPI } from '../utils/api';

const { Title, Text } = Typography;

const Login = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, loading: authLoading, getLoginTime } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // 只有在认证加载完成且已认证的情况下才跳转
    if (!authLoading && isAuthenticated) {
      // 延迟检查WhatsApp状态，避免与初始化冲突
      const timer = setTimeout(() => {
        checkWhatsAppStatusAndRedirect();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, authLoading, navigate]);

  const checkWhatsAppStatusAndRedirect = async () => {
    try {
      const response = await whatsappAPI.getStatus();
      if (response.data.success && response.data.status === 'connected') {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/whatsapp-connect', { replace: true });
      }
    } catch (error) {
      navigate('/dashboard', { replace: true });
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');

    try {
      const result = await login(values);
      
      if (result.success) {
        // 登录成功后立即检查WhatsApp状态并跳转
        await checkWhatsAppStatusAndRedirect();
      } else {
        setError(result.message || '登录失败');
      }
    } catch (err) {
      console.error('登录错误:', err);
      setError('登录过程中发生错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 如果认证正在加载，显示加载状态
  if (authLoading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <WhatsAppOutlined style={{ 
          fontSize: '80px', 
          color: '#25D366',
          marginBottom: '24px'
        }} />
        <Spin size="large" />
        <div style={{ marginTop: '16px', color: '#666' }}>正在检查登录状态...</div>
      </div>
    );
  }

  // 如果已经认证，不显示登录表单
  if (isAuthenticated) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <WhatsAppOutlined style={{ 
          fontSize: '80px', 
          color: '#25D366',
          marginBottom: '24px'
        }} />
        <Spin size="large" />
        <div style={{ marginTop: '16px', color: '#666' }}>正在跳转到主页...</div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: '32px',
        padding: '80px 60px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        {/* Logo区域 */}
        <div style={{ marginBottom: '48px' }}>
          <WhatsAppOutlined style={{ 
            fontSize: '80px', 
            color: '#25D366',
            marginBottom: '24px',
            display: 'block'
          }} />
          <Title level={1} style={{ 
            color: '#1a1a1a', 
            marginBottom: '12px',
            fontSize: '36px',
            fontWeight: '700',
            letterSpacing: '-0.5px'
          }}>
            WhatsApp
          </Title>
          <Text style={{ 
            color: '#666',
            fontSize: '16px',
            fontWeight: '400'
          }}>
            管理系统
          </Text>
        </div>



        {/* 错误信息 */}
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ 
              marginBottom: '32px',
              borderRadius: '16px',
              border: 'none'
            }}
          />
        )}

        {/* 登录表单 */}
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
          style={{ textAlign: 'left' }}
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' }
            ]}
            style={{ marginBottom: '24px' }}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#999' }} />}
              placeholder="用户名"
              style={{ 
                height: '56px',
                borderRadius: '16px',
                fontSize: '16px',
                border: 'none',
                backgroundColor: '#f8f9fa',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
            style={{ marginBottom: '40px' }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="密码"
              style={{ 
                height: '56px',
                borderRadius: '16px',
                fontSize: '16px',
                border: 'none',
                backgroundColor: '#f8f9fa',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: '0' }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: '56px',
                borderRadius: '16px',
                fontSize: '18px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                border: 'none',
                boxShadow: '0 8px 24px rgba(37, 211, 102, 0.3)',
                transition: 'all 0.3s ease'
              }}
            >
              {loading ? '登录中...' : '立即登录'}
            </Button>
          </Form.Item>
        </Form>

        {/* 底部信息 */}
        <div style={{ marginTop: '48px' }}>
          <Text style={{ 
            color: '#999',
            fontSize: '14px'
          }}>
            WhatsApp 群发与记账管理系统 v1.0
          </Text>
        </div>
      </div>
    </div>
  );
};

export default Login;