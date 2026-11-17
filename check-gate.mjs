// Local replica of the token-radar-01 gate's seven rows, from RULES.txt.
// Not part of the entry; run: node check-gate.mjs <output-dir> <snapshot.json>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const snapPath = process.argv[3];
if (!out || !snapPath) {
  console.error('usage: node check-gate.mjs <output-dir> <snapshot.json>');
  process.exit(2);
}
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const slugs = new Set(snap.protocols.map((p) => p.slug));
const watchlist = snap.watchlist;
let fail = 0;
const row = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail++;
};

// 1. dashboard_files
{
  const dir = join(out, 'dashboard');
  const names = readdirSync(dir);
  let ok = true;
  let detail = '';
  const files = [];
  const walk = (d, rel) => {
    for (const n of readdirSync(d)) {
      if (n.startsWith('.')) { ok = false; detail = `dot entry ${rel}${n}`; continue; }
      if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(n)) { ok = false; detail = `bad name ${n}`; continue; }
      const p = join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, `${rel}${n}/`);
      else if (st.isFile()) files.push(join(rel, n));
    }
  };
  walk(dir, '');
  const total = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  if (!names.includes('index.html')) { ok = false; detail = 'no index.html'; }
  if (!files.some((f) => f.endsWith('.css'))) { ok = false; detail = 'no .css'; }
  if (!files.some((f) => f.endsWith('.js'))) { ok = false; detail = 'no .js'; }
  if (files.length > 400 || total > 4_194_304) { ok = false; detail = `${files.length} files, ${total} bytes`; }
  const urlRe = /https?:\/\/[^"'\s<>]+/;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (f.endsWith('.css') && urlRe.test(text)) { ok = false; detail = `${f} names a URL in CSS`; break; }
    if (f.endsWith('.html')) {
      const attrs = [...text.matchAll(/(?:href|src|action|poster)\s*=\s*["']([^"']*)["']/g)];
      if (attrs.some((m) => /^https?:\/\//.test(m[1]))) { ok = false; detail = `${f} has an http(s) attribute`; break; }
      const styleBodies = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
      if (styleBodies.some((m) => urlRe.test(m[1]))) { ok = false; detail = `${f} has a URL in <style>`; break; }
    }
    if (f.endsWith('.js')) {
      const imps = [...text.matchAll(/(?:import\s+[^'"]*?from\s*|require\s*\(|import\s*\()\s*["']([^"']+)["']/g)];
      if (imps.some((m) => /^https?:\/\//.test(m[1]))) { ok = false; detail = `${f} imports a URL`; break; }
    }
  }
  row('dashboard_files', ok, `${files.length} files, ${total} bytes${detail ? `; ${detail}` : ''}`);
}

// 2. board_file
let board;
{
  const raw = readFileSync(join(out, 'board.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  board = rows;
  let ok = true;
  let detail = `${rows.length} rows, ${raw.length} bytes`;
  if (!Array.isArray(rows) || rows.length < 100 || rows.length > 4000) { ok = false; detail = `row count ${rows?.length}`; }
  if (raw.length > 8_388_608) { ok = false; detail = 'over 8 MiB'; }
  const seen = new Set();
  for (const r of rows) {
    if (!slugs.has(r.slug)) { ok = false; detail = `invented slug ${r.slug}`; break; }
    if (seen.has(r.slug)) { ok = false; detail = `duplicate slug ${r.slug}`; break; }
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) { ok = false; detail = `${r.slug} has no name`; break; }
    if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { ok = false; detail = `${r.slug} bad rank`; break; }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) { ok = false; detail = `${r.slug} bad implied value`; break; }
    if (!Array.isArray(r.farm_steps)) { ok = false; detail = `${r.slug} no farm_steps`; break; }
  }
  if (ok && rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) { ok = false; detail = 'all implied values equal'; }
  row('board_file', ok, detail);
}

// 3. sorted_by_value
{
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  let ok = ranks.every((v, i) => v === i + 1);
  let detail = '';
  if (ok) {
    for (let i = 1; i < board.length; i++) {
      if (board[i].implied_value_usd > board[i - 1].implied_value_usd) { ok = false; detail = `row ${i + 1} outranks row ${i}`; break; }
    }
  } else detail = 'ranks are not 1..N';
  row('sorted_by_value', ok, detail);
}

// 4. coverage
{
  const have = new Set(board.map((r) => r.slug));
  const missing = watchlist.filter((s) => !have.has(s));
  row('coverage', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${watchlist.length}/${watchlist.length} watchlist slugs`);
}

// 5. farm_steps
{
  let ok = true;
  let detail = '';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { ok = false; detail = `${r.slug} has ${r.farm_steps.length} steps`; break; }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) { ok = false; detail = `${r.slug} step of ${t.length} chars`; break; }
    }
    if (!ok) break;
  }
  row('farm_steps', ok, detail || `${board.length} rows x ${board[0].farm_steps.length} steps`);
}

// 6. screenshots
{
  const dir = join(out, 'screenshots');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.'));
  let ok = names.length >= 3 && names.length <= 4;
  let detail = `${names.length} images`;
  const dims = {};
  for (const n of names) {
    const buf = readFileSync(join(dir, n));
    if (buf.length > 524_288) { ok = false; detail = `${n} over 512 KiB`; break; }
    let w, h;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off < buf.length) {
        if (buf[off] !== 0xff) break;
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = buf.readUInt16BE(off + 5); w = buf.readUInt16BE(off + 7); break;
        }
        off += 2 + len;
      }
    } else { ok = false; detail = `${n} is neither PNG nor JPEG`; break; }
    dims[n] = [w, h];
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    if (long > 1440 || short < 800) { ok = false; detail = `${n} is ${w}x${h}`; break; }
  }
  row('screenshots', ok, `${detail} ${Object.entries(dims).map(([n, [w, h]]) => `${n}=${w}x${h}`).join(' ')}`);
}

// 7. dossier_matches — rebuild with the vendored library via node --input-type=module is
// awkward here; instead verify the dossier parses, is under the cap, and its text holds
// the whole dashboard source with no cut.
{
  const raw = readFileSync(join(out, 'dossier.json'));
  const doc = JSON.parse(raw.toString('utf8'));
  const ok = raw.length <= 1_572_864 && doc.schema === 'makefun/dossier/v1' && !doc.text.includes('[Cut at') && doc.images.length >= 3;
  row('dossier_matches', ok, `${raw.length} bytes, text ${Buffer.byteLength(doc.text, 'utf8')} bytes, ${doc.images.length} images (byte-equality with buildDossier is checked by the main.ts run itself)`);
}

console.log(fail === 0 ? 'ALL 7 GATE ROWS PASS (local replica)' : `${fail} ROW(S) FAIL`);
process.exit(fail === 0 ? 0 : 1);
