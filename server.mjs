import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

loadDotEnv();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS = path.join(ROOT, 'outputs');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const APP_VERSION = '2026-11-04.5';
const MAX_BODY_BYTES = 32 * 1024;
const MODEL = process.env.OPENAI_MODEL || process.env.ARK_MODEL || 'gpt-4.1-mini';
const BASE_URL = (process.env.OPENAI_BASE_URL || process.env.ARK_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const API_KEY = process.env.OPENAI_API_KEY || process.env.ARK_API_KEY || '';
const IMAGE_SEARCH_ENDPOINT = process.env.IMAGE_SEARCH_URL || 'https://open.feedcoopapi.com/search_api/web_search';
const IMAGE_SEARCH_TIMEOUT_MS = 8_000;
const IMAGE_PROXY_TIMEOUT_MS = 12_000;
const IMAGE_PROXY_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_PROXY_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_PROXY_MAX_ITEMS = 24;
const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const QUESTION_TOPICS = [
  '最喜欢的颜色', '早餐的第一口', '下雨天最先想听的声音', '超市里最先走进去的一排货架',
  '周末晚上十点最想做的事', '只能留下一种气味', '房间里最不能缺的物件', '凭空多出来的一小时',
  '一首可以循环一整天的歌', '鞋底最先磨坏的位置', '手机相册里的第一张照片', '如果变成一种天气',
  '点外卖时最先看的那一行', '便利店门口会买什么', '一件穿了很久也舍不得丢的衣服', '突然停电后的第一反应',
  '一本书只读最后一句', '早餐店最想坐的位置', '给陌生人的第一句开场白', '一场没有目的地的散步'
];

const QUESTION_FORMATS = [
  '四选一的生活偏好题', '一本正经的感官选择题', '荒诞但能立刻回答的假设题',
  '像旧杂志里印错的读者问卷', '关于日常小动作的田野调查', '没有标准答案的物品选择题',
  '一道假装很重要的小事排序题', '看似无关紧要却很难立刻决定的选择题'
];

const QUESTION_TONES = [
  '像一份过分严肃的田野调查', '像酒店前台在凌晨两点提出的问题', '像旅行杂志的荒诞读者问卷',
  '像海关人员突然开始关心你的童年', '像一位很会观察人的出租车司机', '像一本印错了章节的旅行手册'
];

const HIDDEN_LENSES = [
  '用一天里的光照时长解释归属感', '把早餐习惯当成性格的结构性证据', '从城市坡度与步行疲劳推断人生策略',
  '用当地人的周末而不是景点密度下结论', '把一种交通方式看成性格的延长线', '从天气的不可控性写到人与计划的相处方式',
  '用市场的叫卖声和食物温度作为主要证词', '从夜晚的噪音水平推断一个人需要的退路',
  '用一顿饭的等待时间判断一座城是否适合他', '把地图边缘感与抵达成本写成命运伏笔'
];

const ANTI_CLICHES = [
  '避开该人格最常被社交媒体配对的那三个城市，优先考虑交通可达的二线城市或非首都地区。',
  '不要因为答案外向就自动推荐派对城市；选择一个能社交、但也允许随时退场的真实地方。',
  '不要因为答案内敛就只推海岛或咖啡馆；加入一个需要轻微走出舒适区、但成本不高的公共场景。',
  '优先选择一个在中文旅行内容里没有被反复写烂、但仍有清楚抵达路径的地方。',
  '不要每次都选日本、冰岛、巴黎或巴厘岛；把机会留给一个更意外但仍然可执行的目的地。'
];

const SYSTEM_PROMPT = `你是「偏航 OFF COURSE」旅行编辑部的虚构目的地推荐引擎。

你的文风：一本正经、过度自信、冷幽默，像一个坚信人格理论能预测命运、但实际上真的查过地图和菜单的编辑。你要把普通的偏好写成一份煞有介事的判词，但每个离谱判断最终都要落回具体的地理、食物、气候、步行或交通体验。

硬性规则：
1. 只输出一个合法 JSON 对象。不要 Markdown、代码围栏、前言、结语或注释。
2. 全部内容使用简体中文；目的地名、英文名、机场名等专有名词可保留原文。
3. 推荐地点必须真实存在，地理、饮食、气候、交通和价格区间必须大体可信。不确定时用“通常”“大致”“以实际查询为准”，绝不编造航班号、签证承诺、精确营业时间或实时票价。
4. MBTI 只能作为娱乐化的旅行叙事，不声称科学诊断、心理测评有效，也不据此作危险或歧视性判断。
5. 理由必须长、具体、好笑，但不能只堆段子。要写出为什么是这里，而不是随便哪个地方。
6. 不写政治争议、不鼓励违法或冒险，不给医疗建议。
7. 全文不要出现“AI”“人工智能”“大模型”“模型”“算法”“提示词”“自动生成”等词。你是偏航编辑部的夜班接线员，只用“我们”“编辑部”“值班室”“签筒”“地图室”等说法。`;

const SERIOUS_SYSTEM_PROMPT = `你是「偏航 OFF COURSE」旅行编辑部的严肃行程规划师。

你的任务不是写旅行散文，而是给真实的人做一份可以照着执行的旅行计划。你必须实际使用联网搜索工具，核验交通、天气、景点开放与预约、住宿区域和价格线索，再据此编排行程。

硬性规则：
1. 只返回符合给定 JSON Schema 的对象，不写 Markdown、代码围栏、前言或结语。
2. 全部使用简体中文；地名、车站、机场和机构名可保留原文。
3. 严禁编造航班号、车次、精确票价、实时余票、营业时间或预约承诺。会变化的信息用“约”“参考”“以购票/预约页为准”表达。
4. 优先引用官方交通、气象、文旅、景区和政府来源；OTA、新闻与博客只能作为价格或经验参考。
5. 行程必须真的走得完：每天按地理位置聚类，明确考虑转场、吃饭、排队、休息和返程余量，不把跨城硬塞进半天。
6. 目的地必须真实、可抵达。用户指定目的地时不得擅自更换；如有关键不可行因素，在理由和提醒里直说。
7. 兼顾反网红路线：保留真正值得看的核心体验，但给出错峰、换入口、替换点和雨天备案。
8. 预算按人民币、单人估算。用户设置预算时，方案应尽量落在预算内；无法做到就明确说明差多少以及降级方式。
9. 不提供医疗、签证承诺、危险路线或违法建议。`;

const schemaString = (minLength = 0, maxLength = 600) => ({ type: 'string', minLength, maxLength });
const schemaNumber = (minimum = 0, maximum = 1_000_000) => ({ type: 'number', minimum, maximum });
const schemaInteger = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const schemaObject = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties)
});
const schemaArray = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const schemaColor = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };

