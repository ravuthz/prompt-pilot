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

#### Batch Generation (queue, wait, download)

`generate` queues one Flow generation per scene, runs them one at a time with a randomised 20–45 s pause
between them, waits until each scene's new media appears on the page, then downloads it to
`Downloads/Prompt-Pilot/<folder>/<scene>.ext` through the browser (so your Flow session cookies apply).

```bash
# Several prompts, same settings
bun run cli generate "A lighthouse at dawn" "The same lighthouse in a storm" \
  --mode image --aspect 16:9 --folder lighthouse

# Per-scene settings from a file
bun run cli generate --file scenes.json --folder trailer
# scenes.json: [{ "prompt": "...", "mode": "video", "model": "Veo 3.1 - Lite", "technique": "push-in", "name": "opening" }]

# Prompt presets (camera moves, product shots, transitions, image looks)
bun run cli techniques camera
bun run cli prompt "A red sports car on a coastal road" --technique fpv-flythrough

# Download what is already on the page, without regenerating
bun run cli download --latest 4 --type video --name take --folder trailer

# Browsers + Flow tab readiness in one call
bun run cli status
```

A scene that shows no new media within its timeout (600 s video / 180 s otherwise, `--timeout` to change) is marked
failed and **not** retried automatically: the generation may still be running in Flow, so check `scan-media`
before re-running it and paying twice. Pacing is tunable with `PROMPT_PILOT_PAUSE_MIN_S` / `PROMPT_PILOT_PAUSE_MAX_S`.

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

## Web Dashboard (`web/`)

A small browser UI over the same bridge used by the CLI and MCP server.

```bash
bun run web
# → http://127.0.0.1:9990
```

- The home page shows every connected browser as a tab in a row (`Browser 1`, `Browser 2`, …).
- Selecting a browser lists its open tabs and offers prompt sending, Flow settings, and quick actions (image/video mode, detect, state, open project, scan media, upscale).
- Uses `PROMPT_PILOT_REMOTE` / `PROMPT_PILOT_TOKEN` from `.env` like the CLI. Override the listen address with `WEB_PORT` / `WEB_HOST`.

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

The PM2 process serves both the existing WebSocket bridge at `wss://prompt-pilot.appkh.online` and a Streamable HTTP MCP endpoint at **`https://prompt-pilot.appkh.online/mcp`**. MCP HTTP requests need `Authorization: Bearer <PROMPT_PILOT_TOKEN>`. The token must be set in the PM2 process environment; the server refuses to start HTTP mode without it. The Chrome extension continues to use the WebSocket URL and the same token.

After updating this repo on the host, run `pm2 restart ecosystem.config.cjs --update-env` and `pm2 save`. The Cloudflare tunnel can continue forwarding the domain to port 9988. An unauthenticated request to `/mcp` should return HTTP 401.

### Direct remote install in OpenAI Codex

Make `PROMPT_PILOT_TOKEN` available in the environment that starts Codex, then run:

```bash
codex mcp add prompt-pilot --url https://prompt-pilot.appkh.online/mcp --bearer-token-env-var PROMPT_PILOT_TOKEN
codex mcp list
```

The equivalent `~/.codex/config.toml` entry is:

```toml
[mcp_servers.prompt-pilot]
url = "https://prompt-pilot.appkh.online/mcp"
bearer_token_env_var = "PROMPT_PILOT_TOKEN"
```

Restart Codex after changing its MCP configuration, then call `browser_list` or `flow_status` to check the connection.

### Local stdio install (Claude Desktop, Cursor, or Codex)

For a client that cannot provide a bearer token to a remote MCP URL, install [Bun](https://bun.sh), clone this repo, run `bun install`, and set `PROMPT_PILOT_REMOTE=wss://prompt-pilot.appkh.online` and `PROMPT_PILOT_TOKEN` in the repo's ignored `.env` file. `mcp.sh` starts Bun from this directory so it loads the file.

Add this server to `claude_desktop_config.json` or Cursor's MCP configuration, substituting the actual absolute path:

```json
{
  "mcpServers": {
    "prompt-pilot": {
      "command": "/absolute/path/to/auto-prompts/mcp.sh"
    }
  }
}
```

For Codex stdio, run `codex mcp add prompt-pilot -- "$(pwd -P)/mcp.sh"` from the repo directory. The Chrome extension must be connected for browser actions to work. Each MCP client process has its own generation queue, so use one client for a batch you intend to track with `flow_wait`.

---

### Exposed MCP Tools Reference

| Tool Name           | Description                                                                                         | Key Parameters                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `flow_status`       | Call first: connected browsers, Flow tab readiness, queue, and a prompt-planning playbook.          | `site`, `browser`                                                                                              |
| `flow_generate`     | Queue scenes; runs one at a time with pacing, waits for each result, downloads it. Returns job ids. | `scenes[]` _(req: `prompt`, `mode`, `aspectRatio`, `count`, `model`, `agent`, `technique`, `name`)_, `download`, `folder`, `timeoutSeconds`, `browser` |
| `flow_wait`         | Wait (≤ ~40 s per call) for job ids or slow-call task ids; call again until `finished` is true.     | `ids`, `timeoutSeconds`                                                                                        |
| `flow_cancel`       | Cancel queued jobs that have not started.                                                           | `ids`                                                                                                          |
| `flow_retry`        | Re-queue failed/cancelled jobs with the same settings and file names.                               | `ids`                                                                                                          |
| `flow_techniques`   | Camera / product / transition / image prompt presets.                                               | `category`                                                                                                     |
| `flow_download`     | Download media already on the page (no regeneration).                                               | `urls` or `latest` + `type`, `name`, `folder`, `browser`                                                       |
| `flow_send_prompt`  | Type & submit one prompt and return immediately (untracked).                                        | `prompt` _(req)_, `mode`, `aspectRatio`, `count`, `model`, `agent`, `technique`, `site`, `autoSend`, `browser` |
| `flow_image`        | Quick-switch Flow to Image mode.                                                                    | `aspectRatio`, `count`, `model`, `agent`, `browser`                                                            |
| `flow_video`        | Quick-switch Flow to Video mode.                                                                    | `aspectRatio`, `count`, `model`, `agent`, `browser`                                                            |
| `flow_configure`    | Configure Flow parameters without submitting prompts.                                               | `mode`, `aspectRatio`, `count`, `model`, `agent`, `browser`                                                    |
| `flow_open_project` | Enter or create a project when on the gallery page.                                                 | `browser`                                                                                                      |
| `flow_state`        | Active toggles, selected models, and prompt readiness.                                              | `browser`                                                                                                      |
| `flow_scan_media`   | Generated image and video URLs on the page.                                                         | `site`, `browser`                                                                                              |
| `flow_upscale`      | Trigger 1080p upscaled downloads across Flow video cards.                                           | `browser`                                                                                                      |
| `browser_list`      | Connected browser IDs (`["1", "2"]`).                                                               | None                                                                                                           |
| `tab_detect`        | Detect the platform on the current tab.                                                             | `site`, `browser`                                                                                              |
| `tab_list`          | List open tabs in the browser.                                                                      | `browser`                                                                                                      |

**Slow calls never hit the client's ~60 s timeout.** A call that runs longer than 45 s (`flow_upscale`,
`flow_open_project`, large `flow_download`) answers with `still_working` and a `task_id`; pass it to `flow_wait`
instead of repeating the call. Tune with `PROMPT_PILOT_PATIENCE_MS`.

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
