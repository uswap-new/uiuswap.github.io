const staticSwapHive = "swap-hive-modern-v1";
const assets = [
  "/",
  "/index.html",
  "/css/modern-dark.css",
  "/js/config.js",
  "/js/api.js",
  "/js/wallet.js",
  "/js/market.js",
  "/js/swap.js",
  "/js/ui.js",
  "/js/main.js",
  "/assets/hive_auth.png",
  "/assets/hive_keychain.png",
  "/assets/hiveupme.png",
];

self.addEventListener("install", installEvent => {
  installEvent.waitUntil(
    caches.open(staticSwapHive).then(cache => {
      cache.addAll(assets);
    })
  )
});

self.addEventListener("fetch", fetchEvent => {
  fetchEvent.respondWith(
    caches.match(fetchEvent.request).then(res => {
      return res || fetch(fetchEvent.request);
    })
  )
});
