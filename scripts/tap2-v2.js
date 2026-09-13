const WS = "ws://127.0.0.1:9222/devtools/page/FE0CE42A13B854108CCCBC32FEA4EF0D";
const ws = new WebSocket(WS);
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=100) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  await tap(350,23,100);
  await tap(350,23,100);
  console.log('double tap done');
  await new Promise(r=>setTimeout(r,800));
  const r = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=card-item]').length",returnByValue:true});
  console.log('cards during reload:', r.result.value);
  ws.close(); process.exit(0);
};
