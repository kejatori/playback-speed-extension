// Runs in the page's MAIN world. Hooks HTMLMediaElement.prototype.play so
// media that is never attached to the DOM (e.g. `new Audio()`) or lives in
// unreachable places still gets the target speed. Speed comes from content.js.
(() => {
  const FLAG = Symbol.for("__pscMainLoaded");
  if (window[FLAG]) return;
  window[FLAG] = true;

  const proto = HTMLMediaElement.prototype;
  const origPlay = proto.play;
  const rate = Object.getOwnPropertyDescriptor(proto, "playbackRate");
  const defRate = Object.getOwnPropertyDescriptor(proto, "defaultPlaybackRate");
  const EPS = 0.001;

  let target = 1;
  const hooked = new WeakSet();
  const refs = new Set();
  const corrections = new WeakMap();

  function apply(el, force) {
    if (target === 1 && !force) return;
    try {
      if (Math.abs(defRate.get.call(el) - target) > EPS) defRate.set.call(el, target);
      if (Math.abs(rate.get.call(el) - target) > EPS) rate.set.call(el, target);
    } catch {}
  }

  function onRateChange() {
    if (target === 1) return;
    const now = performance.now();
    let c = corrections.get(this);
    if (!c || now - c.t > 1000) c = { t: now, n: 0 };
    corrections.set(this, c);
    if (++c.n <= 25) apply(this);
  }

  function hook(el) {
    if (hooked.has(el)) return;
    hooked.add(el);
    refs.add(new WeakRef(el));
    el.addEventListener("ratechange", onRateChange);
    el.addEventListener("loadstart", () => apply(el));
  }

  proto.play = function play() {
    try {
      hook(this);
      apply(this);
    } catch {}
    return origPlay.apply(this, arguments);
  };

  document.addEventListener("__psc_speed", (e) => {
    const next = Number(e.detail);
    if (!(next > 0)) return;
    const changed = next !== target;
    target = next;
    if (!changed) return;
    for (const ref of refs) {
      const el = ref.deref();
      if (el) apply(el, true);
      else refs.delete(ref);
    }
  });

  document.dispatchEvent(new CustomEvent("__psc_hello"));
})();
