// Run with: node test/engine.test.cjs
const E = require('../public/js/engine.js');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const cv = fs.readFileSync(path.join(__dirname, 'sample-cv.txt'), 'utf8');
const jd = fs.readFileSync(path.join(__dirname, 'sample-jd.txt'), 'utf8');
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };

const ctx = { jdText: jd };
const check = (o, r) => E.checkRewrite(o, r, ctx);

t('honest rephrase is accepted', () => {
  const r = check('Wrote captions for Facebook and Instagram posts', 'Wrote captions for Instagram and Facebook posts');
  assert.ok(r.ok, r.reasons.join(' '));
});
t('honest rephrase keeping numbers is accepted', () => {
  const r = check("Posted weekly product photos on the store's Instagram account, which grew from 400 to 1,100 followers",
    "Posted weekly product photos on the store's Instagram account, growing it from 400 to 1,100 followers");
  assert.ok(r.ok, r.reasons.join(' '));
});
t('a new number is rejected', () => {
  const r = check('Served customers at the tills', 'Served 120 customers a day at the tills');
  assert.ok(!r.ok);
});
t('a changed number is rejected', () => {
  const r = check('Grew followers from 400 to 1,100', 'Grew followers from 400 to 1,500');
  assert.ok(!r.ok);
});
t('a new tool is rejected', () => {
  const r = check('Wrote captions for Facebook and Instagram posts', 'Wrote and scheduled captions for Facebook and Instagram posts in Hootsuite');
  assert.ok(!r.ok);
  assert.ok(r.reasons.some((x) => /Hootsuite/.test(x)));
});
t('a new platform from the job description is rejected even in lower case', () => {
  const r = check('Wrote captions for Facebook and Instagram posts', 'Wrote captions for facebook, instagram and tiktok posts');
  assert.ok(!r.ok);
});
t('a new acronym is rejected', () => {
  const r = check('Collected customer feedback through a survey', 'Collected customer feedback through a survey and tracked KPIs');
  assert.ok(!r.ok);
});
t('upgraded seniority is rejected', () => {
  const r = check('Helped organise a pop-up stall at a local food market', 'Led the organisation of a pop-up stall at a local food market');
  assert.ok(!r.ok);
  assert.ok(r.reasons.some((x) => /bigger/.test(x)));
});
t('seniority already in the original is allowed', () => {
  const r = check('Managed the shop rota for 6 staff', 'Managed the weekly shop rota for 6 staff');
  assert.ok(r.ok, r.reasons.join(' '));
});
t('a new buzzword is rejected', () => {
  const r = check('Served around 80 customers a day', 'Served around 80 customers a day in a fast-paced environment');
  assert.ok(!r.ok);
});
t('a duty copied from the job description is rejected', () => {
  const r = check('Wrote captions for Facebook and Instagram posts', 'Wrote captions for Facebook and Instagram posts and monitored engagement');
  assert.ok(!r.ok);
});
t('number words count as numbers', () => {
  const r = check('Trained two new starters on the till system', 'Trained 2 new starters on the till system');
  assert.ok(r.ok, r.reasons.join(' '));
  assert.ok(!check('Trained two new starters', 'Trained five new starters').ok);
});
t('much longer rewrite is rejected', () => {
  const r = check('Wrote captions', 'Wrote captions for posts across a number of different channels for the business every single week of the year');
  assert.ok(!r.ok);
});

t('contact details are never sent', () => {
  const plan = E.analyse(cv, 'Social Media Assistant', jd);
  const sent = JSON.stringify([plan.toRewrite, plan.profile]);
  assert.ok(!/amaka\.obi@example\.com/.test(sent));
  assert.ok(!/07700/.test(sent));
  assert.ok(!/Amaka Obi/.test(sent));
});

t('assemble keeps honest rewrites, reverts invented ones, reorders bullets', () => {
  const plan = E.analyse(cv, 'Social Media Assistant', jd);
  const ai = {
    bullets: [
      { id: 'b6', text: 'Wrote captions for Instagram and Facebook posts' },
      { id: 'b8', text: 'Spearheaded a pop-up stall at a local food market' },
      { id: 'b2', text: 'Served around 80 customers a day and handled 50 complaints' },
    ],
    profile: 'Marketing graduate with two years of retail experience, posting weekly product photos on Instagram.',
  };
  const out = E.assemble(plan, ai, jd);
  assert.ok(out.text.includes('Wrote captions for Instagram and Facebook posts'));
  assert.ok(out.text.includes('Helped organise a pop-up stall'));
  assert.ok(!out.text.includes('Spearheaded'));
  assert.ok(!out.text.includes('50 complaints'));
  assert.ok(out.text.startsWith('Amaka Obi'));
  assert.ok(out.text.includes('amaka.obi@example.com'));
  // Instagram bullet should now come before the till bullet in the Boots job
  assert.ok(out.text.indexOf('Instagram account') < out.text.indexOf('Served around 80'));
  // Skills reordered: Instagram / Canva near the front
  const skills = out.text.split('\n').find((l) => l.includes('Canva'));
  assert.ok(skills.indexOf('Customer service') > skills.indexOf('Instagram'), skills);
  assert.strictEqual(out.stats.rewritten, 2);
  assert.strictEqual(out.stats.kept, 2);
  // every line of the original body still exists in some form (nothing dropped)
  for (const id of ['b3', 'b5', 'b7']) {
    const item = plan.parsed.items.find((i) => i.id === id);
    assert.ok(out.text.includes(item.text), 'dropped ' + id);
  }
});

