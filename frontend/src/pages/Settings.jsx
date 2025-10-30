import React from 'react';
import { Card, Typography, Alert, Button } from 'antd';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

const Settings = () => {
  const { isConnected } = useWhatsApp();
  const navigate = useNavigate();

  if (!isConnected) {
    return (
      <div>
        <Title level={2}>系统设置</Title>
        <Alert
          message="WhatsApp 未连接"
          description="请先连接 WhatsApp 后再使用系统设置功能。"
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
    <div>
      <Title level={2}>系统设置</Title>
      <Alert
        message="功能开发中"
        description="系统设置功能正在开发中，请等待后续版本。"
        type="info"
        showIcon
      />
    </div>
  );
};

export default Settings;