# LibreTranslator

基于 React 的自由翻译工具，部署于 **Cloudflare Pages**，翻译走 **Google 免费翻译接口（gtx）**，无需任何 API key。

## 架构

```
浏览器 (你的站点 /)
   │  只请求本站 /api/translate
   ▼
CF Pages Function (functions/api/translate.js)
   │  服务端转发到 Google 免费端点（解决浏览器跨域）
   ▼
Google Translate (translate.googleapis.com/translate_a/single?client=gtx)
```

- **无需 API key**：Google gtx 是公开免费端点，不暴露任何密钥。
- **接口不暴露**：前端只调用同域 `/api/translate`，上游细节对浏览器完全隐藏。
- **可选防滥用密码**：配置 `DEEPLX_ACCESS_PASSWORD` 后，任何不带正确 `X-Auth-Password` 头的请求都会被代理拒绝（401），防止他人刷你的接口。
- **可自定义端点**：如需切换自建 DeepLX 或其他兼容服务，配置 `DEEPLX_API_URL` 即可（默认 Google gtx）。

> **为什么不用 deprecated 的 api.deeplx.org？** 该公共端点部署在 Cloudflare 后面，会拦截来自其他 Cloudflare 数据中心（Pages Functions）的出站请求（403 挑战页），不可行。Google 基础设施不拦截 CF 出站，且零 key、响应为标准 JSON。

## 功能

- 多语言互译（40+ 语言，自动检测源语言）
- 自动翻译（输入防抖 700ms）与手动翻译（Ctrl+Enter）
- 语音朗读、一键复制、翻译历史（localStorage，最多 50 条）
- 明暗主题自适应（跟随系统）
- 可选访问密码（页面级 + 接口级双重防护）
- 多语言 UI（中文 / English / Deutsch）

## 部署到 Cloudflare Pages

1. **Fork / 推送本仓库到 GitHub**。
2. 登录 [Cloudflare](https://www.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**，选择本仓库。
3. 构建设置：
   - **Framework preset**: Create React App
   - **Build command**: `npm run build`
   - **Build directory**: `build`
4. 在 **Settings → Environment variables** 配置环境变量（见下）。
5. **Save and Deploy**。`functions/` 目录会被 Cloudflare Pages 自动识别为 Pages Functions，无需额外配置。

## 环境变量配置（安全要点）

> ⚠️ **绝不要用 `REACT_APP_` 前缀存放 API key 或密码**——`REACT_APP_` 前缀的变量会在构建时被 CRA 内联进前端 JS bundle，任何访客都能在浏览器源码里看到。必须用下面的非 `REACT_APP_` 名称，它们只存在于服务端。

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPLX_API_URL` | ❌ | **可选**。默认使用 Google 免费翻译端点，无需配置。仅当你想切换自建 DeepLX / 其他兼容服务时填写其地址（含 `/translate` 或不含均可，函数自动补全） |
| `DEEPLX_API_TOKEN` | ❌ | 自定义端点需要 token 鉴权时填写（Google gtx 不需要） |
| `DEEPLX_ACCESS_PASSWORD` | ❌ | 防滥用访问密码。配置后前端必须携带正确密码才能调用翻译接口（推荐开启） |
| `REACT_APP_PASSWORD` | ❌ | 页面访问密码（可选，页面级门禁；注意它会被内联进前端，仅作弱保护） |

### 推荐的完整配置（默认 Google gtx）

| 变量 | 值 |
| --- | --- |
| `DEEPLX_ACCESS_PASSWORD` | 一个随机强密码，与 `REACT_APP_PASSWORD` 相同 |
| `REACT_APP_PASSWORD` | 同一个随机强密码 |

这样部署后：**无需任何翻译 API key**，直接可用 Google 免费翻译；访问者需要先通过页面密码门禁，之后的翻译请求由代理校验同一密码后才转发——即使 `/api/translate` 被发现，没有密码也无法刷接口。

## 本地开发

```bash
npm install
npm start
```

本地开发时，翻译请求同样走 `/api/translate` 代理：本地跑 `wrangler pages dev` 即可（默认 Google 免费翻译，无需配置环境变量；如要自定义端点再配置 `DEEPLX_API_URL`）。

## 说明

- **翻译端点**：默认调用 Google 免费翻译端点 `translate.googleapis.com/translate_a/single?client=gtx`，零 key、无注册、响应为标准 JSON。
- **自定义端点**：如需切换到自建 DeepLX（[OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX)）或其他兼容 `/translate` 契约的服务，配置 `DEEPLX_API_URL` 即可，函数自动兼容「含/不含 `/translate`」与「`?token=`」。
- **语言代码**：前端语言代码（`ZH`/`ZH-HANS`/`ZH-HANT`/`EN-GB`…）与 Google 代码（`zh-CN`/`zh-TW`/`en-GB`…）在代理内自动映射，检测到的源语言会回显到输入框头部。

## 贡献

欢迎提交 Issue 或 PR。