t('works with no AI result at all (daily limit reached)', () => {
  const plan = E.analyse(cv, 'Social Media Assistant', jd);
  const out = E.assemble(plan, null, jd);
  assert.strictEqual(out.stats.rewritten, 0);
  assert.ok(out.text.includes('Served around 80 customers'));
});

t('gaps list flags what the CV does not show', () => {
  const plan = E.analyse(cv, 'Social Media Assistant', jd);
  const missing = plan.coverage.filter((c) => c.status === 'missing').map((c) => c.requirement).join(' | ');
  assert.ok(/Hootsuite/.test(missing), missing);
  assert.ok(!plan.coverage.some((c) => /join our/i.test(c.requirement)));
});

t('layout blocks recognise name, headings and bullets', () => {
  const plan = E.analyse(cv, 'Social Media Assistant', jd);
  const out = E.assemble(plan, null, jd);
  const blocks = E.layoutBlocks(out.text);
  assert.strictEqual(blocks[0].type, 'name');
  assert.ok(blocks.some((b) => b.type === 'heading' && b.text === 'WORK EXPERIENCE'));
  assert.ok(blocks.some((b) => b.type === 'bullet'));
});

t('CV without bullet markers or headings still parses', () => {
  const plain = 'John Smith\njohn@x.com\n\nI worked as a waiter at a busy restaurant serving tables and handling payments every evening.\nI ran the restaurant Instagram page and posted photos of new dishes every week for two years.';
  const plan = E.analyse(plain, 'Social Media Assistant', jd);
  assert.ok(plan.parsed.items.filter((i) => i.kind === 'bullet').length === 2);
  assert.strictEqual(plan.parsed.items[0].kind, 'header');
});

t('wrapped PDF bullet lines are joined', () => {
  const pdfish = 'Jane Doe\n\nEXPERIENCE\nAdmin Assistant, Acme, 2020 - 2022\n•\nAnswered phones and emails for a team of\nten people and booked meetings\n• Filed invoices';
  const plan = E.parseCV(pdfish);
  const bullets = plan.items.filter((i) => i.kind === 'bullet').map((i) => i.text);
  assert.deepStrictEqual(bullets, ['Answered phones and emails for a team of ten people and booked meetings', 'Filed invoices']);
});

const keep = (o, r) => E.checkRewrite(o, r, { jdText: jd, mustKeep: o });

t('changing a current role to past tense is rejected', () => {
  assert.ok(!keep('Run the Saturday Craft Club for children and families, leading hands-on craft activities.', 'Ran the Saturday Craft Club for children and families, leading hands-on craft activities.').ok);
  assert.ok(!keep('Support children during classroom activities.', 'Supported children during classroom activities.').ok);
});
t('keeping present tense is accepted', () => {
  const r = keep('Run the Saturday Craft Club for children and families, leading hands-on craft activities.', 'Run the Saturday Craft Club for children and families, leading hands-on craft activities');
  assert.ok(r.ok, r.reasons.join(' '));
});
t('past tense stays allowed when the original was past tense', () => {
  const r = keep('Wrote captions for Facebook and Instagram posts', 'Wrote Instagram and Facebook captions');
  assert.ok(r.ok, r.reasons.join(' '));
});
t('switching to "I" is rejected', () => {
  assert.ok(!keep('Runs a Saturday Craft Club for children.', 'I run a Saturday Craft Club for children.').ok);
});
t('dropping an achievement from the profile is rejected', () => {
  const o = 'Compassionate and dedicated SEN Teaching Assistant. Studying for an MSc in Management with Digital Marketing at the University of Hertfordshire (on track for a Distinction).';
  const r = keep(o, 'SEN Teaching Assistant studying for an MSc in Management with Digital Marketing at the University of Hertfordshire.');
  assert.ok(!r.ok);
  assert.ok(r.reasons.some((x) => /Distinction/.test(x)), r.reasons.join(' '));
});
t('removing only buzzwords from the profile is accepted', () => {
  const o = 'Compassionate and dedicated SEN Teaching Assistant. Studying for an MSc in Management with Digital Marketing at the University of Hertfordshire (on track for a Distinction).';
  const r = keep(o, 'SEN Teaching Assistant studying for an MSc in Management with Digital Marketing at the University of Hertfordshire, on track for a Distinction.');
  assert.ok(r.ok, r.reasons.join(' '));
});

console.log(`\n${passed} tests passed`);
