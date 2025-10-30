import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WhatsAppProvider } from './contexts/WhatsAppContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import MainPage from './pages/MainPage';
import Broadcast from './pages/Broadcast';
import GroupCategories from './pages/GroupCategories';
import BillManagement from './pages/BillManagement';
import AdminManagement from './pages/AdminManagement';
import SystemSettings from './pages/SystemSettings';
import WhatsAppConnect from './pages/WhatsAppConnect';
import Update from './pages/Update';
import './App.css';

// 路由保护组件
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, isLoggingOut } = useAuth();

  if (loading) {
    // 在加载时，可以显示一个全局的加载指示器，或者什么都不显示
    return null; // 或者一个加载组件
  }

  if (isLoggingOut) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '20px',
            color: '#25D366'
          }}>⏳</div>
          <div style={{
            fontSize: '16px',
            color: '#666'
          }}>正在退出...</div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// 公开路由组件
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '20px',
            color: '#25D366'
          }}>⏳</div>
          <div style={{
            fontSize: '16px',
            color: '#666'
          }}>加载中...</div>
        </div>
      </div>
    );
  }

  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <AuthProvider>
          <WhatsAppProvider>
            <Routes>
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<MainPage />} />
                <Route path="broadcast" element={<Broadcast />} />
                <Route path="groups" element={<GroupCategories />} />
                <Route path="billing" element={<BillManagement />} />
                <Route path="admins" element={<AdminManagement />} />
                <Route path="settings" element={<SystemSettings />} />
                <Route path="whatsapp-connect" element={<WhatsAppConnect />} />
                <Route path="update" element={<Update />} />
                <Route path="" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </WhatsAppProvider>
        </AuthProvider>
      </Router>
    </ConfigProvider>
  );
}

export default App;
