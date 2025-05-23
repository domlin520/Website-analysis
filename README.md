# Nginx日志分析平台

## 项目简介

Nginx日志分析平台是一个强大的Web应用程序，专门设计用于实时分析和可视化Nginx服务器的访问日志。该平台采用现代化的技术栈，提供直观的数据展示界面，帮助系统管理员和开发人员深入了解服务器流量模式、性能指标和潜在安全问题。

通过该平台，您可以：
- 实时监控服务器访问情况
- 分析流量趋势和异常
- 识别潜在的安全威胁
- 优化服务器性能
- 制定数据驱动的决策

## 主要功能

### 实时数据监控
- 实时日志数据可视化展示
- 自动刷新和更新数据
- 支持多服务器日志聚合分析

### 流量分析
- 访问流量实时统计和趋势分析
- 高峰期流量识别
- 流量异常检测和告警

### 地理位置分析
- IP地址来源分布可视化
- 全球访问热力图
- 地区访问量统计

### 请求分析
- 请求方法（GET、POST等）使用统计
- URL访问频率排名
- 资源类型分布分析

### 性能监控
- 响应状态码分布分析
- 响应时间统计
- 错误率监控

### 用户代理分析
- 浏览器类型统计
- 操作系统分布
- 移动端/桌面端访问比例

### 高级功能
- 自定义时间范围查询
- 数据导出功能
- 自定义报表生成

## 技术栈

### 前端技术
- React 18.x：用户界面开发框架
- Vite 4.x：现代化构建工具
- TypeScript 5.x：类型安全的JavaScript超集
- Tailwind CSS 3.x：原子化CSS框架
- Chart.js：数据可视化图表库

### 后端技术
- Node.js 18.x：服务器运行环境
- Express 4.x：Web应用框架
- MaxMind GeoIP2：IP地理位置解析

### 运维工具
- PM2：Node.js应用进程管理器
- Nginx：反向代理服务器

## 系统要求

### 基础环境
- Node.js 18.x 或更高版本
- npm 9.x 或更高版本
- PM2 (用于进程管理)

### 推荐配置
- CPU：2核或更高
- 内存：4GB或更高
- 磁盘空间：20GB或更高

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
访问 http://localhost:5173 查看开发环境下的应用。

5. 构建生产版本
```bash
npm run build
```

## 部署说明
详细的部署步骤请参考 [DEPLOY.md](DEPLOY.md) 文件。该文档包含了完整的部署流程、环境配置和注意事项。

## 贡献指南
我们欢迎并感谢任何形式的贡献！如果您想为项目做出贡献，请：

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

在提交代码之前，请确保：
- 代码符合项目的编码规范
- 添加了必要的测试用例
- 更新了相关文档

## 问题反馈
如果您在使用过程中遇到任何问题，或有任何建议，请：
- 提交 Issue
- 在讨论区发起讨论
- 通过Pull Request提供改进方案

## 许可证
MIT License - 详见 LICENSE 文件

## 致谢
感谢所有为这个项目做出贡献的开发者！