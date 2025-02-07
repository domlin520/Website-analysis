import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';
import { parse } from 'url';
import { format } from 'date-fns';

const app = express();
const port = process.env.PORT || 3000;

// Nginx日志文件路径配置
const NGINX_LOG_PATHS = process.env.NGINX_LOG_PATHS ? 
  process.env.NGINX_LOG_PATHS.split(',') : [
  './logs/access.log',
  './logs/access.log.1'
];

// 确保日志目录存在
fs.mkdir('./logs', { recursive: true }).catch(console.error);

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 每个IP限制100次请求
});

app.use(cors());
app.use(limiter);
app.use(express.json());

// Nginx日志解析函数
const parseNginxLog = (line) => {
  // 支持默认的combined日志格式
  const regex = /^(\S+) - - \[([^\]]+)\] "(\S+) ([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)"/;
  const matches = line.match(regex);
  
  if (!matches) return null;
  
  try {
    return {
      ip: matches[1],
      timestamp: matches[2],
      method: matches[3].split(' ')[0],
      path: parse(matches[4].split(' ')[0]).pathname || matches[4].split(' ')[0],
      status: parseInt(matches[5]),
      bytes: parseInt(matches[6]),
      referer: matches[7],
      userAgent: matches[8]
    };
  } catch (error) {
    console.error('日志行解析错误:', line);
    return null;
  }
};

// 读取所有日志文件
async function readAllLogs() {
  let allLogs = [];
  
  for (const logPath of NGINX_LOG_PATHS) {
    try {
      const exists = await fs.access(logPath).then(() => true).catch(() => false);
      if (!exists) {
        console.warn(`日志文件不存在: ${logPath}`);
        continue;
      }
      
      const logContent = await fs.readFile(logPath, 'utf-8');
      const logs = logContent
        .split('\n')
        .filter(Boolean)
        .map(parseNginxLog)
        .filter(Boolean);
      
      allLogs = [...allLogs, ...logs];
    } catch (error) {
      console.error(`读取日志文件失败 ${logPath}:`, error);
    }
  }
  
  return allLogs;
}

// API端点
app.get('/api/metrics', async (req, res) => {
  try {
    const logs = await readAllLogs();
    
    if (logs.length === 0) {
      return res.status(404).json({ error: '未找到日志数据' });
    }
    
    // 计算指标
    const now = new Date();
    const last24Hours = logs.filter(log => {
      const logDate = new Date(log.timestamp.replace(':', ' '));
      return (now - logDate) <= 24 * 60 * 60 * 1000;
    });

    const metrics = {
      totalVisits: logs.length,
      last24Hours: last24Hours.length,
      popularPages: {},
      statusCodes: {},
      userAgents: {},
      ipAddresses: new Set(logs.map(log => log.ip)).size
    };

    // 处理日志数据
    const sources = {
      direct: 0,
      search: 0,
      referral: 0,
      social: 0,
      searchEngines: {
        google: 0,
        bing: 0,
        baidu: 0,
        sogou: 0,
        so: 0
      }
    };

    const devices = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      bot: 0,
      other: 0
    };

    logs.forEach(log => {
      // 统计页面访问
      metrics.popularPages[log.path] = (metrics.popularPages[log.path] || 0) + 1;
      
      // 统计状态码
      metrics.statusCodes[log.status] = (metrics.statusCodes[log.status] || 0) + 1;
      
      // 统计用户代理
      metrics.userAgents[log.userAgent] = (metrics.userAgents[log.userAgent] || 0) + 1;

      // 分析流量来源
      if (!log.referer || log.referer === '-') {
        sources.direct++;
      } else if (
        log.referer.includes('google.') ||
        log.referer.includes('bing.') ||
        log.referer.includes('baidu.') ||
        log.referer.includes('sogou.') ||
        log.referer.includes('so.com')
      ) {
        sources.search++;
        // 细分搜索引擎来源
        if (log.referer.includes('google.')) {
          sources.searchEngines = sources.searchEngines || {};
          sources.searchEngines.google = (sources.searchEngines.google || 0) + 1;
        } else if (log.referer.includes('bing.')) {
          sources.searchEngines = sources.searchEngines || {};
          sources.searchEngines.bing = (sources.searchEngines.bing || 0) + 1;
        } else if (log.referer.includes('baidu.')) {
          sources.searchEngines = sources.searchEngines || {};
          sources.searchEngines.baidu = (sources.searchEngines.baidu || 0) + 1;
        } else if (log.referer.includes('sogou.')) {
          sources.searchEngines = sources.searchEngines || {};
          sources.searchEngines.sogou = (sources.searchEngines.sogou || 0) + 1;
        } else if (log.referer.includes('so.com')) {
          sources.searchEngines = sources.searchEngines || {};
          sources.searchEngines.so = (sources.searchEngines.so || 0) + 1;
        }
      } else if (log.referer.includes('facebook.') || log.referer.includes('twitter.') || log.referer.includes('weibo.')) {
        sources.social++;
      } else {
        sources.referral++;
      }

      // 分析设备类型
      const ua = log.userAgent.toLowerCase();
      if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler')) {
        devices.bot++;
      } else if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        devices.mobile++;
      } else if (ua.includes('ipad') || ua.includes('tablet')) {
        devices.tablet++;
      } else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) {
        devices.desktop++;
      } else {
        devices.other++;
      }
    });

    metrics.sources = sources;
    metrics.devices = devices;

    res.json(metrics);
  } catch (error) {
    console.error('处理日志时出错:', error);
    res.status(500).json({ error: '处理日志数据失败' });
  }
});

