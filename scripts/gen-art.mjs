// Generates the dog art with Gemini, then crops each dog to a round portrait.
// Run: node scripts/gen-art.mjs [name...]   (needs ~/.config/agent/credentials/openrouter_api_key)
// Goes through OpenRouter: the Gemini key is free tier, which has no image quota.
// Raw images land in art-src/, finished ones in public/art/. Both are committed,
// so the game never needs the key to build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import sharp from 'sharp';

const MODEL = 'google/gemini-3.1-flash-image';
const KEY = readFileSync(`${homedir()}/.config/agent/credentials/openrouter_api_key`, 'utf8').trim();

const STYLE =
  'Cute cartoon children\'s game art, bold clean outlines, flat bright colours, soft shading, ' +
  'friendly happy expression, big eyes. Plain pure white background, nothing else in frame, no text.';

const DOGS = {
  corgi: 'a corgi',
  dachshund: 'a brown dachshund',
  dalmatian: 'a dalmatian',
  pug: 'a fawn pug',
  collie: 'a black and white border collie',
  labrador: 'a golden labrador',
  husky: 'a grey and white husky',
  poodle: 'a fluffy apricot poodle',
};

const SCENES = {
  park: {
    prompt:
      'Cute cartoon children\'s game background: a sunny dog park with soft green hills, trees, ' +
      'a few bones and tennis balls in the grass, gentle sky. Calm, low detail in the centre so game ' +
      'pieces can sit on top. Portrait orientation, no text, no characters.',
    size: [900, 1600],
  },
};

async function generate(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error(`no image in reply: ${JSON.stringify(json).slice(0, 400)}`);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

async function portrait(raw, out) {
  const size = 256;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  await sharp(raw)
    .trim({ background: '#ffffff', threshold: 20 })
    .resize(size, size, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 85 })
    .toFile(out);
}

const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);

for (const [name, who] of Object.entries(DOGS)) {
  if (!want(name)) continue;
  const rawPath = `art-src/${name}.png`;
  if (!existsSync(rawPath) || only.includes(name)) {
    const prompt = `${STYLE} Head and shoulders portrait of ${who}, facing the viewer, centred.`;
    writeFileSync(rawPath, await generate(prompt));
  }
  await portrait(rawPath, `public/art/${name}.webp`);
  console.log('dog', name);
}

for (const [name, scene] of Object.entries(SCENES)) {
  if (!want(name)) continue;
  const rawPath = `art-src/${name}.png`;
  if (!existsSync(rawPath) || only.includes(name)) writeFileSync(rawPath, await generate(scene.prompt));
  await sharp(rawPath).resize(...scene.size, { fit: 'cover' }).webp({ quality: 80 }).toFile(`public/art/${name}.webp`);
  console.log('scene', name);
}
