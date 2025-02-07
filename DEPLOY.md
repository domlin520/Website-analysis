# Nginx日志分析平台部署指南

## 系统要求

- Node.js 18.x 或更高版本
- npm 9.x 或更高版本
- PM2 (用于进程管理)

## 部署步骤

### 1. 准备工作

```bash
# 安装 Node.js 和 npm (Ubuntu/Debian)
sudo apt update
sudo apt install nodejs npm

# 安装 PM2
npm install -g pm2
```

### 2. 部署应用

```bash
# 克隆项目代码
git clone <项目仓库地址>
cd nginx-an

# 安装依赖
npm install

# 构建前端应用
npm run build
```

### 3. 配置环境变量

创建 `.env` 文件并配置以下环境变量：

```bash
# API服务端口
PORT=3000

# Nginx日志文件路径，多个路径用逗号分隔
NGINX_LOG_PATHS=/var/log/nginx/access.log,/var/log/nginx/access.log.1

# 前端API地址
VITE_API_URL=http://你的域名或IP:3000
```

### 4. 使用PM2启动服务

```bash
# 启动API服务
pm2 start server/index.js --name nginx-analyzer-api

# 启动前端服务（如果需要）
pm2 serve dist --spa --name nginx-analyzer-frontend --port 80
```

### 5. Nginx反向代理配置（可选）

如果使用Nginx作为反向代理，添加以下配置：

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

### 6. 验证部署

访问 `http://你的域名或IP` 验证系统是否正常运行。

## 常见问题

1. 如果遇到权限问题，确保Node.js进程有权限读取Nginx日志文件：
```bash
sudo usermod -a -G adm nodejs
```

2. 如果需要修改日志文件路径，可以通过环境变量 `NGINX_LOG_PATHS` 配置。

3. 确保目标Nginx日志格式与系统期望的格式匹配：
```nginx
log_format combined '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';
```

## 维护指南

- 使用 `pm2 logs` 查看应用日志
- 使用 `pm2 status` 查看应用状态
- 使用 `pm2 restart nginx-analyzer-api` 重启API服务
- 定期检查日志文件大小，必要时进行日志轮转