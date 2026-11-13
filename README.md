# 兴趣班签到 (KidCheckin)

家庭共享的兴趣班课程签到与出勤记录 PWA 应用。专为 iPhone 优化，同时支持桌面和 Android 浏览器。

## 功能特性

| 功能 | 说明 |
|------|------|
| ✅ **签到** | 到课后点击「签到」，记录签到时间与操作人 |
| 📊 **课程汇总** | 按孩子/课程统计出勤率、课时包消耗、缺勤请假 |
| 🔙 **补签** | 忘记签到？管理员可补签，补签记录单独标记 |
| 🔔 **课前提醒** | Web Push 推送 + 系统日历订阅（.ics）双保险 |
| 👨‍👩‍👧‍👦 **多人登录** | 邮箱注册登录，邀请码加入家庭，实时同步 |
| 📱 **iPhone 使用** | Safari 打开 → 添加到主屏幕 → 类原生体验 |
| 📤 **CSV 导出** | 签到明细 + 汇总统计，Excel/Numbers 可直接打开 |

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite + Pinia + Vue Router
- **UI**: 自定义设计系统，支持深色模式、iOS 安全区适配
- **PWA**: vite-plugin-pwa + Workbox（离线缓存、Web Push）
- **后端**: Supabase（PostgreSQL + RLS 行级安全 + Realtime + Edge Functions）
- **部署**: Cloudflare Pages（免费）+ Supabase 免费层

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器（演示模式）

```bash
npm run dev
```

打开 `http://localhost:5173` 即可看到演示数据（含 2 个孩子、4 门课程、模拟签到记录）。

> 未配置 Supabase 环境变量时自动进入演示模式。

### 3. 连接真实后端

1. 创建 Supabase 项目（免费）
2. 在 SQL Editor 中执行 `supabase/migrations/0001_init.sql`
3. 复制 `.env.example` 为 `.env`，填入：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

4. 部署 Edge Functions 并配置定时任务（详见 `docs/部署指南.md`）

### 4. 生产构建

```bash
npm run build
```

产出 `dist/` 目录，可部署到 Cloudflare Pages、Netlify、Vercel 等静态托管。

## 项目结构

```
├── src/
│   ├── api/          # 数据层：Backend 接口 + Supabase 实现 + 演示模式
│   ├── components/   # 通用组件：TabBar、Sheet、SessionCard、ExportSheet 等
│   ├── lib/          # 工具库：datetime、csv、stats、push
│   ├── views/        # 页面：Today、Courses、Summary、Profile 等
│   ├── stores/       # Pinia 状态管理
│   └── types.ts      # 全局类型定义
├── supabase/
│   ├── migrations/   # 数据库结构（表/RLS/RPC/定时任务）
│   └── functions/    # Edge Functions（提醒推送、ICS 日历）
└── docs/
    └── 部署指南.md    # 从零到上线的完整步骤
```

## 数据模型

```
families（家庭）
  ├── family_members（成员 = 登录账号 + 角色）
  ├── students（孩子）
  ├── courses（兴趣班课程，每周固定时段）
  │     └── sessions（课次 — 由课程规则物化生成）
  │           └── attendance_records（签到记录，含补签标记）
  └── push_subscriptions（推送订阅，每设备一行）
```

## 安全设计

- **RLS 行级安全**: 所有数据按 `family_id` 隔离，只有该家庭成员可读写
- **RPC 权限**: 签到/补签/调课等操作通过 security definer 函数校验权限
- **角色控制**: `admin`（家长）可管理课程/补签/移除成员；`member` 可签到/查看

## 提醒机制（双保险）

| 通道 | 说明 | 前提 |
|------|------|------|
| Web Push | 课前 N 分钟推送到手机 | iOS 16.4+，添加到主屏幕，开启通知 |
| 日历订阅 (.ics) | 课程表订阅到 iPhone 系统日历，原生弹提醒 | 设置 → 日历 → 账户 → 添加订阅日历 |

## 部署

详见 **[docs/部署指南.md](docs/部署指南.md)** — 从创建 Supabase 项目到 Cloudflare Pages 上线的完整步骤。

## 许可证

MIT License — 家庭自用，随便改。
