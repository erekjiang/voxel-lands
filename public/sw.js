// Service Worker：离线缓存。
// 策略：导航请求走网络优先（保证拿到新版本），失败回退缓存的 index.html；
// /assets/ 内容哈希文件不可变，缓存优先；其余同源 GET 缓存优先、后台回填。
// 安装时解析 index.html 里的资源链接做预缓存，首次访问后即可离线游玩。

const VERSION = 'voxel-lands-v3';

async function precache() {
  const cache = await caches.open(VERSION);
  const core = ['./', './index.html', './manifest.webmanifest',
    './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
    './icons/apple-touch-icon.png', './icons/favicon-64.png'];
  await cache.addAll(core);
  // 预缓存当前构建的 JS/CSS（文件名带哈希，从 index.html 提取）
  try {
    const res = await fetch('./index.html', { cache: 'no-cache' });
    const html = await res.text();
    const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => './' + m[1]);
    if (assets.length) await cache.addAll(assets);
  } catch { /* 离线安装时跳过 */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，离线回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：缓存优先，未命中则取网络并回填
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
