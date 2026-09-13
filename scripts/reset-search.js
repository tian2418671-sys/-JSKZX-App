const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=80) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  // Go to card library tab first
  await tap(100, 792, 80);
  await new Promise(r=>setTimeout(r, 800));
  // Focus search, select all + delete via keyboard
  await tap(219, 74, 80);
  await new Promise(r=>setTimeout(r, 400));
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Control', code:'ControlLeft', modifiers:2});
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'a', code:'KeyA', modifiers:2});
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'a', code:'KeyA', modifiers:2});
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Control', code:'ControlLeft', modifiers:2});
  await new Promise(r=>setTimeout(r, 200));
  await send('Input.dispatchKeyEvent', {type:'keyDown', key:'Backspace', code:'Backspace'});
  await send('Input.dispatchKeyEvent', {type:'keyUp', key:'Backspace', code:'Backspace'});
  await new Promise(r=>setTimeout(r, 1000));
  const r1 = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, searchVal: document.querySelector('.van-field__control')?.value || 'none', countText: document.body.innerText.match(/\d+\s*张/)?.[0] || 'unknown'})",returnByValue:true});
  console.log('after reset:', r1.result.value);
  ws.close(); process.exit(0);
};
