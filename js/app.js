"use strict";
/* =========================================================
   写真帖 — 触って決めるためのデモ

   ここで確かめたいこと:
     ① 本のめくり心地（縦にはらう／横の見開き）
     ② 型を選んで組む速さ ＋ 自由配置の操作
     ③ アルバムを何冊も持って、本棚から出し入れする
     ④ 組んでいる途中のページ移動（転がすだけで次のページへ）

   保管の仕組みは本番と同じにしてある:
     アルバムの構成 → localStorage（軽い。鍵だけ持つ）
     写真の実体     → IndexedDB（重い。localStorage だとすぐ上限に当たる）
   ========================================================= */

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};
var NL = String.fromCharCode(10);
var toastT = null;
function toast(m) {
  var t = $("#toast"); t.textContent = m; t.className = "show";
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () { t.className = ""; }, 2400);
}
function uid(p) { return (p || "x") + Math.random().toString(36).slice(2, 8); }

/* 版の印。Android の入れ物の中ならそちらの印を、外ならブラウザだと分かるように。
   ★app/build.gradle の versionName と MainActivity.BUILD_MARK と、ここの3つを必ず合わせる */
var BUILD = "v21";
function buildMark() {
  try {
    if (window.ShashinCho && ShashinCho.buildMark) return ShashinCho.buildMark();
  } catch (e) {}
  return BUILD + "（ブラウザ）";
}
function today() {
  var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
    + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* 入れ物の中に、縦横比 ratio の箱を目いっぱい収める。
   ★aspect-ratio まかせにすると、狭いほうにぶつかった時に比が崩れる。
     組んだ通りに見えなくなるので、ここは必ず測って px で決める */
function fitBox(area, box, ratio) {
  if (!area || !box) return;
  var cs = getComputedStyle(area);
  var aw = area.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  var ah = area.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
  if (aw <= 0 || ah <= 0) return;
  var h = Math.min(ah, aw / ratio);
  box.style.height = Math.floor(h) + "px";
  box.style.width = Math.floor(h * ratio) + "px";
}
var RATIO = 3 / 4;   /* ページ1枚の縦横比。判型を選べるようにするならここ */

/* =========================================================
   ページの型
   枠は「ページの幅・高さに対する％」。だから端末が変わっても崩れない
   ========================================================= */
var LAYOUTS = [
  { key:"full",   name:"全面",    slots:[ {k:"photo",x:0,y:0,w:100,h:100} ] },
  { key:"fullcap",name:"全面＋題", slots:[ {k:"photo",x:0,y:0,w:100,h:100},
                                          {k:"text", x:8,y:70,w:84,h:22,color:"白"} ] },
  { key:"v2",     name:"上下2枚",  slots:[ {k:"photo",x:6,y:5,w:88,h:43},
                                          {k:"photo",x:6,y:52,w:88,h:43} ] },
  { key:"h2",     name:"左右2枚",  slots:[ {k:"photo",x:5,y:20,w:43,h:60},
                                          {k:"photo",x:52,y:20,w:43,h:60} ] },
  { key:"g4",     name:"4枚",      slots:[ {k:"photo",x:5,y:8,w:43,h:40},
                                          {k:"photo",x:52,y:8,w:43,h:40},
                                          {k:"photo",x:5,y:52,w:43,h:40},
                                          {k:"photo",x:52,y:52,w:43,h:40} ] },
  { key:"g6",     name:"6枚",      slots:[ {k:"photo",x:5,y:6,w:43,h:28},
                                          {k:"photo",x:52,y:6,w:43,h:28},
                                          {k:"photo",x:5,y:36,w:43,h:28},
                                          {k:"photo",x:52,y:36,w:43,h:28},
                                          {k:"photo",x:5,y:66,w:43,h:28},
                                          {k:"photo",x:52,y:66,w:43,h:28} ] },
  { key:"big2",   name:"大＋小2",  slots:[ {k:"photo",x:6,y:5,w:88,h:52},
                                          {k:"photo",x:6,y:60,w:42,h:35},
                                          {k:"photo",x:52,y:60,w:42,h:35} ] },
  { key:"pt",     name:"写真と文", slots:[ {k:"photo",x:6,y:5,w:88,h:58},
                                          {k:"text", x:9,y:67,w:82,h:27} ] },
  { key:"tp",     name:"文と写真", slots:[ {k:"text", x:9,y:6,w:82,h:20},
                                          {k:"photo",x:6,y:29,w:88,h:65} ] },
  { key:"door",   name:"扉",       slots:[ {k:"text", x:13,y:33,w:74,h:34,
                                            align:"center",font:"明朝",size:1.5} ] },
  { key:"center", name:"中央1枚",  slots:[ {k:"photo",x:16,y:14,w:68,h:51},
                                          {k:"text", x:16,y:70,w:68,h:14,
                                            align:"center",size:.8,color:"薄"} ] }
];
function layOf(key) {
  for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].key === key) return LAYOUTS[i];
  return LAYOUTS[0];
}

/* =========================================================
   写真の置き場（IndexedDB）
   ★localStorage には入れない。写真1枚で数百KBあり、すぐ上限に当たる
   ========================================================= */
