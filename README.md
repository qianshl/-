# 偏航 OFF COURSE

一个不依赖框架的中文旅行网站。严肃版通过 Agent Plan 的 Responses API 和联网搜索生成可执行攻略，支持自定义天数与可选预算；随意版通过 MBTI 或现场怪题生成目的地和长篇“过度解读报告”，前台统一包装成偏航值班室的判词。

## 启动（火山方舟 Agent Plan 企业版）

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填入 Agent Plan 企业版的**专属** Key（注意：它和普通方舟 API Key 不同）。Base URL 使用 `https://ark.cn-beijing.volces.com/api/plan/v3`，模型可先用 `ark-code-latest`，或填控制台提供的具体 Model Name。
3. 启动：

   ```bash
   node server.mjs
   ```

4. 打开 `http://127.0.0.1:8787/`。

密钥只在 Node 服务端读取，不会进入网页源码。`.env.example` 也保留了 OpenAI 与其他 OpenAI 兼容接口的配置写法。严肃版需要 Responses API 与 Web Search；随意版需要兼容 Chat Completions 的 JSON 输出。严肃版会把检索合并为 3–4 轮并默认关闭深度思考，通常可在约 40–60 秒内返回；联网搜索可能另行计费。

目的地生成后，服务端会用同一把 Agent Plan Key 调用方舟图片搜索，挑选一张横版实拍风景图，再通过本站的 `/api/destination-image` 代理展示。浏览器会在加载页预先下载图片，确认图已就绪后才显示攻略，避免页面突然换图；检索或加载失败时会自动退回原有插画。服务器需要能访问 `open.feedcoopapi.com` 和 `*.byteimg.com`；如图片搜索地址有变化，可在 `.env` 中用 `IMAGE_SEARCH_URL` 覆盖。

> 直接双击 `outputs/index.html` 只能浏览静态页面；规划、随机出题和生成报告都必须通过本地 Node 服务访问。