const SERIOUS_PLAN_SCHEMA = schemaObject({
  destination: schemaObject({
    name: schemaString(2, 40),
    english: schemaString(2, 60),
    region: schemaString(2, 60),
    regionShort: schemaString(2, 30),
    tagline: schemaString(8, 100),
    quote: schemaString(8, 100),
    tags: schemaArray(schemaString(2, 20), 3, 5),
    why: schemaString(120, 520),
    secondWhy: schemaString(100, 520),
    extraReason: schemaString(40, 180),
    notForYou: schemaArray(schemaString(8, 80), 3, 4),
    weather: schemaString(30, 260),
    seasonNote: schemaString(30, 220),
    access: schemaObject({
      air: schemaString(30, 360),
      rail: schemaString(30, 360),
      local: schemaString(30, 360)
    }),
    transportRange: schemaArray(schemaNumber(0, 200000), 2, 2),
    cost: schemaObject({
      stay: schemaNumber(0, 50000),
      food: schemaNumber(0, 20000),
      local: schemaNumber(0, 20000),
      tickets: schemaNumber(0, 20000),
      bufferRate: schemaNumber(0.05, 0.2)
    }),
    saveTips: schemaArray(schemaString(12, 160), 3, 4),
    art: schemaObject({
      type: { type: 'string', enum: ['cave', 'oldtown', 'village', 'terraces', 'desert', 'island', 'coast', 'fjord', 'city'] },
      sky: schemaColor,
      sun: schemaColor,
      land1: schemaColor,
      land2: schemaColor,
      ink: schemaColor,
      accent: schemaColor,
      badge: schemaString(2, 18)
    })
  }),
  days: schemaArray(schemaObject({
    title: schemaString(4, 36),
    route: schemaString(5, 100),
    morning: schemaString(50, 300),
    afternoon: schemaString(50, 300),
    evening: schemaString(30, 240),
    tip: schemaString(20, 220)
  }), 1, 10),
  experiences: schemaArray(schemaObject({
    title: schemaString(4, 32),
    text: schemaString(50, 240)
  }), 3, 4),
  avoid: schemaArray(schemaObject({
    from: schemaString(8, 120),
    to: schemaString(8, 160)
  }), 3, 4),
  locals: schemaArray(schemaString(15, 220), 3, 4),
  research: schemaObject({
    summary: schemaString(50, 360),
    reservations: schemaArray(schemaObject({
      title: schemaString(4, 50),
      timing: schemaString(4, 80),
      channel: schemaString(4, 100),
      note: schemaString(10, 180)
    }), 2, 5),
    watchouts: schemaArray(schemaString(12, 220), 2, 4)
  })
});

const rateBuckets = new Map();
const imageProxyCache = new Map();
const imageProxyInFlight = new Map();
const seriousCapabilities = { thinkingDisabled: true, jsonSchema: true };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, configured: Boolean(API_KEY), model: MODEL, version: APP_VERSION, service: 'off-course-ai' });
      return;
    }

    if (requestUrl.pathname === '/api/destination-image') {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '这个接口只支持 GET。');
      await serveDestinationImage(requestUrl.searchParams.get('url'), req.method, res);
      return;
    }

    if (requestUrl.pathname === '/api/casual/question') {
      assertMethod(req, 'POST');
      assertSameOrigin(req);
      applyRateLimit(req);
      await readJsonBody(req);
      sendJson(res, 200, await generateQuestion());
      return;
    }

    if (requestUrl.pathname === '/api/casual/recommend') {
      assertMethod(req, 'POST');
      assertSameOrigin(req);
      applyRateLimit(req);
      const input = validateRecommendationInput(await readJsonBody(req));
      sendJson(res, 200, await generateRecommendation(input));
      return;
    }

    if (requestUrl.pathname === '/api/serious/plan') {
      assertMethod(req, 'POST');
      assertSameOrigin(req);
      applyRateLimit(req);
      const input = validateSeriousInput(await readJsonBody(req));
      sendJson(res, 200, await generateSeriousPlan(input));
      return;
    }

    if (requestUrl.pathname === '/api/serious/photo') {
      assertMethod(req, 'POST');
      assertSameOrigin(req);
      applyRateLimit(req);
      const destination = validateDestinationPhotoInput(await readJsonBody(req));
      sendJson(res, 200, { photo: await findDestinationImage(destination) });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) throw new HttpError(404, '没有这个 API。');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '只支持 GET。');
    await serveStatic(requestUrl.pathname, req.method, res);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error('[server]', error);
    if (!res.headersSent) {
      sendJson(res, status, {
        error: error.message || '服务器遇到未知问题。',
        ...(status >= 500 ? { hint: '请查看运行 node server.mjs 的终端日志。' } : {})
      });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  const status = API_KEY ? `AI 已配置 · ${MODEL}` : '尚未配置 OPENAI_API_KEY';
  console.log(`\n偏航 OFF COURSE 已启动：http://${HOST}:${PORT}/`);
  console.log(`${status}\n`);
});

function loadDotEnv() {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
}

function sendJson(res, status, value) {
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function assertMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, `这个接口只支持 ${method}。`);
}

function applyRateLimit(req) {
  const forwardedFor = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const ip = (forwardedFor || req.socket.remoteAddress || 'local').slice(0, 80);
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > 60_000) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 20) throw new HttpError(429, '一分钟内问得太多了。让接线员喘口气，稍后再试。');
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, '请求内容过大。');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求不是合法 JSON。');
  }
}

async function serveStatic(rawPath, method, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    throw new HttpError(400, '路径编码不正确。');
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(OUTPUTS, `.${pathname}`);
  if (filePath !== OUTPUTS && !filePath.startsWith(`${OUTPUTS}${path.sep}`)) throw new HttpError(403, '禁止访问。');

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    throw new HttpError(404, '页面不存在。');
  }
  if (!fileStats.isFile()) throw new HttpError(404, '页面不存在。');
  const extension = path.extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': ['.html', '.js', '.css'].includes(extension) ? 'no-cache' : 'public, max-age=300'
  });
  method === 'HEAD' ? res.end() : res.end(body);
}

function validateRecommendationInput(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, '请求内容不完整。');
  if (body.mode !== 'mbti' && body.mode !== 'question') throw new HttpError(400, 'mode 只能是 mbti 或 question。');

  const budget = body.budget === null || body.budget === undefined || body.budget === '' ? null : Number(body.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000)) {
    throw new HttpError(400, '预算格式不正确。');
  }
  const avoidDestinations = Array.isArray(body.avoidDestinations)
    ? body.avoidDestinations.filter((item) => typeof item === 'string').map((item) => cleanString(item, 40)).filter(Boolean).slice(0, 8)
    : [];

  if (body.mode === 'mbti') {
    const mbti = cleanString(body.mbti, 4).toUpperCase();
    if (!/^(?:I|E)(?:S|N)(?:T|F)(?:J|P)$/.test(mbti)) throw new HttpError(400, 'MBTI 需要是四位类型，例如 INTJ。');
    return { mode: 'mbti', mbti, budget, avoidDestinations };
  }

  const question = cleanString(body.question, 300);
  const answer = cleanString(body.answer, 300);
  const answerHint = cleanString(body.answerHint, 300);
  if (!question || !answer) throw new HttpError(400, '问题和答案都不能为空。');
  return { mode: 'question', question, answer, answerHint, budget, avoidDestinations };
}

const SERIOUS_INTERESTS = new Set(['古建', '山野', '海风', '老城', '美食', '艺术']);

