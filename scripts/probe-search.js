const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
ws.onopen = async () => {
  const r = await send('Runtime.evaluate', {expression: `JSON.stringify([...document.querySelectorAll('input, .van-search, [class*=search]')].map(e => { const r = e.getBoundingClientRect(); return {cls: e.className.slice(0,40), tag: e.tagName, x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)}; }))`, returnByValue: true});
  console.log(r.result.value);
  ws.close(); process.exit(0);
};
