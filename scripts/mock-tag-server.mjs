/**
 * 本地 Mock OpenAI 兼容服务（模拟器实测用）
 * - POST /v1/chat/completions：按请求内容判定单卡 / 打包，返回对应格式
 * - 延迟 1200ms，便于测试「停止」按钮
 * 用法：node scripts/mock-tag-server.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] || 18080);
let seq = 0;

const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(404).end('not found');
        return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(body); } catch (e) { /* ignore */ }
        const text = (payload.messages || []).map((m) => m.content || '').join('\n');
        seq++;
        console.log(`[mock #${seq}] 请求长度 ${text.length} 字 · 打包=${/一次为以下\s*(\d+)\s*张/.test(text) ? '是' : '否'}`);

        let content;
        const packMatch = text.match(/一次为以下\s*(\d+)\s*张/);
        if (packMatch) {
            const n = Number(packMatch[1]);
            const obj = {};
            for (let i = 1; i <= n; i++) obj[String(i)] = [`打包标签${i}A`, `打包标签${i}B`];
            content = `<tags>${JSON.stringify(obj)}</tags>`;
        } else {
            content = '<tags>["模拟标签甲","模拟标签乙"]</tags>';
        }

        setTimeout(() => {
            const out = {
                id: `mock-${seq}`,
                object: 'chat.completion',
                model: payload.model || 'mock-model',
                choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
        }, 1200);
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`mock tag server listening on http://0.0.0.0:${port}`);
});
