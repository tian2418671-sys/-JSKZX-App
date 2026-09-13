const ws = new WebSocket("ws://127.0.0.1:9222/devtools/page/8AE0F45228A7B52AEAD9EC49E006C698");
let id = 0;
function send(method, params={}) { return new Promise(r => { const mid = ++id; ws.send(JSON.stringify({id:mid,method,params})); const h = e => { const d = JSON.parse(e.data); if (d.id===mid) { ws.removeEventListener('message',h); r(d.result); }}; ws.addEventListener('message', h); }); }
ws.onopen = async () => {
  const expr = `(() => {
    const input = document.querySelector('.van-field__control');
    if (!input) return 'no input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    return 'cleared';
  })()`;
  const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log('clear:', r.result.value);
  await new Promise(r=>setTimeout(r, 800));
  const r2 = await send('Runtime.evaluate',{expression:"JSON.stringify({cards: document.querySelectorAll('[class*=card-item]').length, searchVal: document.querySelector('.van-field__control')?.value || 'none'})",returnByValue:true});
  console.log('state:', r2.result.value);
  ws.close(); process.exit(0);
};
