// Supabase 生产环境配置
const SUPABASE_URL = 'https://ydiixrdtaeuimrfeqbxb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkaWl4cmR0YWV1aW1yZmVxYnhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5MTgzNjUsImV4cCI6MjA3MzQ5NDM2NX0.Dp3tFUXIGV_nNmrzM5kn_2ZMQ2XIdAHgsweDjajprxQ';

const { createClient } = require('@supabase/supabase-js');

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 测试数据库连接
async function testConnection() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.error('数据库连接测试失败:', error.message);
      return false;
    }
    console.log('✅ 数据库连接测试成功');
    return true;
  } catch (error) {
    console.error('数据库连接异常:', error.message);
    return false;
  }
}

// 用户操作对象
const users = {
  // 根据用户名查找用户
  async findByUsername(username) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) {
      console.error('查找用户失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 根据ID查找用户
  async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('查找用户失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 创建新用户
  async create(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();
    
    if (error) {
      console.error('创建用户失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 更新用户信息
  async update(id, userData) {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('更新用户失败:', error);
      return null;
    }
    
    return data;
  }
};

// 会话操作对象
const sessions = {
  // 获取所有会话
  async getAll() {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        users (
          id,
          username,
          expires_at,
          is_permanent,
          remarks
        )
      `);

    if (error) {
      console.error('获取所有会话失败:', error);
      return [];
    }

    return data || [];
  },

  // 根据令牌查找会话
  async findByToken(token) {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        *,
        users (
          id,
          username,
          expires_at,
          is_permanent,
          remarks
        )
      `)
      .eq('token', token)
      .single();

    if (error) {
      console.error('查找会话失败:', error);
      return null;
    }

    return data;
  },
  
  // 创建新会话
  async create(sessionData) {
    const { data, error } = await supabase
      .from('sessions')
      .insert([sessionData])
      .select()
      .single();
    
    if (error) {
      console.error('创建会话失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 根据用户ID删除会话
  async deleteByUserId(userId) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('删除用户会话失败:', error);
      return false;
    }
    
    return true;
  },
  
  // 根据令牌删除会话
  async deleteByToken(token) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('token', token);
    
    if (error) {
      console.error('删除会话失败:', error);
      return false;
    }
    
    return true;
  },
  
  // 更新会话最后活动时间
  async updateLastSeen(token) {
    const { data, error } = await supabase
      .from('sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('token', token)
      .select()
      .single();
    
    if (error) {
      console.error('更新会话最后活动时间失败:', error);
      return null;
    }
    
    return data;
  }
};

// 公告操作对象
const announcements = {
  // 获取所有公告
  async getAll() {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('获取公告失败:', error);
      return [];
    }
    
    return data;
  },
  
  // 获取活跃公告
  async getActive() {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('获取活跃公告失败:', error);
      return [];
    }
    
    return data;
  },
  
  // 创建新公告
  async create(announcementData) {
    const { data, error } = await supabase
      .from('announcements')
      .insert([announcementData])
      .select()
      .single();
    
    if (error) {
      console.error('创建公告失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 更新公告
  async update(id, announcementData) {
    const { data, error } = await supabase
      .from('announcements')
      .update(announcementData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('更新公告失败:', error);
      return null;
    }
    
    return data;
  },
  
  // 删除公告
  async delete(id) {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('删除公告失败:', error);
      return false;
    }
    
    return true;
  }
};

// 数据库操作对象
const db = {
  users,
  sessions,
  announcements
};

module.exports = {
  supabase,
  testConnection,
  db,
  SUPABASE_URL,
  SUPABASE_ANON_KEY
};