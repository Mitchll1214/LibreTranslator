/**
 * Cloudflare Pages Function — /api/translate
 *
 * 同域代理：把前端的翻译请求转发到 DeepLx API。
 *
 * 安全模型：
 *  - DeepLx 的 API key 只存在于服务端环境变量 DEEPLX_API_URL 中，
 *    浏览器永远只请求本站 /api/translate，看不到 key。
 *  - 可选 DEEPLX_ACCESS_PASSWORD：配置后，来自前端的请求必须带上
 *    匹配的密码（X-Auth-Password 头），否则返回 401。这是防止有人
 *    发现 /api/translate 后盗用你 key 额度的主动防御。
 *
 * 服务端环境变量（CF Pages → Settings → Environment variables 配置。
 * 注意：不要用 REACT_APP_ 开头——那只会在构建时内联进前端 bundle，
 * 导致 key / 密码暴露）：
 *
 *   DEEPLX_API_URL（必填）— 完整 translate 端点或根地址均可：
 *       示例: https://api.deeplx.org/<your-key>/translate
 *       示例: https://api.deeplx.org/<your-key>
 *   DEEPLX_API_TOKEN（可选）— 自建 deeplx 需要 token 鉴权时填写
 *   DEEPLX_ACCESS_PASSWORD（可选）— 前端访问密码，与页面密码一致
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    // 1) 服务端环境变量校验
    const apiBase = env.DEEPLX_API_URL || env.REACT_APP_DEEPLX_API_URL;
    if (!apiBase) {
        return new Response(
            JSON.stringify({ code: 500, message: 'Server DEEPLX_API_URL is not configured.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 2) 可选访问密码校验（防滥用）
    const accessPassword = env.DEEPLX_ACCESS_PASSWORD;
    if (accessPassword) {
        const provided = request.headers.get('X-Auth-Password') || '';
        if (provided !== accessPassword) {
            return new Response(
                JSON.stringify({ code: 401, message: 'Unauthorized.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    // 3) 转发体：透传前端 JSON body（含 text / target_lang / source_lang）
    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return new Response(
            JSON.stringify({ code: 400, message: 'Invalid JSON body.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 4) 构造上游 URL：兼容「已含 /translate」与「不含」两种配置
    const base = apiBase.replace(/\/+$/, '');   // 去掉结尾多余的斜杠
    const apiUrl = /\/translate$/i.test(base) ? base : `${base}/translate`;
    const token = env.DEEPLX_API_TOKEN;
    const upstreamUrl = token ? `${apiUrl}?token=${token}` : apiUrl;

    // 5) 转发请求
    let upstream;
    try {
        upstream = await fetch(upstreamUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (e) {
        return new Response(
            JSON.stringify({ code: 502, message: 'Upstream request failed.' }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 6) 原样返回上游 JSON（code / data / detected_language 等字段透传）
    const upstreamText = await upstream.text();
    return new Response(upstreamText, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/* 非 POST 请求返回 405 */
export async function onRequest(context) {
    return new Response(
        JSON.stringify({ code: 405, message: 'Method Not Allowed. Use POST /api/translate.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
}