import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import axios from 'axios';
import { join } from 'path';
import schedule from 'node-schedule';
import maxmind from 'maxmind';
import { geoipConfig } from './config/geoip.js';

// 全局变量用于存储数据库实例和缓存
let dbInstance = null;
const ipCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 缓存24小时

const IPDB_DIR = './data/ipdb';
const IPDB_FILE = join(IPDB_DIR, 'GeoLite2-City.mmdb');

// 构建下载URL的函数
function buildDownloadUrl(editionId) {
  return `https://download.maxmind.com/app/geoip_download?edition_id=${editionId}&license_key=${geoipConfig.licenseKey}&suffix=tar.gz`;
}

// 确保IP数据库目录存在
async function ensureIPDBDir() {
  await fs.mkdir(IPDB_DIR, { recursive: true });
}

// 下载并解压IP地址库
async function downloadIPDB() {
  try {
    const { execSync } = await import('child_process');
    console.log('开始下载IP地址库...');
    for (const editionId of geoipConfig.editionIds) {
      const url = buildDownloadUrl(editionId);
      const tempFile = join(IPDB_DIR, `${editionId}.tar.gz`);
      const filePath = join(IPDB_DIR, `${editionId}.mmdb`);
      
      console.log(`下载 ${editionId} 数据库...`);
      const response = await axios({
        method: 'get',
        url,
        responseType: 'arraybuffer'
      });

      await fs.writeFile(tempFile, response.data);
      
      // 解压tar.gz文件
      execSync(`tar -xzf ${tempFile} -C ${IPDB_DIR}`);
      
      // 移动解压后的mmdb文件到正确位置
      const extractedDirPattern = `GeoLite2-${editionId.split('-')[1]}_*`;
      const findResult = execSync(`find ${IPDB_DIR} -type d -name "${extractedDirPattern}"`).toString().trim();
      if (!findResult) {
        throw new Error(`找不到解压后的目录：${extractedDirPattern}`);
      }
      const mmdbFile = execSync(`find ${findResult} -name "*.mmdb"`).toString().trim();
      if (!mmdbFile) {
        throw new Error(`在目录 ${findResult} 中找不到mmdb文件`);
      }
      await fs.rename(mmdbFile, filePath);
      
      // 清理临时文件
      await fs.rm(tempFile);
      await fs.rm(findResult, { recursive: true });
      
      console.log(`${editionId} 数据库下载完成`);
    }
    console.log('所有IP地址库下载完成');
  } catch (error) {
    console.error('下载IP地址库失败:', error);
    throw error;
  }
}

// 初始化数据库实例
async function initDBInstance() {
  if (!dbInstance) {
    dbInstance = await maxmind.open(IPDB_FILE);
  }
  return dbInstance;
}

// 查询IP地理位置
async function queryIPLocation(ip) {
  try {
    if (!ip || typeof ip !== 'string') {
      throw new Error('无效的IP地址');
    }

    // 检查缓存
    const now = Date.now();
    const cached = ipCache.get(ip);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    // 确保数据库已加载
    const lookup = await initDBInstance();
    const result = lookup.get(ip);

    if (!result) {
      return {
        country: 'Unknown',
        region: '其他地区',
        city: '未知城市',
        ip: ip
      };
    }

    const locationData = {
      country: result.country?.names?.zh || result.country?.names?.en || 'Unknown',
      region: result.subdivisions?.[0]?.names?.zh || result.subdivisions?.[0]?.names?.en || '其他地区',
      city: result.city?.names?.zh || result.city?.names?.en || '未知城市',
      ip: ip
    };

    // 更新缓存
    ipCache.set(ip, {
      data: locationData,
      timestamp: now
    });

    return locationData;
  } catch (error) {
    console.error(`IP查询失败 (${ip}):`, error);
    return {
      country: 'Error',
      region: '其他地区',
      city: '未知城市',
      ip: ip
    };
  }
}

// 初始化IP地址库
async function initIPDB() {
  await ensureIPDBDir();
  // 删除可能存在的损坏文件
  try {
    await fs.unlink(IPDB_FILE);
  } catch (error) {
    // 忽略文件不存在的错误
  }
  await downloadIPDB();
  // 预加载数据库实例
  await initDBInstance();
}

// 设置自动更新任务
function setupAutoUpdate() {
  // 每周凌晨2点更新IP地址库
  schedule.scheduleJob('0 2 * * 0', async () => {
    try {
      await downloadIPDB();
      console.log('IP地址库自动更新完成');
    } catch (error) {
      console.error('IP地址库自动更新失败:', error);
    }
  });
}

export { initIPDB, queryIPLocation, setupAutoUpdate };