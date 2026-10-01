// Mobile menu
const toggle = document.querySelector('.nav__toggle');
const menu = document.getElementById('nav-menu');
toggle?.addEventListener('click', () => {
  const open = menu.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

// Interactive AI demo — runs entirely in the browser (illustrative, nothing is saved).
const demo = document.querySelector('[data-demo]');
if (demo) {
  const form = demo.querySelector('form');
  const input = demo.querySelector('input');
  const out = demo.querySelector('.result');
  const fmt = (n) => 'Rs ' + Number(n).toLocaleString('en-US');
  const amountOf = (s) => {
    const m = s.match(/(?:rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:rs)?\s*(?:cash|card|bank|credit|easypaisa|jazzcash)?\s*$/i);
    if (!m) return null;
    return Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  };
  const method = (s) => /credit|udhaar/i.test(s) ? 'On credit' : /easypaisa|jazzcash|wallet/i.test(s) ? 'Mobile wallet'
    : /card/i.test(s) ? 'Card' : /bank/i.test(s) ? 'Bank' : 'Cash';
  const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const single = (s) => s.replace(/(ies)$/, 'ies').replace(/(?<!s)s$/, '');

  function parse(text) {
    const t = text.trim().toLowerCase().replace(/[.!]$/, '');
    let m;
    if ((m = t.match(/^(?:i\s+)?sold\s+(\d+)\s+(.+?)\s+(?:for|at)\s+/))) {
      const amt = amountOf(t);
      if (!amt) return { ask: `For what amount did you sell the ${m[2]}?` };
      return { title: 'Sale detected', rows: [['Items', `${m[1]} × ${title(single(m[2]))}`], ['Amount', fmt(amt)], ['Payment', method(t)]],
               effect: 'Inventory will decrease', done: 'Sale recorded.' };
    }
    if (/^(?:i\s+)?sold\s+(some|a few|many)\b/.test(t)) return { ask: 'How many did you sell, and for what amount?' };
    if ((m = t.match(/^(?:i\s+)?(?:bought|purchased)\s+(.+?)\s+for\s+/))) {
      const amt = amountOf(t);
      return { title: 'Purchase detected', rows: [['Item', title(m[1])], ['Amount', fmt(amt)], ['Payment', method(t)]], effect: 'Stock will increase', done: 'Purchase recorded.' };
    }
    if ((m = t.match(/^(?:i\s+)?paid\s+(.+?)\s+(?:bill\s+)?(?:rs\.?\s*)?\d/))) {
      const amt = amountOf(t);
      return { title: 'Expense detected', rows: [['Category', title(m[1].replace(/ bill$/, ''))], ['Amount', fmt(amt)], ['Payment', method(t)]], done: 'Expense recorded.' };
    }
    if ((m = t.match(/^([a-z ]+?)\s+owes\s+me\s+/))) {
      return { title: 'Customer balance', rows: [['Customer', title(m[1])], ['Owes you', fmt(amountOf(t))]], done: 'Balance recorded.' };
    }
    if ((m = t.match(/^(?:i\s+)?(?:received|got)\s+(?:rs\.?\s*)?([\d,]+)\s+from\s+([a-z ]+)$/))) {
      return { title: 'Payment received', rows: [['From', title(m[2])], ['Amount', fmt(m[1].replace(/,/g, ''))]], done: 'Payment recorded.' };
    }
    if (/how much.*(sell|sales)|sales today/.test(t)) return { answer: 'In the app, this is answered from your real records, e.g. “You sold Rs 87,450 today across 23 sales.”' };
    return { ask: 'Try: “Sold 5 burgers for 2500 cash”, “Paid electricity 4500” or “Ali owes me 3000”.' };
  }

  function render(text) {
    const r = parse(text);
    out.innerHTML = '';
    const row = (html, i) => { const d = document.createElement('div'); d.className = 'result__row'; d.style.animationDelay = `${i * 120}ms`; d.innerHTML = html; out.append(d); };
    if (r.ask || r.answer) return row(`<span>🤖 ${r.ask ?? r.answer}</span>`, 0);
    row(`<span class="result__ok">✓ ${r.title}</span>`, 0);
    r.rows.forEach(([k, v], i) => row(`<b>${k}</b><span>✓ ${v}</span>`, i + 1));
    if (r.effect) row(`<span class="muted">↓ ${r.effect}</span>`, r.rows.length + 1);
    setTimeout(() => {
      const d = document.createElement('div'); d.className = 'result__done'; d.textContent = '✓ ' + r.done + ' (demo)'; out.append(d);
    }, (r.rows.length + 2) * 120 + 500);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) render(input.value); });
  demo.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { input.value = c.textContent; render(c.textContent); }));
  render('Sold 5 burgers for 2500 cash');
}
