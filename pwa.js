// ==================== PWA 功能管理 ====================
// 包含：Service Worker 注册、安装提示、在线状态、URL 参数响应

let deferredInstallPrompt = null;
let isAppInstalled = false;

// ==================== 1. 注册 Service Worker ====================
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('[PWA] 当前浏览器不支持 Service Worker');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('./service-worker.js', {
            scope: './'
        });
        console.log('[PWA] Service Worker 注册成功:', registration.scope);

        // 监听新版本检测
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // 检测到新版本可用
                    showUpdateBanner(newWorker);
                }
            });
        });

        // 周期性检查更新（每 30 分钟）
        setInterval(() => registration.update(), 30 * 60 * 1000);
    } catch (err) {
        console.error('[PWA] Service Worker 注册失败:', err);
    }
}

// ==================== 2. 显示更新提示 ====================
function showUpdateBanner(newWorker) {
    if (typeof showToast === 'function') {
        showToast('发现新版本，刷新页面以更新 ✨', 'ri-refresh-line');
    }
    // 自动激活新 SW
    setTimeout(() => {
        if (newWorker) newWorker.postMessage({ type: 'SKIP_WAITING' });
    }, 3000);

    // SW 切换后自动刷新页面
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

// ==================== 3. 安装提示（Android / Desktop） ====================
window.addEventListener('beforeinstallprompt', (e) => {
    // 阻止浏览器自带的提示
    e.preventDefault();
    // 已安装情况下忽略后续的可安装事件，避免再次弹出按钮
    if (isStandalone() || isAppInstalled) {
        deferredInstallPrompt = null;
        hideInstallButton();
        return;
    }
    deferredInstallPrompt = e;
    console.log('[PWA] 应用可安装');
    showInstallButton();
});

window.addEventListener('appinstalled', () => {
    console.log('[PWA] 应用已安装');
    isAppInstalled = true;
    deferredInstallPrompt = null;
    hideInstallButton();
    if (typeof showToast === 'function') {
        showToast('🎉 已添加到主屏幕，现在可以离线使用啦！', 'ri-checkbox-circle-line');
    }
});

function showInstallButton() {
    // 已安装（standalone 模式）下不再展示安装入口
    if (isStandalone() || isAppInstalled) {
        hideInstallButton();
        return;
    }
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.remove('hidden');
    const sBtn = document.getElementById('settingsInstallBtn');
    if (sBtn) sBtn.classList.remove('hidden');
}

function hideInstallButton() {
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.add('hidden');

    // 设置页中的"立即安装"按钮也一并隐藏
    const sBtn = document.getElementById('settingsInstallBtn');
    if (sBtn) sBtn.classList.add('hidden');

    // 设置页的状态文案改为"已安装"
    const statusText = document.getElementById('installStatusText');
    if (statusText) statusText.textContent = '应用已安装到本地，可离线使用 ✨';

    // 顶部 PWA 徽章亮起
    const badge = document.getElementById('pwaBadge');
    if (badge) {
        badge.classList.remove('hidden');
        badge.innerHTML = '<i class="ri-smartphone-line"></i> App 模式';
    }
}

async function triggerInstall() {
    // 已经在 PWA 内
    if (isStandalone()) {
        if (typeof showToast === 'function') {
            showToast('应用已安装，正在以 App 模式运行 🎉', 'ri-checkbox-circle-line');
        }
        return;
    }

    // iOS Safari：弹出图文引导
    if (isIOS()) {
        showIOSInstallGuide();
        return;
    }

    // Android / Desktop Chromium：beforeinstallprompt 已就绪
    if (deferredInstallPrompt) {
        try {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log('[PWA] 用户选择:', outcome);
            if (outcome === 'accepted') {
                if (typeof showToast === 'function') {
                    showToast('正在安装应用...', 'ri-download-cloud-line');
                }
            }
        } catch (err) {
            console.warn('[PWA] prompt 调用失败:', err);
        }
        deferredInstallPrompt = null;
        hideInstallButton();
        return;
    }

    // 走到这里说明：非 iOS、非 standalone、但浏览器没有抛出 beforeinstallprompt
    // 给出针对性诊断
    diagnoseInstallability();
}

// 诊断为什么 PWA 不能安装，并给出可操作的建议
function diagnoseInstallability() {
    const ua = navigator.userAgent.toLowerCase();
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';
    const hasSW = 'serviceWorker' in navigator;
    const isWeChat = /micromessenger/i.test(ua);
    const isQQ = /\bqq\//i.test(ua) || /qqbrowser/i.test(ua);
    const isUC = /ucbrowser/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const isChromium = /chrome|chromium|edg|samsungbrowser/i.test(ua);

    let msg = '';
    let icon = 'ri-information-line';

    if (!isHttps) {
        msg = '⚠️ 当前页面不是 HTTPS，无法安装 PWA。请使用 https:// 链接打开';
        icon = 'ri-shield-cross-line';
    } else if (!hasSW) {
        msg = '⚠️ 当前浏览器不支持 PWA，请换用 Chrome / Edge 等现代浏览器';
        icon = 'ri-error-warning-line';
    } else if (isWeChat) {
        msg = '⚠️ 微信内置浏览器不支持安装。请点右上角 →「在浏览器中打开」后再试';
        icon = 'ri-wechat-line';
    } else if (isQQ || isUC) {
        msg = '⚠️ 当前浏览器（QQ/UC）支持有限。建议使用系统自带 Chrome / 三星浏览器打开';
        icon = 'ri-error-warning-line';
    } else if (isAndroid && isChromium) {
        msg = '🔄 浏览器还没满足安装条件。请刷新一次页面，或菜单 → "添加到主屏幕"';
        icon = 'ri-refresh-line';
        // 同时尝试给一些可视化提示：滚动到设置页 / 显示菜单按钮
    } else {
        msg = '🔄 当前浏览器暂不可一键安装。可尝试浏览器菜单 → "添加到主屏幕"';
        icon = 'ri-menu-line';
    }

    if (typeof showToast === 'function') {
        showToast(msg, icon);
    } else {
        alert(msg);
    }

    // 控制台输出详细诊断
    console.group('[PWA 安装诊断]');
    console.log('协议:', location.protocol, '| 域名:', location.hostname);
    console.log('HTTPS / Localhost:', isHttps);
    console.log('Service Worker 支持:', hasSW);
    console.log('SW 控制器:', !!navigator.serviceWorker?.controller);
    console.log('User-Agent:', navigator.userAgent);
    console.log('manifest 修复状态:', window.__PWA_MANIFEST_PATCHED__);
    console.log('beforeinstallprompt 已触发:', !!deferredInstallPrompt);
    console.groupEnd();
}

// ==================== 4. iOS 安装引导（iOS Safari 专属） ====================
function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function showIOSInstallGuide() {
    const modal = document.getElementById('iosInstallModal');
    if (modal) modal.classList.remove('hidden');
}

function hideIOSInstallGuide() {
    const modal = document.getElementById('iosInstallModal');
    if (modal) modal.classList.add('hidden');
}

// ==================== 5. 在线 / 离线状态监听 ====================
function updateOnlineStatus() {
    const indicator = document.getElementById('networkStatus');
    if (!indicator) return;
    if (navigator.onLine) {
        indicator.classList.remove('offline');
        indicator.innerHTML = '<i class="ri-wifi-line"></i> 在线';
        indicator.title = '网络已连接';
    } else {
        indicator.classList.add('offline');
        indicator.innerHTML = '<i class="ri-wifi-off-line"></i> 离线';
        indicator.title = '当前离线，但应用仍可正常使用';
        if (typeof showToast === 'function') {
            showToast('已进入离线模式，数据照常保存到本地', 'ri-cloud-off-line');
        }
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ==================== 6. URL 参数响应（支持快捷方式） ====================
function handleUrlAction() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action === 'record') {
        // 等待应用就绪后自动记录一次
        const tryRecord = () => {
            if (typeof isReady !== 'undefined' && isReady) {
                if (typeof addRecord === 'function') addRecord();
                // 清理 URL
                window.history.replaceState({}, '', window.location.pathname);
            } else {
                setTimeout(tryRecord, 100);
            }
        };
        tryRecord();
    }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 显示当前安装状态徽章
    if (isStandalone()) {
        isAppInstalled = true;
        // 同步隐藏顶部 + 设置页的安装入口，亮起 App 模式徽章
        hideInstallButton();
    }

    // 绑定安装按钮
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.addEventListener('click', triggerInstall);
    }

    // 绑定 iOS 引导关闭按钮
    const iosCloseBtn = document.getElementById('iosModalClose');
    if (iosCloseBtn) {
        iosCloseBtn.addEventListener('click', hideIOSInstallGuide);
    }
    const iosModal = document.getElementById('iosInstallModal');
    if (iosModal) {
        iosModal.addEventListener('click', (e) => {
            if (e.target === iosModal) hideIOSInstallGuide();
        });
    }

    // iOS Safari 主动显示安装入口（因为它没有 beforeinstallprompt 事件）
    // Android / Desktop 即便没立刻收到 beforeinstallprompt，也展示入口，点击时给出诊断
    if (!isStandalone()) {
        showInstallButton();
    }

    // 监听 display-mode 切换：用户在浏览器中点了"安装"后，模式会变为 standalone，
    // 此时立即把所有安装入口隐藏（兼容某些浏览器不抛 appinstalled 的情况）
    if (window.matchMedia) {
        const mql = window.matchMedia('(display-mode: standalone)');
        const handler = (e) => {
            if (e.matches) {
                isAppInstalled = true;
                deferredInstallPrompt = null;
                hideInstallButton();
            }
        };
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', handler);
        } else if (typeof mql.addListener === 'function') {
            mql.addListener(handler);
        }
    }

    // 初始网络状态
    updateOnlineStatus();

    // 处理 URL action
    handleUrlAction();
});

// 页面加载完成后注册 SW
if (document.readyState === 'complete') {
    registerServiceWorker();
} else {
    window.addEventListener('load', registerServiceWorker);
}
