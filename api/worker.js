// SlashWord API — Cloudflare Worker + D1
//
// 账号体系与 copilot-checkin 通用：绑定同一个 D1 数据库，共用 users / sessions 表。
// 在 copilot.slashbro.top 注册的账号可以直接登录本站，反之亦然。
//
// 本站自己的表全部以 word_ 开头，避免和 copilot 的 checkins 冲突。
//
// Routes:
//   POST /api/register   {username, password}  -> {token, username}
//   POST /api/login      {username, password}  -> {token, username}
//   POST /api/logout     (Bearer)              -> {ok}
//   GET  /api/me         (Bearer)              -> {username}
//   GET  /api/sync       (Bearer)              -> {cards, logs, checkins, config, serverTime}
//   POST /api/sync       (Bearer) 全量快照      -> {ok, serverTime}

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,20}$/.test(u);
}

// ---------- 认证（与 copilot-checkin 完全一致的实现）----------

async function authUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!match) return null;
  const token = match[1];
  const row = await env.DB.prepare(
    'SELECT s.token, s.expires_at, u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, username: row.username, token };
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, now, now + SESSION_TTL_MS).run();
  return token;
}

async function handleRegister(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!isValidUsername(username)) return json({ error: '用户名需 2-20 个字符（字母、数字、下划线、中文）' }, 400);
  if (typeof password !== 'string' || password.length < 4) return json({ error: '密码至少 4 位' }, 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(username.toLowerCase()).first();
  if (exists) return json({ error: '用户名已存在，请直接登录' }, 409);

  const salt = randomHex(16);
  const hash = await sha256Hex(salt + password);
  const result = await env.DB.prepare(
    'INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(username.toLowerCase(), salt, hash, Date.now()).run();
  const token = await createSession(env, result.meta.last_row_id);
  return json({ token, username }, 201);
}

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const username = (body.username || '').trim().toLowerCase();
  const password = body.password || '';
  const user = await env.DB.prepare('SELECT id, username, salt, hash FROM users WHERE username = ?')
    .bind(username).first();
  if (!user) return json({ error: '用户不存在，请先注册' }, 404);
  const hash = await sha256Hex(user.salt + password);
  if (hash !== user.hash) return json({ error: '密码错误' }, 401);
  const token = await createSession(env, user.id);
  return json({ token, username: user.username });
}

// ---------- 同步 ----------
//
// 简化版 last-write-wins：每条记录带 updated_at，谁新听谁的。
// 一个人跨 Mac/PC/iPad 用，同一时刻只有一台设备在操作，够用。

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS word_cards (
      user_id INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, card_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS word_logs (
      user_id INTEGER NOT NULL,
      log_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, log_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS word_checkins (
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, date)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS word_config (
      user_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
  ]);
}

async function handleGetSync(user, env) {
  await ensureSchema(env);
  const [cards, logs, checkins, config] = await Promise.all([
    env.DB.prepare('SELECT card_id, data, updated_at FROM word_cards WHERE user_id = ?').bind(user.id).all(),
    env.DB.prepare('SELECT log_id, data, created_at FROM word_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5000').bind(user.id).all(),
    env.DB.prepare('SELECT date, data, updated_at FROM word_checkins WHERE user_id = ?').bind(user.id).all(),
    env.DB.prepare('SELECT data, updated_at FROM word_config WHERE user_id = ?').bind(user.id).first(),
  ]);

  return json({
    cards: cards.results.map((r) => ({ id: r.card_id, data: JSON.parse(r.data), updatedAt: r.updated_at })),
    logs: logs.results.map((r) => ({ id: r.log_id, data: JSON.parse(r.data), createdAt: r.created_at })),
    checkins: checkins.results.map((r) => ({ id: r.date, data: JSON.parse(r.data), updatedAt: r.updated_at })),
    config: config ? { data: JSON.parse(config.data), updatedAt: config.updated_at } : null,
    serverTime: Date.now(),
  });
}

async function handlePostSync(user, request, env) {
  await ensureSchema(env);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }

  const stmts = [];
  let n = 0;

  for (const item of body.cards || []) {
    if (!item || typeof item.id !== 'string' || !item.data) continue;
    stmts.push(env.DB.prepare(
      'INSERT INTO word_cards (user_id, card_id, data, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT (user_id, card_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at ' +
      'WHERE excluded.updated_at > word_cards.updated_at'
    ).bind(user.id, item.id, JSON.stringify(item.data), item.updatedAt || Date.now()));
    if (++n > 4000) break;
  }

  for (const item of body.logs || []) {
    if (!item || typeof item.id !== 'string' || !item.data) continue;
    // 复习事件是 append-only，靠 log_id 去重，重复推也不会写两遍
    stmts.push(env.DB.prepare(
      'INSERT OR IGNORE INTO word_logs (user_id, log_id, data, created_at) VALUES (?, ?, ?, ?)'
    ).bind(user.id, item.id, JSON.stringify(item.data), item.createdAt || Date.now()));
    if (++n > 8000) break;
  }

  for (const item of body.checkins || []) {
    if (!item || typeof item.id !== 'string' || !item.data) continue;
    stmts.push(env.DB.prepare(
      'INSERT INTO word_checkins (user_id, date, data, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT (user_id, date) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at ' +
      'WHERE excluded.updated_at > word_checkins.updated_at'
    ).bind(user.id, item.id, JSON.stringify(item.data), item.updatedAt || Date.now()));
    if (++n > 10000) break;
  }

  if (body.config && body.config.data) {
    stmts.push(env.DB.prepare(
      'INSERT INTO word_config (user_id, data, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at ' +
      'WHERE excluded.updated_at > word_config.updated_at'
    ).bind(user.id, JSON.stringify(body.config.data), body.config.updatedAt || Date.now()));
  }

  if (stmts.length) {
    // D1 单批次有体积上限，切片提交
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100));
    }
  }
  return json({ ok: true, saved: stmts.length, serverTime: Date.now() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      if (path === '/api/register' && request.method === 'POST') return await handleRegister(request, env);
      if (path === '/api/login' && request.method === 'POST') return await handleLogin(request, env);

      const user = await authUser(request, env);
      if (!user) return json({ error: '未登录或会话已过期' }, 401);

      if (path === '/api/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(user.token).run();
        return json({ ok: true });
      }
      if (path === '/api/me' && request.method === 'GET') return json({ username: user.username });
      if (path === '/api/sync' && request.method === 'GET') return await handleGetSync(user, env);
      if (path === '/api/sync' && request.method === 'POST') return await handlePostSync(user, request, env);

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server error: ' + (err && err.message) }, 500);
    }
  },
};
