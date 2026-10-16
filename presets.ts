export interface Technique {
  id: string;
  category: 'camera' | 'product' | 'transition' | 'image';
  name: string;
  phrase: string;
}

// Prompt fragments appended to a scene's prompt. Use one per scene: two camera moves fight each other.
export const TECHNIQUES: Technique[] = [
  { id: 'static', category: 'camera', name: 'Locked-off static', phrase: 'Locked-off static camera on a tripod, no camera movement, a single framing for the whole shot.' },
  { id: 'push-in', category: 'camera', name: 'Slow push-in', phrase: 'The camera pushes in slowly and steadily toward the subject.' },
  { id: 'pull-back-reveal', category: 'camera', name: 'Pull-back reveal', phrase: 'The camera pulls straight back from a close-up to a very wide shot, revealing the scale of the surroundings.' },
  { id: 'orbit-360', category: 'camera', name: 'Orbit 360', phrase: 'The camera orbits a full 360 degrees around the subject at constant height.' },
  { id: 'dolly-zoom', category: 'camera', name: 'Dolly zoom', phrase: 'Dolly zoom: the camera tracks backward while zooming in, the subject stays the same size while the background stretches away.' },
  { id: 'crash-zoom', category: 'camera', name: 'Crash zoom', phrase: 'Aggressive crash zoom toward the subject that stops abruptly with a slight impact shake.' },
  { id: 'crane-up', category: 'camera', name: 'Crane up', phrase: 'The camera cranes smoothly upward from eye level to a high angle, opening the scene from above.' },
  { id: 'lateral-track', category: 'camera', name: 'Lateral tracking', phrase: 'The camera tracks sideways parallel to the subject, foreground elements sliding past for parallax.' },
  { id: 'handheld', category: 'camera', name: 'Handheld documentary', phrase: 'Handheld documentary camera with subtle natural shake and small reframing, observational feel.' },
  { id: 'fpv-flythrough', category: 'camera', name: 'FPV fly-through', phrase: 'FPV drone shot flying fast and low, weaving between obstacles in a single continuous take.' },
  { id: 'top-down', category: 'camera', name: 'Top-down', phrase: 'Strict top-down overhead shot, camera pointing straight down.' },
  { id: 'speed-ramp', category: 'camera', name: 'Speed ramp', phrase: 'One continuous shot with a speed ramp: slow motion, a burst of fast motion, then slow motion again, no cuts.' },
  { id: 'hero-rotation', category: 'product', name: 'Hero rotation', phrase: 'The product rotates slowly on a dark studio pedestal, rim light tracing its edges, shape and label unchanged.' },
  { id: 'levitation', category: 'product', name: 'Levitation', phrase: 'The product floats in mid-air and turns slowly, soft shadow beneath it, premium studio look.' },
  { id: 'liquid-splash', category: 'product', name: 'Liquid splash', phrase: 'Liquid splashes around the product in extreme slow motion, droplets catching the light, the product stays sharp.' },
  { id: 'macro-bokeh', category: 'product', name: 'Macro bokeh', phrase: 'Extreme macro close-up gliding across the product surface, shallow depth of field, golden bokeh behind.' },
  { id: 'seamless-loop', category: 'transition', name: 'Seamless loop', phrase: 'The motion ends exactly where it started so the clip loops seamlessly.' },
  { id: 'whip-pan', category: 'transition', name: 'Whip pan', phrase: 'A fast whip pan with heavy motion blur sweeps the scene away into the next.' },
  { id: 'img-cinematic', category: 'image', name: 'Cinematic keyframe', phrase: 'Cinematic film still, 85mm lens, shallow depth of field, golden hour light, subtle film grain.' },
  { id: 'img-white-bg', category: 'image', name: 'White background', phrase: 'Pure white seamless background with a soft natural shadow, marketplace listing style.' },
  { id: 'img-flat-lay', category: 'image', name: 'Flat lay', phrase: 'Neat flat lay shot strictly from above on a clean surface, even soft light.' },
];

export const techniqueById = (id: string) => TECHNIQUES.find((t) => t.id === id);

export function applyTechnique(prompt: string, techniqueId?: string): string {
  if (!techniqueId) return prompt;
  const technique = techniqueById(techniqueId);
  if (!technique) throw new Error(`Unknown technique "${techniqueId}". Call flow_techniques for the list.`);
  return `${prompt.trim().replace(/[.\s]*$/, '.')} ${technique.phrase}`;
}

// Guidance handed to the calling model through flow_status, so it plans work the bridge can actually run.
export const PLAYBOOK = {
  workflow: [
    'Call flow_status first. If no browser is connected or hasPromptBox is false, fix that (flow_open_project) before generating.',
    'Plan the piece as one scene per shot and send them in ONE flow_generate call; scenes run one at a time with a randomised pause between them.',
    'Video generations spend the user\'s Flow credits: tell the user the scene count before queueing videos.',
    'Call flow_wait repeatedly until finished is true. A reply with still_working and a task_id means the call is still running: pass the task_id to flow_wait and never repeat the call.',
    'If a job fails with "no new media detected", the generation may still be running in Flow. Check flow_scan_media before re-queueing, or the user pays twice.',
  ],
  prompt_order: 'subject and action -> shot size and camera move -> location -> visual style -> lighting -> sound/dialogue',
  prompt_rules: [
    'Write prompts in English, one continuous shot per scene, one camera move per scene (see flow_techniques).',
    'Repeat the full description of a recurring character or product in every scene; Flow has no memory between scenes.',
    'Put spoken lines in quotes and say who speaks; keep a line short enough for the clip length.',
    'Make free still images first to lock the look before spending credits on video.',
  ],
};
