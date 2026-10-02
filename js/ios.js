"use strict";
/* ══════════════════════════════════════════════════
   ios.js — iPhone / iPad で使うときの手当て（マイカラの ios.js から写した）

   iPhone には Android のような「インストール」ボタンが作れない。
   ページ側から「入れますか？」を出す合図を Apple が用意していないので、
   本人に 共有 → ホーム画面に追加 を押してもらうしかない。ここはその案内係。

   ★ホーム画面に追加してもらうのは見た目のためだけではない。
     Safari で開いているだけだと、しばらく使わない期間があったときに
     中身（アルバムと写真）が消されることがある。ホーム画面に追加したものは
     その対象から外れる＝「追加してもらう」はアルバムを守る工程でもある。

   ★もう1つの仕事＝ファイルの手渡し（save）。
     iPhone はホーム画面から開いた状態だと <a download> が黙って効かないことがある。
     こちらからは実機を確かめられないので、iPhone では端末の共有画面
     （「ファイルに保存」「LINE」などが並ぶ画面）で渡す。
     ★共有画面は「押した瞬間」にしか開けない。作り終わってから出る窓のボタンで開く。

   ★iPhone 以外（PC・Android の入れ物）では案内は何も出ない。
   ══════════════════════════════════════════════════ */
var Ios = (function () {

  var KEY = "shashincho.iosGuideHidden";
  var $id = function (id) { return document.getElementById(id); };

  /* ---- 置かれ方の手当て ----
     置き場所によっては、ページが「外側の入れ物」に包まれて配られ、
     <head> の名札（アイコン・アプリ名・全画面の指定）が <body> に落ちる。
     iPhone は「ホーム画面に追加」を押したその時にこれらを見に行くので戻しておく。
     GitHub Pages は素のまま配るので、ふつうは何も起きない。 */
  function liftHead() {
    var head = document.head;
    if (!head || !document.body) return 0;
    var sel = 'title,' +
      'link[rel="manifest"],link[rel="apple-touch-icon"],link[rel="icon"],' +
      'meta[name="theme-color"],meta[name="mobile-web-app-capable"],' +
      'meta[name="apple-mobile-web-app-capable"],' +
      'meta[name="apple-mobile-web-app-title"],' +
      'meta[name="apple-mobile-web-app-status-bar-style"]';
    var moved = 0;
    Array.prototype.forEach.call(document.body.querySelectorAll(sel), function (n) {
      head.appendChild(n);
      moved++;
    });
    return moved;
  }

  /* ---- 見分け ---- */

  /* iPhone / iPad か。★iPadOS 13以降は Mac と名乗るので「Mac なのに指で触れる」で見分ける */
  function isIos() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && typeof document.ontouchend !== "undefined";
  }
  function isStandalone() {
    if (window.navigator.standalone === true) return true;
    try { return window.matchMedia("(display-mode: standalone)").matches; }
    catch (e) { return false; }
  }
  /* LINE や Instagram の中で開いた画面。ここからはホーム画面に入れられない */
  function inApp() {
    return /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|KAKAOTALK/i
      .test(navigator.userAgent || "");
  }
  function isSafari() {
    var ua = navigator.userAgent || "";
    if (inApp()) return false;
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
  }
  /* Android の入れ物（APK）の中か。
     ★入れ物は https://shashincho.local/ を名乗るので、https かどうかでは見分けられない */
  function inApk() {
    return typeof window.ShashinCho !== "undefined" || location.hostname === "shashincho.local";
  }
  function shouldOffer() { return isIos() && !inApk() && !isStandalone(); }

  function hidden() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function hide() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { /* 覚えられなくても困らない */ }
  }
  function say(m) { if (typeof window.toast === "function") window.toast(m); }

  function copyUrl() {
    var url = location.href.split("#")[0];
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
          .then(function () { say("アドレスをコピーしました"); })
          ["catch"](function () { say("アドレス欄から手でコピーしてください"); });
        return;
      }
    } catch (e) { /* 下で拾う */ }
    say("アドレス欄から手でコピーしてください");
  }

  /* iOS の共有ボタンの絵（四角から上に矢印）。見た目で名指しできるように */
  var SHARE_SVG =
    '<svg class="iosshare" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5"/>' +
    '<path d="M6.5 11H5.2A1.2 1.2 0 0 0 4 12.2v7.6A1.2 1.2 0 0 0 5.2 21h13.6' +
    'a1.2 1.2 0 0 0 1.2-1.2v-7.6A1.2 1.2 0 0 0 18.8 11h-1.3"/></svg>';

  function steps() {
    return '<span class="iosnum">1</span>下の真ん中の ' + SHARE_SVG + ' を押す<br>' +
           '<span class="iosnum">2</span>出てきた一覧を下にたどる<br>' +
           '<span class="iosnum">3</span>「ホーム画面に追加」を押す';
  }

  /* ---- 下に出る帯 ---- */
  function bar() {
    if (!shouldOffer() || hidden()) return;
    if ($id("iosbar")) return;
    var d = document.createElement("div");
    d.id = "iosbar";
    d.className = "iosbar";
    if (!isSafari()) {
      d.innerHTML =
        '<div class="iosbar-t">📱 Safari で開いてください</div>' +
        '<div class="iosbar-b">この画面のままだと、ホーム画面に入れられません。<br>' +
        'アドレスをコピーして、Safari に貼り付けて開いてください。</div>' +
        '<div class="iosbar-f">' +
          '<button type="button" data-ios="later">あとで</button>' +
          '<button type="button" class="go" data-ios="copy">アドレスをコピー</button></div>';
    } else {
      d.innerHTML =
        '<div class="iosbar-t">📱 ホーム画面に入れて使ってください</div>' +
        '<div class="iosbar-b">' + steps() + '</div>' +
        '<div class="iosbar-w">入れておくと全画面で開き、<b>アルバムと写真が消えにくくなります</b>。' +
        'Safari で開いたままだと、しばらく使わない期間があったときに消されることがあります。</div>' +
        '<div class="iosbar-f">' +
          '<button type="button" data-ios="later">あとで</button>' +
          '<button type="button" class="go" data-ios="done">入れた</button></div>';
    }
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("on"); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-ios]"), function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-ios");
        if (k === "copy") { copyUrl(); return; }
        if (k === "done") hide();
        close();
      };
    });
  }
  function close() {
    var d = $id("iosbar");
    if (!d) return;
    d.classList.remove("on");
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 200);
  }

  /* 本棚の「📱 iPhoneで使う」から開く案内（帯を「あとで」で閉じたあとの入口） */
  function guide() {
    var body = isStandalone()
      ? '<p>✅ もうホーム画面から開いています。このままお使いください。</p>' +
        '<p class="dim">念のための控えには、本棚の「…」→「1冊のファイルにする」が使えます。' +
        '作ったファイルを「ファイル」アプリに保存しておけば、もしもの時に「本を受け取る」から戻せます' +
        '（戻した本は見るだけになります）。</p>'
      : isSafari()
      ? '<p>' + steps() + '</p>' +
        '<p class="dim">ホーム画面にアイコンが並びます。押すと全画面で開き、アドレス欄も出ません。' +
        '入れておくと<b>アルバムと写真が消えにくくなります</b>。</p>'
      : '<p>いま見ているのは Safari ではありません。この画面からはホーム画面に入れられないので、' +
        'アドレスをコピーして Safari に貼り付けて開いてください。</p>';
    var w = document.createElement("div");
    w.className = "modal";
    w.innerHTML = '<div class="box iosguide"><h3>📱 iPhoneで使う</h3>' + body +
      (!isStandalone() && !isSafari() ? '<button class="big" id="iosCopy">アドレスをコピー</button>' : "") +
      '<button class="big ghost" id="iosShut">閉じる</button></div>';
    w.onclick = function (e) { if (e.target === w) w.remove(); };
    document.body.appendChild(w);
    var c = w.querySelector("#iosCopy");
    if (c) c.onclick = copyUrl;
    w.querySelector("#iosShut").onclick = function () { w.remove(); };
  }

  /* ---- ファイルの手渡し ----
     iPhone では作ったファイルを自動で落とさず、窓のボタンから共有画面で渡す。
     共有画面が使えない時（古い iOS など）は、ふつうのダウンロードへ落とす */
  function wantsShare() { return isIos() && !inApk(); }
  function canShareFile(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  /* title＝窓の題、note＝本文。押した瞬間に共有画面を開く */
  function save(blob, name, title, note) {
    var file = null;
    try { file = new File([blob], name, { type: blob.type || "application/octet-stream" }); } catch (e) {}
    var share = file && canShareFile(file);
    var w = document.createElement("div");
    w.className = "modal";
    w.innerHTML = '<div class="box"><h3>' + title + '</h3>' +
      '<p>' + note + (share ? '<br><br>「ファイル」アプリに残すときは、共有画面で「“ファイル”に保存」を選んでください。' : '') + '</p>' +
      (share ? '<button class="big" id="iosShare">📤 保存・LINEなどで渡す</button>' : '') +
      '<button class="big' + (share ? ' ghost' : '') + '" id="iosDl">⬇️ ダウンロードする</button>' +
      '<button class="big ghost" id="iosNo">閉じる</button></div>';
    document.body.appendChild(w);
    var s = w.querySelector("#iosShare");
    if (s) s.onclick = function () {
      navigator.share({ files: [file], title: name })
        .then(function () { w.remove(); })
        ["catch"](function (e) {
          if (e && e.name === "AbortError") return;      /* 自分で閉じただけ */
          say("共有画面を開けませんでした。「ダウンロードする」を試してください");
        });
    };
    w.querySelector("#iosDl").onclick = function () { download(blob, name); };
    w.querySelector("#iosNo").onclick = function () { w.remove(); };
  }

  /* ---- 2回目からネット無しで開けるようにする ----
     ★https で配られている時だけ。
     ★★Android の入れ物（APK）では必ず外す。入れ物は https://shashincho.local/ を名乗るので
       protocol を見るだけだと通ってしまい、APK を作り直しても古い画面が出続ける */
  function registerSw() {
    if (inApk()) return;
    if (location.protocol !== "https:") return;
    if (!("serviceWorker" in navigator)) return;
    /* ★新しい版の係が入れ替わったら、画面を1回だけ開き直す（古い画面のまま使い続けない）。
       初めて入る時（前の係がいない時）は開き直さない */
    var had = !!navigator.serviceWorker.controller, again = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!had || again) return;
      again = true;
      try { if (window.Store && Store.flush) Store.flush(); } catch (e) {}
      location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })["catch"](function () { /* 無くても使える */ });
  }

  function init() {
    liftHead();
    registerSw();
    if (isIos() && !inApk()) document.documentElement.classList.add("ios");
    setTimeout(bar, 900);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    liftHead: liftHead, isIos: isIos, isStandalone: isStandalone, isSafari: isSafari,
    inApp: inApp, inApk: inApk, shouldOffer: shouldOffer, bar: bar, close: close,
    guide: guide, wantsShare: wantsShare, save: save
  };
})();
window.Ios = Ios;
