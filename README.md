# Playback Speed Controller

Sets the playback speed of every `<video>` and `<audio>` element in a tab, from 0.1× to **16×**. Chromium won't let a page go above 16×.

## Install (Chrome / Edge / Brave)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Use
- Click the toolbar icon: slider (log scale), − / + buttons, type an exact value, or pick a preset.
- Keyboard shortcuts (change them at `chrome://extensions/shortcuts`):
  - `Alt+Shift+.` faster · `Alt+Shift+,` slower
  - `Alt+Shift+0` reset to 1× · `Alt+Shift+9` switch between 1× and your last speed
- When the speed isn't 1×, the badge on the toolbar icon shows it.

## How it works
- The speed is stored per tab and stays the same when you move to another page in that tab.
- `content.js` runs in every frame, including iframes and embedded players. It finds media in the page, in open **and closed** shadow roots, and in elements added later.
- If a site resets the speed (YouTube, for example), the extension sets it back, with a guard so the two don't loop.
- `inject.js` replaces `HTMLMediaElement.play()` in the page's own scripts, so media never added to the page (such as `new Audio()`) also gets the speed.
- At 1× the extension doesn't step in, so a site's own speed control works normally.
