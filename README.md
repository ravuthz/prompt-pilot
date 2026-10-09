# Prompt Pilot

A Chrome / Brave Manifest V3 extension and developer bridge that automates AI chat and creative studio websites (Google Flow, ChatGPT, Claude, Suno, and more). It provides a side panel UI, a local CLI, and a Model Context Protocol (MCP) server so coding agents (OpenAI Codex, Claude Desktop, Cursor) can script browser generation directly.

---

## Features

- **Side Panel UI:** Queue and send bulk prompts, configure separator modes, rate limiting delays, and responses.
- **Dedicated Creative Adapters:**
  - **Google Flow (`flow.google.com`):** Automates Agent toggle, Image/Video modes, aspect ratios (`16:9`, `9:16`, `1:1`), generation batch count (`x1`–`x4`), model selection (`Veo`, `Nano Banana`), project creation/navigation, and 1080p video upscaling.
  - **Flow Music (`flowmusic.app`):** Media extraction and song downloads (`.m4a`, `.wav`, cover art).
  - **Suno (`suno.com`):** Automated song generation with lyrics, styles, and custom mode.
  - **General AI Chats:** ChatGPT, Claude, Gemini, Grok, Perplexity, Copilot.
- **Local CLI:** Trigger prompts and configurations directly from your terminal.
- **Model Context Protocol (MCP):** Connects to OpenAI Codex (`codex`), Claude Desktop, and Cursor over standard stdio transport.
- **Multi-Browser Targeting:** Seamlessly switch between multiple browser windows or profiles using sequential IDs (`1`, `2`, ...).

---

## Installation

1. Install dependencies and build styles:
   ```bash
   bun install
   bun run build
   ```
2. Open `chrome://extensions` (or `brave://extensions`) in your browser.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this directory.
5. Pin the **Prompt Pilot** icon in your toolbar.

---

## Local Bridge & CLI Usage

Prompt Pilot communicates with your local terminal via a high-performance WebSocket bridge on `ws://127.0.0.1:9988`.

### 1. Start the Bridge Server (Recommended)

Keep the server listening in a terminal window:

```bash
bun run cli server
```

_When your browser is open with Prompt Pilot enabled, it automatically connects as client `1`, `2`, etc._

---

### 2. CLI Commands & Quick Aliases

#### Quick Mode Switching (Agent mode disabled by default)

```bash
# Switch to Image generation (with optional settings)
bun run cli image
bun run cli image --aspect 16:9 --count 4 --model "Nano Banana Pro"

# Switch to Video generation (with optional settings)
bun run cli video
bun run cli video --aspect 9:16 --count 1 --model "Omini 1.1 Flash"
```

#### Settings Configuration (`bun run cli config`)

```bash
# Toggle Google Flow Agent mode
bun run cli config --agent
bun run cli config --no-agent

# Set aspect ratio, count, and model
bun run cli config --aspect 16:9 --count 4 --model "Nano Banana"
```

#### Sending Prompts (`bun run cli prompt`)

```bash
# Send prompt to Google Flow (targets active project)
bun run cli prompt "A cinematic neon cyberpunk alley in the rain"

# Send prompt with inline settings
bun run cli prompt "Futuristic spaceship landing on Mars" \
  --mode video \
  --aspect 16:9 \
  --count 1 \
  --model "Veo 3.1 - Lite"

# Type prompt without clicking generate/send
bun run cli prompt "Drafting a concept..." --no-autosend

# Target other AI chat platforms
bun run cli prompt "Explain quantum computing briefly" --site "ChatGPT"
bun run cli prompt "Review this TypeScript function" --site "Claude"
```

#### Multi-Browser Management

When you have multiple Chrome or Brave windows open:

```bash
# List all connected browser instance numbers
bun run cli browsers
# Output: ["1", "2"]

# Target a specific browser (defaults to 1 if omitted)
bun run cli image --aspect 16:9 --browser 1
bun run cli video --aspect 9:16 --browser 2
bun run cli list-tabs --browser 2
bun run cli prompt "Hello from Browser 2" --browser 2
```

#### Project Management & Media Downloads

```bash
# Reveal prompt box if stuck on Flow project gallery page
bun run cli open-project

# Inspect active controls, selected models, and prompt readiness
bun run cli state

# Scan and list generated media links on active tab
bun run cli scan-media

# Trigger 1080p video upscaling on Google Flow canvas
bun run cli upscale

# List open browser tabs
bun run cli list-tabs
```

---

## Remote Access via Cloudflare Tunnel & Token Authentication

You can control your local browser remotely over the internet through your custom domain via **Cloudflare Tunnel (`cloudflared`)** with encrypted WebSockets and token authentication.

### 1. Configure Cloudflare Tunnel
On your machine running the browser:
```bash
# Install cloudflared (macOS)
brew install cloudflared

# Authenticate with your Cloudflare account
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create prompt-pilot

# Route your subdomain to the tunnel
cloudflared tunnel route dns prompt-pilot prompt.yourdomain.com
```

