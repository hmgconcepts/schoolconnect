/* ====================================================================
   enterprise.js — School Connect FINAL v2 enterprise add-ons
   --------------------------------------------------------------------
   New enterprise features sourced from a deep review of leading school
   platforms (Fedena, OpenEduCat, Kinderpedia, eSchool, Edumerge, Smart
   School ERP). 100% FREE tools, NO AI APIs, fully interconnected with the
   shared Supabase DB (window.sb) and config (window.SCHOOL).

   Provides (window.Enterprise):
     • timetable  — conflict-free timetable generator UI (calls SQL fn)
     • checkin     — QR / code self check-in attendance
     • diary       — student diary / daily homework log
     • surveys     — surveys & feedback forms
     • menu        — weekly meal / menu planner
     • security    — 2FA preference toggle (free Supabase email OTP)
     • i18n        — multi-language UI label store + accessibility helpers
   ==================================================================== */

const Enterprise = {
  sb: null,
  init(supabaseClient) { this.sb = supabaseClient || (typeof sb !== 'undefined' ? sb : null); this.i18n.applyAccessibility(); },
  esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  /* ================= 1) Timetable generator ================= */
  timetable: {
    async addRequirement(cls, subject, teacher, ppw, availableDays, isPartTime) {
      if (!Enterprise.sb) return { error: 'No DB' };
      const row = { class: cls, subject, teacher, periods_per_week: Number(ppw) || 1 };
      // Part-time support: only set availability when provided (NULL = full-time/all week)
      if (Array.isArray(availableDays) && availableDays.length) { row.available_days = availableDays; row.is_part_time = true; }
      else if (isPartTime === false) { row.available_days = null; row.is_part_time = false; }
      return await Enterprise.sb.from('timetable_requirements')
        .upsert(row, { onConflict: 'class,subject' });
    },
    async listRequirements(cls) {
      if (!Enterprise.sb) return { data: [] };
      return await Enterprise.sb.from('timetable_requirements').select('*').eq('class', cls).order('periods_per_week', { ascending: false });
    },
    async generate(cls, session, term, periodsPerDay) {
      if (!Enterprise.sb) return { error: 'No DB' };
      const { data, error } = await Enterprise.sb.rpc('generate_timetable', {
        p_class: cls, p_session: session || '', p_term: term || '', p_periods_per_day: Number(periodsPerDay) || 6
      });
      return { data, error };
    },
    async grid(cls, session, term) {
      if (!Enterprise.sb) return { data: [] };
      let q = Enterprise.sb.from('timetable').select('*').eq('class', cls);
      const { data } = await q;
      return { data: data || [] };
    }
  },

  /* ================= 2) QR / code self check-in ================= */
  checkin: {
    async record(studentIdRef, name, cls, method) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.from('attendance_checkins').insert({
        student_id_ref: studentIdRef, student_name: name || '', class: cls || '',
        method: method || 'qr', device: (typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : '')
      });
    },
    /* parse a scanned ID-card QR payload (JSON {id,name,type}) */
    parseQR(text) {
      try { const o = JSON.parse(text); return { id: o.id || '', name: o.name || '', type: o.type || 'student' }; }
      catch (e) { return { id: String(text || '').trim(), name: '', type: 'student' }; }
    }
  },

  /* ================= 3) Student diary / homework log ================= */
  diary: {
    async add(entry) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.from('student_diary').insert({
        student_id: entry.student_id || null, student_name: entry.student_name || '',
        class: entry.class || '', subject: entry.subject || '',
        entry_type: entry.entry_type || 'homework', title: entry.title || '', body: entry.body || ''
      });
    },
    async forStudent(name) {
      if (!Enterprise.sb) return { data: [] };
      return await Enterprise.sb.from('student_diary').select('*').eq('student_name', name).order('date', { ascending: false }).limit(50);
    },
    async acknowledge(id) {
      if (!Enterprise.sb) return;
      return await Enterprise.sb.from('student_diary').update({ acknowledged: true }).eq('id', id);
    }
  },

  /* ================= 4) Surveys / feedback forms ================= */
  surveys: {
    async create(s) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.from('surveys').insert({
        title: s.title, description: s.description || '', audience: s.audience || 'all',
        questions: s.questions || [], anonymous: s.anonymous !== false, is_open: true
      }).select().single();
    },
    async list() { if (!Enterprise.sb) return { data: [] }; return await Enterprise.sb.from('surveys').select('*').eq('is_open', true).order('created_at', { ascending: false }); },
    async respond(surveyId, answers) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.from('survey_responses').insert({ survey_id: surveyId, answers });
    },
    async results(surveyId) { if (!Enterprise.sb) return { data: [] }; return await Enterprise.sb.from('survey_responses').select('*').eq('survey_id', surveyId); }
  },

  /* ================= 5) Menu / meal planner ================= */
  menu: {
    async set(weekStart, day, meal, description, allergens) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.from('menu_planner').insert({ week_start: weekStart, day, meal, description, allergens: allergens || '' });
    },
    async week(weekStart) { if (!Enterprise.sb) return { data: [] }; return await Enterprise.sb.from('menu_planner').select('*').eq('week_start', weekStart); }
  },

  /* ================= 6) Security: 2FA preference ================= */
  security: {
    async getPrefs() {
      if (!Enterprise.sb) return { two_factor: false };
      const { data: { user } } = await Enterprise.sb.auth.getUser();
      if (!user) return { two_factor: false };
      const { data } = await Enterprise.sb.from('security_prefs').select('*').eq('user_id', user.id).maybeSingle();
      return data || { two_factor: false };
    },
    async setTwoFactor(on) {
      if (!Enterprise.sb) return { error: 'No DB' };
      const { data: { user } } = await Enterprise.sb.auth.getUser();
      if (!user) return { error: 'Not signed in' };
      return await Enterprise.sb.from('security_prefs').upsert({ user_id: user.id, two_factor: !!on, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    },
    /* Free 2FA via Supabase email OTP (no SMS/AI cost) */
    async sendEmailOtp(email) {
      if (!Enterprise.sb) return { error: 'No DB' };
      return await Enterprise.sb.auth.signInWithOtp({ email });
    }
  },

  /* ================= 7) i18n + accessibility (free) ================= */
  i18n: {
    lang: (typeof localStorage !== 'undefined' && localStorage.getItem('sc-lang')) || 'en',
    dict: {
      en: {}, // English uses the page's own text by default
      fr: { 'Dashboard': 'Tableau de bord', 'Students': 'Élèves', 'Results': 'Résultats', 'Fees': 'Frais', 'Sign in': 'Connexion' },
      sw: { 'Dashboard': 'Dashibodi', 'Students': 'Wanafunzi', 'Results': 'Matokeo', 'Fees': 'Ada', 'Sign in': 'Ingia' },
      ha: { 'Dashboard': 'Allon bayanai', 'Students': 'Ɗalibai', 'Results': 'Sakamako', 'Fees': 'Kuɗi', 'Sign in': 'Shiga' },
      yo: { 'Dashboard': 'Pátákó', 'Students': 'Akẹ́kọ̀ọ́', 'Results': 'Àbájáde', 'Fees': 'Owó ilé-ìwé', 'Sign in': 'Wọlé' },
      ig: { 'Dashboard': 'Bọọdụ', 'Students': 'Ụmụ akwụkwọ', 'Results': 'Nsonaazụ', 'Fees': 'Ụgwọ akwụkwọ', 'Sign in': 'Banye' }
    },
    t(key) { const d = this.dict[this.lang] || {}; return d[key] || key; },
    setLang(l) { this.lang = l; try { localStorage.setItem('sc-lang', l); } catch (e) {} this.translatePage(); },
    translatePage() {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = Enterprise.i18n.t(el.dataset.i18n); });
    },
    /* Accessibility: font scaling + high contrast, persisted */
    applyAccessibility() {
      if (typeof document === 'undefined') return;
      try {
        const fs = localStorage.getItem('sc-fontscale'); if (fs) document.documentElement.style.fontSize = fs;
        if (localStorage.getItem('sc-contrast') === '1') document.body.classList.add('sc-high-contrast');
      } catch (e) {}
    },
    setFontScale(pct) { document.documentElement.style.fontSize = pct + '%'; try { localStorage.setItem('sc-fontscale', pct + '%'); } catch (e) {} },
    toggleContrast() { const on = document.body.classList.toggle('sc-high-contrast'); try { localStorage.setItem('sc-contrast', on ? '1' : '0'); } catch (e) {} }
  }
};

if (typeof window !== 'undefined') window.Enterprise = Enterprise;
if (typeof console !== 'undefined') console.log('%c[School Connect FINAL v2] enterprise add-ons loaded — timetable generator, QR check-in, diary, surveys, menu, 2FA, i18n. No AI.', 'color:#0d9488;font-weight:bold');
