// Mix the narration onto the screencast and burn captions into a band below it.
//
//   node scripts/demo-video/compose.mjs [out/final.mp4]
//
// Reads out/raw.mp4 and out/timeline.json from record.mjs. The app
// is recorded at 1920x950 and padded to 1920x1080: captions sit in the 130px
// band underneath, so they never cover the interface they describe.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'out');
const CAPS = path.join(OUT, 'captions');
fs.rmSync(CAPS, { recursive: true, force: true });
fs.mkdirSync(CAPS, { recursive: true });
const target = process.argv[2] || path.join(OUT, 'final.mp4');

const tl = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8'));
const RATE = 24000;
const APP_H = 950;
const BAND = 130;
const FONT = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf';
const FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

// ── audio: every line placed at its start, one mono track ───────────────────
function pcmOf(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'data') return new Int16Array(b.buffer.slice(b.byteOffset + off + 8, b.byteOffset + off + 8 + size - (size % 2)));
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}
const total = Math.ceil(tl.duration * RATE);
const mix = new Int16Array(total);
for (const line of tl.lines) {
  const pcm = pcmOf(line.file);
  const at = Math.round(line.start * RATE);
  for (let i = 0; i < pcm.length && at + i < total; i += 1) {
    mix[at + i] = Math.max(-32768, Math.min(32767, mix[at + i] + pcm[i]));
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + mix.byteLength, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(mix.byteLength, 40);
const wav = path.join(OUT, 'narration.wav');
fs.writeFileSync(wav, Buffer.concat([header, Buffer.from(mix.buffer)]));

// ── captions: two short lines at a time, shown in proportion to their length ─
function wrap(text, width = 60) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur ? `${cur} ${w}` : w).length > width && cur) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}
const chunks = [];
for (const line of tl.lines) {
  const rows = wrap(line.cap);
  const groups = [];
  for (let i = 0; i < rows.length; i += 2) groups.push(rows.slice(i, i + 2));
  const chars = groups.reduce((s, g) => s + g.join(' ').length, 0);
  let t = line.start;
  groups.forEach((g, i) => {
    const share = (g.join(' ').length / chars) * line.duration;
    const end = i === groups.length - 1 ? line.start + line.duration + 0.3 : t + share;
    chunks.push({ start: t, end, rows: g });
    t = end;
  });
}

const esc = (p) => p.replace(/\\/g, '/').replace(/'/g, "\\'");
const filters = [`[0:v]pad=1920:${APP_H + BAND}:0:0:color=0x04070b`, `drawbox=x=0:y=${APP_H}:w=1920:h=2:color=0x38bdf8@0.45:t=fill`];
chunks.forEach((c, i) => {
  c.rows.forEach((row, r) => {
    const file = path.join(CAPS, `c${String(i).padStart(3, '0')}_${r}.txt`);
    fs.writeFileSync(file, row);
    const lineH = 46;
    const blockH = c.rows.length * lineH;
    const y = Math.round(APP_H + (BAND - blockH) / 2 + r * lineH + 5);
    filters.push(`drawtext=fontfile='${esc(FONT)}':textfile='${esc(file)}':expansion=none:fontsize=36:fontcolor=0xf2f6fa:x=(w-text_w)/2:y=${y}:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'`);
  });
});
tl.chapters.forEach((ch, i) => {
  if (!ch.title) return;
  const end = tl.chapters[i + 1]?.start ?? tl.duration;
  const file = path.join(CAPS, `chapter${i}.txt`);
  fs.writeFileSync(file, ch.title.toUpperCase());
  filters.push(`drawtext=fontfile='${esc(FONT_BOLD)}':textfile='${esc(file)}':expansion=none:fontsize=17:fontcolor=0x38bdf8:x=34:y=${APP_H + 16}:enable='between(t,${ch.start.toFixed(3)},${end.toFixed(3)})'`);
});
const script = path.join(OUT, 'filters.txt');
fs.writeFileSync(script, `${filters.join(',\n')}[v]`);

// ── subtitles file too, for players and uploads ─────────────────────────────
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};
fs.writeFileSync(target.replace(/\.mp4$/, '.srt'), chunks.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.rows.join('\n')}\n`).join('\n'));

const args = ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'raw.mp4'), '-i', wav,
  '-filter_complex_script', script, '-map', '[v]', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', target];
const res = spawnSync(ffmpegPath, args, { stdio: 'inherit' });
if (res.status !== 0) process.exit(res.status || 1);
const size = fs.statSync(target).size;
console.log(`wrote ${target} (${(size / 1e6).toFixed(1)} MB, ${tl.duration.toFixed(1)}s, ${chunks.length} captions)`);
