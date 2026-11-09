// Runs in every frame (isolated world). Finds all <video>/<audio> elements,
// including ones inside open *and closed* shadow roots, and keeps their
// playbackRate pinned to the tab's target speed even if the site resets it.
(() => {
  if (window.__pscContentLoaded) return;
  window.__pscContentLoaded = true;

  const EPS = 0.001;
  let target = 1;

  const seen = new WeakSet();
  const tracked = new Set(); // WeakRef<HTMLMediaElement>
  const observedRoots = new WeakSet();
  const corrections = new WeakMap();
  let rescanTimer = null;

  const isMedia = (n) => n instanceof HTMLMediaElement;

  function getShadow(el) {
    try {
      if (typeof el.openOrClosedShadowRoot === "function") return el.openOrClosedShadowRoot(); // Firefox
      if (chrome.dom?.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el); // Chromium
    } catch {}
    return el.shadowRoot;
  }

  function setRate(el) {
    try {
      if (Math.abs(el.defaultPlaybackRate - target) > EPS) el.defaultPlaybackRate = target;
      if (Math.abs(el.playbackRate - target) > EPS) el.playbackRate = target;
    } catch {}
  }

  // Site changed the rate behind our back -> put it back (with a loop guard).
  function onRateChange(e) {
    const el = e.currentTarget;
    if (target === 1 || Math.abs(el.playbackRate - target) <= EPS) return;
    const now = performance.now();
    let c = corrections.get(el);
    if (!c || now - c.t > 1000) c = { t: now, n: 0 };
    corrections.set(el, c);
    if (++c.n > 25) return; // site is fighting hard; back off for this second
    setRate(el);
  }

  // Loading a new source resets playbackRate to defaultPlaybackRate.
  function onReload(e) {
    if (target !== 1) setRate(e.currentTarget);
  }

  function track(el) {
    if (seen.has(el)) return;
    seen.add(el);
    tracked.add(new WeakRef(el));
    el.addEventListener("ratechange", onRateChange);
    for (const ev of ["loadstart", "loadedmetadata", "canplay", "play"]) el.addEventListener(ev, onReload);
    if (target !== 1) setRate(el);
  }

  function observe(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (isMedia(n)) track(n);
          else if (n.firstElementChild) {
            for (const v of n.getElementsByTagName("video")) track(v);
            for (const a of n.getElementsByTagName("audio")) track(a);
          }
        }
      }
    }).observe(root, { childList: true, subtree: true });
  }

  function scan(root) {
    if (!root?.querySelectorAll) return;
    for (const el of root.querySelectorAll("*")) {
      if (isMedia(el)) track(el);
      const sr = getShadow(el);
      if (sr) {
        observe(sr);
        scan(sr);
      }
    }
  }

  function liveMedia() {
    const out = [];
    for (const ref of tracked) {
      const el = ref.deref();
      if (el) out.push(el);
      else tracked.delete(ref);
    }
    return out;
  }

  // ---- toast -------------------------------------------------------------
  let toastHost, toastLabel, toastTimer;
  function toast(text) {
    const media = liveMedia().filter((m) => m.isConnected && m.offsetWidth > 0);
    if (!media.length) return;
    if (!toastHost) {
      toastHost = document.createElement("div");
      const sr = toastHost.attachShadow({ mode: "closed" });
      sr.innerHTML = `<style>
        :host{all:initial;position:fixed;z-index:2147483647;pointer-events:none;transition:opacity .25s;}
        div{font:600 18px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;background:rgba(20,20,28,.82);
            padding:8px 12px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.35);}
      </style><div></div>`;
      toastLabel = sr.querySelector("div");
    }
    // Put it on top of the largest video, inside the fullscreen element if any.
    const fs = document.fullscreenElement;
    const parent = fs && !isMedia(fs) ? fs : document.body || document.documentElement;
    if (toastHost.parentNode !== parent) parent.appendChild(toastHost);
    const big = media.reduce((a, b) => (a.offsetWidth * a.offsetHeight >= b.offsetWidth * b.offsetHeight ? a : b));
    const r = big.getBoundingClientRect();
    toastHost.style.top = Math.max(8, r.top + 12) + "px";
    toastHost.style.left = Math.max(8, r.left + 12) + "px";
    toastLabel.textContent = text;
    toastHost.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastHost.style.opacity = "0"), 1100);
  }

  // ---- speed updates -----------------------------------------------------
  function notifyMainWorld() {
    document.dispatchEvent(new CustomEvent("__psc_speed", { detail: target }));
  }

  function update(speed, announce) {
    const prev = target;
    target = speed;
    scan(document);
    if (prev !== target) for (const el of liveMedia()) setRate(el);
    notifyMainWorld();

    // Periodic rescan while active catches media in shadow roots attached later.
    if (target !== 1 && !rescanTimer) rescanTimer = setInterval(() => scan(document), 2000);
    else if (target === 1 && rescanTimer) {
      clearInterval(rescanTimer);
      rescanTimer = null;
    }
    if (announce) toast(`${+target.toFixed(2)}×`);
  }

  // Catch media events in the light DOM even before the observer sees them.
  for (const ev of ["play", "loadstart", "ratechange"]) {
    document.addEventListener(ev, (e) => isMedia(e.target) && track(e.target), true);
  }
  document.addEventListener("__psc_hello", notifyMainWorld);

  observe(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(document), { once: true });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "speed") update(msg.speed, msg.announce);
  });

  chrome.runtime
    .sendMessage({ type: "get" })
    .then((r) => r && update(r.speed, false))
    .catch(() => {});
})();
