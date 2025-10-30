import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Alert, Typography, Button } from 'antd';
import { WhatsAppOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { whatsappAPI } from '../utils/api';

const { Title, Text } = Typography;

const WhatsAppConnect = () => {
    const [status, setStatus] = useState('connecting');
    const [qrCode, setQrCode] = useState(null);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const fetchStatus = useCallback(async () => {
        try {
            const response = await whatsappAPI.getStatus();
            const data = response.data;

            if (data.success) {
                setStatus(data.status);
                if (data.status === 'qr') {
                    // Append a timestamp to bypass browser cache
                    setQrCode(`http://localhost:9001/api/whatsapp/qr?t=${new Date().getTime()}`);
                } else {
                    setQrCode(null);
                }

                if (data.status === 'connected') {
                    navigate('/dashboard', { replace: true });
                }
            } else {
                setError('无法获取WhatsApp状态，请稍后重试。');
                setStatus('disconnected');
            }
        } catch (err) {
            setError('连接后端服务失败，请检查服务是否运行。');
            // 若仍在启动阶段，保持“连接中”而不是显示断开
            setStatus(prev => (prev === 'initializing' || prev === 'connecting') ? 'connecting' : 'disconnected');
        }
    }, [navigate]);

    useEffect(() => {
        // Initial status check
        fetchStatus();

        // Set up an interval to poll for status updates every 3 seconds
        const intervalId = setInterval(fetchStatus, 3000);

        // Clean up the interval on component unmount
        return () => clearInterval(intervalId);
    }, [fetchStatus]);

    const handleReconnect = async () => {
        setStatus('connecting');
        setError('');
        try {
            await whatsappAPI.connect();
            // After triggering connect, fetchStatus will handle the updates
        } catch (err) {
            setError('发送连接请求失败。');
            setStatus('disconnected');
        }
    };

    const renderContent = () => {
        switch (status) {
            case 'initializing':
            case 'connecting':
                return (
                    <>
                        <Spin size="large" indicator={<SyncOutlined spin style={{ fontSize: 48, color: '#128C7E' }} />} />
                        <Title level={3} style={{ marginTop: 24, color: '#333' }}>正在连接WhatsApp...</Title>
                        <Text type="secondary">请稍候，正在建立安全连接。</Text>
                    </>
                );
            case 'qr':
                return (
                    <>
                        <Title level={3} style={{ marginBottom: 16, color: '#333' }}>请扫描二维码</Title>
                        {qrCode ? (
                            <img src={qrCode} alt="WhatsApp QR Code" style={{ width: 280, height: 280, border: '1px solid #eee', borderRadius: '8px' }} />
                        ) : (
                            <Spin />
                        )}
                        <Text type="secondary" style={{ marginTop: 16, display: 'block' }}>使用手机WhatsApp扫描此二维码以登录。</Text>
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>二维码将自动刷新，无需手动操作。</Text>
                    </>
                );
            case 'connected':
                return (
                    <>
                        <CheckCircleOutlined style={{ fontSize: 64, color: '#25D366' }} />
                        <Title level={3} style={{ marginTop: 24, color: '#333' }}>连接成功</Title>
                        <Text type="secondary">正在跳转到仪表盘...</Text>
                    </>
                );
            case 'reconnecting':
                return (
                    <>
                        <Spin size="large" indicator={<SyncOutlined spin style={{ fontSize: 48, color: '#1890ff' }} />} />
                        <Title level={3} style={{ marginTop: 24, color: '#333' }}>连接中断</Title>
                        <Text type="secondary">正在尝试自动恢复连接，请稍候...</Text>
                    </>
                );
            case 'disconnected':
                return (
                    <>
                        <ExclamationCircleOutlined style={{ fontSize: 64, color: '#FF4D4F' }} />
                        <Title level={3} style={{ marginTop: 24, color: '#333' }}>连接已断开</Title>
                        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
                        <Button type="primary" icon={<SyncOutlined />} onClick={handleReconnect} size="large">
                            尝试重新连接
                        </Button>
                    </>
                );
            default:
                // 未知状态时，统一以“连接中”展示，避免闪现“断开”
                return (
                    <>
                        <Spin size="large" indicator={<SyncOutlined spin style={{ fontSize: 48, color: '#128C7E' }} />} />
                        <Title level={3} style={{ marginTop: 24, color: '#333' }}>正在连接WhatsApp...</Title>
                        <Text type="secondary">请稍候，正在建立安全连接。</Text>
                    </>
                );
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            background: '#fff',
            height: '100%'
        }}>
            {renderContent()}
        </div>
    );
};

export default WhatsAppConnect;