function validateSeriousInput(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, '请求内容不完整。');

  const origin = cleanString(body.origin, 40).replace(/\s+/g, ' ');
  if (!origin) throw new HttpError(400, '出发地不能为空。');

  const destination = cleanString(body.destination, 60).replace(/\s+/g, ' ');
  const startDate = cleanString(body.startDate, 10);
  if (!isISODate(startDate)) throw new HttpError(400, '出发日期格式不正确。');

  const today = todayInShanghai();
  const latestStart = addDaysISO(today, 365);
  if (startDate < today) throw new HttpError(400, '出发日期不能早于今天。');
  if (startDate > latestStart) throw new HttpError(400, '目前只支持一年内的出发日期。');

  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 10) throw new HttpError(400, '旅行天数需要在 1–10 天之间。');

  const budget = body.budget === null || body.budget === undefined || body.budget === '' ? null : Number(body.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000)) {
    throw new HttpError(400, '预算格式不正确。');
  }

  const interests = Array.isArray(body.interests)
    ? [...new Set(body.interests.filter((item) => typeof item === 'string' && SERIOUS_INTERESTS.has(item)))].slice(0, 2)
    : [];

  return {
    origin,
    destination,
    startDate,
    endDate: addDaysISO(startDate, days - 1),
    days,
    budget,
    interests,
    year: Number(startDate.slice(0, 4)),
    month: Number(startDate.slice(5, 7))
  };
}

function validateDestinationPhotoInput(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, '请求内容不完整。');
  const name = cleanString(body.name, 40).replace(/\s+/g, ' ').trim();
  const region = cleanString(body.region, 80).replace(/\s+/g, ' ').trim();
  const english = cleanString(body.english, 60).replace(/\s+/g, ' ').trim();
  if (!name) throw new HttpError(400, '目的地名称不能为空。');
  return { name, region, english };
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addDaysISO(value, amount) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function buildDateRange(startDate, days) {
  const endDate = addDaysISO(startDate, days - 1);
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [, endMonth, endDay] = endDate.split('-').map(Number);
  return {
    start: startDate,
    end: endDate,
    label: `${startYear} 年 ${startMonth} 月 ${startDay} 日 — ${endMonth} 月 ${endDay} 日`,
    short: `${String(startMonth).padStart(2, '0')}.${String(startDay).padStart(2, '0')} — ${String(endMonth).padStart(2, '0')}.${String(endDay).padStart(2, '0')}`
  };
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, '请求来源不正确。');
  }
  if (host !== req.headers.host) throw new HttpError(403, '只接受来自本地页面的请求。');
}

async function generateQuestion() {
  if (!API_KEY) throw new HttpError(503, missingKeyMessage());
  const nonce = crypto.randomUUID();
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `随机种子：${nonce}
临时题型：${randomItem(QUESTION_TOPICS)}
题目形式：${randomItem(QUESTION_FORMATS)}
临时语气：${randomItem(QUESTION_TONES)}

请设计一道奇怪但好回答的生活观察题。题目不必与旅行有关，可以问颜色、食物、声音、气味、日常习惯、物品选择、周末安排或荒诞假设；如果与旅行有关，也只把它当作众多生活题中的一种，不要每题都往机场和行李箱上靠。它不是心理测验，也不要暗示自己会推测 MBTI；它只是给接下来的目的地盲选制造一个不可靠但有趣的依据。

要求：
- 题目必须让四个选项都能自然回答，不能直接问“你想去哪里”。
- 题目 18-75 个汉字；四个选项的 text 每个 6-28 个汉字，hint 每个 10-42 个汉字。
- 选项要有具体画面、轻微反差，不能全是同义句，不能出现 A/B/C/D 标签。
- 回答要能透露一种具体偏好、感官或行为，方便值班室把一个看似无关的回答一本正经地接到真实目的地上。
- kicker 为 8-20 个汉字，像一本过期旅行手册的小标题。
- 只返回以下形状的 JSON：
{"kicker":"……","question":"……","options":[{"text":"……","hint":"……"},{"text":"……","hint":"……"},{"text":"……","hint":"……"},{"text":"……","hint":"……"}]}`
    }
  ];
  return normalizeQuestion(await requestModelJson(messages, 900));
}

async function generateRecommendation(input) {
  if (!API_KEY) throw new HttpError(503, missingKeyMessage());
  const nonce = crypto.randomUUID();
  const budgetText = input.budget === null
    ? '用户没有设置预算。请选择一个“从中国主要城市出发、人均大致合理”的目的地，并在报告里仍给出诚实的人民币估算。'
    : `用户人均预算约 ¥${Math.round(input.budget).toLocaleString('zh-CN')}。这是软约束：优先在预算上下约 10% 内选择；如果预算明显不够，必须直说，并给出一个真实的降级方案，不要假装能轻松完成。`;
  const avoidText = input.avoidDestinations.length
    ? `本轮请避开这些最近已经出现过的目的地：${input.avoidDestinations.join('、')}。`
    : '本轮没有历史目的地需要避开。';
  const triggerText = input.mode === 'mbti'
    ? `用户直接提供了 MBTI：${input.mbti}。请把它当作一份“过于自信的旅行侧写”的输入，不要声称这是心理诊断。`
    : `编辑部刚刚问了这道题：${input.question}\n用户选择了：${input.answer}${input.answerHint ? `（补充：${input.answerHint}）` : ''}\n这是一道生活题，不必与旅行有关。不要把这道题包装成 MBTI 测试，也不要推断一个四位人格类型；请抓住回答里的颜色、感官、习惯、节奏或荒诞逻辑，一本正经地论证它为什么指向某个真实、具体、可抵达的目的地。`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `随机种子：${nonce}
隐藏观察镜头：${randomItem(HIDDEN_LENSES)}
反俗套约束：${randomItem(ANTI_CLICHES)}
${triggerText}
${budgetText}
${avoidText}

请选择一个真实存在的城市、岛屿或地区，写一份一本正经地胡说八道的旅行判词。

目的地选择：
- 不要选最容易被该 MBTI 或该答案联想到的地方；要有点意外，但交通、住宿和吃饭都能真实执行。
- 先在心里比较 5 个候选，再选最有解释张力且与预算最相容的一个，只输出最终选择。
- 必须考虑 3-7 天的旅行尺度，不要推荐一个只能靠直升机抵达的抽象秘境。

报告要求：
- 4 段 reasoning，每段 170-320 个汉字；四段合起来要有完整的递进：先下荒谬结论，再拿 MBTI/回答做“证据”，然后把荒诞解释落到真实地理与日常体验，最后处理预算/反网红路线。
- 语气必须一本正经，断定式，冷幽默；可以过度解释，但不能空泛。每段至少出现一个具体的街区、食物、气候、地形、交通方式或真实旅行场景。
- 目的地、地理和预算信息要真实可信；价格用区间和“约/参考”表述，不假装掌握实时数据。
- 3 条 evidence：每条由 label、title、text 组成，text 60-130 个汉字，要像三条被强行升格为决定性证据的旅行观察。
- 2 条 notes：一条写这趟旅行的副作用，一条写“别把这张判词当命运”的冷面提醒。
- 3 条 playbook：title 4-14 个汉字，text 35-90 个汉字，必须是抵达后真的能做的事。
- arrival.route 写如何抵达的通用路线，firstMove 写落地后的第一个动作，bestWindow 写相对合适的季节/时段，days 写建议天数。
- budget.verdict 要正面回答预算是否够花；budget.cheaperMove 给一个具体省钱动作。没有预算时也要诚实解释“不设限”不等于“随便花”。
- palette 是给网页画一张抽象目的地插画用的五个十六进制颜色：sky、sun、land、ink、accent。

只返回以下形状的 JSON：
{
  "destination": {
    "name": "……",
    "english": "……",
    "region": "……",
    "coordinates": "……",
    "tagline": "……",
    "matchPercent": 92
  },
  "persona": "……",
  "tags": ["……", "……", "……", "……"],
  "reasoning": ["……", "……", "……", "……"],
  "evidence": [
    {"label": "证据 01 / ……", "title": "……", "text": "……"},
    {"label": "证据 02 / ……", "title": "……", "text": "……"},
    {"label": "证据 03 / ……", "title": "……", "text": "……"}
  ],
  "notes": ["……", "……"],
  "postscript": "……",
  "arrival": {"route": "……", "firstMove": "……", "bestWindow": "……", "days": "……"},
  "playbook": [
    {"title": "……", "text": "……"},
    {"title": "……", "text": "……"},
    {"title": "……", "text": "……"}
  ],
  "budget": {"estimate": 6500, "range": "¥5,800–¥7,400", "verdict": "……", "cheaperMove": "……"},
  "palette": {"sky": "#c4d7d1", "sun": "#e7b956", "land": "#889d78", "ink": "#18312c", "accent": "#e85f39"}
}`
    }
  ];
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptMessages = attempt === 0
      ? messages
      : [
          ...messages,
          {
            role: 'user',
            content: `上一份输出没有通过完整性检查：${lastError?.message || '字段不足'}。请重新生成一份完整报告，不要压缩篇幅：reasoning 必须正好 4 段，每段 170-320 个汉字；evidence 必须 3 条；playbook 必须 3 条。其余字段也全部补齐。`
          }
        ];
    try {
      const recommendation = normalizeRecommendation(await requestModelJson(attemptMessages, 7200), input);
      recommendation.destination.photo = await findDestinationImage(recommendation.destination);
      return recommendation;
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !(error instanceof HttpError) || error.status !== 502) throw error;
      console.warn('[casual-retry]', error.message);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw lastError;
}

