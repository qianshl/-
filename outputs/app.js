'use strict';

/* =========================================================
   Utilities
   ========================================================= */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const money = (value) => '¥' + Math.round(value).toLocaleString('zh-CN');
const pad2 = (value) => String(value).padStart(2, '0');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sum = (list) => list.reduce((total, value) => total + value, 0);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function seededNumber(seed) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = ((value << 5) - value + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage || '已复制到剪贴板');
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    showToast(successMessage || '已复制到剪贴板');
  }
}

const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'
];

function formatRichText(value) {
  return escapeHTML(value)
    .replace(/\*\*([^*]+)\*\*/g, '<mark>$1</mark>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function destinationPhotoMarkup(photo, destinationName, variant) {
  if (!photo?.src) return '';
  const alt = escapeHTML(`${destinationName || '目的地'}风景照片`);
  const visibleName = escapeHTML(destinationName || '未命名远方');

  if (variant === 'casual') {
    return `
      <figure class="casual-photo-strip" data-photo-shell>
        <img class="destination-photo" src="${escapeHTML(photo.src)}" alt="${alt}" loading="eager" decoding="async">
        <figcaption class="casual-photo-caption">
          <strong>${visibleName}</strong>
        </figcaption>
      </figure>`;
  }

  return `
    <div class="destination-photo-layer">
      <img class="destination-photo" src="${escapeHTML(photo.src)}" alt="${alt}" loading="eager" decoding="async">
      <div class="destination-photo-title"><strong>${visibleName}</strong></div>
    </div>
  `;
}

function bindDestinationPhotos(root) {
  if (!root) return;
  $$('[data-photo-shell]', root).forEach((shell) => {
    const image = $('img.destination-photo', shell);
    if (!image || image.dataset.photoBound === 'true') return;
    image.dataset.photoBound = 'true';
    const settle = () => {
      const loaded = image.complete && image.naturalWidth > 0;
      shell.classList.toggle('is-photo-loaded', loaded);
      shell.classList.toggle('has-photo-failed', !loaded);
    };
    image.addEventListener('load', settle, { once: true });
    image.addEventListener('error', settle, { once: true });
    if (image.complete) settle();
  });
}

function normalizeMBTI(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function parseCasualBudget() {
  const field = $('#casual-budget');
  const raw = field?.value.trim() || '';
  if (!raw) return { value: null, error: '' };
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { value: null, error: '预算要么留空，要么填一个大于 0 的数字。' };
  }
  if (numeric > 1_000_000) {
    return { value: null, error: '预算上限是 ¥1,000,000，宇宙也没那么随便。' };
  }
  return { value: Math.round(numeric), error: '' };
}

async function requestAPI(path, options = {}) {
  if (location.protocol === 'file:') {
    throw new Error('随意版需要通过本地服务打开。请在项目目录运行 node server.mjs，然后访问 http://127.0.0.1:8787/。');
  }
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `请求失败（${response.status}）。`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function requestAPIWithRetry(path, options = {}, { attempts = 2, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestAPI(path, options);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      const retryable = !Number.isFinite(status) || [502, 503, 504].includes(status);
      if (!retryable || attempt === attempts - 1) throw error;
      onRetry?.(attempt + 1, error);
      await new Promise((resolve) => setTimeout(resolve, 1400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function sanitizeCasualValue(value) {
  if (typeof value === 'string') {
    if (/^(?:https?:\/\/|\/(?!\/))/.test(value)) return value;
    return value
      .replace(/\bAI\s*生成/gi, '值班室写定')
      .replace(/\bAI\b/gi, '值班室')
      .replace(/人工智能|大语言模型|大模型/g, '值班室')
      .replace(/模型/g, '值班室')
      .replace(/算法/g, '罗盘')
      .replace(/提示词/g, '暗号')
      .replace(/自动生成|智能生成/g, '当场写定')
      .replace(/OpenAI|Agent Plan/gi, '本机服务')
      .replace(/API\s*Key/gi, '服务密钥')
      .replace(/\bAPI\b/gi, '服务');
  }
  if (Array.isArray(value)) return value.map(sanitizeCasualValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeCasualValue(item)]));
  }
  return value;
}

async function checkAIService() {
  const note = $('#casual-service-note');
  const label = $('#casual-service-text');
  if (!note || !label) return;
  note.classList.remove('is-good', 'is-bad');
  if (location.protocol === 'file:') {
    note.classList.add('is-bad');
    label.textContent = '接线员不在线：请运行 node server.mjs，再从 http://127.0.0.1:8787/ 打开。';
    return;
  }
  try {
    const payload = await requestAPI('/api/health');
    if (payload.configured) {
      note.classList.add('is-good');
      label.textContent = '远方接线员在岗 · 信号良好 · 本次问询不会留档';
    } else {
      note.classList.add('is-bad');
      label.textContent = '接线员还没拿到钥匙：请在 .env 中配置服务密钥。';
    }
  } catch {
    note.classList.add('is-bad');
    label.textContent = '接线员不在线：请在项目目录运行 node server.mjs。';
  }
}

/* =========================================================
   Serious destination archive
   ========================================================= */
const seriousDestinations = [
  {
    id: 'datong',
    name: '大同',
    en: 'DATONG',
    region: '山西 · 中国',
    regionShort: '山西',
    tagline: '在石窟的阴影里，重新校准时差。',
    quote: '把时间交给石头，把胃口交给一碗面。',
    interests: ['古建', '人文', '美食', '山野'],
    bestMonths: [4, 5, 6, 9, 10, 11],
    preferredDays: [3, 5, 7],
    why: '大同的好，不在“景点密度”，而在一种北方的停顿感。上午还在云冈石窟看一千五百年前的衣褶，下午就能坐在古城墙根下吃一碗滚烫的刀削面；风把天吹得很高，也把人声吹得很远。',
    secondWhy: '它适合把古建当成“现场”而不是“背景板”的人。这里真正值得留恋的，不是在某扇门前排到最佳机位，而是看光从不同角度落进庙宇，然后在傍晚随便拐进一条巷子。',
    notForYou: ['想要密集夜生活与精致咖啡馆巡礼', '拒绝包车、只想全程地铁公交', '对北方干燥和大风比较敏感'],
    weather: '昼夜温差大，白天 8–15°C，入夜常接近 0°C；风比城区更硬，带一件挡风外套和润唇膏。',
    seasonNote: '11 月游客明显退潮，光也干净；但要避开周一闭馆，并把悬空寺约在最早时段。',
    access: {
      air: '从 {origin} 出发，优先比价飞大同云冈机场；直飞不稳定时，经太原或北京中转也常见。',
      rail: '高铁到大同南站最省心，出站打车约 25–35 分钟到古城；具体班次以 12306 为准。',
      local: '云冈可公交或打车；悬空寺、应县木塔分散，建议选一天包车，比逐段打车更可控。'
    },
    transportRange: [750, 1350],
    cost: { stay: 280, food: 145, local: 105, tickets: 115, bufferRate: .08 },
    tags: ['石窟', '辽金古建', '面食', '低密度'],
    saveTips: ['住古城南侧而非华严寺正对面，同档酒店通常便宜一截', '云冈与古城用公共交通，只把包车预算留给悬空寺—应县一线', '把一晚住宿换成大同南站附近，方便返程但会牺牲夜间散步'],
    daysPlan: [
      { title: '先让古城把音量调低', route: '大同南站 → 华严寺 → 善化寺 → 古城墙', morning: '抵达后先放下行李，别急着去云冈。吃一碗刀削面，沿鼓楼东街慢慢走到华严寺。', afternoon: '华严寺看薄伽教藏殿的辽代气息，再去善化寺看更安静的院落；两处之间步行即可。', evening: '古城墙上等一场日落，晚饭去居民区找羊杂或黄糕。', tip: '不要在第一天安排两个远郊大点，大同的风会替你消耗体力。' },
      { title: '石窟不是背景，是现场', route: '云冈石窟 → 晋华宫矿山公园 → 古城', morning: '开园后尽早进云冈，先看第 5、6 窟，再去露天大佛第 20 窟。早场的光和旅行团的人流都更诚实。', afternoon: '有兴趣再去晋华宫矿山公园，下井体验会让“煤都”这层身份变得具体。', evening: '回城吃铜火锅或过油肉，早点休息，第二天要早起。', tip: '讲解比拍照值。选官方讲解或提前做 20 分钟功课，你会多看见很多细节。' },
      { title: '把悬空寺留给清晨', route: '浑源 → 悬空寺 → 永安寺 → 浑源古城', morning: '首波进悬空寺，提前预约。别卡着开门前十分钟到，停车和摆渡都要时间。', afternoon: '去浑源古城看永安寺，再吃一碗浑源凉粉；县城比景区门口更像真实生活。', evening: '回大同或住浑源一晚，给第二天省下折返。', tip: '悬空寺遇大风可能临时关闭，行程里保留一个可互换的下午。' },
      { title: '木塔不需要滤镜', route: '应县木塔 → 净土寺 → 广武长城', morning: '早去应县木塔。它不能登塔，但站在塔下看斗拱和倾斜的屋檐，时间感比任何“打卡照”都重。', afternoon: '净土寺看藻井，午后去广武长城与旧广武村，避开最热门的八达岭式人群。', evening: '找一家小馆吃莜面，回程路上看天色一点点降温。', tip: '广武一带风大且补给少，带水和外套；不要为了日落硬撑到天黑。' },
      { title: '留一天给风和空白', route: '大同土林 → 火山群 → 梁思成纪念馆', morning: '去大同土林或火山群，选一个就够。北方的荒芜需要慢看，不需要塞满。', afternoon: '回城逛梁思成纪念馆或市博物馆，把前几天的古建线索串起来。', evening: '最后去一趟市场，买点黄花菜或醋；旅行结束前，先让胃记住这里。', tip: '这天是机动日。下雨或大风就换成博物馆 + 茶馆，不要跟天气较劲。' }
    ],
    extensionDays: [
      { title: '恒山后山与一个无人的下午', route: '恒山后山 → 当地村子', morning: '如果体力允许，走一段恒山后山；不必冲顶，沿路看山谷比站在石碑旁更像旅行。', afternoon: '在山脚村子吃饭，坐一会儿，把行程表收起来。', evening: '回城，洗衣服，整理照片。', tip: '后山路线与天气关系很大，出发前向本地司机确认路况。' },
      { title: '慢到像一个本地人', route: '早市 → 茶馆 → 古城散步', morning: '去早市吃早饭，看看本地人真正买什么。', afternoon: '找一家茶馆或面馆消磨两小时，不安排景点。', evening: '沿城墙再走一圈，和这座城告别。', tip: '第七天不要塞远郊，给返程交通留足余量。' }
    ],
    experiences: [
      { title: '在云冈看一次光线移动', text: '下午三点后的侧光会把佛像衣褶照出层次。别急着从第一窟拍到最后一窟，找一尊喜欢的，多看十分钟。' },
      { title: '吃一顿不拍照的面', text: '刀削面、羊杂、黄糕都值得。最好吃的那碗往往没有“必吃榜”招牌，只有门口停着本地人的电动车。' },
      { title: '去广武看长城的老去', text: '这里的长城没有被修成景区，残墙和村庄挨在一起。风很大，历史也很具体。' },
      { title: '在辽金木构里安静一会儿', text: '华严寺和善化寺不需要“打卡”。坐在院子里听风，是参观的一部分。' }
    ],
    avoid: [
      { from: '正午去悬空寺排长队', to: '预约首波入场，前一晚住浑源' },
      { from: '在云冈赶场式拍全景', to: '挑 2–3 个窟慢慢看，请一次讲解' },
      { from: '古城主街吃网红铜火锅', to: '往居民区走，找本地人排队的小馆' }
    ],
    locals: ['早市买黄花菜和胡麻油，比景区伴手礼实在。', '大同的博物馆和古建多为周一闭馆，提前确认。', '和司机聊路线时，直接问“哪段最近在修路”，比问“哪里好玩”有用。'],
    art: { type: 'cave', sky: '#b8cec8', sun: '#e85f39', land1: '#9aada0', land2: '#344d46', ink: '#152e2a', accent: '#e6c466', badge: '北魏的风' },
    extraReason: '大同适合把“看古建”变成一次呼吸练习，而不是集章。'
  },
  {
    id: 'quanzhou',
    name: '泉州',
    en: 'QUANZHOU',
    region: '福建 · 中国',
    regionShort: '福建',
    tagline: '神明在街角，生活在隔壁。',
    quote: '半城烟火半城仙，剩下半城在吃面线糊。',
    interests: ['老城', '美食', '人文', '海风', '艺术'],
    bestMonths: [3, 4, 5, 10, 11, 12],
    preferredDays: [3, 5, 7],
    why: '泉州的迷人之处，是宗教、贸易和日常没有隔开。开元寺的香火旁边是菜市场，清净寺拐个弯就是牛肉店，宋元的海上交通史散落在骑楼下。它不要求你肃穆，也不允许你敷衍。',
    secondWhy: '这里特别适合“边走边吃”的人。真正的城市纹理藏在巷子里：一盏路灯下的南音、一碗面线糊的配料、桥上被潮水磨亮的石板。',
    notForYou: ['只想看整齐划一的古城样板街', '对海鲜、牛肉和湿热天气都不感兴趣', '期待大开大合的自然风光'],
    weather: '11 月均温约 18–25°C，适合走路；早晚有海风，带一件薄外套。雨天巷子湿滑，鞋底要稳。',
    seasonNote: '避开国庆和春节的人潮，11 月的泉州刚好适合在骑楼下走一整天；周末西街人流会明显增加。',
    access: {
      air: '从 {origin} 出发可查泉州晋江机场；航班不合适时，飞厦门再乘高铁/城际到泉州也顺。',
      rail: '泉州站、泉州东站均可进城；泉州站离老城更近，打车约 20–30 分钟。',
      local: '老城适合步行 + 共享单车；去洛阳桥、蟳埔和晋江建议打车或公交，别把一天都耗在路上。'
    },
    transportRange: [600, 1050],
    cost: { stay: 270, food: 165, local: 85, tickets: 55, bufferRate: .08 },
    tags: ['世界遗产', '闽南', '小吃', '步行友好'],
    saveTips: ['住丰泽或鲤城边缘，步行进老城，房价通常比西街核心区友好', '小吃正餐化：一顿吃三种小份，比进网红大店更省也更地道', '洛阳桥、开元寺等核心点公交可达，不必全程打车'],
    daysPlan: [
      { title: '从一碗面线糊开始', route: '西街 → 开元寺 → 府文庙', morning: '抵达后去吃一碗面线糊，加醋肉和油条。不要在第一家网红店排队，往巷子里走一段。', afternoon: '开元寺看东西塔、古船馆和榕树，再去府文庙看当地人下棋。', evening: '西街天黑后再走一遍，找南音演出或小茶馆坐坐。', tip: '西街最舒服的时间是清晨和晚上九点后，不是下午三点。' },
      { title: '把古城走成一张网', route: '承天寺 → 清净寺 → 关岳庙 → 涂门街', morning: '承天寺清静，适合早去；随后沿涂门街走到清净寺和关岳庙，宗教建筑彼此很近。', afternoon: '在涂门街吃牛肉羹、石花膏，下午去金鱼巷或旧馆驿一带随便拐。', evening: '去天后宫附近看夜景，再找一家本地人常去的排档。', tip: '别把泉州当成拍照布景。进庙时放低声音，遵守现场提示。' },
      { title: '洛阳桥、海风与一点盐', route: '洛阳桥 → 桥南古街 → 蟳埔', morning: '早去洛阳桥，避开旅行团；看潮水、石将军和桥身的牡蛎壳。', afternoon: '在桥南古街吃饭，下午去蟳埔看渔村日常。簪花可以体验，但别把人家的生活当背景板。', evening: '回城，去南俊路或新华路找一家小店。', tip: '蟳埔最佳时间是上午，下午妆造的人会显著变多。' },
      { title: '山上有一座安静的石像', route: '清源山 → 老君岩 → 草庵', morning: '早上爬清源山，看老君岩；选择轻松路线，不必为“全走完”消耗体力。', afternoon: '去晋江草庵看摩尼教遗址，安静得像另一个时代；回程可在五店市吃晚饭。', evening: '回泉州老城，补一顿没吃到的甜品。', tip: '清源山有多种入口，提前确认打车落点，避免多走冤枉路。' },
      { title: '海边的城市，不止一个方向', route: '晋江梧林 → 祥芝渔港 → 石狮老街', morning: '去晋江梧林看华侨建筑，早点到，避开午后旅行团。', afternoon: '往祥芝渔港走，找一家小馆吃海鲜；看清价格再点。', evening: '在石狮老街散步，回泉州时给路上留足时间。', tip: '海鲜价格按斤计算，点单前先确认；不要只看门口“时价”两个大字。' }
    ],
    extensionDays: [
      { title: '去安溪喝一杯真正的茶', route: '安溪茶园 → 茶农小院', morning: '花半天去安溪，找一片茶园和愿意聊天的茶农。', afternoon: '喝茶、吃饭，不赶景点。', evening: '回泉州，早点睡。', tip: '买茶先试喝，不要被“大师签名”决定钱包。' },
      { title: '最后一天只走一条巷子', route: '旧馆驿 → 金鱼巷 → 花巷', morning: '挑一条没走过的巷子，从头走到尾。', afternoon: '随便吃，随便坐，给喜欢的小店留一张明信片。', evening: '再去一次开元寺门口，和这座城市告别。', tip: '旅行最后一天不要塞新目的地，尤其不要把赶飞机和远郊放在一起。' }
    ],
    experiences: [
      { title: '吃一份有配料的早餐', text: '面线糊不是白粥。醋肉、卤蛋、大肠、油条各有位置，第一次点就选两样最想吃的。' },
      { title: '听一段南音', text: '不必听懂唱词。把它当作老城里一条很慢的河，坐十分钟就会知道它为什么还在。' },
      { title: '在洛阳桥等潮水', text: '桥的价值不只在镜头里，而在潮水、石材和人的脚步之间。' },
      { title: '在庙口看一会儿人间', text: '泉州的神明与日常挨得太近，香火旁边可能就是买菜的人。别急着许愿，先看看大家怎么生活。' }
    ],
    avoid: [
      { from: '西街中午排队拍天台', to: '清晨或晚上走西街，天台换成一间茶馆' },
      { from: '蟳埔流水线簪花妆造', to: '早上看渔村日常，体验前先问清价格' },
      { from: '只吃网红店和必吃榜', to: '菜市场周边小店，观察本地人点什么' }
    ],
    locals: ['面线糊店一般很早开门，早餐比午餐更值得。', '到庙里不要只拍正面，先留意有没有人在祭拜。', '老城巷窄，共享单车骑慢一点，行人优先。'],
    art: { type: 'oldtown', sky: '#c6d6cf', sun: '#e85f39', land1: '#c78f7f', land2: '#6b4c45', ink: '#1f3731', accent: '#f2ca6b', badge: '半城烟火' },
    extraReason: '泉州把历史做成了日常，不需要你站直了参观。'
  },
  {
    id: 'shaxi',
    name: '沙溪',
    en: 'SHAXI',
    region: '云南 · 剑川',
    regionShort: '云南',
    tagline: '在茶马古道的一个转弯处，把日子过慢。',
    quote: '没有必须抵达的地方，只有愿意多坐一会儿的门槛。',
    interests: ['山野', '古建', '人文', '美食'],
    bestMonths: [3, 4, 5, 9, 10, 11],
    preferredDays: [5, 7],
    why: '沙溪不是“被时间遗忘”，它只是没有被时间追着跑。寺登街的青石板、玉津桥下的黑潓江、傍晚回村的羊群，构成一种很轻的秩序。它适合把旅行从地点列表改成一天一天的呼吸。',
    secondWhy: '周边的剑川、石宝山和村落让这里不只是一个古镇。你可以在早上看石窟，下午在田边喝茶，晚上听风穿过木窗；真正需要克服的不是路远，而是“总想再去一个地方”的焦虑。',
    notForYou: ['必须每天有新的网红店可逛', '完全依赖公共交通且不愿包车', '期待大理式的热闹夜生活'],
    weather: '11 月白天约 12–20°C，夜里明显冷；高原紫外线强，早晚温差大，薄羽绒比厚棉服更好用。',
    seasonNote: '11 月稻谷已收，田野颜色偏金褐，游客比暑假少；部分村路会因天气变差，行程要保持弹性。',
    access: {
      air: '从 {origin} 出发，可先飞大理或丽江，再转车到沙溪；两段加起来通常比直飞“最近机场”更现实。',
      rail: '动车到大理后换乘汽车最顺；丽江方向也可，但山路时间要算足。不要相信“下高铁半小时就到”的说法。',
      local: '沙溪古镇内步行即可；石宝山、剑川古城和周边村落建议包车或拼车，提前谈好等候时间。'
    },
    transportRange: [1100, 1900],
    cost: { stay: 260, food: 120, local: 145, tickets: 80, bufferRate: .1 },
    tags: ['茶马古道', '古村', '高原', '慢旅行'],
    saveTips: ['住寺登街外围的客栈，步行 10 分钟内通常更安静也更便宜', '包车按半天谈，不按“景点数量”买套餐', '把一顿网红庭院餐换成本地小馆，省下的钱够多喝两天咖啡'],
    daysPlan: [
      { title: '抵达之后，先不要安排', route: '大理/丽江 → 沙溪古镇 → 玉津桥', morning: '从大理或丽江出发，路上不要卡死时间。山路和会车会让“预计到达”变成参考值。', afternoon: '入住后沿寺登街走一圈，去玉津桥看水。把第一天留白，是这里最基本的礼貌。', evening: '找一家本地小馆吃过桥米线或土锅菜，早点回去听院子里的风。', tip: '不要拖箱子硬走石板路，提前问客栈能不能接行李。' },
      { title: '古道的早晨比照片好看', route: '寺登街 → 兴教寺 → 黑潓江', morning: '早起去寺登街，在游客还没起床时看商铺卸门板、老人扫地。兴教寺开门后进去看壁画。', afternoon: '沿黑潓江走一段，找一块石头坐下。不要把所有时间都交给相机。', evening: '在古镇吃一顿简单的饭，去四方街听现场音乐，但不必坐到很晚。', tip: '沙溪的精华在“没什么发生”的时段，早起比多跑一个景点更有回报。' },
      { title: '石宝山不是一座普通的山', route: '石宝山 → 石钟山石窟 → 宝相寺', morning: '包车去石宝山，先看石钟山石窟。南诏和大理国的造像风格与中原不同，值得慢看。', afternoon: '走到宝相寺一带，山路湿滑时不要逞强；在山上吃简单午饭。', evening: '回沙溪，泡脚，早点睡。', tip: '石窟区域不要触碰造像，遇到讲解就听一段，信息量比拍照大。' },
      { title: '去剑川，看木头的性格', route: '剑川古城 → 木雕作坊 → 沙溪', morning: '去剑川古城逛早市，随后找一家木雕作坊看看。剑川木雕不是纪念品，是这里真正的手艺。', afternoon: '在老城吃午饭，回沙溪的路上看看村子和田野，不赶。', evening: '回到古镇，找一家不吵的院子看书。', tip: '进入作坊先问能不能参观，不要举着相机对着师傅的脸。' },
      { title: '把一天交给村庄', route: '沙溪周边村落 → 田野 → 四方街', morning: '租自行车或包车去周边村落，看看晒谷、放羊和旧房子。不要追着村民拍。', afternoon: '在田边喝茶，回古镇午睡。对，午睡也是行程的一部分。', evening: '最后在四方街吃一顿饭，买一点本地蜂蜜或菌子干货。', tip: '买土产先问价，路边“野生”两个字不能当品质保证。' }
    ],
    extensionDays: [
      { title: '去山上，什么也不做', route: '沙溪 → 高山草甸 → 村落', morning: '找一条轻松的山路走走，或者包车去附近草甸。', afternoon: '带一顿简单午餐，在风景里坐够。', evening: '回古镇，早睡。', tip: '海拔不高但紫外线烈，防晒和饮用水都要带。' },
      { title: '完全空出来的一天', route: '客栈 → 咖啡馆 → 四方街', morning: '睡到自然醒，吃一顿慢早餐。', afternoon: '补上前几天错过的巷子，或者重走最喜欢的一段路。', evening: '在四方街告别，不再新增目的地。', tip: '返程前一天不要安排高强度项目，雨水可能改变山路时间。' }
    ],
    experiences: [
      { title: '赶一次本地集市', text: '先向客栈确认最近的赶集日。集市不是为了游客摆的，蔬菜、背篓和讨价还价才是古镇的底色。' },
      { title: '在玉津桥听水', text: '不用等“最佳机位”。桥边坐十分钟，看水声把下午拉长。' },
      { title: '吃一顿院子里的家常菜', text: '菌子、土鸡、乳饼都值得。问清楚分量，两个人不要按四个人的量点。' },
      { title: '看一次木雕开工', text: '剑川的木雕有很长的谱系。看师傅怎么下刀，比买一个批量生产的摆件更有记忆。' }
    ],
    avoid: [
      { from: '把古镇当背景拍写真', to: '早起看真实生活，尊重院子和人' },
      { from: '一天刷完沙溪所有“打卡点”', to: '一天只安排一个方向，留午后空白' },
      { from: '听信“半小时到石宝山”', to: '按半天预留，确认包车等候时间' }
    ],
    locals: ['很多客栈不提供一次性用品，自带牙刷更省心。', '山路弯多，容易晕车的人提前备药。', '古镇内夜晚安静，十点后聊天放低音量。'],
    art: { type: 'village', sky: '#c4d7d1', sun: '#e7b956', land1: '#889d78', land2: '#38584b', ink: '#18312c', accent: '#e85f39', badge: '古道以西' },
    extraReason: '沙溪会让你意识到，旅行里最奢侈的不是住得多贵，而是没有下一站。'
  },
  {
    id: 'songyang',
    name: '松阳',
    en: 'SONGYANG',
    region: '浙江 · 丽水',
    regionShort: '浙江',
    tagline: '江南不只有水乡，还有云从田里长出来。',
    quote: '在山和村之间，重新理解“附近”这两个字。',
    interests: ['山野', '老城', '古建', '人文'],
    bestMonths: [3, 4, 5, 9, 10, 11],
    preferredDays: [3, 5],
    why: '松阳不是一座被围起来的古镇，而是许多村子、一条老街和一片片茶田组成的县。它适合慢慢移动：今天看杨家堂的黄墙，明天沿茶垄走，后天在老街吃一碗面。山色会让人自动降低语速。',
    secondWhy: '这里真正好看的，是生活仍然在建筑里发生。晒秋、炊烟、祠堂门口的板凳，都比“最美古村”的标签更有分量。把网红村排在早上，把下午留给没有名字的路，你会更喜欢它。',
    notForYou: ['没有车且完全不想做转乘功课', '追求大型景区式项目', '对山路晕车非常严重'],
    weather: '11 月山区早晚约 8–16°C，比城市低几度；雾和小雨常见，路面湿滑，防滑鞋比漂亮鞋更实用。',
    seasonNote: '11 月是稻田收割后的安静期，云雾和土墙颜色都很上镜；周末热门村会堵车，尽量早出发。',
    access: {
      air: '从 {origin} 出发先到杭州或温州，再转高铁/动车到丽水或松阳；远距离不要直接冲机场时刻。',
      rail: '松阳站可到达，但车次视出发地而定；丽水站转大巴或租车更灵活。',
      local: '县内村庄分散，强烈建议租车或包车；山路弯多，夜间尽量不赶路。'
    },
    transportRange: [450, 900],
    cost: { stay: 300, food: 125, local: 145, tickets: 55, bufferRate: .08 },
    tags: ['江南山村', '茶园', '古村', '自驾友好'],
    saveTips: ['住松阳县城或老街附近，价格更稳，开车去各村庄也方便', '把民宿早餐当作一顿正经饭，午餐从简，能省下不少', '两人以上再考虑包车，独行可用班车 + 打车组合'],
    daysPlan: [
      { title: '先把县城走旧', route: '松阳老街 → 延庆寺塔 → 黄家大院', morning: '到松阳后先逛老街，吃一碗灯盏盘或薄饼；不要急着往村里赶。', afternoon: '看延庆寺塔和黄家大院，理解松阳的木构与家族空间。', evening: '回老街吃饭，找一家小店喝茶。', tip: '老街晚上比白天安静，适合散步但不适合期待所有店都开门。' },
      { title: '黄墙与茶田之间', route: '杨家堂 → 酉田村 → 大木山茶园', morning: '早去杨家堂，避开旅行团。黄墙在晨光里最好看，但请先在村外停车步行。', afternoon: '去酉田村或附近村子，再到大木山茶园骑车/散步。不要每个村都下车站十分钟。', evening: '回县城或住茶园附近，早点休息。', tip: '山路会车多，看到观景台先判断能否停车，不要临停挡路。' },
      { title: '云在不经意的村口', route: '平田村 → 陈家铺 → 竹源', morning: '去平田村，看老房子和新建筑怎么相处；陈家铺可去，但尽量早，避开午后咖啡队伍。', afternoon: '沿竹源方向随便走一段，遇到雾就停下来，遇到雨就进店。', evening: '回程吃农家菜，少点一些，留肚子给第二天的早餐。', tip: '网红村不等于全部。只要把下午交给一条普通村道，松阳会立刻变得不一样。' },
      { title: '茶山里的慢时间', route: '大木山茶园 → 古市镇', morning: '在茶园里走一段，不要骑车冲坡；找茶农聊两句，理解“明前”和“雨前”不是营销话术。', afternoon: '去古市镇吃饭，逛老街，下午回县城。', evening: '在老街买一点本地茶或红糖，回酒店整理照片。', tip: '茶园骑行注意刹车和上下坡，雨后泥路不建议骑。' },
      { title: '留一段没有名字的路', route: '县城 → 任意村落 → 老街', morning: '挑一个没做攻略的村子，开车过去吃早饭。', afternoon: '在老街补买伴手礼，找一家面馆吃到饱。', evening: '慢慢收拾行李，不要把返程安排在最后一刻。', tip: '最后一天不要再看新景点，山路时间比你想象中长。' }
    ],
    extensionDays: [
      { title: '往山里再走一点', route: '松阳 → 周边古村 → 茶园', morning: '去一个更远的村子，路上看山。', afternoon: '找农家吃饭，午后回城。', evening: '早睡。', tip: '提前确认油量和信号，山区不是随时有便利店。' },
      { title: '县城里的普通一天', route: '早市 → 茶馆 → 老街', morning: '逛早市，吃本地早餐。', afternoon: '在茶馆坐一下午。', evening: '再走一遍老街。', tip: '把留白当计划的一部分。' }
    ],
    experiences: [
      { title: '在杨家堂看早晨的黄墙', text: '最好在团队到达前进去，安静地走一圈。不要为了构图踩田。' },
      { title: '大木山骑车', text: '茶垄之间很适合慢慢骑，但坡度和弯道也需要认真对待。' },
      { title: '在老街吃一次早饭', text: '松阳的小吃要趁早。坐在塑料凳上吃，比在民宿露台摆拍更接近这里。' },
      { title: '听一场雨', text: '松阳的雨天不废行程。找一间有窗的茶馆，看云从山上下来。' }
    ],
    avoid: [
      { from: '周末中午冲网红村', to: '清晨进村，午后走无名村道' },
      { from: '每个村都打卡十分钟', to: '一天只选 2–3 个点，留出停留时间' },
      { from: '夜间赶山路', to: '天黑前回县城，晚餐在住的附近解决' }
    ],
    locals: ['村口停车先问清楚，有些地方是村民自家地。', '山区天气变化快，带雨具和防滑鞋。', '买茶先试喝，不要只看包装上的“古树”二字。'],
    art: { type: 'terraces', sky: '#c9d7cf', sun: '#e7b854', land1: '#9db085', land2: '#3e5b4c', ink: '#18312c', accent: '#d97b4e', badge: '云在田里' },
    extraReason: '松阳是那种必须开慢一点、走岔一点，才会开始喜欢的地方。'
  },
  {
    id: 'zhangye',
    name: '张掖',
    en: 'ZHANGYE',
    region: '甘肃 · 中国',
    regionShort: '甘肃',
    tagline: '在山的褶皱和城的旧梦之间，往西一点。',
    quote: '这里的颜色不太讲道理，风也不太讲情面。',
    interests: ['山野', '古建', '人文', '美食'],
    bestMonths: [5, 6, 7, 9, 10],
    preferredDays: [5, 7],
    why: '张掖不是只有一个“七彩丹霞”。它一边是祁连山，一边是河西走廊的城市生活；马蹄寺的石窟、肃南的草原、张掖大佛寺的卧佛，让这趟旅行同时拥有荒野和人间。',
    secondWhy: '这里最适合把“自然”和“历史”放在同一条时间线上。你早上在山谷里看风蚀纹理，下午在寺庙里看西夏的塑像；晚上吃一碗臊子面，突然就明白河西走廊为什么重要。',
    notForYou: ['不喜欢长距离车程和风沙', '只想在城市里悠闲逛街', '对高海拔和强烈日照适应较差'],
    weather: '11 月已冷，白天约 2–12°C，早晚可到零下；风沙和紫外线都强，羽绒、墨镜、润肤霜都别省。',
    seasonNote: '11 月游客较少，山体颜色仍然好看；但昼夜温差大、部分草原线路会受天气影响，必须留出机动日。',
    access: {
      air: '从 {origin} 出发可查飞张掖甘州机场，或先到兰州/西宁再换高铁；两条方案各有中转成本。',
      rail: '高铁到张掖西站较方便，市区打车即可；去马蹄寺、平山湖等地建议包车。',
      local: '张掖景点分散，公共交通不能覆盖全部。两人以上包车通常更省时间，单独出行可拼车。'
    },
    transportRange: [900, 1800],
    cost: { stay: 240, food: 130, local: 175, tickets: 125, bufferRate: .1 },
    tags: ['丹霞', '石窟', '河西走廊', '荒野'],
    saveTips: ['住张掖市区鼓楼附近，吃饭和交通都方便，不必每晚换酒店', '丹霞和平山湖拼车比单独打车更现实', '景区内摆渡车和讲解按需要买，不被迫打包所有套票'],
    daysPlan: [
      { title: '先在城里找河西走廊', route: '大佛寺 → 木塔寺 → 鼓楼', morning: '到张掖后先看大佛寺，卧佛很大，但真正动人的是殿内安静的光。', afternoon: '去木塔寺周边和鼓楼走走，吃一碗臊子面或搓鱼子。', evening: '逛夜市，提前和包车司机确认第二天路线。', tip: '不要把张掖当作一个景点中转站，它本身也有可看的老城。' },
      { title: '马蹄寺的风从石窟穿过', route: '马蹄寺 → 肃南草原', morning: '早出发去马蹄寺，先去千佛洞和三十三天石窟，手脚并用时别贪快。', afternoon: '去肃南看草原和雪山线，天气好时在路边停一会儿；天气差就提前回。', evening: '回市区，补充水分，早睡。', tip: '马蹄寺部分洞窟通道狭窄，穿防滑鞋，背包不要过大。' },
      { title: '峡谷把时间切出层次', route: '平山湖大峡谷', morning: '包车去平山湖大峡谷，路上时间长，早出发比多睡半小时更有价值。', afternoon: '按体力选徒步线，不追求走完全部观景台；风大时帽子比发型重要。', evening: '回城吃一顿热的，早点休息。', tip: '不要在无护栏边缘拍照，景区的“出片”不值得冒险。' },
      { title: '颜色确实会让人失语', route: '七彩丹霞 → 冰沟丹霞', morning: '把上午留给冰沟丹霞，人相对少；看地貌层次比追观景台编号更有意思。', afternoon: '傍晚去七彩丹霞等日落，避开最拥挤的主观景台，选择次一点的角度。', evening: '回城，吃夜市；不要在景区门口将就晚饭。', tip: '七彩丹霞日落后降温快，带厚外套；摆渡车末班时间提前确认。' },
      { title: '往祁连山的方向再走一点', route: '民乐 → 扁都口 → 张掖', morning: '去民乐方向，看看扁都口到祁连山的公路风景；季节不对时不要强求花海。', afternoon: '在县城吃饭，回张掖城里买点红枣或临泽小枣。', evening: '沿湿地公园走一圈，给旅行收尾。', tip: '山区天气变化很快，行程中不要只留一个返回时间。' }
    ],
    extensionDays: [
      { title: '山丹军马场的一天', route: '山丹军马场 → 焉支山', morning: '去山丹军马场看草原和马群，路程较长，早出发。', afternoon: '在焉支山附近休息，回程不赶。', evening: '回张掖市区。', tip: '马场范围很大，提前确认能否进入和天气状况。' },
      { title: '城里的留白日', route: '张掖湿地 → 老街 → 茶馆', morning: '去湿地公园散步，不设目标。', afternoon: '在老街吃饭、喝茶，整理行李。', evening: '和这座城市安静地告别。', tip: '返程前不要再安排远郊。' }
    ],
    experiences: [
      { title: '在七彩丹霞等光变', text: '最好看的不是正午最饱和的颜色，而是日落前层次变深的十分钟。' },
      { title: '走进马蹄寺的窄洞', text: '通道比照片狭窄得多，慢一点，手脚并用的时候把相机收起来。' },
      { title: '大佛寺的安静', text: '不要只拍卧佛。殿内的梁架、壁画和光线，都值得你把手机放下一会儿。' },
      { title: '在夜市吃一碗热的', text: '搓鱼子、炒炮、羊肉粉汤，选本地人多的摊位，少点，多尝。' }
    ],
    avoid: [
      { from: '正午在七彩丹霞追观景台', to: '傍晚去，选人少的次观景台' },
      { from: '一天连跑丹霞和平山湖', to: '拆成两天，给路上时间留足' },
      { from: '景区门口解决正餐', to: '回市区吃，选择本地人多的摊' }
    ],
    locals: ['河西走廊风大，帽子最好有绳。', '景区之间距离远，不要低估车程。', '尊重当地宗教场所，进入石窟和寺庙不要大声喧哗。'],
    art: { type: 'desert', sky: '#d9cbb2', sun: '#e85f39', land1: '#bd8c5d', land2: '#69473b', ink: '#25322e', accent: '#efc465', badge: '向西而行' },
    extraReason: '张掖是荒野和人间并存的地方，适合把旅行重新变得辽阔。'
  }
];

/* =========================================================
   Application state and shared logic
   ========================================================= */
const appState = {
  activeView: 'home',
  serious: {
    input: null,
    dest: null,
    estimate: null,
    dates: null,
    match: 0,
    research: null,
    requestId: 0
  },
  casual: {
    mode: null,
    mbti: '',
    budget: null,
    question: null,
    answer: null,
    report: null,
    loading: false,
    requestId: 0,
    avoidDestinations: [],
    lastAction: null
  },
  loadingTimer: null
};

let artSequence = 0;

function setView(name) {
  const targetId = name === 'serious' ? 'serious-view' : name === 'casual' ? 'casual-view' : 'home-view';
  $$('.view').forEach((view) => view.classList.toggle('is-active', view.id === targetId));
  appState.activeView = name;
  document.body.dataset.view = name;
  window.scrollTo({ top: 0, behavior: 'auto' });
  setTimeout(() => {
    const title = $('#' + targetId + ' h1');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }, 100);
}

function resetSeriousView() {
  appState.serious.requestId += 1;
  const result = $('#serious-result');
  if (result) result.innerHTML = '';
  $('#serious-view').classList.remove('has-result');
  appState.serious.dest = null;
  appState.serious.estimate = null;
  appState.serious.dates = null;
  appState.serious.research = null;
  const error = $('#serious-error');
  if (error) error.textContent = '';
  stopSeriousLoading();
}

function resetCasualView() {
  appState.casual.requestId += 1;
  stopThinkingLabels();
  $('#casual-intro').hidden = false;
  $('#quiz-shell').hidden = true;
  $('#thinking-shell').hidden = true;
  $('#casual-error-shell').hidden = true;
  $('#casual-result').innerHTML = '';
  appState.casual = {
    mode: null,
    mbti: '',
    budget: null,
    question: null,
    answer: null,
    report: null,
    loading: false,
    requestId: appState.casual.requestId,
    avoidDestinations: [],
    lastAction: null
  };
  $$('.mbti-picks button').forEach((button) => button.classList.remove('is-active'));
  const mbtiField = $('#casual-mbti');
  if (mbtiField) mbtiField.value = '';
  $('#casual-mbti')?.classList.remove('is-invalid');
  $('#casual-mbti-error') && ($('#casual-mbti-error').textContent = '');
  $('#casual-mbti-form')?.classList.remove('has-error');
}

function openMode(mode) {
  if (mode === 'serious') {
    setView('serious');
    resetSeriousView();
  } else {
    setView('casual');
    resetCasualView();
    checkAIService();
  }
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function setupSeriousDate() {
  const field = $('#start-date');
  if (!field) return;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const latest = new Date(today);
  latest.setDate(latest.getDate() + 365);
  const suggested = new Date(today);
  suggested.setDate(suggested.getDate() + 21);
  field.min = toISODate(today);
  field.max = toISODate(latest);
  if (!field.value) field.value = toISODate(suggested);
}

function syncSeriousDaysField(shouldFocus = true) {
  const selected = $('input[name="days"]:checked')?.value;
  const field = $('#custom-days-field');
  const input = $('#custom-days');
  if (!field || !input) return;
  const isCustom = selected === 'custom';
  field.hidden = !isCustom;
  $('#days-error').textContent = '';
  if (isCustom && shouldFocus) {
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  }
}

function setupSeriousDays() {
  $$('input[name="days"]').forEach((input) => {
    input.addEventListener('change', () => {
      syncSeriousDaysField();
      clearSeriousError();
    });
  });
  $('#custom-days')?.addEventListener('input', () => {
    $('#days-error').textContent = '';
    clearSeriousError();
  });
  syncSeriousDaysField(false);
}

function readSeriousDays() {
  const choice = $('input[name="days"]:checked')?.value || '5';
  if (choice !== 'custom') return Number(choice);
  const input = $('#custom-days');
  const days = Number(input?.value);
  const error = $('#days-error');
  if (!Number.isInteger(days) || days < 1 || days > 10) {
    if (error) error.textContent = '自定义天数请填写 1–10 之间的整数。';
    input?.focus();
    return null;
  }
  if (error) error.textContent = '';
  return days;
}

function estimateSerious(dest, days, budget) {
  const nights = Math.max(0, days - 1);
  const transport = Math.round((dest.transportRange[0] + dest.transportRange[1]) / 2);
  const stay = dest.cost.stay * nights;
  const food = dest.cost.food * days;
  const local = dest.cost.local * days;
  const tickets = dest.cost.tickets * days;
  const subtotal = transport + stay + food + local + tickets;
  const buffer = Math.round(subtotal * dest.cost.bufferRate);
  const total = Math.round((subtotal + buffer) / 10) * 10;
  const low = Math.round((total * 0.9) / 10) * 10;
  const high = Math.round((total * 1.1) / 10) * 10;
  const gap = Number.isFinite(budget) ? budget - total : null;
  let status = 'unset';
  let statusText = '未设预算，按实际花费估算';
  let note = '你没有设预算，这组数字是一份基线。真正出发时，至少留出 10% 给临时起意和价格浮动。';
  if (Number.isFinite(budget)) {
    if (gap >= 0) {
      status = gap > total * 0.18 ? 'comfortable' : 'within';
      statusText = gap > total * 0.18 ? `预算宽裕，余 ${money(gap)}` : `预算之内，余 ${money(gap)}`;
      note = `你的预算是 ${money(budget)}。按这份计划，预计还会留下 ${money(gap)}，可以用来加一晚住宿、请一次讲解，或者吃一顿不看价格的晚饭。`;
    } else if (Math.abs(gap) <= total * 0.12) {
      status = 'tight';
      statusText = `略超预算 ${money(Math.abs(gap))}`;
      note = `你的预算是 ${money(budget)}，这份计划大约高出 ${money(Math.abs(gap))}。不算失控，但需要在大交通或住宿上二选一。`;
    } else {
      status = 'over';
      statusText = `超出预算 ${money(Math.abs(gap))}`;
      note = `你的预算是 ${money(budget)}，这份计划的完整版本会超出 ${money(Math.abs(gap))}。下面给出压缩方案；如果仍然吃力，就诚实缩短一天或换目的地。`;
    }
  }
  return {
    transport, stay, food, local, tickets, buffer, total, low, high, gap, status, statusText, note,
    nights,
    items: [
      { label: '大交通', value: transport },
      { label: '住宿', value: stay },
      { label: '吃饭', value: food },
      { label: '当地交通', value: local },
      { label: '门票体验', value: tickets },
      { label: '机动金', value: buffer }
    ]
  };
}

/* =========================================================
   Generated destination artwork
   ========================================================= */
function destinationArt(dest) {
  const palette = dest.art;
  const id = `art${++artSequence}`;
  const type = palette.type;
  const base = (content) => `
    <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escapeHTML(dest.name)}风格插画">
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${palette.sky}"/>
          <stop offset="1" stop-color="${palette.accent}" stop-opacity=".36"/>
        </linearGradient>
      </defs>
      <rect width="800" height="800" fill="url(#${id}sky)"/>
      <circle cx="610" cy="150" r="105" fill="${palette.sun}"/>
      ${content}
      <g fill="${palette.ink}" opacity=".6" font-family="Georgia,serif" font-size="11" letter-spacing="3">
        <text x="38" y="46">OFF COURSE / ${escapeHTML(dest.en)}</text>
        <text x="38" y="767">36. COORDINATES NOT IMPORTANT</text>
      </g>
      <g stroke="${palette.ink}" opacity=".3"><path d="M38 720h85M38 730h55"/></g>
    </svg>`;

  if (type === 'cave') {
    return base(`
      <path d="M-30 360C98 314 195 339 279 302c91-40 181-65 302-23 95 33 149 41 252 12v540H-30Z" fill="${palette.land1}" opacity=".62"/>
      <path d="M-30 451c142-34 221 8 325-22 106-30 210-58 315-14 85 36 132 39 242 12v393H-30Z" fill="${palette.land2}"/>
      <path d="M-40 671c105-48 190-16 280-48 93-33 185-48 278-16 94 32 180 28 323-24v240H-40Z" fill="${palette.ink}"/>
      <path d="M216 656V401c0-101 68-164 165-164 97 0 168 63 168 164v255h-92V406c0-55-32-85-77-85-43 0-73 30-73 85v250Z" fill="${palette.ink}" opacity=".9"/>
      <path d="M300 659V434c0-50 35-85 82-85s82 35 82 85v225" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="5 10" opacity=".78"/>
      <g fill="${palette.accent}" opacity=".9">
        <circle cx="382" cy="399" r="9"/><circle cx="382" cy="453" r="6"/><circle cx="382" cy="493" r="4"/>
      </g>
      <g stroke="${palette.accent}" stroke-width="2" opacity=".55">
        <path d="M104 660v-81m34 81v-117m35 117v-64m488 64v-101m31 101v-62m30 62v-144"/>
      </g>
      <path d="M87 276c35-39 84-39 119 0 35-39 84-39 119 0" stroke="${palette.ink}" stroke-width="2" opacity=".42"/>
      <path d="M125 280c135 103 276 162 505 109" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="3 10" opacity=".7"/>
      <circle cx="125" cy="280" r="6" fill="${palette.sun}"/><circle cx="630" cy="389" r="6" fill="${palette.sun}"/>
    `);
  }

  if (type === 'oldtown') {
    return base(`
      <path d="M-20 390h840v410H-20Z" fill="${palette.land1}" opacity=".55"/>
      <path d="M-20 449h840v351H-20Z" fill="${palette.land2}" opacity=".38"/>
      <g fill="${palette.ink}">
        <path d="M82 690V466h94v224Z"/><path d="M44 477l86-89 92 89Z"/>
        <path d="M239 690V510h145v180Z"/><path d="M214 519l99-89 98 89Z"/>
        <path d="M468 690V437h155v253Z"/><path d="M436 451l111-109 112 109Z"/>
        <path d="M663 690V528h89v162Z"/><path d="M641 536l67-69 66 69Z"/>
      </g>
      <g fill="${palette.accent}" opacity=".9">
        <rect x="118" y="520" width="22" height="32"/><rect x="294" y="551" width="21" height="30"/><rect x="333" y="551" width="21" height="30"/>
        <rect x="533" y="502" width="25" height="37"/><rect x="694" y="572" width="20" height="27"/>
      </g>
      <g stroke="${palette.accent}" stroke-width="2" opacity=".7">
        <path d="M82 690h630M95 615h600M150 690v-74m84 74v-74m153 0v74m135-74v74m95 0v-49"/>
      </g>
      <path d="M34 730c101-33 178 13 272-10 123-31 205-24 302 4 58 17 100 17 160 3" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="4 11" opacity=".6"/>
      <path d="M88 262c19-22 43-22 62 0 19-22 43-22 62 0M566 305c15-18 35-18 50 0 15-18 35-18 50 0" stroke="${palette.ink}" stroke-width="2" opacity=".38"/>
    `);
  }

  if (type === 'village') {
    return base(`
      <path d="M-30 459c141-74 250-42 356-34 114 10 207 4 302-45 74-38 132-44 202-16v436H-30Z" fill="${palette.land1}" opacity=".72"/>
      <path d="M-30 552c122-54 222-15 322-25 141-15 242-64 334-28 80 32 125 27 204 2v299H-30Z" fill="${palette.land2}" opacity=".8"/>
      <path d="M-20 705c109-63 191-23 301-43 131-24 210 20 304-8 81-25 154-21 235-6v152H-20Z" fill="${palette.ink}"/>
      <g fill="${palette.ink}">
        <path d="M196 602V500h106v102Z"/><path d="M171 507l77-61 78 61Z"/>
        <path d="M401 590V516h88v74Z"/><path d="M380 521l64-49 65 49Z"/>
        <path d="M552 620V533h70v87Z"/><path d="M536 538l51-42 52 42Z"/>
      </g>
      <g fill="${palette.accent}" opacity=".94">
        <rect x="228" y="526" width="19" height="23"/><rect x="427" y="538" width="16" height="19"/><rect x="570" y="554" width="15" height="18"/>
      </g>
      <g fill="none" stroke="${palette.accent}" stroke-width="2" opacity=".6">
        <path d="M-20 664c119-27 200 23 313 2 113-21 218-16 332 8 75 16 124 13 195-1"/>
        <path d="M-30 694c131-29 219 20 334 1 118-20 225-15 347 8 70 14 118 10 179-3"/>
        <path d="M-20 727c124-23 210 17 333 0 123-17 228-12 351 8 65 11 104 8 156-1"/>
      </g>
      <path d="M207 496c-20-46 2-72 20-91m6 89c-4-34 13-62 28-79" stroke="${palette.ink}" stroke-width="2" opacity=".28"/>
      <path d="M70 391c24-18 48-18 72 0 24-18 48-18 72 0" stroke="${palette.ink}" stroke-width="2" opacity=".35"/>
    `);
  }

  if (type === 'terraces') {
    return base(`
      <path d="M-30 382c128-87 226-48 328-17 104 32 182 25 292-45 83-54 153-52 240-9v489H-30Z" fill="${palette.land1}" opacity=".58"/>
      <path d="M-20 458c128-60 214-18 322 9 102 25 185 14 284-34 84-41 140-30 224-3v370H-20Z" fill="${palette.land1}" opacity=".66"/>
      <g fill="none" stroke="${palette.accent}" stroke-width="3" opacity=".58">
        <path d="M-20 519c130-53 211-9 319 16 114 27 197 7 303-34 70-28 129-36 218-18"/>
        <path d="M-30 564c137-47 211 2 321 24 117 23 205 2 310-37 64-24 120-28 205-12"/>
        <path d="M-30 613c139-44 214 11 322 29 118 19 203-5 305-42 65-23 126-24 213-8"/>
        <path d="M-30 666c141-41 210 17 328 34 115 16 198-10 300-46 67-23 129-25 222-5"/>
        <path d="M-30 721c133-39 216 21 332 33 122 13 190-14 293-48 73-24 129-23 225-2"/>
      </g>
      <g fill="${palette.ink}">
        <path d="M321 563V472h92v91Z"/><path d="M298 479l69-54 69 54Z"/>
        <path d="M497 603V531h70v72Z"/><path d="M481 538l51-42 51 42Z"/>
      </g>
      <g fill="${palette.accent}" opacity=".9"><rect x="349" y="496" width="17" height="20"/><rect x="520" y="551" width="15" height="18"/></g>
      <path d="M363 439c-19-47 7-75 30-92" stroke="${palette.ink}" stroke-width="2" opacity=".27"/>
      <g stroke="${palette.ink}" opacity=".4"><path d="M97 331c26-17 51-17 77 0 26-17 51-17 77 0"/><path d="M610 325c18-13 36-13 54 0 18-13 36-13 54 0"/></g>
    `);
  }

  if (type === 'desert') {
    return base(`
      <path d="M-20 444c98-70 192-73 281-42 97 34 151 38 250-6 89-40 164-42 309 21v383H-20Z" fill="${palette.land1}" opacity=".66"/>
      <path d="M-26 555c138-71 225-33 331-20 111 14 199-16 288-55 83-37 152-29 235 18v302H-26Z" fill="${palette.land1}" opacity=".7"/>
      <path d="M-20 641c120-55 218-9 317-16 104-8 209-50 314-41 80 7 128 20 209 2v214H-20Z" fill="${palette.land2}"/>
      <path d="M-10 735c130-39 216-5 329-13 112-8 193-31 293-17 70 10 112 14 198-9v104H-10Z" fill="${palette.ink}"/>
      <g fill="${palette.ink}">
        <path d="M153 642V525h171v117Z"/><path d="M182 525l55-44 58 44Z"/>
        <path d="M459 646V556h106v90Z"/><path d="M478 556l34-28 35 28Z"/>
      </g>
      <g fill="none" stroke="${palette.accent}" stroke-width="2" opacity=".7">
        <path d="M-20 607c104-35 207 7 312-10 108-17 195-52 299-32 91 18 143 26 229 6"/>
        <path d="M-20 686c124-25 211 9 327-2 119-12 194-37 294-22 92 14 145 17 219-7"/>
        <path d="M33 470c92-18 154-3 232 23 94 31 169 17 261-27"/>
      </g>
      <path d="M86 247c28-19 55-19 83 0 28-19 55-19 83 0" stroke="${palette.ink}" stroke-width="2" opacity=".32"/>
      <path d="M560 356l45 61 55 3-44 43 11 58-67-31-67 31 11-58-44-43 55-3Z" fill="${palette.accent}" opacity=".9"/>
    `);
  }

  if (type === 'island') {
    return base(`
      <path d="M-20 448h840v372H-20Z" fill="${palette.land1}" opacity=".46"/>
      <path d="M-20 487c104-18 173 17 272 7 114-12 213-31 321-8 89 19 150 13 247-4v338H-20Z" fill="${palette.land2}" opacity=".55"/>
      <g fill="none" stroke="${palette.accent}" stroke-width="2" opacity=".58">
        <path d="M-20 552c116-22 207 20 318 8 119-13 195-31 306-9 95 19 144 18 236-2"/>
        <path d="M-20 605c109-20 199 18 309 7 121-12 207-32 316-10 86 17 139 17 235-2"/>
        <path d="M-20 665c98-18 187 17 301 7 128-11 208-32 319-10 83 16 143 15 240-5"/>
      </g>
      <path d="M237 512c26-77 87-122 162-122 75 0 130 43 155 122-94-20-221-20-317 0Z" fill="${palette.ink}" opacity=".9"/>
      <path d="M320 426c23-56 109-91 209-58 45 15 72 36 91 58" fill="${palette.land1}"/>
      <g fill="${palette.ink}">
        <path d="M381 392v-47h61v47Z"/><path d="M362 347l49-42 50 42Z"/>
      </g>
      <g fill="${palette.accent}"><rect x="396" y="352" width="12" height="17"/><circle cx="563" cy="302" r="5"/></g>
      <g stroke="${palette.ink}" stroke-width="2" opacity=".48"><path d="M83 283c23-15 46-15 69 0 23-15 46-15 69 0"/><path d="M603 247c16-10 32-10 48 0 16-10 32-10 48 0"/></g>
      <path d="M114 367c89 106 195 161 362 153 108-5 190-45 267-117" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="3 11" opacity=".75"/>
      <circle cx="114" cy="367" r="6" fill="${palette.sun}"/><circle cx="743" cy="403" r="6" fill="${palette.sun}"/>
    `);
  }

  if (type === 'coast') {
    return base(`
      <path d="M-20 445h840v375H-20Z" fill="${palette.land1}" opacity=".54"/>
      <path d="M-30 497c127-20 210 19 321 11 124-9 211-32 322-10 94 18 136 15 227-4v346H-30Z" fill="${palette.land2}" opacity=".48"/>
      <g fill="none" stroke="${palette.accent}" stroke-width="3" opacity=".55">
        <path d="M-30 557c127-22 213 22 322 12 115-11 211-38 325-13 84 19 137 17 223 0"/>
        <path d="M-30 620c120-19 208 24 320 13 119-11 218-39 329-14 82 19 129 15 221-2"/>
        <path d="M-30 690c111-18 201 22 314 11 121-12 213-36 325-11 85 19 135 15 231-3"/>
      </g>
      <path d="M78 520V347h270v173Z" fill="${palette.ink}"/>
      <path d="M54 358h319l-34-54H91Z" fill="${palette.ink}"/>
      <g fill="${palette.accent}" opacity=".86"><rect x="123" y="402" width="35" height="53"/><rect x="188" y="402" width="35" height="53"/><rect x="253" y="402" width="35" height="53"/></g>
      <g fill="${palette.ink}"><path d="M500 553l148-31 31 53-147 21Z"/><path d="M524 554v66h88v-53Z"/></g>
      <g stroke="${palette.ink}" stroke-width="2" opacity=".5"><path d="M431 292c23-15 46-15 69 0 23-15 46-15 69 0"/><path d="M591 249c16-10 32-10 48 0 16-10 32-10 48 0"/><path d="M187 278c16-10 32-10 48 0 16-10 32-10 48 0"/></g>
      <path d="M413 318c79 94 145 143 260 196" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="3 10" opacity=".76"/>
      <circle cx="413" cy="318" r="6" fill="${palette.sun}"/><circle cx="673" cy="514" r="6" fill="${palette.sun}"/>
    `);
  }

  if (type === 'fjord') {
    return base(`
      <path d="M-30 462c100-43 173-105 258-153 82-46 146-35 214 20 79 65 137 81 218 51 61-23 102-23 160-2v422H-30Z" fill="${palette.land1}" opacity=".6"/>
      <path d="M-30 528c99-48 152-139 244-182 80-37 133-10 185 54 61 75 125 104 208 65 66-31 124-40 223 9v326H-30Z" fill="${palette.land2}" opacity=".72"/>
      <path d="M-20 627h840v193H-20Z" fill="${palette.ink}"/>
      <path d="M-20 627c143 19 228-19 340 2 119 22 195 18 308-4 98-19 154-8 212 2v22c-95 17-158 9-245 5-132-6-218-23-309-7-113 20-179 25-306 8Z" fill="${palette.accent}" opacity=".36"/>
      <g fill="${palette.ink}"><path d="M84 626V553h63v73Z"/><path d="M63 559l52-41 53 41Z"/><path d="M268 626V573h44v53Z"/><path d="M255 577l35-27 36 27Z"/><path d="M612 628V571h45v57Z"/><path d="M600 576l35-28 36 28Z"/></g>
      <g fill="${palette.sun}" opacity=".95"><rect x="100" y="575" width="12" height="16"/><rect x="626" y="590" width="12" height="16"/></g>
      <path d="M77 420c63 63 131 95 211 96 83 1 152-31 211-84" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="3 11" opacity=".65"/>
      <g stroke="${palette.ink}" stroke-width="2" opacity=".3"><path d="M503 250c18-12 36-12 54 0 18-12 36-12 54 0"/><path d="M236 327c14-9 28-9 42 0 14-9 28-9 42 0"/></g>
    `);
  }

  return base(`
    <path d="M-20 438c96-59 186-18 276-43 106-29 166-57 266-17 93 37 151 40 298 2v420H-20Z" fill="${palette.land1}" opacity=".5"/>
    <path d="M-20 540c102-35 180 8 284-19 106-28 183-35 285 2 81 29 138 24 271-12v289H-20Z" fill="${palette.land2}" opacity=".5"/>
    <g fill="${palette.ink}">
      <path d="M63 664V506h179v158Z"/><path d="M276 664V473h186v191Z"/><path d="M493 664V529h151v135Z"/>
    </g>
    <g fill="${palette.accent}"><rect x="104" y="549" width="31" height="53"/><rect x="317" y="517" width="35" height="48"/><rect x="379" y="517" width="35" height="48"/><rect x="534" y="568" width="30" height="43"/></g>
    <g fill="none" stroke="${palette.sun}" stroke-width="2" opacity=".75"><path d="M-20 610c103-27 185 14 288-8 109-23 177-29 282 1 85 24 144 22 270-9"/><path d="M-20 686c119-22 201 9 298-8 111-19 184-22 288 4 80 20 147 18 254-5"/></g>
    <path d="M91 318c57 77 135 118 240 121 108 3 189-34 272-110" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="3 10" opacity=".7"/>
    <circle cx="91" cy="318" r="6" fill="${palette.sun}"/><circle cx="603" cy="329" r="6" fill="${palette.sun}"/>
  `);
}

/* =========================================================
   Home + serious planner
   ========================================================= */
function formatMonthRanges(months) {
  const sorted = [...new Set(months)].sort((left, right) => left - right);
  const groups = [];
  sorted.forEach((month) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && month === lastGroup[lastGroup.length - 1] + 1) lastGroup.push(month);
    else groups.push([month]);
  });
  return groups.map((group) => group.length === 1 ? `${group[0]}` : `${group[0]}–${group[group.length - 1]}`).join(' / ');
}

function renderFeaturedDestinations() {
  const container = $('#featured-grid');
  if (!container) return;
  const featured = ['datong', 'quanzhou', 'shaxi'].map((id) => seriousDestinations.find((dest) => dest.id === id));
  container.innerHTML = featured.map((dest, index) => `
    <article class="featured-card">
      <div class="featured-visual">
        ${destinationArt(dest)}
        <span class="featured-code">FIELD NO. ${pad2(index + 1)}</span>
        <span class="featured-month">BEST ${formatMonthRanges(dest.bestMonths)} 月</span>
      </div>
      <div class="featured-copy">
        <h3>${dest.name}<small>${dest.en}</small></h3>
        <p>${dest.tagline}</p>
        <div class="featured-card-foot">
          <span>${dest.region} · ${dest.preferredDays.includes(5) ? '5 天' : '3 天'}</span>
          <button type="button" data-feature-dest="${dest.id}">按这个方向规划 <b>↗</b></button>
        </div>
      </div>
    </article>
  `).join('');
}

function readSeriousForm() {
  const originInput = $('#origin');
  const origin = originInput.value.trim();
  const originField = originInput.closest('.field');
  const error = $('#origin-error');
  originInput.value = origin;
  if (!origin) {
    originField.classList.add('has-error');
    error.textContent = '先告诉我们从哪里出发，才能把路费和路上时间算进去。';
    originInput.focus();
    return null;
  }
  originField.classList.remove('has-error');
  error.textContent = '';
  const startDateField = $('#start-date');
  const startDate = startDateField.value;
  const startDateError = $('#start-date-error');
  if (!startDate) {
    startDateField.closest('.field').classList.add('has-error');
    startDateError.textContent = '选一个具体出发日期，AI 才能核对当天的天气、开放和交通。';
    startDateField.focus();
    return null;
  }
  startDateField.closest('.field').classList.remove('has-error');
  startDateError.textContent = '';
  const [year, month] = startDate.split('-').map(Number);
  const days = readSeriousDays();
  if (days === null) return null;
  const budgetValue = $('#budget').value.trim();
  const budget = budgetValue === '' ? null : Number(budgetValue);
  if (budget !== null && (!Number.isFinite(budget) || budget <= 0)) {
    showSeriousError('预算要么留空，要么填写一个大于 0 的数字。');
    $('#budget')?.focus();
    return null;
  }
  const interests = $$('input[name="interests"]:checked').map((input) => input.value);
  const destination = $('#destination').value.trim();
  clearSeriousError();
  return { origin, destination, startDate, year, month, days, budget, interests };
}

function showSeriousError(message) {
  const error = $('#serious-error');
  if (!error) return;
  error.textContent = message;
  error.classList.add('is-visible');
}

function clearSeriousError() {
  const error = $('#serious-error');
  if (!error) return;
  error.textContent = '';
  error.classList.remove('is-visible');
}

async function handleSeriousSubmit(event) {
  event.preventDefault();
  const input = readSeriousForm();
  if (!input) return;
  const submit = $('.form-submit');
  const originalMarkup = submit.innerHTML;
  const requestId = ++appState.serious.requestId;
  submit.disabled = true;
  submit.innerHTML = '<span>正在联网检索并排程……</span><b>↗</b>';
  clearSeriousError();
  startSeriousLoading();
  showLoading(true);

  try {
    const payload = await requestAPIWithRetry('/api/serious/plan', {
      method: 'POST',
      body: JSON.stringify({
        origin: input.origin,
        destination: input.destination,
        startDate: input.startDate,
        days: input.days,
        budget: input.budget,
        interests: input.interests
      })
    }, {
      attempts: 2,
      onRetry: () => {
        submit.innerHTML = '<span>刚才的连接断了，正在自动重试……</span><b>↗</b>';
        const title = $('#loading-title');
        if (title) title.textContent = '刚才的检索连接中断，正在重新接通……';
      }
    });
    if (requestId !== appState.serious.requestId) return;
    const dest = payload.destination;
    stopSeriousLoading();
    const imageTitle = $('#loading-title');
    if (imageTitle) imageTitle.textContent = '行程已经排好，正在取回目的地的风景图……';
    dest.photo = await loadSeriousPhoto(requestId, dest);
    if (requestId !== appState.serious.requestId) return;
    const estimate = estimateSerious(dest, input.days, input.budget);
    appState.serious = {
      input,
      dest,
      estimate,
      dates: payload.dates,
      match: payload.match || 94,
      research: payload.research,
      requestId
    };
    renderSeriousResult();
    $('#serious-view').classList.add('has-result');
    window.scrollTo({ top: 0, behavior: 'auto' });
    const result = $('.serious-result');
    if (result) {
      result.setAttribute('tabindex', '-1');
      result.focus({ preventScroll: true });
    }
  } catch (error) {
    if (requestId !== appState.serious.requestId) return;
    showSeriousError(error.message || '生成失败，请稍后重试。');
    showToast('没有生成行程，请检查提示后重试');
  } finally {
    if (requestId === appState.serious.requestId) {
      stopSeriousLoading();
      showLoading(false);
      submit.disabled = false;
      submit.innerHTML = originalMarkup;
    }
  }
}

const SERIOUS_LOADING_MESSAGES = [
  '正在联网检索交通、天气和开放信息……',
  '正在核对抵达路线、住宿片区与大致票价……',
  '正在把景点排进真实可走的一天……',
  '正在删掉走不完的行程，并补上雨天备案……',
  '正在整理预算、预订清单和需要复核的风险……'
];
let seriousLoadingTimer = null;

function startSeriousLoading() {
  stopSeriousLoading();
  let index = 0;
  const title = $('#loading-title');
  if (title) title.textContent = SERIOUS_LOADING_MESSAGES[0];
  seriousLoadingTimer = setInterval(() => {
    index = Math.min(index + 1, SERIOUS_LOADING_MESSAGES.length - 1);
    if (title) title.textContent = SERIOUS_LOADING_MESSAGES[index];
  }, 12_000);
}

function stopSeriousLoading() {
  if (!seriousLoadingTimer) return;
  clearInterval(seriousLoadingTimer);
  seriousLoadingTimer = null;
}

function showLoading(visible) {
  const screen = $('#loading-screen');
  if (!screen) return;
  screen.classList.toggle('is-visible', visible);
  screen.setAttribute('aria-hidden', visible ? 'false' : 'true');
  document.body.style.overflow = visible ? 'hidden' : '';
}

function buildDayEntries(dest, days) {
  const entries = dest.daysPlan.slice(0, Math.min(days, dest.daysPlan.length));
  if (days > 5) entries.push(...dest.extensionDays.slice(0, days - 5));
  return entries.slice(0, days);
}

function seriousCopyText(data) {
  const { dest, input, estimate, dates, research } = data;
  const days = buildDayEntries(dest, input.days);
  return [
    `偏航 OFF COURSE｜${dest.name} ${input.days} 天可执行攻略`,
    `${dest.region}｜${dates.label}`,
    `从 ${input.origin} 出发｜${input.days} 天 ${input.days - 1} 晚｜预计人均 ${money(estimate.total)}（${money(estimate.low)}–${money(estimate.high)}）`,
    '',
    `为什么是这里：${dest.quote}`,
    '',
    ...days.map((day, index) => `D${index + 1} ${day.title}\n${day.route}\n上午：${day.morning}\n下午：${day.afternoon}\n晚上：${day.evening}\n提示：${day.tip}`),
    '',
    `怎么去：${dest.access.air} / ${dest.access.rail} / 当地：${dest.access.local}`,
    '',
    `值得体验：${dest.experiences.map((item) => item.title).join('、')}`,
    `避坑：${dest.avoid.map((item) => `${item.from} → ${item.to}`).join('；')}`,
    '',
    research?.reservations?.length
      ? `需要提前订：${research.reservations.map((item) => `${item.title}（${item.timing}，${item.channel}）`).join('；')}`
      : '',
    research?.watchouts?.length ? `出发前复核：${research.watchouts.join('；')}` : '',
    research?.sources?.length
      ? `检索来源：${research.sources.map((source) => `${source.title} ${source.url}`).join('；')}`
      : '',
    '',
    '注意：本攻略由 AI 联网检索并排程生成。票价、班次、天气、预约和开放状态会变化，出发前仍以官方页面为准。'
  ].join('\n');
}

function renderSeriousResult() {
  const data = appState.serious;
  if (!data.dest) return;
  const container = $('#serious-result');
  const days = buildDayEntries(data.dest, data.input.days);
  const copyText = seriousCopyText(data);
  data.copyText = copyText;
  const sectionMarkup = [
    seriousWhyMarkup(data),
    seriousBudgetMarkup(data),
    seriousTransportMarkup(data),
    seriousItineraryMarkup(data, days),
    seriousExperienceMarkup(data),
    seriousAvoidMarkup(data),
    seriousResearchMarkup(data)
  ].join('');

  container.innerHTML = `
    <article class="serious-result" aria-label="${escapeHTML(data.dest.name)}旅行攻略">
      <div class="result-toolbar">
        <button type="button" class="text-back" data-edit-plan>← 修改条件</button>
        <span class="toolbar-code">LIVE-SEARCHED / ${escapeHTML(data.dest.en.slice(0, 3))}-${data.input.days}${pad2(data.input.month)} / OFF COURSE</span>
        <div class="toolbar-actions">
          <button type="button" class="small-action" data-copy-serious>复制摘要</button>
          <button type="button" class="small-action primary" data-print>打印 / 存 PDF ↗</button>
        </div>
      </div>
      ${seriousHeroMarkup(data)}
      ${sectionMarkup}
      ${seriousEndingMarkup(data)}
    </article>
  `;
  bindDestinationPhotos(container);
}

async function loadSeriousPhoto(requestId, destination) {
  if (!destination?.name) return null;
  try {
    const payload = await requestAPI('/api/serious/photo', {
      method: 'POST',
      body: JSON.stringify({
        name: destination.name,
        region: destination.region,
        english: destination.en
      })
    });
    if (requestId !== appState.serious.requestId || !payload?.photo?.src) return null;
    const loaded = await preloadImage(payload.photo.src);
    return loaded ? payload.photo : null;
  } catch {
    return null;
  }
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const timer = setTimeout(() => finish(false), 20_000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = src;
    if (image.complete) finish(image.naturalWidth > 0);
  });
}

function seriousHeroMarkup(data) {
  const { dest, input, estimate, dates, match, research } = data;
  const tags = [...new Set([...input.interests, ...dest.tags])].slice(0, 5);
  return `
    <header class="result-hero">
      <div class="result-hero-copy">
        <p class="result-kicker">LIVE-RESEARCHED GUIDE / MATCH ${escapeHTML(match)}%</p>
        <p class="result-region">${escapeHTML(dest.region)} · ${input.month} 月出发</p>
        <h1>${escapeHTML(dest.name)}</h1>
        <p class="result-en">${escapeHTML(dest.en)}, ${escapeHTML(dest.regionShort)} · ${escapeHTML(dates.short)}</p>
        <p class="result-quote">${escapeHTML(dest.quote)}</p>
        <div class="result-tag-row">${tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div>
      </div>
      <div class="result-art-card" data-photo-shell>
        ${destinationPhotoMarkup(dest.photo, dest.name, 'serious')}
        ${destinationArt(dest)}
      </div>
    </header>
    <div class="result-facts">
      <div><span>行程 / DURATION</span><strong>${input.days} 天 ${input.days - 1} 晚</strong></div>
      <div><span>出发 / ORIGIN</span><strong>${escapeHTML(input.origin)}</strong></div>
      <div><span>人均预算 / TOTAL</span><strong>${money(estimate.total)} 左右</strong></div>
      <div><span>联网核查 / RESEARCH</span><strong>${research?.sources?.length || 0} 个来源 · ${escapeHTML(dates.short)}</strong></div>
    </div>
  `;
}

function seriousWhyMarkup(data) {
  const { dest, input } = data;
  const interestSentence = input.interests.length
    ? `你勾了「${input.interests.join('、')}」，所以我们没有把“最热门”放在第一位，而是优先找能把这件事做深的地方。`
    : '你没有勾选具体偏好。没有偏好本身就是一种偏好：这次先不追标签，去找一个有真实生活、走起来不费劲的地方。';
  const budgetSentence = Number.isFinite(input.budget)
    ? `你的预算是 ${money(input.budget)}，这会决定我们在大交通和住宿之间怎么取舍；行程里的每一段都围绕这条线做过删减。`
    : '你没有设预算，所以这不是一份“穷游攻略”，也不是“奢华套餐”，而是一份按正常舒适度估出来的基线。';
  return `
    <section class="guide-section">
      <aside class="section-rail"><span>01</span><strong>WHY HERE</strong><p>为什么是这里</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>这一次，<br>为什么是${escapeHTML(dest.name)}？</h2>
          <p>不是目的地热度，也不是算法随机。我们把季节、移动成本和你想看的东西放在一起，才把它推到前面。</p>
        </div>
        <div class="why-copy">
          <div class="why-main">
            <p>${escapeHTML(dest.why)}</p>
            <p>${escapeHTML(dest.secondWhy)}${escapeHTML(interestSentence)}${escapeHTML(budgetSentence)}${escapeHTML(dest.extraReason)}</p>
          </div>
          <aside class="why-side">
            <h3>这趟可能不适合你，如果——</h3>
            <ul>${dest.notForYou.map((item, index) => `<li><span>0${index + 1}</span>${escapeHTML(item)}</li>`).join('')}</ul>
          </aside>
        </div>
      </div>
    </section>
  `;
}

function seriousBudgetMarkup(data) {
  const { dest, input, estimate } = data;
  const maxValue = Math.max(...estimate.items.map((item) => item.value));
  const rows = estimate.items.map((item) => `
    <div class="budget-bar-row">
      <span>${item.label}</span>
      <div class="budget-bar"><i style="--bar:${Math.max(5, (item.value / maxValue) * 100).toFixed(1)}%"></i></div>
      <strong>${money(item.value)}</strong>
    </div>
  `).join('');

  let advice;
  if (estimate.status === 'over' || estimate.status === 'tight') {
    advice = dest.saveTips;
  } else if (Number.isFinite(input.budget)) {
    advice = [
      '把余下的钱优先花在讲解和包车上，减少“看不懂”和“赶不上”',
      '留出一晚更好的住宿，或把最后一晚升级成真正能放松的地方',
      '至少留 10% 不动，给天气、临时起意和旺季浮动'
    ];
  } else {
    advice = dest.saveTips.map((tip) => tip.replace('，', '；')).slice(0, 2).concat('先按这份估算出发，出发前再用实时票价复核一次。').slice(0, 3);
  }

  return `
    <section class="guide-section">
      <aside class="section-rail"><span>02</span><strong>THE MONEY</strong><p>先把钱说清</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>先把钱说清楚，<br>再谈浪漫。</h2>
          <p>人均估算，包含往返大交通与 ${estimate.nights} 晚住宿。实际会随出发城市、预订时间和季节浮动，建议保留 10% 余量。</p>
        </div>
        <div class="budget-panel">
          <div>
            <span class="budget-total-label">预计人均总花费 / PER PERSON</span>
            <div class="budget-total">${money(estimate.total)}</div>
            <span class="budget-range">合理浮动 ${money(estimate.low)} – ${money(estimate.high)}${Number.isFinite(input.budget) ? ` · 你的预算 ${money(input.budget)}` : ' · 未设预算'}</span>
            <span class="budget-status ${estimate.status}">${estimate.statusText}</span>
            <p class="budget-note">${estimate.note}</p>
          </div>
          <div class="budget-bars">${rows}</div>
        </div>
        <div class="budget-advice">
          ${advice.map((tip, index) => `<article><span>${estimate.status === 'over' || estimate.status === 'tight' ? '省一点' : '花得值'} / 0${index + 1}</span><p>${escapeHTML(tip)}</p></article>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function seriousTransportMarkup(data) {
  const { dest, input, dates } = data;
  const withOrigin = (text) => escapeHTML(text).replace('{origin}', escapeHTML(input.origin));
  return `
    <section class="guide-section">
      <aside class="section-rail"><span>03</span><strong>GET THERE</strong><p>怎么去，何时去</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>把赶路，<br>变成旅行的前言。</h2>
          <p>大交通一定要以实时班次和票价为准。这里给的是路径选择，不是替航司和 12306 拍板。</p>
        </div>
        <div class="split-info">
          <div class="info-card">
            <div class="info-label"><span>HOW TO GET THERE</span><span>从 ${escapeHTML(input.origin)} 出发</span></div>
            <div class="access-list">
              <div class="access-row"><span>飞机</span><p>${withOrigin(dest.access.air)}<small>提前 3–4 周比价通常更稳；中转别只看总价，也算上等待时间。</small></p></div>
              <div class="access-row"><span>铁路</span><p>${withOrigin(dest.access.rail)}<small>大交通预算已按 ${money((dest.transportRange[0] + dest.transportRange[1]) / 2)} 的中位值预留。</small></p></div>
              <div class="access-row"><span>当地</span><p>${escapeHTML(dest.access.local)}<small>包车先谈清等候时长和是否含停车费，不要只问“一天多少钱”。</small></p></div>
            </div>
          </div>
          <div class="info-card">
            <div class="info-label"><span>WHEN TO GO</span><span>建议窗口</span></div>
            <div class="when-date">${escapeHTML(dates.label)}</div>
            <p class="when-note">${escapeHTML(dest.seasonNote)}</p>
            <div class="weather-line"><b>${input.month} 月</b><div>${escapeHTML(dest.weather)}</div></div>
            <div class="weather-line"><b>节流</b><div>避开周末和节假日首尾，通常能同时省掉排队时间与一部分住宿溢价。</div></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function seriousItineraryMarkup(data, days) {
  return `
    <section class="guide-section">
      <aside class="section-rail"><span>04</span><strong>DAY BY DAY</strong><p>每天怎么走</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>${data.input.days} 天，<br>只解决 ${data.input.days} 件事。</h2>
          <p>上午用来看真正值得早起的东西，下午留给路和意外。每天的“晚间”不是任务，可以随时改成回酒店躺着。</p>
        </div>
        <div class="day-list">
          ${days.map((day, index) => `
            <article class="day-card">
              <div class="day-index"><strong>${pad2(index + 1)}</strong><span>DAY / ${pad2(index + 1)}</span></div>
              <div class="day-content">
                <div class="day-heading"><h3>${escapeHTML(day.title)}</h3><span>${escapeHTML(day.route)}</span></div>
                <div class="day-timeline">
                  <div class="day-time"><span>MORNING / 上午</span><p>${escapeHTML(day.morning)}</p></div>
                  <div class="day-time"><span>AFTERNOON / 下午</span><p>${escapeHTML(day.afternoon)}</p></div>
                  <div class="day-time"><span>EVENING / 晚上</span><p>${escapeHTML(day.evening)}</p></div>
                </div>
                <p class="day-tip">${escapeHTML(day.tip)}</p>
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function seriousExperienceMarkup(data) {
  const dest = data.dest;
  return `
    <section class="guide-section">
      <aside class="section-rail"><span>05</span><strong>WORTH IT</strong><p>值得体验</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>值得花掉的<br>不是钱，是时间。</h2>
          <p>如果只能做四件事，就做这四件。它们不是“必打卡”，而是能把 ${escapeHTML(dest.name)} 从地名变成记忆的部分。</p>
        </div>
        <div class="experience-grid">
          ${dest.experiences.map((item, index) => `
            <article class="experience-card">
              <span>EXPERIENCE / 0${index + 1}</span>
              <h3>${escapeHTML(item.title)}</h3>
              <p>${escapeHTML(item.text)}</p>
            </article>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function seriousAvoidMarkup(data) {
  const dest = data.dest;
  return `
    <section class="guide-section">
      <aside class="section-rail"><span>06</span><strong>GO AROUND</strong><p>绕开人群</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>别把时间，<br>交给队伍。</h2>
          <p>下面不是“网红点原罪论”。只是同样一片地方，换个时间和入口，体验会完全不同。</p>
        </div>
        <div class="avoid-list">
          ${dest.avoid.map((item) => `
            <div class="avoid-row">
              <div class="avoid-from"><small>常见走法 / CROWDED</small><p>${escapeHTML(item.from)}</p></div>
              <div class="avoid-arrow">→</div>
              <div class="avoid-to"><small>偏航建议 / OFF COURSE</small><p>${escapeHTML(item.to)}</p></div>
            </div>
          `).join('')}
        </div>
        <p class="local-title">LOCAL NOTES / 当地人的小提醒</p>
        <ul class="local-list">${dest.locals.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
      </div>
    </section>
  `;
}

function seriousResearchMarkup(data) {
  const research = data.research;
  if (!research) return '';
  const sources = Array.isArray(research.sources) ? research.sources : [];
  const queries = Array.isArray(research.queries) ? research.queries : [];
  const reservations = Array.isArray(research.reservations) ? research.reservations : [];
  const watchouts = Array.isArray(research.watchouts) ? research.watchouts : [];
  const checkedAt = formatResearchTime(research.checkedAt);

  return `
    <section class="guide-section research-section">
      <aside class="section-rail"><span>07</span><strong>LIVE CHECK</strong><p>出发前核验</p></aside>
      <div class="section-body">
        <div class="section-title-row">
          <h2>最后这一步，<br>别交给运气。</h2>
          <p>下面是 AI 本轮检索过的范围、需要提前预订的项目和原始来源。网页会变化，出发前仍要从官方入口复核。</p>
        </div>
        <div class="research-grid">
          <div class="info-card research-card">
            <div class="info-label"><span>WHAT WAS CHECKED</span><span>${escapeHTML(checkedAt)}</span></div>
            <p class="research-summary">${escapeHTML(research.summary || '已完成联网检索。')}</p>
            ${queries.length ? `<ul class="search-query-list">${queries.map((query) => `<li>${escapeHTML(query)}</li>`).join('')}</ul>` : ''}
          </div>
          <div class="info-card research-card">
            <div class="info-label"><span>BOOK AHEAD</span><span>需要提前订</span></div>
            <div class="reservation-list">
              ${reservations.map((item, index) => `
                <article>
                  <span>${pad2(index + 1)} / ${escapeHTML(item.timing)}</span>
                  <h3>${escapeHTML(item.title)}</h3>
                  <p>${escapeHTML(item.channel)}</p>
                  <small>${escapeHTML(item.note)}</small>
                </article>
              `).join('')}
            </div>
          </div>
        </div>
        <p class="local-title">WATCH OUT / 出发前务必复核</p>
        <ul class="local-list">${watchouts.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>
        <p class="local-title">SOURCES / 本轮检索来源</p>
        ${sources.length
          ? `<ol class="source-list">${sources.map((source) => `
              <li>
                <a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.title)}</a>
                <span>${escapeHTML(source.site || '')}${source.publishedAt && /^20\d{2}-/.test(source.publishedAt) ? ` · ${escapeHTML(source.publishedAt.slice(0, 10))}` : ''}</span>
              </li>`).join('')}</ol>`
          : '<p class="research-empty">本轮未能提取来源标题，但行程生成前已执行联网检索。请按文中机构名再次核对。</p>'}
        <p class="research-footnote">检索时间：${escapeHTML(checkedAt)}。来源由联网搜索返回，AI 可能误读网页；票价、班次、开放与预约状态以官方页面为准。</p>
      </div>
    </section>
  `;
}

function formatResearchTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function seriousEndingMarkup(data) {
  return `
    <div class="result-ending">
      <p>“把这份攻略拿去用，<br>但记得把某个下午留空。”</p>
      <div class="ending-actions">
        <button type="button" class="outline-button" data-edit-plan>重新调整 <span>↺</span></button>
        <button type="button" class="outline-button" data-open-mode="casual">换一次离谱的 <span>✦</span></button>
        <button type="button" class="solid-button" data-copy-serious>复制这份行程 <span>↗</span></button>
      </div>
    </div>
  `;
}

/* =========================================================
   AI casual flow
   ========================================================= */
let casualThinkingTimer = null;

function showCasualPanel(name) {
  const panels = {
    intro: $('#casual-intro'),
    quiz: $('#quiz-shell'),
    thinking: $('#thinking-shell'),
    error: $('#casual-error-shell'),
    result: $('#casual-result')
  };
  Object.entries(panels).forEach(([key, element]) => {
    if (element) element.hidden = key !== name;
  });
}

function stopThinkingLabels() {
  clearInterval(casualThinkingTimer);
  casualThinkingTimer = null;
}

function showCasualThinking(labels) {
  showCasualPanel('thinking');
  let index = 0;
  $('#thinking-label').textContent = labels[0];
  stopThinkingLabels();
  casualThinkingTimer = setInterval(() => {
    index = (index + 1) % labels.length;
    $('#thinking-label').textContent = labels[index];
  }, 1500);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function setMBTIError(message) {
  const form = $('#casual-mbti-form');
  const field = $('#casual-mbti');
  const error = $('#casual-mbti-error');
  if (form) form.classList.toggle('has-error', Boolean(message));
  if (field) field.classList.toggle('is-invalid', Boolean(message));
  if (error) error.textContent = message || '';
}

function addAvoidDestination(report) {
  const name = report?.destination?.name;
  if (!name) return;
  const next = [name, ...appState.casual.avoidDestinations.filter((item) => item !== name)];
  appState.casual.avoidDestinations = next.slice(0, 6);
}

async function loadAIQuestion() {
  if (appState.casual.loading) return;
  const budget = parseCasualBudget();
  if (budget.error) {
    showToast(budget.error);
    $('#casual-budget')?.focus();
    return;
  }

  appState.casual.budget = budget.value;
  appState.casual.mode = 'question';
  appState.casual.loading = true;
  appState.casual.lastAction = { type: 'question' };
  appState.casual.answer = null;
  const requestId = appState.casual.requestId + 1;
  appState.casual.requestId = requestId;

  showCasualPanel('quiz');
  $('#quiz-content').hidden = true;
  $('#quiz-loading').hidden = false;
  $('#regenerate-question').hidden = true;
  const loadingTitles = [
    '正在翻一本很旧的地图……',
    '正在把问题写得不像心理测试……',
    '正在给选项加一点不必要的戏剧性……'
  ];
  $('#quiz-loading-title').textContent = loadingTitles[0];
  let loadingIndex = 0;
  const loadingTimer = setInterval(() => {
    loadingIndex = (loadingIndex + 1) % loadingTitles.length;
    $('#quiz-loading-title').textContent = loadingTitles[loadingIndex];
  }, 1500);
  window.scrollTo({ top: 0, behavior: 'auto' });

  try {
    const question = sanitizeCasualValue(await requestAPIWithRetry('/api/casual/question', {
      method: 'POST',
      body: '{}'
    }, {
      attempts: 2,
      onRetry: () => {
        const title = $('#quiz-loading-title');
        if (title) title.textContent = '刚才的信号断了，正在重新接通……';
      }
    }));
    if (appState.casual.requestId !== requestId) return;
    appState.casual.question = question;
    appState.casual.answer = null;
    renderAIQuestion(question);
  } catch (error) {
    if (appState.casual.requestId !== requestId) return;
    showCasualError(error);
  } finally {
    clearInterval(loadingTimer);
    if (appState.casual.requestId === requestId) appState.casual.loading = false;
  }
}

function renderAIQuestion(question) {
  $('#quiz-kicker').textContent = question.kicker || '临时问卷';
  $('#quiz-question').textContent = question.question || '问题在风中丢失了。';
  $('#quiz-options').innerHTML = (question.options || []).map((option, index) => `
    <button type="button" class="quiz-option" data-answer-index="${index}">
      <span class="option-key">${String.fromCharCode(65 + index)}</span>
      <span><span class="option-title">${escapeHTML(option.text)}</span><span class="option-sub">${escapeHTML(option.hint)}</span></span>
    </button>
  `).join('');
  $$('.quiz-option').forEach((button) => {
    button.addEventListener('click', () => answerAIQuestion(button, Number(button.dataset.answerIndex)), { once: true });
  });
  $('#quiz-content').hidden = false;
  $('#quiz-loading').hidden = true;
  $('#regenerate-question').hidden = false;
  setTimeout(() => $('#quiz-question')?.focus({ preventScroll: true }), 60);
}

function answerAIQuestion(button, optionIndex) {
  const question = appState.casual.question;
  const option = question?.options?.[optionIndex];
  if (!option || appState.casual.loading) return;
  button.classList.add('is-selected');
  $$('.quiz-option').forEach((item) => { item.disabled = true; });
  appState.casual.answer = { text: option.text, hint: option.hint };
  setTimeout(() => {
    generateCasualReport({
      mode: 'question',
      question: question.question,
      answer: option.text,
      answerHint: option.hint,
      budget: appState.casual.budget
    });
  }, 280);
}

function submitCasualMBTI(event) {
  event?.preventDefault();
  if (appState.casual.loading) return;
  const input = $('#casual-mbti');
  const mbti = normalizeMBTI(input?.value);
  if (!MBTI_TYPES.includes(mbti)) {
    setMBTIError('请输入正确的四位 MBTI，例如 INTJ、ENFP。');
    input?.focus();
    return;
  }
  const budget = parseCasualBudget();
  if (budget.error) {
    showToast(budget.error);
    $('#casual-budget')?.focus();
    return;
  }
  setMBTIError('');
  input.value = mbti;
  appState.casual.mode = 'mbti';
  appState.casual.mbti = mbti;
  appState.casual.budget = budget.value;
  generateCasualReport({ mode: 'mbti', mbti, budget: budget.value });
}

async function generateCasualReport(payload) {
  if (appState.casual.loading) return;
  appState.casual.loading = true;
  appState.casual.lastAction = { type: 'recommend', payload };
  const requestId = appState.casual.requestId + 1;
  appState.casual.requestId = requestId;
  const isMBTI = payload.mode === 'mbti';
  showCasualThinking(isMBTI ? [
    '正在把四个字母换算成经纬度……',
    '正在排除你一定会想到的地方……',
    '正在给胡说八道补上地图和菜单……',
    '正在让预算看起来像命运的一部分……'
  ] : [
    '正在从你的回答里打捞一个目的地……',
    '正在把随口一说升格为决定性证据……',
    '正在检查那里是否真的能吃饭、坐车和走路……',
    '正在写一篇比行程还长的理由……'
  ]);

  try {
    const report = sanitizeCasualValue(await requestAPIWithRetry('/api/casual/recommend', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        avoidDestinations: appState.casual.avoidDestinations
      })
    }, {
      attempts: 2,
      onRetry: () => showCasualThinking(['刚才的连接断了，正在重新拨通值班室……'])
    }));
    if (appState.casual.requestId !== requestId) return;
    appState.casual.report = report;
    appState.casual.budget = report.input?.budget ?? payload.budget ?? null;
    addAvoidDestination(report);
    stopThinkingLabels();
    renderCasualResult(report, payload);
    showCasualPanel('result');
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (error) {
    if (appState.casual.requestId !== requestId) return;
    stopThinkingLabels();
    showCasualError(error);
  } finally {
    if (appState.casual.requestId === requestId) appState.casual.loading = false;
  }
}

function showCasualError(error) {
  stopThinkingLabels();
  appState.casual.loading = false;
  const status = Number(error?.status);
  const statusMessages = {
    401: '值班室的钥匙不对，这扇门暂时打不开。请先检查本机服务配置。',
    403: '这张纸条不是从本站递进来的，值班室没有接收。',
    429: '今晚问得太密了，让接线员喝口水，过一会儿再来。',
    503: '值班室的钥匙还没配好。请先在 .env 中补齐服务密钥，再来抽一次。',
    504: '远方这次回话太慢，签筒还没倒出来。再敲一次门。'
  };
  const message = statusMessages[status] || sanitizeCasualValue(error?.message || '远方的线路刚刚断了一下。');
  $('#casual-error-message').textContent = `${message} 这不代表你的旅行品味有问题，只代表这次请求没有接通。`;
  showCasualPanel('error');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function retryCasual() {
  const action = appState.casual.lastAction;
  if (!action) {
    showCasualPanel('intro');
    return;
  }
  if (action.type === 'question') {
    appState.casual.loading = false;
    loadAIQuestion();
    return;
  }
  if (action.type === 'recommend') {
    appState.casual.loading = false;
    generateCasualReport(action.payload);
  }
}

function rerollCasual() {
  const report = appState.casual.report;
  if (!report) return;
  const source = report.input || {};
  appState.casual.loading = false;
  if (source.mode === 'mbti') {
    generateCasualReport({ mode: 'mbti', mbti: appState.casual.mbti, budget: appState.casual.budget });
  } else if (appState.casual.question && appState.casual.answer) {
    generateCasualReport({
      mode: 'question',
      question: appState.casual.question.question,
      answer: appState.casual.answer.text,
      answerHint: appState.casual.answer.hint,
      budget: appState.casual.budget
    });
  }
}

function safePalette(palette) {
  const fallback = {
    sky: '#c4d7d1', sun: '#e7b956', land: '#889d78', ink: '#18312c', accent: '#e85f39'
  };
  const output = { ...fallback };
  Object.keys(fallback).forEach((key) => {
    if (typeof palette?.[key] === 'string' && /^#[0-9a-f]{6}$/i.test(palette[key])) output[key] = palette[key];
  });
  return output;
}

function casualArtMarkup(report) {
  const palette = safePalette(report.palette);
  const english = escapeHTML((report.destination.english || 'OFF COURSE').slice(0, 36));
  return `
    <svg viewBox="0 0 760 560" role="img" aria-label="抽象目的地风景插画">
      <rect width="760" height="560" fill="${palette.sky}"/>
      <circle cx="580" cy="118" r="82" fill="${palette.sun}" opacity=".94"/>
      <path d="M-20 282c84-54 151-20 225-48 78-29 113-88 192-58 64 24 92 70 175 54 60-12 105-58 208-21v351H-20Z" fill="${palette.land}" opacity=".82"/>
      <path d="M-15 364c71-37 143-12 219-37 85-28 115-65 195-36 80 29 113 72 190 47 54-18 91-47 186-17v239H-15Z" fill="${palette.land}"/>
      <path d="M-10 439c103-35 177-7 261-32 93-28 149-52 238-17 64 26 109 37 281 4v166H-10Z" fill="${palette.ink}"/>
      <path d="M30 386c103 10 145 55 223 39 89-18 142-72 227-59 76 12 121 64 249 34" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-dasharray="7 13" opacity=".9"/>
      <circle cx="30" cy="386" r="7" fill="${palette.accent}"/>
      <circle cx="729" cy="400" r="7" fill="${palette.accent}"/>
      <g fill="none" stroke="${palette.ink}" opacity=".48">
        <path d="M44 102h106M44 114h68M44 126h84"/>
        <path d="M52 210l23-39 24 39M622 315l20-34 21 34"/>
      </g>
      <text x="34" y="527" fill="${palette.ink}" font-size="17" letter-spacing="5" opacity=".72">${english}</text>
    </svg>
  `;
}

function renderCasualResult(report, payload) {
  const mode = report.input?.mode || payload?.mode || 'question';
  const destination = report.destination || {};
  const budget = report.budget || {};
  const arrival = report.arrival || {};
  const matchNumber = Number(destination.matchPercent) || 94;
  const match = Number.isInteger(matchNumber) ? String(matchNumber) : matchNumber.toFixed(1);
  const hasEstimate = budget.estimate !== null && budget.estimate !== undefined && budget.estimate !== '' && Number.isFinite(Number(budget.estimate));
  const estimate = hasEstimate ? money(Number(budget.estimate)) : '金额待查';
  const tags = (report.tags || []).length ? report.tags : [destination.region, '值班室钦点', '反网红', '可执行'].filter(Boolean);
  const notes = (report.notes || []).length ? report.notes : ['值班室的判断很自信，但自信不是证据。', '所有价格、签证和交通信息，出发前请再查一遍。'];
  const evidence = report.evidence || [];
  const playbook = report.playbook || [];
  const reasoning = (report.reasoning || []).filter(Boolean);
  const persona = report.persona || '一个被四个字母临时赋予的旅行人格。';
  const userBudget = Number.isFinite(report.input?.budget) ? report.input.budget : payload?.budget;
  const questionAnswer = payload?.answer || appState.casual.answer?.text || '';
  const copyText = casualCopyText(report, payload);
  report.copyText = copyText;
  appState.casual.report = report;

  const typeStrong = mode === 'mbti' ? escapeHTML(payload?.mbti || appState.casual.mbti) : '答';
  const typeEm = mode === 'mbti'
    ? escapeHTML(persona)
    : `你选了：「${escapeHTML(questionAnswer || '一个不方便复述的答案')}」`;

  $('#casual-result').innerHTML = `
    <article class="casual-result">
      <div class="casual-result-topline">
        <button type="button" class="text-back" data-casual-back>← 重新选一个走法</button>
        <span class="toolbar-code">FILE / OC-${pad2(appState.casual.avoidDestinations.length)} · 本报告仅为娱乐性旅行灵感</span>
      </div>

      ${destinationPhotoMarkup(destination.photo, destination.name, 'casual')}

      <header class="casual-reveal">
        <div class="casual-reveal-art" aria-hidden="true">${casualArtMarkup(report)}</div>
        <div class="casual-reveal-top">
          <p class="result-kicker">THE DESK HAS ASSIGNED YOU / 值班室已越权</p>
          <div class="match-stamp"><span>今日匹配度</span><strong>${escapeHTML(match)}</strong><small>%</small></div>
        </div>
        <div class="casual-destination">
          <p class="reveal-over">DESTINATION ASSIGNED / 目的地已写好，不接受申诉</p>
          <h1 class="${(destination.name || '').length >= 4 ? 'name-long' : ''}">${escapeHTML(destination.name || '未命名远方')}</h1>
          <p class="reveal-en">${escapeHTML(destination.english || '')} · ${escapeHTML(destination.region || '地球某处')}${destination.coordinates ? ` · ${escapeHTML(destination.coordinates)}` : ''}</p>
          <p class="reveal-line">${formatRichText(destination.tagline || '不是最方便去的，但很像现在该去的地方。')}</p>
        </div>
        <div class="casual-reveal-bottom">
          <div class="type-card">
            <span>${mode === 'mbti' ? '你输入的 MBTI / 仅供发配' : '触发本次发配的回答'}</span>
            <strong>${typeStrong}</strong>
            <em class="type-card-persona">${typeEm}</em>
          </div>
          <div class="match-tags">${tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div>
          <div class="mini-ticket">
            <span>OPEN TICKET / 无需登机</span>
            <strong>${escapeHTML(arrival.days || '4–6 天')} · ${estimate} 参考</strong>
            <small>${escapeHTML(arrival.bestWindow || '最佳窗口请结合季节与天气复核。')}</small>
          </div>
        </div>
      </header>

      <section class="diagnosis-section">
        <aside class="diagnosis-rail">
          <span>01</span><strong>OVERREAD</strong>
          <small>${escapeHTML(persona)} MBTI 在这里是叙事道具，不是心理诊断。</small>
        </aside>
        <div class="diagnosis-main">
          <div class="diagnosis-title"><h2>偏航的<br>过度解读报告</h2></div>
          <div class="diagnosis-text">
            ${reasoning.map((paragraph) => `<p>${formatRichText(paragraph)}</p>`).join('')}
          </div>
        </div>
        <aside class="diagnosis-notes">
          <span>THE SMALL PRINT / 越权备注</span>
          ${notes.map((note) => `<p>${formatRichText(note)}</p>`).join('')}
          <p class="note-sign">${escapeHTML(report.postscript || '— 系统在你说“随便”时，最兴奋。')}</p>
        </aside>
      </section>

      <section class="evidence-section">
        <div class="evidence-head">
          <h2>${mode === 'mbti' ? '不是巧合，<br>是字母决定的。' : '不是答案，<br>是签筒认的。'}</h2>
          <p>${mode === 'mbti' ? '四个字母先被当成命运，随后又从地图和菜单里补回了三条“证据”。' : '一道题先被当成决定性证词，随后又从地图和菜单里补回了三条“证据”。'} 结论是过度的，地理位置尽量是真的。</p>
        </div>
        <div class="evidence-grid">
          ${evidence.map((item, index) => `
            <article class="evidence-card">
              <span>${escapeHTML(item.label || `证据 0${index + 1}`)}</span>
              <h3>${escapeHTML(item.title || '一条被强行升格的观察')}</h3>
              <p>${escapeHTML(item.text || '')}</p>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="casual-arrival">
        <div class="section-title-row">
          <h2>在开始胡说之前，<br>先把路找对。</h2>
          <p>判断是主观的，路是真的：抵达方式、季节和价格仍值得你复核。</p>
        </div>
        <div class="casual-arrival-grid">
          <article class="arrival-card is-route">
            <span>HOW TO ARRIVE / 抵达方式</span>
            <h3>先到 ${escapeHTML(destination.name || '那里')}</h3>
            <p>${escapeHTML(arrival.route || '以实际航班、铁路和当地交通查询为准。')}</p>
          </article>
          <article class="arrival-card">
            <span>FIRST MOVE / 落地第一件事</span>
            <h3>别急着证明自己来过</h3>
            <p>${escapeHTML(arrival.firstMove || '放下行李，先在附近走一圈，确认哪家店真的有人吃饭。')}</p>
          </article>
          <article class="arrival-card">
            <span>BEST WINDOW / 相对合适的窗口</span>
            <h3>什么时候去</h3>
            <p>${escapeHTML(arrival.bestWindow || '避开当地最拥挤的假期，出发前再查天气与展览时间。')}</p>
          </article>
          <article class="arrival-card">
            <span>TIME / 建议停留</span>
            <h3>${escapeHTML(arrival.days || '4–6 天')}</h3>
            <p>这是一份提案，不是考勤表。每天留半天不安排，值班室才没法继续替你生活。</p>
          </article>
        </div>
      </section>

      <section class="casual-playbook">
        <div class="playbook-head">
          <h2>到了以后，<br>先做这几件事。</h2>
          <span>不用全部完成，完成一件也算赢。</span>
        </div>
        <div class="playbook-grid">
          ${playbook.map((item, index) => `
            <article class="playbook-item">
              <b>0${index + 1}</b>
              <h3>${escapeHTML(item.title || '随便走走')}</h3>
              <p>${escapeHTML(item.text || '')}</p>
            </article>
          `).join('')}
        </div>
      </section>

      <div class="casual-budget-band">
        <div><span class="budget-label">MONEY / 宇宙也知道要花钱</span><h2>${Number.isFinite(userBudget) ? `你给了 ${money(userBudget)}，值班室交了这份账单` : '没有预算，也是一种预算'}</h2></div>
        <div>
          <p>${escapeHTML(budget.verdict || '价格仅为大致参考，机票和住宿会随日期明显浮动。')}</p>
          <p>${escapeHTML(budget.cheaperMove || '把最贵的一晚挪到交通更方便的区域，通常比临时找便宜机票更有效。')}</p>
        </div>
        <strong>${estimate}<small>${escapeHTML(budget.range || '参考 / 人均')}</small></strong>
      </div>

      <div class="casual-ending">
        <p>“这个目的地有效期约 6 小时。<br>6 小时后，你可以重新相信自己的判断。”</p>
        <div class="ending-actions">
          <button type="button" class="outline-button" data-open-mode="serious">还是正经一点 <span>→</span></button>
          <button type="button" class="outline-button" data-copy-casual>复制整份报告 <span>↗</span></button>
          <button type="button" class="outline-button" data-print>打印 / PDF <span>↧</span></button>
          ${mode === 'question' ? '<button type="button" class="outline-button" data-casual-new-question>换一题 <span>✦</span></button>' : ''}
          <button type="button" class="solid-button" data-casual-reroll>${mode === 'mbti' ? '同一人格，再换一地' : '同一答案，再换一地'} <span>↻</span></button>
        </div>
      </div>
    </article>
  `;
  bindDestinationPhotos($('#casual-result'));
}

function casualCopyText(report, payload) {
  const mode = report.input?.mode || payload?.mode;
  const destination = report.destination || {};
  const trigger = mode === 'mbti'
    ? `MBTI：${payload?.mbti || appState.casual.mbti}`
    : `现场怪题：${payload?.question || appState.casual.question?.question || ''}\n我的回答：${payload?.answer || appState.casual.answer?.text || ''}`;
  return [
    `偏航 OFF COURSE｜判词目的地：${destination.name || '未命名远方'}（${destination.english || ''}）`,
    `${trigger}`,
    `${destination.region || ''}${destination.coordinates ? ` · ${destination.coordinates}` : ''}｜匹配度 ${destination.matchPercent || 94}%`,
    '',
    ...(report.reasoning || []),
    '',
    '三条强行升格的证据：',
    ...(report.evidence || []).map((item, index) => `${index + 1}. ${item.title}：${item.text}`),
    '',
    '抵达与第一件事：',
    report.arrival?.route || '',
    report.arrival?.firstMove || '',
    report.arrival?.bestWindow || '',
    `建议停留：${report.arrival?.days || '4–6 天'}`,
    '',
    '预算：',
    `参考人均 ${report.budget?.estimate !== null && report.budget?.estimate !== undefined && Number.isFinite(Number(report.budget.estimate)) ? money(Number(report.budget.estimate)) : '待查'}${report.budget?.range ? `（${report.budget.range}）` : ''}`,
    report.budget?.verdict || '',
    report.budget?.cheaperMove || '',
    '',
    '本报告由偏航夜班编辑硬凑而成，目的地尽量真实，推理纯属娱乐。价格、签证与交通请出发前复核。'
  ].filter((line) => line !== undefined && line !== null).join('\n');
}

/* =========================================================
   Interface events
   ========================================================= */
function setBudgetChips(activeValue) {
  $$('.quick-budgets button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.budget === activeValue);
  });
}

function setupInteractionEvents() {
  document.addEventListener('click', (event) => {
    const homeTrigger = event.target.closest('[data-home]');
    if (homeTrigger) {
      event.preventDefault();
      setView('home');
      return;
    }

    const openTrigger = event.target.closest('[data-open-mode]');
    if (openTrigger) {
      openMode(openTrigger.dataset.openMode);
      return;
    }

    const scrollTrigger = event.target.closest('[data-scroll-choose]');
    if (scrollTrigger) {
      if (appState.activeView !== 'home') setView('home');
      setTimeout(() => $('#choose')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
      return;
    }

    const methodLink = event.target.closest('a[href="#method"]');
    if (methodLink) {
      event.preventDefault();
      if (appState.activeView !== 'home') setView('home');
      setTimeout(() => $('#method')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }

    const featuredTrigger = event.target.closest('[data-feature-dest]');
    if (featuredTrigger) {
      const dest = seriousDestinations.find((item) => item.id === featuredTrigger.dataset.featureDest);
      if (!dest) return;
      openMode('serious');
      $('#destination').value = dest.name;
      const desiredInterests = dest.interests.slice(0, 2);
      $$('input[name="interests"]').forEach((input) => {
        input.checked = desiredInterests.includes(input.value);
        input.disabled = false;
      });
      showToast(`已把「${dest.name}」填进目的地，补完出发条件就能规划`);
      setTimeout(() => {
        const origin = $('#origin');
        if (!origin.value.trim()) origin.focus({ preventScroll: true });
        else $('#start-date')?.focus({ preventScroll: true });
      }, 150);
      return;
    }

    const editTrigger = event.target.closest('[data-edit-plan]');
    if (editTrigger) {
      resetSeriousView();
      window.scrollTo({ top: 0, behavior: 'auto' });
      setTimeout(() => $('#origin')?.focus({ preventScroll: true }), 120);
      return;
    }

    const printTrigger = event.target.closest('[data-print]');
    if (printTrigger) {
      window.print();
      return;
    }

    const casualBack = event.target.closest('[data-casual-back]');
    if (casualBack) {
      resetCasualView();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    const copySerious = event.target.closest('[data-copy-serious]');
    if (copySerious) {
      const text = appState.serious.copyText;
      if (text) copyText(text, '行程摘要已复制');
      return;
    }

    const copyCasual = event.target.closest('[data-copy-casual]');
    if (copyCasual) {
      const text = appState.casual.report?.copyText;
      if (text) copyText(text, '整份过度解读已复制');
      return;
    }

    const reroll = event.target.closest('[data-casual-reroll]');
    if (reroll) {
      rerollCasual();
      return;
    }

    const newQuestion = event.target.closest('[data-casual-new-question]');
    if (newQuestion) {
      appState.casual.loading = false;
      loadAIQuestion();
    }
  });

  $('#serious-form')?.addEventListener('submit', handleSeriousSubmit);

  $('#origin')?.addEventListener('input', (event) => {
    if (event.target.value.trim()) {
      event.target.closest('.field').classList.remove('has-error');
      $('#origin-error').textContent = '';
    }
  });

  $('#destination')?.addEventListener('input', clearSeriousError);

  $('#start-date')?.addEventListener('input', (event) => {
    if (event.target.value) {
      event.target.closest('.field').classList.remove('has-error');
      $('#start-date-error').textContent = '';
    }
    clearSeriousError();
  });

  $$('.quick-budgets button').forEach((button) => {
    button.addEventListener('click', () => {
      $('#budget').value = button.dataset.budget;
      setBudgetChips(button.dataset.budget);
    });
  });

  $('#budget')?.addEventListener('input', (event) => {
    setBudgetChips(event.target.value);
    clearSeriousError();
  });

  $$('input[name="interests"]').forEach((input) => {
    input.addEventListener('change', () => {
      const checked = $$('input[name="interests"]:checked');
      $$('input[name="interests"]').forEach((item) => {
        item.disabled = checked.length >= 2 && !item.checked;
      });
    });
  });

  $('#casual-mbti-form')?.addEventListener('submit', submitCasualMBTI);
  $('#casual-mbti')?.addEventListener('input', (event) => {
    const normalized = normalizeMBTI(event.target.value);
    if (event.target.value !== normalized) event.target.value = normalized;
    if (!normalized || MBTI_TYPES.includes(normalized)) setMBTIError('');
    $$('.mbti-picks button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mbti === normalized);
    });
  });
  $$('.mbti-picks button').forEach((button) => {
    button.addEventListener('click', () => {
      const field = $('#casual-mbti');
      if (field) field.value = button.dataset.mbti;
      $$('.mbti-picks button').forEach((item) => item.classList.toggle('is-active', item === button));
      setMBTIError('');
      field?.focus({ preventScroll: true });
    });
  });
  $('#draw-question')?.addEventListener('click', loadAIQuestion);
  $('#regenerate-question')?.addEventListener('click', () => {
    appState.casual.loading = false;
    loadAIQuestion();
  });
  $('#quiz-back')?.addEventListener('click', () => {
    resetCasualView();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  $('#retry-casual')?.addEventListener('click', retryCasual);
  $('#error-back')?.addEventListener('click', () => {
    resetCasualView();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  $('#casual-budget')?.addEventListener('input', () => {
    $('#casual-budget')?.classList.remove('is-invalid');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && appState.activeView !== 'home') {
      setView('home');
    }
  });
}

function init() {
  $('#year').textContent = new Date().getFullYear();
  setupSeriousDate();
  setupSeriousDays();
  renderFeaturedDestinations();
  setupInteractionEvents();
  document.body.dataset.view = 'home';
  checkAIService();
}

init();
