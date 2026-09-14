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
