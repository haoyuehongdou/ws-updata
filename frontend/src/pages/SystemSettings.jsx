import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  InputNumber, 
  Button, 
  Switch, 
  Select, 
  message, 
  Space, 
  Divider, 
  Typography, 
  Row, 
  Col, 
  Alert, 
  Tooltip,
  Modal,
  Table,
  Tag,
  Badge,
  Statistic
} from 'antd';
import { 
  SettingOutlined, 
  SaveOutlined, 
  ReloadOutlined, 
  InfoCircleOutlined, 
  ExperimentOutlined,
  ThunderboltOutlined,
  CloudServerOutlined,
  BugOutlined,
  EditOutlined,
  UndoOutlined
} from '@ant-design/icons';
import { useWhatsApp } from '../contexts/WhatsAppContext';
import { systemAPI, whatsappAPI } from '../utils/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

export default function SystemSettings() {
  const { isConnected } = useWhatsApp();
  const [commandForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({});
  const [commands, setCommands] = useState({});
  const [systemInfo, setSystemInfo] = useState(null);
  const [commandModalVisible, setCommandModalVisible] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    loadSettings();
    loadCommands();
    loadSystemInfo();
  }, []);

  // 加载系统设置
  const loadSettings = async () => {
    try {
      const response = await systemAPI.getSettings();
      if (response.data.success) {
        const settingsData = response.data.settings;
        setSettings(settingsData);
        commandForm.setFieldsValue(settingsData);
      }
    } catch (error) {
      message.error('加载系统设置失败');
      console.error('加载系统设置失败:', error);
    }
  };

  // 加载命令配置
  const loadCommands = async () => {
    try {
      const response = await whatsappAPI.getBillingCommands();
      if (response.data.success) {
        const commandsData = response.data.commands;
        setCommands(commandsData);
        commandForm.setFieldsValue(commandsData);
      }
    } catch (error) {
      message.error('加载命令配置失败');
      console.error('加载命令配置失败:', error);
    }
  };

  // 加载系统信息
  const loadSystemInfo = async () => {
    try {
      const response = await systemAPI.getSystemInfo();
      if (response.data.success) {
        setSystemInfo(response.data.systemInfo);
      }
    } catch (error) {
      console.error('加载系统信息失败:', error);
    }
  };

  // 保存系统设置
  const handleSaveSettings = async (values) => {
    try {
      setLoading(true);
      const response = await systemAPI.updateSettings({ settings: values });
      if (response.data.success) {
        message.success('系统设置保存成功');
        setSettings(values);
      } else {
        message.error('保存失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('保存系统设置失败');
      console.error('保存系统设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存命令配置
  const handleSaveCommands = async (values) => {
    try {
      setLoading(true);
      const response = await whatsappAPI.updateBillingCommands({ commands: values });
      if (response.data.success) {
        message.success('命令配置保存成功');
        setCommands(values);
        setCommandModalVisible(false);
      } else {
        message.error('保存失败: ' + response.data.message);
      }
    } catch (error) {
      message.error('保存命令配置失败');
      console.error('保存命令配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 重置设置
  const handleResetSettings = async () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要将系统设置重置为默认值吗？此操作不可撤销。',
      onOk: async () => {
        try {
          setLoading(true);
          const response = await systemAPI.resetSettings();
          if (response.data.success) {
            message.success('系统设置已重置');
            const newSettings = response.data.settings;
            setSettings(newSettings);
            commandForm.setFieldsValue(newSettings);
          } else {
            message.error('重置失败: ' + response.data.message);
          }
        } catch (error) {
          message.error('重置设置失败');
          console.error('重置设置失败:', error);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // 测试代理连接
  const handleTestProxy = async () => {
    const proxyHost = commandForm.getFieldValue('proxyHost');
    const proxyPort = commandForm.getFieldValue('proxyPort');
    
    if (!proxyHost || !proxyPort) {
      message.warning('请先设置代理主机和端口');
      return;
    }

    try {
      setLoading(true);
      const response = await systemAPI.testProxy({ host: proxyHost, port: proxyPort });
      if (response.data.success) {
        setTestResult(response.data.testResult);
        if (response.data.testResult.success) {
          message.success(`代理连接成功，延迟: ${response.data.testResult.latency}ms`);
        } else {
          message.error(`代理连接失败: ${response.data.testResult.message}`);
        }
      }
    } catch (error) {
      message.error('代理测试失败');
      console.error('代理测试失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 清理系统缓存
  const handleCleanup = async () => {
    Modal.confirm({
      title: '清理系统缓存',
      content: '确定要清理系统缓存吗？这将删除临时文件和QR码文件。',
      onOk: async () => {
        try {
          setLoading(true);
          const response = await systemAPI.cleanup();
          if (response.data.success) {
            message.success(`缓存清理完成，共清理 ${response.data.cleanedFiles} 个文件`);
          } else {
            message.error('缓存清理失败');
          }
        } catch (error) {
          message.error('缓存清理失败');
          console.error('缓存清理失败:', error);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>记账命令配置</Title>
      <Paragraph>
        <Text type="secondary">
          在这里配置用于触发自动记账的WhatsApp群组命令。修改后将立即生效，请确保命令格式正确且不与现有命令冲突。
        </Text>
      </Paragraph>
      
      <Card>
        <Form
          form={commandForm}
          layout="vertical"
          onFinish={handleSaveCommands}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="查看账单命令"
                name="show"
                rules={[{ required: true, message: '请输入查看账单命令' }]}
              >
                <Input placeholder="/show" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="清空账单命令"
                name="clear"
                rules={[{ required: true, message: '请输入清空账单命令' }]}
              >
                <Input placeholder="/js" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="撤销命令"
                name="back"
                rules={[{ required: true, message: '请输入撤销命令' }]}
              >
                <Input placeholder="/back" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="查看ID命令"
                name="myid"
                rules={[{ required: true, message: '请输入查看ID命令' }]}
              >
                <Input placeholder="/myid" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="开启账单命令"
                name="on"
                rules={[{ required: true, message: '请输入开启账单命令' }]}
              >
                <Input placeholder="/on" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="关闭账单命令"
                name="off"
                rules={[{ required: true, message: '请输入关闭账单命令' }]}
              >
                <Input placeholder="/off" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
            >
              保存命令配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
