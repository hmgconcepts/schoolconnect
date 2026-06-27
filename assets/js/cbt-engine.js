/* ====================================================================
   cbt-engine.js — School Connect Gen v2 (embedded CBT engine)
   --------------------------------------------------------------------
   A full, free, browser-only Computer-Based-Testing engine that mirrors
   the HMG Academy Standalone CBT system and is INTERCONNECTED with the
   School Connect database so exam results flow straight into report cards.

   • 17 question types with auto/partial scoring (no AI API)
   • CSV / manual question authoring
   • Negative marking, attempt limits, randomisation, question selection
   • Timer, navigator, flag-for-review, auto-save draft, one submission
   • Anti-cheat: tab-switch / blur / copy-paste / right-click / fullscreen
   • Verifiable certificate / submission code
   • Held results, instant results, emergency JSON backup
   • Result → report-card mapping (subject + assessment column)

   Shared by cbt.html (teacher) and cbt-exam.html (student).
   ==================================================================== */

const CBT = {
  sb: null,

  /* The 17 supported question types (id -> label). */
  TYPES: {
    mcq:            'Multiple Choice (A–D)',
    mrq:            'Multiple Response (choose many)',
    truefalse:      'True / False',
    short:          'Short Answer',
    numeric:        'Numeric (with tolerance)',
    matching:       'Matching pairs',
    ordering:       'Ordering / Sequence',
    cloze:          'Cloze (fill in the gaps)',
    essay:          'Essay (rule-based keywords)',
    categorization: 'Categorization',
    multinumeric:   'Multi-part Numeric',
    assertion:      'Assertion–Reason',
    casestudy:      'Case Study (sub-questions)',
    image:          'Image-based MCQ',
    matrix:         'Matrix / Grid',
    hottext:        'Hot-text (select words)',
    code:           'Code / Algorithm response'
  },

  init(supabaseClient) { this.sb = supabaseClient; },

  /* ---------------- ID / code helpers ---------------- */
  genCode(len = 6) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },
  genCertCode() { return 'CERT-' + this.genCode(4) + '-' + this.genCode(4); },

  /* ====================================================================
     QUESTION AUTHORING — CSV PARSER
     Header (extended, compatible with HMG CBT):
     Question,A,B,C,D,CorrectAnswer,Explanation,Type,Tolerance,Unit,Accept,MRQ_AON,Pairs,Items,Difficulty,Tags,Section
     ==================================================================== */
  parseCSV(text) {
    const rows = CBT._csvToRows(text);
    if (!rows.length) return [];
    const header = rows[0].map(h => (h || '').trim().toLowerCase());
    const idx = name => header.indexOf(name);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.join('').trim()) continue;
      const get = n => { const i = idx(n); return i >= 0 ? (row[i] || '').trim() : ''; };
      const type = (get('type') || 'mcq').toLowerCase();
      const q = {
        question: get('question'),
        type,
        options: [get('a'), get('b'), get('c'), get('d')].filter(x => x !== ''),
        correct: get('correctanswer'),
        explanation: get('explanation'),
        tolerance: parseFloat(get('tolerance')) || 0,
        unit: get('unit'),
        accept: get('accept'),
        mrq_aon: (get('mrq_aon') || '').toLowerCase() === 'true' || get('mrq_aon') === '1',
        pairs: get('pairs'),
        items: get('items'),
        difficulty: get('difficulty'),
        tags: get('tags'),
        section: get('section')
      };
      if (q.question) out.push(q);
    }
    return out;
  },

  /* RFC-4180-ish CSV reader that respects quotes and embedded commas/newlines */
  _csvToRows(text) {
    const rows = []; let row = []; let field = ''; let inQ = false;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  },

  csvTemplate() {
    return 'Question,A,B,C,D,CorrectAnswer,Explanation,Type,Tolerance,Unit,Accept,MRQ_AON,Pairs,Items,Difficulty,Tags,Section\n' +
      '"What is 2 + 2?",1,2,4,5,C,"Basic addition.",mcq,,,,,,,Easy,Arithmetic,Numbers\n' +
      '"The earth is flat.",,,,,B,"It is an oblate spheroid.",truefalse,,,,,,,Easy,Science,Earth\n' +
      '"Solve x where 2x = 10",,,,,5,"Divide both sides by 2.",numeric,0.01,,,,,,Medium,Algebra,Equations\n';
  },

  /* ====================================================================
     SCORING — deterministic, free, no AI. Returns per-question marks.
     Each question is worth 1 mark by default unless q.marks is set.
     ==================================================================== */
  scoreQuestion(q, answer) {
    const max = Number(q.marks) || 1;
    const norm = s => String(s == null ? '' : s).trim().toLowerCase();
    switch ((q.type || 'mcq').toLowerCase()) {
      case 'mcq': case 'image': case 'assertion':
        return norm(answer) === norm(q.correct) ? max : 0;
      case 'truefalse':
        return norm(answer) === norm(q.correct) ? max : 0;
      case 'mrq': {
        const correct = norm(q.correct).split(/[|,]/).map(s => s.trim()).filter(Boolean).sort();
        const given = (Array.isArray(answer) ? answer : norm(answer).split(/[|,]/)).map(s => norm(s)).filter(Boolean).sort();
        if (!correct.length) return 0;
        if (q.mrq_aon) return JSON.stringify(correct) === JSON.stringify(given) ? max : 0;
        // partial: +per correct, -per wrong, clamp 0..max
        let hit = 0, wrong = 0;
        given.forEach(g => correct.includes(g) ? hit++ : wrong++);
        const frac = Math.max(0, (hit - wrong)) / correct.length;
        return +(frac * max).toFixed(2);
      }
      case 'short': {
        const accepted = [norm(q.correct), ...norm(q.accept).split('|')].map(s => s.trim()).filter(Boolean);
        return accepted.includes(norm(answer)) ? max : 0;
      }
      case 'numeric': {
        const a = parseFloat(answer), c = parseFloat(q.correct), tol = Number(q.tolerance) || 0;
        if (isNaN(a) || isNaN(c)) return 0;
        return Math.abs(a - c) <= tol ? max : 0;
      }
      case 'multinumeric': {
        const corr = norm(q.correct).split('|').map(s => parseFloat(s));
        const given = (Array.isArray(answer) ? answer : norm(answer).split('|')).map(s => parseFloat(s));
        if (!corr.length) return 0;
        let hit = 0; corr.forEach((c, i) => { if (!isNaN(given[i]) && Math.abs(given[i] - c) <= (Number(q.tolerance) || 0)) hit++; });
        return +((hit / corr.length) * max).toFixed(2);
      }
      case 'matching': case 'categorization': case 'matrix': {
        // q.correct like "1=A|2=C|3=B" ; answer same shape (string or object)
        const pairs = norm(q.correct).split('|').filter(Boolean);
        const ansMap = {};
        (Array.isArray(answer) ? answer : norm(answer).split('|')).forEach(p => { const [k, v] = p.split('='); if (k) ansMap[k.trim()] = (v || '').trim(); });
        if (!pairs.length) return 0;
        let hit = 0; pairs.forEach(p => { const [k, v] = p.split('='); if (ansMap[(k || '').trim()] === (v || '').trim()) hit++; });
        return +((hit / pairs.length) * max).toFixed(2);
      }
      case 'ordering': case 'hottext': {
        const corr = norm(q.correct).split('|').map(s => s.trim());
        const given = (Array.isArray(answer) ? answer : norm(answer).split('|')).map(s => s.trim());
        if (!corr.length) return 0;
        let hit = 0; corr.forEach((c, i) => { if (given[i] === c) hit++; });
        return +((hit / corr.length) * max).toFixed(2);
      }
      case 'cloze': {
        const corr = norm(q.correct).split('|').map(s => s.trim());
        const given = (Array.isArray(answer) ? answer : norm(answer).split('|')).map(s => s.trim());
        if (!corr.length) return 0;
        let hit = 0; corr.forEach((c, i) => { if ((given[i] || '') === c) hit++; });
        return +((hit / corr.length) * max).toFixed(2);
      }
      case 'essay': case 'code': {
        // Rule-based: award marks for required keywords + minimum word count.
        const keywords = norm(q.correct).split('|').map(s => s.trim()).filter(Boolean);
        const minWords = Number(q.tolerance) || 0;
        const text = norm(answer);
        const words = text.split(/\s+/).filter(Boolean).length;
        if (!keywords.length) return words >= minWords ? max : 0;
        let hit = 0; keywords.forEach(k => { if (text.includes(k)) hit++; });
        let frac = hit / keywords.length;
        if (minWords && words < minWords) frac *= 0.5; // penalise short answers
        return +(frac * max).toFixed(2);
      }
      case 'casestudy': {
        // q.subs = [{...question}]; answer = array of sub-answers
        if (!Array.isArray(q.subs) || !q.subs.length) return 0;
        let got = 0, tot = 0;
        q.subs.forEach((sub, i) => { tot += Number(sub.marks) || 1; got += CBT.scoreQuestion(sub, (answer || [])[i]); });
        return tot ? +((got / tot) * max).toFixed(2) : 0;
      }
      default:
        return norm(answer) === norm(q.correct) ? max : 0;
    }
  },

  /* Score a whole submission. Returns a rich result object. */
  gradeSubmission(exam, answers) {
    const questions = exam._questions || exam.questions || [];
    let raw = 0, maxTotal = 0, correct = 0, wrong = 0, skipped = 0;
    const perQ = [];
    questions.forEach((q, i) => {
      const max = Number(q.marks) || 1;
      maxTotal += max;
      const a = answers[i];
      const empty = a == null || a === '' || (Array.isArray(a) && a.length === 0);
      const got = empty ? 0 : CBT.scoreQuestion(q, a);
      raw += got;
      if (empty) skipped++;
      else if (got >= max) correct++;
      else if (got <= 0) wrong++;
      else correct++; // partial counts as (partially) correct
      perQ.push({ i, got, max, type: q.type });
    });
    // Negative marking on fully-wrong objective answers
    const neg = Number(exam.negative_mark) || 0;
    let score = raw - (neg * wrong);
    if (score < 0) score = 0;
    const pct = maxTotal ? +((score / maxTotal) * 100).toFixed(2) : 0;
    return {
      score: +score.toFixed(2), raw: +raw.toFixed(2), total: maxTotal,
      percent: pct, correct, wrong, skipped, perQ,
      grade: CBT.grade(pct)
    };
  },

  grade(pct) {
    if (pct >= 70) return 'A';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 45) return 'D';
    if (pct >= 40) return 'E';
    return 'F';
  },

  /* ====================================================================
     RANDOMISATION & SELECTION
     ==================================================================== */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },
  prepareForStudent(exam) {
    let qs = (exam.csv_data || exam.questions || []).slice();
    if (exam.randomise !== false) qs = CBT.shuffle(qs);
    const n = Number(exam.select_count) || 0;
    if (n > 0 && n < qs.length) qs = qs.slice(0, n);
    exam._questions = qs;
    return qs;
  },

  /* ====================================================================
     ANTI-CHEAT MONITOR (browser-only, free)
     ==================================================================== */
  startAntiCheat(config, onViolation) {
    config = config || {};
    const log = [];
    const fire = (type) => { log.push({ type, at: new Date().toISOString() }); if (onViolation) onViolation(type, log.length); };
    const handlers = [];
    const add = (target, ev, fn) => { target.addEventListener(ev, fn); handlers.push(() => target.removeEventListener(ev, fn)); };
    if (config.tab_switch !== false) add(document, 'visibilitychange', () => { if (document.hidden) fire('tab_switch'); });
    if (config.window_blur !== false) add(window, 'blur', () => fire('window_blur'));
    if (config.copy_paste !== false) { ['copy', 'cut', 'paste'].forEach(ev => add(document, ev, e => { e.preventDefault(); fire('copy_paste'); })); }
    if (config.right_click !== false) add(document, 'contextmenu', e => { e.preventDefault(); fire('right_click'); });
    if (config.devtools !== false) add(document, 'keydown', e => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key.toUpperCase() === 'U')) { e.preventDefault(); fire('devtools'); }
    });
    return { log, stop() { handlers.forEach(h => h()); } };
  },

  /* ====================================================================
     PERSISTENCE — exams & results (interconnected with School Connect DB)
     ==================================================================== */
  async createExam(exam) {
    if (!this.sb) return { error: 'No database' };
    const payload = {
      code: exam.code || CBT.genCode(),
      subject: exam.subject || 'General',
      class: exam.class || '',
      term: exam.term || '',
      session: exam.session || '',
      topic: exam.topic || '',
      assessment_type: exam.assessment_type || 'exam',   // exam | test | assignment | project | quiz
      report_column: exam.report_column || '',           // links to a report-card column
      max_score: Number(exam.max_score) || 0,            // for report-card mapping
      duration: Number(exam.duration) || 45,
      attempt_limit: Number(exam.attempt_limit) || 1,
      select_count: Number(exam.select_count) || 0,
      negative_mark: Number(exam.negative_mark) || 0,
      attempt_limit: Number(exam.attempt_limit) || 1,
      randomise: exam.randomise !== false,
      exam_mode: exam.exam_mode || 'open',
      is_open: !!exam.is_open,
      release_results: exam.release_results !== false,
      instructions: exam.instructions || '',
      anti_cheat_config: exam.anti_cheat_config || { tab_switch: true, window_blur: true, copy_paste: true, right_click: true, fullscreen: true, devtools: true, max_violations: 5 },
      certificate_enabled: exam.certificate_enabled !== false,
      release_results: exam.release_results !== false,
      start_at: exam.start_at || null,
      close_at: exam.close_at || null,
      csv_data: exam.csv_data || []
    };
    return await this.sb.from('cbt_exams').insert(payload).select().single();
  },

  async listExams() {
    if (!this.sb) return { data: [] };
    return await this.sb.from('cbt_exams').select('*').order('created_at', { ascending: false });
  },

  async getExamByCode(code) {
    if (!this.sb) return { error: 'No database' };
    return await this.sb.from('cbt_exams').select('*').eq('code', (code || '').toUpperCase().trim()).maybeSingle();
  },

  /* Save a result AND (if mapped) push it into the report-card scores table. */
  async submitResult(exam, student, graded, meta) {
    if (!this.sb) return { error: 'No database' };
    const cert = exam.certificate_enabled !== false ? CBT.genCertCode() : '';
    const row = {
      exam_id: exam.id,
      student_name: student.name,
      student_class: student.class || exam.class || '',
      student_id_ref: student.id_ref || '',
      student_type: exam.exam_mode || 'open',
      score: graded.score, total: graded.total, percent: graded.percent,
      correct_count: graded.correct, wrong_count: graded.wrong, skipped_count: graded.skipped,
      time_taken: (meta && meta.time_taken) || 0,
      violations: (meta && meta.violations) || 0,
      violation_log: (meta && meta.violation_log) || [],
      answers_data: (meta && meta.answers) || null,
      cert_code: cert
    };
    const res = await this.sb.from('cbt_results').insert(row).select().single();
    // Interconnection: push into report card if exam is mapped to a column.
    if (!res.error && exam.report_column && exam.subject) {
      try {
        await this.sb.rpc('cbt_push_to_reportcard', {
          p_student_name: student.name,
          p_student_id_ref: student.id_ref || '',
          p_class: student.class || exam.class || '',
          p_subject: exam.subject,
          p_term: exam.term || '',
          p_session: exam.session || '',
          p_column: exam.report_column,
          p_raw_score: graded.score,
          p_raw_total: graded.total,
          p_max_score: Number(exam.max_score) || graded.total
        });
      } catch (e) { /* report-card module may not be installed; safe to ignore */ }
    }
    return { ...res, cert_code: cert };
  }
};

if (typeof window !== 'undefined') window.CBT = CBT;
if (typeof console !== 'undefined') console.log('%c[School Connect Gen v2] CBT engine loaded — 17 question types, no AI.', 'color:#7c3aed;font-weight:bold');
