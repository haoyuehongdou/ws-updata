import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { systemAPI } from '../utils/api';
import api from '../utils/api';
import axios from 'axios';

const ConnectionContext = createContext();

export const useConnection = () => useContext(ConnectionContext);

// 创建一个新的axios实例用于健康检查，以避免触发主实例的拦截器
const healthCheckApi = axios.create({
  baseURL: 'http://localhost:9001/api',
  timeout: 5000,
});

export const ConnectionProvider = ({ children }) => {
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const checkServerStatus = useCallback(async () => {
    // 如果正在退出登录或在登录页面,不检查服务器状态
    const isLoginPage = window.location.hash === '#/login' || window.location.hash === '' || window.location.hash === '#/';
    if (localStorage.getItem('loggingOut') === '1' || isLoginPage) {
      return;
    }

    try {
      // 使用一个轻量级的端点进行健康检查
      await healthCheckApi.get('/system/info');

      // 如果服务器恢复连接
      if (!isServerReachable) {
        console.log('服务器连接已恢复。正在重新加载页面...');
        // 如果正在退出登录，不要 reload，交由路由切换
        if (localStorage.getItem('loggingOut') !== '1') {
          // 重新加载页面以恢复应用状态
          window.location.reload();
        } else {
          setIsServerReachable(true);
          setIsReconnecting(false);
        }
      }
    } catch (error) {
      // 如果服务器仍然无法访问
      if (isServerReachable) {
        console.error('与服务器的连接丢失。开始尝试重新连接...');
        // 登出流程中不展示遮罩以避免白屏体验
        if (localStorage.getItem('loggingOut') === '1') {
          setIsServerReachable(false);
          setIsReconnecting(false);
        } else {
          setIsServerReachable(false);
          setIsReconnecting(true);
        }
      }
    }
  }, [isServerReachable]);

  useEffect(() => {
    // 响应拦截器，用于捕获所有API请求的网络错误
    const interceptor = (error) => {
      // 检查是否在登录页面,如果是则不触发重连
      const isLoginPage = window.location.hash === '#/login' || window.location.hash === '' || window.location.hash === '#/';

      // 检查是否存在响应，以及状态码是否为5xx服务器错误
      if (error.response && error.response.status >= 500) {
        // 对于服务器内部错误，我们不触发重连逻辑，
        // 因为这通常表示后端代码有问题，而不是网络连接问题。
        // 我们可以选择在这里记录错误或显示一个温和的通知。
        console.error('服务器内部错误:', error.response.data);
      } else if (!error.response) {
        // 没有响应，这通常是网络错误
        if (isServerReachable && !isLoginPage) {
          if (localStorage.getItem('loggingOut') === '1') {
            setIsServerReachable(false);
            setIsReconnecting(false);
          } else {
            setIsServerReachable(false);
            setIsReconnecting(true);
          }
        }
      }
      return Promise.reject(error);
    };

    // 将拦截器附加到默认的axios实例上
    const interceptorId = api.interceptors.response.use(res => res, interceptor);

    // 组件卸载时移除拦截器
    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [isServerReachable]);

  useEffect(() => {
    let interval;
    if (isReconnecting) {
      // 如果正在重连，则每5秒检查一次服务器状态
      interval = setInterval(() => {
        checkServerStatus();
      }, 5000);
    }

    // 组件卸载或停止重连时清除定时器
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isReconnecting, checkServerStatus]);

  return (
    <ConnectionContext.Provider value={{ isServerReachable }}>
      {isReconnecting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          flexDirection: 'column',
          color: '#333'
        }}>
          <svg width="60" height="60" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '20px' }}>
            <style>{`.spinner_V8m1{transform-origin:center;animation:spinner_zKoa 2s linear infinite}.spinner_zKoa{animation-timing-function:steps(8,end)}@keyframes spinner_zKoa{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
            <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" fill="#007bff"/>
            <path d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z" className="spinner_V8m1" fill="#007bff"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: '24px' }}>连接中断</h2>
          <p style={{ margin: '10px 0 0', fontSize: '16px' }}>正在尝试自动恢复连接，请稍候...</p>
        </div>
      )}
      {children}
    </ConnectionContext.Provider>
  );
};