var Photos = (function () {
  var DB = "shashincho", STORE = "photos", conn = null, mem = {}, order = [];
  /* ★手元に抱える枚数の上限。写真1枚で数百KBあるので、
     アルバム全部を抱えるとスマホでは落ちる。古い順に手放す。
     いちどに見えるのは多くても3ページ分＝18枚なので40なら足りる */
  var MEMMAX = 40;
  /* ★手元には写真の中身（data: の長い文字列）ではなく、blob の住所（短い札）で持つ。
     data: のまま画面に書くと、1枚で約1MBの文字列を、めくるたびに読み直すことになる。
     6枚のページなら数MB。スマホでめくり始めに0.5秒以上止まっていた正体はこれ（v10で修正）。
     住所なら書くのは数十文字で、展開した絵も同じ住所どうしで使い回される */
  function toURL(data) {
    if (typeof data !== "string" || data.indexOf("data:") !== 0) return data;
    var i = data.indexOf(","), mime = (data.slice(5, i).split(";")[0]) || "image/jpeg";
    var bin = atob(data.slice(i + 1)), u = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return URL.createObjectURL(new Blob([u], { type: mime }));
  }
  function forget(id) {
    var v = mem[id];
    if (v && String(v).indexOf("blob:") === 0) { try { URL.revokeObjectURL(v); } catch (e) {} }
    delete mem[id];
    delete ready[id];
    var i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
  }
  function remember(id, data) {
    if (id in mem) { touchMem(id); return mem[id]; }
    order.push(id);
    mem[id] = toURL(data);
    while (order.length > MEMMAX) {
      var gone = order[0];
      if (gone === id) break;
      forget(gone);
    }
    return mem[id];
  }

  /* 次に出るページの写真を、めくる前に展開しておく。
     ★展開は時間がかかる（長辺2000pxで数十ms）。めくってから始めると、そのぶん止まって見える。
       展開した絵を持っておくと、同じ住所の img はすぐ描ける */
  var ready = {}, readyOrder = [], READYMAX = 24;
  function decode(ids) {
    ids.forEach(function (id) {
      var url = mem[id];
      if (!url || ready[id]) return;
      var img = new Image();
      img.decoding = "async";
      img.src = url;
      ready[id] = img;
      readyOrder.push(id);
      while (readyOrder.length > READYMAX) delete ready[readyOrder.shift()];
      if (img.decode) img.decode().catch(function () {});
    });
  }
  function touchMem(id) {
    var i = order.indexOf(id);
    if (i >= 0 && i !== order.length - 1) { order.splice(i, 1); order.push(id); }
  }
  /* ★IndexedDBが使えない所（file:// で開いた／閲覧履歴を残さない窓）でも
     動くように、手元だけに持つ形へ落ちる。次に開くと消えるのでその旨を出す */
  var noDB = false;

  function open() {
    return new Promise(function (ok, ng) {
      if (noDB) return ng(new Error("この開き方では写真を保管できません"));
      if (conn) return ok(conn);
      var req;
      try { req = indexedDB.open(DB, 1); }
      catch (e) { noDB = true; return ng(new Error("写真の置き場を開けません")); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { conn = req.result; ok(conn); };
      req.onerror = function () { noDB = true; ng(req.error || new Error("写真の置き場を開けません")); };
      req.onblocked = function () { noDB = true; ng(new Error("写真の置き場を開けません")); };
    });
  }
  function tx(mode) {
    return open().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); });
  }
  /* quiet＝手元の控えには入れない（受け取った本を何十枚もしまう時。控えを押し流さない）。
     ★置き場が使えない時だけは控えに入れる。そうしないと何も残らない */
  function put(id, data, quiet) {
    forget(id);
    if (!quiet) remember(id, data);
    return tx("readwrite").then(function (s) {
      return new Promise(function (ok, ng) {
        var r = s.put({ id: id, data: data });
        r.onsuccess = function () { ok(id); };
        r.onerror = function () { ng(r.error); };
      });
    }).catch(function () { if (quiet) remember(id, data); warnOnce(); return id; });   /* 手元には残るので続けられる */
  }
  /* 写真の中身を data: の文字列のまま取り出す（本を1冊のファイルにする時）。
     ★手元の控えは blob の住所なので使えない。置き場から直に読む。
       置き場が使えない開き方の時だけ、控えの住所から読み戻す */
  function raw(id) {
    return tx("readonly").then(function (s) {
      return new Promise(function (ok) {
        var r = s.get(id);
        r.onsuccess = function () { ok(r.result ? r.result.data : null); };
        r.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; }).then(function (v) {
      if (v) return v;
      var m = mem[id];
      if (!m) return null;
      if (String(m).indexOf("data:") === 0) return m;
      return fetch(m).then(function (r) { return r.blob(); }).then(function (b) {
        return new Promise(function (ok) {
          var fr = new FileReader();
          fr.onload = function () { ok(fr.result); };
          fr.onerror = function () { ok(null); };
          fr.readAsDataURL(b);
        });
      }).catch(function () { return null; });
    });
  }
  var warned = false;
  function warnOnce() {
    if (warned) return;
    warned = true;
    setTimeout(function () {
      toast("この開き方では写真を保管できません。閉じると消えます");
    }, 600);
  }
  function get(id) {
    if (mem[id]) return Promise.resolve(mem[id]);
    return tx("readonly").then(function (s) {
      return new Promise(function (ok) {
        var r = s.get(id);
        r.onsuccess = function () {
          var v = r.result ? r.result.data : null;
          ok(v ? remember(id, v) : null);
        };
        r.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }
  function keys() {
    return tx("readonly").then(function (s) {
      return new Promise(function (ok) {
        var r = s.getAllKeys();
        r.onsuccess = function () { ok(r.result && r.result.length ? r.result : Object.keys(mem)); };
        r.onerror = function () { ok(Object.keys(mem)); };
      });
    }).catch(function () { return Object.keys(mem); });
  }
  function cached(id) {
    var v = mem[id];
    if (v) touchMem(id);
    return v || null;
  }
  function allCached(ids) {
    for (var i = 0; i < ids.length; i++) if (ids[i] && !mem[ids[i]]) return false;
    return true;
  }
  /* 画面に出す前に、要る写真をまとめて手元へ引き上げる。
     ★置き場が答えないことがあるので待ち時間に上限を置く。
       ここで止めると画面が真っ白のまま返ってこない */
  function warm(ids) {
    var want = ids.filter(function (k) { return k && !mem[k]; });
    if (!want.length) return Promise.resolve();
    return Promise.race([
      Promise.all(want.map(get)),
      new Promise(function (ok) { setTimeout(ok, 4000); })
    ]);
  }
  /* 写真を捨てる。置き場からも手元の控えからも消す。
     ★アルバムの枠から外すのは呼ぶ側（Library.remove）の仕事。ここは実体だけ */
  function del(ids) {
    ids.forEach(function (id) { forget(id); delete thumbs[id]; });
    return tx("readwrite").then(function (s) {
      return new Promise(function (ok) {
        var left = ids.length;
        if (!left) return ok();
        ids.forEach(function (id) {
          var r = s.delete(id);
          r.onsuccess = r.onerror = function () { if (--left === 0) ok(); };
        });
      });
    }).catch(function () {});
  }

  /* 小さな見本（一覧に並べる用）。
     ★写真は1枚で長辺2000px。一覧に本物を並べると手元の上限（40枚）を超えた分が
       出なくなり、重さでスマホが落ちる。1枚ずつ縮めて、小さいほうだけ持っておく */
  var thumbs = {};
  function thumb(id) {
    if (thumbs[id]) return Promise.resolve(thumbs[id]);
    var had = !!mem[id];
    return get(id).then(function (src) {
      if (!src) return null;
      return small(src).then(function (img) {
        var S = 240, s = Math.min(1, S / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        thumbs[id] = c.toDataURL("image/jpeg", 0.8);
        /* 見本を作るためだけに引き上げた本物は、手元に残さない */
        if (!had) forget(id);
        return thumbs[id];
      }).catch(function () { return null; });
    });
  }
  /* 見本用に、縮めながら展開する。
     ★createImageBitmap は展開を画面の外（別の糸）でやるので、そのあいだ画面が止まらない。
       img で開くと長辺2000pxの展開が画面の糸で走り、1枚ごとに引っかかる */
  function small(src) {
    if (!window.createImageBitmap || !window.fetch) return loadImg(src);
    return fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
      return createImageBitmap(b, { resizeWidth: 240, resizeQuality: "medium" });
    }).catch(function () { return loadImg(src); });
  }
  function thumbCached(id) { return thumbs[id] || null; }
  return { put: put, get: get, raw: raw, keys: keys, cached: cached, allCached: allCached, warm: warm,
           del: del, thumb: thumb, thumbCached: thumbCached, decode: decode };
})();

function loadImg(src) {
  return new Promise(function (ok, ng) {
    var img = new Image();
    img.onload = function () { ok(img); };
    img.onerror = function () { ng(new Error("画像を開けませんでした")); };
    img.src = src;
  });
}

/* 写真の一覧を、見本を1枚ずつ作りながら埋めていく。
   ★全部そろうまで待たせない。出来た順に差し込む */
function fillThumbs(root) {
  var cells = $$("[data-k]", root), i = 0;
  (function next() {
    if (i >= cells.length || !document.body.contains(root)) return;
    var b = cells[i++], k = b.getAttribute("data-k");
    Photos.thumb(k).then(function (src) {
      if (src) b.querySelector("img").src = src;
      else b.classList.add("lost");
      next();
    });
  })();
}

/* =========================================================
   取り込んだ写真の整理（捨てる）
   ========================================================= */
var Library = (function () {
  /* その写真を使っているアルバム（表紙として使っている分も数える） */
  function usage() {
    var u = {};
    Store.all().forEach(function (a) {
      var ks = Store.photoKeys(a);
      if (a.cover && ks.indexOf(a.cover) < 0) ks.push(a.cover);
      ks.forEach(function (k) { (u[k] = u[k] || []).push(a.title || "無題"); });
    });
    return u;
  }

  /* 実体を捨てて、アルバムの枠からも外す。外した枠は「写真を入れる」に戻る */
  function remove(ids) {
    var gone = {};
    ids.forEach(function (k) { gone[k] = true; });
    Store.all().forEach(function (a) {
      var hit = false;
      (a.pages || []).forEach(function (p) {
        (p.items || []).forEach(function (it) {
          if (it.kind === "photo" && it.photo && gone[it.photo]) { it.photo = null; hit = true; }
        });
      });
      if (a.cover && gone[a.cover]) { delete a.cover; hit = true; }
      if (hit) a.updatedAt = today();
    });
    Store.flush();
    return Photos.del(ids);
  }

  /* 受け取った本（見るだけ）の写真。★一覧に出さない。
     ここから捨てられると、見るだけの本の中身を変えられてしまう。
     この写真は本ごとに付け替えた鍵なので、他の本とは共有していない */
  function lockedKeys() {
    var s = {};
    Store.all().forEach(function (a) {
      if (a.locked) Store.photoKeys(a).forEach(function (k) { s[k] = true; });
    });
    return s;
  }

  function open() {
    Photos.keys().then(function (keys) {
      var lk = lockedKeys();
      keys = keys.filter(function (k) { return !lk[k]; });
      var use = usage(), picked = {};
      var w = document.createElement("div");
      w.className = "modal";
      w.innerHTML = '<div class="box"><h3>取り込んだ写真</h3>'
        + '<p>' + (keys.length ? keys.length + "枚あります。ここで取り込んだ写真は、編集の「写真を選ぶ」に並びます。"
                                 + "押して選ぶと、まとめて捨てられます。"
                               : "まだ写真がありません。下の「写真を取り込む」から足せます。") + '</p>'
        + '<button class="big" data-do="add">📷 写真を取り込む（何枚でも）</button>'
        + '<div class="picks lib">' + keys.map(function (k) {
            var n = (use[k] || []).length;
            return '<button data-k="' + esc(k) + '" aria-pressed="false"'
              + ' aria-label="' + (n ? n + "冊で使用中の写真" : "使っていない写真") + '">'
              + '<img alt="">'
              + (n ? '<span class="use">' + n + '冊で使用中</span>' : "")
              + '<i class="ck"></i></button>';
          }).join("") + '</div>'
        + (keys.length ? '<button class="big ghost" data-do="unused">使っていない写真をすべて選ぶ</button>'
                       + '<button class="big bad" data-do="del" disabled>選んだ写真を捨てる</button>' : "")
        + '<button class="big ghost" data-do="close">閉じる</button></div>';
      w.onclick = function (e) { if (e.target === w) w.remove(); };
      document.body.appendChild(w);
      fillThumbs(w);

      var delBtn = $('[data-do="del"]', w);
      function count() {
        var n = Object.keys(picked).length;
        if (!delBtn) return;
        delBtn.disabled = !n;
        delBtn.textContent = n ? "選んだ" + n + "枚を捨てる" : "選んだ写真を捨てる";
      }
      function set(b, on) {
        var k = b.getAttribute("data-k");
        if (on) picked[k] = true; else delete picked[k];
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
      $$("[data-k]", w).forEach(function (b) {
        b.onclick = function () { set(b, !picked[b.getAttribute("data-k")]); count(); };
      });
      $$("[data-do]", w).forEach(function (b) {
        b.onclick = function () {
          var d = b.getAttribute("data-do");
          if (d === "close") return w.remove();
          if (d === "add") {
            /* ★ここで取り込んだ写真は、編集の「写真を選ぶ」に並ぶ */
            var f = document.createElement("input");
            f.type = "file"; f.accept = "image/*"; f.multiple = true;
            f.onchange = function () {
              var list = Array.prototype.slice.call(f.files || []), got = 0, i = 0;
              if (!list.length) return;
              (function next() {
                if (i >= list.length) {
                  toast(got + "枚を取り込みました（長辺2000pxまで縮めています）");
                  w.remove(); open(); return;
                }
                toast("取り込んでいます " + (i + 1) + " / " + list.length);
                intake(list[i++]).then(function () { got++; }, function () {}).then(next);
              })();
            };
            f.click();
            return;
          }
          if (d === "unused") {
            $$("[data-k]", w).forEach(function (x) {
              if (!(use[x.getAttribute("data-k")] || []).length) set(x, true);
            });
            count();
            if (!Object.keys(picked).length) toast("使っていない写真はありません");
            return;
          }
          if (d === "del") {
            var ids = Object.keys(picked);
            var used = ids.filter(function (k) { return (use[k] || []).length; });
            var books = {};
            used.forEach(function (k) { use[k].forEach(function (t) { books[t] = 1; }); });
            var body = ids.length + "枚を捨てます。戻せません。"
              + (used.length ? NL + NL + "そのうち" + used.length + "枚はアルバムで使っています（"
                 + Object.keys(books).slice(0, 3).join("、")
                 + (Object.keys(books).length > 3 ? " ほか" : "")
                 + "）。捨てると、その枠は空になります。" : "");
            ask("写真を捨てますか", body, [
              { label: ids.length + "枚を捨てる", kind: "bad", value: true },
              { label: "やめる", value: null }
            ]).then(function (yes) {
              if (!yes) return;
              remove(ids).then(function () {
                w.remove(); toast(ids.length + "枚を捨てました"); Shelf.render();
              });
            });
          }
        };
      });
    });
  }
  return { open: open, usage: usage, remove: remove, lockedKeys: lockedKeys };
})();

/* 端末から選んだ写真を、長辺2000pxまで縮めてから取り込む */
function intake(file) {
  return new Promise(function (ok, ng) {
    var fr = new FileReader();
    fr.onerror = function () { ng(new Error("写真を読めませんでした")); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { ng(new Error("画像の形式が分かりません")); };
      img.onload = function () {
        var MAX = 2000, s = Math.min(1, MAX / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        Photos.put(uid("u"), c.toDataURL("image/jpeg", 0.85)).then(ok).catch(ng);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* =========================================================
   アルバムの保管（localStorage）
   ★読み書きをするのはここだけ。画面から直接触らない
   ★書く前にひとつ前を写す。壊れていたらそちらで開く
   ========================================================= */
var Store = (function () {
  var K = "shashincho.demo.albums", KP = "shashincho.demo.albums.prev";
  var list = [];

  function load() {
    var raw = null, prev = null;
    try { raw = localStorage.getItem(K); prev = localStorage.getItem(KP); } catch (e) {}
    if (raw === null) return (list = []);
    try {
      var v = JSON.parse(raw);
      if (!Array.isArray(v)) throw new Error("形が違う");
      return (list = v);
    } catch (e) {
      try {
        var p = JSON.parse(prev);
        if (Array.isArray(p)) { toast("保存が壊れていたので、ひとつ前で開きました"); return (list = p); }
      } catch (e2) {}
      return (list = []);
    }
  }
  var t = null;
  /* 少し待ってまとめて書く。押すたびに書くと、指の動きに付いてこない */
  function save() {
    if (t) clearTimeout(t);
    t = setTimeout(flush, 300);
  }
  /* ★待たずに今すぐ書く。
     スマホはアプリが裏に回ると急に止められるので、
     Android の入れ物が onPause でここを呼ぶ。
     待っている途中で止められると、直前の操作がまるごと消える */
  function flush() {
    if (t) { clearTimeout(t); t = null; }
    try {
      var cur = localStorage.getItem(K);
      if (cur !== null) localStorage.setItem(KP, cur);
      localStorage.setItem(K, JSON.stringify(list));
      return "";
    } catch (e) {
      var msg = (e && e.name === "QuotaExceededError")
        ? "端末の空きが足りず保存できませんでした"
        : "保存できませんでした";
      toast(msg);
      return msg;
    }
  }
  function all() { return list; }
  function byId(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function add(a) { a.id = a.id || uid("a"); a.createdAt = a.createdAt || today();
                    a.updatedAt = today(); list.unshift(a); save(); return a; }
  function touch(a) { a.updatedAt = today(); save(); }
  function remove(id) {
    var i = list.findIndex(function (a) { return a.id === id; });
    if (i >= 0) { list.splice(i, 1); save(); }
  }
  /* このアルバムが使っている写真の鍵（表紙を選ぶときに使う） */
  function photoKeys(a) {
    var out = [];
    (a.pages || []).forEach(function (p) {
      (p.items || []).forEach(function (it) {
        if (it.kind === "photo" && it.photo && out.indexOf(it.photo) < 0) out.push(it.photo);
      });
    });
    return out;
  }
  return { load: load, save: save, flush: flush, all: all, byId: byId, add: add,
           touch: touch, remove: remove, photoKeys: photoKeys };
})();

/* =========================================================
   中身の形
   ========================================================= */
var TEXT_DECO = ["olW", "olC", "shM", "shA", "shD", "shB", "shO", "shC",
                 "bxS", "bxL", "bxR", "bxW", "bxC", "bxF"];
function item(o) {
  var it = { id: uid("i"), kind: o.k || "photo", x: o.x, y: o.y, w: o.w, h: o.h,
             rot: o.rot || 0, zi: o.zi || 1 };
  if (it.kind === "text") {
    it.text = o.text || ""; it.size = o.size || 1; it.align = o.align || "left";
    /* ★既定は「地に合わせる」。濃い台紙に足した文字がいきなり消えないように */
    it.color = o.color || "auto"; it.font = o.font || "ゴシック"; it.futo = !!o.futo;
    /* 飾り（縁取り・影・枠と地）。無いものは書かない＝前に作った文字はそのままの見た目 */
    TEXT_DECO.forEach(function (k) { if (o[k] != null) it[k] = o[k]; });
  } else if (it.kind === "line") {
    it.style = o.style || "実線"; it.lw = o.lw || 0.5; it.color = o.color || "auto";
  } else {
    it.photo = o.photo || null; it.frame = o.frame || "角";
  }
  return it;
}
function page(layout, bg, fill) {
  var L = layOf(layout);
  var p = { id: uid("p"), mode: "型", layout: layout, bg: bg || "#f8f5ef", items: [] };
  L.slots.forEach(function (s, i) {
    var o = { k: s.k, x: s.x, y: s.y, w: s.w, h: s.h, align: s.align,
              font: s.font, size: s.size, color: s.color };
    var f = (fill || [])[i];
    if (typeof f === "string") { if (s.k === "text") o.text = f; else o.photo = f; }
    else if (f && typeof f === "object") { for (var k in f) o[k] = f[k]; }
    p.items.push(item(o));
  });
  return p;
}

/* このページたちが使っている写真の鍵だけを集める。
   ★アルバム全部ではなく、いま出す分だけ。100枚のアルバムでも重くならない */
function photoKeysOf(pgs, idxs) {
  var out = [];
  (idxs || []).forEach(function (i) {
    if (i == null || i < 0 || i >= pgs.length) return;
    (pgs[i].items || []).forEach(function (it) {
      if (it.kind === "photo" && it.photo && out.indexOf(it.photo) < 0) out.push(it.photo);
    });
  });
  return out;
}
/* 手元にそろっていればそのまま、足りなければ引き上げてから描く。
   ★そろっている時に待たせない。毎回待つと、めくるたびに一瞬白くなる */
function withPhotos(keys, then) {
  if (Photos.allCached(keys)) { then(); return; }
  Photos.warm(keys).then(then);
}

/* =========================================================
   ページを1枚描く（見る画面も組む画面も、必ずここを通る）
   ★2か所で描くと「組んだ通りに見えない」が必ず起きる
   ========================================================= */
var FRCLASS = { "角": "", "丸角": "f-marukado", "丸": "f-maru", "ふち": "f-fuchi" };

/* ---------- 色 ----------
   ★色は #RRGGBB でそのまま持つ。
     前は「黒」だけ色を指定しない作りで、台紙の色をそのまま受け継いでいた。
     だから濃い台紙では黒を選んでも明るいままだった。
   ★「地に合わせる」を選んだときだけ、台紙の明るさを見て自動で決める。 */
var PAPERS = [
  ["#f8f5ef", "白"],   ["#eee7d8", "生成"], ["#e3d9c6", "砂"],   ["#d5d2cb", "薄鼠"],
  ["#2f4a5e", "藍"],   ["#2b2f36", "墨"],   ["#171717", "黒"],   ["#2a3a30", "深緑"]
];
var INKS = [
  ["auto",    "地に合わせる"],
  ["#1a1a1a", "墨黒"],   ["#4a3b2f", "焦茶"],   ["#78736b", "灰"],     ["#a8a299", "薄墨"],
  ["#ffffff", "白"],     ["#f4efe4", "生成"],   ["#2f5d7c", "藍"],     ["#27407a", "群青"],
  ["#4e8e95", "浅葱"],   ["#5e7150", "苔"],     ["#2f5240", "深緑"],   ["#8c3a3a", "臙脂"],
  ["#c0563a", "朱"],     ["#c89a3c", "山吹"],   ["#6b5b8e", "藤"]
];

/* 古い持ち方（名前）から新しい持ち方（#RRGGBB）へ。
   ★すでに作ってあるアルバムをそのまま開けるようにするため、消さない */
var OLDPAPER = { "白": "#f8f5ef", "生成": "#eee7d8", "黒": "#171717", "墨": "#2b2f36" };
var OLDINK   = { "黒": "#1a1a1a", "白": "#ffffff", "青": "#2f5d7c", "薄": "#8b8477" };

function paperOf(p) {
  var c = p && p.bg;
  if (!c) return "#f8f5ef";
  return OLDPAPER[c] || (String(c).charAt(0) === "#" ? c : "#f8f5ef");
}
function inkOf(it) {
  var c = it && it.color;
  if (!c) return "auto";
  return OLDINK[c] || (String(c).charAt(0) === "#" ? c : "auto");
}

/* 明るさ。0（真っ黒）〜1（真っ白）。
   ★人の目は緑をいちばん明るく感じるので、重みを付けて足す */
function lum(hex) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return 1;
  var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16),
      b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
/* 台紙に合わせた、読める文字の色 */
function autoInk(paper) { return lum(paper) > 0.5 ? "#20242c" : "#f2efe9"; }
/* ページ番号（控えめに） */
function nomInk(paper) {
  return lum(paper) > 0.5 ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.38)";
}

/* =========================================================
   飾り（文字の枠・飾りの線）
   ★形はここで1回だけ決める。画面（SVG）もPDF（canvas の Path2D）も、
     同じ道筋の文字列をそのまま描く。だから2か所で描いても食い違わない。
   ★寸法の単位は cqw（ページの幅の1%）。枠の大きさは
     横 = it.w、縦 = it.h ÷ RATIO（ページは縦のほうが長いので）
   ========================================================= */
var LINE_STYLES = ["実線", "破線", "点線", "二重線", "波線", "一点鎖線", "中飾り"];
var BOX_SHAPES  = [["なし", "none"], ["囲み", "box"], ["上下", "tb"], ["下線", "under"]];
var BOX_LINES   = ["実線", "破線", "点線", "二重"];
var SHADOW_DIRS = [["右下", 45], ["下", 90], ["左下", 135], ["まわり", -1]];

function f2(n) { return Math.round(n * 100) / 100; }
/* 線の模様。sw は太さ（cqw） */
function dashOf(kind, sw) {
  if (kind === "破線") return { dash: [sw * 3, sw * 2], cap: "butt" };
  if (kind === "点線") return { dash: [0.001, sw * 2], cap: "round" };
  if (kind === "一点鎖線") return { dash: [sw * 4, sw * 1.6, 0.001, sw * 1.6], cap: "round" };
  return { dash: null, cap: "butt" };
}
function rectPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return "M" + f2(x) + " " + f2(y) + "H" + f2(x + w) + "V" + f2(y + h) + "H" + f2(x) + "Z";
  return "M" + f2(x + r) + " " + f2(y) + "H" + f2(x + w - r)
    + "A" + f2(r) + " " + f2(r) + " 0 0 1 " + f2(x + w) + " " + f2(y + r) + "V" + f2(y + h - r)
    + "A" + f2(r) + " " + f2(r) + " 0 0 1 " + f2(x + w - r) + " " + f2(y + h) + "H" + f2(x + r)
    + "A" + f2(r) + " " + f2(r) + " 0 0 1 " + f2(x) + " " + f2(y + h - r) + "V" + f2(y + r)
    + "A" + f2(r) + " " + f2(r) + " 0 0 1 " + f2(x + r) + " " + f2(y) + "Z";
}
function hline(x1, x2, y) { return "M" + f2(x1) + " " + f2(y) + "H" + f2(x2); }

/* 文字の地と枠。返すのは描く物の並び {d, fill} か {d, sw, dash, cap, stroke} */
function boxShapes(it, W, H, ink) {
  var out = [], shape = it.bxS || "none";
  var r = it.bxR ? Math.min(3, W / 6, H / 6) : 0;
  if (it.bxF && it.bxF !== "none") out.push({ d: rectPath(0, 0, W, H, r), fill: it.bxF });
  if (shape === "none") return out;
  var sw = it.bxW || 0.4, kind = it.bxL || "実線";
  var col = (!it.bxC || it.bxC === "auto") ? ink : it.bxC;
  var dbl = kind === "二重", pat = dashOf(kind, sw);
  var insets = dbl ? [sw / 2, sw * 2.5] : [sw / 2];
  insets.forEach(function (i) {
    var d;
    if (shape === "box") d = rectPath(i, i, W - 2 * i, H - 2 * i, Math.max(0, r - i));
    else if (shape === "tb") d = hline(0, W, i) + hline(0, W, H - i);
    else d = hline(0, W, H - i);
    out.push({ d: d, sw: sw, dash: pat.dash, cap: pat.cap, stroke: col });
  });
  return out;
}
/* 枠を付けたときの内側の余白（cqw） */
function boxPad(it) {
  var has = (it.bxS && it.bxS !== "none") || (it.bxF && it.bxF !== "none");
  if (!has) return 0;
  var sw = (it.bxS && it.bxS !== "none") ? (it.bxW || 0.4) : 0;
  return f2(sw * (it.bxL === "二重" ? 3 : 1) + 1.8);
}
/* 線を引くのに要る高さ（ページの高さに対する％）。太くしても上下が切れないように */
function lineNeedH(it) {
  var sw = it.lw || 0.5;
  var need = it.style === "中飾り" ? sw * 2 + 3.2 : it.style === "波線" ? sw * 5 + 1.8 : sw * 4 + 2;
  return Math.max(3, Math.round(need * RATIO * 10) / 10);
}
/* 飾りの線 */
function lineShapes(it, W, H, col) {
  var sw = it.lw || 0.5, st = it.style || "実線", y = H / 2, out = [];
  var pat = dashOf(st, sw);
  var a = pat.cap === "round" ? sw / 2 : 0, b = W - a;
  if (st === "二重線") {
    out.push({ d: hline(0, W, y - sw), sw: sw * 0.8, stroke: col, cap: "butt" });
    out.push({ d: hline(0, W, y + sw), sw: sw * 0.8, stroke: col, cap: "butt" });
  } else if (st === "波線") {
    var A = sw * 1.4 + 0.5, L = A * 4, d = "M" + f2(sw / 2) + " " + f2(y), x = sw / 2, up = true;
    var end = W - sw / 2;
    while (x < end - 0.01) {
      var nx = Math.min(end, x + L / 2), half = nx - x;
      d += "Q" + f2(x + half / 2) + " " + f2(up ? y - A * 2 * (half / (L / 2)) : y + A * 2 * (half / (L / 2)))
        + " " + f2(nx) + " " + f2(y);
      x = nx; up = !up;
    }
    out.push({ d: d, sw: sw, stroke: col, cap: "round" });
  } else if (st === "中飾り") {
    var s = sw * 2 + 1.2, cx = W / 2, gap = s * 0.9;
    out.push({ d: hline(0, cx - gap - s * 0.2, y) + hline(cx + gap + s * 0.2, W, y), sw: sw, stroke: col, cap: "butt" });
    out.push({ d: "M" + f2(cx) + " " + f2(y - s) + "L" + f2(cx + s) + " " + f2(y) + "L" + f2(cx) + " "
      + f2(y + s) + "L" + f2(cx - s) + " " + f2(y) + "Z", fill: col });
  } else {
    out.push({ d: hline(a, b, y), sw: sw, dash: pat.dash, cap: pat.cap, stroke: col });
  }
  return out;
}
function lineInk(it, paper) { var c = inkOf(it); return c === "auto" ? autoInk(paper) : c; }

function svgOf(shapes, W, H) {
  if (!shapes.length) return "";
  return '<svg class="deco" viewBox="0 0 ' + f2(W) + " " + f2(H) + '" preserveAspectRatio="none" aria-hidden="true">'
    + shapes.map(function (s) {
        if (s.fill) return '<path d="' + s.d + '" fill="' + esc(s.fill) + '"/>';
        return '<path d="' + s.d + '" fill="none" stroke="' + esc(s.stroke) + '" stroke-width="' + f2(s.sw) + '"'
          + ' stroke-linecap="' + (s.cap || "butt") + '"'
          + (s.dash ? ' stroke-dasharray="' + s.dash.map(function (v) { return f2(v) || 0.001; }).join(" ") + '"' : "")
          + '/>';
      }).join("") + '</svg>';
}
/* canvas へ。g は枠の左上に原点、1 = 1cqw に合わせてから呼ぶ */
function paintShapes(g, shapes) {
  shapes.forEach(function (s) {
    var p = new Path2D(s.d);
    g.save();
    if (s.fill) { g.fillStyle = s.fill; g.fill(p); }
    else {
      g.strokeStyle = s.stroke; g.lineWidth = s.sw; g.lineCap = s.cap || "butt";
      g.setLineDash(s.dash ? s.dash.map(function (v) { return f2(v) || 0.001; }) : []);
      g.stroke(p);
    }
    g.restore();
  });
}

/* 文字の影。既定（shM なし）は前と同じ「明るい文字にだけ薄く敷く」 */
function hexA(hex, a) {
  var h = String(hex || "#000000").replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + ","
    + parseInt(h.slice(4, 6), 16) + "," + a + ")";
}
function shadowOf(it, real) {
  var m = it.shM || "auto";
  if (m === "none") return null;
  if (m === "auto") return lum(real) > 0.6 ? { dx: 0, dy: 0.2, blur: 0.8, color: "rgba(0,0,0,.55)" } : null;
  var D = it.shD == null ? 0.6 : it.shD, dir = it.shA == null ? 45 : it.shA;
  var dx = dir < 0 ? 0 : f2(Math.cos(dir * Math.PI / 180) * D);
  var dy = dir < 0 ? 0 : f2(Math.sin(dir * Math.PI / 180) * D);
  return { dx: dx, dy: dy, blur: it.shB == null ? 0.8 : it.shB,
           color: hexA(it.shC || "#000000", it.shO == null ? 0.5 : it.shO) };
}
/* 縁取りの色。「自動」は文字の色の反対（明るい字には濃い縁、濃い字には白い縁） */
function edgeInk(it, real) {
  if (it.olC && it.olC !== "auto") return it.olC;
  return lum(real) > 0.5 ? "#1a1a1a" : "#ffffff";
}
function textInk(it, paper) { var c = inkOf(it); return c === "auto" ? autoInk(paper) : c; }

/* 文字の枠そのものに付く書式（位置以外）。itemHTML と、動かしている最中の live() で共用 */
function textCss(it, paper) {
  var pad = boxPad(it);
  return "text-align:" + (it.align || "left") + ";font-size:" + (4.2 * (it.size || 1)) + "cqw;"
    + "color:" + textInk(it, paper) + ";" + (pad ? "padding:" + pad + "cqw;" : "");
}
/* 字そのものに付く書式（縁取りと影） */
function glyphCss(it, real) {
  var s = "", sh = shadowOf(it, real);
  s += "text-shadow:" + (sh ? sh.dx + "cqw " + sh.dy + "cqw " + sh.blur + "cqw " + sh.color : "none") + ";";
  if (it.olW > 0) {
    s += "-webkit-text-stroke:" + f2(it.olW * 2) + "cqw " + edgeInk(it, real) + ";paint-order:stroke fill;";
  }
  return s;
}

/* 写真を枠の中でどこに寄せ、どれだけ大きくするか。
   px/py＝寄せる位置（0〜100、50がまん中）、pz＝大きさ（1＝枠いっぱい）。
   ★画面は object-position と scale、PDF は PdfOut.cover が同じ式で描く（式を変えたら両方） */
function photoPos(it) {
  return { x: it.px == null ? 50 : it.px, y: it.py == null ? 50 : it.py, z: it.pz == null ? 1 : it.pz };
}
function imgCss(it) {
  var q = photoPos(it);
  if (q.x === 50 && q.y === 50 && q.z === 1) return "";
  return "object-position:" + q.x + "% " + q.y + "%;"
    + (q.z !== 1 ? "transform:scale(" + q.z + ");transform-origin:" + q.x + "% " + q.y + "%;" : "");
}

function itemHTML(it, paper, small) {
  var st = "left:" + it.x + "%;top:" + it.y + "%;width:" + it.w + "%;height:" + it.h + "%;"
    + (it.rot ? "transform:rotate(" + it.rot + "deg);" : "")
    + "z-index:" + (it.zi || 1) + ";";
  var id = ' data-id="' + esc(it.id) + '"';
  var Wc = it.w, Hc = it.h / RATIO;
  if (it.kind === "text") {
    var real = textInk(it, paper);
    var cls = "it tx " + (it.font === "明朝" ? "mincho " : "") + (it.futo ? "futo " : "");
    st += textCss(it, paper);
    return '<div class="' + cls + '"' + id + ' style="' + st + '">'
      + svgOf(boxShapes(it, Wc, Hc, real), Wc, Hc)
      + '<span class="tt" style="' + glyphCss(it, real) + '">' + esc(it.text || "") + '</span></div>';
  }
  if (it.kind === "line") {
    return '<div class="it ln"' + id + ' style="' + st + '">'
      + svgOf(lineShapes(it, Wc, Hc, lineInk(it, paper)), Wc, Hc) + '</div>';
  }
  /* small＝ページ帯の見本。本物（長辺2000px）を46pxに縮めて描くと、展開だけで重い */
  var src = it.photo ? (small ? Photos.thumbCached(it.photo) : Photos.cached(it.photo)) : null;
  var ic = imgCss(it);
  /* ★img は .fit で包む。大きくした写真を「ふち」の白い所にはみ出させないため
     （.it の overflow:hidden は余白の外側で切るので、ふちの上まで写真が出てしまう） */
  var inner = src ? '<div class="fit"><img src="' + src + '" alt="" decoding="async"' + (ic ? ' style="' + ic + '"' : "") + '></div>'
                  : '<div class="none">写真を入れる</div>';
  return '<div class="it ph ' + (FRCLASS[it.frame] || "") + '"' + id + ' style="' + st + '">'
    + inner + '</div>';
}
function pageHTML(p, num, small) {
  var paper = paperOf(p);
  var items = (p.items || []).slice().sort(function (a, b) { return (a.zi || 1) - (b.zi || 1); });
  return '<div class="page" style="background:' + paper + ';color:' + autoInk(paper) + '">'
    + items.map(function (it) { return itemHTML(it, paper, small); }).join("")
    + (num ? '<div class="nom" style="color:' + nomInk(paper) + '">' + num + '</div>' : "")
    + '</div>';
}

/* =========================================================
   装丁（表紙のデザイン）
   ★選ぶと表紙と裏表紙が対になって付く。裏表紙は表紙を左右反転した絵
     （本を裏返すと背が右に来るので）。絵は img/make_binding.py で作る
   ★表紙と裏表紙はページではない（a.pages には入れない）。
     ページ番号・組む画面・ページ帯には出ず、本棚・見る・PDF にだけ出る
   ========================================================= */
var BINDINGS = [
  { key: "kon", name: "紺の革", front: "img/binding/kon_front.jpg", back: "img/binding/kon_back.jpg",
    shelf: "img/binding/kon_shelf.webp", ink: "#e9c76c" },
  { key: "aka", name: "赤の革", front: "img/binding/aka_front.jpg", back: "img/binding/aka_back.jpg",
    shelf: "img/binding/aka_shelf.webp", ink: "#ecc873" }
];
function bindingOf(a) {
  var k = a && a.binding;
  for (var i = 0; i < BINDINGS.length; i++) if (BINDINGS[i].key === k) return BINDINGS[i];
  return null;
}
/* 見る画面とPDFで使う並び。装丁があれば前後に表紙・裏表紙を足す */
function readSeq(a) {
  var b = bindingOf(a), pg = (a && a.pages) || [];
  if (!b) return pg;
  return [{ cover: "front" }].concat(pg, [{ cover: "back" }]);
}
/* 表紙の題名。★書式は PdfOut.drawCover と必ず合わせる */
var COVER_T = { size: 6.6, lh: 1.5, ls: 0.12, top: 46, width: 70 };
function coverHTML(a, side) {
  var b = bindingOf(a);
  if (!b) return '<div class="page blank"></div>';
  return '<div class="page cover" style="background-image:url(\'' + (side === "back" ? b.back : b.front) + '\')">'
    + (side === "front" && a.title
        ? '<div class="ctitle" style="color:' + b.ink + '">' + esc(a.title) + '</div>' : "")
    + '</div>';
}

/* =========================================================
   見本の写真（この端末の中で描いている。外から取ってきていない）
   本番ではここが端末の写真フォルダになる
   ========================================================= */
function drawSample(kind, seed) {
  var W = 900, H = 675;
  var c = document.createElement("canvas"); c.width = W; c.height = H;
  var g = c.getContext("2d");
  var rnd = (function (s) {
    return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  })(seed * 7919 + 13);

  function sky(a, b) {
    var lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, a); lg.addColorStop(1, b);
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
  }
  function hills(y, col, n) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H); g.lineTo(0, y);
    for (var x = 0; x <= W; x += W / n) {
      g.lineTo(x, y - Math.sin((x / W) * Math.PI * n * 0.55 + seed) * (H * 0.09) - rnd() * H * 0.04);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }

  if (kind === "umi") {
    sky("#8fb6cf", "#e4d9c4");
    g.fillStyle = "#3f6a86"; g.fillRect(0, H * 0.58, W, H * 0.42);
    g.fillStyle = "#ffffff30";
    for (var i = 0; i < 40; i++) g.fillRect(rnd() * W, H * 0.6 + rnd() * H * 0.38, 30 + rnd() * 90, 1.6);
    g.fillStyle = "#f6efdf"; g.beginPath(); g.arc(W * 0.72, H * 0.24, 46, 0, 7); g.fill();
  } else if (kind === "yama") {
    sky("#cfd9e2", "#f0e6d2");
    hills(H * 0.44, "#7d8c99", 3); hills(H * 0.58, "#4e5d6b", 4); hills(H * 0.72, "#2f3a45", 5);
  } else if (kind === "machi") {
    sky("#f3d9b2", "#c98f6a");
    g.fillStyle = "#3a2f2c";
    for (var b = 0; b < 16; b++) {
      var bw = 40 + rnd() * 80, bh = H * (0.2 + rnd() * 0.42), bx = b * (W / 15) - 20;
      g.fillRect(bx, H - bh, bw, bh);
      g.fillStyle = "#ffd9812e";
      for (var w = 0; w < 14; w++) {
        if (rnd() > 0.55) g.fillRect(bx + 7 + (w % 3) * 13, H - bh + 12 + Math.floor(w / 3) * 22, 8, 12);
      }
      g.fillStyle = "#3a2f2c";
    }
  } else if (kind === "hana") {
    sky("#e8efe2", "#cddbc6");
    for (var f = 0; f < 90; f++) {
      g.fillStyle = ["#e7a6b4", "#f2dfe3", "#c98ca0", "#fbf3f1"][Math.floor(rnd() * 4)];
      g.globalAlpha = 0.5 + rnd() * 0.5;
      g.beginPath(); g.arc(rnd() * W, rnd() * H, 6 + rnd() * 26, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  } else if (kind === "mado") {
    sky("#2b3542", "#151b23");
    g.fillStyle = "#e9d7a8";
    g.fillRect(W * 0.18, H * 0.16, W * 0.28, H * 0.5);
    g.fillRect(W * 0.56, H * 0.24, W * 0.22, H * 0.4);
    g.fillStyle = "#151b23";
    g.fillRect(W * 0.31, H * 0.16, 7, H * 0.5);
    g.fillRect(W * 0.18, H * 0.4, W * 0.28, 7);
    g.fillRect(W * 0.665, H * 0.24, 6, H * 0.4);
  } else if (kind === "cha") {
    sky("#efe4d2", "#d9c7ab");
    g.fillStyle = "#c6b193";
    g.beginPath(); g.ellipse(W * 0.5, H * 0.66, W * 0.3, H * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = "#f7f3ea";
    g.beginPath(); g.ellipse(W * 0.5, H * 0.54, W * 0.17, H * 0.13, 0, 0, 7); g.fill();
    g.fillStyle = "#6b4a2e";
    g.beginPath(); g.ellipse(W * 0.5, H * 0.52, W * 0.14, H * 0.1, 0, 0, 7); g.fill();
  } else if (kind === "michi") {
    sky("#b9cfd8", "#e9e0cd");
    g.fillStyle = "#8a9a86"; g.fillRect(0, H * 0.55, W, H * 0.45);
    g.fillStyle = "#cfc6b2";
    g.beginPath(); g.moveTo(W * 0.42, H * 0.55); g.lineTo(W * 0.58, H * 0.55);
    g.lineTo(W * 0.92, H); g.lineTo(W * 0.08, H); g.closePath(); g.fill();
    g.fillStyle = "#4a5a4a";
    for (var t2 = 0; t2 < 7; t2++) {
      var tx = t2 % 2 ? W * (0.1 + rnd() * .1) : W * (0.82 + rnd() * .1);
      g.fillRect(tx, H * 0.35, 9, H * 0.28);
      g.beginPath(); g.arc(tx + 4, H * 0.35, 34 + rnd() * 16, 0, 7); g.fill();
    }
  } else {
    sky("#d7cfc0", "#b4a894");
    g.fillStyle = "#877a66"; g.beginPath(); g.arc(W * 0.5, H * 0.55, H * 0.28, 0, 7); g.fill();
  }

  var im = g.getImageData(0, 0, W, H), d = im.data;
  for (var p = 0; p < d.length; p += 4) {
    var n = (Math.random() - 0.5) * 13;
    d[p] += n; d[p + 1] += n; d[p + 2] += n;
  }
  g.putImageData(im, 0, 0);
  var vg = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.82);
  vg.addColorStop(0, "#0000"); vg.addColorStop(1, "#00000045");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c.toDataURL("image/jpeg", 0.82);
}

var SAMPLE_KINDS = ["umi", "yama", "machi", "hana", "mado", "cha", "michi", "umi"];
function seedSamples() {
  return Promise.all(SAMPLE_KINDS.map(function (k, i) {
    return Photos.put("s" + (i + 1), drawSample(k, i + 1));
  })).catch(function () {});
}
function sampleAlbum() {
  return {
    title: "島の三日", pages: [
      page("door", "生成", ["島の三日" + NL + NL + "二〇二六年 八月"]),
      page("fullcap", "白", ["s1", { text: "朝いちばんの便" + NL + "港は誰もいなかった",
                                     color: "白", font: "明朝" }]),
      page("v2", "白", ["s7", "s2"]),
      page("pt", "白", ["s4", { text: "坂の途中でずっと同じ花が咲いていた。名前は誰も知らないという。",
                                font: "明朝" }]),
      page("g4", "生成", ["s6", "s3", "s5", "s8"]),
      page("big2", "白", ["s2", "s4", "s6"]),
      { id: uid("p"), mode: "自由", layout: "free", bg: "墨", items: [
        item({ k: "photo", x: 8, y: 9, w: 52, h: 36, photo: "s3", rot: -3, frame: "ふち", zi: 1 }),
        item({ k: "photo", x: 46, y: 33, w: 46, h: 33, photo: "s5", rot: 4, frame: "ふち", zi: 2 }),
        item({ k: "photo", x: 14, y: 52, w: 34, h: 30, photo: "s7", rot: 2, frame: "ふち", zi: 3 }),
        item({ k: "text", x: 52, y: 72, w: 40, h: 16, text: "三日目、" + NL + "帰りの船で",
               color: "白", font: "明朝", size: 1.05, zi: 4 })
      ] },
      page("center", "白", ["s1", "おわり"])
    ]
  };
}

/* =========================================================
   小さな窓（たずねる／名前を入れる）
   ========================================================= */
function ask(title, body, buttons) {
  return new Promise(function (done) {
    var w = document.createElement("div");
    w.className = "modal";
    w.innerHTML = '<div class="box"><h3>' + esc(title) + '</h3>'
      + (body ? '<p>' + esc(body).split(NL).join("<br>") + '</p>' : "")
      + '<div class="btns"></div></div>';
    var bs = $(".btns", w);
    (buttons || [{ label: "OK", value: true }]).forEach(function (b) {
      var e = document.createElement("button");
      e.type = "button"; e.className = "big " + (b.kind || "ghost");
      e.textContent = b.label;
      e.onclick = function () { w.remove(); done(b.value); };
      bs.appendChild(e);
    });
    w.onclick = function (e) { if (e.target === w) { w.remove(); done(null); } };
    document.body.appendChild(w);
  });
}
/* ★入力欄は自動入力よけを付ける。端末の住所や電話が候補に出る事故を防ぐ */
function askName(title, value, okLabel) {
  return new Promise(function (done) {
    var w = document.createElement("div");
    w.className = "modal";
    w.innerHTML = '<div class="box"><h3>' + esc(title) + '</h3>'
      + '<input type="text" id="nm" value="' + esc(value || "") + '" maxlength="40" '
      + 'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" '
      + 'data-lpignore="true" data-1p-ignore name="' + uid("f") + '">'
      + '<div style="height:10px"></div>'
      + '<button class="big" id="ok">' + esc(okLabel || "決める") + '</button>'
      + '<button class="big ghost" id="no">やめる</button></div>';
    w.onclick = function (e) { if (e.target === w) { w.remove(); done(null); } };
    document.body.appendChild(w);
    var inp = $("#nm", w);
    $("#ok", w).onclick = function () { var v = inp.value.trim(); w.remove(); done(v || null); };
    $("#no", w).onclick = function () { w.remove(); done(null); };
    inp.onkeydown = function (e) { if (e.key === "Enter") $("#ok", w).click(); };
    setTimeout(function () { inp.focus(); inp.select(); }, 40);
  });
}

/* =========================================================
   本棚
   ========================================================= */
var Shelf = (function () {
  /* ★本棚の表紙は「1ページ目そのもの」。写真を選んで表紙にする仕組みは v14 でやめた
     （選ばないと変わらないのが分かりにくかった）。1ページ目を直せば本棚の表紙も変わる */
  function coverKeys(a) { return photoKeysOf(a.pages || [], [0]); }
  /* 表紙のデザインを選んでいない本は、布張りの本にする。色は本ごとに決まる（名前ではなく id で） */
  var CLOTHS = ["#2f4a5e", "#5c2f2f", "#3d4f3a", "#6b5a44", "#3a3a48", "#4f3b5c", "#7a5d3a", "#2e4f52"];
  function clothOf(a) {
    var h = 0, k = String(a.id || "");
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return CLOTHS[h % CLOTHS.length];
  }
  /* 1冊の本（表紙）。★題名は表紙に載せない（名札に出す） */
  function bookFace(a) {
    var bd = bindingOf(a);
    if (bd) return '<img class="leather" src="' + bd.shelf + '" alt="">';
    var p0 = (a.pages || [])[0];
    return '<span class="cloth" style="--cl:' + clothOf(a) + '">'
      + '<i class="spine"></i>'
      /* 背を除いた表紙いっぱいに、1ページ目をそのまま描く（見る画面と同じ描き方） */
      + (p0 ? '<span class="face">' + pageHTML(p0, 0) + '</span>' : '<span class="emb">帖</span>')
      + '</span>';
  }
  /* 1段に何冊並べるか。画面の幅から決める（1冊の幅は 96〜150px） */
  function layout() {
    var box = $("#shelf");
    /* 使える幅＝画面−左右の余白32−柱と内側の余白（14＋14）×2−段の余白8 */
    var cw = Math.min(1040, (box.clientWidth || 360) - 32) - 64;
    var gap = cw < 420 ? 14 : 22;
    var cols = Math.max(2, Math.floor((cw + gap) / (cw < 420 ? 96 + gap : 128 + gap)));
    var bw = Math.min(150, Math.floor((cw - gap * (cols - 1)) / cols));
    return { cols: cols, bw: bw, bh: Math.round(bw / 0.85), gap: gap };
  }
  function render() {
    var list = Store.all();
    var want = [];
    list.forEach(function (a) { if (!bindingOf(a)) want = want.concat(coverKeys(a)); });
    return Photos.warm(want).then(function () {
      var L = layout();
      var h = ['<div class="shelfhead"><h2>本棚</h2><p>'
        + (list.length ? list.length + "冊" : "まだ1冊もありません")
        + '<span class="ver">' + esc(buildMark()) + '</span></p>'
        + '<span class="hbtns">'
        + (window.Ios && Ios.isIos() && !Ios.inApk() ? '<button class="mini" id="iosuse">📱 iPhoneで使う</button>' : "")
        + '<button class="mini" id="receive">本を受け取る</button>'
        + '<button class="mini" id="library">取り込んだ写真</button></span></div>'];
      var cells = list.map(function (a) {
        return '<div class="bk">'
          + '<button class="book" data-open="' + a.id + '" aria-label="' + esc(a.title || "無題") + 'を開く">'
          + bookFace(a) + '</button>'
          + '<div class="plate"><b>' + esc(a.title || "無題") + '</b>'
          + '<span>' + (a.pages || []).length + 'ページ' + (a.locked ? '・見るだけ' : '') + '</span>'
          + '<button class="ed" data-menu="' + a.id + '" aria-label="' + esc(a.title || "無題") + 'のメニュー">…</button>'
          + '</div></div>';
      });
      cells.push('<div class="bk"><button class="book newbook" id="newbook"><b>＋</b>新しい<br>アルバム</button>'
        + '<div class="plate vacant"></div></div>');
      /* 段ごとに分ける。棚板は段ごとに1枚 */
      h.push('<div class="case" style="--bw:' + L.bw + 'px;--bh:' + L.bh + 'px;--gap:' + L.gap + 'px">');
      for (var r = 0; r < cells.length; r += L.cols) {
        h.push('<div class="tier"><div class="shrow">' + cells.slice(r, r + L.cols).join("") + '</div>'
          + '<div class="board" aria-hidden="true"></div></div>');
      }
      h.push('</div>');
      $("#shelf").innerHTML = h.join("");
      bind();
    });
  }
  function bind() {
    $$("#shelf [data-open]").forEach(function (b) {
      b.onclick = function () { App.open(b.getAttribute("data-open"), "read"); };
    });
    $$("#shelf [data-menu]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); menu(b.getAttribute("data-menu")); };
    });
    $("#library").onclick = function () { Library.open(); };
    $("#receive").onclick = function () { BookFile.receive(); };
    if ($("#iosuse")) $("#iosuse").onclick = function () { Ios.guide(); };
    $("#newbook").onclick = function () {
      askName("新しいアルバム", "", "作る").then(function (name) {
        if (!name) return;
        var a = Store.add({ title: name, pages: [page("door", "生成", [name])] });
        App.open(a.id, "make");
      });
    };
  }
  /* 受け取った本（見るだけ）の「…」。
     ★組む・名前を変える・表紙のデザイン・丸ごと写す は出さない。
       「写す」を残すと、写しのほうは組めてしまう */
  function lockedMenu(a) {
    ask(a.title || "無題", (a.pages || []).length + "ページ　受け取った本（見るだけ）" + NL
      + "編集や名前の変更はできません。" + (a.gotAt ? NL + "受け取った日 " + a.gotAt : ""), [
      { label: "見る", kind: "", value: "read" },
      { label: "PDFにする", value: "pdf" },
      { label: "1冊のファイルにする（渡す）", value: "file" },
      { label: "この1冊を捨てる", kind: "bad", value: "del" },
      { label: "やめる", value: null }
    ]).then(function (v) {
      if (v === "read") return App.open(a.id, "read");
      if (v === "pdf") return PdfOut.start(a);
      if (v === "file") return BookFile.start(a);
      if (v === "del") {
        return ask("「" + (a.title || "無題") + "」を捨てますか",
          "戻せません。受け取った本なので、中の写真も一緒に消えます。" + NL
          + "もう一度見たいときは、受け取ったファイルから入れ直してください。", [
          { label: "捨てる", kind: "bad", value: true },
          { label: "やめる", value: null }
        ]).then(function (yes) {
          if (!yes) return;
          /* ★中の写真も消す。一覧に出ないので、残すと誰にも消せないまま端末を埋める。
             念のため、他の本が使っている写真は残す */
          var mine = Store.photoKeys(a);
          Store.remove(a.id);
          var use = Library.usage();
          var gone = mine.filter(function (k) { return !(use[k] || []).length; });
          Store.flush();
          Photos.del(gone).then(function () { render(); toast("捨てました"); });
        });
      }
    });
  }
  function menu(id) {
    var a = Store.byId(id);
    if (!a) return;
    if (a.locked) return lockedMenu(a);
    ask(a.title || "無題", (a.pages || []).length + "ページ" + NL + "更新 " + (a.updatedAt || "—"), [
      { label: "✏️ 編集する", kind: "", value: "edit" },
      { label: "名前を変える", value: "rename" },
      { label: "表紙のデザイン", value: "binding" },
      { label: "PDFにする", value: "pdf" },
      { label: "1冊のファイルにする（渡す）", value: "file" },
      { label: "丸ごと写す", value: "dup" },
      { label: "この1冊を捨てる", kind: "bad", value: "del" },
      { label: "やめる", value: null }
    ]).then(function (v) {
      if (v === "edit") return App.open(id, "make");
      if (v === "pdf") return PdfOut.start(a);
      if (v === "file") return BookFile.start(a);
      if (v === "binding") {
        return ask("表紙のデザイン", "選ぶと、表紙と裏表紙が対になって付きます。" + NL
          + "見る画面とPDFの最初と最後に出ます（ページの数には入りません）。",
          [{ label: "なし（写真の表紙）", value: "none" }].concat(BINDINGS.map(function (b) {
            return { label: b.name + (a.binding === b.key ? "（いま選んでいます）" : ""), value: b.key };
          }), [{ label: "やめる", value: null }])).then(function (k) {
            if (!k) return;
            if (k === "none") delete a.binding; else a.binding = k;
            Store.touch(a); render();
            toast(k === "none" ? "表紙のデザインを外しました" : "表紙と裏表紙を付けました");
          });
      }
      if (v === "rename") {
        return askName("アルバムの名前", a.title, "変える").then(function (n) {
          if (!n) return; a.title = n; Store.touch(a); render();
        });
      }
      if (v === "dup") {
        var c = JSON.parse(JSON.stringify(a));
        delete c.id; delete c.createdAt;
        c.title = a.title + "（写し）";
        c.pages.forEach(function (p) {
          p.id = uid("p"); p.items.forEach(function (x) { x.id = uid("i"); });
        });
        Store.add(c); render(); toast("写しました");
        return;
      }
      if (v === "del") {
        return ask("「" + (a.title || "無題") + "」を捨てますか",
          "戻せません。中の写真は他のアルバムでも使えるので残します。", [
          { label: "捨てる", kind: "bad", value: true },
          { label: "やめる", value: null }
        ]).then(function (yes) {
          if (!yes) return;
          Store.remove(id); render(); toast("捨てました");
        });
      }
    });
  }
  return { render: render };
})();

/* =========================================================
   見る画面
   ========================================================= */
var Read = (function () {
  var idx = 0, sp = 0, busy = false, manual = null, el = {};

  function A() { return App.album(); }
  /* ★見る画面の並びは readSeq（装丁があれば 表紙＋ページ＋裏表紙）。ページの添字とはずれる */
  function pages() { return A() ? readSeq(A()) : []; }
  function off() { return bindingOf(A()) ? 1 : 0; }
  function isCover(i) { var q = pages()[i]; return !!(q && q.cover); }
  function label(i) {
    var q = pages()[i];
    if (!q) return "";
    if (q.cover) return q.cover === "front" ? "表紙" : "裏表紙";
    return String(i + 1 - off());
  }
  function land() {
    try { return matchMedia("(orientation:landscape)").matches; }
    catch (e) { return innerWidth > innerHeight; }
  }
  function yoko() { return manual === null ? land() : manual; }

  /* 見開きは「1ページ目だけ右に置く」＝表紙をめくった形。
     ★裏表紙は必ず左に1枚だけで置く（本を閉じる手前の形） */
  function spreads() {
    var out = [[null, 0]], n = pages().length, last = n;
    if (bindingOf(A())) last = n - 1;
    for (var i = 1; i < last; i += 2) out.push([i, i + 1 < last ? i + 1 : null]);
    if (last < n) out.push([last, null]);
    return out;
  }
  function faceHTML(i) {
    if (i == null || i < 0 || i >= pages().length) return '<div class="page blank"></div>';
    var q = pages()[i];
    if (q.cover) return coverHTML(A(), q.cover);
    return pageHTML(q, i + 1 - off());
  }

  function render() {
    if (!A()) return;
    withPhotos(photoKeysOf(pages(), [idx - 1, idx, idx + 1]), draw);
  }
  function draw() {
    if (!A()) return;
    var st = $("#stage");
    if (yoko()) drawYoko(st); else drawTate(st);
    $("#mode").textContent = yoko() ? "1ページずつ読む" : "見開きで読む";
    $("#hint").textContent = yoko()
      ? "左右にはらうとページがめくれます（← → キーでも）"
      : "上へはらうと紙がめくれます（↑ ↓ キーでも）";
  }

  function drawTate(st) {
    st.innerHTML = '<div id="tate"><div class="hold">'
      + '<div class="cur"></div>'
      + '<div class="flip" hidden><div class="face front"></div><div class="face back"></div></div>'
      + '</div></div>';
    el = { hold: $(".hold", st), cur: $(".cur", st), flip: $(".flip", st),
           f: $(".face.front", st), b: $(".face.back", st) };
    if (idx >= pages().length) idx = pages().length - 1;
    if (idx < 0) idx = 0;
    fitBox(st, el.hold, RATIO);
    paint(); drag();
  }
  /* 中身を、作り直さずに別の場所へ移す（めくっていた紙の表を、下の紙へ）。影は置いていく */
  function moveKids(from, to) {
    var keep = Array.prototype.filter.call(from.childNodes, function (n) {
      return !(n.classList && n.classList.contains("shade"));
    });
    to.replaceChildren.apply(to, keep);
  }
  function paint() {
    el.cur.innerHTML = faceHTML(idx);
    labels();
  }
  function labels() {
    $("#pn").textContent = isCover(idx) ? label(idx)
      : label(idx) + " / " + (pages().length - 2 * off());
    $("#prev").disabled = idx <= 0;
    $("#home").disabled = idx <= 0;
    $("#next").disabled = idx >= pages().length - 1;
    ahead([idx - 2, idx - 1, idx + 1, idx + 2]);
  }
  /* めくる前に、次に出る分を裏で取っておく */
  function ahead(idxs) {
    var k = photoKeysOf(pages(), idxs);
    if (!k.length) return;
    if (Photos.allCached(k)) Photos.decode(k);
    else Photos.warm(k).then(function () { Photos.decode(k); });
  }
  function shade(v) { $$(".shade", el.flip).forEach(function (s) { s.style.opacity = v; }); }
  /* ★めくる紙の表は、いま見えている紙をそのまま移す（作り直さない）。
     作り直すのは新しく出てくる1枚だけ */
  function prep(dir) {
    if (dir > 0) {
      moveKids(el.cur, el.f);
      el.f.insertAdjacentHTML("beforeend", '<div class="shade"></div>');
      el.cur.innerHTML = faceHTML(idx + 1);
    } else {
      el.f.innerHTML = faceHTML(idx - 1) + '<div class="shade"></div>';
    }
    el.b.innerHTML = '<div class="shade"></div>';
    el.flip.hidden = false;
    el.flip.classList.remove("anim");
    el.flip.style.transform = "rotateX(" + (dir > 0 ? 0 : 180) + "deg)";
    shade(dir > 0 ? 0 : .5);
  }
  function settle(dir, done) {
    var fired = false;
    var fin = function () {
      if (fired) return; fired = true;
      el.flip.removeEventListener("transitionend", fin);
      el.flip.hidden = true; el.flip.classList.remove("anim");
      /* 下の紙に正しい1枚を置く。進んだ時はもう置いてある。
         戻った時・めくるのをやめた時だけ、めくっていた紙の表を下へ移す */
      if (done) {
        idx += dir;
        if (dir < 0) moveKids(el.f, el.cur);
      } else if (dir > 0) moveKids(el.f, el.cur);
      el.f.replaceChildren();
      busy = false; labels();
    };
    el.flip.addEventListener("transitionend", fin);
    el.flip.classList.add("anim");
    requestAnimationFrame(function () {
      el.flip.style.transform = "rotateX("
        + (done ? (dir > 0 ? 180 : 0) : (dir > 0 ? 0 : 180)) + "deg)";
      shade(done ? (dir > 0 ? .5 : 0) : (dir > 0 ? 0 : .5));
    });
    setTimeout(fin, 900);
  }
  function turn(dir) {
    if (busy) return;
    if (dir > 0 && idx >= pages().length - 1) return;
    if (dir < 0 && idx <= 0) return;
    busy = true; prep(dir); settle(dir, true);
  }
  function drag() {
    var d = null, stg = $("#stage");
    stg.onpointerdown = function (e) {
      if (busy || (e.target.closest && e.target.closest("button"))) return;
      d = { x: e.clientX, y: e.clientY, dir: 0, id: e.pointerId, p: 0 };
    };
    stg.onpointermove = function (e) {
      if (!d) return;
      var dy = e.clientY - d.y, dx = e.clientX - d.x;
      if (!d.dir) {
        if (Math.abs(dy) < 16 || Math.abs(dy) < Math.abs(dx)) return;
        var dir = dy < 0 ? 1 : -1;
        if ((dir > 0 && idx >= pages().length - 1) || (dir < 0 && idx <= 0)) { d = null; return; }
        d.dir = dir; d.from = e.clientY; busy = true; prep(dir);
        try { stg.setPointerCapture(d.id); } catch (err) {}
      }
      var h = el.hold.getBoundingClientRect().height;
      var p = Math.max(0, Math.min(1,
        d.dir > 0 ? (d.from - e.clientY) / h : (e.clientY - d.from) / h));
      d.p = p;
      el.flip.style.transform = "rotateX(" + (d.dir > 0 ? 180 * p : 180 * (1 - p)) + "deg)";
      shade(d.dir > 0 ? .5 * p : .5 * (1 - p));
    };
    var up = function () {
      if (!d) return; var c = d; d = null;
      if (!c.dir) return;
      settle(c.dir, c.p > .3);
    };
    stg.onpointerup = up; stg.onpointercancel = up;
  }

  function drawYoko(st) {
    var S = spreads();
    sp = Math.max(0, Math.min(sp, S.length - 1));
    st.innerHTML = '<div id="yoko"><div class="spread">'
      + '<div class="half L"></div><div class="half R"></div>'
      + '<div class="yflip" hidden><div class="yface a"></div><div class="yface b"></div></div>'
      + '</div></div>';
    el = { sp: $(".spread", st), L: $(".half.L", st), R: $(".half.R", st),
           yf: $(".yflip", st), a: $(".yface.a", st), b: $(".yface.b", st) };
    fitBox(st, el.sp, RATIO * 2);
    paintY(); dragY();
  }
  function paintY() {
    var S = spreads(), s = S[sp];
    el.L.innerHTML = faceHTML(s[0]);
    el.R.innerHTML = faceHTML(s[1]);
    labelsY();
  }
  function labelsY() {
    var S = spreads(), s = S[sp];
    el.L.classList.toggle("empty", s[0] == null);
    el.R.classList.toggle("empty", s[1] == null);
    var nx = S[sp + 1] || [], pv = S[sp - 1] || [], n2 = S[sp + 2] || [];
    ahead([nx[0], nx[1], pv[0], pv[1], n2[0], n2[1]]);
    var shown = [s[0], s[1]].filter(function (v) { return v != null; }).map(label);
    $("#pn").textContent = shown.join("–") + " / " + (pages().length - 2 * off());
    $("#prev").disabled = sp <= 0;
    $("#home").disabled = sp <= 0;
    $("#next").disabled = sp >= S.length - 1;
  }
  /* めくる紙の表裏を用意する（まだ回さない）。
     ★めくる紙の表は、いま見えている半分をそのまま移す。空いた所には、めくった下から
       見えてくる次のページを置く（前は古いページのままで、めくり終わった瞬間に入れ替わっていた） */
  function prepY(dir) {
    var S = spreads(), c = S[sp], n = S[sp + dir];
    var half = el.L.getBoundingClientRect().width;
    el.yf.style.width = half + "px";
    el.yf.style.left = (dir > 0 ? half : 0) + "px";
    el.yf.style.transformOrigin = dir > 0 ? "left center" : "right center";
    var side = dir > 0 ? el.R : el.L;
    moveKids(side, el.a);
    side.innerHTML = faceHTML(dir > 0 ? n[1] : n[0]);
    side.classList.toggle("empty", (dir > 0 ? n[1] : n[0]) == null);
    el.b.innerHTML = faceHTML(dir > 0 ? n[0] : n[1]);
    el.b.style.transform = "rotateY(180deg)";
    el.yf.hidden = false;
    el.yf.classList.remove("anim");
    el.yf.style.transform = "rotateY(0deg)";
  }
  function settleY(dir, done) {
    var fired = false;
    var fin = function () {
      if (fired) return; fired = true;
      el.yf.removeEventListener("transitionend", fin);
      el.yf.hidden = true; el.yf.classList.remove("anim");
      /* 進んだ時は裏の面を反対側の半分へ。やめた時は表の面を元の半分へ戻す */
      if (done) { sp += dir; moveKids(el.b, dir > 0 ? el.L : el.R); }
      else moveKids(el.a, dir > 0 ? el.R : el.L);
      el.a.replaceChildren(); el.b.replaceChildren();
      busy = false; labelsY();
    };
    el.yf.addEventListener("transitionend", fin);
    el.yf.classList.add("anim");
    var end = done ? (dir > 0 ? -180 : 180) : 0;
    requestAnimationFrame(function () {
      el.yf.style.transform = "rotateY(" + end + "deg)";
    });
    setTimeout(fin, 900);
  }
  function turnY(dir) {
    var S = spreads();
    if (busy) return;
    if (dir > 0 && sp >= S.length - 1) return;
    if (dir < 0 && sp <= 0) return;
    busy = true; prepY(dir); settleY(dir, true);
  }
  /* ★見開きも指について来るようにする。
     前は「42px 動いたら勝手に最後までめくる」だったので、
     途中でやめられず、どこまでめくれたのかも見えなかった */
  function dragY() {
    var d = null, stg = $("#stage");
    stg.onpointerdown = function (e) {
      if (busy || (e.target.closest && e.target.closest("button"))) return;
      d = { x: e.clientX, y: e.clientY, dir: 0, id: e.pointerId, p: 0 };
    };
    stg.onpointermove = function (e) {
      if (!d) return;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.dir) {
        if (Math.abs(dx) < 18 || Math.abs(dx) < Math.abs(dy)) return;
        var dir = dx < 0 ? 1 : -1;
        var S = spreads();
        if ((dir > 0 && sp >= S.length - 1) || (dir < 0 && sp <= 0)) { d = null; return; }
        d.dir = dir; d.from = e.clientX; busy = true; prepY(dir);
        try { stg.setPointerCapture(d.id); } catch (err) {}
      }
      var w = el.L.getBoundingClientRect().width || 1;
      var p = Math.max(0, Math.min(1,
        d.dir > 0 ? (d.from - e.clientX) / w : (e.clientX - d.from) / w));
      d.p = p;
      el.yf.style.transform = "rotateY(" + (d.dir > 0 ? -180 * p : 180 * p) + "deg)";
    };
    var up = function () {
      if (!d) return;
      var c = d;
      d = null;
      if (!c.dir) return;
      settleY(c.dir, c.p > .3);
    };
    stg.onpointerup = up; stg.onpointercancel = up;
  }

  function go(dir) { if (yoko()) turnY(dir); else turn(dir); }
  function jump(i) { idx = i || 0; sp = 0; render(); }
  /* 組む画面へ渡すのはページの添字（表紙・裏表紙の分を引く） */
  function at() {
    var li = yoko() ? ((spreads()[sp] || [0])[1] || (spreads()[sp] || [0])[0] || 0) : idx;
    var n = A() ? A().pages.length : 1;
    return Math.max(0, Math.min(n - 1, li - off()));
  }
  return { render: render, go: go, jump: jump, at: at,
           flip: function () { manual = !yoko(); render(); } };
})();

/* =========================================================
   組む画面
   ★ページの移動は「転がす」。1ページずつ吸い付いて止まる
   ★中身を描くのは前後1ページだけ。全部描くと写真が重なって重くなる
   ========================================================= */
var Make = (function () {
  var pi = 0, sel = null, pw = 0, ph = 0, slotH = 0, tmr = null, dragging = false;
  var quiet = false;      /* 組み直しの最中は、転がりの見張りを止める印 */
  var stripT = null;
  var lift = null;        /* 長押しで持ち上げている見本 */
  var toldLift = false;   /* 「動かせます」の知らせは1回だけ */

  function A() { return App.album(); }
  function pages() { return A() ? A().pages : []; }
  function cur() { return pages()[pi]; }
  function selItem() {
    var p = cur(); if (!p) return null;
    for (var i = 0; i < p.items.length; i++) if (p.items[i].id === sel) return p.items[i];
    return null;
  }
  function saved() { Store.touch(A()); }

  /* ---------- 大きさを測る ---------- */
  function measure() {
    var area = $("#canvasArea");
    slotH = area.clientHeight;
    if (slotH <= 0) return false;
    ph = slotH - 22;
    pw = ph * RATIO;
    var maxW = area.clientWidth - 24;
    if (pw > maxW) { pw = maxW; ph = pw / RATIO; }
    ph = Math.floor(ph); pw = Math.floor(pw);
    return ph > 40;
  }

  /* ---------- 器を作る（中身はあとから入れる） ---------- */
  function buildSlots() {
    var area = $("#canvasArea");
    area.innerHTML = pages().map(function (p, i) {
      return '<div class="slot" data-i="' + i + '" style="height:' + slotH + 'px">'
        + '<div class="box" style="width:' + pw + 'px;height:' + ph + 'px"></div></div>';
    }).join("");
  }

  /* ---------- 見えている所だけ中身を入れる ---------- */
  /* soft＝ページを移っただけ（中身は変わっていない）。
     ★その時は、もう描いてあるページは描き直さない。描き直すと写真の展開からやり直しになる。
       つまみ（選ぶ枠）だけを、いまのページへ付け替える */
  function fillWindow(soft) {
    withPhotos(photoKeysOf(pages(), [pi - 1, pi, pi + 1]), function () { paintWindow(soft); });
    var k = photoKeysOf(pages(), [pi - 2, pi + 2]);
    if (k.length) Photos.warm(k).then(function () { Photos.decode(k); });
  }
  function paintWindow(soft) {
    var slots = $$("#canvasArea .slot");
    slots.forEach(function (s, i) {
      var box = $(".box", s);
      var near = Math.abs(i - pi) <= 1;
      s.classList.toggle("far", !near);
      if (!near) { if (box.innerHTML) box.innerHTML = ""; box.removeAttribute("data-drawn"); return; }
      if (!soft || !box.hasAttribute("data-drawn")) {
        box.innerHTML = pageHTML(pages()[i], i + 1) + '<span class="pgno">' + (i + 1) + '</span>';
        box.setAttribute("data-drawn", "1");
      }
      var line = $(".slotline", box);
      if (line) line.remove();
      if (i === pi) {
        box.insertAdjacentHTML("beforeend", '<div class="slotline"></div>');
        handles(box);
      }
    });
  }

  /* ---------- つまみ（選んでいるページだけ） ---------- */
  function handles(box) {
    var p = cur(), line = $(".slotline", box);
    if (!line) return;
    p.items.forEach(function (it) {
      var b = document.createElement("button");
      b.type = "button";
      /* ★飾りの線は「型で組む」ページでも指で動かせる（型の枠には入らない部品なので） */
      var movable = p.mode === "自由" || it.kind === "line";
      b.className = "pick" + (movable ? " free" : "") + (it.id === sel ? " sel" : "");
      b.style.cssText = css(it) + "pointer-events:auto;z-index:" + (10 + (it.zi || 1)) + ";";
      b.setAttribute("aria-label", KINDNAME[it.kind] + "を選ぶ");
      b.onclick = function (e) {
        e.stopPropagation();
        if (dragging) { dragging = false; return; }
        if (sel !== it.id) panId = null;
        sel = it.id; fillWindow(true); drawPanel();
      };
      /* 「写真の位置を合わせる」の間は、枠ではなく中の写真を動かす */
      if (it.id === sel && panId === it.id && it.kind === "photo" && it.photo) {
        b.classList.add("pan");
        bindPan(b, it, box);
      } else if (movable) {
        bindMove(b, it, box);
        if (it.id === sel) ["nw", "ne", "sw", "se"].forEach(function (c) {
          var hd = document.createElement("i");
          hd.className = "hand " + c;
          bindSize(hd, it, box);
          b.appendChild(hd);
        });
      }
      line.appendChild(b);
    });
  }
  var KINDNAME = { text: "文字", photo: "写真", line: "線" };

  /* ---------- 写真を枠の中で寄せる・大きくする ----------
     1本指で動かす／2本指で広げる・つまむ／ホイールで大きさ。
     ★動かしている間は作り直さず、img の書式だけ書き換える（指について来るように） */
  var panId = null;
  function resetPos(it) { delete it.px; delete it.py; delete it.pz; }
  function photoImg(it) {
    var n = onPage(it);
    return n ? $("img", n) : null;
  }
  function applyPos(it) {
    var im = photoImg(it);
    if (im) im.style.cssText = imgCss(it);
  }
  function bindPan(node, it, box) {
    var pts = {}, st = null;
    function n() { return Object.keys(pts).length; }
    function begin() {
      var im = photoImg(it);
      if (!im || !im.naturalWidth) return null;
      var w = im.clientWidth, h = im.clientHeight;
      var sc = Math.max(w / im.naturalWidth, h / im.naturalHeight);
      var q = photoPos(it), k = Object.keys(pts);
      var d = k.length > 1 ? Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y) : 0;
      var c = mid();
      return { w: w, h: h, dw: im.naturalWidth * sc, dh: im.naturalHeight * sc, x: q.x, y: q.y, z: q.z,
               cx: c.x, cy: c.y, d: d };
    }
    function mid() {
      var k = Object.keys(pts), x = 0, y = 0;
      k.forEach(function (i) { x += pts[i].x; y += pts[i].y; });
      return { x: x / (k.length || 1), y: y / (k.length || 1) };
    }
    function clampAll() {
      it.px = Math.round(Math.max(0, Math.min(100, it.px)) * 10) / 10;
      it.py = Math.round(Math.max(0, Math.min(100, it.py)) * 10) / 10;
      it.pz = Math.round(Math.max(1, Math.min(4, it.pz)) * 100) / 100;
    }
    /* 指が dx 動いた時に寄せる位置をどれだけ動かすか。
       写真の左端は 位置p×(枠の幅−写真の幅×大きさ) にあるので、その逆を取る */
    function shift(dx, span, img, z) {
      var room = span - img * z;
      return Math.abs(room) < 0.5 ? 0 : dx / room * 100;
    }
    node.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      st = begin();
    });
    node.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId] || !st) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var c = mid();
      it.pz = st.z;
      if (n() > 1 && st.d > 0) {
        var k = Object.keys(pts);
        var d = Math.hypot(pts[k[0]].x - pts[k[1]].x, pts[k[0]].y - pts[k[1]].y);
        it.pz = st.z * d / st.d;
      }
      it.px = st.x + shift(c.x - st.cx, st.w, st.dw, Math.max(1, Math.min(4, it.pz)));
      it.py = st.y + shift(c.y - st.cy, st.h, st.dh, Math.max(1, Math.min(4, it.pz)));
      clampAll();
      dragging = true;
      applyPos(it); syncSliders(it);
    });
    var up = function (e) {
      delete pts[e.pointerId];
      st = n() ? begin() : null;           /* 指が1本残ったら、そこから続けて動かせるように */
      if (!n()) { saved(); lateStrip(); setTimeout(function () { dragging = false; }, 60); }
    };
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    node.addEventListener("wheel", function (e) {
      e.preventDefault();
      var q = photoPos(it);
      it.px = q.x; it.py = q.y;
      it.pz = q.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08);
      clampAll(); applyPos(it); syncSliders(it); saved(); lateStrip();
    }, { passive: false });
  }
  /* パネルの目盛りを、指で動かした値に合わせる（パネルは作り直さない） */
  function syncSliders(it) {
    var q = photoPos(it);
    [["px", q.x, "%"], ["py", q.y, "%"], ["pz", q.z, "倍"]].forEach(function (a) {
      var r = $('#panel [data-rng="' + a[0] + '"]'), l = $('#panel [data-lbl="' + a[0] + '"]');
      if (r) r.value = a[1];
      if (l) l.textContent = l.textContent.replace(/　.*$/, "　" + f2(a[1]) + a[2]);
    });
  }
  function css(it) {
    return "left:" + it.x + "%;top:" + it.y + "%;width:" + it.w + "%;height:" + it.h + "%;"
      + (it.rot ? "transform:rotate(" + it.rot + "deg);" : "");
  }
  /* 動かしている間は作り直さず、位置だけ流し込む（指について来るように）。
     ★色も一緒に書き直すこと。前は書いていなかったので、
       文字を動かした瞬間だけ色が既定に戻って見えていた */
  function live(it, node, box) {
    node.style.cssText = css(it) + "pointer-events:auto;z-index:" + (10 + (it.zi || 1)) + ";";
    var real = $('.page .it[data-id="' + it.id + '"]', box);
    if (!real) return;
    /* ★文字の書式は itemHTML と同じ textCss() を使う（枠の余白も一緒に戻す） */
    var extra = it.kind === "text" ? textCss(it, paperOf(cur())) : "";
    real.style.cssText = css(it) + "z-index:" + (it.zi || 1) + ";" + extra;
  }
  function bindMove(node, it, box) {
    node.addEventListener("pointerdown", function (e) {
      if (e.target.classList.contains("hand")) return;
      var r = $(".page", box).getBoundingClientRect();
      var st = { px: e.clientX, py: e.clientY, x: it.x, y: it.y, moved: false };
      sel = it.id;
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      var mv = function (ev) {
        var dx = (ev.clientX - st.px) / r.width * 100;
        var dy = (ev.clientY - st.py) / r.height * 100;
        if (!st.moved && Math.abs(dx) + Math.abs(dy) < 0.8) return;
        st.moved = true; dragging = true;
        it.x = Math.round(Math.max(-20, Math.min(110 - it.w, st.x + dx)) * 10) / 10;
        it.y = Math.round(Math.max(-20, Math.min(110 - it.h, st.y + dy)) * 10) / 10;
        live(it, node, box);
      };
      var up = function () {
        node.removeEventListener("pointermove", mv);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
        if (st.moved) { saved(); refresh(); setTimeout(function () { dragging = false; }, 60); }
      };
      node.addEventListener("pointermove", mv);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    });
  }
  function bindSize(handle, it, box) {
    handle.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      var corner = handle.className.replace("hand ", "").trim();
      var r = $(".page", box).getBoundingClientRect();
      var st = { px: e.clientX, py: e.clientY, x: it.x, y: it.y, w: it.w, h: it.h };
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      var mv = function (ev) {
        dragging = true;
        var dx = (ev.clientX - st.px) / r.width * 100;
        var dy = (ev.clientY - st.py) / r.height * 100;
        var west = corner === "nw" || corner === "sw";
        var north = corner === "nw" || corner === "ne";
        var w = west ? st.w - dx : st.w + dx;
        var h = north ? st.h - dy : st.h + dy;
        if (w < 6) w = 6;
        if (h < 6) h = 6;
        it.w = Math.round(w * 10) / 10; it.h = Math.round(h * 10) / 10;
        it.x = Math.round((west ? st.x + (st.w - it.w) : st.x) * 10) / 10;
        it.y = Math.round((north ? st.y + (st.h - it.h) : st.y) * 10) / 10;
        live(it, handle.parentNode, box);
      };
      var up = function () {
        handle.removeEventListener("pointermove", mv);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        saved(); refresh(); setTimeout(function () { dragging = false; }, 60);
      };
      handle.addEventListener("pointermove", mv);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  /* ---------- 転がしてページを移る ---------- */
  function bindScroll() {
    var area = $("#canvasArea");
    area.onscroll = function () {
      if (quiet) return;
      if (tmr) clearTimeout(tmr);
      tmr = setTimeout(function () {
        if (!slotH) return;
        var n = Math.max(0, Math.min(pages().length - 1, Math.round(area.scrollTop / slotH)));
        if (n === pi) return;
        pi = n; sel = null; panId = null;
        fillWindow(true); drawPanel(); markStrip();
      }, 90);
    };
  }
  function scrollTo(i, smooth) {
    var area = $("#canvasArea");
    area.scrollTo({ top: i * slotH, behavior: smooth === false ? "auto" : "smooth" });
  }

  /* ---------- 右のパネル ---------- */
  /* ★設定欄は3つのタブに分ける（v17）。
     前は1本の縦長で「ページ → 選んだ枠 → ページの操作 → 表紙」の順に並べていて、
     スマホでは写真や文字を選んでも、その設定が欄の下（画面の外）に出ていた。
     選んだらすぐ「選んだもの」のタブを開いて先頭から見せる */
  var tab = "page", lastSel = null, lastPi = -1;
  function drawPanel() {
    var p = cur(), it = selItem();
    if (!p) { $("#panel").innerHTML = ""; return; }
    var h = [], fresh = false;
    if (it && it.id !== lastSel) { tab = "item"; fresh = true; }
    if (!it && tab === "item" && lastSel) { tab = "page"; fresh = true; }
    if (pi !== lastPi) fresh = true;
    lastSel = it ? it.id : null; lastPi = pi;

    var tabs = [["item", "👆", it ? "選んだ" + KINDNAME[it.kind] : "選んだもの"],
                ["page", "📄", (pi + 1) + "ページ目"], ["book", "📕", "本全体"]];
    h.push('<div class="ptabs" role="tablist">' + tabs.map(function (t) {
      return '<button role="tab" data-tab="' + t[0] + '" class="' + (tab === t[0] ? "on" : "")
        + (t[0] === "item" && it ? " has" : "") + '" aria-selected="' + (tab === t[0]) + '">'
        + '<span class="ico" aria-hidden="true">' + t[1] + '</span>' + esc(t[2]) + '</button>';
    }).join("") + '</div>');

    if (tab === "page") {
    h.push('<div class="grp"><h3>🧩 組み方</h3>');
    h.push('<div class="row two" style="margin-bottom:10px">'
      + chip("🧩 型で組む", p.mode === "型", "mode-kata")
      + chip("✋ 自由に置く", p.mode === "自由", "mode-jiyu") + '</div>');

    if (p.mode === "型") {
      h.push('<div class="lay">');
      LAYOUTS.forEach(function (L) {
        h.push('<button data-lay="' + L.key + '" class="' + (p.layout === L.key ? "on" : "")
          + '" title="' + esc(L.name) + '" aria-label="' + esc(L.name) + '">'
          + L.slots.map(function (s) {
              return '<i class="' + (s.k === "text" ? "t" : "") + '" style="left:' + s.x
                + '%;top:' + (s.y * 0.86) + '%;width:' + s.w + '%;height:'
                + (s.h * 0.86) + '%"></i>';
            }).join("")
          + '<span>' + esc(L.name) + '</span></button>');
      });
      h.push('</div>');
      h.push('<h3 class="sub">➕ 足す</h3>' + tiles([["〰️", "飾りの線", 'data-do="add-line"']]));
    } else {
      h.push('<h3 class="sub">➕ 足す</h3>' + tiles([
        ["🖼️", "写真", 'data-do="add-photo"', "pri"],
        ["🔤", "文字", 'data-do="add-text"'],
        ["〰️", "飾りの線", 'data-do="add-line"']]));
    }
    h.push('</div>');

    h.push('<div class="grp"><h3>🎨 台紙の色</h3>' + swatches(PAPERS, paperOf(p), "bg") + '</div>');

    h.push('<div class="grp"><h3>📄 このページを</h3>' + tiles([
        ["⬅️", "前へ動かす", 'data-do="up"' + (pi <= 0 ? " disabled" : "")],
        ["➡️", "後ろへ動かす", 'data-do="down"' + (pi >= pages().length - 1 ? " disabled" : "")],
        ["📑", "複製する", 'data-do="dup"'],
        ["🗑️", "外す", 'data-do="delpage"', "bad"]])
      + '<p class="note">ページを足すのは、下の帯の右端の「＋」です。</p></div>');
    }

    if (tab === "item" && it) {
      var KICO = { photo: "🖼️", text: "🔤", line: "〰️" };
      h.push('<div class="grp"><div class="ihead"><h3>' + KICO[it.kind] + ' 選んだ' + KINDNAME[it.kind] + '</h3>'
        + '<button class="chip done" data-do="unsel">✅ 選び終わる</button></div>');
      if (it.kind === "photo") {
        var on = panId === it.id;
        h.push(tiles([["🖼️", it.photo ? "写真を替える" : "写真を選ぶ", 'data-do="pick"', "pri"]].concat(it.photo ? [
          [on ? "✅" : "✋", on ? "位置を決めた" : "位置を合わせる", 'data-do="pan"', on ? "pri" : ""],
          ["↩️", "位置を戻す", 'data-do="pos-reset"']] : [])));
        if (it.photo) {
          var q = photoPos(it);
          if (on) h.push('<p class="note">枠の中の写真を指で動かせます。2本指で広げると大きく、つまむと小さくなります（PCはホイール）。</p>');
          h.push(rng("pz", "🔍 大きさ", 1, 4, 0.05, q.z, "倍"));
          h.push(rng("px", "↔️ 横の位置", 0, 100, 1, q.x, "%"));
          h.push(rng("py", "↕️ 縦の位置", 0, 100, 1, q.y, "%"));
        }
        h.push('<span class="fld">🔲 形</span><div class="row four">'
          + ["角", "丸角", "丸", "ふち"].map(function (f) {
              return chip(f, it.frame === f, "fr-" + f); }).join("") + '</div>');
      } else if (it.kind === "line") {
        h.push('<span class="fld">〰️ 線の形</span><div class="row">'
          + LINE_STYLES.map(function (v) { return setChip(v, "style", v, it.style === v); }).join("") + '</div>');
        h.push(rng("len", "📏 長さ", 5, 100, 1, f2(it.w), "%"));
        h.push(rng("lw", "✒️ 太さ", 0.1, 3, 0.05, it.lw || 0.5, ""));
        h.push('<span class="fld">🎨 線の色</span>' + swf(INKS, inkOf(it), "color"));
      } else {
        h.push('<textarea id="tx" placeholder="ここに文を書く" autocomplete="off" '
          + 'autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore '
          + 'name="' + uid("f") + '">' + esc(it.text || "") + '</textarea>');
        h.push('<span class="fld" id="l-sz">🔍 大きさ　' + (it.size || 1).toFixed(2) + '倍</span>');
        h.push('<input type="range" id="sz" min="0.5" max="3" step="0.05" value="'
          + (it.size || 1) + '">');
        h.push('<span class="fld">📐 そろえ</span><div class="row three">'
          + [["⬅️ 左", "left"], ["↔️ 中", "center"], ["➡️ 右", "right"]].map(function (a) {
              return chip(a[0], it.align === a[1], "al-" + a[1]); }).join("") + '</div>');
        h.push('<span class="fld">🅰️ 書体</span><div class="row three">'
          + chip("明朝", it.font === "明朝", "fo-明朝")
          + chip("ゴシック", it.font !== "明朝", "fo-ゴシック")
          + chip("太字", !!it.futo, "futo") + '</div>');
        h.push('<span class="fld">🎨 文字の色</span>' + swatches(INKS, inkOf(it), "co"));
        h.push(textDeco(it));
      }
      if (p.mode === "自由" || it.kind === "line") {
        var big = it.kind === "line";
        h.push(rng("rot", "🔄 傾き", big ? -90 : -15, big ? 90 : 15, 1, it.rot || 0, "°"));
        h.push('<span class="fld">🗂️ 重なり</span>' + tiles([
          ["⬆️", "手前へ", 'data-do="front"'], ["⬇️", "奥へ", 'data-do="back"']]));
      }
      h.push('<div style="height:8px"></div>' + tiles([["🗑️", "この" + KINDNAME[it.kind] + "を外す", 'data-do="del"', "bad"]]) + '</div>');
    } else if (tab === "item") {
      h.push('<div class="grp guide"><span class="big-ico" aria-hidden="true">👆</span><h3>使い方</h3><p>上の誌面で、直したい写真や文字を押してください。'
        + 'ここにその設定が出ます。'
        + (p.mode === "自由" ? "<br>選んだあとは指で動かせます。" : "")
        + '<br>ページを移るには、誌面の上を上下に転がすか、下の帯のページを押してください。</p></div>');
    }

    /* アルバム全体の設定。表紙と裏表紙は対で付く */
    if (tab === "book") {
    var bk = A().binding || "none";
    h.push('<div class="grp"><h3>📕 表紙のデザイン</h3><div class="binds">'
      + [{ key: "none", name: "なし" }].concat(BINDINGS).map(function (b) {
          return '<button class="bd' + (bk === b.key ? " on" : "") + '" data-bind="' + b.key + '"'
            + ' aria-label="' + esc(b.name) + '">'
            + (b.front ? '<img src="' + b.front + '" alt="">' : '<i>なし</i>')
            + '<span>' + esc(b.name) + '</span></button>';
        }).join("") + '</div><p>選ぶと表紙と裏表紙が対になって付きます。見る画面とPDFの最初と最後に出ます。</p></div>');
    }

    /* ★作り直しても、読んでいた高さは残す（タブや選んだものが変わった時だけ先頭へ） */
    var box = $("#panel");
    var keep = fresh ? 0 : box.scrollTop;
    box.innerHTML = h.join("");
    box.scrollTop = keep;
    bindPanel();
  }
  /* ---------- 文字の飾り（縁取り・影・枠と地） ----------
     ★たたんでおける。開いているかどうかは作り直しても覚えておく */
  var openSec = {};
  function sec(key, title, body, on) {
    return '<details class="sec" data-sec="' + key + '"' + (openSec[key] ? " open" : "") + '>'
      + '<summary>' + esc(title) + (on ? '<b class="dot" aria-label="使用中"></b>' : "") + '</summary>'
      + '<div class="secin">' + body + '</div></details>';
  }
  function textDeco(it) {
    var ol = rng("olW", "太さ（0でなし）", 0, 1.2, 0.05, it.olW || 0, "")
      + '<span class="fld">縁の色</span>' + swf(INKS, it.olC || "auto", "olC", "自動（文字の反対の色）");
    var m = it.shM || "auto";
    var sh = '<div class="row">' + setChip("自動", "shM", "auto", m === "auto")
      + setChip("なし", "shM", "none", m === "none") + setChip("付ける", "shM", "on", m === "on") + '</div>';
    if (m === "auto") sh += '<p class="note">明るい文字にだけ、うっすら影を敷きます。</p>';
    if (m === "on") {
      var dir = it.shA == null ? 45 : it.shA;
      sh += '<span class="fld">向き</span><div class="row">' + SHADOW_DIRS.map(function (d) {
          return setChip(d[0], "shA", d[1], dir === d[1]); }).join("") + '</div>'
        + rng("shD", "長さ", 0, 4, 0.05, it.shD == null ? 0.6 : it.shD, "")
        + rng("shB", "ぼかし", 0, 4, 0.05, it.shB == null ? 0.8 : it.shB, "")
        + rng("shO", "濃さ", 0.1, 1, 0.05, it.shO == null ? 0.5 : it.shO, "")
        + '<span class="fld">影の色</span>' + swf(INKS.slice(1), it.shC || "#1a1a1a", "shC");
    }
    var bs = it.bxS || "none";
    var bx = '<div class="row">' + BOX_SHAPES.map(function (b) {
        return setChip(b[0], "bxS", b[1], bs === b[1]); }).join("") + '</div>';
    if (bs !== "none") {
      bx += '<span class="fld">線</span><div class="row">' + BOX_LINES.map(function (v) {
          return setChip(v, "bxL", v, (it.bxL || "実線") === v); }).join("")
        + (bs === "box" ? '<button class="chip' + (it.bxR ? " on" : "") + '" data-tog="bxR">角を丸く</button>' : "")
        + '</div>'
        + rng("bxW", "太さ", 0.1, 2, 0.05, it.bxW || 0.4, "")
        + '<span class="fld">枠の色</span>' + swf(INKS, it.bxC || "auto", "bxC", "自動（文字と同じ色）");
    }
    bx += '<span class="fld">地の塗り</span>' + swf([["none", "なし"]].concat(PAPERS, INKS.slice(1)),
      it.bxF || "none", "bxF");
    return '<span class="fld">✨ 飾り</span>'
      + sec("ol", "✏️ 縁取り", ol, it.olW > 0)
      + sec("sh", "🌑 影", sh, m === "on")
      + sec("bx", "🔲 枠と地", bx, bs !== "none" || (it.bxF && it.bxF !== "none"));
  }
  function setChip(label, f, v, on) {
    return '<button class="chip' + (on ? " on" : "") + '" data-set="' + esc(f) + '" data-v="' + esc(v) + '">'
      + esc(label) + '</button>';
  }
  function rng(f, label, min, max, step, val, unit) {
    return '<span class="fld" data-lbl="' + f + '" data-unit="' + esc(unit) + '">' + esc(label) + '　'
      + f2(val) + unit + '</span>'
      + '<input type="range" data-rng="' + f + '" min="' + min + '" max="' + max + '" step="' + step
      + '" value="' + val + '" aria-label="' + esc(label) + '">';
  }
  /* 色の見本（どの項目に入れるかを data-f で持つ） */
  function swf(list, now, f, autoName) {
    return '<div class="sw">' + list.map(function (c) {
      var v = c[0], name = (v === "auto" && autoName) ? autoName : c[1];
      var cls = v === "auto" ? " auto" : v === "none" ? " none" : "";
      return '<button class="s' + cls + (v === now ? " on" : "") + '" data-f="' + esc(f) + '" data-v="' + esc(v) + '"'
        + (cls ? "" : ' style="--c:' + esc(v) + '"') + ' title="' + esc(name) + '" aria-label="' + esc(name) + '"></button>';
    }).join("") + '</div>';
  }

  /* 押しもの（タイル）。絵文字を上、文字を下に縦に積む。4つ目は種類 "pri"（主）／"bad"（外す） */
  function tiles(list) {
    return '<div class="tiles n' + Math.min(list.length, 4) + '">' + list.map(function (t) {
      return '<button type="button" class="tile' + (t[3] ? " " + t[3] : "") + '" ' + t[2] + '>'
        + '<span class="ico" aria-hidden="true">' + t[0] + '</span><span class="lb">' + esc(t[1]) + '</span></button>';
    }).join("") + '</div>';
  }
  function chip(label, on, act) {
    return '<button class="chip' + (on ? " on" : "") + '" data-act="' + esc(act) + '">'
      + esc(label) + '</button>';
  }
  /* 色は名前で並べても分からないので、丸い見本にする。
     名前は指を当てたとき（と読み上げ）に出る */
  function swatches(list, now, kind) {
    return '<div class="sw">' + list.map(function (c) {
      var v = c[0], name = c[1];
      var auto = (v === "auto");
      return '<button class="s' + (auto ? " auto" : "") + (v === now ? " on" : "") + '"'
        + ' data-' + kind + '="' + esc(v) + '"'
        + (auto ? "" : ' style="--c:' + esc(v) + '"')
        + ' title="' + esc(name) + '" aria-label="' + esc(name) + '"></button>';
    }).join("") + '</div>';
  }

  function bindPanel() {
    var p = cur(), it = selItem();

    $$("#panel [data-tab]").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-tab");
        if (t === tab) return;
        tab = t; lastPi = -1;   /* 先頭から見せる */
        drawPanel();
      };
    });

    $$("#panel [data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-act");

        /* 型／自由の切り替えだけは、パネルの中身そのものが変わるので作り直す */
        if (a === "mode-kata") { toKata(); saved(); refresh(); offerPhotos(); return; }
        if (a === "mode-jiyu") { p.mode = "自由"; p.layout = "free"; saved(); refresh(); return; }

        if (a.indexOf("fr-") === 0 && it) it.frame = a.slice(3);
        else if (a.indexOf("al-") === 0 && it) it.align = a.slice(3);
        else if (a.indexOf("fo-") === 0 && it) it.font = a.slice(3);
        else if (a === "futo" && it) it.futo = !it.futo;
        saved();

        /* ★パネルは作り直さない。
           作り直すと読んでいた高さが先頭に戻り、スマホでは下のほうにある
           「色」や「そろえ」を押した瞬間に上へ飛ぶ。
           押しても何も起きていないように見える（文字色が変えられない、の正体）。
           印の付け替えだけ、その場でやる */
        if (a === "futo") b.classList.toggle("on", !!(it && it.futo));
        else markRow(b, a);
        fillWindow(); lateStrip();
      };
    });

    /* 色の見本。ここもパネルは作り直さない（作り直すと先頭へ飛ぶ） */
    $$("#panel .sw .s").forEach(function (b) {
      b.onclick = function () {
        var bg = b.getAttribute("data-bg"), co = b.getAttribute("data-co");
        if (bg) p.bg = bg;
        else if (co && it) it.color = co;
        else return;
        saved();
        $$(".s", b.parentNode).forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        fillWindow(); lateStrip();
      };
    });

    $$("#panel [data-bind]").forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-bind");
        if (k === "none") delete A().binding; else A().binding = k;
        saved();
        $$("#panel [data-bind]").forEach(function (x) { x.classList.toggle("on", x === b); });
        toast(k === "none" ? "表紙のデザインを外しました" : "表紙と裏表紙を付けました");
      };
    });

    $$("#panel [data-lay]").forEach(function (b) {
      b.onclick = function () { applyLayout(b.getAttribute("data-lay")); saved(); refresh(); offerPhotos(); };
    });

    $$("#panel [data-do]").forEach(function (b) {
      b.onclick = function () {
        var d = b.getAttribute("data-do");
        if (d === "pick") return pickPhoto(it);
        if (d === "unsel") { sel = null; panId = null; fillWindow(true); drawPanel(); return; }
        if (d === "pan" && it) {
          panId = panId === it.id ? null : it.id;
          fillWindow(true); drawPanel(); return;
        }
        if (d === "pos-reset" && it) {
          resetPos(it); applyPos(it); syncSliders(it); saved(); lateStrip(); return;
        }
        if (d === "add-photo") {
          var n = item({ k: "photo", x: 18, y: 26, w: 52, h: 38, zi: topZ() + 1 });
          p.items.push(n); sel = n.id; saved(); refresh(); return pickPhoto(n);
        }
        if (d === "add-text") {
          var t = item({ k: "text", x: 12, y: 40, w: 60, h: 16,
                         text: "ここに文を書く", zi: topZ() + 1 });
          p.items.push(t); sel = t.id;
        }
        if (d === "add-line") {
          var ln = item({ k: "line", x: 20, y: 48, w: 60, h: 4, zi: topZ() + 1 });
          fitLine(ln);
          p.items.push(ln); sel = ln.id;
        }
        if (d === "del" && it) { p.items.splice(p.items.indexOf(it), 1); sel = null; }
        if (d === "front" && it) it.zi = topZ() + 1;
        if (d === "back" && it) it.zi = botZ() - 1;
        if (d === "up" || d === "down") {
          var to = pi + (d === "up" ? -1 : 1);
          if (to < 0 || to >= pages().length) return;
          var moved = pages().splice(pi, 1)[0];
          pages().splice(to, 0, moved);
          pi = to; sel = null; saved(); rebuild(); scrollTo(pi, false); return;
        }
        if (d === "dup") {
          var c = JSON.parse(JSON.stringify(p));
          c.id = uid("p");
          c.items.forEach(function (x) { x.id = uid("i"); });
          pages().splice(pi + 1, 0, c);
          pi++; sel = null; saved(); rebuild(); scrollTo(pi, false); return;
        }
        if (d === "delpage") {
          if (pages().length <= 1) { toast("最後の1ページは外せません"); return; }
          pages().splice(pi, 1);
          if (pi >= pages().length) pi = pages().length - 1;
          sel = null; saved(); rebuild(); scrollTo(pi, false); return;
        }
        saved(); refresh();
      };
    });

    /* ---------- 飾りの操作 ----------
       ★パネルは作り直さない（読んでいた高さが飛ぶ）。誌面の1か所だけ描き直す。
       作り直すのは、出てくる操作そのものが変わる時（影を付ける／枠の形）だけ */
    var REBUILD = { shM: 1, bxS: 1 };
    $$("#panel [data-set]").forEach(function (b) {
      b.onclick = function () {
        if (!it) return;
        var f = b.getAttribute("data-set"), v = b.getAttribute("data-v");
        if (/^-?[0-9.]+$/.test(v)) v = parseFloat(v);
        it[f] = v;
        if (it.kind === "line" && f === "style") fitLine(it);
        saved();
        if (REBUILD[f]) { drawPanel(); repaint(it); lateStrip(); return; }
        $$("[data-set]", b.parentNode).forEach(function (x) {
          if (x.getAttribute("data-set") === f) x.classList.toggle("on", x === b);
        });
        repaint(it); lateStrip();
      };
    });
    $$("#panel [data-tog]").forEach(function (b) {
      b.onclick = function () {
        if (!it) return;
        var f = b.getAttribute("data-tog");
        it[f] = !it[f]; b.classList.toggle("on", !!it[f]);
        saved(); repaint(it); lateStrip();
      };
    });
    $$("#panel .sw .s[data-f]").forEach(function (b) {
      b.onclick = function () {
        if (!it) return;
        it[b.getAttribute("data-f")] = b.getAttribute("data-v");
        $$(".s", b.parentNode).forEach(function (x) { x.classList.toggle("on", x === b); });
        saved(); repaint(it); lateStrip();
      };
    });
    $$("#panel [data-rng]").forEach(function (r) {
      r.oninput = function () {
        if (!it) return;
        var f = r.getAttribute("data-rng"), v = parseFloat(r.value);
        if (it.kind === "photo" && (f === "px" || f === "py" || f === "pz")) {
          it[f] = v; applyPos(it);
          var lb = $('#panel [data-lbl="' + f + '"]');
          if (lb) lb.textContent = lb.textContent.replace(/　.*$/, "　" + f2(v) + (lb.getAttribute("data-unit") || ""));
          saved(); lateStrip(); return;
        }
        if (f === "len") {
          /* 長さは真ん中を動かさずに伸び縮みさせる */
          var cx = it.x + it.w / 2;
          it.w = v; it.x = f2(cx - v / 2);
        } else {
          it[f] = v;
          if (it.kind === "line" && f === "lw") fitLine(it);
        }
        var l = $('#panel [data-lbl="' + f + '"]');
        if (l) l.textContent = l.textContent.replace(/　.*$/, "　" + f2(v) + (l.getAttribute("data-unit") || ""));
        saved(); repaint(it); lateStrip();
        /* 傾けたら、選んでいる印の枠も一緒に傾ける */
        if (f === "rot") { var g = onLine(it); if (g) g.style.transform = it.rot ? "rotate(" + it.rot + "deg)" : ""; }
      };
    });
    $$("#panel details.sec").forEach(function (d) {
      d.ontoggle = function () { openSec[d.getAttribute("data-sec")] = d.open; };
    });

    /* ★打っている最中・つまみを動かしている最中は、誌面を作り直さない。
       作り直すと打っている欄そのものが作り直され、指が離れて
       スマホではキーボードが閉じる。変わった1か所だけ書き換える */
    var tx = $("#tx");
    if (tx && it) tx.oninput = function () {
      it.text = tx.value;
      var n = onPage(it), t = n && $(".tt", n);
      if (t) t.textContent = it.text; else fillWindow();
      saved(); lateStrip();
    };
    var sz = $("#sz");
    if (sz && it) sz.oninput = function () {
      it.size = parseFloat(sz.value);
      var l = $("#l-sz"); if (l) l.textContent = "大きさ　" + it.size.toFixed(2) + "倍";
      var n = onPage(it);
      if (n) n.style.fontSize = (4.2 * it.size) + "cqw"; else fillWindow();
      saved(); lateStrip();
    };
  }

  /* 同じ行の中で、選ばれている印を付け替える。
     ★「書体」と「太字」は同じ行に並んでいるので、頭3文字が同じものだけ消す */
  function markRow(btn, act) {
    var head = act.slice(0, 3);
    $$(".chip", btn.parentNode).forEach(function (x) {
      var xa = x.getAttribute("data-act") || "";
      if (xa.indexOf(head) === 0) x.classList.remove("on");
    });
    btn.classList.add("on");
  }

  /* その1つだけ描き直す。
     ★線は太さ・長さで枠の大きさが変わるので、つまみも一緒に描き直す（誌面ごと） */
  function repaint(it) {
    var n = onPage(it);
    if (!n || it.kind === "line") { fillWindow(); return; }
    var tmp = document.createElement("div");
    tmp.innerHTML = itemHTML(it, paperOf(cur()));
    n.parentNode.replaceChild(tmp.firstChild, n);
  }
  /* 線の太さに合わせて枠の高さを決める。真ん中の高さは動かさない */
  function fitLine(it) {
    var cy = it.y + it.h / 2;
    it.h = lineNeedH(it);
    it.y = f2(cy - it.h / 2);
  }

  /* いま出ている誌面の中の、その物の本体／つまみ枠 */
  function onPage(it) {
    return $('#canvasArea .slot[data-i="' + pi + '"] .page .it[data-id="' + it.id + '"]');
  }
  function onLine(it) {
    var line = $('#canvasArea .slot[data-i="' + pi + '"] .slotline');
    if (!line) return null;
    var n = cur().items.indexOf(it);
    return n >= 0 ? line.children[n] : null;
  }
  /* 見本（下の帯）は少し待ってから描き直す。1文字ごとに全部描くと重い */
  function lateStrip() {
    if (stripT) clearTimeout(stripT);
    stripT = setTimeout(drawStrip, 450);
  }

  function topZ() { return cur().items.reduce(function (m, x) { return Math.max(m, x.zi || 1); }, 1); }
  function botZ() { return cur().items.reduce(function (m, x) { return Math.min(m, x.zi || 1); }, 1); }

  /* 型へ戻す。中身（写真と文）は順番に入れ直して、消さない */
  function toKata() {
    var p = cur();
    p.mode = "型";
    if (p.layout === "free" || !p.layout) p.layout = "full";
    applyLayout(p.layout);
  }
  function applyLayout(key) {
    var p = cur(), L = layOf(key);
    var photos = p.items.filter(function (x) { return x.kind === "photo"; });
    var texts  = p.items.filter(function (x) { return x.kind === "text"; });
    var lines  = p.items.filter(function (x) { return x.kind === "line"; });
    p.layout = key; p.mode = "型";
    p.items = L.slots.map(function (s) {
      var old = (s.k === "photo" ? photos : texts).shift();
      var n = item({ k: s.k, x: s.x, y: s.y, w: s.w, h: s.h,
                     align: s.align, font: s.font, size: s.size, color: s.color });
      if (old) {
        if (s.k === "photo") {
          n.photo = old.photo; n.frame = old.frame;
          ["px", "py", "pz"].forEach(function (k) { if (old[k] != null) n[k] = old[k]; });
        }
        else {
          n.text = old.text; n.futo = old.futo;
          TEXT_DECO.forEach(function (k) { if (old[k] != null) n[k] = old[k]; });
          if (old.color) n.color = old.color;
          if (old.font) n.font = old.font;
        }
      }
      return n;
    });
    /* 型に入り切らなかった分は捨てずに残す（自由に戻したとき戻ってくる） */
    photos.concat(texts).forEach(function (x) {
      x.zi = topZ() + 1; x.x = 6; x.y = 6; x.w = 30; x.h = 22;
      p.items.push(x);
    });
    /* ★飾りの線は型の枠に入らない部品。置いた所のまま、いちばん上に残す */
    lines.forEach(function (x) { x.zi = topZ() + 1; p.items.push(x); });
    sel = null;
  }

  /* ---------- 写真を選ぶ窓 ---------- */
  /* 型を選んだ直後、空いている写真の枠があれば、その数だけ選ぶ窓を出す */
  function offerPhotos() {
    var p = cur();
    if (!p || p.mode !== "型") return;
    var empty = p.items.filter(function (x) { return x.kind === "photo" && !x.photo; });
    if (empty.length) pickMany(empty);
  }
  /* 取り込んだ写真の鍵（受け取った本＝見るだけ の写真は使わせない） */
  function myKeys() {
    return Photos.keys().then(function (keys) {
      var lk = Library.lockedKeys();
      return keys.filter(function (k) { return !lk[k]; });
    });
  }
  /* 端末から何枚か取り込む。1枚ずつ縮めてしまう（いちどに全部を開くとスマホで落ちる） */
  function intakeMany(files, max, onEach) {
    var list = Array.prototype.slice.call(files || [], 0, max), out = [], i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(out);
      var f = list[i++];
      if (onEach) onEach(i, list.length);
      return intake(f).then(function (k) { out.push(k); }, function () {}).then(next);
    }
    return next();
  }
  /* 何枚かまとめて選ぶ窓。押した順に番号が付き、その順で枠に入る */
  function pickMany(slots) {
    var n = slots.length;
    myKeys().then(function (keys) {
      var order = [];
      var w = document.createElement("div");
      w.className = "modal";
      w.innerHTML = '<div class="box"><h3>🖼️ 写真を選ぶ（' + n + '枚）</h3>'
        + '<p>' + (n > 1 ? '押した順に番号が付き、その順で枠に入ります。' + n + '枚まで選べます。'
                         : '押した写真が枠に入ります。')
        + (keys.length ? '' : '<br>まだ取り込んだ写真がありません。「この端末から選ぶ」から足してください。') + '</p>'
        + '<div class="picks multi">' + keys.map(function (k) {
            return '<button data-k="' + esc(k) + '" aria-pressed="false"><img alt=""><b class="no"></b></button>';
          }).join("") + '</div>'
        + tiles([["📷", "この端末から選ぶ", 'data-do="file"'],
                 ["✅", "入れる", 'data-do="ok" disabled', "pri"]])
        + '<button class="big ghost" data-do="close">あとで入れる</button></div>';
      w.onclick = function (e) { if (e.target === w) w.remove(); };
      document.body.appendChild(w);
      fillThumbs(w);
      var ok = $('[data-do="ok"]', w);
      function mark() {
        $$("[data-k]", w).forEach(function (b) {
          var at = order.indexOf(b.getAttribute("data-k"));
          b.classList.toggle("on", at >= 0);
          b.setAttribute("aria-pressed", at >= 0 ? "true" : "false");
          $(".no", b).textContent = at >= 0 ? (at + 1) : "";
        });
        ok.disabled = !order.length;
        $(".lb", ok).textContent = order.length ? order.length + "枚を入れる" : "入れる";
      }
      function apply() {
        slots.forEach(function (it, i) { if (order[i]) { it.photo = order[i]; resetPos(it); } });
        w.remove(); saved(); refresh();
        toast(order.length + "枚を入れました");
      }
      $$("[data-k]", w).forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute("data-k"), at = order.indexOf(k);
          if (at >= 0) order.splice(at, 1);
          else if (order.length >= n) { toast("選べるのは" + n + "枚までです"); return; }
          else order.push(k);
          if (n === 1 && order.length) return apply();   /* 1枚なら押した時点で入れる */
          mark();
        };
      });
      $('[data-do="close"]', w).onclick = function () { w.remove(); };
      ok.onclick = function () { if (order.length) apply(); };
      $('[data-do="file"]', w).onclick = function () {
        var room = n - order.length;
        if (room <= 0) { toast("もう" + n + "枚選んでいます"); return; }
        var f = document.createElement("input");
        f.type = "file"; f.accept = "image/*";
        if (room > 1) f.multiple = true;
        f.onchange = function () {
          if (!f.files || !f.files.length) return;
          if (f.files.length > room) toast("先頭の" + room + "枚だけ使います");
          intakeMany(f.files, room, function (i, m) { toast("取り込んでいます " + i + " / " + m); })
            .then(function (ks) {
              if (!ks.length) { toast("写真を読めませんでした"); return; }
              order = order.concat(ks);
              apply();
            });
        };
        f.click();
      };
    });
  }

  function pickPhoto(it) {
    if (!it) return;
    /* ★本物をまとめて引き上げない。手元の上限（40枚）を超えた分が並ばなくなる。
       小さな見本を1枚ずつ作って並べる */
    myKeys().then(function (keys) {
      var w = document.createElement("div");
      w.className = "modal";
      w.innerHTML = '<div class="box"><h3>🖼️ 写真を選ぶ</h3>'
        + '<p>押した写真が枠に入ります。「この端末から選ぶ」で足した写真も、ここに並びます。'
        + '要らない写真は、本棚の「取り込んだ写真」から捨てられます。</p>'
        + '<div class="picks">' + keys.map(function (k) {
            return '<button data-k="' + esc(k) + '"><img alt=""></button>';
          }).join("") + '</div>'
        + tiles([["📷", "この端末から選ぶ", 'data-do="file"', "pri"],
                 ["🚫", "写真を外す", 'data-do="clear"']])
        + '<button class="big ghost" data-do="close">やめる</button></div>';
      w.onclick = function (e) { if (e.target === w) w.remove(); };
      $$("[data-k]", w).forEach(function (b) {
        b.onclick = function () {
          it.photo = b.getAttribute("data-k"); resetPos(it); w.remove(); saved(); refresh();
        };
      });
      $$("[data-do]", w).forEach(function (b) {
        b.onclick = function () {
          var d = b.getAttribute("data-do");
          if (d === "close") return w.remove();
          if (d === "clear") { it.photo = null; w.remove(); saved(); refresh(); return; }
          var f = document.createElement("input");
          f.type = "file"; f.accept = "image/*";
          f.onchange = function () {
            if (!f.files || !f.files[0]) return;
            intake(f.files[0]).then(function (key) {
              it.photo = key; resetPos(it); w.remove(); saved(); refresh();
              toast("取り込みました（長辺2000pxまで縮めています）");
            }).catch(function (err) { toast(err.message); });
          };
          f.click();
        };
      });
      document.body.appendChild(w);
      fillThumbs(w);
    });
  }

  /* ---------- 下のページ並び ---------- */
  function drawStrip() {
    var s = $("#pages");
    s.innerHTML = pages().map(function (p, i) {
      return '<button class="th' + (i === pi ? " on" : "") + '" data-i="' + i + '" '
        + 'aria-label="' + (i + 1) + 'ページ目へ">' + pageHTML(p, 0, true) + '<b>' + (i + 1) + '</b></button>';
    }).join("") + '<button class="add" aria-label="ページを足す">＋</button>';
    stripThumbs();
    $$("#pages .th").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.justMoved) { delete b.dataset.justMoved; return; }
        pi = +b.getAttribute("data-i"); sel = null;
        fillWindow(true); drawPanel(); markStrip(); scrollTo(pi);
      };
      bindLift(b);
    });
    $(".add", s).onclick = function () {
      pages().splice(pi + 1, 0, page("full", cur().bg));
      pi++; sel = null; saved(); rebuild(); scrollTo(pi, false);
    };
  }
  /* ページ帯の見本に要る小さな写真を、1枚ずつ裏で作る。そろったら1回だけ描き直す */
  var stripBusy = false, stripTried = {};
  function stripThumbs() {
    if (stripBusy) return;
    /* ★作れなかった写真（消えていた等）は二度と試さない。試し続けると描き直しが止まらない */
    var want = photoKeysOf(pages(), pages().map(function (_, i) { return i; }))
      .filter(function (k) { return !Photos.thumbCached(k) && !stripTried[k]; });
    want.forEach(function (k) { stripTried[k] = 1; });
    if (!want.length) return;
    stripBusy = true;
    var i = 0;
    (function next() {
      if (i >= want.length) { stripBusy = false; if (!lift) drawStrip(); return; }
      Photos.thumb(want[i++]).then(function () { setTimeout(next, 0); });
    })();
  }

  /* ---------- 長押しでページを入れ替える ----------
     ★押してすぐ動かすと帯が横に流れるだけ（見本を探しているだけかもしれない）。
       だから「長押しで持ち上げてから動かす」の2段にする。
     ★持ち上げている間は、見本そのものを並べ替えて見せる。
       隙間を描くより、実際に動いて見えるほうが分かりやすい */
  var LIFT_MS = 420;      /* 長押しと判断するまで */
  var SLIP = 9;           /* これ以上動いたら「探している」とみなして取り消す */

  function bindLift(btn) {
    btn.addEventListener("pointerdown", function (e) {
      if (pages().length < 2) return;
      var strip = $("#pages");
      var sx = e.clientX, sy = e.clientY, id = e.pointerId;
      var timer = setTimeout(function () {
        timer = null;
        lift = { el: btn, from: +btn.getAttribute("data-i") };
        btn.classList.add("lift");
        strip.classList.add("moving");
        try { btn.setPointerCapture(id); } catch (err) {}
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (err) {}
        if (!toldLift) { toldLift = true; toast("そのまま動かすと入れ替えられます"); }
      }, LIFT_MS);

      var mv = function (ev) {
        if (timer) {
          /* まだ持ち上がっていない。動いたら取り消して、帯の横流れに任せる */
          if (Math.abs(ev.clientX - sx) > SLIP || Math.abs(ev.clientY - sy) > SLIP) {
            clearTimeout(timer); timer = null; off();
          }
          return;
        }
        if (!lift) return;
        var ths = $$("#pages .th");
        var now = ths.indexOf(lift.el);
        var to = dropIndex(ev.clientX, ths);
        if (to >= 0 && to !== now) {
          var ref = ths[to];
          if (to > now) strip.insertBefore(lift.el, ref.nextSibling);
          else strip.insertBefore(lift.el, ref);
        }
      };
      var up = function () {
        if (timer) { clearTimeout(timer); timer = null; off(); return; }
        off();
        if (!lift) return;
        var ths = $$("#pages .th");
        var to = ths.indexOf(lift.el), from = lift.from;
        lift.el.classList.remove("lift");
        if (to >= 0 && to !== from) {
          lift.el.dataset.justMoved = "1";     /* 離したときに飛ばないように */
          var moved = pages().splice(from, 1)[0];
          pages().splice(to, 0, moved);
          /* いま開いているページが、入れ替えでどこへ行ったか付いていく */
          if (pi === from) pi = to;
          else if (from < pi && to >= pi) pi--;
          else if (from > pi && to <= pi) pi++;
          saved();
          toast((from + 1) + "ページ目を " + (to + 1) + "ページ目へ動かしました");
        }
        lift = null;
        rebuild();
      };
      var off = function () {
        btn.removeEventListener("pointermove", mv);
        btn.removeEventListener("pointerup", up);
        btn.removeEventListener("pointercancel", up);
        $("#pages").classList.remove("moving");
      };
      btn.addEventListener("pointermove", mv);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
    });
  }
  /* 指のいる所から、何番目に入れるかを決める（見本の真ん中で区切る） */
  function dropIndex(x, ths) {
    for (var i = 0; i < ths.length; i++) {
      var r = ths[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) return i;
    }
    return ths.length - 1;
  }

  function markStrip() {
    $$("#pages .th").forEach(function (b) {
      var on = +b.getAttribute("data-i") === pi;
      b.classList.toggle("on", on);
      if (on && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "center" });
    });
  }

  /* ---------- 入口 ---------- */
  function refresh() { fillWindow(); drawPanel(); drawStrip(); }
  function rebuild() {
    if (!measure()) return;
    var keep = pi;
    quiet = true;
    buildSlots(); fillWindow(); drawPanel(); drawStrip();
    scrollTo(keep, false);          /* ★入れ替えで先頭に戻るので、必ず戻す */
    pi = keep;
    refit();
    setTimeout(function () { quiet = false; }, 150);
  }
  /* ★測ったあとで下のページ帯や設定欄ができると、誌面の枠が縮む。
     横向きの電話で誌面の下が切れていた（v20で修正）。縮んでいたら、その場で1回だけ測り直す。
     ★見張り（ResizeObserver）にはしない。キーボードの出入りで作り直すと打っている欄が消える */
  function refit() {
    var h = $("#canvasArea").clientHeight;
    if (!(h > 0) || Math.abs(h - slotH) <= 1) return;
    var keep = pi;
    if (!measure()) return;
    quiet = true;
    buildSlots(); fillWindow();
    scrollTo(keep, false);
    pi = keep;
    setTimeout(function () { quiet = false; }, 150);
  }
  function open(i) {
    pi = Math.max(0, Math.min(i || 0, pages().length - 1));
    sel = null;
    if (!measure()) { setTimeout(function () { open(pi); }, 60); return; }
    quiet = true;
    buildSlots(); bindScroll(); fillWindow(); drawPanel(); drawStrip();
    scrollTo(pi, false);
    refit();
    setTimeout(function () { quiet = false; }, 150);
  }
  function at() { return pi; }
  return { open: open, at: at, rebuild: rebuild, refresh: refresh };
})();