async function findDestinationImage(destination) {
  if (!API_KEY) return null;

  const queries = buildDestinationImageQueries(destination);
  if (!queries.length) return null;

  try {
    const searchResults = await Promise.allSettled(
      queries.map((query) => searchDestinationImages(query, destination.name))
    );
    const failures = searchResults.filter((result) => result.status === 'rejected');
    const uniqueCandidates = new Map();

    for (const result of searchResults) {
      if (result.status !== 'fulfilled') continue;
      for (const candidate of result.value) {
        const existing = uniqueCandidates.get(candidate.photo.src);
        if (!existing || candidate.score > existing.score) uniqueCandidates.set(candidate.photo.src, candidate);
      }
    }

    const ranked = [...uniqueCandidates.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.photo.width * b.photo.height - a.photo.width * a.photo.height;
    });

    if (!ranked.length) {
      if (failures.length === queries.length) {
        console.warn('[destination-image] search unavailable:', failures[0].reason?.message || 'unknown error');
      }
      return null;
    }

    const bestScore = ranked[0].score;
    const shortlist = ranked.filter((candidate) => candidate.score >= bestScore - 4).slice(0, 3);
    return randomItem(shortlist).photo;
  } catch (error) {
    console.warn('[destination-image] lookup failed:', error.message || 'unknown error');
    return null;
  }
}

function buildDestinationImageQueries(destination) {
  const name = cleanString(destination.name, 40).replace(/\s+/g, ' ').trim();
  const region = cleanString(destination.region, 80).replace(/\s*[·•/]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const english = cleanString(destination.english || destination.en, 60).replace(/\s+/g, ' ').trim();
  if (!name) return [];

  return [...new Set([
    `${name} 风景 实拍`,
    region ? `${region} ${name} 风景` : '',
    english ? `${english} landscape` : ''
  ].filter(Boolean))].slice(0, 3);
}

async function searchDestinationImages(query, destinationName) {
  const response = await fetch(IMAGE_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      Query: query,
      SearchType: 'image',
      Count: 8,
      Filter: {
        ImageShapes: ['横长方形'],
        ImageWidthMin: 1000
      },
      QueryControl: { QueryRewrite: false }
    }),
    signal: AbortSignal.timeout(IMAGE_SEARCH_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`图片搜索接口返回 ${response.status}`);
  const payload = await response.json().catch(() => null);
  const items = payload?.Result?.ImageResults;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => normalizeImageCandidate(item, destinationName))
    .filter(Boolean);
}

function normalizeImageCandidate(item, destinationName) {
  if (!item || typeof item !== 'object' || !item.Image || typeof item.Image !== 'object') return null;
  const image = item.Image;
  const imageUrl = typeof image.Url === 'string' ? image.Url.trim() : '';
  if (!parseTrustedImageUrl(imageUrl)) return null;

  const width = Number(image.Width);
  const height = Number(image.Height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 900 || height < 450) return null;
  const ratio = width / height;
  if (ratio < 1.15 || ratio > 2.5) return null;

  const watermark = String(image.Watermark ?? '');
  if (watermark === '1') return null;
  const style = String(image.Features?.StyleType || '');
  if (style && !/实拍/.test(style)) return null;
  const blur = String(image.BlurDes || '');
  if (/模糊|低清/.test(blur)) return null;

  const category = String(image.Category || '');
  if (/地图|导览图|人物|商品|广告|漫画|插画|截图|表情/i.test(category)) return null;
  const contentText = [
    item.Title,
    item.Snippet,
    image.Features?.Description,
    image.Features?.EntityType
  ].filter(Boolean).join(' ');
  if (/(地图|导览图|线路图|路线图|截图|海报|广告|二维码|表情包|漫画|插画|logo|标志|自拍|人物写真)/i.test(contentText)) {
    return null;
  }

  const title = imageCaption(item.Title || image.Features?.Description, 120) || `${destinationName} 实景`;
  const description = imageCaption(image.Features?.Description || item.Snippet, 200);
  const normalizedName = cleanString(destinationName, 40).toLocaleLowerCase();
  let score = 0;
  if (watermark === '0') score += 8;
  if (String(image.Shape || '') === '横长方形') score += 3;
  if (category === '风景') score += 6;
  else if (category === '文化') score += 2;
  if (blur === '清晰') score += 4;
  else if (/清晰/.test(blur)) score += 2;
  if (/实拍/.test(style)) score += 4;
  if (width >= 1600) score += 3;
  else if (width >= 1200) score += 2;
  if (height >= 700) score += 1;
  if (normalizedName && contentText.toLocaleLowerCase().includes(normalizedName)) score += 6;

  const sourceUrl = secureExternalUrl(item.Url);
  return {
    score,
    photo: {
      src: `/api/destination-image?url=${encodeURIComponent(imageUrl)}`,
      sourceUrl,
      source: imageCaption(item.SiteName, 40) || '网页图源',
      title,
      description,
      width: Math.round(width),
      height: Math.round(height)
    }
  };
}

function imageCaption(value, maxLength) {
  return cleanString(value, maxLength).split(/\s*#{2,}/)[0].trim();
}

function secureExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function parseTrustedImageUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'byteimg.com' && !host.endsWith('.byteimg.com')) return null;
    return url;
  } catch {
    return null;
  }
}

