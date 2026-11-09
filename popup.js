const MIN = 0.1;
const MAX = 16;
const PRESETS = [0.5, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 8, 10, 16];

// Logarithmic slider: 0..1000 maps to 0.1..16 so low speeds stay precise.
const RATIO = MAX / MIN;
const toSpeed = (v) => Math.round(MIN * Math.pow(RATIO, v / 1000) * 20) / 20 || MIN;
const toSlider = (s) => Math.round((Math.log(s / MIN) / Math.log(RATIO)) * 1000);
const fmt = (s) => String(+Number(s).toFixed(2));

const $ = (id) => document.getElementById(id);
let tabId;

const presetBox = $("presets");
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.textContent = fmt(p) + "×";
  b.dataset.speed = p;
  b.onclick = () => send({ type: "set", speed: p });
  presetBox.appendChild(b);
}

function render(speed) {
  $("num").value = fmt(speed);
  $("slider").value = toSlider(speed);
  for (const b of presetBox.children) b.classList.toggle("active", Number(b.dataset.speed) === speed);
}

async function send(msg) {
  if (tabId == null) return;
  const r = await chrome.runtime.sendMessage({ ...msg, tabId });
  if (r) render(r.speed);
}

$("slider").addEventListener("input", (e) => {
  const s = toSpeed(+e.target.value);
  $("num").value = fmt(s);
  send({ type: "set", speed: s });
});
$("num").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) send({ type: "set", speed: v });
});
$("up").onclick = () => send({ type: "speed-up" });
$("down").onclick = () => send({ type: "speed-down" });

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  send({ type: "get" });

  const cmds = await chrome.commands.getAll();
  const box = $("shortcuts");
  for (const c of cmds) {
    if (!c.description) continue;
    const k = document.createElement("kbd");
    k.textContent = c.shortcut || "unset";
    const d = document.createElement("span");
    d.textContent = c.description;
    box.append(k, d);
  }
})();
