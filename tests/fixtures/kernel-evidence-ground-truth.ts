export function anonymousKernelEvidencePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Anonymous K4 evidence ground truth</title>
  <style>
    body { margin: 0; padding: 32px; font: 16px/1.5 system-ui; background: #E8DCC7; color: #606C38; }
    main { max-width: 720px; margin: auto; padding: 28px; border-radius: 28px; background: #B08B6E; }
    label { display: grid; gap: 6px; margin: 14px 0; padding: 12px; border-radius: 16px; background: #E8DCC7; }
    button { min-height: 40px; border: 0; border-radius: 16px; background: #C66B3D; color: #E8DCC7; }
  </style>
</head>
<body>
  <main>
    <h1>Anonymous K4 evidence ground truth</h1>
    <label>Resume PDF <input id="resume" type="file" accept=".pdf,application/pdf"></label>
    <label>Stale Resume <input id="stale" type="file" accept="application/pdf"></label>
    <label>Blocked Resume <input id="blocked" type="file" accept="application/pdf"></label>
    <label>Verify Resume <input id="verify" type="file" accept="application/pdf"></label>
    <label>Conflict Resume <input id="conflict" type="file" accept="application/pdf"></label>
    <label>Path Resume <input id="path" type="file" accept="application/pdf"></label>
    <label>Timeout Resume <input id="timeout" type="file" accept="application/pdf"></label>
    <button id="final" type="submit">Final application submit</button>
  </main>
  <script>
    const counters = {};
    for (const input of document.querySelectorAll('input[type=file]')) {
      counters[input.id] = { input: 0, change: 0 };
      input.addEventListener('input', () => { counters[input.id].input += 1; });
      input.addEventListener('change', () => { counters[input.id].change += 1; });
    }
    document.querySelector('#verify').addEventListener('input', (event) => {
      event.currentTarget.value = '';
    });
    let finalSubmission = 0;
    document.querySelector('#final').addEventListener('click', (event) => {
      event.preventDefault();
      finalSubmission += 1;
    });
    window.__kernelEvidence = {
      counters: () => JSON.parse(JSON.stringify(counters)),
      hideBlocked: () => { document.querySelector('#blocked').style.display = 'none'; },
      armTimeout: () => {
        const NativeDataTransfer = window.DataTransfer;
        Object.defineProperty(window, 'DataTransfer', {
          configurable: true,
          value: class SlowDataTransfer {
            constructor() {
              Object.defineProperty(window, 'DataTransfer', { configurable: true, value: NativeDataTransfer });
              const until = Date.now() + 16000;
              while (Date.now() < until) { /* bounded test-only renderer stall */ }
              return new NativeDataTransfer();
            }
          }
        });
      },
      finalSubmission: () => finalSubmission
    };
  </script>
</body>
</html>`;
}
