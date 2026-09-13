// CDP 复现自愈流程：删掉三个函数 → 按页面同款逻辑自愈 → 每步报告
async function main() {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = {};
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) {
      pend[m.id](m);
      delete pend[m.id];
    }
  };
  await new Promise((r) => ws.onopen = r);
  const ev = (expr) => new Promise((resolve) => {
    const i = ++id;
    pend[i] = resolve;
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });

  const script = `(async () => {
    const out = [];
    out.push('before: md5=' + typeof App.md5 + ' aes=' + typeof App.aesCbcDecryptNoPad + ' db=' + typeof App.decryptKggDb);
    delete App.decryptKggDb; delete App.md5; delete App.aesCbcDecryptNoPad;
    out.push('deleted: md5=' + typeof App.md5 + ' aes=' + typeof App.aesCbcDecryptNoPad + ' db=' + typeof App.decryptKggDb);
    const files = [['/js/md5.js', () => App.md5], ['/js/aes.js', () => App.aesCbcDecryptNoPad], ['/js/kgg-db.js', () => App.decryptKggDb]];
    for (const [file, probe] of files) {
      if (typeof probe() !== 'function') {
        try {
          const res = await fetch(file);
          out.push(file + ' fetch=' + res.status);
          const src = await res.text();
          out.push(file + ' srcLen=' + src.length + ' head=' + src.slice(0, 30));
          new Function(src)();
          out.push(file + ' eval ok, now=' + typeof probe());
        } catch (e) {
          out.push(file + ' HEAL_ERR: ' + (e.message || e));
        }
      }
    }
    out.push('after: db=' + typeof App.decryptKggDb);
    return out.join(' || ');
  })()`;

  const r = await ev(script);
  console.log('REPRO:', r.result.result.value);
  process.exit(0);
}
main().catch((e) => {
  console.log('ERR:', e.message);
  process.exit(1);
});
