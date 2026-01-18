# Netstat Cat 网络监控工具

> 一款功能强大的网络监控工具，具备实时连接跟踪和高级过滤功能

## 项目概述

Netstat Cat 是一款 Electron 桌面应用程序，为 Windows 系统上的网络连接监控提供了用户友好的界面。它作为命令行 `netstat` 工具的图形化替代品，让网络活动监控和应用程序端口识别变得更加简单。

## 核心功能

- **实时网络监控** - 使用 `netstat -ano` 实时显示活跃的 TCP/UDP 连接
- **进程识别** - 显示每个网络连接所属的进程
- **高级过滤系统** - 支持按进程名、PID、端口范围或语义查询搜索
- **虚拟化表格性能** - 使用 React Virtuoso 高效处理大量连接
- **延迟进程解析** - 仅在悬停时获取完整可执行文件路径
- **LRU 缓存** - 智能缓存进程路径，避免重复系统调用
- **语义查询解析器** - 支持高级搜索语法，如 `process=chrome && lport>1000`
- **现代化界面** - 无边框窗口，支持深色/浅色主题切换
- **自动刷新模式** - 可配置的实时监控（2秒间隔）

## 截图

<!-- 截图将在此处添加 -->

![主界面](screenshots/main-interface.png)
_显示活跃网络连接的主界面_

## 快速开始

### 系统要求

- Windows 10 或更高版本
- Node.js 16+
- npm 或 yarn

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/your-username/netstat-cat.git
cd netstat-cat

# 安装依赖
npm install
```

### 开发环境

```bash
# 启动开发服务器
npm run dev

# 运行类型检查
npm run typecheck

# 运行代码检查
npm run lint
```

### 构建应用

```bash
# 构建当前平台
npm run build

# 特定平台构建
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 使用指南

### 基础监控

1. 启动应用程序查看所有活跃的网络连接
2. 使用过滤按钮快速按协议、IP版本或连接状态筛选
3. 启用自动刷新进行实时监控

### 高级过滤

- **简单搜索**: 输入进程名、PID 或端口（如 `chrome`、`8080`）
- **通配符**: 使用 `*` 进行模式匹配（如 `*.exe`）
- **端口范围**: 使用范围如 `80-443`
- **语义查询**: 使用高级语法如 `process=chrome && lport>1000`

完整过滤文档请参考 [filters_cn.md](filters_cn.md)。

## 技术架构

### 前端技术栈

- **React 19** 配合 TypeScript
- **Tailwind CSS** 样式框架
- **React Virtuoso** 虚拟化滚动
- **Electron** 桌面应用框架

### 后端集成

- **Node.js** 主进程
- **Windows 系统集成** 通过 `tasklist` 和 `netstat`
- **IPC 通信** 渲染进程与主进程间通信
- **LRU 缓存** 性能优化

### 性能特性

- 进程路径延迟加载
- 虚拟化表格渲染
- 高效缓存策略
- 优化的系统调用

## 开发指南

### IDE 设置

推荐: [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### 项目结构

```
src/
├── main/           # Electron 主进程
├── renderer/       # React 前端
├── preload/        # Electron 预加载脚本
└── resources/      # 应用资源
```

### 脚本命令

- `npm run dev` - 启动开发模式
- `npm run build` - 生产构建
- `npm run typecheck` - TypeScript 类型检查
- `npm run lint` - ESLint 代码检查
- `npm run format` - Prettier 代码格式化

## 贡献指南

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 运行测试和代码检查
5. 提交 Pull Request

## 许可证

[在此处添加您的许可证]

## 相关文档

- [过滤指南 (英文)](filters_en.md)
- [过滤指南 (中文)](filters_cn.md)
