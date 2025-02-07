# Nginx日志分析平台

## 项目简介
这是一个基于Web的Nginx日志分析平台，提供直观的日志数据可视化和分析功能。通过该平台，您可以轻松监控和分析Nginx服务器的访问日志，获取有价值的流量洞察。

## 主要功能
- 实时日志数据可视化
- 访问流量统计分析
- IP地址来源分布
- 请求方法统计
- 响应状态码分析
- 用户代理分析
- 自定义时间范围查询

## 技术栈
- 前端：React + Vite + TypeScript
- 样式：Tailwind CSS
- 后端：Node.js
- 进程管理：PM2

## 系统要求
- Node.js 18.x 或更高版本
- npm 9.x 或更高版本
- PM2 (用于进程管理)

## 快速开始

1. 克隆项目
```bash
git clone [项目地址]
cd nginx-an
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
复制`.env.example`文件为`.env`，并根据实际情况修改配置：
```
VITE_API_URL=http://localhost:3000
```

4. 启动开发服务器
```bash
npm run dev
```

5. 构建生产版本
```bash
npm run build
```

## 部署说明
详细的部署步骤请参考 [DEPLOY.md](DEPLOY.md) 文件。

## 贡献指南
欢迎提交问题和改进建议！如果您想为项目做出贡献，请：

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 许可证
MIT License - 详见 LICENSE 文件