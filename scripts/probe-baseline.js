const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/77C71FBEB2ADD697D8E9BFC6387C88E0");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
ws.onopen = async () => {
  const r = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, body: document.body.innerText.substring(0,60)})",returnByValue:true});
  console.log(r.result.value);
  ws.close(); process.exit(0);
};
