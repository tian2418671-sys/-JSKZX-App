const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=80) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  // Step 1: Click search input
  console.log('Step1: click search');
  await tap(219, 74, 80);
  await new Promise(r=>setTimeout(r, 500));
  // Step 2: Type search term
  console.log('Step2: type search term');
  await send('Input.insertText', {text: '云'});
  await new Promise(r=>setTimeout(r, 1500));
  // Step 3: Check filtered count
  const r1 = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=card-item]').length",returnByValue:true});
  console.log('filtered cards:', r1.result.value);
  // Step 4: Switch to worldbooks tab (x=155, y=792)
  console.log('Step3: switch to worldbooks tab');
  await tap(155, 792, 80);
  await new Promise(r=>setTimeout(r, 1000));
  // Step 5: Switch back to card library
  console.log('Step4: switch back to card library');
  await tap(100, 792, 80);
  await new Promise(r=>setTimeout(r, 1500));
  // Step 6: Check card count - should be 3 (full), NOT filtered
  const r2 = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, searchInput: document.querySelector('.van-field__control')?.value || 'none', bodySnippet: document.body.innerText.substring(0, 120)})",returnByValue:true});
  console.log('after tab switch:', r2.result.value);
  ws.close(); process.exit(0);
};