/* =========================================================
   PDFにする
   1ページずつ絵（JPEG）に描いて、そのままPDFに詰める。
   ★全ページを画面に並べてから印刷する作りにはしない。
     写真が数百枚の本だと、スマホは並べた時点で落ちる。1ページ描いたら手放す。
   ★ここはページを描く2つ目の場所になる（1つ目は pageHTML と style.css）。
     誌面の見た目を変えたら、ここも同じに直すこと。
     確かめ方は test/pdf_check.html（画面の誌面と並べて見比べる）
   ========================================================= */
var PdfOut = (function () {
  /* 仕上がりの大きさ。縦横比は RATIO（3:4）。紙は 150mm × 200mm */
  var QUALITY = {
    fine:  { w: 1500, q: 0.9,  name: "きれい（印刷向け）" },
    light: { w: 900,  q: 0.8,  name: "軽め（LINEなどで送る向け）" }
  };
  var MM = 72 / 25.4;
  var PAGE_W = 150 * MM, PAGE_H = PAGE_W / RATIO;

  /* ---------- 書体 ---------- */
  function cssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }
  function fontOf(it, px) {
    return (it.futo ? "700 " : "400 ") + px + "px "
      + (it.font === "明朝" ? cssVar("--mincho") : cssVar("--gothic"));
  }
  /* ★描く前に書体を読み終えておく。間に合わないと、その字だけ別の書体で焼き付く */
  function fontsReady(a) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var txt = "0123456789";
    (a.pages || []).forEach(function (p) {
      (p.items || []).forEach(function (it) { if (it.kind === "text") txt += it.text || ""; });
    });
    var want = [];
    ["400", "700"].forEach(function (wt) {
      want.push(document.fonts.load(wt + " 20px " + cssVar("--mincho"), txt));
      want.push(document.fonts.load(wt + " 20px " + cssVar("--gothic"), txt));
    });
    return Promise.race([
      Promise.all(want).catch(function () {}),
      new Promise(function (ok) { setTimeout(ok, 5000); })
    ]);
  }

  /* ---------- 折り返し ----------
     ★画面（white-space:pre-wrap / word-break:break-word）と同じ所で折る。
       日本語は1字ごと、英字は語ごとに折れる。句読点や閉じかっこは行頭に置かない */
  var NOHEAD = "、。，．,.・：；:;？！?!ー‐）」』】〕〉》］｝)]}’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞヽヾ…‥〜～";
  function tokens(s) {
    var out = [], m, re = /[A-Za-z0-9À-ɏ'’\-]+| |./g;
    while ((m = re.exec(s))) out.push(m[0]);
    return out;
  }
  function wrap(g, text, maxW) {
    var lines = [];
    String(text).split(NL).forEach(function (para) {
      var toks = tokens(para), line = "";
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], next = line + t;
        if (t === " " || !line || g.measureText(next).width <= maxW + 0.01) { line = next; continue; }
        /* 長すぎる英単語は字の途中で折る */
        if (t.length > 1 && g.measureText(t).width > maxW) {
          for (var c = 0; c < t.length; c++) {
            if (line && g.measureText(line + t[c]).width > maxW) { lines.push(line); line = ""; }
            line += t[c];
          }
          continue;
        }
        /* 行頭に来てはいけない字なら、前の1字を道連れにして次の行へ送る */
        if (NOHEAD.indexOf(t) >= 0 && line.length > 1) {
          var last = line.slice(-1);
          lines.push(line.slice(0, -1)); line = last + t; continue;
        }
        lines.push(line.replace(/ +$/, "")); line = t === " " ? "" : t;
      }
      lines.push(line);
    });
    return lines;
  }

  /* ---------- 1ページを描く ---------- */
  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  /* 枠いっぱいに、はみ出す分を切って収める（画面の object-fit:cover と同じ） */
  function cover(g, img, x, y, w, h, it) {
    /* 寄せ・大きさを付けた時（画面の object-position＋scale と同じ式） */
    var q = it ? photoPos(it) : { x: 50, y: 50, z: 1 };
    if (q.x !== 50 || q.y !== 50 || q.z !== 1) {
      var sc = Math.max(w / img.width, h / img.height), dw = img.width * sc, dh = img.height * sc;
      var fx = q.x / 100, fy = q.y / 100;
      var X = x + w * fx + ((w - dw) * fx - w * fx) * q.z;
      var Y = y + h * fy + ((h - dh) * fy - h * fy) * q.z;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.drawImage(img, X, Y, dw * q.z, dh * q.z);
      g.restore();
      return;
    }
    var s = Math.max(w / img.width, h / img.height);
    var sw = w / s, sh = h / s;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function drawPage(p, num, W) {
    var H = Math.round(W / RATIO), cq = W / 100;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    var paper = paperOf(p);
    g.fillStyle = paper; g.fillRect(0, 0, W, H);

    var items = (p.items || []).slice().sort(function (a, b) { return (a.zi || 1) - (b.zi || 1); });
    var keys = items.filter(function (it) { return it.kind === "photo" && it.photo; })
                    .map(function (it) { return it.photo; });

    return Promise.all(keys.map(function (k) {
      return Photos.get(k).then(function (src) { return src ? loadImg(src) : null; })
        .catch(function () { return null; });
    })).then(function (imgs) {
      var pic = {};
      keys.forEach(function (k, i) { if (imgs[i]) pic[k] = imgs[i]; });

      items.forEach(function (it) {
        var x = it.x / 100 * W, y = it.y / 100 * H, w = it.w / 100 * W, h = it.h / 100 * H;
        g.save();
        if (it.rot) {
          g.translate(x + w / 2, y + h / 2); g.rotate(it.rot * Math.PI / 180);
          g.translate(-(x + w / 2), -(y + h / 2));
        }
        if (it.kind === "photo") drawPhoto(g, it, pic[it.photo], x, y, w, h, cq);
        else if (it.kind === "line") drawDeco(g, lineShapes(it, it.w, it.h / RATIO, lineInk(it, paper)), x, y, w, h, cq);
        else drawText(g, it, paper, x, y, w, h, cq);
        g.restore();
      });

      /* ページ番号（見る画面と同じ） */
      if (num) {
        var fs = 2.6 * cq;
        g.font = "400 " + fs + "px " + cssVar("--mincho");
        try { g.letterSpacing = (0.2 * fs) + "px"; } catch (e) {}
        var m = g.measureText(String(num));
        var asc = m.fontBoundingBoxAscent || fs * 0.88, dsc = m.fontBoundingBoxDescent || fs * 0.12;
        g.fillStyle = nomInk(paper);
        g.textBaseline = "alphabetic";
        g.fillText(String(num), (W - m.width) / 2, H - 2.2 * cq - dsc);
        try { g.letterSpacing = "0px"; } catch (e) {}
      }
      return c;
    });
  }

  /* 表紙・裏表紙。★題名の書式は coverHTML と .ctitle（style.css）に合わせる */
  function drawCover(a, side, W) {
    var H = Math.round(W / RATIO), cq = W / 100, b = bindingOf(a);
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    return loadImg(side === "back" ? b.back : b.front).then(function (img) {
      g.drawImage(img, 0, 0, W, H);
      if (side !== "front" || !a.title) return c;
      var fs = COVER_T.size * cq, lh = fs * COVER_T.lh, bw = COVER_T.width / 100 * W;
      g.font = "700 " + fs + "px " + cssVar("--mincho");
      try { g.letterSpacing = (COVER_T.ls * fs) + "px"; } catch (e) {}
      var lines = wrap(g, a.title, bw);
      var m = g.measureText("国");
      var asc = m.fontBoundingBoxAscent || fs * 0.88, dsc = m.fontBoundingBoxDescent || fs * 0.12;
      var top = COVER_T.top / 100 * H - lines.length * lh / 2;
      g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 0.5 * cq; g.shadowOffsetY = 0.3 * cq;
      g.fillStyle = b.ink; g.textBaseline = "alphabetic";
      lines.forEach(function (ln, i) {
        var lw = g.measureText(ln).width;
        g.fillText(ln, (W - lw) / 2, top + i * lh + (lh - (asc + dsc)) / 2 + asc);
      });
      return c;
    }).catch(function () {
      g.fillStyle = "#2b2f36"; g.fillRect(0, 0, W, H);
      return c;
    });
  }

  function drawPhoto(g, it, img, x, y, w, h, cq) {
    /* 空の枠は何も描かない（画面の「写真を入れる」は組むための印なので本には載せない） */
    if (!img) return;
    var fr = it.frame;
    if (fr === "ふち") {
      var pad = 1.6 * cq;
      g.save();
      shadowAt(g, it.rot, 0, 0.4 * cq, 1.4 * cq, "rgba(0,0,0,.18)");
      g.fillStyle = "#fff"; g.fillRect(x, y, w, h);
      g.restore();
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      cover(g, img, x + pad, y + pad, w - 2 * pad, h - 2 * pad, it);
      g.restore();
      return;
    }
    g.save();
    if (fr === "丸") { g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
    else if (fr === "丸角") roundRect(g, x, y, w, h, 2.5 * cq);
    else { g.beginPath(); g.rect(x, y, w, h); }
    g.clip();
    cover(g, img, x, y, w, h, it);
    g.restore();
  }

  /* 影を付ける。
     ★canvas の影のずれは「回す前の向き」で効く。画面（CSS）の影は部品と一緒に回るので、
       傾けた部品はずれの向きを同じだけ回してから渡す */
  function shadowAt(g, rot, dx, dy, blur, color) {
    var a = (rot || 0) * Math.PI / 180;
    g.shadowColor = color; g.shadowBlur = blur;
    g.shadowOffsetX = dx * Math.cos(a) - dy * Math.sin(a);
    g.shadowOffsetY = dx * Math.sin(a) + dy * Math.cos(a);
  }
  /* 飾りの形（boxShapes / lineShapes）を、枠の左上を原点・1＝1cqw にして描く */
  function drawDeco(g, shapes, x, y, w, h, cq) {
    if (!shapes.length) return;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(x, y); g.scale(cq, cq);
    paintShapes(g, shapes);
    g.restore();
  }

  function drawText(g, it, paper, x, y, w, h, cq) {
    var real = textInk(it, paper);
    drawDeco(g, boxShapes(it, it.w, it.h / RATIO, real), x, y, w, h, cq);
    if (!it.text) return;
    var fs = 4.2 * (it.size || 1) * cq, lh = fs * 1.75, pad = boxPad(it) * cq;
    var cw = w - 2 * pad, ch = h - 2 * pad;
    g.font = fontOf(it, fs);
    var lines = wrap(g, it.text, cw);
    var m = g.measureText("国");
    var asc = m.fontBoundingBoxAscent || fs * 0.88, dsc = m.fontBoundingBoxDescent || fs * 0.12;
    /* 枠の上下まん中に寄せる（画面の justify-content:center と同じ。はみ出たら上下とも切れる） */
    var top = y + pad + (ch - lines.length * lh) / 2;
    var olw = (it.olW || 0) * 2 * cq, edge = edgeInk(it, real);
    var pos = lines.map(function (ln, i) {
      var lw = g.measureText(ln).width;
      return [ln, x + (it.align === "center" ? pad + (cw - lw) / 2 : it.align === "right" ? pad + cw - lw : pad),
              top + i * lh + (lh - (asc + dsc)) / 2 + asc];
    });
    function glyphs(t, dx, dy) {
      t.textBaseline = "alphabetic";
      pos.forEach(function (q) {
        if (olw > 0) { t.lineWidth = olw; t.strokeStyle = edge; t.lineJoin = "miter"; t.strokeText(q[0], q[1] - dx, q[2] - dy); }
        t.fillStyle = real; t.fillText(q[0], q[1] - dx, q[2] - dy);
      });
    }
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    var sh = shadowOf(it, real);
    if (sh) {
      /* ★影は「縁取りと中身を合わせた形」から1回だけ落とす（画面と同じ）。
         別の紙に字を描き、紙そのものは見えない遠くへ置いて、影だけをこちらへ落とす。
         ★字そのものは別の紙を通さずに直に描く。透明な紙に描いた字は細く薄く出る */
      var X0 = Math.floor(x), Y0 = Math.floor(y), FAR = 100000;
      var L = document.createElement("canvas");
      L.width = Math.max(1, Math.ceil(w + 1)); L.height = Math.max(1, Math.ceil(h + 1));
      var t = L.getContext("2d");
      t.font = g.font;
      glyphs(t, X0, Y0);
      shadowAt(g, it.rot, sh.dx * cq, sh.dy * cq, sh.blur * cq, sh.color);
      /* 影のずれは回す前の向きで効くので、遠くへやる分も回す前の向きで足す */
      var a = (it.rot || 0) * Math.PI / 180;
      g.shadowOffsetX += FAR * Math.cos(a); g.shadowOffsetY += FAR * Math.sin(a);
      g.drawImage(L, X0 - FAR, Y0);
      L.width = L.height = 1;
      g.shadowColor = "transparent"; g.shadowOffsetX = g.shadowOffsetY = 0; g.shadowBlur = 0;
    }
    glyphs(g, 0, 0);
    g.restore();
  }

  function jpeg(c, q) {
    return new Promise(function (ok, ng) {
      if (c.toBlob) {
        c.toBlob(function (b) {
          if (!b) return ng(new Error("ページを絵にできませんでした"));
          b.arrayBuffer().then(function (ab) { ok(new Uint8Array(ab)); }, ng);
        }, "image/jpeg", q);
      } else {
        var d = c.toDataURL("image/jpeg", q), s = atob(d.split(",")[1]);
        var u = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        ok(u);
      }
    });
  }

  /* ---------- PDFの組み立て ----------
     ★書いた先から外へ流す。最後に全部を抱えないので、ページが多くても落ちない */
  function ascii(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
    return u;
  }
  /* 日本語の題名は UTF-16 の16進で書く（PDFの決まり） */
  function pdfText(s) {
    var h = "FEFF";
    for (var i = 0; i < s.length; i++) h += ("000" + s.charCodeAt(i).toString(16)).slice(-4);
    return "<" + h.toUpperCase() + ">";
  }
  function Writer(sink) {
    var pos = 0, offs = [];
    function put(u) { pos += u.length; return sink.write(u); }
    function obj(n, body, stream) {
      offs[n] = pos;
      var head = n + " 0 obj" + NL + body + NL;
      if (!stream) return put(ascii(head + "endobj" + NL));
      return put(ascii(head + "stream" + NL))
        .then(function () { return put(stream); })
        .then(function () { return put(ascii(NL + "endstream" + NL + "endobj" + NL)); });
    }
    function xref(size, root, info) {
      var x = pos, s = "xref" + NL + "0 " + size + NL + "0000000000 65535 f " + NL;
      for (var i = 1; i < size; i++) s += ("000000000" + (offs[i] || 0)).slice(-10) + " 00000 n " + NL;
      s += "trailer" + NL + "<< /Size " + size + " /Root " + root + " 0 R /Info " + info + " 0 R >>"
        + NL + "startxref" + NL + x + NL + "%%EOF" + NL;
      return put(ascii(s));
    }
    return { put: put, obj: obj, xref: xref };
  }

  /* 本体。onStep(何ページ目まで出来たか)。stop() が true を返したら途中でやめる */
  function build(a, qual, sink, onStep, stop) {
    var Q = QUALITY[qual] || QUALITY.fine;
    var pgs = readSeq(a), n = pgs.length, off = bindingOf(a) ? 1 : 0;
    var wr = Writer(sink);
    /* 番号の振り方: 1=目録 2=ページの束 3=題名など、ページごとに 3つずつ */
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((4 + i * 3) + " 0 R");
    var pw = PAGE_W.toFixed(2), ph = PAGE_H.toFixed(2);

    var chain = wr.put(ascii("%PDF-1.4" + NL + "%âãÏÓ" + NL))
      .then(function () { return fontsReady(a); });
    pgs.forEach(function (p, i) {
      chain = chain.then(function () {
        if (stop && stop()) throw new Error("stop");
        return p.cover ? drawCover(a, p.cover, Q.w) : drawPage(p, i + 1 - off, Q.w);
      }).then(function (cv) {
        var cw = cv.width, ch = cv.height;
        return jpeg(cv, Q.q).then(function (img) {
          cv.width = cv.height = 1;               /* 描いた絵はすぐ手放す */
          var po = 4 + i * 3, co = po + 1, io = po + 2;
          var draw = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
          return wr.obj(po, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "]"
              + " /Resources << /XObject << /Im0 " + io + " 0 R >> >> /Contents " + co + " 0 R >>")
            .then(function () { return wr.obj(co, "<< /Length " + draw.length + " >>", ascii(draw)); })
            .then(function () {
              return wr.obj(io, "<< /Type /XObject /Subtype /Image /Width " + cw + " /Height " + ch
                + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
                + img.length + " >>", img);
            });
        });
      }).then(function () { if (onStep) onStep(i + 1, n); });
    });
    return chain
      .then(function () { return wr.obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); })
      .then(function () {
        return wr.obj(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>");
      })
      .then(function () {
        return wr.obj(3, "<< /Title " + pdfText(a.title || "写真帖") + " /Creator " + pdfText("写真帖")
          + " /Producer " + pdfText("写真帖 " + BUILD) + " >>");
      })
      .then(function () { return wr.xref(4 + n * 3, 1, 3); });
  }

  /* ---------- 書き出す先 ----------
     Android の中 … 入れ物（MainActivity）へ少しずつ渡して、端末の「ダウンロード/写真帖」へ置く
     ブラウザ     … ためておいて、最後にファイルとして保存させる */
  function b64(u) {
    var s = "", STEP = 0x8000;
    for (var i = 0; i < u.length; i += STEP) {
      s += String.fromCharCode.apply(null, u.subarray(i, Math.min(u.length, i + STEP)));
    }
    return btoa(s);
  }
  function inApp() {
    try { return !!(window.ShashinCho && ShashinCho.pdfBegin); } catch (e) { return false; }
  }
  function appSink(name) {
    var err = ShashinCho.pdfBegin(name);
    if (err) throw new Error(err);
    var buf = [], size = 0, LIMIT = 768 * 1024;
    function send() {
      if (!size) return;
      var u = new Uint8Array(size), o = 0;
      buf.forEach(function (b) { u.set(b, o); o += b.length; });
      buf = []; size = 0;
      var e = ShashinCho.pdfPart(b64(u));
      if (e) throw new Error(e);
    }
    return {
      write: function (u) { buf.push(u); size += u.length; if (size >= LIMIT) send(); return Promise.resolve(); },
      end: function () { send(); var where = ShashinCho.pdfEnd(); if (!where) throw new Error("保存できませんでした"); return where; },
      abort: function () { try { ShashinCho.pdfAbort(); } catch (e) {} }
    };
  }
  function webSink(name) {
    var parts = [];
    return {
      write: function (u) { parts.push(u); return Promise.resolve(); },
      blob: function () { return new Blob(parts, { type: "application/pdf" }); },
      end: function () {
        /* ★iPhone は自動で落とさない（ホーム画面から開くと黙って効かないことがある）。
           できた物を持っておき、窓のボタンから共有画面で渡す（Ios.save） */
        if (window.Ios && Ios.wantsShare()) { this.saved = this.blob(); return name; }
        var url = URL.createObjectURL(this.blob());
        var link = document.createElement("a");
        link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        return name;
      },
      abort: function () { parts = []; }
    };
  }
  function fileName(t) {
    var s = String(t || "写真帖").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "写真帖";
    return s.slice(0, 60) + ".pdf";
  }

  /* ---------- 画面 ---------- */
  function start(a) {
    var n = (a.pages || []).length;
    ask("「" + (a.title || "無題") + "」をPDFにする",
      n + "ページ" + (bindingOf(a) ? "（＋表紙と裏表紙）" : "") + "を1つのPDFにまとめます。画質を選んでください。" + NL
      + "空の枠（写真を入れていない所）は何も載りません。", [
      { label: QUALITY.fine.name, kind: "", value: "fine" },
      { label: QUALITY.light.name, value: "light" },
      { label: "やめる", value: null }
    ]).then(function (q) { if (q) run(a, q); });
  }

  function run(a, q) {
    var name = fileName(a.title), cancel = false, sink;
    var w = document.createElement("div");
    w.className = "modal";
    w.innerHTML = '<div class="box"><h3>PDFを作っています</h3>'
      + '<p id="pdfmsg">準備しています…</p>'
      + '<div class="bar"><i id="pdfbar"></i></div>'
      + '<button class="big ghost" id="pdfno">やめる</button></div>';
    document.body.appendChild(w);
    $("#pdfno", w).onclick = function () { cancel = true; $("#pdfmsg", w).textContent = "やめています…"; };

    try { sink = inApp() ? appSink(name) : webSink(name); }
    catch (e) { w.remove(); toast(e.message || "保存の用意ができませんでした"); return; }

    build(a, q, sink, function (i, n) {
      var m = $("#pdfmsg", w), b = $("#pdfbar", w);
      if (m) m.textContent = i + " / " + n + " ページ";
      if (b) b.style.width = Math.round(i / n * 100) + "%";
    }, function () { return cancel; }).then(function () {
      var where = sink.end();
      w.remove();
      if (sink.saved) return Ios.save(sink.saved, name, "📄 PDFができました",
        "下のボタンで、端末に残すか、LINEなどで渡してください。");
      done(where);
    }).catch(function (e) {
      sink.abort(); w.remove();
      if (e && e.message === "stop") toast("やめました");
      else toast("PDFを作れませんでした（" + ((e && e.message) || "原因不明") + "）");
    });
  }

  function done(where) {
    if (!inApp()) { toast("PDFを保存しました（" + where + "）"); return; }
    var canShare = false;
    try { canShare = !!ShashinCho.pdfShare; } catch (e) {}
    ask("PDFを保存しました", "置き場所: " + where, (canShare ? [
      { label: "LINEなどで渡す", kind: "", value: "share" }] : []).concat([
      { label: "閉じる", value: null }
    ])).then(function (v) {
      if (v === "share" && !ShashinCho.pdfShare()) toast("渡す画面を開けませんでした");
    });
  }

  return { start: start, build: build, drawPage: drawPage, drawCover: drawCover, webSink: webSink,
           QUALITY: QUALITY };
})();