In `~/.cloudflared/config.yml`:
```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /Users/<USER>/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: prompt.yourdomain.com
    service: ws://localhost:9988
  - service: http_status:404
```
Run the tunnel:
```bash
cloudflared tunnel run prompt-pilot
```

### 2. Configure Extension for Remote Bridge
1. Open the Prompt Pilot Side Panel.
2. Click the **Remote Bridge** tab (arrow icon).
3. Set **Bridge WebSocket URL**: `wss://prompt.yourdomain.com`.
4. *(Optional)* Set **Security Auth Token**: `my-secret-token`.
5. Click **Save & Reconnect**.

### 3. Remote CLI Usage
Run commands from any laptop or terminal worldwide:
```bash
# Using CLI flags
bun run cli image --aspect 16:9 --remote "wss://prompt.yourdomain.com" --token "my-secret-token"
bun run cli prompt "Cyberpunk city" --remote "wss://prompt.yourdomain.com" --token "my-secret-token"

# Or set environment variables
export PROMPT_PILOT_REMOTE="wss://prompt.yourdomain.com"
export PROMPT_PILOT_TOKEN="my-secret-token"

bun run cli image --aspect 16:9
bun run cli prompt "Cyberpunk city"
```

---

## MCP Server Integration (OpenAI Codex, Claude Desktop, Cursor)

Prompt Pilot provides an official Model Context Protocol server over `stdio` via `bun run mcp-server.ts`.

### 1. Connect to OpenAI Codex CLI (`codex`)

Run:

```bash
codex mcp add prompt-pilot -- bun run /path-to-extensions/auto-prompts/mcp-server.ts
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.prompt-pilot]
command = "bun"
args = ["run", "/path-to-extensions/auto-prompts/mcp-server.ts"]
```

### 2. Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompt-pilot": {
      "command": "bun",
      "args": ["run", "/path-to-extensions/auto-prompts/mcp-server.ts"]
    }
  }
}
```

---

### Exposed MCP Tools Reference

| Tool Name           | Description                                             | Key Parameters                                                                                    |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `flow_send_prompt`  | Types & submits prompt with native browser typing.      | `prompt` _(req)_, `mode`, `aspectRatio`, `count`, `model`, `agent`, `browser`, `site`, `autoSend` |
| `flow_image`        | Quick-switches Flow to Image mode with options.         | `aspectRatio`, `count`, `model`, `agent`, `browser`                                               |
| `flow_video`        | Quick-switches Flow to Video mode with options.         | `aspectRatio`, `count`, `model`, `agent`, `browser`                                               |
| `flow_configure`    | Configures Flow parameters without submitting prompts.  | `mode`, `aspectRatio`, `count`, `model`, `agent`, `browser`                                       |
| `flow_open_project` | Enters or creates a project when on gallery page.       | `browser` _(optional)_                                                                            |
| `flow_state`        | Returns active toggles, selected models, and readiness. | `browser` _(optional)_                                                                            |
| `flow_scan_media`   | Scans page for generated image and video URLs.          | `site`, `browser` _(optional)_                                                                    |
| `flow_upscale`      | Triggers 1080p upscaling across Flow video cards.       | `browser` _(optional)_                                                                            |
| `browser_list`      | Lists all connected browser window IDs (`["1", "2"]`).  | None                                                                                              |
| `tab_detect`        | Detects active platform on current tab.                 | `site`, `browser` _(optional)_                                                                    |
| `tab_list`          | Lists open tabs in the browser.                         | `browser` _(optional)_                                                                            |

---

## Technical Architecture

```
[ Terminal CLI / AI Agent (Codex, Claude, Cursor) ]
                         │
                         ▼ stdio / WebSocket
       [ Local Bridge Host (`ws://127.0.0.1:9988`) ]
                         │
                         ▼ WebSocket (JSON-RPC)
      [ Chrome/Brave Extension Service Worker (`background.js`) ]
                         │
        ┌────────────────┴────────────────┐
        ▼ chrome.debugger                 ▼ chrome.tabs.sendMessage
 [ Native OS Keystrokes & Enter ]     [ DOM Adapter (`content.js`) ]
        │                                 │
        └────────────────┬────────────────┘
                         ▼
        [ Google Flow Canvas & Material UI ]
```

- **`chrome.debugger` Integration:** Dispatches native hardware-level `Input.insertText` and `Input.dispatchKeyEvent` (Enter key) commands to bypass Angular/Slate `isTrusted: true` event suppression.
- **CDK Overlay Engine:** Automatically opens and navigates Google Flow's dynamic `.settings-trigger-button` menu to configure aspect ratios, counts, and model families before focusing the prompt editor.
- **Automatic Server/Client Fallback:** If port 9988 is already running (e.g. background daemon), CLI one-shot invocations automatically switch to client mode to avoid `EADDRINUSE` conflicts.
