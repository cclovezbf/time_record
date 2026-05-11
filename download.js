// ==================== 下载源码功能 ====================
// 一键打包当前页面所有源码为 ZIP 文件，方便用户下载到本地

// 需要打包的所有项目文件（路径相对于当前页面）
const SOURCE_FILES = [
    'index.html',
    'app.js',
    'db.js',
    'pwa.js',
    'style.css',
    'manifest.json',
    'service-worker.js',
    'icon.svg',
    'icon-maskable.svg'
];

// 额外的项目辅助文件（手动生成内容，无需 fetch）
const EXTRA_FILES = {
    'README.md': `# ⏱️ 时间记录器 Time Logger

一个**纯前端 PWA 应用**，一键记录每个重要时刻，支持离线使用、按天/月/年分组统计、CSV 导出等功能。

## ✨ 功能特点

- 🚀 一键记录 - 大按钮 + 空格键快捷操作
- 📅 多维度分组 - 按天、按月、按年自动归类统计
- 💾 本地存储 - 基于 IndexedDB（Dexie.js），可存数十万条记录
- 📱 PWA 支持 - 可添加到主屏幕，完全离线可用
- 📊 容量监控 - 实时显示本地存储使用情况
- 📤 数据导出 - 一键导出 CSV / 复制全部
- 🔍 搜索筛选 - 快速定位历史记录

## 🚀 本地运行

由于 Service Worker 需要 HTTP 协议，不能直接双击 index.html，需启动一个本地服务器：

\`\`\`bash
# Python
python -m http.server 8080

# Node.js
npx serve .
\`\`\`

然后访问 http://localhost:8080

## 📜 License

MIT

---

由 With 通过自然语言生成
`,
    '.nojekyll': `# 此文件用于禁用 GitHub Pages 的 Jekyll 处理\n# 确保所有静态文件（包括下划线开头的）都能正常访问\n`,
    '.github/workflows/deploy.yml': `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`
};

// 下载某个文件的文本内容
async function fetchFileText(path) {
    try {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        console.warn(`[下载源码] 无法获取 ${path}：`, err);
        return null;
    }
}

// 主函数：打包并下载 ZIP
async function downloadSourceAsZip() {
    if (typeof JSZip === 'undefined') {
        if (typeof showToast === 'function') {
            showToast('JSZip 未加载，请刷新页面后重试', 'ri-error-warning-line');
        }
        return;
    }

    // 提示开始
    if (typeof showToast === 'function') {
        showToast('正在打包源码，请稍候...', 'ri-loader-4-line');
    }

    const btn = document.getElementById('downloadSourceBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i> 打包中...';
    }

    try {
        const zip = new JSZip();
        const folder = zip.folder('time-logger'); // 顶层文件夹

        // 1. 拉取主项目文件
        const fetchPromises = SOURCE_FILES.map(async (path) => {
            const content = await fetchFileText(path);
            if (content !== null) {
                folder.file(path, content);
                return { path, ok: true };
            }
            return { path, ok: false };
        });

        const results = await Promise.all(fetchPromises);
        const successCount = results.filter(r => r.ok).length;
        const failedFiles = results.filter(r => !r.ok).map(r => r.path);

        // 2. 添加额外辅助文件
        for (const [path, content] of Object.entries(EXTRA_FILES)) {
            folder.file(path, content);
        }

        // 3. 生成 ZIP 并触发下载
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `time-logger-source-${dateStr}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 提示结果
        if (typeof showToast === 'function') {
            if (failedFiles.length === 0) {
                showToast(`✅ 已下载源码包，共 ${successCount + Object.keys(EXTRA_FILES).length} 个文件`, 'ri-checkbox-circle-line');
            } else {
                showToast(`已下载，但 ${failedFiles.length} 个文件获取失败`, 'ri-alert-line');
                console.warn('[下载源码] 失败文件：', failedFiles);
            }
        }
    } catch (err) {
        console.error('[下载源码] 打包失败：', err);
        if (typeof showToast === 'function') {
            showToast('打包失败：' + err.message, 'ri-error-warning-line');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }
}

// 绑定按钮
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('downloadSourceBtn');
    if (btn) {
        btn.addEventListener('click', downloadSourceAsZip);
    }
});
