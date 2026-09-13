const WS = "ws://127.0.0.1:9222/devtools/page/FE0CE42A13B854108CCCBC32FEA4EF0D";
const ws = new WebSocket(WS);
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=60) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
const setInput = (v) => `(() => { const input = document.querySelector('.van-field__control'); if (!input) return 'no input'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(v)}); input.dispatchEvent(new Event('input', {bubbles: true})); return 'ok'; })()`;
ws.onopen = async () => {
  const r0 = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=card-item]').length",returnByValue:true});
  console.log('baseline:', r0.result.value);
  // Phase 1: type + instant switch
  await tap(219, 74, 60);
  await new Promise(r=>setTimeout(r, 300));
  await send('Runtime.evaluate',{expression: setInput('云'),returnByValue:true});
  await tap(155, 792, 60);
  console.log('switched away before debounce');
  await new Promise(r=>setTimeout(r, 1500));
  // Phase 2: switch back
  await tap(100, 792, 60);
  await new Promise(r=>setTimeout(r, 1500));
  const res = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, searchVal: document.querySelector('.van-field__control')?.value || 'none', countText: document.body.innerText.match(/\\d+\\s*张/)?.[0] || 'unknown'})",returnByValue:true});
  console.log('back on library:', res.result.value);
  ws.close(); process.exit(0);
};
