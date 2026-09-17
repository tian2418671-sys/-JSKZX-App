// 测卡记忆 v4.1 模拟器测试：本地 Mock Chat API
// 作用：① 让测卡发送全链路成功（写记忆路径生效）；② 记录请求 payload → 验证 <memory> 注入块
import http from 'node:http';
import fs from 'node:fs';

const LOG = 'C:/jskapp/shots/memory-v41/mock-requests.log';

const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
        try {
            fs.appendFileSync(LOG, `\n=== ${new Date().toISOString()} ${req.method} ${req.url} ===\n${body || '(no body)'}\n`);
        } catch (e) { /* 忽略日志失败 */ }
        if (req.url && req.url.includes('/models')) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ data: [{ id: 'mock-model', object: 'model' }] }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            id: 'mock-1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'mock-model',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: '「知道了。」他低声应道。（本地模拟回复）' },
                finish_reason: 'stop'
            }]
        }));
    });
});

srv.listen(18080, '0.0.0.0', () => console.log('[mock] listening on 0.0.0.0:18080, log=' + LOG));
