# ⏱️ 时间记录器 Time Logger

一个**纯前端 PWA 应用**，一键记录每个重要时刻，支持离线使用、按天/月/年分组统计、CSV 导出等功能。

## ✨ 功能特点

- 🚀 **一键记录** - 大按钮 + 空格键快捷操作
- 📅 **多维度分组** - 按天、按月、按年自动归类统计
- 💾 **本地存储** - 基于 IndexedDB（Dexie.js），可存数十万条记录
- 📱 **PWA 支持** - 可添加到主屏幕，**完全离线可用**
- 📊 **容量监控** - 实时显示本地存储使用情况
- 📤 **数据导出** - 一键导出 CSV / 复制全部
- 🔍 **搜索筛选** - 快速定位历史记录
- 🎨 **现代 UI** - 紫色渐变设计、丰富动画效果

## 🌐 在线体验

👉 [https://你的用户名.github.io/time-logger/](https://你的用户名.github.io/time-logger/)

## 📱 安装到手机

### Android（Chrome）
打开网址 → 点击右上角"📥 安装"按钮 → 桌面出现图标

### iPhone（Safari）
打开网址 → 底部"分享"按钮 → "添加到主屏幕"

## 🛠️ 技术栈

- 原生 HTML / CSS / JavaScript（无框架）
- Tailwind CSS（CDN）
- Remix Icon（CDN）
- Dexie.js（IndexedDB 封装）
- Service Worker（离线缓存）

## 📂 项目结构

```
├── index.html          # 主页面
├── app.js              # 应用主逻辑
├── db.js               # IndexedDB 数据层
├── pwa.js              # PWA 安装/SW 注册
├── service-worker.js   # 离线缓存策略
├── style.css           # 自定义样式
├── manifest.json       # PWA 清单
├── icon.svg            # 应用图标
└── icon-maskable.svg   # Android 自适应图标
```

## 🚀 本地运行

由于 Service Worker 需要 HTTP 协议，不能直接双击 `index.html`，需启动一个本地服务器：

```bash
# 方式 1：Python
python -m http.server 8080

# 方式 2：Node.js
npx serve .

# 方式 3：VSCode Live Server 扩展
```

然后访问 http://localhost:8080

## 📜 License

MIT

---

由 [With](https://with.woa.com/) 通过自然语言生成
