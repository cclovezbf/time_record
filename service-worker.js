// ==================== Service Worker ====================
// 缓存版本号：每次发布新版本时修改，激活阶段会自动清理所有非当前版本缓存
const CACHE_VERSION = 'v1.2.0';
const CORE_CACHE   = `time-logger-core-${CACHE_VERSION}`;     // 应用 Shell（核心同源资源）
const RUNTIME_CACHE = `time-logger-runtime-${CACHE_VERSION}`; // CDN / 第三方资源（独立分仓便于一键清理）

// ==================== 策略参数 ====================
// 单个文件最大缓存体积（超过则不写入 Cache）
const MAX_CACHE_ENTRY_BYTES = 2 * 1024 * 1024; // 2MB
// 运行时缓存最多保留的条目数（LRU 思想，超过则删最旧）
const MAX_RUNTIME_ENTRIES = 30;
// 缓存条目过期时间（仅运行时缓存使用，超期会重新拉取）
const RUNTIME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

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

// 允许的 CDN origin 白名单（不在白名单的跨域 GET 走纯网络，不进缓存）
const CDN_ORIGIN_WHITELIST = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net'
];

// ==================== 安装阶段：预缓存核心资源 ====================
self.addEventListener('install', event => {
    console.log('[SW] 安装中...', CACHE_VERSION);
    event.waitUntil(
        caches.open(CORE_CACHE)
            .then(cache => Promise.all(
                CORE_ASSETS.map(url =>
                    cache.add(url).catch(err => console.warn('[SW] 核心资源缓存失败:', url, err))
                )
            ))
            .then(() => self.skipWaiting())
    );
});

// ==================== 激活阶段：清理所有旧缓存 ====================
self.addEventListener('activate', event => {
    console.log('[SW] 激活中...', CACHE_VERSION);
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names
                    .filter(name => name.startsWith('time-logger-') && name !== CORE_CACHE && name !== RUNTIME_CACHE)
                    .map(name => {
                        console.log('[SW] 删除旧缓存:', name);
                        return caches.delete(name);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// ==================== 工具函数 ====================
// 估算 response 大小（优先看 Content-Length，其次 clone 后读 blob）
async function estimateResponseSize(response) {
    const len = response.headers.get('content-length');
    if (len && !isNaN(+len)) return +len;
    try {
        const blob = await response.clone().blob();
        return blob.size;
    } catch (_) {
        return 0;
    }
}

// 安全写入缓存：超过最大体积则跳过；写完后做容量裁剪
async function safePutToCache(cacheName, request, response) {
    if (!response || response.status !== 200 || response.type === 'opaque') return;
    try {
        const size = await estimateResponseSize(response);
        if (size > MAX_CACHE_ENTRY_BYTES) {
            // 体积过大，不缓存（避免单个 CDN 大文件吃掉几十 MB）
            return;
        }
        const cache = await caches.open(cacheName);

        // 给响应附加时间戳头，用于过期判断
        const headers = new Headers(response.headers);
        headers.set('x-sw-cached-at', Date.now().toString());
        const tagged = new Response(await response.clone().blob(), {
            status: response.status,
            statusText: response.statusText,
            headers
        });

        await cache.put(request, tagged);

        // 仅运行时缓存做条目数限制
        if (cacheName === RUNTIME_CACHE) {
            await trimCache(cacheName, MAX_RUNTIME_ENTRIES);
        }
    } catch (err) {
        console.warn('[SW] 写入缓存失败:', err);
    }
}

// 裁剪缓存：保留最近的 maxEntries 个条目（按写入顺序，删最早）
async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const removeCount = keys.length - maxEntries;
    for (let i = 0; i < removeCount; i++) {
        await cache.delete(keys[i]);
    }
}

// 判断缓存条目是否过期
function isExpired(response, maxAgeMs) {
    if (!response) return true;
    const cachedAt = response.headers.get('x-sw-cached-at');
    if (!cachedAt) return false; // 老条目无标记，按未过期处理
    return Date.now() - (+cachedAt) > maxAgeMs;
}

function isWhitelistedCdn(url) {
    return CDN_ORIGIN_WHITELIST.some(origin => url.href.startsWith(origin));
}

// ==================== 拦截请求 ====================
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;

    // 策略 1：HTML 导航请求 - 网络优先（带超时），失败回退缓存
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(networkFirstWithTimeout(request, 3000));
        return;
    }

    // 策略 2：跨域资源
    if (url.origin !== self.location.origin) {
        if (isWhitelistedCdn(url)) {
            // 白名单 CDN：Stale-While-Revalidate（带过期）
            event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        }
        // 非白名单跨域请求：不拦截，让浏览器直接走网络（不进缓存）
        return;
    }

    // 策略 3：同源静态资源 - Cache First + 后台更新
    event.respondWith(cacheFirst(request, CORE_CACHE));
});

// ==================== 三种缓存策略实现 ====================
async function networkFirstWithTimeout(request, timeoutMs) {
    try {
        const response = await Promise.race([
            fetch(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
        // 后台静默更新核心缓存
        safePutToCache(CORE_CACHE, request, response.clone());
        return response;
    } catch (_) {
        const cached = await caches.match(request);
        return cached || (await caches.match('./index.html')) || new Response('离线且无缓存', { status: 503 });
    }
}

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) {
        // 后台更新（不阻塞返回）
        fetch(request)
            .then(resp => safePutToCache(cacheName, request, resp))
            .catch(() => {});
        return cached;
    }
    try {
        const response = await fetch(request);
        // 克隆一份用于缓存，原始响应直接返回
        safePutToCache(cacheName, request, response.clone());
        return response;
    } catch (err) {
        return new Response('资源加载失败', { status: 504 });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cached = await caches.match(request);
    const expired = cached ? isExpired(cached, RUNTIME_MAX_AGE_MS) : true;

    const networkPromise = fetch(request)
        .then(response => {
            safePutToCache(cacheName, request, response.clone());
            return response;
        })
        .catch(() => null);

    // 有缓存且未过期 → 立即返回缓存，后台静默刷新
    if (cached && !expired) return cached;
    // 无缓存或已过期 → 等网络
    const fresh = await networkPromise;
    return fresh || cached || new Response('资源加载失败', { status: 504 });
}

// ==================== 主线程消息处理 ====================
self.addEventListener('message', event => {
    if (!event.data) return;

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'GET_VERSION') {
        event.ports[0]?.postMessage({ version: CACHE_VERSION });
    }

    // 主动清理所有 SW 缓存（不影响 IndexedDB）
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            (async () => {
                const names = await caches.keys();
                const ours = names.filter(n => n.startsWith('time-logger-'));
                await Promise.all(ours.map(n => caches.delete(n)));
                event.ports[0]?.postMessage({ ok: true, cleared: ours });
            })()
        );
    }

    // 查询当前 SW 缓存的条目数与近似大小
    if (event.data.type === 'CACHE_STATS') {
        event.waitUntil(
            (async () => {
                const stats = { core: { entries: 0, bytes: 0 }, runtime: { entries: 0, bytes: 0 } };
                for (const [key, label] of [[CORE_CACHE, 'core'], [RUNTIME_CACHE, 'runtime']]) {
                    try {
                        const cache = await caches.open(key);
                        const keys = await cache.keys();
                        stats[label].entries = keys.length;
                        for (const req of keys) {
                            const resp = await cache.match(req);
                            if (resp) stats[label].bytes += await estimateResponseSize(resp);
                        }
                    } catch (_) { /* ignore */ }
                }
                event.ports[0]?.postMessage(stats);
            })()
        );
    }
});