/* =========================================================
   1冊のファイル（人に渡す／受け取る）
   ★ファイルの形は「1行に1つの JSON」。
       1行目   … 本の中身（題名・ページ・表紙のデザイン）。kind で写真帖の本だと分かる
       2行目〜 … 写真1枚ずつ { id, data }（data は data:image/... の文字列）
     1行ずつ書いて1行ずつ読むので、写真の多い本でも全部を抱えずに済む。
   ★受け取った本は必ず「見るだけ」（locked）。渡す側の本はそのまま組める。
   ★受け取ったファイルの中身は信用しない。誌面の書式（style）に入る値は
     数・真偽・記号を含まない短い文字だけ通す（clean）。写真の鍵は付け替える。
   ★「見るだけ」はアプリの決まり。ファイルを専門の道具で書き換えれば外せるので、
     鍵のかかった金庫ではない
   ========================================================= */
var BookFile = (function () {
  var KIND = "shashincho-book", VER = 1, EXT = ".shashincho";

  function inApp() {
    try { return !!(window.ShashinCho && ShashinCho.fileBegin); } catch (e) { return false; }
  }
  function b64(u) {
    var s = "", STEP = 0x8000;
    for (var i = 0; i < u.length; i += STEP) {
      s += String.fromCharCode.apply(null, u.subarray(i, Math.min(u.length, i + STEP)));
    }
    return btoa(s);
  }
  /* 書く先。アプリでは端末の「ダウンロード/写真帖」へ少しずつ、PCではダウンロード */
  function sinkFor(name) {
    if (inApp()) {
      var err = ShashinCho.fileBegin(name, "application/octet-stream");
      if (err) throw new Error(err);
      return {
        write: function (u) {
          var e = ShashinCho.pdfPart(b64(u));
          if (e) throw new Error(e);
        },
        end: function () { var w = ShashinCho.pdfEnd(); if (!w) throw new Error("保存できませんでした"); return w; },
        abort: function () { try { ShashinCho.pdfAbort(); } catch (e) {} }
      };
    }
    var parts = [];
    return {
      write: function (u) { parts.push(u); },
      end: function () {
        /* ★iPhone は窓のボタンから共有画面で渡す（PDF と同じ） */
        if (window.Ios && Ios.wantsShare()) {
          this.saved = new Blob(parts, { type: "application/octet-stream" }); return name;
        }
        var url = URL.createObjectURL(new Blob(parts, { type: "application/octet-stream" }));
        var link = document.createElement("a");
        link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        return name;
      },
      abort: function () { parts = []; }
    };
  }
  function fileName(t) {
    var s = String(t || "写真帖").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "写真帖";
    return s.slice(0, 60) + EXT;
  }
  /* 本の中身（1行目）。写真の実体は入れない。★id と日付は受け取る側で付け直す */
  function head(a, n) {
    return { kind: KIND, v: VER, title: a.title || "無題", binding: a.binding || null,
             pages: a.pages || [], photos: n, made: today() };
  }

  /* 進み具合の窓 */
  function progress(title) {
    var w = document.createElement("div"), stop = { v: false };
    w.className = "modal";
    w.innerHTML = '<div class="box"><h3>' + esc(title) + '</h3>'
      + '<p class="pm">準備しています…</p><div class="bar"><i></i></div>'
      + '<button class="big ghost">やめる</button></div>';
    document.body.appendChild(w);
    $("button", w).onclick = function () { stop.v = true; $(".pm", w).textContent = "やめています…"; };
    return {
      stop: stop,
      step: function (msg, r) { $(".pm", w).textContent = msg; $(".bar i", w).style.width = Math.round(r * 100) + "%"; },
      close: function () { w.remove(); }
    };
  }

  /* ---------- 渡す ---------- */
  function start(a) {
    var keys = Store.photoKeys(a);
    ask("「" + (a.title || "無題") + "」を1冊のファイルにする",
      (a.pages || []).length + "ページ・写真" + keys.length + "枚を、1つのファイルにまとめます。" + NL
      + "目安の大きさ 約" + Math.max(1, Math.round(keys.length * 0.7)) + "MB" + NL + NL
      + "写真帖を入れている人なら、本棚の「本を受け取る」から入れられます。" + NL
      + "受け取った人は見るだけで、編集はできません。", [
      { label: "ファイルにする", kind: "", value: true },
      { label: "やめる", value: null }
    ]).then(function (yes) { if (yes) run(a, keys); });
  }
  function run(a, keys) {
    var name = fileName(a.title), sink, ui = progress("ファイルにしています");
    var enc = new TextEncoder(), missing = 0;
    try { sink = sinkFor(name); }
    catch (e) { ui.close(); toast(e.message || "保存の用意ができませんでした"); return; }
    /* 1枚ずつ取り出して書く。★抱えるのは常に1枚分だけ */
    var i = 0;
    function next() {
      if (ui.stop.v) return Promise.reject(new Error("stop"));
      if (i >= keys.length) return Promise.resolve();
      var k = keys[i++];
      ui.step("写真 " + i + " / " + keys.length, i / keys.length);
      return Photos.raw(k).then(function (d) {
        if (!d) { missing++; return next(); }
        sink.write(enc.encode(JSON.stringify({ id: k, data: d }) + "\n"));
        return next();
      });
    }
    Store.flush();
    Promise.resolve().then(function () {
      sink.write(enc.encode(JSON.stringify(head(a, keys.length)) + "\n"));
      return next();
    }).then(function () {
      var where = sink.end();
      ui.close();
      if (sink.saved) return Ios.save(sink.saved, name, "📚 ファイルにしました",
        "下のボタンで、LINEなどで渡すか、「ファイル」アプリに保存してください。"
        + "受け取った人は本棚の「本を受け取る」から入れられます（見るだけ）。"
        + (missing ? "<br>（見つからない写真が" + missing + "枚あり、その枠は空で渡ります）" : ""));
      done(where, missing);
    }).catch(function (e) {
      sink.abort(); ui.close();
      if (e && e.message === "stop") toast("やめました");
      else toast("ファイルにできませんでした（" + ((e && e.message) || "原因不明") + "）");
    });
  }
  function done(where, missing) {
    var note = missing ? NL + "（見つからない写真が" + missing + "枚あり、その枠は空で渡ります）" : "";
    if (!inApp()) { toast("ファイルを保存しました（" + where + "）" + note); return; }
    var canShare = false;
    try { canShare = !!ShashinCho.pdfShare; } catch (e) {}
    ask("ファイルにしました", "置き場所: " + where + note + NL + NL
      + "LINEなどで送るときは、写真ではなく「ファイル」として送られます。", (canShare ? [
      { label: "LINEなどで渡す", kind: "", value: "share" }] : []).concat([
      { label: "閉じる", value: null }
    ])).then(function (v) {
      if (v === "share" && !ShashinCho.pdfShare()) toast("渡す画面を開けませんでした");
    });
  }

  /* ---------- 受け取る ---------- */
  function receive() {
    var inp = document.createElement("input");
    inp.type = "file";
    /* ★iPhone は知らない拡張子で絞ると、ファイルが選べなくなることがある。iPhone では絞らない */
    if (!(window.Ios && Ios.isIos())) inp.accept = EXT;
    inp.style.display = "none";
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (f) take(f);
    };
    document.body.appendChild(inp);
    inp.click();
  }

  /* ★style の中に入る値。数・真偽はそのまま、文字は記号を含まない短いものだけ */
  var SAFE = /^[^"'<>;:(){}\\&`\u0000-\u001f]*$/;
  function val(v) {
    if (typeof v === "number") return isFinite(v) ? v : undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "string" && v.length <= 40 && SAFE.test(v)) return v;
    return undefined;
  }
  function cleanItem(it, ids) {
    if (!it || typeof it !== "object") return null;
    if (["photo", "text", "line"].indexOf(it.kind) < 0) return null;
    var o = {};
    for (var k in it) {
      if (!Object.prototype.hasOwnProperty.call(it, k)) continue;
      if (k === "id") continue;
      if (k === "text") { o.text = String(it.text == null ? "" : it.text).slice(0, 2000); continue; }
      if (k === "photo") { o.photo = (it.photo && ids[it.photo]) || null; continue; }
      var v = val(it[k]);
      if (v !== undefined) o[k] = v;
    }
    o.id = uid("i");
    ["x", "y", "w", "h"].forEach(function (n) { if (typeof o[n] !== "number") o[n] = 0; });
    return o;
  }
  function cleanAlbum(h, ids) {
    var pages = (Array.isArray(h.pages) ? h.pages : []).slice(0, 500).map(function (p) {
      p = p && typeof p === "object" ? p : {};
      var q = {};
      for (var k in p) {
        if (!Object.prototype.hasOwnProperty.call(p, k) || k === "id" || k === "items") continue;
        var v = val(p[k]);
        if (v !== undefined) q[k] = v;
      }
      q.id = uid("p");
      q.mode = p.mode === "自由" ? "自由" : "型";
      q.items = (Array.isArray(p.items) ? p.items : []).slice(0, 200)
        .map(function (it) { return cleanItem(it, ids); }).filter(Boolean);
      return q;
    });
    var a = { title: String(h.title || "無題").slice(0, 40), pages: pages,
              locked: true, gotAt: today() };
    if (bindingOf({ binding: h.binding })) a.binding = h.binding;
    return a;
  }
  var PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

  /* 1行ずつ読む。★ファイル全部を文字にしない（写真の多い本で落ちる） */
  function lines(file, onLine, onStep, stop) {
    var CH = 2 * 1024 * 1024, off = 0, rest = "", dec = new TextDecoder("utf-8");
    function chunk() {
      if (stop.v) return Promise.reject(new Error("stop"));
      if (off >= file.size) {
        rest += dec.decode();
        return rest ? Promise.resolve(onLine(rest)) : Promise.resolve();
      }
      var b = file.slice(off, off + CH);
      off += CH;
      return b.arrayBuffer().then(function (buf) {
        rest += dec.decode(new Uint8Array(buf), { stream: true });
        var ls = rest.split("\n");
        rest = ls.pop();
        onStep(Math.min(1, off / file.size));
        return ls.reduce(function (pr, l) {
          return pr.then(function () { return l ? onLine(l) : null; });
        }, Promise.resolve()).then(chunk);
      });
    }
    return chunk();
  }

  function take(file) {
    var ui = progress("本を受け取っています"), h = null, ids = {}, put = [], n = 0;
    lines(file, function (l) {
      var o;
      try { o = JSON.parse(l); } catch (e) { throw new Error("写真帖の本のファイルではありません"); }
      if (!h) {
        if (!o || o.kind !== KIND) throw new Error("写真帖の本のファイルではありません");
        if (o.v > VER) throw new Error("新しい写真帖で作られた本です。アプリを新しくしてください");
        h = o;
        return;
      }
      if (!o || typeof o.id !== "string" || typeof o.data !== "string" || !PHOTO.test(o.data)) return;
      if (ids[o.id]) return;
      var nid = uid("r") + uid("");
      ids[o.id] = nid;
      put.push(nid);
      n++;
      return Photos.put(nid, o.data, true);
    }, function (r) {
      ui.step(h ? "写真 " + n + " / " + (h.photos || "?") : "読んでいます…", r);
    }, ui.stop).then(function () {
      if (!h) throw new Error("写真帖の本のファイルではありません");
      var a = Store.add(cleanAlbum(h, ids));
      Store.flush();
      ui.close();
      Shelf.render();
      var lack = (h.photos || 0) - n;
      toast("「" + a.title + "」を本棚に入れました（見るだけ）" + (lack > 0 ? "　写真" + lack + "枚が読めませんでした" : ""));
    }).catch(function (e) {
      /* ★途中でやめた・壊れていた時は、しまいかけた写真を片付ける */
      Photos.del(put);
      ui.close();
      if (e && e.message === "stop") toast("やめました");
      else toast((e && e.message) || "受け取れませんでした");
    });
  }

  return { start: start, receive: receive, take: take, cleanAlbum: cleanAlbum, EXT: EXT };
})();

