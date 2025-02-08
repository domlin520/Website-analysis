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

const IPDB_DIR = join(process.cwd(), 'data/ipdb');
const IPDB_FILE = join(IPDB_DIR, 'GeoLite2-City.mmdb');

// 构建下载URL的函数
function buildDownloadUrl(editionId) {
  return `https://download.maxmind.com/app/geoip_download?edition_id=${editionId}&license_key=${geoipConfig.licenseKey}&suffix=tar.gz`;
}

// 确保IP数据库目录存在并验证文件完整性
async function ensureIPDBDir() {
  await fs.mkdir(IPDB_DIR, { recursive: true });
  
  // 检查所有必需的数据库文件
  const downloadPromises = geoipConfig.editionIds.map(async editionId => {
    const filePath = join(IPDB_DIR, `${editionId}.mmdb`);
    try {
      await fs.access(filePath);
      // 验证文件是否可读
      try {
        await maxmind.open(filePath);
        console.log(`${editionId} 数据库文件验证通过`);
        return null;
      } catch (error) {
        console.error(`${editionId} 数据库文件损坏，需要重新下载`);
        try {
          await fs.unlink(filePath);
          console.log(`已删除损坏的数据库文件: ${filePath}`);
        } catch (unlinkError) {
          console.error(`删除损坏的数据库文件失败: ${unlinkError.message}`);
        }
        return editionId;
      }
    } catch (error) {
      console.error(`${editionId} 数据库文件不存在，需要下载`);
      return editionId;
    }
  });

  const missingFiles = (await Promise.all(downloadPromises)).filter(Boolean);
  
  if (missingFiles.length > 0) {
    console.log('检测到缺失或损坏的数据库文件，开始下载...');
    await downloadIPDB();
  } else {
    console.log('所有IP数据库文件完整性验证通过');
  }
}

// 下载并解压IP地址库
async function downloadIPDB() {
  try {
    await ensureIPDBDir();
    const { execSync } = await import('child_process');
    console.log('开始下载IP地址库...');
    const downloadPromises = geoipConfig.editionIds.map(async (editionId) => {
      try {
        const url = buildDownloadUrl(editionId);
        const tempFile = join(IPDB_DIR, `${editionId}.tar.gz`);
        const filePath = join(IPDB_DIR, `${editionId}.mmdb`);
        
        console.log(`下载 ${editionId} 数据库...`);
        const response = await axios({
          method: 'get',
          url,
          responseType: 'arraybuffer',
          timeout: 30000,
          maxRedirects: 5
        });

        if (response.data.length === 0) {
          throw new Error('下载的文件为空');
        }

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
      } catch (error) {
        console.error(`下载 ${editionId} 失败:`, error.message);
        throw error;
      }
    });
    
    await Promise.all(downloadPromises);
    console.log('所有IP地址库下载完成');
  } catch (error) {
    console.error('下载IP地址库失败:', error);
    throw error;
  }
}

// 初始化数据库实例
async function initDBInstance() {
  if (!dbInstance) {
    try {
      await ensureIPDBDir();
      dbInstance = await maxmind.open(IPDB_FILE);
    } catch (error) {
      console.error('初始化数据库实例失败:', error);
      throw error;
    }
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
      return null;
    }

    const location = {
      country: result.country?.names?.zh || result.country?.names?.en,
      region: result.subdivisions?.[0]?.names?.zh || result.subdivisions?.[0]?.names?.en,
      city: result.city?.names?.zh || result.city?.names?.en,
      latitude: result.location?.latitude,
      longitude: result.location?.longitude
    };

    // 更新缓存
    ipCache.set(ip, {
      timestamp: now,
      data: location
    });

    return location;
  } catch (error) {
    console.error('IP查询失败 (' + ip + '):', error);
    return null;
  }
}

// 设置自动更新
function setupAutoUpdate() {
  // 每周检查一次更新，因为MaxMind每周二更新数据库
  schedule.scheduleJob('0 3 * * 2', async () => {
    try {
      console.log('开始检查IP地址库更新...');
      const updatePromises = geoipConfig.editionIds.map(async (editionId) => {
        try {
          const url = buildDownloadUrl(editionId);
          const response = await axios.head(url);
          const remoteLastModified = new Date(response.headers['last-modified']);
          const filePath = join(IPDB_DIR, `${editionId}.mmdb`);
          
          try {
            const stats = await fs.stat(filePath);
            if (remoteLastModified > stats.mtime) {
              console.log(`检测到 ${editionId} 有新版本，开始更新...`);
              return editionId;
            }
            console.log(`${editionId} 已是最新版本`);
            return null;
          } catch (error) {
            console.error(`检查本地文件失败 ${editionId}:`, error);
            return editionId;
          }
        } catch (error) {
          console.error(`检查远程更新失败 ${editionId}:`, error);
          return null;
        }
      });

      const needUpdateFiles = (await Promise.all(updatePromises)).filter(Boolean);
      
      if (needUpdateFiles.length > 0) {
        console.log('发现需要更新的数据库文件:', needUpdateFiles);
        await downloadIPDB();
        // 重新初始化数据库实例
        dbInstance = null;
        await initDBInstance();
        // 清除IP缓存
        ipCache.clear();
        console.log('IP地址库更新完成');
      } else {
        console.log('所有IP地址库均为最新版本');
      }
    } catch (error) {
      console.error('IP地址库自动更新失败:', error);
    }
  });
}

// 验证GeoIP配置
function validateGeoIPConfig() {
  if (!geoipConfig.accountId || !geoipConfig.licenseKey || !geoipConfig.editionIds.length) {
    throw new Error('缺少必要的MaxMind GeoIP配置，请检查环境变量：MAXMIND_ACCOUNT_ID, MAXMIND_LICENSE_KEY, MAXMIND_EDITION_IDS');
  }
}

// 初始化IP地址库
async function initIPDB() {
  try {
    // 验证配置
    validateGeoIPConfig();
    
    // 检查数据库文件
    await ensureIPDBDir();
    
    // 初始化数据库实例
    await initDBInstance();
    
    console.log('IP地址库初始化成功');
  } catch (error) {
    const errorMessage = error.message || '未知错误';
    console.error(`初始化IP地址库失败: ${errorMessage}`);
    console.error('请确保：');
    console.error('1. 环境变量中配置了正确的MaxMind账号信息');
    console.error('2. 网络连接正常且可以访问MaxMind服务器');
    console.error('3. data/ipdb目录具有正确的读写权限');
    throw error;
  }
}

export { initIPDB, queryIPLocation, setupAutoUpdate };