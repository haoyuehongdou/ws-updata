import axios from 'axios';

// 检测是否在Electron环境中 - 使用更可靠的方法
const isElectron = () => {
  // 在生产环境中，我们总是使用HTTP API
  if (import.meta.env.PROD) {
    return false;
  }

  // 在开发环境中，我们检查是否在Electron中运行
  if (typeof window !== 'undefined' && window.require) {
    try {
      const electron = window.require('electron');
      return !!electron;
    } catch (e) {
      return false;
    }
  }
  return false;
};

// 在Electron环境中和生产环境中都使用localhost，开发环境中使用localhost
const API_BASE_URL = 'http://localhost:9001/api';

console.log('🔗 API Base URL:', API_BASE_URL);
console.log('🔧 Environment:', import.meta.env.DEV ? 'Development' : 'Production');
console.log('⚡ Is Electron:', isElectron());

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 增加到2分钟，避免一般操作超时
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理token过期
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const message = error.response?.data?.message || '认证失败';
      console.log('401 错误:', message);

      // 检查是否正在退出登录,如果是则不处理(让 AuthContext 处理)
      if (localStorage.getItem('loggingOut') === '1') {
        return Promise.reject(error);
      }

      // 清除认证信息
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime');

      // 立即重定向到登录页，不延迟
      if (window.location.pathname !== '/login' && window.location.hash !== '#/login') {
        window.location.href = '#/login';
        // 强制刷新页面以确保完全清除状态
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// IPC API调用函数 - 用于Electron环境
const callIpcApi = async (endpoint, method, data) => {
  try {
    if (!window.require) {
      throw new Error('Electron environment not detected');
    }
    
    const { ipcRenderer } = window.require('electron');
    const response = await ipcRenderer.invoke('api', { endpoint, method, data });
    
    if (response && response.success === false) {
      throw new Error(response.message || 'API call failed');
    }
    
    return response;
  } catch (error) {
    console.error('IPC API call failed:', error);
    throw error;
  }
};

// 创建API包装函数，根据环境选择使用IPC或HTTP
const createApiWrapper = (endpoint, method) => {
  return async (data) => {
    if (isElectron()) {
      return callIpcApi(endpoint, method, data);
    } else {
      // 对于HTTP请求，需要将方法转换为适当的HTTP方法
      const httpMethod = method === 'get' ? 'get' : 
                       method === 'create' ? 'post' : 
                       method === 'update' ? 'put' : 
                       method === 'delete' ? 'delete' : 'post';
      
      // 构建URL路径
      const url = `/${endpoint}${method === 'get' ? '' : ''}`;
      
      // 根据HTTP方法调用axios
      if (httpMethod === 'get') {
        return api.get(url, { params: data });
      } else {
        return api[httpMethod](url, data);
      }
    }
  };
};

// 认证相关API
export const authAPI = {
  login: isElectron() ? (data) => callIpcApi('auth', 'login', data) : (credentials) => api.post('/auth/login', credentials),
  logout: isElectron() ? () => callIpcApi('auth', 'logout') : () => api.post('/auth/logout'),
  checkSession: isElectron() ? () => callIpcApi('auth', 'checkSession') : () => api.get('/auth/session'),
  heartbeat: isElectron() ? () => callIpcApi('auth', 'heartbeat') : () => api.post('/auth/heartbeat'),
};

// WhatsApp相关API
export const whatsappAPI = {
  connect: isElectron() ? () => callIpcApi('whatsapp', 'connect') : () => api.post('/whatsapp/connect'),
  disconnect: isElectron() ? () => callIpcApi('whatsapp', 'disconnect') : () => api.post('/whatsapp/disconnect'),
  getStatus: isElectron() ? () => callIpcApi('whatsapp', 'getStatus') : () => api.get('/whatsapp/status'),
  refreshQR: isElectron() ? () => callIpcApi('whatsapp', 'refreshQR') : () => api.post('/whatsapp/refresh-qr'),
  getGroups: isElectron() ? () => callIpcApi('whatsapp', 'getGroups') : () => api.get('/whatsapp/groups'),
  sendMessage: isElectron() ? (data) => callIpcApi('whatsapp', 'sendMessage', data) : (data) => api.post('/whatsapp/send', data),
  broadcastMessage: isElectron() ? (data) => callIpcApi('whatsapp', 'broadcastMessage', data) : (data) => api.post('/whatsapp/broadcast', data),
  getBroadcastHistory: isElectron() ? () => callIpcApi('whatsapp', 'getBroadcastHistory') : () => api.get('/whatsapp/broadcast-history'),
  
  // 群发任务管理 API
  getBroadcastJobStatus: isElectron() ? (jobId) => callIpcApi('whatsapp', 'getBroadcastJobStatus', { jobId }) : (jobId) => api.get(`/whatsapp/broadcast/job/${jobId}`),
  pauseBroadcastJob: isElectron() ? (jobId) => callIpcApi('whatsapp', 'pauseBroadcastJob', { jobId }) : (jobId) => api.post(`/whatsapp/broadcast/${String(parseInt(jobId, 10))}/pause`, {}),
  resumeBroadcastJob: isElectron() ? (jobId) => callIpcApi('whatsapp', 'resumeBroadcastJob', { jobId }) : (jobId) => api.post(`/whatsapp/broadcast/${String(parseInt(jobId, 10))}/resume`, {}),
  cancelBroadcastJob: isElectron() ? (jobId) => callIpcApi('whatsapp', 'cancelBroadcastJob', { jobId }) : (jobId) => api.post(`/whatsapp/broadcast/${String(parseInt(jobId, 10))}/cancel`, {}),
  
  // 记账相关 API
  getBillingCommands: isElectron() ? () => callIpcApi('whatsapp', 'getBillingCommands') : () => api.get('/whatsapp/billing/commands'),
  updateBillingCommands: isElectron() ? (data) => callIpcApi('whatsapp', 'updateBillingCommands', data) : (data) => api.put('/whatsapp/billing/commands', data),
  getAdmins: isElectron() ? () => callIpcApi('whatsapp', 'getAdmins') : () => api.get('/whatsapp/billing/admins'),
  addAdmin: isElectron() ? (data) => callIpcApi('whatsapp', 'addAdmin', data) : (data) => api.post('/whatsapp/billing/admins', data),
  updateAdmin: isElectron() ? (adminId, data) => callIpcApi('whatsapp', 'updateAdmin', { adminId, ...data }) : (adminId, data) => api.put(`/whatsapp/billing/admins/${adminId}`, data),
  deleteAdmin: isElectron() ? (adminId) => callIpcApi('whatsapp', 'deleteAdmin', { adminId }) : (adminId) => api.delete(`/whatsapp/billing/admins/${adminId}`),
  getBills: isElectron() ? () => callIpcApi('whatsapp', 'getBills') : () => api.get('/whatsapp/billing/groups'),
  getBillDetails: isElectron() ? (groupId, page = 1, limit = 50) => callIpcApi('whatsapp', 'getBillDetails', { groupId, page, limit }) : (groupId, page = 1, limit = 50) => 
    api.get(`/whatsapp/billing/history/${groupId}`, { params: { page, limit } }),
  clearBill: isElectron() ? (groupId) => callIpcApi('whatsapp', 'clearBill', { groupId }) : (groupId) => api.delete(`/whatsapp/billing/clear/${groupId}`),
  exportBill: isElectron() ? (groupId, format = 'json') => callIpcApi('whatsapp', 'exportBill', { groupId, format }) : (groupId, format = 'json') => 
    api.get(`/whatsapp/billing/export/${groupId}`, { 
      params: { format },
      responseType: format === 'csv' ? 'blob' : 'json'
    }),
  enableBill: isElectron() ? (groupId) => callIpcApi('whatsapp', 'enableBill', { groupId }) : (groupId) => api.post(`/whatsapp/billing/enable/${groupId}`),
  disableBill: isElectron() ? (groupId) => callIpcApi('whatsapp', 'disableBill', { groupId }) : (groupId) => api.post(`/whatsapp/billing/disable/${groupId}`),
  undoTransaction: isElectron() ? (groupId) => callIpcApi('whatsapp', 'undoTransaction', { groupId }) : (groupId) => api.post(`/whatsapp/billing/undo/${groupId}`),
  addTransaction: isElectron() ? (groupId, amount, note) => callIpcApi('whatsapp', 'addTransaction', { groupId, amount, note }) : (groupId, amount, note) => api.post('/whatsapp/billing/transaction', { groupId, amount, note }),
  deleteTransaction: isElectron() ? (groupId, transactionIndex) => callIpcApi('whatsapp', 'deleteTransaction', { groupId, transactionIndex }) : (groupId, transactionIndex) => api.delete(`/whatsapp/billing/transaction/${groupId}/${transactionIndex}`)
};

// 群组分组相关API
export const groupsAPI = {
  getGroupCategories: isElectron() ? () => callIpcApi('groups', 'getGroupCategories') : () => api.get('/groups/group-categories'),
  createGroupCategory: isElectron() ? (data) => callIpcApi('groups', 'createGroupCategory', data) : (data) => api.post('/groups/group-categories', data),
  updateGroupCategory: isElectron() ? (id, data) => callIpcApi('groups', 'updateGroupCategory', { id, ...data }) : (id, data) => api.put(`/groups/group-categories/${id}`, data),
  deleteGroupCategory: isElectron() ? (id) => callIpcApi('groups', 'deleteGroupCategory', { id }) : (id) => api.delete(`/groups/group-categories/${id}`),
  getCategoryGroups: isElectron() ? (id) => callIpcApi('groups', 'getCategoryGroups', { id }) : (id) => api.get(`/groups/group-categories/${id}/groups`),
  addGroupsToCategory: isElectron() ? (id, data) => callIpcApi('groups', 'addGroupsToCategory', { id, ...data }) : (id, data) => api.post(`/groups/group-categories/${id}/groups`, data),
  removeGroupFromCategory: isElectron() ? (categoryId, groupId) => callIpcApi('groups', 'removeGroupFromCategory', { categoryId, groupId }) : (categoryId, groupId) => api.delete(`/groups/group-categories/${categoryId}/groups/${groupId}`),
  getUncategorizedGroups: isElectron() ? () => callIpcApi('groups', 'getUncategorizedGroups') : () => api.get('/groups/uncategorized-groups')
};

// 系统设置 API
export const systemAPI = {
  getSettings: isElectron() ? () => callIpcApi('system', 'getSettings') : () => api.get('/system/settings'),
  updateSettings: isElectron() ? (data) => callIpcApi('system', 'updateSettings', data) : (data) => api.put('/system/settings', data),
  resetSettings: isElectron() ? () => callIpcApi('system', 'resetSettings') : () => api.post('/system/settings/reset'),
  getSystemInfo: isElectron() ? () => callIpcApi('system', 'getSystemInfo') : () => api.get('/system/info'),
  getLogLevels: isElectron() ? () => callIpcApi('system', 'getLogLevels') : () => api.get('/system/log-levels'),
  testProxy: isElectron() ? (data) => callIpcApi('system', 'testProxy', data) : (data) => api.post('/system/test-proxy', data),
  cleanup: isElectron() ? () => callIpcApi('system', 'cleanup') : () => api.post('/system/cleanup'),
  disconnectWhatsApp: isElectron() ? () => callIpcApi('system', 'disconnectWhatsApp') : () => api.post('/system/whatsapp/disconnect'),
  checkForUpdates: () => api.get('/update/check'),
  updateNow: () => api.post('/update/now'),
  downloadUpdate: (url, onProgress) => api.post('/update/download', { url }, {
    responseType: 'blob',
    timeout: 600000, // 10分钟超时，用于大文件下载
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    }
  }),
};

// 公告相关API
export const announcementAPI = {
  getAnnouncements: isElectron() ? () => callIpcApi('announcement', 'getAnnouncements') : () => api.get('/announcements'),
  getAllAnnouncements: isElectron() ? () => callIpcApi('announcement', 'getAllAnnouncements') : () => api.get('/announcements/all'),
};

// 更新相关API
export const updateAPI = {
  checkUpdate: isElectron() ? () => callIpcApi('update', 'checkUpdate') : () => api.get('/update/check'),
  downloadUpdate: isElectron() ? () => callIpcApi('update', 'downloadUpdate') : () => api.post('/update/download'),
  getUpdateStatus: isElectron() ? () => callIpcApi('update', 'getUpdateStatus') : () => api.get('/update/status'),
};

export default api;
