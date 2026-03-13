# ⚡ Serial Monitor

A web-based Serial Monitor using the **Web Serial API** — runs entirely in the browser, no drivers or native apps needed.

![Serial Monitor Screenshot](https://via.placeholder.com/800x450/0d0d0d/00ff88?text=Serial+Monitor)

## ✨ Features

- 🔌 **Connect** to any serial port (USB, UART, etc.)
- 📡 **DTR** auto-enabled on connect
- 🔄 **Auto-reconnect** on device disconnect (up to 3 retries)
- ⏸️ **Pause/Resume** scroll
- 🎨 **Multi-color dark themes** (Green, Cyan, Amber, Pink, White) — saved in localStorage
- 📋 **Copy / 💾 Save** full log with timestamps
- ✉️ **Send** data with configurable line endings (LF / CR+LF / CR / None)
- 📊 Live **line count**, **byte count**, and **DTR status**
- 📱 Responsive design

## 🖥️ Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome 89+ | ✅ |
| Edge 89+ | ✅ |
| Firefox | ❌ (Web Serial not supported) |
| Safari | ❌ (Web Serial not supported) |

> **Requires HTTPS** in production (or `localhost` for development).

## 🚀 Quick Start

### Option 1 — VS Code Live Server (Easiest)
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**
3. Browser opens at `http://127.0.0.1:5500`

### Option 2 — Node.js
```bash
npx serve .
```
Then open `http://localhost:3000`

### Option 3 — Python
```bash
# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```
Then open `http://localhost:8080`

### Option 4 — Direct File (Limited)
Open `index.html` directly in Chrome/Edge.  
> ⚠️ Web Serial API may be blocked on `file://` protocol. Use a local server if it doesn't work.

> **Always use Chrome or Edge** — Firefox and Safari do not support Web Serial API.

## ☁️ Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo on [vercel.com](https://vercel.com) for automatic deployments.

### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

```bash
npm i -g netlify-cli
netlify deploy --prod --dir .
```

Or drag & drop the folder on [app.netlify.com](https://app.netlify.com).

> ⚠️ Both `vercel.json` and `netlify.toml` include the required **COOP/COEP headers** for Web Serial API to work over HTTPS.

## 📁 Project Structure

```
serial-monitor/
├── index.html       # Main UI
├── style.css        # Dark theme + multi-color styles
├── app.js           # Web Serial API logic
├── manifest.json    # PWA manifest
├── icon.svg         # App icon
├── vercel.json      # Vercel deployment config
├── netlify.toml     # Netlify deployment config
└── README.md
```

## 🛠️ Usage

1. Click **Reload** to list paired ports, or click **Connect** to request a new port
2. Select **baud rate** (default: 115200)
3. Click **Connect** — DTR activates automatically
4. Incoming data streams in real time
5. Use the **Send bar** at the bottom to transmit data
6. If the device disconnects, the app retries automatically

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Baud rate | 115200 | Selectable in header |
| Line ending | CR+LF | Selectable in send bar |
| Max lines | 5000 | Auto-trim oldest lines |
| Reconnect delay | 3s | Auto-reconnect interval |
| Max reconnect | 3× | Max auto-reconnect attempts |

## 📜 License

MIT © 2024 [baaaaan1](https://github.com/baaaaan1)
