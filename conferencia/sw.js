// Mantém o app disponível sem internet: serve do cache e atualiza em segundo plano.
const VERSAO = 'conferencia-v3';
const ESSENCIAIS = [
  './', 'index.html', 'app.js', 'parser.js', 'gerar-pdf.js', 'release.js', 'brasao.png', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-180.png',
  'fonts/inter-Regular.woff2', 'fonts/inter-Medium.woff2', 'fonts/inter-SemiBold.woff2', 'fonts/inter-Bold.woff2',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/pdf-lib.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSAO).then(async (cache) => {
    const salvo = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req).then((resp) => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => salvo);
    return salvo || rede;
  }));
});
