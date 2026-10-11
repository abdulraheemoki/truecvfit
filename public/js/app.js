/* TrueCVFit — page behaviour. Nothing here saves anything anywhere. */
(function () {
  'use strict';
  const E = window.TrueCVFit;
  const $ = (id) => document.getElementById(id);

  const form = $('form');
  const cvEl = $('cv');
  const titleEl = $('title');
  const jdEl = $('jd');
  const hint = $('hint');
  const working = $('working');
  const workingMsg = $('workingMsg');
  const results = $('results');
  const outEl = $('out');

  let lastJobTitle = '';

  /* ------------------------------------------------------------ */
  /* Loading libraries only when needed (keeps the page fast)       */
  /* ------------------------------------------------------------ */
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => { delete loaded[src]; reject(new Error('Could not load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  /* ------------------------------------------------------------ */
  /* Reading uploaded files on the device                          */
  /* ------------------------------------------------------------ */
  async function readFile(file) {
    const name = file.name.toLowerCase();
    if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB. Try a smaller file or paste the text.');
    if (name.endsWith('.txt') || file.type === 'text/plain') return file.text();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return readPdf(file);
    if (name.endsWith('.docx')) return readDocx(file);
    if (name.endsWith('.doc')) throw new Error('Old .doc files can\'t be read. Save it as .docx or PDF, or paste the text.');
    throw new Error('Please upload a PDF, Word (.docx) or text file.');
  }

  async function readPdf(file) {
    await loadScript('vendor/pdf.min.js');
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = '';
      const lines = [];
      let lastY = null;
      let lastEnd = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (line.trim()) lines.push(line);
          line = '';
          lastEnd = null;
        }
        if (lastEnd !== null && x - lastEnd > 1.5 && !line.endsWith(' ') && !item.str.startsWith(' ')) line += ' ';
        line += item.str;
        lastY = y;
        lastEnd = x + (item.width || 0);
        if (item.hasEOL) { if (line.trim()) lines.push(line); line = ''; lastY = null; lastEnd = null; }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
    }
    const text = pages.join('\n\n');
    if (text.replace(/\s/g, '').length < 50) {
      throw new Error('This PDF looks like a scanned image, so there\'s no text to read. Please paste your CV text instead.');
    }
    return text;
  }

  async function readDocx(file) {
    await loadScript('vendor/mammoth.browser.min.js');
    const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    const doc = new DOMParser().parseFromString(result.value, 'text/html');
    const out = [];
    doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li').forEach((el) => {
      if (el.tagName === 'P' && el.closest('li')) return;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) { out.push(''); return; }
      if (el.tagName === 'LI') out.push('• ' + text);
      else if (/^H\d$/.test(el.tagName)) out.push('', text);
      else out.push(text);
    });
    return out.join('\n');
  }

  function wireUpload(inputId, target, noteId) {
    const input = $(inputId);
    const note = $(noteId);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      note.classList.remove('err');
      note.textContent = 'Reading ' + file.name + '…';
      try {
        const text = E.normaliseText(await readFile(file));
        target.value = text;
        note.textContent = 'Read ' + file.name + '. Check the text below looks right.';
        validate();
      } catch (err) {
        note.classList.add('err');
        note.textContent = err.message || 'Sorry, that file couldn\'t be read. Please paste the text instead.';
      } finally {
        input.value = '';
      }
    });
  }
  wireUpload('cvFile', cvEl, 'cvFileNote');
  wireUpload('jdFile', jdEl, 'jdFileNote');

  /* ------------------------------------------------------------ */
  /* Validation                                                     */
  /* ------------------------------------------------------------ */
  function validate(show) {
    const problems = [];
    if (cvEl.value.trim().length < 200) problems.push('add your CV');
    if (titleEl.value.trim().length < 2) problems.push('add the job title');
    if (jdEl.value.trim().length < 150) problems.push('paste the full job description');
    if (show && problems.length) {
      hint.classList.add('err');
      hint.textContent = 'To continue, ' + listify(problems) + '.';
    } else if (!problems.length) {
      hint.classList.remove('err');
      hint.textContent = '';
    }
    return problems.length === 0;
  }
  [cvEl, titleEl, jdEl].forEach((el) => el.addEventListener('input', () => { if (hint.textContent) validate(true); }));

  function listify(arr) {
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  /* ------------------------------------------------------------ */
  /* Tailoring                                                      */
  /* ------------------------------------------------------------ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(true)) return;

    const cv = cvEl.value;
    const jobTitle = titleEl.value.trim();
    const jd = jdEl.value;
    lastJobTitle = jobTitle;

    form.hidden = true;
    results.hidden = true;
    working.hidden = false;
    working.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const messages = ['Reading the job description…', 'Matching your experience to it…', 'Rephrasing your most relevant points…', 'Checking nothing was invented…'];
    let m = 0;
    workingMsg.textContent = messages[0];
    const ticker = setInterval(() => { m = Math.min(m + 1, messages.length - 1); workingMsg.textContent = messages[m]; }, 4500);

    const plan = E.analyse(cv, jobTitle, jd);
    let ai = null;
    let notice = '';

    if (plan.toRewrite.length || plan.profile) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        const res = await fetch('/api/tailor', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jobTitle, jd: jd.slice(0, 7000), bullets: plan.toRewrite, profile: plan.profile ? plan.profile.text : '' }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          ai = await res.json();
        } else {
          const data = await res.json().catch(() => ({}));
          notice = data.error === 'daily_limit'
            ? 'The free AI rephrasing has reached its limit for today. Your CV has still been reordered to put your most relevant points first, and your gaps list is ready. Rephrasing will be back tomorrow.'
            : 'The AI rephrasing isn\'t available right now. Your CV has still been reordered to put your most relevant points first, and your gaps list is ready. You can try again in a minute.';
        }
      } catch (err) {
        notice = navigator.onLine === false
          ? 'You seem to be offline, so we couldn\'t rephrase anything. Your CV has still been reordered and your gaps list is ready.'
          : 'The AI rephrasing took too long or couldn\'t be reached. Your CV has still been reordered to put your most relevant points first, and your gaps list is ready.';
      }
    } else {
      notice = 'None of your CV points clearly match this job\'s wording, so there was nothing to rephrase. Look at the Gaps tab to see what the job asks for.';
    }

    const result = E.assemble(plan, ai, jd, jobTitle);
    clearInterval(ticker);
    showResults(plan, result, notice);
  });

  /* ------------------------------------------------------------ */
  /* Results                                                        */
  /* ------------------------------------------------------------ */
  function showResults(plan, result, notice) {
    working.hidden = true;
    results.hidden = false;

    $('resultsTitle').textContent = 'Your CV for ' + lastJobTitle;
    const s = result.stats;
    const parts = [];
    if (s.requirementsTotal) parts.push(`Your CV clearly shows ${s.requirementsShown} of the ${s.requirementsTotal} things this job asks for.`);
    if (s.rewritten || s.kept) {
      parts.push(`${s.rewritten} ${s.rewritten === 1 ? 'point was' : 'points were'} rephrased` + (s.kept ? `, and ${s.kept} kept in your own words because the rewrite wasn't faithful.` : '.'));
    }
    parts.push('Your most relevant points now come first.');
    $('summary').textContent = parts.join(' ');

    const noticeEl = $('notice');
    noticeEl.hidden = !notice;
    noticeEl.textContent = notice;

    outEl.value = result.text;
    renderGaps(plan.coverage);
    renderChanges(result.changes);
    selectTab('tab-cv');
    $('resultsTitle').focus();
    results.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderGaps(coverage) {
    const box = $('gaps');
    box.textContent = '';
    const missing = coverage.filter((c) => c.status === 'missing');
    const partly = coverage.filter((c) => c.status === 'partly');
    const shown = coverage.filter((c) => c.status === 'shown');
    $('gapCount').textContent = String(missing.length + partly.length);

    if (!coverage.length) {
      box.appendChild(el('p', 'empty', 'We couldn\'t find a clear list of requirements in this job description, so there\'s no gaps list. Paste the full advert, including the "what you\'ll need" part, to get one.'));
      return;
    }
    if (!missing.length && !partly.length) {
      box.appendChild(el('p', 'empty', 'Your CV covers everything this job description asks for. Nice.'));
    }
    const group = (title, dotCls, list, collapsible) => {
      if (!list.length) return;
      const wrap = el(collapsible ? 'details' : 'div', 'gap-group');
      const head = el('h3');
      head.appendChild(el('span', 'dot ' + dotCls));
      head.appendChild(document.createTextNode(`${title} (${list.length})`));
      if (collapsible) { const sum = el('summary'); sum.appendChild(head); wrap.appendChild(sum); } else wrap.appendChild(head);
      const ul = el('ul', 'gap-list');
      for (const c of list) {
        const li = el('li', null, c.requirement);
        if (c.status === 'partly' && c.missingWords.length) {
          li.appendChild(el('span', 'missing-words', 'Not found in your CV: ' + c.missingWords.slice(0, 5).join(', ')));
        }
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
      box.appendChild(wrap);
    };
    group('Not shown in your CV', 'dot-missing', missing);
    group('Only partly shown', 'dot-partly', partly);
    group('Already shown', 'dot-shown', shown, true);
  }

  function renderChanges(changes) {
    const box = $('changes');
    box.textContent = '';
    $('changeCount').textContent = String(changes.length);
    if (!changes.length) {
      box.appendChild(el('p', 'empty', 'Nothing was rephrased this time. Your points were only reordered.'));
      return;
    }
    // Show kept-original ones first so people notice them.
    const sorted = [...changes].sort((a, b) => Number(a.used) - Number(b.used));
    for (const c of sorted) {
      const card = el('article', 'change');
      card.appendChild(el('span', 'chip ' + (c.used ? 'chip-ok' : 'chip-kept'), c.used ? (c.kind === 'profile' ? 'Profile rephrased' : 'Rephrased') : 'Kept your wording'));
      const pair = el('div', 'pair');
      const before = el('p');
      before.appendChild(el('span', 'tag', 'You wrote'));
      before.appendChild(document.createTextNode(c.original));
      const after = el('p', c.used ? 'after' : 'rejected');
      after.appendChild(el('span', 'tag', c.used ? 'Now reads' : 'AI suggested (not used)'));
      after.appendChild(document.createTextNode(c.proposed));
      pair.appendChild(before);
      pair.appendChild(after);
      card.appendChild(pair);
      if (!c.used && c.reasons.length) {
        const ul = el('ul', 'reasons');
        c.reasons.slice(0, 3).forEach((r) => ul.appendChild(el('li', null, r)));
        card.appendChild(ul);
      }
      box.appendChild(card);
    }
  }

  /* Tabs */
  const tabs = ['tab-cv', 'tab-gaps', 'tab-changes'];
  function selectTab(id) {
    for (const t of tabs) {
      const btn = $(t);
      const on = t === id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      $(btn.getAttribute('aria-controls')).hidden = !on;
    }
  }
  tabs.forEach((t, i) => {
    $(t).addEventListener('click', () => selectTab(t));
    $(t).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      $(next).focus();
    });
  });

  /* Back / reset */
  $('editBtn').addEventListener('click', () => {
    results.hidden = true;
    form.hidden = false;
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $('resetBtn').addEventListener('click', () => {
    cvEl.value = ''; titleEl.value = ''; jdEl.value = ''; outEl.value = '';
    $('cvFileNote').textContent = ''; $('jdFileNote').textContent = '';
    results.hidden = true;
    form.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    cvEl.focus();
  });

  /* ------------------------------------------------------------ */
  /* Copy / Word / PDF                                              */
  /* ------------------------------------------------------------ */
  const toast = $('toast');
  let toastTimer;
  function say(msg, isErr) {
    toast.textContent = msg;
    toast.classList.toggle('err', !!isErr);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.textContent = ''; }, 4000);
  }

  function fileBase() {
    const name = (E.layoutBlocks(outEl.value).find((b) => b.type === 'name') || {}).text || 'CV';
    const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return clean(name + ' CV' + (lastJobTitle ? ' - ' + lastJobTitle : '')) || 'CV';
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  $('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(outEl.value);
      say('Copied. Paste it wherever you need it.');
    } catch {
      outEl.focus();
      outEl.select();
      const ok = document.execCommand && document.execCommand('copy');
      say(ok ? 'Copied. Paste it wherever you need it.' : 'Select the text and copy it manually.', !ok);
    }
  });

  $('docxBtn').addEventListener('click', async () => {
    const btn = $('docxBtn');
    btn.disabled = true;
    try {
      await loadScript('vendor/docx.min.js');
      const d = window.docx;
      const blocks = E.layoutBlocks(outEl.value);
      const font = 'Calibri';
      const children = [];
      for (const b of blocks) {
        if (b.type === 'space') continue;
        if (b.type === 'name') children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 60 }, children: [new d.TextRun({ text: b.text, bold: true, size: 36, font })] }));
        else if (b.type === 'contact') children.push(new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { after: 40 }, children: [new d.TextRun({ text: b.text, size: 20, font, color: '444444' })] }));
        else if (b.type === 'heading') children.push(new d.Paragraph({ spacing: { before: 240, after: 80 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: '1F43B8', space: 2 } }, children: [new d.TextRun({ text: b.text, bold: true, size: 22, font, color: '1F43B8' })] }));
        else if (b.type === 'subhead') children.push(new d.Paragraph({ spacing: { before: 100, after: 20 }, children: [new d.TextRun({ text: b.text, bold: true, size: 21, font })] }));
        else if (b.type === 'bullet') children.push(new d.Paragraph({ numbering: { reference: 'cv-bullets', level: 0 }, spacing: { after: 40 }, children: [new d.TextRun({ text: b.text, size: 21, font })] }));
        else children.push(new d.Paragraph({ spacing: { after: 60 }, children: [new d.TextRun({ text: b.text, size: 21, font })] }));
      }
      const doc = new d.Document({
        creator: 'TrueCVFit',
        numbering: { config: [{ reference: 'cv-bullets', levels: [{ level: 0, format: d.LevelFormat.BULLET, text: '•', alignment: d.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
        sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
      });
      const blob = await d.Packer.toBlob(doc);
      download(blob, fileBase() + '.docx');
      say('Word file downloaded.');
    } catch (err) {
      say('Sorry, the Word file couldn\'t be made. Try Copy text instead.', true);
    } finally {
      btn.disabled = false;
    }
  });

  async function fontBase64(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  $('pdfBtn').addEventListener('click', async () => {
    const btn = $('pdfBtn');
    btn.disabled = true;
    try {
      await loadScript('vendor/jspdf.umd.min.js');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const [reg, bold] = await Promise.all([fontBase64('fonts/NotoSans_400Regular.ttf'), fontBase64('fonts/NotoSans_700Bold.ttf')]);
      pdf.addFileToVFS('NotoSans-Regular.ttf', reg);
      pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      pdf.addFileToVFS('NotoSans-Bold.ttf', bold);
      pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
      pdf.setProperties({ title: fileBase(), creator: 'TrueCVFit' });

      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const M = 50;
      const maxW = W - M * 2;
      let y = M;
      const ensure = (h) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
      const write = (text, { size = 10.5, style = 'normal', color = [24, 33, 43], indent = 0, align = 'left', gapAfter = 3, lead = 1.35 } = {}) => {
        pdf.setFont('NotoSans', style);
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, maxW - indent);
        const lh = size * lead;
        for (const line of lines) {
          ensure(lh);
          const x = align === 'center' ? W / 2 : M + indent;
          pdf.text(line, x, y + size, { align });
          y += lh;
        }
        y += gapAfter;
        return lines.length;
      };

      for (const b of E.layoutBlocks(outEl.value)) {
        if (b.type === 'space') { y += 3; continue; }
        if (b.type === 'name') write(b.text, { size: 19, style: 'bold', align: 'center', gapAfter: 4 });
        else if (b.type === 'contact') write(b.text, { size: 9.5, color: [80, 88, 98], align: 'center', gapAfter: 1 });
        else if (b.type === 'heading') {
          y += 8;
          ensure(40);
          write(b.text, { size: 11, style: 'bold', color: [31, 67, 184], gapAfter: 0 });
          pdf.setDrawColor(31, 67, 184);
          pdf.setLineWidth(0.7);
          pdf.line(M, y + 1, W - M, y + 1);
          y += 7;
        } else if (b.type === 'subhead') { y += 2; ensure(30); write(b.text, { size: 10.5, style: 'bold', gapAfter: 1 }); }
        else if (b.type === 'bullet') {
          pdf.setFont('NotoSans', 'normal');
          pdf.setFontSize(10.5);
          ensure(15);
          pdf.setTextColor(24, 33, 43);
          pdf.text('•', M + 4, y + 10.5);
          write(b.text, { indent: 16, gapAfter: 2 });
        } else write(b.text, { gapAfter: 3 });
      }
      download(pdf.output('blob'), fileBase() + '.pdf');
      say('PDF downloaded.');
    } catch (err) {
      say('Sorry, the PDF couldn\'t be made. Try Word or Copy text instead.', true);
    } finally {
      btn.disabled = false;
    }
  });
})();
