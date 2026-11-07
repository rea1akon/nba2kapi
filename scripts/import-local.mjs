// 把本地抓好的 JSON 灌进 Convex（不重新抓取，只写库）
// 用法：node scripts/import-local.mjs out/curr_20261106.json
// 需要环境变量 ADMIN_API_KEY、CONVEX_URL（默认 friendly-parrot-83）
import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://friendly-parrot-83.convex.cloud';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY) { console.error('缺少 ADMIN_API_KEY'); process.exit(1); }

const file = process.argv[2];
if (!file) { console.error('用法: node scripts/import-local.mjs <json>'); process.exit(1); }

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const players = raw.players || raw;
console.log(`读入 ${players.length} 人 → ${CONVEX_URL}`);

// 属性名转 camelCase（ThreePointShot → threePointShot），与 API 规范一致
const camel = (k) => (k ? k[0].toLowerCase() + k.slice(1) : k);
const cleanAttrs = (a) => {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (v === null || v === undefined || typeof v !== 'number') continue;
    const k2 = camel(k);
    if (k2 === 'overallDurability') continue;
    out[k2] = v;
  }
  return out;
};

const slugOf = (p) => {
  const u = (p.playerUrl || '').replace(/\/+$/, '');
  return (u.split('/').pop() || p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

const client = new ConvexHttpClient(CONVEX_URL);
const CONCURRENCY = 6;
let ok = 0, fail = 0;
const errors = [];

async function one(p) {
  const payload = {
    adminKey: ADMIN_API_KEY,
    name: p.name,
    slug: p.slug || slugOf(p),
    playerUrl: p.playerUrl || undefined,
    team: p.team || 'Free Agency',
    teamType: (p.teamType || 'curr').toLowerCase(),
    overall: Number(p.overall),
    positions: Array.isArray(p.positions) ? p.positions : undefined,
    height: p.height || undefined,
    weight: p.weight || undefined,
    wingspan: p.wingspan || undefined,
    archetype: p.archetype || undefined,
    college: p.college || undefined,
    playerImage: p.playerImage || undefined,
    teamImg: p.teamImg || undefined,
    attributes: cleanAttrs(p.attributes),
    badges: p.badges || undefined,
    hotZones: p.hotZones || undefined,
    ratingHistory: Array.isArray(p.ratingHistory) ? p.ratingHistory : undefined,
    seasonMovement: Array.isArray(p.seasonMovement) ? p.seasonMovement : undefined,
    lastUpdated: p.lastUpdated || new Date().toISOString(),   // mutation 里是必填
  };
  if (!Number.isFinite(payload.overall)) throw new Error(`overall 非法: ${p.name}`);
  await client.mutation(api.playerHistory.adminUpsertPlayerWithHistory, payload);
}

const queue = [...players];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    try { await one(p); ok++; }
    catch (e) { fail++; if (errors.length < 8) errors.push(`${p.name}: ${String(e.message).slice(0, 80)}`); }
    if ((ok + fail) % 100 === 0) console.log(`  进度 ${ok + fail}/${players.length}（成功 ${ok} / 失败 ${fail}）`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`\n完成：成功 ${ok}｜失败 ${fail}`);
if (errors.length) console.log('样例错误：\n  ' + errors.join('\n  '));
