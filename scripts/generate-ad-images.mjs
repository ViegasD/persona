/**
 * Ad image generator — 3 occasions × 2 images = 6 total.
 * Occasions: aniversario, formatura, gravidez
 * Model: nano-banana-2 (same as production backend)
 * Reference: Pexels #1786258 — Photo by Italo Melo (free commercial use)
 *
 * Usage:  node scripts/generate-ad-images.mjs
 * Output: ad-assets/reference.jpg
 *         ad-assets/aniversario-1.png, aniversario-2.png
 *         ad-assets/formatura-1.png,   formatura-2.png
 *         ad-assets/gravidez-1.png,    gravidez-2.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Load .env ───────────────────────────────────────────────────────────────
function loadEnv(p) {
  const vars = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

const env = loadEnv(path.join(ROOT, 'apps/backend/.env'));
const KIE_API_URL = env.KIE_API_URL || 'https://api.kie.ai';
const KIE_API_KEY = env.KIE_API_KEY;
if (!KIE_API_KEY) { console.error('❌  KIE_API_KEY not found in apps/backend/.env'); process.exit(1); }

// ─── Config ──────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(ROOT, 'ad-assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

const REFERENCE_URL =
  'https://images.pexels.com/photos/1786258/pexels-photo-1786258.jpeg?auto=compress&cs=tinysrgb&w=1260&fit=max';

const BASE_QUALITY =
  'professional portrait photography, 4K HDR, sharp facial details, natural skin texture, ' +
  'photorealistic, 35mm portrait lens, soft background bokeh, studio-level lighting quality, ' +
  'high-end color grading';

const IDENTITY =
  "You are given reference photos of a real person. Carefully study every detail of their face — " +
  "the exact shape and color of their eyes, their nose structure, lip shape, skin tone, complexion, " +
  "and hair color and texture. Preserve this exact person's identity precisely in the generated image.";

// Prompts mirror apps/backend/src/modules/image-gen/prompt.engine.ts exactly
const JOBS = [
  {
    occasion: 'aniversario',
    tasks: [
      `${IDENTITY} Generate a photorealistic portrait of this same person in a birthday celebration setting, featuring colorful birthday balloons and a birthday cake, colorful confetti, and warm celebratory lighting. Pose: blowing out birthday candles on a cake, joyful expression, candid and natural. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
      `${IDENTITY} Generate a photorealistic portrait of this same person in a birthday celebration setting, featuring colorful birthday balloons and a birthday cake, colorful confetti, and warm celebratory lighting. Pose: surrounded by colorful balloons, big genuine smile looking at the camera. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
    ],
  },
  {
    occasion: 'formatura',
    tasks: [
      `${IDENTITY} Generate a photorealistic portrait of this same person in a graduation setting, wearing academic cap and gown, holding a diploma, proud and joyful expression befitting a graduation ceremony. Pose: throwing graduation cap in the air, euphoric and joyful expression. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
      `${IDENTITY} Generate a photorealistic portrait of this same person in a graduation setting, wearing academic cap and gown, holding a diploma, proud and joyful expression befitting a graduation ceremony. Pose: holding diploma with both hands, proud and emotional expression. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
    ],
  },
  {
    occasion: 'gravidez',
    tasks: [
      `${IDENTITY} Generate a photorealistic portrait of this same person in a maternity photography setting, gentle and elegant pose that highlights the baby bump beautifully, flowing dress, soft diffused natural lighting, serene and tender atmosphere. Pose: hands gently cradling baby bump, serene and peaceful expression. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
      `${IDENTITY} Generate a photorealistic portrait of this same person in a maternity photography setting, gentle and elegant pose that highlights the baby bump beautifully, flowing dress, soft diffused natural lighting, serene and tender atmosphere. Pose: elegant side profile silhouette that highlights the baby bump beautifully. ${BASE_QUALITY} Only this exact person should appear in the image — no other faces, people, or bystanders.`,
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function kieReq(method, endpoint, body) {
  const res = await fetch(`${KIE_API_URL}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || (json.code && json.code !== 200))
    throw new Error(`Kie.ai ${json.code ?? res.status}: ${json.msg ?? 'unknown'}`);
  return json;
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function poll(taskId, interval = 5000, timeout = 300_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const { data } = await kieReq('GET', `/api/v1/jobs/recordInfo?taskId=${taskId}`);
    if (data.state === 'success') return JSON.parse(data.resultJson ?? '{}').resultUrls ?? [];
    if (data.state === 'fail') throw new Error(`Task ${taskId} failed: ${data.failMsg}`);
    process.stdout.write(`  ⏳ [${taskId}] ${data.state}...                \r`);
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Task ${taskId} timed out`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('📥  Downloading reference from Pexels...');
await downloadFile(REFERENCE_URL, path.join(OUT_DIR, 'reference.jpg'));
console.log('✅  ad-assets/reference.jpg  (Photo by Italo Melo on Pexels — free commercial use)\n');

// Submit all tasks up-front
const submitted = [];
for (const group of JOBS) {
  for (let i = 0; i < group.tasks.length; i++) {
    console.log(`🚀  Submitting ${group.occasion} ${i + 1}/${group.tasks.length}...`);
    const { data } = await kieReq('POST', '/api/v1/jobs/createTask', {
      model: 'nano-banana-2',
      input: {
        prompt: group.tasks[i],
        image_input: [REFERENCE_URL],
        aspect_ratio: '4:5',
        resolution: '2K',
        output_format: 'png',
      },
    });
    console.log(`   taskId: ${data.taskId}`);
    submitted.push({ occasion: group.occasion, index: i + 1, taskId: data.taskId });
  }
}

console.log('\n⏳  Polling for results (this takes a few minutes)...\n');
const settled = await Promise.allSettled(submitted.map(t => poll(t.taskId)));

let saved = 0;
for (let i = 0; i < settled.length; i++) {
  const { occasion, index } = submitted[i];
  const label = `${occasion}-${index}`;
  if (settled[i].status === 'rejected') {
    console.error(`\n❌  ${label}: ${settled[i].reason?.message}`);
    continue;
  }
  for (const url of settled[i].value) {
    const filename = `${label}.png`;
    process.stdout.write('\n');
    console.log(`💾  Saving ad-assets/${filename}...`);
    await downloadFile(url, path.join(OUT_DIR, filename));
    saved++;
    console.log(`✅  ad-assets/${filename}`);
  }
}

console.log(`\n🎉  Done — ${saved} image(s) saved to ad-assets/`);
console.log('   Reference: ad-assets/reference.jpg');
