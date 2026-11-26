// IIF Planning HQ checks. Run with:  npm test   (or: node tests/run.js "<part of a check's name>")
// Every check opens the page against a pretend relay with sample data, so nothing real is
// read or changed. The run fails (exit code 1) if any check fails.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { open, ROOT } = require('./harness');

const results = [];
let browser;
const only = process.argv.slice(2);

async function check(name, fn) {
  if (only.length && !only.some(o => name.toLowerCase().includes(o.toLowerCase()))) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  PASS  ' + name); }
  catch (e) { results.push({ name, ok: false, why: e.message }); console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const noErrors = (errs, where) => expect(!errs.length, 'Page errors' + (where ? ' on ' + where : '') + ':\n' + errs.join('\n'));

(async () => {
  browser = await chromium.launch();
  const opts = o => Object.assign({ browser }, o || {});

  /* 1. Every script on the page reads as valid JavaScript */
  await check('Every page script parses', async () => {
    const bad = [];
    for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
      while ((m = re.exec(html))) {
        i++; if (/type=["'](?!text\/javascript|module)/.test(m[1])) continue;
        try { new vm.Script(m[2], { filename: f + ' script ' + i }); } catch (e) { bad.push(f + ' script ' + i + ': ' + e.message); }
      }
    }
    expect(!bad.length, bad.join('\n'));
  });

  /* 2. The page opens, every menu page draws, and nothing errors */
  await check('Every menu page opens without errors', async () => {
    const s = await open(opts());
    const tabs = await s.page.$$eval('.hq nav button[data-hq]', bs => bs.map(b => b.dataset.hq));
    expect(tabs.length >= 6, 'the left menu has ' + tabs.length + ' pages');
    for (const t of tabs) {
      await s.page.click('.hq nav button[data-hq="' + t + '"]'); await s.page.waitForTimeout(300);
      const ok = await s.page.evaluate(t => !document.getElementById('v-' + t).hidden &&
        document.querySelector('.hq nav button[data-hq="' + t + '"]').hasAttribute('aria-current'), t);
      expect(ok, t + ' did not show, or its menu button is not marked aria-current');
    }
    noErrors(s.errs); await s.close();
  });

  /* 3. The browser's Back button: it closes what is open, then goes to the last page you were on (CN-033, Nov 25, 2026) */
  await check('Back button: closes the panel, then returns to the last page', async () => {
    const s = await open(opts());
    const state = () => s.page.evaluate(() => ({
      tab: (document.querySelector('.hq nav button[data-hq][aria-current]') || {}).dataset?.hq || '',
      pane: document.body.classList.contains('paneon'), helper: !!window.MismoBack }));
    expect((await state()).helper, 'the shared Back helper (/assets/back.js) did not load');
    const go = async tab => { await s.page.click('.hq nav button[data-hq="' + tab + '"]'); await s.page.waitForTimeout(700); };
    const back = async () => { await s.page.evaluate(() => history.back()); await s.page.waitForTimeout(900); };
    const start = (await state()).tab;
    expect(start === 'overview', 'the page should still open on the Overview: ' + start);
    await go('tasks'); await go('dates'); await go('raid');
    let st = await state(); expect(st.tab === 'raid', 'Decisions and Risks did not open: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === 'dates', 'Back from Decisions and Risks should land on Key Dates: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === 'tasks', 'Back again should land on Tasks: ' + JSON.stringify(st));
    await s.page.evaluate(() => history.forward()); await s.page.waitForTimeout(900);
    st = await state(); expect(st.tab === 'dates', 'Forward should go again to Key Dates: ' + JSON.stringify(st));
    await back(); await back(); st = await state(); expect(st.tab === start, 'Back to where the page opened (' + start + '): ' + JSON.stringify(st));
    /* a panel: Back closes it first and stays on the page */
    await go('raid');
    const row = await s.page.$('#r-rows .rowbtn');
    expect(row, 'Decisions and Risks has no rows to open');
    await row.click(); await s.page.waitForTimeout(700);
    expect((await state()).pane, 'an entry did not open in the right-hand panel');
    await back(); st = await state();
    expect(!st.pane && st.tab === 'raid', 'Back should close the panel and stay on Decisions and Risks: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === start, 'Back after the panel should go to the page before: ' + JSON.stringify(st));
    /* closing the panel with its X doesn't leave a step behind */
    await go('raid'); await (await s.page.$('#r-rows .rowbtn')).click(); await s.page.waitForTimeout(700);
    await s.page.click('#iif-pane-x'); await s.page.waitForTimeout(700);
    expect(!(await state()).pane, 'the X did not close the panel');
    await back(); st = await state(); expect(st.tab === start, 'after closing the panel with X, Back should go straight to the page before: ' + JSON.stringify(st));
    noErrors(s.errs); await s.close();
  });

  /* 4. On a narrow screen the open menu is a drawer: Back closes it first */
  await check('Back button: closes the open menu on a narrow screen', async () => {
    const s = await open(opts({ w: 700, h: 900 }));
    const mini = () => s.page.evaluate(() => document.body.classList.contains('railmini'));
    expect(await mini(), 'the menu should start narrow on a small screen');
    await s.page.click('#rail-hide'); await s.page.waitForTimeout(700);
    expect(!(await mini()), 'the menu did not open');
    await s.page.evaluate(() => history.back()); await s.page.waitForTimeout(900);
    expect(await mini(), 'Back should close the open menu');
    const tab = await s.page.evaluate(() => document.querySelector('.hq nav button[aria-current]').dataset.hq);
    expect(tab === 'overview', 'Back should stay on the Overview: ' + tab);
    noErrors(s.errs); await s.close();
  });

  /* 5. The masthead is Certification Management's, to the pixel (CN-053, Nov 26, 2026) */
  const mastAt = async (w, h, want) => {
    const s = await open(opts({ w, h }));
    const m = await s.page.evaluate(() => {
      const r = el => { const b = document.querySelector(el).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom }; };
      const cs = el => getComputedStyle(document.querySelector(el));
      const rail = document.querySelector('.hq.rail').getBoundingClientRect();
      const pane = document.querySelector('.hqpane').getBoundingClientRect();
      return { bar: r('.hqtop'), plate: r('.logoplate'), logo: r('.logoplate .wordmark'), rule: r('.hqtop .mastrule'), name: r('.hqtop .hqname'),
        radius: cs('.logoplate').borderTopLeftRadius, plateShadow: cs('.logoplate').boxShadow, barShadow: cs('.hqtop').boxShadow,
        ruleBg: cs('.hqtop .mastrule').backgroundColor, nameSize: cs('.hqtop .hqname').fontSize, nameWeight: cs('.hqtop .hqname').fontWeight,
        nameColor: cs('.hqtop .hqname').color, barBg: cs('.hqtop').backgroundColor, railTop: rail.top, paneTop: pane.top,
        oldHat: !!document.querySelector('.santa, #mismo-hat') || document.documentElement.hasAttribute('data-season'),
        oneRow: document.querySelector('.hqtop').scrollHeight <= document.querySelector('.hqtop').clientHeight };
    });
    const near = (a, b) => Math.abs(a - b) < 0.6;
    const bad = [];
    for (const [k, v] of Object.entries(want)) { const got = k.split('.').reduce((o, p) => o[p], m); if (typeof v === 'number' ? !near(got, v) : got !== v) bad.push(k + ' is ' + got + ', should be ' + v); }
    expect(near(m.railTop, m.bar.h) && near(m.paneTop, m.bar.h), 'the left menu (' + m.railTop + ') or panel (' + m.paneTop + ') does not start where the ' + m.bar.h + 'px bar ends');
    expect(!m.oldHat, 'the retired December hat (.santa, #mismo-hat, data-season) is still on the page');
    expect(m.oneRow, 'the masthead overflows its bar');
    expect(!bad.length, bad.join('\n'));
    noErrors(s.errs); await s.close();
  };
  await check('Masthead matches Certification Management on a wide screen', () => mastAt(1440, 900, {
    'bar.y': 0, 'bar.h': 68, 'plate.x': 22, 'plate.y': 13, 'plate.h': 42, 'logo.h': 24, 'logo.w': 157.3, 'rule.w': 1, 'rule.h': 42,
    radius: '5px', nameSize: '16px', nameWeight: '500', nameColor: 'rgb(148, 200, 233)', barBg: 'rgb(13, 49, 76)', ruleBg: 'rgba(80, 164, 219, 0.4)',
    plateShadow: 'rgba(80, 164, 219, 0.35) 0px 1px 0px 0px', barShadow: 'rgba(80, 164, 219, 0.28) 0px 1px 0px 0px' }));
  await check('Masthead matches Certification Management on a phone', () => mastAt(390, 844, {
    'bar.h': 62, 'plate.x': 16, 'plate.y': 14.5, 'plate.h': 33, 'plate.w': 144.5, 'logo.h': 19, 'rule.h': 40, 'rule.x': 171.5 }));
  await check('Masthead on a tablet keeps the 68px bar', () => mastAt(768, 1024, { 'bar.h': 68, 'plate.x': 22, 'plate.y': 13 }));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' checks passed.');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
