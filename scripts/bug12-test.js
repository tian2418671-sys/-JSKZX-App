const WS = "ws://127.0.0.1:9222/devtools/page/FE0CE42A13B854108CCCBC32FEA4EF0D";
const ws = new WebSocket(WS);
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=60) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  console.log('rapid refresh x5');
  for (let i=0;i<5;i++) { await tap(350,23,60); await new Promise(r=>setTimeout(r,60)); }
  console.log('done, wait settle');
  await new Promise(r=>setTimeout(r,2000));
  const cards = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=card-item]').length",returnByValue:true});
  console.log('cards after 5x refresh:', cards.result.value);
  // check worldbooks tab
  await tap(155,792,60);
  await new Promise(r=>setTimeout(r,1200));
  const wb = await send('Runtime.evaluate',{expression:"JSON.stringify({text: document.body.innerText.match(/世界书[^\\n]*/)?.[0] || 'none', empty: document.body.innerText.includes('暂无世界书')})",returnByValue:true});
  console.log('worldbooks page:', wb.result.value);
  // count worldbook items
  const wbc = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=wb-item], [class*=worldbook-item], [class*=book-item]').length",returnByValue:true});
  console.log('worldbook items:', wbc.result.value);
  // back to library
  await tap(100,792,60);
  await new Promise(r=>setTimeout(r,1000));
  ws.close(); process.exit(0);
};