async function serveDestinationImage(rawUrl, method, res) {
  const imageUrl = parseTrustedImageUrl(rawUrl);
  if (!imageUrl) throw new HttpError(400, '图片地址不受支持。');

  const cacheKey = imageUrl.toString();
  let cached = imageProxyCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt > IMAGE_PROXY_TTL_MS) {
    imageProxyCache.delete(cacheKey);
    cached = null;
  }

  if (!cached) {
    let pending = imageProxyInFlight.get(cacheKey);
    if (!pending) {
      pending = loadProxiedImage(cacheKey).finally(() => imageProxyInFlight.delete(cacheKey));
      imageProxyInFlight.set(cacheKey, pending);
    }
    cached = await pending;
  }

  res.writeHead(200, {
    'Content-Type': cached.contentType,
    'Content-Length': cached.body.length,
    'Cache-Control': 'public, max-age=86400, immutable',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  method === 'HEAD' ? res.end() : res.end(cached.body);
}

async function loadProxiedImage(imageUrl) {
  const signal = AbortSignal.timeout(IMAGE_PROXY_TIMEOUT_MS);
  try {
    const response = await fetchTrustedImage(imageUrl, signal);
    if (!response.ok) throw new HttpError(502, '图片源暂时无法访问。');

    const rawContentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const contentType = rawContentType === 'image/jpg' ? 'image/jpeg' : rawContentType;
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) throw new HttpError(502, '图片源返回了不支持的文件格式。');

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > IMAGE_PROXY_MAX_BYTES) {
      throw new HttpError(502, '图片文件过大。');
    }

    const body = await readImageBody(response);
    const record = { body, contentType, storedAt: Date.now() };
    imageProxyCache.set(imageUrl, record);
    while (imageProxyCache.size > IMAGE_PROXY_MAX_ITEMS) {
      imageProxyCache.delete(imageProxyCache.keys().next().value);
    }
    return record;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw new HttpError(504, '图片加载超时。');
    throw new HttpError(502, '图片加载失败。');
  }
}

async function fetchTrustedImage(imageUrl, signal) {
  let currentUrl = imageUrl;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const response = await fetch(currentUrl, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9' },
      redirect: 'manual',
      signal
    });
    if (response.status < 300 || response.status > 399) return response;

    const location = response.headers.get('location');
    if (!location) throw new HttpError(502, '图片源返回了无效跳转。');
    const nextUrl = parseTrustedImageUrl(new URL(location, currentUrl).toString());
    if (!nextUrl) throw new HttpError(502, '图片源跳转到了不受信任的地址。');
    currentUrl = nextUrl.toString();
  }
  throw new HttpError(502, '图片源跳转次数过多。');
}

async function readImageBody(response) {
  if (!response.body) throw new HttpError(502, '图片源没有返回文件。');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > IMAGE_PROXY_MAX_BYTES) throw new HttpError(502, '图片文件过大。');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, size);
}

