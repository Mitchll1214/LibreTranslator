/**
 * Cloudflare Pages Function — /api/translate
 *
 * 同域代理：把前端的翻译请求转发到 Google 免费翻译端点
 * （translate.googleapis.com/translate_a/single?client=gtx），
 * 解决浏览器跨域（CORS）问题，并对前端隐藏上游细节。
 *
 * 端点选择：
 *  - 默认使用 Google gtx 免费公开端点（无需 key、标准 JSON、不拦截 CF 出站）。
 *  - 可选：部署者可通过环境变量 DEEPLX_API_URL 指定自定义端点
 *    （自建 DeepLX / 其他 /translate 兼容服务），此时按 DeepLX 契约
 *    （{code,data}）转发，保持向后兼容。
 *
 * 安全模型：
 *  - 不配置 key：Google gtx 无需 key。若配置了自定义端点需要 token，
 *    由 DEEPLX_API_TOKEN 携带（只存在于服务端）。
 *  - 可选 DEEPLX_ACCESS_PASSWORD：配置后，来自前端的请求必须带上
 *    匹配的密码（X-Auth-Password 头），否则返回 401。
 *
 * 服务端环境变量（CF Pages → Settings → Environment variables 配置。
 * 不要用 REACT_APP_ 开头——会被 CRA 内联进前端 bundle 而暴露）：
 *
 *   DEEPLX_API_URL（可选）— 覆盖默认 Google gtx 端点为自定义端点。
 *       示例: https://deeplx.example.com/translate（含 /translate 或不含均可）
 *   DEEPLX_API_TOKEN（可选）— 自定义端点需要 token 鉴权时填写
 *   DEEPLX_ACCESS_PASSWORD（可选）— 前端访问密码，与页面密码一致
 */

/* 应用语言代码 → Google 语言代码 */
const toGoogleLang = {
    AUTO: 'auto',
    ZH: 'zh-CN', 'ZH-HANS': 'zh-CN', 'ZH-HANT': 'zh-TW',
    EN: 'en', 'EN-GB': 'en-GB', 'EN-US': 'en',
    AR: 'ar', BG: 'bg', CS: 'cs', DA: 'da', DE: 'de', EL: 'el',
    ES: 'es', ET: 'et', FI: 'fi', FR: 'fr', HU: 'hu', ID: 'id',
    IT: 'it', JA: 'ja', KO: 'ko', LT: 'lt', LV: 'lv', NB: 'nb',
    NL: 'nl', PL: 'pl', PT: 'pt', 'PT-BR': 'pt-BR', 'PT-PT': 'pt-PT',
    RO: 'ro', RU: 'ru', SK: 'sk', SL: 'sl', SV: 'sv', TR: 'tr', UK: 'uk',
};

/* Google 语言代码 → 应用语言代码（逆向，用于检测回显） */
const fromGoogleLang = (() => {
    const map = {
        'zh-CN': 'ZH', 'zh-TW': 'ZH-HANT', 'zh': 'ZH',
        'en-GB': 'EN-GB', 'en': 'EN', 'en-US': 'EN-US',
        'pt-BR': 'PT-BR', 'pt-PT': 'PT-PT', 'pt': 'PT',
        nb: 'NB', no: 'NB', de: 'DE', fr: 'FR', es: 'ES', it: 'IT',
        ru: 'RU', ja: 'JA', ko: 'KO', ar: 'AR', pl: 'PL', tr: 'TR',
        nl: 'NL', sv: 'SV', cs: 'CS', da: 'DA', fi: 'FI', hu: 'HU',
        el: 'EL', ro: 'RO', uk: 'UK', bg: 'BG', id: 'ID', et: 'ET',
        lt: 'LT', lv: 'LV', sk: 'SK', sl: 'SL',
    };
    return (g) => map[g] || g || '';
})();

/* 统一 JSON 响应构造 */
function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

