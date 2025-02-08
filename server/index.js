import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'fs';
import { parse } from 'url';
import { format } from 'date-fns';
import { initIPDB, queryIPLocation, setupAutoUpdate } from './ipdb.js';

const app = express();
const port = process.env.PORT || 3000;

// 初始化IP地址库并设置自动更新
initIPDB().then(() => {
  console.log('IP地址库初始化完成');
  setupAutoUpdate();
}).catch(error => {
  console.error('IP地址库初始化失败:', error);
});

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
// 在parseNginxLog函数中添加IP地理位置信息
const parseNginxLog = async (line) => {
  // 更新正则表达式以更好地处理特殊字符、可选字段和空请求
  const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+)(?: "([^"]*)" "([^"]*)"|.*)/;
  const matches = line.match(regex);
  
  if (!matches) {
    console.warn('无法解析的日志行:', line);
    return null;
  }
  
  try {
    const ipLocation = await queryIPLocation(matches[1]);
    const timestamp = matches[2];
    
    // 改进时间戳解析逻辑
    const parseTimestamp = (timestamp) => {
      try {
        const months = {
          Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
          Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        };

        if (!timestamp || typeof timestamp !== 'string') {
          throw new Error('Invalid timestamp format');
        }

        const parts = timestamp.split(' ');
        if (parts.length !== 2) {
          throw new Error('Invalid timestamp parts');
        }

        const [datePart, timezone] = parts;
        const [day, month, yearTime] = datePart.split('/');
        if (!day || !month || !yearTime) {
          throw new Error('Invalid date parts');
        }

        const [year, ...timeParts] = yearTime.split(':');
        const time = timeParts.join(':');
        if (!year || !time) {
          throw new Error('Invalid year or time');
        }

        const [hour, minute, second] = time.split(':');
        if (!hour || !minute || !second) {
          throw new Error('Invalid time parts');
        }

        const monthNum = months[month];
        if (!monthNum) {
          throw new Error('Invalid month');
        }

        const dateStr = `${year}-${monthNum}-${day.padStart(2, '0')}T${hour}:${minute}:${second}.000${timezone.replace(':', '')}`;        
        const date = new Date(dateStr);

        if (isNaN(date.getTime())) {
          throw new Error('Invalid date');
        }

        return date.toISOString();
      } catch (error) {
        console.error('时间戳解析失败:', timestamp, error.message);
        return new Date().toISOString(); // 返回当前时间作为默认值
      }
    };

    // 解析请求行
    const parseRequest = (request) => {
      try {
        const [method, path] = request.split(' ');
        return {
          method: method || 'UNKNOWN',
          path: path ? parse(path).pathname || path : '/'
        };
      } catch (error) {
        return {
          method: 'UNKNOWN',
          path: '/'
        };
      }
    };

    const request = parseRequest(matches[3]);
    
    return {
      ip: matches[1],
      ipLocation,
      timestamp: parseTimestamp(timestamp),
      method: request.method,
      path: request.path,
      status: parseInt(matches[4]) || 0,
      bytes: parseInt(matches[5]) || 0,
      referer: matches[6] || '-',
      userAgent: matches[7] || '-'
    };
  } catch (error) {
    console.error('日志解析出错:', error.message);
    console.error('问题日志行:', line);
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
      const logLines = logContent.split('\n').filter(Boolean);
      const parsedLogs = await Promise.all(logLines.map(line => parseNginxLog(line)));
      const validLogs = parsedLogs.filter(Boolean);
      
      allLogs = [...allLogs, ...validLogs];
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
      if (!log || !log.timestamp) return false;
      try {
        const logDate = new Date(log.timestamp);
        if (isNaN(logDate.getTime())) return false;
        
        return (now - logDate) <= 24 * 60 * 60 * 1000;
      } catch (error) {
        console.error('解析时间戳失败:', error);
        return false;
      }
    });

    const metrics = {
      totalVisits: logs.length,
      last24Hours: last24Hours.length,
      popularPages: {},
      statusCodes: {},
      userAgents: {},
      ipAddresses: new Set(logs.map(log => log.ip)).size,
      geoDistribution: {
        provinces: []
      }
    };

    // 处理IP地理位置分布
    const locationMap = new Map();
    logs.forEach(log => {
      if (log.ipLocation && log.ipLocation.region) {
        const key = log.ipLocation.region;
        const cityKey = log.ipLocation.city || '未知城市';
        
        if (!locationMap.has(key)) {
          locationMap.set(key, {
            name: key,
            count: 1,
            cities: new Map().set(cityKey, { name: cityKey, count: 1 })
          });
        } else {
          const province = locationMap.get(key);
          province.count++;
          
          if (province.cities.has(cityKey)) {
            province.cities.get(cityKey).count++;
          } else {
            province.cities.set(cityKey, { name: cityKey, count: 1 });
          }
        }
      }
    });

    // 转换Map为数组格式
    metrics.geoDistribution.provinces = Array.from(locationMap.values()).map(province => ({
      name: province.name,
      count: province.count,
      cities: Array.from(province.cities.values())
    }));

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
      // 首先检查是否为爬虫
      if (
        ua.includes('bot') || 
        ua.includes('spider') || 
        ua.includes('crawler') ||
        ua.includes('googlebot') ||
        ua.includes('baiduspider') ||
        ua.includes('bingbot') ||
        ua.includes('yandexbot') ||
        ua.includes('slurp') ||
        ua.includes('duckduckbot') ||
        ua.includes('python-requests') ||
        ua.includes('go-http-client') ||
        ua.includes('censysinspect')
      ) {
        devices.bot++;
      }
      // 检查是否为平板设备（优先级高于移动设备，避免误判）
      else if (
        ua.includes('ipad') ||
        ua.includes('tablet') ||
        (ua.includes('android') && !ua.includes('mobile')) ||
        ua.includes('kindle') ||
        ua.includes('playbook')
      ) {
        devices.tablet++;
      }
      // 检查是否为移动设备
      else if (
        ua.includes('iphone') ||
        ua.includes('ipod') ||
        (ua.includes('android') && ua.includes('mobile')) ||
        ua.includes('windows phone') ||
        ua.includes('blackberry') ||
        ua.includes('webos') ||
        ua.includes('iemobile') ||
        ua.includes('mobile')
      ) {
        devices.mobile++;
      }
      // 检查是否为桌面设备
      else if (
        ua.includes('windows') ||
        ua.includes('macintosh') ||
        ua.includes('x11') ||
        (ua.includes('linux') && !ua.includes('android')) ||
        ua.includes('ubuntu') ||
        (ua.includes('firefox') && !ua.includes('mobile')) ||
        (ua.includes('chrome') && !ua.includes('mobile') && !ua.includes('android'))
      ) {
        devices.desktop++;
      }
      // 其他未知设备
      else {
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
      .filter(log => log && log.timestamp)
      .map(log => {
        try {
          const dateObj = new Date(log.timestamp);
          if (isNaN(dateObj.getTime())) return null;
          
          return {
            ...log,
            dateObj
          };
        } catch (error) {
          console.error('解析时间戳失败:', error);
          return null;
        }
      })
      .filter(Boolean)
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

    // 统计设备类型
    const devices = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
      bot: 0,
      other: 0
    };

    // 分析流量来源和设备类型
    sortedLogs.forEach(log => {
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

      // 分析设备类型
      const ua = log.userAgent.toLowerCase();
      // 首先检查是否为爬虫
      if (
        ua.includes('bot') || 
        ua.includes('spider') || 
        ua.includes('crawler') ||
        ua.includes('googlebot') ||
        ua.includes('baiduspider') ||
        ua.includes('bingbot') ||
        ua.includes('yandexbot') ||
        ua.includes('slurp') ||
        ua.includes('duckduckbot') ||
        ua.includes('python-requests') ||
        ua.includes('go-http-client') ||
        ua.includes('censysinspect')
      ) {
        devices.bot++;
      }
      // 检查是否为平板设备（优先级高于移动设备，避免误判）
      else if (
        ua.includes('ipad') ||
        ua.includes('tablet') ||
        (ua.includes('android') && !ua.includes('mobile')) ||
        ua.includes('kindle') ||
        ua.includes('playbook')
      ) {
        devices.tablet++;
      }
      // 检查是否为移动设备
      else if (
        ua.includes('iphone') ||
        ua.includes('ipod') ||
        (ua.includes('android') && ua.includes('mobile')) ||
        ua.includes('windows phone') ||
        ua.includes('blackberry') ||
        ua.includes('webos') ||
        ua.includes('iemobile') ||
        ua.includes('mobile')
      ) {
        devices.mobile++;
      }
      // 检查是否为桌面设备
      else if (
        ua.includes('windows') ||
        ua.includes('macintosh') ||
        ua.includes('x11') ||
        (ua.includes('linux') && !ua.includes('android')) ||
        ua.includes('ubuntu') ||
        (ua.includes('firefox') && !ua.includes('mobile')) ||
        (ua.includes('chrome') && !ua.includes('mobile') && !ua.includes('android'))
      ) {
        devices.desktop++;
      }
      // 其他未知设备
      else {
        devices.other++;
      }
    });

    // 处理地理位置分布数据
    const geoDistribution = {
      provinces: []
    };

    // 使用Map来统计省份和城市的访问量
    const provinceMap = new Map();

    for (const log of sortedLogs) {
      if (!log.ipLocation) continue;

      const region = log.ipLocation.region || '未知地区';
      const city = log.ipLocation.city || '未知城市';

      // 跳过错误或未知的地区
      if (region === 'Error' || region === 'Unknown') continue;

      if (!provinceMap.has(region)) {
        provinceMap.set(region, {
          name: region,
          count: 1,
          cities: new Map([[city, 1]])
        });
      } else {
        const province = provinceMap.get(region);
        province.count++;

        const cities = province.cities;
        cities.set(city, (cities.get(city) || 0) + 1);
      }
    }

    // 转换Map数据为数组格式
    geoDistribution.provinces = Array.from(provinceMap.values())
      .map(province => ({
        name: province.name,
        count: province.count,
        cities: Array.from(province.cities.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      hourly,
      sources,
      devices,
      geoDistribution
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