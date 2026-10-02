/* ═══════════════════════════════════════════════════
   sw.js — 2回目からネット不要にする係（iPhone / PC のブラウザ用）

   画面のファイルを端末に置いておくだけ。アルバムと写真は一切扱わない
   （アルバムは localStorage、写真は IndexedDB にあり、ここを通らない）。

   ★Android の入れ物（APK）では動かない。js/ios.js の registerSw が inApk() で先に折り返す。
   ★画面のファイルを直したら必ず下の番号を上げること。js/app.js の BUILD と同じ番号に揃える。
     上げないと、前に置いた古い JS がそのまま出て「直したのに変わらない」になる。
   ═══════════════════════════════════════════════════ */
var CACHE = "shashincho-v20";

var FILES = [
  "./",
  "index.html",
  "app.webmanifest",
  "css/style.css",
  "js/app.js", "js/ios.js",
  "fonts/mincho.woff2",
  "img/binding/kon_front.jpg", "img/binding/kon_back.jpg", "img/binding/kon_shelf.webp",
  "img/binding/aka_front.jpg", "img/binding/aka_back.jpg", "img/binding/aka_shelf.webp",
  "img/shelf/wood_back.jpg", "img/shelf/wood_board.jpg",
  "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-192.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon-180.png", "icons/favicon-32.png", "icons/favicon-16.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 1つ落とせなくても全体を諦めない */
      return Promise.all(FILES.map(function (f) {
        return c.add(f)["catch"](function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) {
        return k === CACHE ? null : caches["delete"](k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  /* 外（Google Fonts）は預からない。ネットが無ければ端末の書体で描く */
  if (new URL(req.url).origin !== location.origin) return;

  /* まず置いてあるものを返す（速い・ネット不要）。裏で新しくしておく */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
        })["catch"](function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })["catch"](function () { return caches.match("index.html"); });
    })
  );
});
