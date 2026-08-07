export function anonymousKernelWorkflowPage(): string {
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Anonymous K3 workflow ground truth</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; margin: 32px; background: #E8DCC7; color: #606C38; }
      main { max-width: 760px; margin: auto; padding: 28px; border-radius: 28px; background: #d9ccb5; }
      section { margin: 18px 0; padding: 18px; border-radius: 20px; background: #cfc0a7; }
      label { display: grid; gap: 6px; margin: 10px 0; }
      input, select, [contenteditable], [role=combobox] { padding: 10px; border: 2px solid #8B9D83; border-radius: 16px; background: #dfd2bd; color: #606C38; }
    </style>
  </head>
  <body>
    <main>
      <h1>Anonymous K3 workflow ground truth</h1>
      <section id="dynamic-find"></section>
      <section>
        <label for="enabled-target">Enabled Target</label>
        <input id="enabled-target" data-case="p03" disabled>
        <button id="expand-target" data-case="p04" type="button" aria-expanded="false">Expand Target</button>
      </section>
      <section>
        <label for="native-city">Native City</label>
        <select id="native-city" data-case="p05"><option>Initial</option></select>
        <div id="custom-city" data-case="p06" role="combobox" aria-label="Custom City" aria-expanded="true">
          <div role="option">Initial</div>
        </div>
      </section>
      <section id="settle-target"></section>
      <section id="dynamic-action">
        <div id="async-trigger" role="combobox" tabindex="0" aria-expanded="false" aria-label="Async Contact Trigger">Initial</div>
        <div id="async-choice"></div>
      </section>
      <section>
        <label for="replay-target">Replay Target</label><input id="replay-target" data-case="i01">
        <label for="conflict-target">Conflict Target</label><input id="conflict-target" data-case="i02">
        <label for="concurrent-target">Concurrent Target</label><input id="concurrent-target" data-case="i03">
        <label for="inflight-target">Inflight Target</label><input id="inflight-target" data-case="i04">
        <label for="cross-guard">Cross Guard</label><input id="cross-guard" data-case="x01">
      </section>
      <button id="final-submit" type="submit">Submit application</button>
    </main>
    <script>
      window.__submissionCount = 0;
      window.__workflowMutations = {};
      document.addEventListener('submit', (event) => {
        event.preventDefault();
        window.__submissionCount += 1;
      });
      document.addEventListener('input', (event) => {
        const id = event.target && event.target.dataset ? event.target.dataset.case : '';
        if (id) window.__workflowMutations[id] = (window.__workflowMutations[id] || 0) + 1;
      });
      window.__workflowSchedule = (kind) => {
        if (kind === 'find-name') setTimeout(() => {
          document.querySelector('#dynamic-find').insertAdjacentHTML('beforeend', '<label>Delayed Name<input data-case="p01"></label>');
        }, 120);
        if (kind === 'find-school') setTimeout(() => {
          document.querySelector('#dynamic-find').insertAdjacentHTML('beforeend', '<label>Delayed School<input data-case="p02"></label>');
        }, 120);
        if (kind === 'enable') setTimeout(() => document.querySelector('#enabled-target').disabled = false, 120);
        if (kind === 'expand') setTimeout(() => document.querySelector('#expand-target').setAttribute('aria-expanded', 'true'), 120);
        if (kind === 'native-options') setTimeout(() => {
          document.querySelector('#native-city').insertAdjacentHTML('beforeend', '<option>Beijing</option><option>Shanghai</option>');
        }, 120);
        if (kind === 'custom-options') setTimeout(() => {
          document.querySelector('#custom-city').insertAdjacentHTML('beforeend', '<div role="option">Beijing</div><div role="option">Shanghai</div>');
        }, 120);
        if (kind === 'document-navigation') setTimeout(() => location.assign('/step-document'), 150);
        if (kind === 'spa-navigation') setTimeout(() => history.pushState({}, '', '/step-spa'), 150);
        if (kind === 'settle-add') {
          setTimeout(() => document.querySelector('#settle-target').insertAdjacentHTML('beforeend', '<label>Settled One<input></label>'), 50);
          setTimeout(() => document.querySelector('#settle-target').insertAdjacentHTML('beforeend', '<label>Settled Two<input></label>'), 120);
        }
        if (kind === 'settle-state') {
          setTimeout(() => document.querySelector('#expand-target').setAttribute('aria-expanded', 'false'), 50);
          setTimeout(() => document.querySelector('#expand-target').setAttribute('aria-expanded', 'true'), 120);
        }
        if (kind === 'never-settle') {
          const timer = setInterval(() => {
            document.querySelector('#settle-target').insertAdjacentHTML('beforeend', '<label>Moving<input></label>');
          }, 40);
          setTimeout(() => clearInterval(timer), 600);
        }
        if (kind === 'delayed-action') setTimeout(() => {
          document.querySelector('#dynamic-action').insertAdjacentHTML('beforeend', '<label>Delayed Full Name<input data-case="p11"></label>');
        }, 120);
        if (kind === 'cross-origin') setTimeout(() => location.assign('https://other.example.test/continue'), 150);
      };
      document.querySelector('#async-trigger').addEventListener('click', (event) => {
        event.currentTarget.setAttribute('aria-expanded', 'true');
        setTimeout(() => {
          document.querySelector('#async-choice').innerHTML = '<label>Async Contact Choice<select data-case="p12"><option>Initial</option><option>2001-02-03</option></select></label>';
        }, 120);
      });
      window.__workflowRead = (id) => {
        const target = document.querySelector('[data-case="' + id + '"]');
        return {
          value: target && 'value' in target ? target.value : '',
          mutationCount: window.__workflowMutations[id] || 0
        };
      };
    </script>
  </body>
  </html>`;
}
