// ==================== PWA 图标 & Manifest 动态修复 ====================
// 目的：Android Chrome 安装 PWA 时严格要求至少一张 192×192 与 512×512 的位图（PNG）图标，
// 仅用 SVG 不能触发 beforeinstallprompt。本脚本在运行时把 SVG 渲染为 PNG（Canvas → blob URL），
// 并构造一份新的 manifest（icons 指向 PNG blob），替换页面中的 <link rel="manifest">。
// 这样既不需要落盘二进制 png 文件，又能通过 Chromium 的"可安装性"检查。

(function setupPwaIcons() {
    // 已经处于 standalone 模式（已安装），无需重复处理
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        return;
    }

    // 把 SVG 文件渲染为 size×size 的 PNG blob
    async function svgToPngBlob(svgUrl, size) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, size, size);
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error('toBlob 返回 null'));
                    }, 'image/png', 1.0);
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = (e) => reject(new Error('SVG 图片加载失败：' + svgUrl));
            img.src = svgUrl;
        });
    }

    // 主流程：生成 4 张 PNG（any 192/512 + maskable 192/512），构造新 manifest 并替换
    async function rewriteManifest() {
        try {
            const sizes = [192, 512];

            // 并行渲染 any 与 maskable 两组
            const [anyPngs, maskablePngs] = await Promise.all([
                Promise.all(sizes.map(s => svgToPngBlob('icon.svg', s))),
                Promise.all(sizes.map(s => svgToPngBlob('icon-maskable.svg', s).catch(() => null)))
            ]);

            const icons = [];
            anyPngs.forEach((blob, i) => {
                if (!blob) return;
                icons.push({
                    src: URL.createObjectURL(blob),
                    sizes: `${sizes[i]}x${sizes[i]}`,
                    type: 'image/png',
                    purpose: 'any'
                });
            });
            maskablePngs.forEach((blob, i) => {
                if (!blob) return;
                icons.push({
                    src: URL.createObjectURL(blob),
                    sizes: `${sizes[i]}x${sizes[i]}`,
                    type: 'image/png',
                    purpose: 'maskable'
                });
            });

            // 同时保留原 SVG（部分平台支持 SVG 图标，体积小）
            icons.push({
                src: new URL('icon.svg', location.href).href,
                sizes: 'any',
                type: 'image/svg+xml',
                purpose: 'any'
            });

            // 同时设置 apple-touch-icon 为 192 PNG（提升 iOS 桌面图标质量）
            if (anyPngs[0]) {
                let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
                if (!appleIcon) {
                    appleIcon = document.createElement('link');
                    appleIcon.rel = 'apple-touch-icon';
                    document.head.appendChild(appleIcon);
                }
                appleIcon.href = URL.createObjectURL(anyPngs[0]);
            }

            // 取原 manifest 内容（保留 name/start_url/display 等字段），仅替换 icons
            let baseManifest;
            try {
                const resp = await fetch('manifest.json', { cache: 'no-cache' });
                baseManifest = await resp.json();
            } catch (_) {
                baseManifest = {
                    name: '时间记录器 - Time Logger',
                    short_name: '时间记录',
                    start_url: './index.html',
                    scope: './',
                    display: 'standalone',
                    background_color: '#f5f3ff',
                    theme_color: '#8b5cf6'
                };
            }
            baseManifest.icons = icons;

            // 注意：manifest 中的相对 url 必须能被浏览器解析
            // start_url / scope 用绝对路径更稳妥
            baseManifest.start_url = new URL(baseManifest.start_url || './index.html', location.href).href;
            baseManifest.scope = new URL(baseManifest.scope || './', location.href).href;
            if (Array.isArray(baseManifest.shortcuts)) {
                baseManifest.shortcuts = baseManifest.shortcuts.map(sc => ({
                    ...sc,
                    url: new URL(sc.url, location.href).href
                }));
            }

            const manifestBlob = new Blob([JSON.stringify(baseManifest)], { type: 'application/manifest+json' });
            const manifestUrl = URL.createObjectURL(manifestBlob);

            let link = document.querySelector('link[rel="manifest"]');
            if (!link) {
                link = document.createElement('link');
                link.rel = 'manifest';
                document.head.appendChild(link);
            }
            link.href = manifestUrl;

            // 暴露状态供调试
            window.__PWA_MANIFEST_PATCHED__ = {
                manifestUrl,
                iconCount: icons.length,
                pngCount: anyPngs.filter(Boolean).length + maskablePngs.filter(Boolean).length
            };
            console.log('[PWA] manifest 动态修复完成', window.__PWA_MANIFEST_PATCHED__);
        } catch (err) {
            console.warn('[PWA] manifest 动态修复失败（不影响基础功能）:', err);
        }
    }

    // 文档就绪后执行（要求 head 中已有 <link rel="manifest">）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', rewriteManifest);
    } else {
        rewriteManifest();
    }
})();
