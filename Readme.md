# LibreTranslator

基于 React 的自由翻译工具，部署于 **Cloudflare Pages**，利用**自建 DeepLX 服务**提供翻译。

## 安全架构

```
浏览器 (你的站点 /)
   │  只请求本站 /api/translate，永不接触 API key
   ▼
CF Pages Function (functions/api/translate.js)
   │  服务端读取环境变量 DEEPLX_API_URL（key 藏在服务端）
   ▼
自建 DeepLX 服务 (https://deeplx.example.com/translate 或局域网 http://ip:1188/translate)
```

- **API key 永不暴露给浏览器**：前端只调用同域 `/api/translate`，key / token 仅存在于服务端环境变量，构建产物中不含任何 key。
- **可选的防滥用密码**：配置 `DEEPLX_ACCESS_PASSWORD` 后，任何不带正确 `X-Auth-Password` 头的请求都会被代理拒绝（401），防止他人发现接口后盗用你的额度。

> **为什么自建？** `api.deeplx.org` 公共端点本身部署在 Cloudflare 后面，会拦截来自其他 Cloudflare 数据中心（Workers / Pages Functions）的出站请求（返回 403 挑战页），所以"CF 服务端转发到 api.deeplx.org"不可行。自建 DeepLX 后，你的站点直连你自己的服务，不再有这层拦截，key 也完全私有。

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
| `DEEPLX_API_URL` | ✅ | 你的自建 DeepLX 地址。可直接填完整 translate 端点，也可填根地址（函数自动补 `/translate`）:<br>· `https://deeplx.example.com/translate`（或加 `?token=xxx`）<br>· `https://deeplx.example.com`<br>· `http://192.168.1.10:1188/translate`（局域网自建，非 https 也可） |
| `DEEPLX_API_TOKEN` | ❌ | 自建 DeepLX 需要 token 鉴权时填写 |
| `DEEPLX_ACCESS_PASSWORD` | ❌ | 防滥用访问密码。配置后前端必须携带正确密码才能调用翻译接口（推荐开启） |
| `REACT_APP_PASSWORD` | ❌ | 页面访问密码（可选，页面级门禁；注意它会被内联进前端，仅作弱保护） |

### 推荐的完整配置

| 变量 | 值 |
| --- | --- |
| `DEEPLX_API_URL` | `https://deeplx.example.com/translate`（你的自建地址） |
| `DEEPLX_ACCESS_PASSWORD` | 一个随机强密码，与 `REACT_APP_PASSWORD` 相同 |
| `REACT_APP_PASSWORD` | 同一个随机强密码 |

这样部署后：访问者需要先通过页面密码门禁，之后的翻译请求由代理校验同一密码后才转发到你的 DeepLX——即使 `/api/translate` 被发现，没有密码也无法盗用。

## 本地开发

```bash
npm install
npm start
```

本地开发时，翻译请求同样走 `/api/translate` 代理：本地跑 `wrangler pages dev` 或部署后在 CF 控制台配置 `DEEPLX_API_URL`（不要用 `REACT_APP_` 前缀，见上）。

## 说明

- **自建 DeepLX**：参考 [OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX) 在自有服务器 / VPS 上部署 DeepLX 服务，默认端口 `1188`。DeepL 的 API key 由你的 DeepLX 服务持有，不会出现在本项目的任何代码或构建产物中。
- DeepL 官方 API key 可从 [DeepL API](https://www.deepl.com/pro-api) 获取（需要绑卡，DeepLX 免费版对高频有速率限制）。

## 贡献

欢迎提交 Issue 或 PR。