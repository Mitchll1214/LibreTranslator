/**
 * Cloudflare Pages Function — /api/translate
 *
 * 同域代理：把前端的翻译请求转发到 DeepLx API。
 * 关键点：DeepLx 的 API key 只在服务端由环境变量持有，
 * 浏览器永远只请求本站 /api/translate，看不到 key。
 *
 * 服务端环境变量（在 CF Pages → Settings → Environment variables 配置，
 * 不要以 REACT_APP_ 开头——那只会在构建时内联进前端 bundle、导致 key 暴露）：
 *
 *   DEEPLX_API_URL 或 REACT_APP_DEEPLX_API_URL（二选一，前者优先）
 *     必填。可以直接填完整 translate 端点，也可以填不含 /translate 的
 *     根地址，本函数会自动兼容：
 *       示例 A: https://api.deeplx.org/<your-key>/translate
 *       示例 B: https://api.deeplx.org/<your-key>
 *
 *   DEEPLX_API_TOKEN（可选）——自建 deeplx 需要 token 鉴权时填写。
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    // 1) 服务端环境变量校验（兼容两个变量名）
    const apiBase = env.DEEPLX_API_URL || env.REACT_APP_DEEPLX_API_URL;
    if (!apiBase) {
        return new Response(
            JSON.stringify({
                code: 500,
                message: 'Server DEEPLX_API_URL is not configured.',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 2) 转发体：透传前端 JSON body（含 text / target_lang / source_lang）
    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return new Response(
            JSON.stringify({ code: 400, message: 'Invalid JSON body.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 3) 构造上游 URL：兼容「已含 /translate」与「不含」两种配置
    const base = apiBase.replace(/\/+$/, '');   // 去掉结尾多余的斜杠
    const apiUrl = /\/translate$/i.test(base) ? base : `${base}/translate`;
    const token = env.DEEPLX_API_TOKEN;
    const upstreamUrl = token ? `${apiUrl}?token=${token}` : apiUrl;

    // 4) 转发请求
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

    // 5) 原样返回上游 JSON（code / data / detected_language 等字段透传）
    const upstreamText = await upstream.text();
    return new Response(upstreamText, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/* 非 POST 请求返回 405 */
export async function onRequest(context) {
    return new Response(
        JSON.stringify({
            code: 405,
            message: 'Method Not Allowed. Use POST /api/translate.',
        }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
}