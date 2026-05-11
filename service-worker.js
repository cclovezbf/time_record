// ==================== Service Worker ====================
// 缓存版本号：每次发布新版本时修改，会自动清理旧缓存
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `time-logger-${CACHE_VERSION}`;

// 需要预缓存的核心资源（App Shell）
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './db.js',
    './pwa.js',
    './manifest.json',
    './icon.svg',
    './icon-maskable.svg'
];

// 需要运行时缓存的 CDN 资源（首次加载时缓存）
const RUNTIME_CACHE_URLS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css',
    'https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.min.js'
];

// ==================== 安装阶段：预缓存核心资源 ====================
self.addEventListener('install', event => {
    console.log('[SW] 安装中...', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] 预缓存核心资源');
                // 核心资源逐个缓存，单个失败不阻断
                return Promise.all(
                    CORE_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('[SW] 缓存失败:', url, err);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting()) // 立即激活新版本
    );
});

// ==================== 激活阶段：清理旧缓存 ====================
self.addEventListener('activate', event => {
    console.log('[SW] 激活中...', CACHE_VERSION);
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('time-logger-') && name !== CACHE_NAME)
                        .map(name => {
                            console.log('[SW] 删除旧缓存:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim()) // 立即接管所有页面
    );
});

// ==================== 拦截请求：缓存策略 ====================
self.addEventListener('fetch', event => {
    const { request } = event;

    // 仅处理 GET 请求
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 跳过 chrome-extension 等特殊协议
    if (!url.protocol.startsWith('http')) return;

    // 策略 1：HTML 导航请求 - 网络优先，失败回退缓存
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // 成功获取后更新缓存
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
        );
        return;
    }

    // 策略 2：CDN 第三方资源 - 缓存优先，后台更新（Stale-While-Revalidate）
    if (url.origin !== self.location.origin) {
        event.respondWith(
            caches.match(request).then(cached => {
                const fetchPromise = fetch(request)
                    .then(response => {
                        // 仅缓存成功响应
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                        }
                        return response;
                    })
                    .catch(() => cached); // 网络失败返回缓存
                return cached || fetchPromise;
            })
        );
        return;
    }

    // 策略 3：同源静态资源 - 缓存优先，回退网络
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) {
                // 后台异步更新缓存（Stale-While-Revalidate）
                fetch(request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                }).catch(() => {});
                return cached;
            }
            return fetch(request)
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                });
        })
    );
});

// ==================== 接收主线程消息（用于版本控制） ====================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});
