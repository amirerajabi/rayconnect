# Status

Released: 0.1.0 (https://github.com/amirerajabi/raylit, tag v0.1.0).

## On `main`, not released yet

- New layout: icon rail with one page each for Connection, Servers (cards with country badges and delay),
  Subscriptions (usage, expiry, update), Log and Settings. The Grabbit-style toolbar, table, dock and details pane are
  gone.
- Tray panel: left click on the tray icon opens a small window to connect, pick a server and switch the proxy mode;
  right click shows the menu.
- "Connect to the fastest server": tests the servers (of the group shown) and connects to the quickest
  (`POST /api/connect-fastest`). Parallel delay tests now share one run.
- Persian UI (Settings → General → Language), right to left, with the Vazirmatn font bundled
  (`@fontsource-variable/vazirmatn`); English stays the default. Dates follow the language (Persian calendar).
- Dev launcher: works when Vite listens on IPv6 localhost, and stops its children on Windows instead of orphaning them.

## Works (verified on Windows with Xray 26.9.30)

- Import of vmess / vless / trojan / ss links and base64 blocks; subscriptions with usage info and auto-update.
- Connect / disconnect through Xray; System proxy mode with backup and restore (tested against a fake OS proxy);
  Proxy only mode; switching modes while connected; connect to the fastest server.
- Real delay tests through a batch Xray process (TCP ping when no core is installed).
- The new UI in the browser build, in English and Persian, light and dark, including the tray panel at `#tray`.
- The Electron app with a throwaway profile: main window, auto-connect, the tray switching to "Connected" with the green
  icon, the tray panel opening above the taskbar next to the icon (captured with `RAYLIT_SMOKE_TRAY_SHOT`), and a clean
  quit that stops Xray.
- Ports Windows has reserved (Hyper-V / WinNAT ranges) give their own error instead of "used by another program".
- "Download Xray": `engine/scripts/fetch-core.ts` uses the same code and fetched, checked and unpacked Xray 26.3.27.
- `npm run typecheck`, `npm test` (23 tests), `npm run check:i18n` and `npm run build` pass.

## Not verified yet

- Clicking the tray icon and menu by hand, launch at login and the file picker (need a person at the desktop).
- Running the installer itself (0.1.0's packaged app starts and shows the first-run screen).
- The updater going from one version to the next (first chance: the next release).
- System proxy mode against the real Windows registry (dev runs disable it on purpose).
- macOS and Linux builds (built by the release workflow, never run by hand); System proxy there uses networksetup /
  gsettings and may ask for a password on macOS. The tray panel's position on Linux desktops that report no tray
  bounds falls back to the bottom-right corner.
- Live traffic numbers through a real server (the metrics endpoint is read correctly; the local test server had no
  internet to carry traffic).

## Ideas

- TUN mode (route all apps, not only proxy-aware ones), QR codes for share links, Hysteria2 and WireGuard links.
