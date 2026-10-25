#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { BridgeHost, CONFIG_SETTLE_MS, waitForConfigSettle } from './bridge-host';
import { JobQueue, downloadMedia, flowAccounts, mediaFileNames, scanMedia, type Job, type Scene } from './jobs';
import { TECHNIQUES, applyTechnique } from './presets';

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
                            --technique <id>    Append a preset from 'techniques'
  generate [prompts...]   Queue Flow generations one at a time, wait for each result, and download it
                          Options:
                            --file <scenes.json> JSON array of scenes ({ prompt, mode, aspectRatio,
                                                count, model, agent, technique, name })
                            --folder <name>     Subfolder under Downloads/Prompt-Pilot
                            --no-download       Only wait for results, do not download
                            --timeout <seconds> Max wait per scene (default 600 video / 180 image)
                            (plus --mode/--aspect/--count/--model/--agent/--technique for every scene)
  download [urls...]      Download media already on the page (no regeneration)
                          Options:
                            --latest <n>        Take the newest n scanned items instead of urls
                            --type <kind>       image | video | audio (with --latest)
                            --name <stem>       File name stem (default "media")
                            --folder <name>     Subfolder under Downloads/Prompt-Pilot
  techniques [category]   List prompt presets (camera | product | transition | image)
  status                  Show connected browsers and Flow tab readiness
  image [options]         Quick switch to Image mode (alias for config --mode image)
  video [options]         Quick switch to Video mode (alias for config --mode video)
  config [options]        Configure Google Flow generation settings without prompting
                          Options:
                            --agent             Enable Agent mode
                            --no-agent          Disable Agent mode
                            --mode <img|video>  Switch to image or video mode
                            --aspect <ratio>    Set aspect ratio (e.g. "16:9", "9:16", "1:1")
                            --count <number>    Set number of generations (e.g. 1, 2, 4)
                            --model <name>      Select model (e.g. "Veo", "Imagen", "Nano Banana")
  scan-media              List generated media URLs on the active tab
  upscale                 Trigger 1080p upscaled downloads on Flow video cards
  state                   Inspect active Google Flow toggles, modes, and prompt box readiness
  open-project            Open or create a Google Flow project to reveal the prompt box
  browsers                List connected browser instances (unique id, index, name, connected time)
  credits [--all]         Show remaining Google Flow AI credits of the signed-in account
  gmail [--all]           Show which Gmail / Google account is signed in to Google Flow
                          --all checks every connected browser
  list-tabs               List open web tabs in Chrome / Brave
  help                    Show this help message

