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
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.remove('hidden');
}

function hideInstallButton() {
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.add('hidden');
}

async function triggerInstall() {
    // iOS Safari 不支持 beforeinstallprompt，需要引导用户手动操作
    if (!deferredInstallPrompt) {
        showIOSInstallGuide();
        return;
    }

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] 用户选择:', outcome);
    if (outcome === 'accepted') {
        if (typeof showToast === 'function') {
            showToast('正在安装应用...', 'ri-download-cloud-line');
        }
    }
    deferredInstallPrompt = null;
    hideInstallButton();
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
        const badge = document.getElementById('pwaBadge');
        if (badge) {
            badge.classList.remove('hidden');
            badge.innerHTML = '<i class="ri-smartphone-line"></i> App 模式';
        }
        isAppInstalled = true;
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
    if (isIOS() && !isStandalone()) {
        showInstallButton();
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
