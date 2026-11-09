// Per-tab speed state lives in chrome.storage.session so it survives
// service-worker restarts but is cleared when the browser closes.

const MIN = 0.1;
const MAX = 16; // Chromium's hard limit for HTMLMediaElement.playbackRate
const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 14, 16];

const clamp = (s) => Math.min(MAX, Math.max(MIN, Math.round(Number(s) * 100) / 100 || 1));
const key = (tabId) => `tab:${tabId}`;
const fmt = (s) => String(+s.toFixed(2));

async function getState(tabId) {
  const k = key(tabId);
  const r = await chrome.storage.session.get(k);
  return r[k] || { speed: 1, last: 2 };
}

function updateBadge(tabId, speed) {
  chrome.action.setBadgeText({ tabId, text: speed === 1 ? "" : fmt(speed) }).catch(() => {});
}

async function setSpeed(tabId, speed) {
  speed = clamp(speed);
  const state = await getState(tabId);
  state.speed = speed;
  if (speed !== 1) state.last = speed;
  await chrome.storage.session.set({ [key(tabId)]: state });
  // Delivered to every frame in the tab.
  chrome.tabs.sendMessage(tabId, { type: "speed", speed, announce: true }).catch(() => {});
  updateBadge(tabId, speed);
  return speed;
}

function stepSpeed(current, dir) {
  if (dir > 0) return STEPS.find((s) => s > current + 1e-9) ?? MAX;
  return [...STEPS].reverse().find((s) => s < current - 1e-9) ?? MIN;
}

async function handle(action, tabId, value) {
  const state = await getState(tabId);
  switch (action) {
    case "get":
      return state.speed;
    case "set":
      return setSpeed(tabId, value);
    case "speed-up":
      return setSpeed(tabId, stepSpeed(state.speed, 1));
    case "speed-down":
      return setSpeed(tabId, stepSpeed(state.speed, -1));
    case "reset":
      return setSpeed(tabId, 1);
    case "toggle":
      return setSpeed(tabId, state.speed === 1 ? state.last || 2 : 1);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg.tabId ?? sender.tab?.id;
  if (tabId == null) return;
  handle(msg.type, tabId, msg.speed)
    .then((speed) => {
      // Top frame (re)loaded: badge may have been cleared by navigation.
      if (msg.type === "get" && sender.tab && sender.frameId === 0) updateBadge(tabId, speed);
      sendResponse({ speed });
    })
    .catch(() => sendResponse({ speed: 1 }));
  return true; // async response
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  let tabId = tab?.id;
  if (tabId == null) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tabId = active?.id;
  }
  if (tabId != null) handle(command, tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(key(tabId));
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
});
