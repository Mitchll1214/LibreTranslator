# LibreTranslator

基于 React 的自由翻译工具，部署于 **Cloudflare Pages**，利用 DeepLx API 提供翻译服务。

## 安全架构

```
浏览器 (你的站点 /)
   │  只请求本站 /api/translate，永不接触 API key
   ▼
CF Pages Function (functions/api/translate.js)
   │  服务端读取环境变量 DEEPLX_API_URL（key 藏在服务端）
   ▼
DeepLx API (https://api.deeplx.org/<your-key>/translate)
```

- **API key 永不暴露给浏览器**：前端只调用同域 `/api/translate`，key 仅存在于服务端环境变量，构建产物中不含任何 key。
- **可选的防滥用密码**：配置 `DEEPLX_ACCESS_PASSWORD` 后，任何不带正确 `X-Auth-Password` 头的请求都会被代理拒绝（401），防止他人发现接口后盗用你的 key 额度。

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
| `DEEPLX_API_URL` | ✅ | DeepLx 接口地址。可直接填完整 translate 端点，也可填根地址（函数自动补 `/translate`）:<br>· `https://api.deeplx.org/<your-key>/translate`<br>· `https://api.deeplx.org/<your-key>` |
| `DEEPLX_API_TOKEN` | ❌ | 仅自建 deeplx 需要 token 鉴权时填写 |
| `DEEPLX_ACCESS_PASSWORD` | ❌ | 防滥用访问密码。配置后前端必须携带正确密码才能调用翻译接口（推荐开启） |
| `REACT_APP_PASSWORD` | ❌ | 页面访问密码（可选，页面级门禁；注意它会被内联进前端，仅作弱保护） |

### 推荐的完整配置

| 变量 | 值 |
| --- | --- |
| `DEEPLX_API_URL` | `https://api.deeplx.org/你的key`（或含 `/translate`） |
| `DEEPLX_ACCESS_PASSWORD` | 一个随机强密码，与 `REACT_APP_PASSWORD` 相同 |
| `REACT_APP_PASSWORD` | 同一个随机强密码 |

这样部署后：访问者需要先通过页面密码门禁，之后的翻译请求由代理校验同一密码后才转发到 DeepLx——即使 `/api/translate` 被发现，没有密码也无法盗用。

## 本地开发

```bash
npm install
npm start
```

本地开发时如需真实翻译，可在 `.env` 中临时配置 `REACT_APP_DEEPLX_API_URL`（仅开发用；生产请用服务端环境变量）。

## 说明

- 免费 deeplx 公共端点的 key 可从 [connect.linux.do](https://connect.linux.do/) 获取。
- DeepLx Pro 用户可参考 [DeepLx 文档](https://deeplx.owo.network/endpoints/pro.html) 使用 `/v1` 端点。

## 贡献

欢迎提交 Issue 或 PR。