import { randomUUID } from 'node:crypto';
import { BridgeHost, waitForConfigSettle } from './bridge-host';
import { applyTechnique } from './presets';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Scene {
  prompt: string;
  mode?: 'image' | 'video';
  aspectRatio?: string;
  count?: number;
  model?: string;
  agent?: boolean;
  technique?: string;
  name?: string;
}

export interface BatchOptions {
  site?: string;
  browser?: string;
  download?: boolean;
  folder?: string;
  timeoutSeconds?: number;
}

export interface MediaItem {
  url: string;
  type: string;
  extension?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  scene: Scene;
  options: BatchOptions;
  stem: string;
  attempts: number;
  progress?: string;
  media: MediaItem[];
  downloads: { name: string; ok: boolean; error?: string }[];
  note?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

const PAUSE_MIN_MS = Number(process.env.PROMPT_PILOT_PAUSE_MIN_S ?? 20) * 1000;
const PAUSE_MAX_MS = Number(process.env.PROMPT_PILOT_PAUSE_MAX_S ?? 45) * 1000;
const POLL_MS = 5000;
// Polls with the same media count before a partial result is accepted as final.
const STABLE_POLLS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sanitize = (name: string) => name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '-').trim();

export function sceneConfig(scene: Scene): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (scene.mode) options.mode = scene.mode;
  if (scene.aspectRatio) options.aspectRatio = scene.aspectRatio;
  if (scene.count) options.count = scene.count;
  if (scene.model) options.model = scene.model;
  if (scene.agent !== undefined) options.agent = scene.agent;
  return options;
}

export async function scanMedia(bridge: BridgeHost, site?: string, browser?: string): Promise<MediaItem[]> {
  const res = (await bridge.sendAction('scan_media', { site }, 30000, browser)) as { media?: MediaItem[] };
  return Array.isArray(res?.media) ? res.media : [];
}

async function isBusy(bridge: BridgeHost, site?: string, browser?: string): Promise<boolean> {
  try {
    const res = (await bridge.sendAction('response_state', { site }, 15000, browser)) as { busy?: boolean };
    return Boolean(res?.busy);
  } catch {
    return false;
  }
}

export async function downloadMedia(bridge: BridgeHost, items: { url: string; name: string }[], site?: string, browser?: string) {
  if (!items.length) return [];
  const res = (await bridge.sendAction('download_media', { items, site }, 60000, browser)) as {
    results?: { name: string; ok: boolean; error?: string }[];
  };
  return (res?.results ?? []).map(({ name, ok, error }) => ({ name, ok, error }));
}

export function mediaFileNames(media: MediaItem[], stem: string, folder?: string) {
  const prefix = folder ? `${sanitize(folder)}/` : '';
  return media.map((item, index) => ({
    url: item.url,
    name: `${prefix}${stem}${media.length > 1 ? `-${index + 1}` : ''}.${item.extension || (item.type === 'video' ? 'mp4' : 'jpg')}`,
  }));
}

// Types a scene into Flow and waits until its new media shows up on the page.
async function runScene(bridge: BridgeHost, job: Job): Promise<void> {
  const { scene, options } = job;
  const site = options.site || 'Google Flow';
  const browser = options.browser;

  job.progress = 'scanning existing media';
  const before = new Set((await scanMedia(bridge, site, browser)).map((m) => m.url));

  const config = sceneConfig(scene);
  if (Object.keys(config).length) {
    job.progress = 'applying settings';
    await bridge.sendAction('flow_config', { options: config, site }, 30000, browser);
    await waitForConfigSettle();
  }

  job.progress = 'sending prompt';
  const prompt = applyTechnique(scene.prompt, scene.technique);
  const sent = (await bridge.sendAction('send_prompt', { prompt, site, autoSend: true }, 30000, browser)) as {
    response?: { ok?: boolean; error?: string };
  };
  if (sent?.response && sent.response.ok === false) {
    throw new Error(`Prompt was not submitted: ${sent.response.error || 'unknown reason'}`);
  }

  const expected = scene.count ?? 1;
  const timeoutMs = (options.timeoutSeconds ?? (scene.mode === 'video' ? 600 : 180)) * 1000;
  const deadline = Date.now() + timeoutMs;
  let fresh: MediaItem[] = [];
  let lastCount = -1;
  let stable = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const all = await scanMedia(bridge, site, browser);
    const added = all.filter((m) => !before.has(m.url) && m.type !== 'audio');
    const ofMode = scene.mode ? added.filter((m) => m.type === scene.mode) : added;
    fresh = ofMode.length ? ofMode : added;
    job.progress = `waiting for media (${fresh.length}/${expected}, ${Math.round((deadline - Date.now()) / 1000)}s left)`;
    if (fresh.length >= expected) break;
    stable = fresh.length === lastCount ? stable + 1 : 0;
    lastCount = fresh.length;
    if (fresh.length > 0 && stable >= STABLE_POLLS && !(await isBusy(bridge, site, browser))) break;
  }

  if (!fresh.length) {
    throw new Error(
      `No new media detected within ${Math.round(timeoutMs / 1000)}s. The generation may still be running in Flow: ` +
      'check flow_scan_media before retrying so credits are not spent twice.'
    );
  }

  job.media = fresh;
  if (fresh.length < expected) job.note = `Expected ${expected} result(s), found ${fresh.length}.`;

  if (options.download) {
    job.progress = 'downloading';
    job.downloads = await downloadMedia(bridge, mediaFileNames(job.media, job.stem, options.folder), site, browser);
  }
  job.progress = undefined;
}