/* Google gtx 调用（POST form-encoded，避免长文本撑爆 GET URL） */
async function googleTranslate(payload) {
    const src = toGoogleLang[payload.source_lang] || 'auto';
    const tgt = toGoogleLang[payload.target_lang] || 'zh-CN';
    const q = typeof payload.text === 'string' ? payload.text : String(payload.text || '');

    const body = new URLSearchParams({
        client: 'gtx',
        sl: src,
        tl: tgt,
        dt: 't',
        q,
    });

    const upstream = await fetch(
        'https://translate.googleapis.com/translate_a/single',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
            body,
        }
    );

    const text = await upstream.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('Google endpoint returned non-JSON (status ' + upstream.status + ')');
    }

    // 先检查状态码（429/5xx 即便是 JSON 也是错误），再检查空翻译
    if (!upstream.ok) {
        throw new Error('Google endpoint error (status ' + upstream.status + ')');
    }

    // gtx 响应: [ [ [ "译文", "原文", null, null, 10 ], ... ], null, "detectedLang", ... ]
    const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const translated = segments
        .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
        .join('');
    const detected = Array.isArray(data) && typeof data[2] === 'string' ? data[2] : '';

    if (!translated.trim() && text.trim()) {
        throw new Error('Google endpoint returned empty translation (status ' + upstream.status + ')');
    }

    return {
        code: 200,
        data: translated,
        detected_language: fromGoogleLang(detected),
        raw_detected: detected,
    };
}

/* 自定义端点（DeepLX 契约）调用 */
async function customTranslate(payload, env) {
    const apiBase = env.DEEPLX_API_URL;
    let upstreamUrl;
    try {
        upstreamUrl = new URL(apiBase);
    } catch (e) {
        throw new Error('Invalid DEEPLX_API_URL: ' + (e && e.message ? e.message : String(e)));
    }
    const path = upstreamUrl.pathname.replace(/\/+$/, '');
    upstreamUrl.pathname = path.endsWith('/translate') ? path : path + '/translate';
    if (!upstreamUrl.searchParams.has('token') && env.DEEPLX_API_TOKEN) {
        upstreamUrl.searchParams.set('token', env.DEEPLX_API_TOKEN);
    }

    const body = { text: payload.text, target_lang: payload.target_lang };
    if (payload.source_lang && payload.source_lang !== 'AUTO') {
        body.source_lang = payload.source_lang;
    }

    const upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(
            'Upstream returned non-JSON (status ' + upstream.status + '): ' + text.slice(0, 200)
        );
    }
    if (data.code !== 200) {
        throw new Error('Upstream error: ' + (data.message || ('code ' + data.code)));
    }
    return {
        code: 200,
        data: data.data,
        detected_language: data.detected_language || '',
    };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1) 可选访问密码校验（防滥用）
        const accessPassword = env.DEEPLX_ACCESS_PASSWORD;
        if (accessPassword) {
            const provided = request.headers.get('X-Auth-Password') || '';
            if (provided !== accessPassword) {
                return json({ code: 401, message: 'Unauthorized.' }, 401);
            }
        }

        // 2) 解析前端 payload
        let payload;
        try {
            payload = await request.json();
        } catch (e) {
            return json({ code: 400, message: 'Invalid JSON body.' }, 400);
        }
        if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) {
            return json({ code: 400, message: 'Missing text.' }, 400);
        }

        // 3) 选择端点：配置了 DEEPLX_API_URL → 自定义；否则 Google gtx
        let result;
        if (env.DEEPLX_API_URL) {
            result = await customTranslate(payload, env);
        } else {
            result = await googleTranslate(payload);
        }

        // 4) 返回统一契约 {code:200, data, detected_language}
        return json(result);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.error('translate proxy error:', msg);
        return json({ code: 500, message: msg }, 500);
    }
}

/* 非 POST 请求返回 405 */
export async function onRequest(context) {
    return json(
        { code: 405, message: 'Method Not Allowed. Use POST /api/translate.' },
        405
    );
}