Global Options:
  --browser <id|index>    Target a browser by its id or index from 'bun run cli browsers' (default 1)
  --remote <url>          Remote WebSocket bridge URL (e.g. wss://prompt.yourdomain.com)
  --token <secret>        Shared authentication secret (or env PROMPT_PILOT_TOKEN)
`);
}
const flagValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const VALUE_FLAGS = new Set(['--site', '--mode', '--aspect', '--count', '--model', '--technique', '--browser', '--remote', '--token', '--file', '--folder', '--timeout', '--latest', '--type', '--name']);

// Arguments that are not flags or flag values.
function positionals(from = 0): string[] {
  const out: string[] = [];
  for (let i = from; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) i++;
    else if (!args[i].startsWith('--')) out.push(args[i]);
  }
  return out;
}

function parseConfigFlags(): { site: string; technique?: string; options: Record<string, unknown> } {
  const options: Record<string, unknown> = {};
  let site = 'Google Flow';
  let technique: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site' && args[i + 1]) site = args[++i];
    else if (args[i] === '--mode' && args[i + 1]) options.mode = args[++i];
    else if (args[i] === '--aspect' && args[i + 1]) options.aspectRatio = args[++i];
    else if (args[i] === '--count' && args[i + 1]) options.count = Number(args[++i]);
    else if (args[i] === '--model' && args[i + 1]) options.model = args[++i];
    else if (args[i] === '--technique' && args[i + 1]) technique = args[++i];
    else if (args[i] === '--agent') options.agent = true;
    else if (args[i] === '--no-agent') options.agent = false;
  }
  return { site, technique, options };
}

function printJob(job: Job) {
  const files = job.downloads.map((d) => (d.ok ? d.name : `${d.name} (failed: ${d.error})`));
  const detail = job.error ?? job.progress ?? (files.length ? files.join(', ') : `${job.media.length} media item(s)`);
  console.log(`[${job.id}] ${job.stem} ${job.status}${detail ? ` - ${detail}` : ''}${job.note ? ` (${job.note})` : ''}`);
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

  if (command === 'techniques') {
    const category = positionals()[0];
    for (const t of TECHNIQUES.filter((item) => !category || item.category === category)) {
      console.log(`${t.id.padEnd(18)} ${t.category.padEnd(11)} ${t.phrase}`);
    }
    process.exit(0);
  }

  const remoteArg = flagValue('--remote');
  const tokenArg = flagValue('--token');
  // When starting the server itself, it must listen locally (never act as a client)
  const bridge = new BridgeHost(9988, {
    remoteUrl: command === 'server' ? '' : remoteArg,
    token: tokenArg,
    isServer: command === 'server'
  });

  if (command === 'server') {
    await bridge.start();
    console.log('Prompt Pilot Bridge server listening on port 9988');
    console.log('Ready for Prompt Pilot Chrome extension connections.');
    return;
  }

  // CLI one-shot operations: connect or start server
  await bridge.start();
  try {
    await waitForConnection(bridge);

    const targetBrowser = flagValue('--browser') || '1';
    switch (command) {
      case 'browsers': {
        const list = await bridge.listBrowsers();
        console.log(JSON.stringify(list, null, 2));
        break;
      }

      case 'credits':
      case 'gmail': {
        const accounts = await flowAccounts(bridge, targetBrowser, args.includes('--all'));
        for (const a of accounts) {
          const who = `${a.browser}${a.browserName ? ` (${a.browserName})` : ''}`;
          if (a.error && a.email === null && a.credits === null) console.log(`${who}: ${a.error}`);
          else if (command === 'credits') console.log(`${who}: ${a.credits ?? 'unknown'} credits${a.tier ? ` [${a.tier}]` : ''} - ${a.email ?? 'unknown account'}`);
          else console.log(`${who}: ${a.email ?? 'unknown'}${a.name ? ` (${a.name})` : ''}`);
        }
        break;
      }

      case 'detect': {
        const result = await bridge.sendAction('detect', {}, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'list-tabs': {
        const result = await bridge.sendAction('list_tabs', {}, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'prompt': {
        const promptText = args[0];
        if (!promptText || promptText.startsWith('--')) {
          console.error('Error: Please provide a prompt text.');
          process.exit(1);
        }

        const { site, technique, options: configOptions } = parseConfigFlags();
        const autoSend = !args.includes('--no-autosend');

        if (Object.keys(configOptions).length > 0) {
          console.log('Applying generation options:', configOptions);
          const cfgRes = await bridge.sendAction('flow_config', { options: configOptions, site }, 30000, targetBrowser);
          console.log('Configuration result:', JSON.stringify(cfgRes, null, 2));
          console.log(`Waiting ${CONFIG_SETTLE_MS / 1000}s for settings to apply...`);
          await waitForConfigSettle();
        }

        console.log(`Sending prompt to ${site}...`);
        const prompt = applyTechnique(promptText, technique);
        const result = await bridge.sendAction('send_prompt', { prompt, site, autoSend }, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'generate': {
        const { site, technique, options } = parseConfigFlags();
        const file = flagValue('--file');
        const base = { ...options, technique } as Partial<Scene>;
        const scenes: Scene[] = file
          ? (JSON.parse(readFileSync(file, 'utf8')) as Scene[]).map((scene) => ({ ...base, ...scene }))
          : positionals().map((prompt) => ({ ...base, prompt }));
        if (!scenes.length) {
          console.error('Error: Pass one or more prompts, or --file scenes.json.');
          process.exit(1);
        }
        for (const scene of scenes) applyTechnique(scene.prompt, scene.technique);

        const queue = new JobQueue(bridge);
        const timeout = flagValue('--timeout');
        const jobs = queue.add(scenes, {
          site,
          browser: targetBrowser,
          download: !args.includes('--no-download'),
          folder: flagValue('--folder'),
          timeoutSeconds: timeout ? Number(timeout) : undefined,
        });
        console.log(`Queued ${jobs.length} scene(s). Scenes run one at a time with a pause between them.`);

        const lastLine = new Map<string, string>();
        for (;;) {
          const { finished, queue: summary } = await queue.wait(undefined, 5000);
          for (const job of jobs) {
            const line = `${job.status}|${job.progress ?? ''}|${job.downloads.length}`;
            if (lastLine.get(job.id) !== line) {
              lastLine.set(job.id, line);
              printJob(job);
            }
          }
          if (finished) {
            console.log(`Done: ${summary.done} ok, ${summary.failed} failed, ${summary.cancelled} cancelled.`);
            break;
          }
          if (summary.pausedReason) console.log(summary.pausedReason);
        }
        break;
      }

      case 'download': {
        const { site } = parseConfigFlags();
        const media = await scanMedia(bridge, site, targetBrowser);
        let urls = positionals();
        const latest = Number(flagValue('--latest') ?? 0);
        if (!urls.length && latest > 0) {
          const type = flagValue('--type');
          urls = media.filter((m) => !type || m.type === type).slice(-latest).map((m) => m.url);
        }
        if (!urls.length) {
          console.error('Error: Pass media URLs, or --latest <n>.');
          process.exit(1);
        }
        const byUrl = new Map(media.map((m) => [m.url, m]));
        const items = urls.map((url) => byUrl.get(url) ?? { url, type: 'image' });
        const names = mediaFileNames(items, flagValue('--name') ?? 'media', flagValue('--folder'));
        const results = await downloadMedia(bridge, names, site, targetBrowser);
        console.log(JSON.stringify(results, null, 2));
        break;
      }

      case 'status': {
        const { site } = parseConfigFlags();
        const browsers = await bridge.getConnectedBrowsers();
        const state = await bridge.sendAction('flow_state', { site }, 30000, targetBrowser);
        console.log(JSON.stringify({ browsers, state }, null, 2));
        break;
      }

      case 'image':
      case 'video':
      case 'config': {
        const { site, options: configOptions } = parseConfigFlags();
        if (command !== 'config') {
          configOptions.mode = command;
          if (configOptions.agent === undefined) configOptions.agent = false;
        }

        console.log('Applying Google Flow settings:', configOptions);
        const result = await bridge.sendAction('flow_config', { options: configOptions, site }, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        await waitForConfigSettle();
        break;
      }

      case 'state': {
        const result = await bridge.sendAction('flow_state', {}, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'scan-media': {
        const { site } = parseConfigFlags();
        const result = await bridge.sendAction('scan_media', { site }, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'open-project': {
        console.log('Opening or creating Google Flow project...');
        const result = await bridge.sendAction('open_flow_project', {}, 30000, targetBrowser);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'upscale': {
        console.log('Requesting Google Flow video upscale...');
        const result = await bridge.sendAction('upscale_flow', {}, 600000, targetBrowser);
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
    process.exitCode = 1;
  } finally {
    await bridge.close();
    process.exit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
