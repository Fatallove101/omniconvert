// CDP 诊断：自动发现页面 → 卸载 Service Worker → 刷新 → 对比标题内容
async function main() {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) {
    console.log('NO_PAGE');
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = {};
  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending[mid] = resolve;
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) {
      pending[m.id](m);
      delete pending[m.id];
    }
  };
  ws.onopen = async () => {
    const ev = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    await sleep(800);
    const before = await ev('document.title + " || " + (document.body ? document.body.innerText.slice(0, 120) : "NO BODY")');
    console.log('PAGE:', JSON.stringify(before.result && before.result.result && before.result.result.value));
    const sw = await ev('navigator.serviceWorker.getRegistrations().then(r => "SW_COUNT:" + r.length)');
    console.log('SW:', JSON.stringify(sw.result && sw.result.result && sw.result.result.value));
    const engine = await ev(
      '(async () => { if (!window.App) return "NO_APP"; try { const u = await window.App.um(); return "ENGINE_OK NCMFile=" + typeof u.NCMFile + " QMC2=" + typeof u.QMC2 + " KuGou=" + typeof u.KuGou; } catch (e) { return "ENGINE_ERR: " + (e.message || e); } })()'
    );
    console.log('ENGINE:', JSON.stringify(engine.result && engine.result.result && engine.result.result.value));
    process.exit(0);
  };
  ws.onerror = () => {
    console.log('WS_ERROR');
    process.exit(1);
  };
}
main();
