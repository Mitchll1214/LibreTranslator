/**
 * Cloudflare Pages Function — /api/translate
 *
 * 同域代理：把前端的翻译请求转发到自建 DeepLX 服务。
 *
 * 安全模型：
 *  - DeepLX 的 API key / token 只存在于服务端环境变量中，
 *    浏览器永远只请求本站 /api/translate，看不到 key。
 *  - 可选 DEEPLX_ACCESS_PASSWORD：配置后，来自前端的请求必须带上
 *    匹配的密码（X-Auth-Password 头），否则返回 401。这是防止有人
 *    发现 /api/translate 后盗用你的 key 额度的主动防御。
 *
 * 服务端环境变量（CF Pages → Settings → Environment variables 配置。
 * 注意：不要用 REACT_APP_ 开头——那只会在构建时内联进前端 bundle，
 * 导致 key / 密码暴露）：
 *
 *   DEEPLX_API_URL（必填）— 自建 DeepLX 的 translate 端点或根地址均可：
 *       示例: https://deeplx.example.com/translate   （带 token 鉴权时加 ?token=xxx）
 *       示例: https://deeplx.example.com
 *       示例: http://192.168.1.10:1188/translate      （局域网自建，非 https 也可）
 *   DEEPLX_API_TOKEN（可选）— 自建 DeepLX 需要 token 鉴权时填写
 *   DEEPLX_ACCESS_PASSWORD（可选）— 前端访问密码，与页面密码一致
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1) 服务端环境变量校验（只认 DEEPLX_API_URL，绝不用
        //    REACT_APP_ 前缀——那会被 CRA 内联进前端 bundle）
        const apiBase = env.DEEPLX_API_URL;
        if (!apiBase) {
            return json({ code: 500, message: 'Server DEEPLX_API_URL is not configured.' }, 500);
        }

        // 2) 可选访问密码校验（防滥用）
        const accessPassword = env.DEEPLX_ACCESS_PASSWORD;
        if (accessPassword) {
            const provided = request.headers.get('X-Auth-Password') || '';
            if (provided !== accessPassword) {
                return json({ code: 401, message: 'Unauthorized.' }, 401);
            }
        }

        // 3) 转发体：透传前端 JSON body（含 text / target_lang / source_lang）
        let payload;
        try {
            payload = await request.json();
        } catch (e) {
            return json({ code: 400, message: 'Invalid JSON body.' }, 400);
        }

        // 4) 构造上游 URL。用 URL 对象统一处理，兼容各种配置：
        //    已含 /translate 或未含、已含 ?token= 或依赖 DEEPLX_API_TOKEN。
        let upstreamUrl;
        try {
            upstreamUrl = new URL(apiBase);
        } catch (e) {
            return json(
                { code: 500, message: 'Invalid DEEPLX_API_URL: ' + (e && e.message ? e.message : String(e)) },
                500
            );
        }
        // 仅当路径不以 /translate 结尾时才补（基于 pathname 判断，query 不影响；
        // 先去掉尾部斜杠，避免 "/translate/" 被误判为未含而重复追加）
        const path = upstreamUrl.pathname.replace(/\/+$/, '');
        if (!path.endsWith('/translate')) {
            upstreamUrl.pathname = path + '/translate';
        } else {
            upstreamUrl.pathname = path;
        }
        // token 单源：URL 自带 query 中的 token 优先，未带则用环境变量补
        if (!upstreamUrl.searchParams.has('token') && env.DEEPLX_API_TOKEN) {
            upstreamUrl.searchParams.set('token', env.DEEPLX_API_TOKEN);
        }

        // 5) 转发请求。带上常规浏览器头，兼容对请求特征较敏感的上游。
        let upstream;
        try {
            upstream = await fetch(upstreamUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
                    'Cache-Control': 'no-cache',
                },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            return json(
                { code: 502, message: 'Upstream request failed: ' + (e && e.message ? e.message : String(e)) },
                502
            );
        }

        // 6) 返回上游响应。无论上游返回什么（JSON / 文本 / 空），
        //    都包装成前端可解析的 JSON，避免前端解析崩溃。
        const upstreamText = await upstream.text();
        // 尝试按 JSON 透传；若上游返回非 JSON（如 HTML 错误页），
        // 转成带 code 的 JSON 并附上响应片段便于诊断
        let upstreamData;
        try {
            upstreamData = JSON.parse(upstreamText);
        } catch (e) {
            return json(
                {
                    code: 502,
                    upstreamStatus: upstream.status,
                    message: 'Upstream returned non-JSON.',
                    snippet: upstreamText.slice(0, 300),
                },
                502
            );
        }
        // 6) 返回上游 JSON（含 code / data / detected_language 等字段透传），
        //    status 原样透传。注意：204/304 等无 body 的响应会在上面
        //    JSON.parse 失败，走 502 包装（行为安全，绝不给前端空 body）。
        return json(upstreamData, upstream.status);
    } catch (e) {
        // 兜底：任何未捕获异常都转成 JSON，前端不会因解析崩溃
        return json(
            { code: 500, message: 'Proxy internal error: ' + (e && e.message ? e.message : String(e)) },
            500
        );
    }
}

/* 统一 JSON 响应构造 */
function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/* 非 POST 请求返回 405 */
export async function onRequest(context) {
    return json(
        { code: 405, message: 'Method Not Allowed. Use POST /api/translate.' },
        405
    );
}