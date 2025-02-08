# Nginx日志分析平台部署指南

## 系统要求

- Node.js 18.x 或更高版本
- npm 9.x 或更高版本
- PM2 (用于进程管理)
- MaxMind GeoLite2 账号和许可证密钥

## 准备工作

### 1. 安装基础环境

```bash
# 安装 Node.js 和 npm (Ubuntu/Debian)
sudo apt update
sudo apt install nodejs npm

# 安装 PM2
npm install -g pm2
```

### 2. 获取 MaxMind GeoLite2 许可证密钥

1. 访问 [MaxMind 官网](https://www.maxmind.com/en/geolite2/signup) 注册账号
2. 登录后，进入 "My License Key" 页面创建新的许可证密钥
3. 保存生成的许可证密钥，后续配置时需要使用

## 开发环境部署

### 1. 克隆项目

```bash
git clone <项目仓库地址>
cd nginx-an
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env`，并配置以下环境变量：

```bash
# API服务端口
PORT=3000

# Nginx日志文件路径，多个路径用逗号分隔
NGINX_LOG_PATHS=/var/log/nginx/access.log,/var/log/nginx/access.log.1

# MaxMind GeoLite2 配置
MAXMIND_LICENSE_KEY=你的许可证密钥

# 用户认证配置（可选）
AUTH_ENABLED=false
AUTH_USERNAME=admin
AUTH_PASSWORD=password

# 前端API地址
VITE_API_URL=http://localhost:3000
```

### 4. 启动开发服务器

```bash
# 启动后端服务
npm run dev:server

# 启动前端服务（新开一个终端）
npm run dev
```

## 生产环境部署

### 1. 构建前端应用

```bash
npm run build
```

### 2. 使用PM2启动服务

```bash
# 启动API服务
pm2 start server/index.js --name nginx-analyzer-api

# 启动前端服务（如果需要）
pm2 serve dist --spa --name nginx-analyzer-frontend --port 80
```

### 3. Nginx反向代理配置（推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        root /path/to/nginx-an/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## 环境变量说明

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| PORT | API服务端口 | 3000 |
| NGINX_LOG_PATHS | Nginx日志文件路径，多个用逗号分隔 | /var/log/nginx/access.log |
| MAXMIND_LICENSE_KEY | MaxMind GeoLite2许可证密钥 | YOUR_LICENSE_KEY |
| AUTH_ENABLED | 是否启用用户认证 | true/false |
| AUTH_USERNAME | 认证用户名 | admin |
| AUTH_PASSWORD | 认证密码 | password |
| VITE_API_URL | 前端API地址 | http://localhost:3000 |

## 常见问题

1. 如果遇到权限问题，确保Node.js进程有权限读取Nginx日志文件：
```bash
sudo usermod -a -G adm nodejs
```

2. 如果GeoLite2数据库下载失败：
- 检查许可证密钥是否正确配置
- 确保服务器能够访问MaxMind的下载服务器
- 手动下载数据库文件并放置在 `data/ipdb/` 目录下

3. 确保目标Nginx日志格式与系统期望的格式匹配：
```nginx
log_format combined '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';
```

## 维护指南

### 日常维护

- 使用 `pm2 logs` 查看应用日志
- 使用 `pm2 status` 查看应用状态
- 使用 `pm2 restart nginx-analyzer-api` 重启API服务
- 定期检查日志文件大小，必要时进行日志轮转

### 数据库更新

GeoLite2数据库文件会自动更新，如需手动更新：

1. 访问 MaxMind 官网下载最新的数据库文件
2. 解压并替换 `data/ipdb/` 目录下的对应文件：
   - GeoLite2-City.mmdb
   - GeoLite2-ASN.mmdb
   - GeoLite2-Country.mmdb