app.get('/api/traffic', async (req, res) => {
  try {
    const logs = await readAllLogs();
    
    if (logs.length === 0) {
      return res.status(404).json({ error: '未找到日志数据' });
    }

    // 按时间排序的日志
    const sortedLogs = logs
      .map(log => ({
        ...log,
        dateObj: new Date(log.timestamp.replace(':', ' '))
      }))
      .sort((a, b) => a.dateObj - b.dateObj);

    // 按小时统计访问量
    const hourlyData = sortedLogs.reduce((acc, log) => {
      const hour = format(log.dateObj, 'yyyy-MM-dd HH:00');
      if (!acc[hour]) {
        acc[hour] = 0;
      }
      acc[hour]++;
      return acc;
    }, {});

    // 转换为数组格式
    const hourly = Object.entries(hourlyData).map(([hour, count]) => ({
      hour,
      count
    }));

    // 统计流量来源
    const sources = {
      direct: 0,
      search: 0,
      referral: 0,
      social: 0,
      searchEngines: {
        google: 0,
        bing: 0,
        baidu: 0,
        sogou: 0,
        so: 0
      }
    };

    // 分析流量来源
    sortedLogs.forEach(log => {
      if (!log.referer || log.referer === '-') {
        sources.direct++;
      } else if (
        log.referer.includes('google.') ||
        log.referer.includes('bing.') ||
        log.referer.includes('baidu.') ||
        log.referer.includes('sogou.') ||
        log.referer.includes('so.com')
      ) {
        sources.search++;
        // 细分搜索引擎来源
        if (log.referer.includes('google.')) {
          sources.searchEngines.google++;
        } else if (log.referer.includes('bing.')) {
          sources.searchEngines.bing++;
        } else if (log.referer.includes('baidu.')) {
          sources.searchEngines.baidu++;
        } else if (log.referer.includes('sogou.')) {
          sources.searchEngines.sogou++;
        } else if (log.referer.includes('so.com')) {
          sources.searchEngines.so++;
        }
      } else if (log.referer.includes('facebook.') || log.referer.includes('twitter.') || log.referer.includes('weibo.')) {
        sources.social++;
      } else {
        sources.referral++;
      }
    });

    res.json({
      hourly,
      sources
    });
  } catch (error) {
    console.error('处理流量数据时出错:', error);
    res.status(500).json({ error: '处理流量数据失败' });
  }
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log('使用的日志文件路径:', NGINX_LOG_PATHS);
});