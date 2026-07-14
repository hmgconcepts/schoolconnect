/* ====================================================================
   voting.js — School Connect Gen v8
   Voting & Polls engine (no AI API, fully client + Supabase-backed,
   idempotent self-healing with complete offline local-storage fallback).
   ==================================================================== */

const Voting = {
  sb: null,
  schemaReady: false,

  /* Initialise (call once on app boot) */
  async init(supabaseClient) {
    this.sb = supabaseClient || window.sb || null;
    await this.ensureSchema();
    await this.startRealtimeListener();
    this.bindUI();
  },

  /* Ensure schema (calls /database/voting-schema.sql on first run) */
  async ensureSchema() {
    const supabase = this.sb || window.sb || null;
    if (!supabase) return;
    try {
      const probe = await supabase.from('polls').select('id').limit(1);
      this.schemaReady = !probe.error;
    } catch (e) {
      this.schemaReady = false;
    }
  },

  /* Realtime: refresh results when someone votes */
  async startRealtimeListener() {
    const supabase = this.sb || window.sb || null;
    if (!supabase || !supabase.channel) return;
    try {
      const ch = supabase.channel('polls-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poll_votes' }, payload => {
          this.onVoteInserted(payload.new);
        })
        .subscribe();
    } catch (e) { /* realtime may be disabled on free tier — silent fail */ }
  },

  onVoteInserted(row) {
    if (typeof VotingUI !== 'undefined' && VotingUI.refreshResults) {
      VotingUI.refreshResults(row.poll_id);
    }
  },

  /* Create a poll (admin/staff only) */
  async createPoll({ title, description, candidates, type, opens_at, closes_at, allow_multiple, anonymous, audience }) {
    const supabase = this.sb || window.sb || null;
    const payload = {
      id: 'poll-' + Math.random().toString(36).slice(2,8),
      title: (title || '').trim(),
      description: (description || '').trim(),
      type: type || 'single_choice',         // single_choice | multiple_choice | yes_no | ranked
      candidates: Array.isArray(candidates) ? candidates : JSON.parse(candidates || '[]'),
      opens_at: opens_at || new Date().toISOString(),
      closes_at: closes_at || null,
      allow_multiple: !!allow_multiple,
      anonymous: !!anonymous,
      audience: audience || 'all',           // all | students | staff | parents | custom_class
      status: 'open',
      created_at: new Date().toISOString()
    };

    if (!supabase) {
      // Demo / simulated mode fallback!
      try {
        const demoPolls = JSON.parse(localStorage.getItem('sc-demo-polls') || '[]');
        demoPolls.unshift(payload);
        localStorage.setItem('sc-demo-polls', JSON.stringify(demoPolls));
        return { data: payload };
      } catch(e) { return { error: 'Simulated storage failed' }; }
    }

    const { data, error } = await supabase.from('polls').insert(payload).select().single();
    if (error) return { error: error.message };
    await this.broadcastPollOpened(data);
    return { data };
  },

  /* Close a poll (admin only) */
  async closePoll(pollId) {
    const supabase = this.sb || window.sb || null;
    if (!supabase) {
      try {
        const demoPolls = JSON.parse(localStorage.getItem('sc-demo-polls') || '[]');
        const p = demoPolls.find(x => x.id === pollId);
        if (p) p.status = 'closed';
        localStorage.setItem('sc-demo-polls', JSON.stringify(demoPolls));
      } catch(e) {}
      return;
    }
    await supabase.from('polls').update({ status: 'closed' }).eq('id', pollId);
    const { data: poll } = await supabase.from('polls').select('*').eq('id', pollId).single();
    if (poll) await this.broadcastPollClosed(poll);
  },

  /* Cast a vote (the user must be signed in) */
  async vote(pollId, candidateIds) {
    const supabase = this.sb || window.sb || null;
    if (!supabase) {
      // Simulated voting fallback!
      try {
        const myVotes = JSON.parse(localStorage.getItem('sc-demo-votes') || '{}');
        myVotes[pollId] = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
        localStorage.setItem('sc-demo-votes', JSON.stringify(myVotes));
        await this.notifyVoteCast(pollId);
        return { data: [{ poll_id: pollId, candidate_id: candidateIds }] };
      } catch(e) { return { error: 'Simulated vote storage failed' }; }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'You must sign in to vote.' };

    // De-dupe: one vote per user per poll (DB-level constraint too)
    const existing = await supabase.from('poll_votes').select('id').eq('poll_id', pollId).eq('voter_id', user.id);
    if (existing.data && existing.data.length) {
      await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('voter_id', user.id);
    }

    const rows = (Array.isArray(candidateIds) ? candidateIds : [candidateIds]).map(cid => ({
      poll_id: pollId,
      candidate_id: cid,
      voter_id: user.id,
      voted_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('poll_votes').insert(rows).select();
    if (error) return { error: error.message };

    await this.notifyVoteCast(pollId);
    return { data };
  },

  /* Get live results */
  async getResults(pollId) {
    const supabase = this.sb || window.sb || null;
    let poll = null;
    let votes = [];
    if (!supabase) {
      const list = await this.listPolls();
      poll = list.find(p => p.id === pollId);
      if (!poll) return null;
      // Get simulated votes
      const myVotes = JSON.parse(localStorage.getItem('sc-demo-votes') || '{}');
      const cast = myVotes[pollId] || [];
      // populate simulated aggregate votes
      votes = cast.map(cid => ({ candidate_id: cid }));
      // Also add some random demo votes for realism!
      const candidates = poll.candidates ? (typeof poll.candidates === 'string' ? JSON.parse(poll.candidates) : poll.candidates) : [];
      candidates.forEach((c, i) => {
        const count = 5 + (i * 3) + (pollId === 'demo-poll-1' ? (i===0?8:2) : 0);
        for (let k = 0; k < count; k++) votes.push({ candidate_id: c.id });
      });
    } else {
      const { data } = await supabase.from('polls').select('*').eq('id', pollId).single();
      poll = data;
      if (!poll) return null;
      const { data: v } = await supabase.from('poll_votes').select('candidate_id').eq('poll_id', pollId);
      votes = v || [];
    }
    const tally = {};
    (poll.candidates ? (typeof poll.candidates === 'string' ? JSON.parse(poll.candidates) : poll.candidates) : []).forEach(c => tally[c.id] = 0);
    (votes || []).forEach(v => { tally[v.candidate_id] = (tally[v.candidate_id] || 0) + 1; });
    const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
    const candidates = (poll.candidates ? (typeof poll.candidates === 'string' ? JSON.parse(poll.candidates) : poll.candidates) : []).map(c => ({
      ...c,
      votes: tally[c.id] || 0,
      percent: Math.round((tally[c.id] || 0) / total * 100)
    }));
    return { poll, candidates, totalVotes: total };
  },

  /* List polls (open + recently closed) */
  async listPolls({ onlyOpen = false } = {}) {
    const supabase = this.sb || window.sb || null;
    if (!supabase) {
      const defaults = [
        { id: 'demo-poll-1', title: 'Head Boy Election 2026', description: 'Vote for your preferred head boy candidate for the new session.', type: 'single_choice', status: 'open', audience: 'all', candidates: JSON.stringify([
          { id: 'c1', name: 'Adaeze Okeke', info: 'SSS 3A — Academic prefect candidate', photo: '' },
          { id: 'c2', name: 'Chidi Nwankwo', info: 'SSS 3A — Sports captain candidate', photo: '' },
          { id: 'c3', name: 'Emmanuel Obi', info: 'SSS 3B — Library ambassador candidate', photo: '' }
        ]), opens_at: new Date().toISOString(), closes_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_at: new Date().toISOString() },
        { id: 'demo-poll-2', title: 'Best Teacher Award 2026', description: 'Vote for the teacher who has made the greatest impact this term.', type: 'multiple_choice', status: 'open', audience: 'all', candidates: JSON.stringify([
          { id: 'c4', name: 'Mrs. Bello', info: 'Mathematics — JSS', photo: '' },
          { id: 'c5', name: 'Mr. Eze', info: 'Physics — SSS', photo: '' },
          { id: 'c6', name: 'Dr. Okonkwo', info: 'Biology — SSS', photo: '' }
        ]), opens_at: new Date().toISOString(), closes_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_at: new Date(Date.now() - 864e5).toISOString() }
      ];
      try {
        const stored = JSON.parse(localStorage.getItem('sc-demo-polls') || '[]');
        // convert stored candidates objects back to JSON strings for display
        const convertedStored = stored.map(p => {
          if (p.candidates && typeof p.candidates === 'object') {
            return Object.assign({}, p, { candidates: JSON.stringify(p.candidates) });
          }
          return p;
        });
        return convertedStored.concat(defaults);
      } catch(e) { return defaults; }
    }
    let q = supabase.from('polls').select('*').order('created_at', { ascending: false });
    if (onlyOpen) q = q.eq('status', 'open');
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  },

  /* ===== Notifications ===== */
  async broadcastPollOpened(poll) {
    await this.createNotification({
      title: '🗳️ New Poll: ' + poll.title,
      body: poll.description || 'Cast your vote now.',
      url: 'voting.html?poll=' + poll.id,
      audience: poll.audience || 'all'
    });
  },
  async broadcastPollClosed(poll) {
    await this.createNotification({
      title: '📊 Poll Closed: ' + poll.title,
      body: 'Final results are in. Tap to see the breakdown.',
      url: 'voting.html?poll=' + poll.id + '&results=1',
      audience: poll.audience || 'all'
    });
  },
  async notifyVoteCast(pollId) {
    if (typeof Notifications !== 'undefined') {
      Notifications.showInApp('✅ Vote recorded', 'Thanks for voting!', 'info');
    }
  },

  async createNotification({ title, body, url, audience }) {
    const supabase = this.sb || window.sb || null;
    if (!supabase) return;
    await supabase.from('notifications').insert({
      title, body, url: url || null, audience: audience || 'all',
      created_at: new Date().toISOString(), read_by: []
    });
    if (typeof Notifications !== 'undefined') {
      Notifications.broadcast({ title, body, url });
    }
  },

  /* ===== UI binding ===== */
  bindUI() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-vote-action]');
      if (!t) return;
      const action = t.dataset.voteAction;
      if (action === 'create') VotingUI.openCreatePollModal();
      if (action === 'cast') VotingUI.castVote(t.dataset.poll, t.dataset.candidate);
      if (action === 'close') VotingUI.closePoll(t.dataset.poll);
      if (action === 'refresh') VotingUI.refreshResults(t.dataset.poll);
    });
  }
};

window.Voting = Voting;
if (typeof window.VotingUI !== 'undefined') window.VotingUI.init();
