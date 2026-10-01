#!/usr/bin/env node
// Static site generator for the BusinessPilot marketing site (no dependencies).
//   node website/build.mjs            -> website/dist
// Pricing comes from the live `plans` table when SUPABASE_URL + SUPABASE_ANON_KEY
// are set at build time (single source of truth); otherwise src/data/plans.fallback.json.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
const SITE = (process.env.SITE_URL ?? 'https://businesspilot.app').replace(/\/$/, '');
const APP = process.env.APP_PATH ?? '/app/';

async function loadPlans() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/plans?select=*&is_active=eq.true&order=sort_order`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (res.ok) { console.log('plans: loaded from Supabase'); return await res.json(); }
    } catch (e) { console.warn('plans: fetch failed, using fallback', e.message); }
  }
  return JSON.parse(readFileSync(join(src, 'data', 'plans.fallback.json'), 'utf8'));
}

const money = (minor, cur) => minor === 0 ? 'Free' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

function pricingCards(plans) {
  const highlights = (p) => [
    p.max_transactions_per_month == null ? 'Unlimited transactions' : `${p.max_transactions_per_month} transactions / month`,
    p.max_products == null ? 'Unlimited products' : `Up to ${p.max_products} products`,
    p.max_users == null ? 'Unlimited team members' : (p.max_users === 1 ? '1 user' : `Up to ${p.max_users} users`),
    p.ai_requests_per_month != null ? `AI assistant · ${p.ai_requests_per_month.toLocaleString('en-US')} AI requests / month` : 'AI assistant',
    p.features?.pdf_invoices ? 'PDF invoices & WhatsApp-ready receipts' : 'Shareable text receipts',
    p.features?.reports === 'advanced' ? 'Advanced reports' : p.features?.reports === 'full' ? 'Full reports & exports' : 'Core reports & CSV export',
    ...(p.features?.multi_branch ? ['Multiple branches'] : []),
    ...(p.features?.api_access ? ['API access'] : []),
  ];
  return plans.map((p) => `
    <article class="plan${p.id === 'pro' ? ' plan--featured' : ''}">
      ${p.id === 'pro' ? '<span class="badge">Most popular</span>' : ''}
      <h3>${p.name}</h3>
      <p class="muted">${p.description}</p>
      <p class="price">${money(p.price_monthly_minor, p.price_currency)}${p.price_monthly_minor ? '<small>/month</small>' : ''}</p>
      <ul class="checks">${highlights(p).map((h) => `<li>${h}</li>`).join('')}</ul>
      <a class="btn ${p.id === 'pro' ? 'btn--primary' : 'btn--ghost'} btn--block" href="${APP}signup">Start free</a>
    </article>`).join('');
}

function parsePage(file) {
  const raw = readFileSync(join(src, 'pages', file), 'utf8');
  const m = raw.match(/^<!--\s*([\s\S]*?)-->\s*/);
  const meta = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m ? m[0].length : 0) };
}

const plans = await loadPlans();
const layout = readFileSync(join(src, 'partials', 'layout.html'), 'utf8');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
cpSync(join(src, 'site.css'), join(dist, 'assets', 'site.css'));
cpSync(join(src, 'site.js'), join(dist, 'assets', 'site.js'));

const urls = [];
for (const file of readdirSync(join(src, 'pages')).filter((f) => f.endsWith('.html'))) {
  const { meta, body } = parsePage(file);
  const path = meta.path ?? '/';
  const canonical = `${SITE}${path}`;
  const jsonLd = meta.schema === 'faq' ? faqSchema(body) : meta.schema === 'app' ? appSchema(plans) : '';
  const html = layout
    .replaceAll('{{title}}', meta.title ?? 'BusinessPilot')
    .replaceAll('{{description}}', meta.description ?? '')
    .replaceAll('{{canonical}}', canonical)
    .replaceAll('{{site}}', SITE)
    .replace('{{jsonld}}', jsonLd)
    .replace('{{body}}', body.replaceAll('{{pricing}}', pricingCards(plans)))
    .replaceAll('{{app}}', APP)
    .replaceAll('{{year}}', String(new Date().getFullYear()));
  const out = join(dist, path, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (meta.noindex !== 'true') urls.push(canonical);
  console.log('page', path);
}
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${APP}\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`built ${urls.length} pages -> website/dist`);

function faqSchema(body) {
  const items = [...body.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(([, q, a]) => ({
    '@type': 'Question', name: q.replace(/<[^>]+>/g, '').trim(),
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '').trim() },
  }));
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items })}</script>`;
}

function appSchema(plans) {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'BusinessPilot',
    applicationCategory: 'BusinessApplication', operatingSystem: 'Android, Web',
    description: 'AI-powered business manager for small businesses. Record sales, expenses and stock by simply telling the app what happened.',
    offers: plans.map((p) => ({ '@type': 'Offer', name: p.name, price: (p.price_monthly_minor / 100).toFixed(2), priceCurrency: p.price_currency })),
  })}</script>`;
}
