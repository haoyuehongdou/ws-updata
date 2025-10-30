import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { whatsappAPI } from '../utils/api';
import { useAuth } from './AuthContext';

const WhatsAppContext = createContext(null);

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    throw new Error('useWhatsApp must be used within a WhatsAppProvider');
  }
  return context;
};

export const WhatsAppProvider = ({ children }) => {
  const [status, setStatus] = useState('initializing'); // initializing, qr, connecting, connected, disconnected
  const [qrCode, setQrCode] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [groups, setGroups] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();


  const fetchStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setStatus('disconnected');
      return;
    }

    try {
      const { data } = await whatsappAPI.getStatus();
      if (data.success) {
        setIsLoggedIn(data.isLoggedIn);
        setStatus(data.status);

        if (data.status === 'qr') {
          const timestamp = Date.now();
          setQrCode(`http://localhost:9001/api/whatsapp/qr?t=${timestamp}`);
        } else {
          setQrCode(null);
        }
      } else {
        setStatus('disconnected');
      }
    } catch (err) {
      setStatus('disconnected');
      console.error('Error fetching WhatsApp status:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // 立即检查一次状态
    fetchStatus();

    const interval = setInterval(fetchStatus, 3000); // 缩短轮询间隔

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchStatus]);

  const fetchGroups = useCallback(async () => {
    try {
      const { data } = await whatsappAPI.getGroups();
      if (data.success) {
        setGroups(data.groups || []);
        return data.groups || [];
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroups([]);
    }
    return [];
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      fetchGroups();
    } else {
      setGroups([]); // Clear groups when disconnected
    }
  }, [status, fetchGroups]);

  useEffect(() => {
    // 当状态变为'connected'时，如果用户在根路径或连接页面，则导航到仪表盘
    if (status === 'connected' && ['/', '/whatsapp-connect'].includes(location.pathname)) {
      navigate('/dashboard');
    }

    // 当状态变为'qr'时，如果用户不在连接页面，则导航到连接页面
    if (status === 'qr' && location.pathname !== '/whatsapp-connect') {
      navigate('/whatsapp-connect');
    }
  }, [status, navigate, location.pathname]);

  const connect = async () => {
    try {
      await whatsappAPI.connect();
      fetchStatus();
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const resetWhatsAppState = useCallback(() => {
    setStatus('disconnected');
    setQrCode(null);
    setIsLoggedIn(false);
    setGroups([]);
  }, []);

  const value = {
    status,
    qrCode,
    isLoggedIn,
    isConnected: status === 'connected',
    groups,
    fetchGroups,
    connect,
    resetWhatsAppState, // 导出重置函数
  };

  return (
    <WhatsAppContext.Provider value={value}>
      {children}
    </WhatsAppContext.Provider>
  );
};
