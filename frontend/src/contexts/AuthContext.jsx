import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../utils/api';
import { message } from 'antd';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const clearAuthData = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    setToken(null);
    setUser(null);
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const { data } = await authAPI.login(credentials);
      
      if (data.success) {
        const { token: newToken, user: userData } = data;
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('loginTime', new Date().toISOString());
        setToken(newToken);
        setUser(userData);
        message.success('登录成功');
        return { success: true };
      } else {
        message.error(data.message || '登录失败');
        return { success: false, message: data.message };
      }
    } catch (error) {
      let errorMessage = '登录请求失败，请检查服务器连接。';
      
      if (error.response) {
        // 服务器返回了错误响应
        errorMessage = error.response.data?.message || `服务器错误: ${error.response.status}`;
      } else if (error.request) {
        // 请求发出但没有收到响应
        errorMessage = '无法连接到服务器，请检查后端是否启动。';
      } else {
        // 设置请求时发生了错误
        errorMessage = '请求设置错误。';
      }
      
      message.error(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = useCallback(async (navigate) => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    // 立即清除前端认证状态
    clearAuthData();
    message.success('已退出登录');

    // 导航到登录页
    if (navigate) {
      navigate('/login', { replace: true });
    }

    try {
      // 在后台静默发送登出请求
      await authAPI.logout();
    } catch (error) {
      console.error('登出请求失败（不影响用户体验）:', error);
    } finally {
      // 延迟重置 isLoggingOut 状态
      setTimeout(() => {
        setIsLoggingOut(false);
      }, 500);
    }
  }, [clearAuthData, isLoggingOut]);

  // 心跳机制 - 每60秒发送一次心跳
  useEffect(() => {
    if (!user || !token || isLoggingOut) return;

    // 立即发送一次心跳
    const sendHeartbeat = async () => {
      if (isLoggingOut) return;

      try {
        await authAPI.heartbeat?.();
      } catch (error) {
        console.error('心跳失败:', error);
      }
    };

    sendHeartbeat();

    // 设置定时心跳
    const heartbeatInterval = setInterval(sendHeartbeat, 60 * 1000); // 每60秒

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [user, token, isLoggingOut]);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          const userData = JSON.parse(storedUser);

          // 先检查本地存储的用户数据是否过期
          if (!userData.is_permanent && userData.expires_at) {
            const expiryDate = new Date(userData.expires_at);
            const now = new Date();

            if (now >= expiryDate) {
              console.log('账户已过期，清除本地数据');
              message.warning('账户已过期，请重新登录');
              clearAuthData();
              setLoading(false);
              return;
            }
          }

          setToken(storedToken);
          setUser(userData);

          // 延迟验证token，避免与初始化冲突
          setTimeout(async () => {
            try {
              await authAPI.checkSession();
            } catch (error) {
              console.error('会话无效或已过期:', error);
              const errorMessage = error.response?.data?.message || '会话已过期';
              if (errorMessage.includes('过期')) {
                message.error(errorMessage);
              }
              clearAuthData();
            }
          }, 300);
        } catch (error) {
          console.error('解析用户数据失败:', error);
          clearAuthData();
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, [clearAuthData]);

  const getLoginTime = useCallback(() => {
    return localStorage.getItem('loginTime');
  }, []);

  const value = {
    user,
    token,
    loading,
    isLoggingOut, // 导出 isLoggingOut 状态
    login,
    logout,
    getLoginTime,
    isAuthenticated: !loading && !!user && !!token,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
