# Prompt Pilot

A Chrome Manifest V3 extension that opens a right-side panel and sends a queue of prompts to AI chat websites.

## Install

1. Run `bun install` and `bun run build`.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this folder.
5. Open an AI chat, click the Prompt Pilot toolbar icon, paste prompts, and start the queue.

Built-in adapters cover ChatGPT, Claude, Gemini, Perplexity, Microsoft Copilot, Google Flow, and Flow Music. A generic adapter also looks for common message boxes and send buttons on other sites.

## Media Downloads

Prompt Pilot includes dedicated media extraction and downloading support for **Flow Music** (audio songs in `.m4a` / `.wav`, cover art, and videos) and **Google Flow** (1080p upscaling and project media).

## Notes

- Keep the target AI tab active while a queue runs.
- Site UI changes can require selector updates in `content.js`.
- The extension requests access to all sites so its generic adapter can work on additional browser-based AI agents. Chrome's own internal pages are not accessible.

## CLI and MCP Server

Prompt Pilot includes a local WebSocket bridge, command-line interface (CLI), and Model Context Protocol (MCP) server so AI agents (Claude Desktop, Cursor, etc.) or terminal scripts can drive Google Flow and other platforms through your existing Chrome session.

### 1. Start the Background Bridge Server
```bash
bun run cli server
# or keep it running in the background on ws://127.0.0.1:9988
```
When Chrome is open with the Prompt Pilot extension enabled, the extension will automatically connect to this local bridge.

### 2. CLI Usage
```bash
# Detect which AI platform tab is open
bun run cli detect

# List open browser tabs
bun run cli list-tabs

# Send prompt to Google Flow (or other target site)
bun run cli prompt "A cinematic hyperrealistic shot of an astronaut in a neon forest" --site "Google Flow"

# Scan generated images, videos, and music links on the active tab
bun run cli scan-media

# Trigger Google Flow video upscaling
bun run cli upscale
```

### 3. MCP Server for Claude Desktop / Cursor
To use this extension directly from an AI agent via MCP:

In `claude_desktop_config.json` or your MCP client settings:
```json
{
  "mcpServers": {
    "prompt-pilot": {
      "command": "bun",
      "args": ["run", "/Users/ravuthz/Projects/@oooo/tools/auto-prompts/mcp-server.ts"]
    }
  }
}
```

Exposed MCP Tools:
- `flow_send_prompt`: Send prompt to Google Flow / ChatGPT / Claude / Suno tab.
- `flow_scan_media`: Scan generated images and video links from the active tab.
- `flow_upscale`: Upscale videos on Google Flow.
- `tab_detect`: Identify active AI platforms and readiness.
- `tab_list`: List open browser tabs.