async function generateSeriousPlan(input) {
  if (!API_KEY) throw new HttpError(503, missingKeyMessage());

  const budgetText = input.budget === null
    ? '用户没有设置预算。按“正常舒适度、非奢华也不穷游”的标准做人民币估算，并明确哪些支出会浮动。'
    : `用户的人均总预算约 ¥${Math.round(input.budget).toLocaleString('zh-CN')}。方案必须尽量落在预算内；如果日期或目的地导致明显超支，必须在 notForYou、saveTips 和 research.watchouts 里说清楚，并给出可行的降级方案。`;
  const destinationText = input.destination
    ? `用户指定目的地：${input.destination}。不要擅自改成别处；围绕它在给定日期和预算下完成规划。`
    : '用户没有指定目的地。请根据出发地、日期、天数、预算和兴趣，在真实可抵达的地方中自主选择 1 个目的地，再完成整份规划。';
  const interestsText = input.interests.length ? input.interests.join('、') : '没有特别偏好，按季节和可执行性判断';
  const compactTarget = input.days <= 3 ? '4500–6500' : input.days <= 6 ? '6500–8500' : '8500–11000';

  const prompt = `当前日期：${todayInShanghai()}（Asia/Shanghai）
出发地：${input.origin}
${destinationText}
旅行日期：${input.startDate} 至 ${input.endDate}，共 ${input.days} 天 ${input.days - 1} 晚
兴趣偏好：${interestsText}
${budgetText}

在输出前，你必须真实调用 web_search，做 3–4 次合并检索；不要把每个景点或每个小问题拆成单独搜索，能用一条查询覆盖的内容就合并：
1. 第一次查抵达交通（铁路/航班路径、耗时、价格区间）与旅行期间天气、日出日落；
2. 第二次查核心景点的官方开放日、闭馆、实名预约、限流、维修或临时关闭；
3. 第三次查住宿片区、当地交通、门票、节假日、大型活动或施工，以及错峰和替代入口；
4. 只有关键信息仍空缺时才补第四次。若天气预报尚未覆盖，改用气候资料并说明。

行程编排要求：
- days 数组必须正好 ${input.days} 项。每天要有明确地理顺序、转场方式和可完成的时间余量；morning / afternoon / evening 内尽量写出时间窗。
- 第一天要给抵达、放行李和吃饭留出时间；最后一天要给返程和去机场/车站留足余量。
- 不要为了塞景点让用户一天跨两个远郊；需要包车或长途转场时直接写明。
- 核心体验保留，但用错峰、换入口或替代点降低排队；至少给一项雨天/体力不足备案。
- 所有价格按单人、人民币写，交通Range是往返大交通；cost 中 stay 是每晚、其余是每天。
- 住宿建议写到具体片区或交通节点，不要只写“市中心”。
- research.reservations 写真正需要提前订的项目和时机；research.watchouts 写必须在出发前复核的风险。
- 不能编造航班号、车次、实时票价或营业时间。可以给查询方向，但必须标明以官方页面为准。
- 内容要克制、专业、能落地，不要写成营销文案。整份 JSON 尽量控制在约 ${compactTarget} 个汉字；同一信息不要在不同字段重复，优先保留会影响抵达、预约、路线和预算的内容。`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 210_000);
  try {
    const post = async (requestBody) => {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await fetch(`${BASE_URL}/responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          if (result.status >= 500 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 900));
            continue;
          }
          return result;
        } catch (error) {
          lastError = error;
          if (error.name === 'AbortError' || attempt === 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      throw lastError;
    };

    const fallbackPrompt = `${prompt}\n\n服务端暂时不能强制 JSON Schema，请仍然只返回一个合法 JSON 对象，字段必须完整。`;
    const maxOutputTokens = Math.min(24_000, 8_000 + input.days * 1_500);
    const buildBody = (useJsonSchema = seriousCapabilities.jsonSchema) => {
      const body = {
        model: MODEL,
        instructions: SERIOUS_SYSTEM_PROMPT,
        input: useJsonSchema ? prompt : fallbackPrompt,
        tools: [{ type: 'web_search' }],
        max_output_tokens: maxOutputTokens
      };
      if (useJsonSchema) {
        body.text = {
          format: {
            type: 'json_schema',
            name: 'off_course_serious_plan',
            strict: true,
            schema: SERIOUS_PLAN_SCHEMA
          }
        };
      }
      if (seriousCapabilities.thinkingDisabled) body.thinking = { type: 'disabled' };
      return body;
    };

    let response = await post(buildBody());
    let payload = await response.json().catch(() => null);
    let upstreamMessage = JSON.stringify(payload || {});

    if (!response.ok && response.status === 400 && seriousCapabilities.thinkingDisabled && /thinking|reasoning/i.test(upstreamMessage)) {
      seriousCapabilities.thinkingDisabled = false;
      console.warn('[serious-fast] 当前模型不接受关闭思考，已自动改用兼容模式。');
      response = await post(buildBody());
      payload = await response.json().catch(() => null);
      upstreamMessage = JSON.stringify(payload || {});
    }

    if (!response.ok && response.status === 400 && seriousCapabilities.jsonSchema && /json_schema|text\.format|response_format|unsupported/i.test(upstreamMessage)) {
      seriousCapabilities.jsonSchema = false;
      response = await post(buildBody(false));
      payload = await response.json().catch(() => null);
    }

    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `上游接口返回 ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const rawText = extractResponseText(payload);
    if (!rawText) throw new HttpError(502, 'AI 没有返回可读的行程内容。');

    if (process.env.DEBUG_AI === '1') {
      console.error('[serious]', JSON.stringify({
        status: payload?.status,
        incomplete: payload?.incomplete_details || null,
        outputTypes: (payload?.output || []).map((item) => item?.type),
        textLength: rawText.length,
        textTail: rawText.slice(-240)
      }));
    }
    if (payload?.status === 'incomplete') {
      const reason = payload?.incomplete_details?.reason || '输出长度不足';
      throw new HttpError(502, `AI 的行程在完成前被截断了（${reason}）。请重试，或减少旅行天数。`);
    }

    const research = extractResponseResearch(payload);
    if (!research.queries.length) {
      throw new HttpError(502, 'AI 这次没有实际完成联网检索，为避免给出过时攻略，已拒绝这份结果。请重试。');
    }

    let raw;
    let repairedFromParseError = false;
    try {
      raw = parseModelJson(rawText);
    } catch (parseError) {
      if (process.env.DEBUG_AI === '1') {
        const diagnostic = {
          parseError: parseError.message,
          status: payload?.status,
          incomplete: payload?.incomplete_details || null,
          outputText: payload?.output_text || null,
          output: payload?.output || [],
          extractedText: rawText
        };
        await writeFile(path.join(ROOT, 'work', 'last-serious-response.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
        console.error('[serious-parse]', JSON.stringify({
          parseError: parseError.message,
          textLength: rawText.length,
          textStart: rawText.slice(0, 600),
          textTail: rawText.slice(-600)
        }));
      }
      try {
        raw = await repairSeriousPlanJson(rawText, input, parseError.message);
        repairedFromParseError = true;
      } catch {
        throw new HttpError(502, '这份行程在自动整理后仍不完整，请重新生成。');
      }
    }
    try {
      const plan = normalizeSeriousPlan(raw, input, research);
      return plan;
    } catch (normalizeError) {
      if (process.env.DEBUG_AI === '1') {
        const diagnostic = {
          normalizeError: normalizeError.message,
          status: payload?.status,
          incomplete: payload?.incomplete_details || null,
          textLength: rawText.length,
          raw,
          extractedText: rawText
        };
        await writeFile(path.join(ROOT, 'work', 'last-serious-normalize.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
        console.error('[serious-normalize]', JSON.stringify({
          error: normalizeError.message,
          textLength: rawText.length,
          rootKeys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
          dayCount: Array.isArray(raw?.days) ? raw.days.length : null,
          dayShape: Array.isArray(raw?.days) ? raw.days.slice(0, 2).map((day) => day && typeof day === 'object' ? Object.keys(day) : typeof day) : null
        }));
      }
      if (!repairedFromParseError) {
        try {
          const repaired = await repairSeriousPlanJson(rawText, input, normalizeError.message);
          const plan = normalizeSeriousPlan(repaired, input, research);
          return plan;
        } catch (repairError) {
          if (process.env.DEBUG_AI === '1') {
            console.error('[serious-repair]', JSON.stringify({
              error: repairError.message,
              originalError: normalizeError.message
            }));
          }
        }
      }
      throw normalizeError;
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, '联网检索和排程超过了 210 秒，请稍后重试。');
    throw mapUpstreamError(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function repairSeriousPlanJson(rawText, input, reason) {
  const messages = [
    {
      role: 'system',
      content: `你是「偏航 OFF COURSE」旅行编辑部的 JSON 整理员。你的任务只是把一份生成到一半或括号错位的行程整理成合法 JSON，不是重写攻略。

必须遵守：
1. 保留原文已经写出的目的地、日期、价格、交通方式、天气、景点与建议，不要改变事实，不要新增原文没有的具体车次、票价、营业时间或预约承诺。
2. 如果原文把行程放在错误层级，把它移动到顶层 days；days 必须恰好 ${input.days} 项。
3. 只输出一个合法 JSON 对象，不要 Markdown、代码围栏、解释或尾注。
4. 输出必须通过以下 JSON Schema 的基本字段约束：
${JSON.stringify(SERIOUS_PLAN_SCHEMA)}`
    },
    {
      role: 'user',
      content: `校验问题：${reason}

待整理原文：
${rawText.slice(0, 36_000)}`
    }
  ];
  const repairedText = await callCompletion(messages, 24_000);
  return parseModelJson(repairedText);
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  let lastMessageText = '';
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    const parts = [];
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        parts.push(content.text.trim());
      } else if (typeof content?.text === 'string' && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
    if (parts.length) lastMessageText = parts.join('\n').trim();
  }
  return lastMessageText;
}

function extractResponseResearch(payload) {
  const queries = [];
  const sources = [];
  const seenQueries = new Set();
  const seenSources = new Set();

  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type === 'web_search_call') {
      const candidates = [item.action?.query, ...(Array.isArray(item.action?.queries) ? item.action.queries : [])];
      for (const candidate of candidates) {
        const query = cleanString(candidate, 180).replace(/\s+/g, ' ');
        if (!query || seenQueries.has(query)) continue;
        seenQueries.add(query);
        queries.push(query);
      }
    }

    if (item?.type !== 'message') continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type !== 'url_citation') continue;
        const url = safeHttpUrl(annotation.url);
        if (!url || seenSources.has(url)) continue;
        seenSources.add(url);
        const host = new URL(url).hostname.replace(/^www\./, '');
        sources.push({
          title: cleanString(annotation.title, 180) || host,
          url,
          site: cleanString(annotation.site_name, 90) || host,
          publishedAt: cleanString(annotation.publish_time, 40)
        });
      }
    }
  }

  return {
    queries: queries.slice(0, 8),
    sources: sources.slice(0, 10),
    checkedAt: new Date().toISOString()
  };
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeSeriousPlan(raw, input, researchMeta) {
  if (!raw || typeof raw !== 'object' || !raw.destination) throw new HttpError(502, 'AI 返回的目的地结构不正确。');
  const d = raw.destination;

  const name = cleanString(d.name, 40);
  const region = cleanString(d.region, 60);
  const english = cleanString(d.english, 60).toUpperCase();
  if (!name || !region || !english) throw new HttpError(502, 'AI 没有把目的地信息写完整，请重试。');

  const daysPlan = normalizeObjectList(raw.days, 12).map((day) => ({
    title: cleanString(day.title, 36),
    route: cleanString(day.route, 100),
    morning: cleanString(day.morning, 300),
    afternoon: cleanString(day.afternoon, 300),
    evening: cleanString(day.evening, 240),
    tip: cleanString(day.tip, 220)
  })).filter((day) => day.title && day.route && day.morning && day.afternoon);
  if (daysPlan.length !== input.days) {
    throw new HttpError(502, `AI 应给出 ${input.days} 天的行程，但实际返回了 ${daysPlan.length} 天。请重试。`);
  }

  const experiences = normalizeObjectList(raw.experiences, 5).map((item) => ({
    title: cleanString(item.title, 32),
    text: cleanString(item.text, 240)
  })).filter((item) => item.title && item.text).slice(0, 4);
  const avoid = normalizeObjectList(raw.avoid, 5).map((item) => ({
    from: cleanString(item.from, 120),
    to: cleanString(item.to, 160)
  })).filter((item) => item.from && item.to).slice(0, 4);
  const locals = normalizeStringList(raw.locals, 4, 220);
  if (experiences.length < 3 || avoid.length < 3 || locals.length < 3) {
    throw new HttpError(502, 'AI 的体验、避坑或本地提醒不够完整，请重试。');
  }

  const transportRangeRaw = Array.isArray(d.transportRange) ? d.transportRange.map(Number).filter(Number.isFinite) : [];
  let transportMin = transportRangeRaw[0];
  let transportMax = transportRangeRaw[1];
  if (!Number.isFinite(transportMin) || !Number.isFinite(transportMax)) {
    transportMin = 500;
    transportMax = 1200;
  }
  if (transportMin > transportMax) [transportMin, transportMax] = [transportMax, transportMin];

  const cost = {
    stay: clampNumber(Math.round(Number(d.cost?.stay) || 0), 0, 50_000),
    food: clampNumber(Math.round(Number(d.cost?.food) || 0), 0, 20_000),
    local: clampNumber(Math.round(Number(d.cost?.local) || 0), 0, 20_000),
    tickets: clampNumber(Math.round(Number(d.cost?.tickets) || 0), 0, 20_000),
    bufferRate: clampNumber(Number(d.cost?.bufferRate) || 0.1, 0.05, 0.2)
  };
  if (!cost.stay && !cost.food && !cost.local && !cost.tickets) {
    throw new HttpError(502, 'AI 没有给出可用的预算拆分，请重试。');
  }

  const art = d.art || {};
  const allowedArtTypes = new Set(['cave', 'oldtown', 'village', 'terraces', 'desert', 'island', 'coast', 'fjord', 'city']);
  const reservations = normalizeObjectList(raw.research?.reservations, 6).map((item) => ({
    title: cleanString(item.title, 50),
    timing: cleanString(item.timing, 80),
    channel: cleanString(item.channel, 100),
    note: cleanString(item.note, 180)
  })).filter((item) => item.title && item.timing && item.channel).slice(0, 5);
  const watchouts = normalizeStringList(raw.research?.watchouts, 5, 220);
  if (reservations.length < 2 || watchouts.length < 2) {
    throw new HttpError(502, 'AI 没有给出足够的预订清单和风险提醒，请重试。');
  }

  return {
    destination: {
      name,
      en: english,
      region,
      regionShort: cleanString(d.regionShort, 30) || region,
      tagline: cleanString(d.tagline, 100),
      quote: cleanString(d.quote, 100),
      interests: input.interests,
      tags: normalizeStringList(d.tags, 5, 20),
      why: cleanString(d.why, 520),
      secondWhy: cleanString(d.secondWhy, 520),
      extraReason: cleanString(d.extraReason, 180),
      notForYou: normalizeStringList(d.notForYou, 4, 80),
      weather: cleanString(d.weather, 260),
      seasonNote: cleanString(d.seasonNote, 220),
      access: {
        air: cleanString(d.access?.air, 360),
        rail: cleanString(d.access?.rail, 360),
        local: cleanString(d.access?.local, 360)
      },
      transportRange: [Math.round(transportMin), Math.round(transportMax)],
      cost,
      saveTips: normalizeStringList(d.saveTips, 4, 160),
      daysPlan,
      extensionDays: [],
      experiences,
      avoid,
      locals,
      art: {
        type: allowedArtTypes.has(art.type) ? art.type : 'city',
        sky: safeColor(art.sky, '#b8cec8'),
        sun: safeColor(art.sun, '#e7b956'),
        land1: safeColor(art.land1, '#889d78'),
        land2: safeColor(art.land2, '#344d46'),
        ink: safeColor(art.ink, '#18312c'),
        accent: safeColor(art.accent, '#e85f39'),
        badge: cleanString(art.badge, 18) || 'AI 现场核查'
      }
    },
    dates: buildDateRange(input.startDate, input.days),
    match: clampNumber(92 + input.interests.length, 92, 97),
    research: {
      summary: cleanString(raw.research?.summary, 360) || `已用 ${researchMeta.queries.length} 组关键词完成联网检索。`,
      reservations,
      watchouts,
      queries: researchMeta.queries,
      sources: researchMeta.sources,
      checkedAt: researchMeta.checkedAt
    }
  };
}

async function requestModelJson(messages, maxTokens) {
  let rawText;
  try {
    rawText = await callCompletionStable(messages, maxTokens);
  } catch (error) {
    throw mapUpstreamError(error);
  }

  let parsed;
  try {
    parsed = parseModelJson(rawText);
  } catch {
    const repairMessages = [
      ...messages,
      { role: 'assistant', content: rawText.slice(0, 12_000) },
      { role: 'user', content: '上面的回答不是合法 JSON。请严格只返回修正后的 JSON 对象，不要代码围栏、不要解释，字段和内容要求保持不变。' }
    ];
    try {
      rawText = await callCompletionStable(repairMessages, maxTokens);
      parsed = parseModelJson(rawText);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'AI 返回的内容不是合法 JSON，已自动重试一次。可以再点一次重新生成。');
    }
  }
  return parsed;
}

async function callCompletion(messages, maxTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    let response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: 'json_object' },
        max_completion_tokens: maxTokens
      }),
      signal: controller.signal
    });

    let payload = await response.json().catch(() => null);
    if (!response.ok && response.status === 400 && /max_completion_tokens|response_format|unsupported/i.test(JSON.stringify(payload || {}))) {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
        signal: controller.signal
      });
      payload = await response.json().catch(() => null);
    }

    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `上游接口返回 ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const joined = content.map((part) => part?.text || '').join('').trim();
      if (joined) return joined;
    }
    throw new HttpError(502, '值班室没有交出可读的内容。');
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, '远方这次想得太久，请重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callResponsesCompletion(messages, maxTokens) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? '助手上一轮回答' : '用户'}：\n${message.content}`)
    .join('\n\n');

  const send = (withJsonFormat) => {
    const body = {
      model: MODEL,
      instructions,
      input,
      max_output_tokens: maxTokens
    };
    if (withJsonFormat) body.text = { format: { type: 'json_object' } };
    return fetch(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  };

  try {
    let response = await send(true);
    let payload = await response.json().catch(() => null);
    if (!response.ok && response.status === 400 && /text|format|json|unsupported/i.test(JSON.stringify(payload || {}))) {
      response = await send(false);
      payload = await response.json().catch(() => null);
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `上游接口返回 ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const content = extractResponseText(payload);
    if (content) return content;
    throw new HttpError(502, '值班室没有交出可读的内容。');
  } catch (error) {
    if (error.name === 'AbortError') throw new HttpError(504, '远方这次想得太久，请重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callCompletionStable(messages, maxTokens) {
  try {
    return await callResponsesCompletion(messages, maxTokens);
  } catch (error) {
    const mapped = mapUpstreamError(error);
    if (mapped.status !== 502) throw mapped;
    console.warn('[responses-fallback]', mapped.message);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return callCompletion(messages, maxTokens);
  }
}

function mapUpstreamError(error) {
  if (error instanceof HttpError) return error;
  if (error.status === 401) return new HttpError(401, 'API Key 无效或已过期，请检查 .env。');
  if (error.status === 429) return new HttpError(429, 'API 额度或请求频率触顶，请稍后再试或检查账户额度。');
  if (error.status >= 500) return new HttpError(502, 'AI 服务暂时不稳定，请稍后再试。');
  return new HttpError(502, `AI 请求失败：${error.message || '未知错误'}`);
}

function parseModelJson(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON object');

  const balanced = extractBalancedJson(cleaned, start);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {}
  }

  const end = cleaned.lastIndexOf('}');
  if (end > start) {
    const sliced = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch {}
    try {
      return JSON.parse(closeUnbalancedJson(sliced));
    } catch {}
  }

  try {
    return JSON.parse(closeUnbalancedJson(cleaned.slice(start)));
  } catch {}

  try {
    return JSON.parse(repairJsonDelimiters(cleaned.slice(start)));
  } catch {}

  throw new Error('No complete JSON object');
}

function extractBalancedJson(text, start = 0) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
      if (depth < 0) return '';
    }
  }
  return '';
}

function closeUnbalancedJson(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{' || char === '[') {
      stack.push(char);
    } else if (char === '}' || char === ']') {
      const opener = stack.pop();
      if (!opener || (opener === '{' && char !== '}') || (opener === '[' && char !== ']')) {
        throw new Error('JSON brackets are mismatched');
      }
    }
  }
  if (inString) throw new Error('JSON string is not closed');
  if (!stack.length) throw new Error('JSON could not be repaired');
  return text + stack.reverse().map((opener) => opener === '{' ? '}' : ']').join('');
}

function repairJsonDelimiters(text) {
  const stack = [];
  let repaired = '';
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      repaired += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      repaired += char;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char);
      repaired += char;
      continue;
    }
    if (char === '}' || char === ']') {
      const opener = stack.pop();
      if (!opener) continue;
      if ((opener === '{' && char === '}') || (opener === '[' && char === ']')) repaired += char;
      else {
        repaired += opener === '{' ? '}' : ']';
        const nextOpener = stack[stack.length - 1];
        if ((nextOpener === '{' && char === '}') || (nextOpener === '[' && char === ']')) {
          repaired += char;
          stack.pop();
        }
      }
      continue;
    }
    repaired += char;
  }

  if (inString) repaired += '"';
  while (stack.length) repaired += stack.pop() === '{' ? '}' : ']';
  return repaired;
}

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') throw new HttpError(502, '这张问卷没有写完整，请重新抽题。');
  const options = Array.isArray(raw.options) ? raw.options.slice(0, 4) : [];
  if (options.length !== 4) throw new HttpError(502, '这次没有凑够四个选项，请重新出题。');
  const normalized = {
    kicker: cleanString(raw.kicker, 60) || '临时问卷',
    question: cleanString(raw.question, 220),
    options: options.map((option) => ({
      text: cleanString(option?.text, 80),
      hint: cleanString(option?.hint, 140)
    }))
  };
  if (!normalized.question || normalized.options.some((option) => !option.text)) {
    throw new HttpError(502, '题目还差几笔，请重新出题。');
  }
  return normalized;
}

function normalizeRecommendation(raw, input) {
  if (!raw || typeof raw !== 'object' || !raw.destination) throw new HttpError(502, '签筒这次没有倒出目的地，请重试。');
  const reasoning = normalizeStringList(raw.reasoning, 5, 1200);
  if (reasoning.length < 3) throw new HttpError(502, '这次的解释太短，连胡说八道都不够。请重试。');

  const evidence = normalizeObjectList(raw.evidence, 5).map((item, index) => ({
    label: cleanString(item.label, 80) || `证据 0${index + 1}`,
    title: cleanString(item.title, 120),
    text: cleanString(item.text, 650)
  })).filter((item) => item.title && item.text).slice(0, 3);
  if (evidence.length < 2) throw new HttpError(502, '证据没有凑够。再给值班室一次装模作样的机会。');

  const playbook = normalizeObjectList(raw.playbook, 5).map((item) => ({
    title: cleanString(item.title, 80),
    text: cleanString(item.text, 400)
  })).filter((item) => item.title && item.text).slice(0, 3);
  if (playbook.length < 2) throw new HttpError(502, '抵达建议还不够具体，请重试。');

  const destination = raw.destination;
  const matchPercent = Number(destination.matchPercent);
  const estimate = Number(raw.budget?.estimate);
  const palette = raw.palette || {};
  const name = cleanString(destination.name, 40);
  const region = cleanString(destination.region, 80);
  if (!name || !region) throw new HttpError(502, '目的地的信息还缺几笔，请重试。');

  return {
    destination: {
      name,
      english: cleanString(destination.english, 60).toUpperCase(),
      region,
      coordinates: cleanString(destination.coordinates, 50),
      tagline: cleanString(destination.tagline, 220),
      matchPercent: Number.isFinite(matchPercent) ? clampNumber(matchPercent, 86, 99.9) : 94
    },
    persona: cleanString(raw.persona, 220),
    tags: normalizeStringList(raw.tags, 8, 30).slice(0, 5),
    reasoning,
    evidence,
    notes: normalizeStringList(raw.notes, 4, 700),
    postscript: cleanString(raw.postscript, 300),
    arrival: {
      route: cleanString(raw.arrival?.route, 500),
      firstMove: cleanString(raw.arrival?.firstMove, 300),
      bestWindow: cleanString(raw.arrival?.bestWindow, 300),
      days: cleanString(raw.arrival?.days, 40)
    },
    playbook,
    budget: {
      estimate: Number.isFinite(estimate) ? clampNumber(Math.round(estimate), 0, 1_000_000) : null,
      range: cleanString(raw.budget?.range, 100),
      verdict: cleanString(raw.budget?.verdict, 700),
      cheaperMove: cleanString(raw.budget?.cheaperMove, 500)
    },
    palette: {
      sky: safeColor(palette.sky, '#c4d7d1'),
      sun: safeColor(palette.sun, '#e7b956'),
      land: safeColor(palette.land, '#889d78'),
      ink: safeColor(palette.ink, '#18312c'),
      accent: safeColor(palette.accent, '#e85f39')
    },
    input: { mode: input.mode, budget: input.budget }
  };
}

function normalizeStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeObjectList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').slice(0, maxItems);
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength);
}

function safeColor(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function missingKeyMessage() {
  return '还没有配置 API Key。请把 Agent Plan 专属 Key 或 OpenAI Key 写进项目根目录的 .env，然后重启 node server.mjs。';
}
