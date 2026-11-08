/* 黄同学的数图通关秘籍 · 离线缓存 Service Worker
 * 策略：Cache First（缓存优先）
 * 升级页面后请把 CACHE_NAME 的版本号 +1，避免继续命中旧缓存。
 */
const CACHE_NAME = "huang-shutu-pwa-v1";
const CACHE_PREFIX = "huang-shutu-pwa-";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // 逐个 add，单个资源 404 不会让整个 SW 安装失败。
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (error) {
            console.warn("[SW] 预缓存跳过：", url, error);
          }
        })
      );

      // 新 SW 立即进入 waiting，配合 activate 里的 clients.claim() 接管页面。
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  // ignoreSearch：允许 start_url 带查询参数时仍命中已缓存的页面。
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);

    // 只缓存同源、成功的基础响应；不缓存 opaque / 错误响应。
    if (response && response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch((error) => {
        console.warn("[SW] 写入缓存失败：", request.url, error);
      });
    }

    return response;
  } catch (error) {
    // 离线时导航请求回退到首页，保证从主屏幕打开不至于白屏。
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html", { ignoreSearch: true });
      if (fallback) return fallback;
    }

    return new Response("当前处于离线状态，且该资源尚未缓存。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 不拦截 SW 自身，交给浏览器按更新机制处理。
  if (url.pathname.endsWith("/sw.js")) return;

  event.respondWith(cacheFirst(request));
});
