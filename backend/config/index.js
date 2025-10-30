// 配置文件入口
const dbConfig = require('./supabase');

// 导出数据库配置
module.exports = {
  db: dbConfig.db,
  supabase: dbConfig.supabase,
  testConnection: dbConfig.testConnection
};