/* =========================================================
   全体の行き来
   ========================================================= */
var App = (function () {
  var cur = null, where = "shelf";

  function album() { return cur; }

  /* how は3通り
       なし／"push" … 履歴を1つ積む（アルバムを開いたとき）
       "replace"     … 積まずに書き換える（見る／組むの切り替え）
       "back"        … 何もしない（戻ってきたとき） */
  function show(name, how) {
    /* ★受け取った本（見るだけ）は組む画面に入れない。
       入口（本棚の「…」・見る／組むの切り替え）は出していないが、
       戻る操作の履歴から来ることもあるので、ここでも止める */
    if (name === "make" && cur && cur.locked) name = "read";
    where = name;
    $("#shelf").hidden = name !== "shelf";
    $("#read").hidden = name !== "read";
    $("#make").hidden = name !== "make";
    $("#tabs").hidden = name === "shelf" || !!(cur && cur.locked);
    $("#back").hidden = name === "shelf";
    $("#who").textContent = (name === "shelf" || !cur) ? ""
      : (cur.title || "無題") + (cur.locked ? "（見るだけ）" : "");
    $("#tab-read").className = name === "read" ? "on" : "";
    $("#tab-make").className = name === "make" ? "on" : "";
    if (name === "shelf") { cur = null; Shelf.render(); }
    if (name === "read") Read.render();
    if (name === "make") Make.open(Read.at());

    /* ★積むのは「アルバムを開いたとき」だけ。
       見る／組むの切り替えまで積むと、行き来した回数だけ履歴が伸びて
       ‹ を押しても一覧に着かない（実際そうなっていた）。
       Androidの入れ物は web.canGoBack() を見て戻るので、
       これで「アルバム → 一覧 → アプリを閉じる」の順になる */
    if (how !== "back") {
      var st = { name: name, id: cur ? cur.id : null };
      try {
        if (how === "replace") history.replaceState(st, "", "#" + name);
        else history.pushState(st, "", "#" + name);
      } catch (e) {}
    }
  }

  /* ‹ を押したとき＝保存して一覧へ戻る。
     ★打っている途中の文字も取りこぼさないよう、いったん指を離してから書き切る。
       打ちかけの文字は指を離したときに確定するので、先に blur する */
  function toShelf() {
    var a = document.activeElement;
    if (a && a.blur) { try { a.blur(); } catch (e) {} }
    setTimeout(function () {
      var err = Store.flush();
      if (!err) toast("保存しました");
      /* Androidの「戻る」と同じ道を通す。履歴は［一覧, アルバム］の2つだけ */
      var st = null;
      try { st = history.state; } catch (e) {}
      if (st && st.name && st.name !== "shelf") history.back();
      else show("shelf", "replace");
    }, 0);
  }

  function open(id, to, how) {
    var a = Store.byId(id);
    if (!a) return;
    cur = a;
    /* ★最初に出す2ページ分だけ先に引き上げる。
       アルバム全部を待つと、枚数が増えるほど開くのが遅くなる */
    withPhotos(photoKeysOf(a.pages || [], [0, 1]), function () {
      show(to || "read", how);
    });
  }

  function start() {
    Store.load();
    /* ★初回だけ見本を入れる。書き込みの完了は待たない
       （Photos.put は手元の控えに先に入るので、絵はすぐ出る） */
    if (!Store.all().length) {
      seedSamples();
      Store.add(sampleAlbum());
    }

    (function () {
      show("shelf", "replace");

      $("#back").onclick = toShelf;

      addEventListener("popstate", function (e) {
        var st = e.state || { name: "shelf", id: null };
        if (st.name !== "shelf" && st.id) {
          if (!cur || cur.id !== st.id) { open(st.id, st.name, "back"); return; }
        }
        show(st.name, "back");
      });

      var bd = $("#build");
      if (bd) bd.textContent = buildMark();
      /* ★見え方が変わるだけなので、履歴は積まずに書き換える */
      $("#tab-read").onclick = function () { if (cur) show("read", "replace"); };
      $("#tab-make").onclick = function () { if (cur) show("make", "replace"); };
      $("#prev").onclick = function () { Read.go(-1); };
      /* 表紙へ一気に戻る（表紙のデザインが無い本は1ページ目） */
      $("#home").onclick = function () { Read.jump(0); };
      $("#next").onclick = function () { Read.go(1); };
      $("#mode").onclick = function () { Read.flip(); };

      addEventListener("keydown", function (e) {
        if (where !== "read") return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
          Read.go(1); e.preventDefault();
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { Read.go(-1); e.preventDefault(); }
      });

      var rz = null;
      var lastW = window.innerWidth;
      var coarse = false;
      try { coarse = matchMedia("(pointer: coarse)").matches; } catch (e) {}

      var again = function () {
        if (rz) clearTimeout(rz);
        rz = setTimeout(function () {
          /* ★その1 打っている最中は何もしない。
             組み直すと欄ごと作り直され、指が離れてキーボードが閉じる。
             「文字を打とうとすると戻ってしまう」の正体はこれ */
          var a = document.activeElement;
          if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;

          /* ★その2 指で触る端末で、幅が変わっていないなら
             キーボードが出入りしただけ。誌面の組みは変わらない */
          var w = window.innerWidth;
          if (coarse && w === lastW) return;
          lastW = w;

          if (where === "read") Read.render();
          else if (where === "make") Make.rebuild();
          else if (where === "shelf") Shelf.render();
        }, 220);
      };
      addEventListener("resize", again);
      addEventListener("orientationchange", again);

      /* 閉じられる時・裏に回る時にも書き切る。
         ★visibilitychange のほうが確実。スマホは pagehide が来ないことがある */
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) Store.flush();
      });
      addEventListener("pagehide", function () { Store.flush(); });
    })();
  }

  return { start: start, show: show, open: open, album: album };
})();

App.start();
