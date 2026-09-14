/* 万象转换 Service Worker — 缓存应用外壳，支持离线使用 */
const CACHE = 'omniconvert-v1.30';
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/md5.js',
  'js/aes.js',
  'js/ooxml.js',
  'js/kgg-decoder.js',
  'js/kgg-db.js',
  'js/tools/pdf-tools.js',
  'js/tools/image-tools.js',
  'js/tools/doc-tools.js',
  'js/tools/music-tools.js',
  'vendor/pptx/pptxgen.bundle.js',
  'vendor/jszip.min.js',
  'vendor/pdf-lib.min.js',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'vendor/qpdf/qpdf.js',
  'vendor/qpdf/qpdf.wasm',
  'vendor/um/loader-inline.js',
  'vendor/um/kugou-pubkey.deflate',
  'vendor/sqljs/sql-wasm.js',
  'vendor/sqljs/sql-wasm.wasm',
  'vendor/xlsx.full.min.js',
  'vendor/mammoth.browser.min.js',
  'vendor/marked.min.js',
  'vendor/heic2any.min.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* 页面导航：网络优先，离线回退缓存 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  /* 静态资源：缓存优先 */
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
