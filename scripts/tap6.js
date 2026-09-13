const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=80) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  console.log('rapid taps x6 @350,23');
  for (let i=0;i<6;i++) { await tap(350,23,60); await new Promise(r=>setTimeout(r,50)); }
  console.log('done tapping');
  await new Promise(r=>setTimeout(r,1500));
  const r = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, refreshBtns: document.querySelectorAll('.van-icon-replay').length})",returnByValue:true});
  console.log('after rapid taps:', r.result.value);
  ws.close(); process.exit(0);
};
