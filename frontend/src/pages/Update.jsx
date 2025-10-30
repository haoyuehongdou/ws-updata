import React, { useState, useEffect } from 'react';
import { Card, Button, Spin, Alert, Typography, Space, Divider, Tag, Progress, Modal } from 'antd';
import { CloudSyncOutlined, DownloadOutlined, ReloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { systemAPI } from '../utils/api';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

export default function Update() {
  const [loading, setLoading] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState(null);

  useEffect(() => {
    checkUpdate();
  }, []);

  const checkUpdate = async () => {
    setLoading(true);
    setError(null);
    setChecking(true);
    try {
      const response = await systemAPI.checkForUpdates();
      if (response.data.success) {
        setUpdateInfo(response.data);
      } else {
        setError(response.data.error || '检查更新失败');
      }
    } catch (err) {
      setError('检查更新失败，请检查网络连接');
      console.error('检查更新失败:', err);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!updateInfo?.downloadUrl) {
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // 检查是否在Electron环境
      if (window.require) {
        const { ipcRenderer } = window.require('electron');

        // 监听下载进度事件
        const progressHandler = (event, progress) => {
          setDownloadProgress(progress);
        };
        ipcRenderer.on('update-download-progress', progressHandler);

        // 通过主进程调用后端API下载
        const result = await ipcRenderer.invoke('download-update-via-backend', {
          url: updateInfo.downloadUrl
        });

        // 移除进度监听器
        ipcRenderer.removeListener('update-download-progress', progressHandler);

        if (result.success) {
          setDownloadedPath(result.filePath);
          setDownloadProgress(100);

          // 显示安装确认对话框
          Modal.confirm({
            title: '下载完成',
            content: '更新文件已下载完成，是否立即安装？安装将关闭当前应用。',
            okText: '立即安装',
            cancelText: '稍后安装',
            onOk: () => {
              handleInstall(result.filePath);
            },
          });
        } else {
          throw new Error(result.error || '下载失败');
        }
      } else {
        // 非Electron环境，通过后端API下载
        const response = await systemAPI.downloadUpdate(
          updateInfo.downloadUrl,
          (progress) => {
            setDownloadProgress(progress);
          }
        );

        // 创建blob URL并触发下载
        const blob = new Blob([response.data], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = updateInfo.downloadUrl.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setDownloadProgress(100);
      }
    } catch (error) {
      console.error('下载失败:', error);
      setError('下载失败: ' + (error.message || error));
    } finally {
      setDownloading(false);
    }
  };

  // 备用下载方法（浏览器环境）
  const fallbackDownload = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // 执行安装
  const handleInstall = (filePath) => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');

        // 通过IPC请求主进程执行安装
        ipcRenderer.invoke('install-update', filePath);
      }
    } catch (error) {
      console.error('安装失败:', error);
      setError('安装失败，请手动运行安装程序');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2} style={{ margin: 0 }}>系统更新</Title>
          <Button
            icon={<ReloadOutlined />}
            onClick={checkUpdate}
            loading={checking}
          >
            检查更新
          </Button>
        </div>

        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {loading && !updateInfo && (
          <Card>
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">正在检查更新...</Text>
              </div>
            </div>
          </Card>
        )}

        {updateInfo && !loading && (
          <Card>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* 版本信息 */}
              <div>
                <Space size="large">
                  <div>
                    <Text type="secondary">当前版本</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                        v{updateInfo.currentVersion}
                      </Tag>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">最新版本</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag
                        color={updateInfo.hasUpdate ? 'green' : 'blue'}
                        style={{ fontSize: 14, padding: '4px 12px' }}
                      >
                        v{updateInfo.latestVersion}
                        {updateInfo.hasUpdate && ' (新版本)'}
                      </Tag>
                    </div>
                  </div>
                </Space>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {/* 更新状态 */}
              {updateInfo.hasUpdate ? (
                <div>
                  <Alert
                    message="发现新版本"
                    description={
                      <div>
                        <Paragraph style={{ marginBottom: 16 }}>
                          检测到新版本 v{updateInfo.latestVersion}，建议您更新到最新版本以获得最佳体验和最新功能。
                        </Paragraph>
                        {downloading ? (
                          <div>
                            <Progress
                              percent={downloadProgress}
                              status="active"
                              strokeColor={{
                                '0%': '#108ee9',
                                '100%': '#87d068',
                              }}
                            />
                            <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                              正在下载更新文件... {downloadProgress}%
                            </Text>
                          </div>
                        ) : (
                          <Space>
                            <Button
                              type="primary"
                              icon={downloading ? <LoadingOutlined /> : <DownloadOutlined />}
                              onClick={handleDownload}
                              size="large"
                              disabled={!updateInfo.downloadUrl || downloading}
                              loading={downloading}
                            >
                              {downloading ? '下载中...' : '下载并安装'}
                            </Button>
                            {!updateInfo.downloadUrl && (
                              <Text type="secondary">（下载链接暂不可用）</Text>
                            )}
                          </Space>
                        )}
                      </div>
                    }
                    type="success"
                    showIcon
                    icon={<CloudSyncOutlined />}
                  />

                  {/* 更新说明 */}
                  {updateInfo.releaseNotes && (
                    <div style={{ marginTop: 16 }}>
                      <Title level={4}>更新说明</Title>
                      <Card
                        size="small"
                        style={{
                          backgroundColor: '#f5f5f5',
                          maxHeight: 400,
                          overflow: 'auto'
                        }}
                      >
                        <pre style={{
                          fontSize: 14,
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          fontFamily: 'inherit',
                          margin: 0
                        }}>
                          {updateInfo.releaseNotes}
                        </pre>
                      </Card>
                    </div>
                  )}

                </div>
              ) : (
                <Alert
                  message="已是最新版本"
                  description={
                    <div>
                      您的系统已是最新版本 v{updateInfo.currentVersion}，无需更新。
                      系统会每小时自动检查一次更新，也可以点击右上角的"检查更新"按钮手动检查。
                    </div>
                  }
                  type="info"
                  showIcon
                  icon={<CheckCircleOutlined />}
                />
              )}
            </Space>
          </Card>
        )}
      </Space>
    </div>
  );
}
