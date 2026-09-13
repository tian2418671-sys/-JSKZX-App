const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
async function tap(x,y,hold=80) { const p={x,y,radiusX:2,radiusY:2,force:1,id:1}; await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]}); await new Promise(r=>setTimeout(r,hold)); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
ws.onopen = async () => {
  // Step 0: confirm baseline (all 3 cards visible)
  const r0 = await send('Runtime.evaluate',{expression:"document.querySelectorAll('[class*=card-item]').length",returnByValue:true});
  console.log('baseline cards:', r0.result.value);

  // Step 1: click search & type
  console.log('Step1: focus search + type');
  await tap(219, 74, 80);
  await new Promise(r=>setTimeout(r, 400));
  await send('Input.insertText', {text: 'TEST_NONEXIST'});
  console.log('typed TEST_NONEXIST');

  // Step 2: IMMEDIATELY switch to worldbooks (< 100ms, before 300ms debounce)
  console.log('Step2: immediate tab switch');
  await tap(155, 792, 80);
  await new Promise(r=>setTimeout(r, 1200));

  // Step 3: switch back to card library
  console.log('Step3: switch back');
  await tap(100, 792, 80);
  await new Promise(r=>setTimeout(r, 1500));

  // Step 4: check state - if BUG-13 NOT fixed, cards = 0 (ghost filtered by TEST_NONEXIST)
  const r1 = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, searchVal: document.querySelector('.van-field__control')?.value || 'none', countText: document.body.innerText.match(/\d+\s*张/)?.[0] || 'unknown'})",returnByValue:true});
  console.log('result:', r1.result.value);

  // Step 5: verify no search text in Vue state by checking visible text
  const r2 = await send('Runtime.evaluate',{expression:"JSON.stringify({visible: [...document.querySelectorAll('[class*=card-item]')].map(e => e.innerText.substring(0,20))})",returnByValue:true});
  console.log('visible cards:', r2.result.value);

  ws.close(); process.exit(0);
};
