/*
 * TrueCVFit engine
 * ----------------
 * Everything in this file runs on the user's own device. It does no network
 * calls. It reads a CV and a job description, works out what matters, reorders
 * the CV, finds gaps, and checks AI rewrites for anything invented.
 *
 * Works in the browser (window.TrueCVFit) and in Node (module.exports) so it
 * can be tested.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Word lists                                                          */
  /* ------------------------------------------------------------------ */

  const STOPWORDS = new Set((
    'a about above across after again against all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each either etc few for from further had has have having ' +
    'he her here hers him his how i if in into is it its itself just me more most my no nor not of off on once only or other ' +
    'our ours out over own per same she should so some such than that the their theirs them then there these they this ' +
    'those through to too under until up upon us very via was we were what when where which while who whom why will with ' +
    'within without would you your yours yourself within across among including include includes e.g eg i.e ie & + / ' +
    'role job candidate candidates applicant applicants position company organisation organization team teams ' +
    'we\'re you\'ll you\'ve we\'ll it\'s we\'d they\'re looking seeking join joining opportunity opportunities ' +
    'ideal ideally successful apply application closing date salary hours week weeks month months year years day days ' +
    'full part time permanent temporary contract based location remote hybrid office benefits package per annum pa ' +
    'please must should may might will shall able ability abilities skill skills knowledge understanding ' +
    'experience experienced proven demonstrable demonstrated strong excellent good great high highly well ' +
    'essential desirable required requirement requirements preferred plus bonus key main new range wide variety ' +
    'work working works worked within ensure ensuring other others etc using use used ' +
    'responsible responsibilities responsibility duty duties include including involve involves involved '
  ).split(/\s+/).filter(Boolean));

  // Words that frequently appear in a rewrite as plain rephrasing. A rewrite may
  // use these even if the original bullet did not, because they do not add a
  // new skill, tool or claim.
  const REPHRASE_OK = new Set((
    'support supported supporting supports help helped helping helps assist assisted assisting assists ' +
    'carry carried carrying complete completed completing handle handled handling provide provided providing ' +
    'prepare prepared preparing produce produced producing create created creating make made making ' +
    'organise organised organising organize organized organizing plan planned planning run ran running ' +
    'contribute contributed contributing maintain maintained maintaining respond responded responding ' +
    'follow followed following take took taking perform performed performing conduct conducted conducting ' +
    'undertake undertook undertaking deal dealt dealing update updated updating record recorded recording ' +
    'keep kept keeping set setting get got give gave giving put check checked checking ' +
    'daily weekly monthly regular regularly each every across range variety both various several ' +
    'clear clearly accurate accurately timely promptly consistent consistently ' +
    'people person individual individuals group groups staff colleague colleagues ' +
    'task tasks activity activities area areas part parts way ways needs need ' +
    'deliver delivered delivering delivery'
  ).split(/\s+/).filter(Boolean));

  // Verbs that make a role sound bigger. A rewrite may only use one of these if
  // the original bullet already used the same idea.
  const SENIORITY = {
    lead: ['led', 'lead', 'leads', 'leading', 'leader', 'leadership'],
    manage: ['managed', 'manage', 'manages', 'managing', 'manager', 'management'],
    head: ['headed', 'heading up', 'headed up'],
    spearhead: ['spearheaded', 'spearhead', 'spearheading'],
    direct: ['directed', 'direct', 'directing', 'director'],
    oversee: ['oversaw', 'oversee', 'overseeing', 'overseen'],
    supervise: ['supervised', 'supervise', 'supervising', 'supervisor', 'supervision'],
    own: ['owned', 'ownership'],
    mentor: ['mentored', 'mentor', 'mentoring', 'mentors'],
    launch: ['launched', 'launch', 'launching'],
    found: ['founded', 'co-founded', 'cofounded', 'founder', 'co-founder'],
    establish: ['established', 'establish', 'establishing'],
    pioneer: ['pioneered', 'pioneer', 'pioneering'],
    champion: ['championed', 'champion', 'championing'],
    drive: ['drove', 'driven', 'drive', 'driving'],
    orchestrate: ['orchestrated', 'orchestrate', 'orchestrating'],
    chair: ['chaired', 'chair', 'chairing'],
    coordinate: ['coordinated', 'coordinate', 'coordinating', 'coordinator', 'co-ordinated', 'co-ordinate', 'co-ordinating'],
    delegate: ['delegated', 'delegate', 'delegating'],
    train: ['trained', 'training others'],
    design: ['designed', 'design', 'designing'],
    architect: ['architected'],
    strategy: ['strategised', 'strategized', 'strategic', 'strategy'],
    transform: ['transformed', 'transform', 'transforming', 'transformation'],
    revolutionise: ['revolutionised', 'revolutionized'],
  };

  // Buzzwords the rewrite is not allowed to add.
  const BUZZWORDS = [
    'results-driven', 'results driven', 'results-oriented', 'results oriented', 'detail-oriented', 'detail oriented',
    'dynamic', 'synergy', 'synergies', 'synergise', 'synergize', 'go-getter', 'self-starter', 'self starter',
    'team player', 'hard-working', 'hardworking', 'hard working', 'highly motivated', 'motivated', 'passionate',
    'dedicated', 'proactive', 'innovative', 'innovator', 'cutting-edge', 'cutting edge', 'world-class', 'world class',
    'best-in-class', 'best in class', 'best-of-breed', 'thought leader', 'thought leadership', 'rockstar', 'rock star',
    'ninja', 'guru', 'wizard', 'visionary', 'game-changer', 'game changer', 'game-changing', 'value-add', 'value add',
    'leverage', 'leveraged', 'leveraging', 'utilise', 'utilised', 'utilising', 'utilize', 'utilized', 'utilizing',
    'seamless', 'seamlessly', 'robust', 'holistic', 'paradigm', 'out of the box', 'outside the box', 'think outside',
    'proven track record', 'track record', 'strong work ethic', 'excellent communication skills', 'excellent communicator',
    'people person', 'go-to', 'best practice', 'best practices', 'move the needle', 'deep dive', 'circle back',
    'impactful', 'meticulous', 'meticulously', 'exceptional', 'exceptionally', 'outstanding', 'stellar', 'unparalleled',
    'tireless', 'tirelessly', 'adept', 'astute', 'savvy', 'thrive', 'thrives', 'thriving', 'dynamic environment',
    'fast-paced', 'fast paced', 'spearheaded', 'spearheading', 'myriad', 'plethora', 'foster', 'fostered', 'fostering',
    'cultivate', 'cultivated', 'empower', 'empowered', 'empowering', 'elevate', 'elevated', 'showcase', 'showcased',
    'navigate', 'navigated', 'navigating', 'delve', 'delved', 'testament', 'tapestry', 'pivotal', 'instrumental',
    'invaluable', 'unwavering', 'commitment to excellence', 'passion for', 'driven individual', 'highly skilled',
    'skilled professional', 'versatile', 'resilient', 'excel', 'excelled', 'excels', 'streamline', 'streamlined',
    'optimise', 'optimised', 'optimize', 'optimized', 'enhance', 'enhanced', 'enhancing', 'bolster', 'bolstered',
  ];

  const NUMBER_WORDS = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100',
    dozen: '12', half: '0.5', double: 'x2', twice: 'x2', triple: 'x3', tripled: 'x3', doubled: 'x2',
  };

  /* ------------------------------------------------------------------ */
  /* Section headings                                                    */
  /* ------------------------------------------------------------------ */

  const HEADINGS = {
    profile: ['profile', 'personal profile', 'professional profile', 'summary', 'professional summary', 'career summary',
      'personal statement', 'about me', 'about', 'objective', 'career objective', 'career profile', 'executive summary', 'overview'],
    experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history',
      'work history', 'career history', 'relevant experience', 'other experience', 'additional experience',
      'volunteering', 'volunteer experience', 'volunteer work', 'voluntary work', 'voluntary experience',
      'volunteering experience', 'leadership', 'leadership experience', 'projects', 'key projects', 'project experience',
      'research', 'research experience', 'placements', 'placement', 'internships', 'internship', 'work placements',
      'achievements', 'key achievements', 'career highlights', 'positions of responsibility', 'extracurricular activities',
      'extra-curricular activities', 'teaching experience', 'relevant work experience', 'professional history',
      'experience and achievements', 'work and volunteering', 'employment and volunteering'],
    education: ['education', 'education and training', 'education & training', 'qualifications', 'academic qualifications',
      'academic background', 'educational background', 'education and qualifications', 'education & qualifications',
      'academic history'],
    skills: ['skills', 'key skills', 'core skills', 'technical skills', 'core competencies', 'competencies',
      'skills and competencies', 'skills & competencies', 'areas of expertise', 'expertise', 'skills summary',
      'it skills', 'digital skills', 'software', 'tools', 'tools and technologies', 'technologies', 'skills and tools',
      'skills & tools', 'transferable skills', 'relevant skills', 'skills and abilities', 'skills & abilities'],
    other: ['certifications', 'certificates', 'certifications and training', 'certifications & training', 'licences',
      'licenses', 'courses', 'training', 'training and development', 'professional development', 'cpd', 'awards',
      'honours', 'honors', 'awards and achievements', 'publications', 'languages', 'interests', 'hobbies',
      'hobbies and interests', 'hobbies & interests', 'interests and hobbies', 'references', 'referees',
      'additional information', 'memberships', 'professional memberships', 'affiliations', 'personal details',
      'contact', 'contact details', 'personal information', 'conferences', 'presentations'],
  };

  const HEADING_LOOKUP = (() => {
    const m = new Map();
    for (const type of Object.keys(HEADINGS)) for (const h of HEADINGS[type]) m.set(h, type);
    return m;
  })();

  const BULLET_RE = /^\s*(?:[•●▪◦‣∙·*➢➤►▶■□✓✔–—-]|\(?\d{1,2}[.)])\s+/;
  const DATE_RE = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)?\d{2}\b|\b(?:present|current|to date|now)\b/i;
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
  const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com)\/\S+/gi;

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function normaliseText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/^[ \t]*[\uE000-\uF8FF][ \t]*/gm, '• ') // bullet glyphs from Word/PDF symbol fonts
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/ ([\u0300-\u036f])/g, '$1') // stray space before an accent mark (PDFs)
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ \f\v]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const IRREGULAR = {
    grew: 'grow', grown: 'grow', ran: 'run', led: 'lead', wrote: 'write', written: 'write', took: 'take', taken: 'take',
    gave: 'give', given: 'give', made: 'make', built: 'build', taught: 'teach', sold: 'sell', bought: 'buy', began: 'begin',
    begun: 'begin', kept: 'keep', met: 'meet', spoke: 'speak', spoken: 'speak', brought: 'bring', thought: 'think',
    drove: 'drive', driven: 'drive', oversaw: 'oversee', overseen: 'oversee', chose: 'choose', chosen: 'choose',
    won: 'win', set: 'set', sent: 'send', spent: 'spend', held: 'hold', told: 'tell', saw: 'see', seen: 'see',
    knew: 'know', known: 'know', did: 'do', done: 'do', went: 'go', gone: 'go', got: 'get', dealt: 'deal', felt: 'feel',
    left: 'leave', lent: 'lend', paid: 'pay', said: 'say', understood: 'understand', undertook: 'undertake',
    children: 'child', people: 'person', analyses: 'analysis', analysed: 'analysis', analyzed: 'analysis',
    analyse: 'analysis', analyze: 'analysis', analysing: 'analysis', analyzing: 'analysis',
  };

  function stem(w) {
    w = w.toLowerCase();
    if (IRREGULAR[w]) w = IRREGULAR[w];
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/sses$/.test(w)) return w.slice(0, -2);
    const cut = (re) => {
      const m = w.match(re);
      if (m && w.length - m[0].length >= 4) { w = w.slice(0, w.length - m[0].length); return true; }
      return false;
    };
    if (!/(?:ss|us|is)$/.test(w)) cut(/s$/);
    if (cut(/ation$/)) w += 'at';
    else cut(/ment$/) || cut(/ing$/) || cut(/(?:edly|ed)$/) || cut(/er$/) || cut(/ly$/);
    if (w.length > 4 && /([^aeiouls])\1$/.test(w)) w = w.slice(0, -1); // planned -> plann -> plan
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1); // create -> creat
    if (/iz$/.test(w)) w = w.slice(0, -2) + 'is'; // organiz -> organis
    if (/is$/.test(w) && w.length > 5) w = w.slice(0, -2) + 'is';
    return w;
  }

  function words(text) {
    return (String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9+#.'&-]*[a-z0-9+#]|[a-z0-9]/g) || [])
      .map((w) => w.replace(/'s$/, ''));
  }

  function contentWords(text) {
    return words(text).filter((w) => !STOPWORDS.has(w) && !/^\d+$/.test(w) && w.length > 1);
  }

  function stems(text) {
    return contentWords(text).map(stem);
  }

  function stemSet(text) {
    return new Set(stems(text));
  }

  function wordCount(s) {
    return (String(s).match(/\S+/g) || []).length;
  }

  function stripBullet(line) {
    return line.replace(BULLET_RE, '').trim();
  }

  function classifyHeading(line) {
    const raw = line.trim();
    if (!raw || raw.length > 60) return null;
    if (BULLET_RE.test(raw)) return null;
    const norm = raw.toLowerCase().replace(/[:：.\-–—|]+$/g, '').replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim();
    if (HEADING_LOOKUP.has(norm)) return HEADING_LOOKUP.get(norm);
    // ALL CAPS short line that contains a heading word, e.g. "WORK EXPERIENCE & VOLUNTEERING"
    const letters = raw.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 4 && letters === letters.toUpperCase() && wordCount(raw) <= 6) {
      for (const [h, type] of HEADING_LOOKUP) {
        if (h.length >= 5 && norm.includes(h)) return type;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* CV parsing                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Turns CV text into a list of items:
   *   header  - name and contact lines (kept exactly, never sent anywhere)
   *   heading - section headings
   *   bullet  - experience points that may be reordered and rewritten
   *   fixed   - job titles, employers, dates, education lines (kept exactly)
   *   skill   - skills lines (may be reordered, never rewritten)
   *   profile - the profile/summary paragraph (may be rewritten)
   *   blank   - spacing
   */
  function parseCV(text) {
    let lines = normaliseText(text).split('\n');

    // Merge lone bullet glyphs with the following line (common in PDFs).
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*[•●▪◦‣∙·*➢➤►▶■]\s*$/.test(l) && i + 1 < lines.length) {
        merged.push('• ' + lines[i + 1].trim());
        i++;
      } else merged.push(l);
    }
    lines = merged;

    const firstHeading = lines.findIndex((l) => classifyHeading(l));
    const items = [];
    let section = 'experience';
    let start = 0;

    if (firstHeading > 0) {
      for (let i = 0; i < firstHeading; i++) items.push({ kind: lines[i].trim() ? 'header' : 'blank', text: lines[i].trim() });
      start = firstHeading;
    } else if (firstHeading === -1) {
      // No recognisable headings: treat the top lines up to the first long line as the header.
      let i = 0;
      while (i < lines.length && i < 6 && wordCount(lines[i]) < 9 && !BULLET_RE.test(lines[i])) {
        items.push({ kind: lines[i].trim() ? 'header' : 'blank', text: lines[i].trim() });
        i++;
      }
      start = i;
    }

    let profileBuffer = null;
    const flushProfile = () => {
      if (profileBuffer && profileBuffer.length) {
        items.push({ kind: 'profile', text: profileBuffer.join(' ').replace(/\s+/g, ' ').trim() });
      }
      profileBuffer = null;
    };

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const headingType = classifyHeading(line);

      if (headingType) {
        flushProfile();
        section = headingType;
        items.push({ kind: 'heading', text: trimmed.replace(/[:：]+$/, ''), section });
        if (section === 'profile') profileBuffer = [];
        continue;
      }
      if (!trimmed) {
        if (section === 'profile' && profileBuffer && profileBuffer.length) {
          // a blank line inside a profile ends that paragraph
          flushProfile();
          profileBuffer = [];
        }
        items.push({ kind: 'blank', text: '' });
        continue;
      }

      if (section === 'profile') {
        if (!profileBuffer) profileBuffer = [];
        profileBuffer.push(stripBullet(trimmed));
        continue;
      }

      const hasMarker = BULLET_RE.test(line);
      const content = stripBullet(trimmed);
      const prev = items[items.length - 1];

      // Continuation of a wrapped bullet (very common when copying from PDFs):
      // the line starts in lower case and the previous item is a bullet.
      if (!hasMarker && prev && prev.kind === 'bullet' && /^[a-z(&]/.test(content)) {
        prev.text = (prev.text + ' ' + content).replace(/\s+/g, ' ');
        continue;
      }

      if (section === 'skills') {
        items.push({ kind: 'skill', text: content, marker: hasMarker });
        continue;
      }

      if (section === 'experience') {
        const looksLikeTitle = DATE_RE.test(content) && wordCount(content) <= 14;
        if (hasMarker && !looksLikeTitle) {
          items.push({ kind: 'bullet', text: content });
          continue;
        }
        if (!hasMarker && wordCount(content) >= 9 && !looksLikeTitle && !/[|]/.test(content)) {
          items.push({ kind: 'bullet', text: content, unmarked: true });
          continue;
        }
      }

      items.push({ kind: 'fixed', text: content, marker: hasMarker });
    }
    flushProfile();

    // Give rewritable items stable ids.
    let n = 0;
    for (const it of items) {
      if (it.kind === 'bullet' || it.kind === 'profile') it.id = 'b' + ++n;
    }
    return { items };
  }

  /* ------------------------------------------------------------------ */
  /* Job description analysis                                            */
  /* ------------------------------------------------------------------ */

  const REQ_CUES = /\b(experience|experienced|knowledge|ability|able to|skill|skills|proficien|familiar|understanding|degree|qualification|qualified|must|essential|desirable|required|requirement|demonstrat|proven|track record|certif|competen|confident|comfortable|working knowledge|background in|expertise|you will have|you have|you'll have|responsible for|you will|you'll)\b/i;

  const REQ_GENERIC = new Set((
    'experience experienc abilit able skill knowledge understand understanding strong excellent good proven demonstrable demonstrat ' +
    'desirable essential required must including working work candidate role will plus ideally preferred relevant ' +
    'similar equivalent level previous prior proficien proficient familiar familiarity confident comfortable ' +
    'responsible responsibl have has you we our use using'
  ).split(/\s+/).map(stem));

  function extractRequirements(jdText) {
    const lines = normaliseText(jdText).split('\n').map((l) => l.trim()).filter(Boolean);
    const reqs = [];
    const seen = new Set();
    const push = (t) => {
      const clean = stripBullet(t).replace(/\s+/g, ' ').trim().replace(/[;,.]$/, '');
      if (wordCount(clean) < 3 || wordCount(clean) > 45) return;
      if (/:$/.test(clean)) return; // a sub-heading like "What you'll need:"
      if (/\b(join our|join the|to join|about us|about the role|we offer|we are a|we're a|equal opportunit)/i.test(clean)) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      const s = stems(clean).filter((x) => !REQ_GENERIC.has(x));
      if (s.length < 1) return;
      seen.add(key);
      reqs.push(clean);
    };
    for (const line of lines) {
      if (BULLET_RE.test(line)) { push(line); continue; }
      // Split long paragraphs into sentences and keep those that read like requirements.
      const sentences = line.split(/(?<=[.!?;])\s+(?=[A-Z(])/);
      for (const s of sentences) if (REQ_CUES.test(s)) push(s);
    }
    return reqs.slice(0, 30);
  }

  /** Weighted keyword map from the job description. */
  function jdWeights(jdText, jobTitle, requirements) {
    const w = new Map();
    const add = (s, amount) => w.set(s, (w.get(s) || 0) + amount);
    for (const s of stems(jdText)) add(s, 1);
    for (const r of requirements) for (const s of new Set(stems(r))) if (!REQ_GENERIC.has(s)) add(s, 1.5);
    for (const s of new Set(stems(jobTitle))) add(s, 3);
    // Damp very frequent words so one repeated word doesn't dominate.
    for (const [k, v] of w) w.set(k, Math.log2(1 + v));
    return w;
  }

  function scoreText(text, weights) {
    const s = stems(text);
    if (!s.length) return 0;
    let total = 0;
    const seen = new Set();
    for (const x of s) {
      if (seen.has(x)) continue;
      seen.add(x);
      total += weights.get(x) || 0;
    }
    return total / Math.sqrt(Math.max(4, s.length));
  }

  /** How well the CV covers each job requirement. */
  function coverage(requirements, cvText) {
    const cv = stemSet(cvText);
    return requirements.map((req) => {
      const reqStems = [...new Set(stems(req))].filter((s) => !REQ_GENERIC.has(s));
      const found = reqStems.filter((s) => cv.has(s));
      const missingStems = new Set(reqStems.filter((s) => !cv.has(s)));
      // Report the job description's own words, not the internal word stems.
      const missing = [];
      for (const m of String(req).match(/[A-Za-z0-9][A-Za-z0-9+#.&-]*[A-Za-z0-9+#]|[A-Za-z]/g) || []) {
        const st = stem(m.toLowerCase());
        if (missingStems.has(st) && !STOPWORDS.has(m.toLowerCase())) { missing.push(m); missingStems.delete(st); }
      }
      const ratio = reqStems.length ? found.length / reqStems.length : 1;
      const status = ratio >= 0.6 ? 'shown' : ratio >= 0.3 ? 'partly' : 'missing';
      return { requirement: req, status, ratio, missingWords: missing };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tailoring (deterministic part)                                      */
  /* ------------------------------------------------------------------ */

  function splitSkills(text) {
    const sep = /\s*[,|;•·]\s*/;
    const parts = text.split(sep).map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts : null;
  }

  /**
   * Prepare a tailoring plan: scores, reordering and what (if anything) to send
   * to the AI. Personal details are never included in what is sent.
   */
  function analyse(cvText, jobTitle, jdText) {
    const parsed = parseCV(cvText);
    const requirements = extractRequirements(jdText);
    const weights = jdWeights(jdText, jobTitle, requirements);

    for (const it of parsed.items) {
      if (it.kind === 'bullet' || it.kind === 'skill' || it.kind === 'profile') it.score = scoreText(it.text, weights);
    }

    const bodyText = parsed.items.filter((i) => i.kind !== 'header').map((i) => i.text).join('\n');
    const cov = coverage(requirements, bodyText);

    // Only send bullets that actually relate to the job, best first, capped.
    const rewritable = parsed.items
      .filter((i) => i.kind === 'bullet' && i.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    const profile = parsed.items.find((i) => i.kind === 'profile');

    return {
      parsed,
      requirements,
      coverage: cov,
      weights,
      toRewrite: rewritable.map((b) => ({ id: b.id, text: redact(b.text) })),
      profile: profile ? { id: profile.id, text: redact(profile.text) } : null,
    };
  }

  function redact(text) {
    return text.replace(EMAIL_RE, '[email]').replace(URL_RE, '[link]').replace(PHONE_RE, (m) => (/\d{7,}/.test(m.replace(/\D/g, '')) ? '[phone]' : m));
  }

  /* ------------------------------------------------------------------ */
  /* Honesty checks                                                      */
  /* ------------------------------------------------------------------ */

  function numbersIn(text) {
    const out = new Set();
    const t = String(text).toLowerCase().replace(/(\d),(\d{3})/g, '$1$2');
    for (const m of t.match(/\d+(?:\.\d+)?/g) || []) out.add(String(parseFloat(m)));
    for (const w of words(t)) if (NUMBER_WORDS[w]) out.add(NUMBER_WORDS[w]);
    return out;
  }

  function lowerWordSet(text) {
    return new Set(words(text));
  }

  function phraseIn(text, phrase) {
    const re = new RegExp('(^|[^a-z])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[ -]') + '($|[^a-z])', 'i');
    return re.test(text);
  }

  /** The words in a job description that describe skills and duties (not the company blurb). */
  function jdClaimStems(jdText, jobTitle) {
    const reqs = extractRequirements(jdText);
    const source = reqs.length ? reqs.join('\n') : String(jdText || '');
    return stemSet(source + '\n' + (jobTitle || ''));
  }

  /**
   * Check one rewrite against what the user actually wrote.
   * @param original   the user's own text for this point
   * @param rewritten  the AI's version
   * @param ctx        { jdText }
   * @returns { ok: boolean, reasons: string[] }
   */
  function checkRewrite(original, rewritten, ctx) {
    const reasons = [];
    const o = String(original || '').trim();
    const r = String(rewritten || '').trim();
    if (!r) return { ok: false, reasons: ['The rewrite came back empty.'] };
    if (r.length > Math.max(o.length * 1.6, o.length + 60)) reasons.push('The rewrite was much longer than your original.');
    if (/\[(email|phone|link)\]/.test(r)) reasons.push('The rewrite contained a placeholder.');

    // 1. Numbers must come from the original.
    const oNums = numbersIn(o);
    for (const n of numbersIn(r)) if (!oNums.has(n)) reasons.push(`It added the number "${n}", which isn't in your original.`);

    // 2. Names, tools and acronyms must come from the original.
    const oWords = lowerWordSet(o);
    const oStems = new Set([...oWords].map(stem));
    const tokens = r.match(/[A-Za-z][A-Za-z0-9+#.&'’-]*[A-Za-z0-9+#]|[A-Za-z]/g) || [];
    let sentenceStart = true;
    let idx = 0;
    const flagged = new Set();
    for (const tok of tokens) {
      const pos = r.indexOf(tok, idx);
      idx = pos + tok.length;
      const before = r.slice(0, pos).trimEnd();
      sentenceStart = before === '' || /[.!?:;]$/.test(before);
      const clean = tok.replace(/['’]s$/, '');
      const lower = clean.toLowerCase();
      const isAcronym = /^[A-Z0-9+#&.]{2,}$/.test(clean) && /[A-Z]/.test(clean);
      const isMixed = /[a-z][A-Z]|[A-Z].*\d|\d.*[A-Z]/.test(clean);
      const isCapitalised = /^[A-Z]/.test(clean) && !sentenceStart;
      if ((isAcronym || isMixed || isCapitalised) && !oWords.has(lower) && !oStems.has(stem(lower)) && lower !== 'i') {
        if (!flagged.has(lower)) {
          flagged.add(lower);
          reasons.push(`It added "${clean}", which isn't in your original.`);
        }
      }
    }

    // 3. No upgraded seniority.
    const oLower = o.toLowerCase();
    const rLower = r.toLowerCase();
    for (const forms of Object.values(SENIORITY)) {
      const inR = forms.find((f) => phraseIn(rLower, f));
      if (inR && !forms.some((f) => phraseIn(oLower, f))) {
        reasons.push(`It used "${inR}", which makes your role sound bigger than you described it.`);
      }
    }

    // 4. No new buzzwords.
    for (const b of BUZZWORDS) {
      if (phraseIn(rLower, b) && !phraseIn(oLower, b)) {
        reasons.push(`It added the buzzword "${b}".`);
        break;
      }
    }

    // 5. No skills or duties copied in from the job description.
    if (ctx && ctx.jdText) {
      const jd = ctx.jdStemSet || jdClaimStems(ctx.jdText, ctx.jobTitle);
      const added = [];
      for (const w of contentWords(r)) {
        const s = stem(w);
        if (oStems.has(s) || oWords.has(w)) continue;
        if (REPHRASE_OK.has(w) || REPHRASE_OK.has(s) || flagged.has(w)) continue;
        if (jd.has(s) && !added.includes(w)) added.push(w);
      }
      if (added.length) {
        reasons.push(`It added ${added.slice(0, 3).map((w) => `"${w}"`).join(', ')} from the job description, which your original doesn't mention.`);
      }
    }

    return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
  }

  /* ------------------------------------------------------------------ */
  /* Building the final CV                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Put the CV back together.
   * @param plan      result of analyse()
   * @param aiResult  { bullets: [{id,text}], profile: string } or null
   * @param jdText
   * @returns { text, changes, stats }
   */
  function assemble(plan, aiResult, jdText, jobTitle) {
    const items = plan.parsed.items.map((i) => ({ ...i }));
    const ctx = { jdText, jdStemSet: jdClaimStems(jdText, jobTitle) };
    const changes = [];
    const byId = new Map();
    if (aiResult && Array.isArray(aiResult.bullets)) {
      for (const b of aiResult.bullets) if (b && typeof b.id === 'string' && typeof b.text === 'string') byId.set(b.id, b.text.trim());
    }

    // Apply rewrites with checks.
    const bodyText = items.filter((i) => i.kind === 'bullet' || i.kind === 'profile' || i.kind === 'fixed').map((i) => i.text).join(' ');
    for (const it of items) {
      if (it.kind === 'bullet' && byId.has(it.id)) {
        const proposed = byId.get(it.id).replace(BULLET_RE, '').trim();
        if (proposed === it.text) continue;
        const check = checkRewrite(it.text, proposed, ctx);
        changes.push({ id: it.id, kind: 'bullet', original: it.text, proposed, used: check.ok, reasons: check.reasons });
        if (check.ok) it.text = proposed;
      }
      if (it.kind === 'profile' && aiResult && typeof aiResult.profile === 'string' && aiResult.profile.trim()) {
        const proposed = aiResult.profile.trim();
        if (proposed !== it.text) {
          // A profile may draw on anything in the CV body, so check it against the whole body.
          const check = checkRewrite(it.text + ' ' + bodyText, proposed, ctx);
          if (proposed.length > Math.max(it.text.length * 1.4, 500)) {
            check.ok = false;
            check.reasons.push('The rewrite was much longer than your original.');
          }
          changes.push({ id: it.id, kind: 'profile', original: it.text, proposed, used: check.ok, reasons: check.reasons });
          if (check.ok) it.text = proposed;
        }
      }
    }

    // Reorder bullets within each job (a run of consecutive bullets), best first.
    const reorderRuns = (kind) => {
      let i = 0;
      while (i < items.length) {
        if (items[i].kind !== kind) { i++; continue; }
        let j = i;
        while (j < items.length && items[j].kind === kind) j++;
        const run = items.slice(i, j);
        const sorted = run.map((x, k) => ({ x, k })).sort((a, b) => (b.x.score || 0) - (a.x.score || 0) || a.k - b.k).map((p) => p.x);
        items.splice(i, run.length, ...sorted);
        i = j;
      }
    };
    reorderRuns('bullet');
    reorderRuns('skill');

    // Reorder comma-separated skills within a line.
    for (const it of items) {
      if (it.kind !== 'skill') continue;
      const labelMatch = it.text.match(/^([^:]{2,40}):\s*(.+)$/);
      const label = labelMatch ? labelMatch[1] : null;
      const list = labelMatch ? labelMatch[2] : it.text;
      const parts = splitSkills(list);
      if (!parts) continue;
      const scored = parts.map((p, k) => ({ p, k, s: scoreText(p, plan.weights) }));
      scored.sort((a, b) => b.s - a.s || a.k - b.k);
      const sepMatch = list.match(/\s*[,|;•·]\s*/);
      const sep = sepMatch ? (sepMatch[0].trim() === ',' ? ', ' : ' ' + sepMatch[0].trim() + ' ') : ', ';
      const joined = scored.map((x) => x.p).join(sep);
      it.text = label ? `${label}: ${joined}` : joined;
    }

    // Write out plain text.
    const out = [];
    for (const it of items) {
      switch (it.kind) {
        case 'blank': if (out.length && out[out.length - 1] !== '') out.push(''); break;
        case 'heading':
          if (out.length && out[out.length - 1] !== '') out.push('');
          out.push(it.text.toUpperCase());
          break;
        case 'bullet': out.push('• ' + it.text); break;
        case 'skill': out.push((it.marker ? '• ' : '') + it.text); break;
        case 'fixed': out.push((it.marker ? '• ' : '') + it.text); break;
        default: out.push(it.text);
      }
    }
    const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    const stats = {
      rewritten: changes.filter((c) => c.used).length,
      kept: changes.filter((c) => !c.used).length,
      requirementsShown: plan.coverage.filter((c) => c.status === 'shown').length,
      requirementsTotal: plan.coverage.length,
    };
    return { text, changes, stats };
  }

  /* ------------------------------------------------------------------ */
  /* Reading the final text back for Word / PDF layout                    */
  /* ------------------------------------------------------------------ */

  /** Turn the (possibly user-edited) final text into styled blocks. */
  function layoutBlocks(text) {
    const lines = normaliseText(text).split('\n');
    const blocks = [];
    let seenHeading = false;
    let nameDone = false;
    let section = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { blocks.push({ type: 'space' }); continue; }
      const h = classifyHeading(line);
      if (h) { seenHeading = true; section = h; blocks.push({ type: 'heading', text: line.replace(/[:：]+$/, '').toUpperCase() }); continue; }
      if (!seenHeading) {
        if (!nameDone) { nameDone = true; blocks.push({ type: 'name', text: line }); }
        else blocks.push({ type: 'contact', text: line });
        continue;
      }
      if (BULLET_RE.test(line)) { blocks.push({ type: 'bullet', text: stripBullet(line) }); continue; }
      const strong = (section === 'experience' || section === 'education') && wordCount(line) <= 16 && !/[.]$/.test(line);
      blocks.push({ type: strong ? 'subhead' : 'para', text: line });
    }
    // trim leading/trailing/duplicate spaces
    return blocks.filter((b, i, a) => !(b.type === 'space' && (i === 0 || a[i - 1].type === 'space' || a[i - 1].type === 'heading')));
  }

  const api = {
    parseCV, extractRequirements, analyse, assemble, checkRewrite, coverage, layoutBlocks,
    normaliseText, redact, stem, stems, BUZZWORDS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrueCVFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