export class JobQueue {
  private jobs = new Map<string, Job>();
  private working = false;
  private lastFinished = 0;
  pausedReason: string | null = null;

  constructor(private bridge: BridgeHost) {}

  add(scenes: Scene[], options: BatchOptions = {}): Job[] {
    const offset = this.jobs.size;
    const added = scenes.map((scene, index) => {
      const job: Job = {
        id: randomUUID().slice(0, 8),
        status: 'queued',
        scene,
        options,
        stem: scene.name ? sanitize(scene.name) : `scene-${String(offset + index + 1).padStart(2, '0')}`,
        attempts: 0,
        media: [],
        downloads: [],
        createdAt: new Date().toISOString(),
      };
      this.jobs.set(job.id, job);
      return job;
    });
    void this.work();
    return added;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  cancel(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (job?.status === 'queued') {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
    }
    return job;
  }

  // Puts a failed or cancelled job back in line with the same settings and file name.
  retry(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (job && (job.status === 'failed' || job.status === 'cancelled')) {
      job.status = 'queued';
      job.error = undefined;
      job.note = undefined;
      job.finishedAt = undefined;
      void this.work();
    }
    return job;
  }

  summary() {
    const counts: Record<JobStatus, number> = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const job of this.jobs.values()) counts[job.status]++;
    return { ...counts, pausedReason: this.pausedReason };
  }

  // Resolves when every listed job (default: all) has finished, or when timeoutMs runs out.
  async wait(ids?: string[], timeoutMs = 40000) {
    const deadline = Date.now() + timeoutMs;
    const selected = () => (ids?.length ? ids.map((id) => this.jobs.get(id)).filter((j): j is Job => Boolean(j)) : this.list());
    const pending = () => selected().some((j) => j.status === 'queued' || j.status === 'running');
    while (pending() && Date.now() < deadline) await sleep(1000);
    const unknown = (ids ?? []).filter((id) => !this.jobs.has(id));
    return {
      finished: !pending(),
      queue: this.summary(),
      jobs: selected(),
      ...(unknown.length ? { unknown_ids: unknown } : {}),
    };
  }

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const job = this.list().find((j) => j.status === 'queued');
        if (!job) return;
        if (this.lastFinished) {
          const pause = PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
          const remaining = this.lastFinished + pause - Date.now();
          if (remaining > 0) {
            this.pausedReason = `pacing: next generation in ${Math.ceil(remaining / 1000)}s`;
            await sleep(remaining);
            this.pausedReason = null;
          }
        }
        if (job.status !== 'queued') continue;
        job.status = 'running';
        job.attempts++;
        job.startedAt = new Date().toISOString();
        try {
          await runScene(this.bridge, job);
          job.status = 'done';
        } catch (err) {
          // Never retried automatically: a timed-out generation may already have spent credits.
          job.status = 'failed';
          job.error = errorText(err);
          job.progress = undefined;
        }
        job.finishedAt = new Date().toISOString();
        this.lastFinished = Date.now();
      }
    } finally {
      this.working = false;
    }
  }
}
