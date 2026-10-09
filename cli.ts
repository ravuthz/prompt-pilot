#!/usr/bin/env bun
import { BridgeHost } from './bridge-host';

const command = process.argv[2];
const args = process.argv.slice(3);

function printHelp() {
  console.log(`
Prompt Pilot CLI
Usage:
  bun run cli.ts [command] [options]

Commands:
  server                  Start the local WebSocket bridge server and keep it running
  detect                  Detect active AI platform in the current/open browser tab
  prompt <text> [options] Send prompt to the current AI platform (default Google Flow)
                          Options:
                            --site <name>       Target specific site (e.g. "Google Flow", "ChatGPT")
                            --no-autosend       Type prompt without clicking generate/send
                            --mode <img|video>  Switch mode to image or video
                            --aspect <ratio>    Set aspect ratio (e.g. "16:9", "9:16", "1:1")
                            --count <number>    Set generation count (e.g. 1, 2, 4)
                            --model <name>      Select model name
                            --agent             Enable Flow Agent mode
                            --no-agent          Disable Flow Agent mode
  config [options]        Configure Google Flow generation settings without prompting
                          Options:
                            --agent             Enable Agent mode
                            --no-agent          Disable Agent mode
                            --mode <img|video>  Switch to image or video mode
                            --aspect <ratio>    Set aspect ratio (e.g. "16:9", "9:16", "1:1")
                            --count <number>    Set number of generations (e.g. 1, 2, 4)
                            --model <name>      Select model (e.g. "Veo", "Imagen", "Nano Banana")
  state                   Inspect active Google Flow toggles, modes, and prompt box readiness
  open-project            Open or create a Google Flow project to reveal the prompt box
  scan-media              Scan images/videos generated on the active tab
  list-tabs               List open web tabs in Chrome
  help                    Show this help message
`);
}
async function waitForConnection(bridge: BridgeHost, maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  if (bridge.isConnected()) return;

  console.log('Bridge server started on ws://127.0.0.1:9988');
  console.log('Waiting for Prompt Pilot Chrome extension to connect...');
  while (!bridge.isConnected()) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(
        'Connection timed out.\n' +
        '1. In Chrome, go to chrome://extensions and click Reload on "Prompt Pilot".\n' +
        '2. Click the Prompt Pilot toolbar icon or open its side panel so it connects to ws://127.0.0.1:9988.'
      );
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 500);
    await promise;
  }
  console.log('Chrome extension connected!');
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const bridge = new BridgeHost(9988);

  if (command === 'server') {
    await bridge.start();
    console.log('Prompt Pilot Bridge server listening on ws://127.0.0.1:9988');
    console.log('Ready for Prompt Pilot Chrome extension connections.');
    return;
  }

  // CLI one-shot operations: start server and wait for connection
  await bridge.start();

  try {
    await waitForConnection(bridge);

    switch (command) {
      case 'detect': {
        const result = await bridge.sendAction('detect');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'list-tabs': {
        const result = await bridge.sendAction('list_tabs');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'prompt': {
        const promptText = args[0];
        if (!promptText) {
          console.error('Error: Please provide a prompt text.');
          process.exit(1);
        }

        let site = 'Google Flow';
        let autoSend = true;
        const configOptions: Record<string, unknown> = {};

        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--site' && args[i + 1]) {
            site = args[++i];
          } else if (args[i] === '--no-autosend') {
            autoSend = false;
          } else if (args[i] === '--mode' && args[i + 1]) {
            configOptions.mode = args[++i];
          } else if (args[i] === '--aspect' && args[i + 1]) {
            configOptions.aspectRatio = args[++i];
          } else if (args[i] === '--count' && args[i + 1]) {
            configOptions.count = Number(args[++i]);
          } else if (args[i] === '--model' && args[i + 1]) {
            configOptions.model = args[++i];
          } else if (args[i] === '--agent') {
            configOptions.agent = true;
          } else if (args[i] === '--no-agent') {
            configOptions.agent = false;
          }
        }

        if (Object.keys(configOptions).length > 0) {
          console.log('Applying generation options:', configOptions);
          const cfgRes = await bridge.sendAction('flow_config', { options: configOptions, site });
          console.log('Configuration result:', JSON.stringify(cfgRes, null, 2));
        }

        console.log(`Sending prompt to ${site}...`);
        const result = await bridge.sendAction('send_prompt', { prompt: promptText, site, autoSend });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'config': {
        const configOptions: Record<string, unknown> = {};
        let site = 'Google Flow';

        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--site' && args[i + 1]) {
            site = args[++i];
          } else if (args[i] === '--mode' && args[i + 1]) {
            configOptions.mode = args[++i];
          } else if (args[i] === '--aspect' && args[i + 1]) {
            configOptions.aspectRatio = args[++i];
          } else if (args[i] === '--count' && args[i + 1]) {
            configOptions.count = Number(args[++i]);
          } else if (args[i] === '--model' && args[i + 1]) {
            configOptions.model = args[++i];
          } else if (args[i] === '--agent') {
            configOptions.agent = true;
          } else if (args[i] === '--no-agent') {
            configOptions.agent = false;
          }
        }

        console.log('Applying Google Flow settings:', configOptions);
        const result = await bridge.sendAction('flow_config', { options: configOptions, site });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'state': {
        const result = await bridge.sendAction('flow_state');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'scan-media': {
        const result = await bridge.sendAction('scan_media');
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'open-project': {
        console.log('Opening or creating Google Flow project...');
        const result = await bridge.sendAction('open_flow_project');
        console.log(JSON.stringify(result, null, 2));
        break;
      }


      case 'upscale': {
        console.log('Requesting Google Flow video upscale...');
        const result = await bridge.sendAction('upscale_flow');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${errorMsg}`);
  } finally {
    await bridge.close();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
