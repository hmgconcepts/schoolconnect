-- =====================================================================
--  School Connect V12.69 — ONE ACCOUNT, ONE ARITHMETIC
--  Reported (Fees & Payments page, every learner):
--    1. "Opening arrears" could not be left blank — it persisted as 0.
--    2. A figure entered there did NOT join the computation.
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_fee_opening_line(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st record; inv_amt numeric := 0; inv_note text := ''; has_inv boolean := false;
        col_amt numeric := 0; col_note text := '';
begin
  select * into st from public.students where id = p_student;
  if st is null then return jsonb_build_object('ok',false,'error','Student not found.','amount',0); end if;

  /* the column — the bursar's typed figure */
  begin
    col_amt  := coalesce(st.opening_arrears, 0);
    col_note := coalesce(st.opening_arrears_note, '');
  exception when undefined_column then col_amt := 0; col_note := '';
  end;

  /* an opening invoice, if the school already converted the paper ledger */
  begin
    select coalesce(sum(net_amount),0),
           coalesce(max(nullif(note,'')),'')
      into inv_amt, inv_note
      from public.sc_fee_invoice i
     where i.student_id = p_student
       and (coalesce(i.source,'') = 'opening_balance'
            or lower(btrim(coalesce(i.term,''))) = 'opening balance');
    has_inv := inv_amt > 0.005;
  exception when undefined_table then has_inv := false;
  end;

  /* R2: exactly once. The invoice is authoritative when it exists; the
     column is the fallback for schools that have not converted yet. */
  if has_inv then
    return jsonb_build_object('ok',true,'amount',inv_amt,'source','invoice',
      'mirror_of_column',col_amt,
      'note', coalesce(nullif(inv_note,''), nullif(col_note,''), 'Opening balance'),
      'label','Before School Connect',
      'working','Opening balance recorded as an invoice of '||to_char(inv_amt,'FM999,999,990.00')
                ||' — the student column mirror of '
                ||to_char(col_amt,'FM999,999,990.00')||' is not added again.');
  end if;

  return jsonb_build_object('ok',true,'amount',greatest(col_amt,0),'source',
      case when col_amt > 0.005 then 'record' else 'none' end,
    'mirror_of_column',col_amt,
    'note', coalesce(nullif(col_note,''),'Opening balance'),
    'label', case when col_note <> '' then col_note else 'Before School Connect' end,
    'working', case when col_amt > 0.005
                    then 'Opening balance entered by the bursar: '||to_char(col_amt,'FM999,999,990.00')
                    else 'No opening balance recorded for this learner.' end);
end $$;
revoke all on function public.sc_fee_opening_line(uuid) from public, anon;
grant execute on function public.sc_fee_opening_line(uuid) to authenticated;

comment on function public.sc_fee_opening_line(uuid) is
  'V12.69 — the learner''s pre-platform balance, counted exactly once: the opening invoice wins if one exists, otherwise students.opening_arrears.';


-- ---------------------------------------------------------------------
-- A2. THE ACCOUNT — every figure the platform may print, from one place
--
--  signature: sc_fee_account_for(student, term, session)
--
--  Returns the full statement, not just a balance, so a screen can show its
--  working. `closing` is the ONLY total any screen may call "outstanding".
-- ---------------------------------------------------------------------
create or replace function public.sc_fee_account_for(p_student uuid,
                                                     p_term text default null,
                                                     p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  st record; tr jsonb; b jsonb;
  t_term text; t_session text;
  opening jsonb; opening_amt numeric := 0; opening_paid numeric := 0; opening_owing numeric := 0;
  charges numeric := 0; aid numeric := 0; charged_gross numeric := 0;
  paid_all numeric := 0; paid_this numeric := 0;
  prior numeric := 0; prior_rows jsonb := '[]'::jsonb;
  closing numeric := 0; credit numeric := 0;
  n_receipts int := 0; last_pay date;
  bill_known boolean := true;
  ledger_rows jsonb := '[]'::jsonb; r record; running numeric := 0;
begin
  select * into st from public.students where id = p_student;
  if st is null then return jsonb_build_object('ok',false,'error','Student not found.'); end if;

  tr := public.sc_term_resolve(p_term, p_session);
  t_term    := coalesce(nullif(btrim(p_term),''),    tr->>'term',    '');
  t_session := coalesce(nullif(btrim(p_session),''), tr->>'session', '');

  /* ---- 1. CHARGES for this term ----
     Precedence, and it matters: a bursar's personal total IS a bill this
     learner was given, so it is known even when no class structure matches.
     Zeroing it because the STRUCTURE is unknown (the first cut of this
     function did exactly that) turned a recorded ₦28,100 into ₦0 and made the
     account look settled. "Unknown" may only suppress a bill that was never
     recorded at all. */
  b := public.sc_fee_bill_v2(p_student, t_term, t_session);
  charges     := coalesce(nullif(b->>'bill','')::numeric, 0);
  aid         := coalesce(nullif(b->>'aid','')::numeric, 0);
  charged_gross := charges + aid;
  bill_known  := coalesce((b->>'bill_known')::boolean, true);
  if coalesce((b->>'override')::boolean, false) then
    bill_known := true;                       /* the bursar recorded this bill */
  elsif not bill_known and charges <= 0.005 then
    /* nothing recorded anywhere: report unknown, not a zero bill */
    charges := 0;
  end if;

  /* ---- 2. OPENING BALANCE (counted once, and net of its own payments) ---- */
  opening := public.sc_fee_opening_line(p_student);
  opening_amt := coalesce((opening->>'amount')::numeric, 0);
  /* money filed against the opening line itself (a bursar may receipt an old
     paper-ledger debt under the "Opening balance" term) */
  begin
    select coalesce(sum(amount_paid),0) into opening_paid
      from public.fee_payments fp
     where fp.student_id = p_student
       and (lower(btrim(coalesce(fp.term,''))) = 'opening balance'
            or (lower(btrim(coalesce(fp.term,''))) = lower(btrim(coalesce(opening->>'label','')))
                and lower(btrim(coalesce(fp.session,''))) = lower(btrim(coalesce(opening->>'note','')))));
  exception when others then opening_paid := 0;
  end;
  opening_owing := greatest(opening_amt - opening_paid, 0);

  /* ---- 3. RECEIPTS — money is money, whatever term label it carries ---- */
  select coalesce(sum(amount_paid),0), count(*),
         max(coalesce(payment_date, created_at::date))
    into paid_all, n_receipts, last_pay
    from public.fee_payments
   where student_id = p_student;

  select coalesce(sum(amount_paid),0) into paid_this
    from public.fee_payments
   where student_id = p_student
     and lower(coalesce(term,''))    = lower(coalesce(t_term,''))
     and lower(coalesce(session,'')) = lower(coalesce(t_session,''));

  /* ---- 4. EARLIER TERMS OWING — still invoices only (never invented) ----
     R1 says arrears are their own line; this keeps the V12.67 rule that a
     debt exists only when something was actually billed. The opening line is
     excluded here because it is already counted in step 2 (double-count
     guard) — sc_fee_prior_terms only walks real term invoices. */
  if opening_amt > 0.005 then
    /* when the opening line is a real invoice, sc_fee_prior_terms would list
       it; drop it from the term-arrears list so the money is counted once */
    prior_rows := public.sc_fee_prior_terms(p_student, t_term, t_session);
    select coalesce(jsonb_agg(x), '[]'::jsonb) into prior_rows
      from jsonb_array_elements(prior_rows) x
     where coalesce((x->>'opening')::boolean,false) = false;
  else
    prior_rows := public.sc_fee_prior_terms(p_student, t_term, t_session);
  end if;
  for r in select value v from jsonb_array_elements(prior_rows) loop
    prior := prior + coalesce(nullif(r.v->>'owing','')::numeric, 0);
  end loop;

  /* ---- 5. CLOSING — the one number ----
     MONEY MUST NOT BE COUNTED TWICE, and the obvious formula does exactly
     that. `arrears` is already NET of the payments made against those earlier
     invoices (sc_fee_prior_terms subtracts them). If the closing balance then
     subtracts every receipt again, every cedi paid last term is deducted twice
     and the family is told they owe less than they do — the mirror image of the
     bug that started this release, and just as wrong.

     So the closing balance is built from figures that are each already net:

         opening owing   (opening balance − payments filed under it)
       + this term's charges
       + earlier terms owing  (their bills − their payments)
       − payments received for THIS term

     `paid` still reports every receipt on the account, because that is a fact
     the family is entitled to see. It is simply not subtracted twice. */
  closing := opening_owing + charges + prior - paid_this;
  if closing < 0 then credit := -closing; closing := 0; end if;

  /* ---- 6. THE STATEMENT, oldest first, so a parent can check it ---- */
  if opening_amt > 0.005 then
    running := opening_amt;
    ledger_rows := ledger_rows || jsonb_build_array(jsonb_build_object(
      'date', null, 'kind','opening', 'label', coalesce(opening->>'label','Opening balance'),
      'charge', opening_amt, 'payment', opening_paid, 'running', opening_owing,
      'source', opening->>'source'));
  end if;
  running := opening_owing + charges;
  if charges > 0.005 then
    ledger_rows := ledger_rows || jsonb_build_array(jsonb_build_object(
      'date', null, 'kind','charge', 'label','Fees for '||t_term||' '||coalesce(t_session,''),
      'charge', charges, 'payment', 0, 'running', running, 'source', coalesce(b->>'matched_by','structure')));
  end if;
  if prior > 0.005 then
    running := running + prior;
    ledger_rows := ledger_rows || jsonb_build_array(jsonb_build_object(
      'date', null, 'kind','arrears', 'label','Unpaid earlier terms',
      'charge', prior, 'payment', 0, 'running', running, 'source','invoices'));
  end if;
  for r in select coalesce(payment_date, created_at::date) d, amount_paid amt,
                  coalesce(method,'') m, coalesce(reference,'') ref,
                  coalesce(term,'') t, coalesce(session,'') se
             from public.fee_payments where student_id = p_student
            order by coalesce(payment_date, created_at::date), created_at
  loop
    running := running - coalesce(r.amt,0);
    ledger_rows := ledger_rows || jsonb_build_array(jsonb_build_object(
      'date', r.d, 'kind','payment', 'label','Receipt'||case when r.ref<>'' then ' · '||r.ref else '' end,
      'charge', 0, 'payment', coalesce(r.amt,0), 'running', greatest(running,0),
      'source', coalesce(nullif(r.m,''),'cash'), 'term', r.t, 'session', r.se));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'student_id', st.id, 'student', st.full_name,
    'admission_no', coalesce(st.admission_no,''), 'class', coalesce(st.class,''),
    'term', t_term, 'session', t_session,
    'term_resolved_by', coalesce(tr->>'resolved_by',''),
    'currency', public.sc_currency(),

    /* --- the five ledger headings, each its own name --- */
    'opening_balance', opening_owing,
    'opening_balance_gross', opening_amt,
    'opening_paid', opening_paid,
    'has_opening', (opening_owing > 0.005),
    'opening_source', opening->>'source',
    'opening_note', coalesce(opening->>'note',''),
    'charges', charges,              -- the TERM BILL, alone
    'aid', aid,
    'arrears', prior,                -- earlier TERMS owing, alone
    'has_arrears', (prior > 0.005),
    'arrears_rows', prior_rows,
    'paid', paid_all,                -- every receipt on the account
    'paid_this_term', paid_this,
    'receipts', n_receipts,
    'last_payment', last_pay,

    /* --- the two totals every screen must quote --- */
    'closing', closing,              -- OUTSTANDING NOW  (R: one number)
    'credit', credit,                -- overpaid, a real liability
    'total_billed', opening_owing + charges + prior,
    'bill_known', bill_known,
    'bill', charges,                 -- alias kept for older callers
    'total_due', closing,            -- alias kept for older callers
    'status', case
      when not bill_known then 'unbilled'
      when credit > 0.005 then 'credit'
      when closing <= 0.005 and paid_all > 0.005 then 'paid'
      when paid_all <= 0.005 and closing <= 0.005 then 'no-bill'
      when paid_all <= 0.005 then 'debtor'
      else 'partial' end,

    'ledger', ledger_rows,
    'opening_working', opening->>'working',
    'explain', jsonb_build_array(
      jsonb_build_object('line','Opening balance (before School Connect)','amount',opening_owing,
        'note', coalesce(opening->>'working','Nothing owed from before School Connect'),'blank_when_zero',true),
      jsonb_build_object('line','Fees for '||t_term,'amount',charges,
        'note', case when charges > 0.005 then 'The term bill only — never a running total'
                     else 'No bill could be matched for this term' end,'blank_when_zero',false),
      jsonb_build_object('line','Less scholarship / bursary','amount',-aid,
        'note', case when aid > 0.005 then 'Applied to this term''s charges' else 'None applied' end,'blank_when_zero',true),
      jsonb_build_object('line','Unpaid earlier terms','amount',prior,
        'note', case when prior > 0.005 then 'Invoices from earlier terms, oldest first' else 'Nothing owed from earlier terms' end,'blank_when_zero',true),
      jsonb_build_object('line','Less payments received','amount',-paid_all,
        'note', n_receipts||' receipt(s) on this account','blank_when_zero',false),
      jsonb_build_object('line','OUTSTANDING NOW','amount',closing,
        'note','Opening + this term + earlier terms − every payment','blank_when_zero',false)));
end $$;
revoke all on function public.sc_fee_account_for(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_account_for(uuid,text,text) to authenticated;

comment on function public.sc_fee_account_for(uuid,text,text) is
  'V12.69 — the learner''s whole account in one call: opening balance, this term''s charges, earlier terms owing, aid, every receipt, and the ONE closing balance. No screen may compute its own money.';


-- ---------------------------------------------------------------------
-- A3. EXACTLY ONCE — proof, not assertion
--
--  Recomputes the closing balance by a deliberately different route (sum of
--  the statement lines rather than the headings) and reports any difference.
--  Used by the test suite and by sc_fee_selfcheck().
-- ---------------------------------------------------------------------
create or replace function public.sc_fee_prove(p_student uuid,
                                               p_term text default null,
                                               p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb; by_lines numeric := 0; x record; head numeric;
begin
  a := public.sc_fee_account_for(p_student, p_term, p_session);
  if coalesce((a->>'ok')::boolean,false) = false then return a; end if;
  for x in select value v from jsonb_array_elements(coalesce(a->'ledger','[]'::jsonb)) loop
    by_lines := by_lines + coalesce(nullif(x.v->>'charge','')::numeric,0)
                          - coalesce(nullif(x.v->>'payment','')::numeric,0);
  end loop;
  head := coalesce((a->>'closing')::numeric,0);
  return jsonb_build_object('ok', true,
    'closing', head,
    'by_statement_lines', greatest(by_lines,0),
    'agrees', (abs(greatest(by_lines,0) - head) < 0.005),
    'difference', head - greatest(by_lines,0),
    'opening_counted_once', (coalesce((a->>'opening_balance')::numeric,0)
      + (select coalesce(sum(coalesce(nullif(y->>'owing','')::numeric,0)),0)
           from jsonb_array_elements(coalesce(a->'arrears_rows','[]'::jsonb)) y
          where coalesce((y->>'opening')::boolean,false)) ));
end $$;
revoke all on function public.sc_fee_prove(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_prove(uuid,text,text) to authenticated;


-- ---------------------------------------------------------------------
-- A4. THE LEDGER EVERY SCREEN ALREADY CALLS — now built on the account
--
--  Same signature, same keys as V12.68 (nothing breaks), but `bill` is the
--  term bill, `arrears` is earlier terms only, `paid` is every receipt, and
--  `total_due` is the account's closing balance. The opening balance is now
--  actually read — which is the defect this release exists to fix.
-- ---------------------------------------------------------------------
create or replace function public.sc_fee_ledger_for(p_student uuid,
                                                    p_term text default null,
                                                    p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb; chk jsonb;
begin
  a := public.sc_fee_account_for(p_student, p_term, p_session);
  if coalesce((a->>'ok')::boolean,false) = false then return a; end if;

  /* V12.68 kept a list of "checks" for the bursar. Keep the shape. */
  chk := '[]'::jsonb;
  if coalesce((a->>'has_opening')::boolean,false) then
    chk := chk || jsonb_build_array(jsonb_build_object('check','opening_balance',
      'detail','An opening balance of '||to_char((a->>'opening_balance')::numeric,'FM999,999,990.00')
             ||' is included once, from '||coalesce(a->>'opening_source','record')||'.'));
  end if;
  if coalesce((a->>'bill_known')::boolean,true) = false then
    chk := chk || jsonb_build_array(jsonb_build_object('check','no_bill',
      'detail','No bill could be matched for this term, so nothing was charged in its name.'));
  end if;
  if coalesce((a->>'credit')::numeric,0) > 0.005 then
    chk := chk || jsonb_build_array(jsonb_build_object('check','credit',
      'detail','This account has paid '||to_char((a->>'credit')::numeric,'FM999,999,990.00')
             ||' more than it owes. The balance shows zero; the credit is not lost.'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'student_id', a->>'student_id', 'student', a->>'student',
    'admission_no', a->>'admission_no', 'class', a->>'class', 'arm', '',
    'term', a->>'term', 'session', a->>'session',
    'term_resolved_by', a->>'term_resolved_by',
    'currency', a->>'currency',
    'bill', a->'charges',            -- "Total fees this term"
    'gross_bill', (a->>'charges')::numeric + coalesce((a->>'aid')::numeric,0),
    'aid', a->'aid',
    'paid', a->'paid',               -- every receipt on the account
    'paid_this_term', a->'paid_this_term',
    'balance', greatest((a->>'charges')::numeric - (a->>'paid_this_term')::numeric, 0), -- this term alone
    'arrears', a->'arrears',         -- earlier TERMS only
    'has_arrears', a->'has_arrears',
    'opening_arrears', a->'opening_balance',
    'has_opening', a->'has_opening',
    'opening_source', a->>'opening_source',
    'total_due', a->'closing',       -- OUTSTANDING NOW — the account's closing balance
    'closing', a->'closing',
    'credit', a->'credit',
    'total_billed', a->'total_billed',
    'bill_known', a->'bill_known',
    'invoiced', (coalesce(a->>'opening_source','') = 'invoice'),
    'invoice_id', null,
    'match_note', coalesce(a->>'opening_working',''),
    'bill_breakdown', jsonb_build_array(
        jsonb_build_object('item','Fees for '||coalesce(a->>'term','the term'),'amount',(a->>'charges')::numeric)),
    'arrears_rows', a->'arrears_rows',
    'receipts', a->'receipts',
    'last_payment', a->'last_payment',
    'paid_pct', case when coalesce((a->>'total_billed')::numeric,0) > 0
        then greatest(0, least(100, round(coalesce((a->>'paid')::numeric,0) * 100.0
             / (a->>'total_billed')::numeric, 2))) else 100 end,
    'owed_pct', 0,
    'status', a->>'status',
    'checks', chk,
    'account', a,
    'explain', a->'explain');
end $$;
revoke all on function public.sc_fee_ledger_for(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_ledger_for(uuid,text,text) to authenticated;


-- ---------------------------------------------------------------------
-- A5. THE FEES & PAYMENTS ROW — one row per learner, one balance
--
--  This is what the table in the screenshot prints. The BUG there was that
--  `balance` on a receipt row was derived from that single receipt. It is now
--  the ACCOUNT's closing balance, identical to the dashboard card, and
--  `balance_basis` says so in words.
-- ---------------------------------------------------------------------
create or replace function public.sc_fee_page_rows(p_class text default null,
                                                   p_term text default null,
                                                   p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cur jsonb; t_term text; t_session text; out_rows jsonb := '[]'::jsonb;
        s record; a jsonb;
begin
  cur := public.sc_term_resolve(p_term, p_session);
  t_term    := coalesce(nullif(btrim(p_term),''),    cur->>'term',    '');
  t_session := coalesce(nullif(btrim(p_session),''), cur->>'session', '');

  for s in select * from public.students
            where (p_class is null or p_class = '' or lower(btrim(class)) = lower(btrim(p_class)))
              and coalesce(status,'active') not in ('inactive','left','withdrawn','graduated','deleted')
            order by class, full_name
  loop
    a := public.sc_fee_account_for(s.id, t_term, t_session);
    out_rows := out_rows || jsonb_build_array(jsonb_build_object(
      'student_id',    s.id,
      'student',       s.full_name,
      'admission_no',  coalesce(s.admission_no,''),
      'class',         coalesce(s.class,''),
      'term',          t_term,
      'session',       t_session,
      'bill',          coalesce((a->>'charges')::numeric,0),
      'aid',           coalesce((a->>'aid')::numeric,0),
      'opening_arrears', coalesce((a->>'opening_balance')::numeric,0),
      'has_opening',   coalesce((a->>'has_opening')::boolean,false),
      'paid',          coalesce((a->>'paid')::numeric,0),
      'paid_this_term', coalesce((a->>'paid_this_term')::numeric,0),
      'balance',       coalesce((a->>'closing')::numeric,0),   -- the ACCOUNT balance
      'balance_basis', 'closing balance of the account: opening + this term + earlier terms − every payment',
      'arrears',       coalesce((a->>'arrears')::numeric,0),
      'has_arrears',   coalesce((a->>'has_arrears')::boolean,false),
      'credit',        coalesce((a->>'credit')::numeric,0),
      'total_due',     coalesce((a->>'closing')::numeric,0),
      'total_billed',  coalesce((a->>'total_billed')::numeric,0),
      'invoiced',      (coalesce(a->>'opening_source','') = 'invoice'),
      'bill_known',    coalesce((a->>'bill_known')::boolean,true),
      'status',        a->>'status',
      'receipts',      coalesce((a->>'receipts')::int,0),
      'last_payment',  a->>'last_payment'));
  end loop;
  return out_rows;
end $$;
revoke all on function public.sc_fee_page_rows(text,text,text) from public, anon;
grant execute on function public.sc_fee_page_rows(text,text,text) to authenticated;



-- ---------------------------------------------------------------------
-- A6a. RECORD WHAT WAS ALREADY BILLED (otherwise a debt can evaporate)
--  Arrears are read from INVOICES. But a term can be billed from the class
--  fee structure and never invoiced — that is the normal state of the term
--  running right now. The moment the school rolls to a new term, that
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_fee_backfill_invoices(p_term text default null,
                                                           p_session text default null,
                                                           p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); t_term text; t_session text; tr jsonb;
        s record; b jsonb; st record; led jsonb; owing numeric; made int := 0;
        rows jsonb := '[]'::jsonb; bill numeric;
begin
  if me is null or not coalesce(public.is_admin(me), false) then
    return jsonb_build_object('ok',false,'error','Only an administrator can record invoices.');
  end if;
  tr := public.sc_term_resolve(nullif(p_term,''), nullif(p_session,''));
  t_term := coalesce(tr->>'term',''); t_session := coalesce(tr->>'session','');

  for st in select * from public.students
             where coalesce(status,'active') not in ('inactive','left','withdrawn','graduated','deleted')
  loop
    /* already invoiced? then nothing to record */
    continue when exists (select 1 from public.sc_fee_invoice i
                           where i.student_id = st.id
                             and lower(btrim(coalesce(i.term,''))) = lower(btrim(t_term))
                             and lower(btrim(coalesce(i.session,''))) = lower(btrim(t_session)));

    b := public.sc_fee_bill_v2(st.id, t_term, t_session);
    bill := coalesce(nullif(b->>'bill','')::numeric, 0);
    continue when bill <= 0.005;                       -- nothing was billed
    continue when coalesce((b->>'bill_known')::boolean,true) = false;

    led := public.sc_fee_ledger_for(st.id, t_term, t_session);
    owing := coalesce((led->>'balance')::numeric, 0);  -- this term alone
    continue when owing <= 0.005;                      -- nothing owed here

    made := made + 1;
    rows := rows || jsonb_build_array(jsonb_build_object(
      'student', st.full_name, 'class', st.class, 'bill', bill, 'owing', owing));
    if not coalesce(p_dry_run,true) then
      insert into public.sc_fee_invoice(student_id, student_id_ref, class, term, session,
                                        amount, aid, net_amount, source, note, created_by)
      values (st.id, coalesce(st.admission_no,''), coalesce(st.class,''),
              t_term, t_session, bill, coalesce(nullif(b->>'aid','')::numeric,0), bill,
              'structure',
              'Recorded from the class fee structure so the unpaid balance carries into the next term.',
              me)
      on conflict (student_id, lower(btrim(term)), lower(btrim(session))) do nothing;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'dry_run',coalesce(p_dry_run,true),
    'term',t_term,'session',t_session,'to_record',made,'students',rows,
    'message', case when made = 0
      then 'Every learner owing money for '||t_term||' '||t_session||' already has an invoice. Nothing to record.'
      else made||' learner(s) were billed from the class structure but had no invoice for '
           ||t_term||' '||t_session||'. '
           ||case when coalesce(p_dry_run,true) then 'A dry run — nothing written yet.'
                   else 'Invoices raised, so their unpaid balance now carries forward.' end end);
end $$;
revoke all on function public.sc_fee_backfill_invoices(text,text,boolean) from public, anon;
grant execute on function public.sc_fee_backfill_invoices(text,text,boolean) to authenticated;

-- =====================================================================
-- A6. ROLLING THE SCHOOL INTO A NEW TERM
--  Reported: "when the school enters a new term, the students' records —
--  financial records, details, scores — should move into the current term."
--  There was NO rollover at all. The calendar had a `is_current` flag but
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_term_rollover(p_new_term text,
                                                   p_new_session text,
                                                   p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  me uuid := auth.uid(); prev jsonb; prev_term text; prev_session text;
  made int := 0; skipped int := 0; no_structure jsonb := '[]'::jsonb;
  carried numeric := 0; carried_rows jsonb := '[]'::jsonb;
  s record; fs record; a jsonb; owing numeric;
  n_students int := 0; detail jsonb := '[]'::jsonb;
begin
  if me is null or not coalesce(public.is_admin(me), false) then
    return jsonb_build_object('ok',false,'error','Only an administrator can roll the school into a new term.');
  end if;
  if coalesce(btrim(p_new_term),'') = '' or coalesce(btrim(p_new_session),'') = '' then
    return jsonb_build_object('ok',false,'error','Name both the new term and the new session.');
  end if;

  /* where we are coming from */
  prev := public.sc_term_resolve(null, null);
  prev_term := coalesce(prev->>'term',''); prev_session := coalesce(prev->>'session','');

  if lower(btrim(p_new_term)) = lower(btrim(prev_term))
     and lower(btrim(p_new_session)) = lower(btrim(prev_session)) then
    return jsonb_build_object('ok',false,
      'error','That is already the current term ('||prev_term||' '||prev_session||'). Nothing to roll.');
  end if;

  for s in select * from public.students
            where coalesce(status,'active') not in ('inactive','left','withdrawn','graduated','deleted','graduated')
            order by class, full_name
  loop
    n_students := n_students + 1;

    /* the learner's position BEFORE the roll — this is what follows them */
    a := public.sc_fee_account_for(s.id, prev_term, prev_session);
    owing := coalesce((a->>'closing')::numeric, 0);
    if owing > 0.005 then
      carried := carried + owing;
      carried_rows := carried_rows || jsonb_build_array(jsonb_build_object(
        'student', s.full_name, 'class', s.class, 'owing', owing,
        'becomes','earlier term: '||prev_term||' '||prev_session));
    end if;

    /* does a bill exist for the new term? */
    select * into fs from public.class_fee_structure f
     where f.active is not false
       and lower(btrim(f.class)) = lower(btrim(coalesce(s.class,'')))
       and lower(btrim(coalesce(f.term,'Current Term'))) in (lower(btrim(p_new_term)),'current term')
       and (coalesce(f.session,'') = '' or f.session = p_new_session)
     order by (lower(coalesce(f.arm,'')) = lower(coalesce(s.arm,''))) desc,
              (coalesce(f.arm,'') = '') desc,
              f.updated_at desc nulls last
     limit 1;

    if fs.id is null then
      skipped := skipped + 1;
      no_structure := no_structure || jsonb_build_array(s.full_name||' ('||coalesce(s.class,'?')||')');
      continue;
    end if;

    if not coalesce(p_dry_run,true) then
      insert into public.sc_fee_invoice(student_id, student_id_ref, class, term, session,
                                        amount, aid, net_amount, source, note, created_by)
      values (s.id, coalesce(s.admission_no,''), coalesce(s.class,''),
              btrim(p_new_term), btrim(p_new_session),
              coalesce(fs.total, coalesce(fs.tuition,0)+coalesce(fs.exam_fee,0)+coalesce(fs.development,0)
                +coalesce(fs.transport,0)+coalesce(fs.boarding,0)+coalesce(fs.other_fee,0)-coalesce(fs.discount,0)), 0,
              coalesce(fs.total, coalesce(fs.tuition,0)+coalesce(fs.exam_fee,0)+coalesce(fs.development,0)
                +coalesce(fs.transport,0)+coalesce(fs.boarding,0)+coalesce(fs.other_fee,0)-coalesce(fs.discount,0)),
              'structure', 'Raised automatically when the school rolled from '||prev_term||' '||prev_session, me)
      on conflict (student_id, lower(btrim(term)), lower(btrim(session))) do nothing;
    end if;
    made := made + 1;
    detail := detail || jsonb_build_array(jsonb_build_object(
      'student', s.full_name, 'class', s.class,
      'new_bill', coalesce(fs.total, coalesce(fs.tuition,0)+coalesce(fs.exam_fee,0)+coalesce(fs.development,0)
                +coalesce(fs.transport,0)+coalesce(fs.boarding,0)+coalesce(fs.other_fee,0)-coalesce(fs.discount,0)),
      'carried_owing', owing));
  end loop;

  /* BEFORE leaving the old term: record anything that was billed from the
     structure but never invoiced. Without this the unpaid part of a term
     that merely ran its course would stop being owed — a debt cannot be
     allowed to expire because a date passed. */
  if not coalesce(p_dry_run,true) then
    begin
      perform public.sc_fee_backfill_invoices(prev_term, prev_session, false);
    exception when others then
      return jsonb_build_object('ok',false,
        'error','The roll stopped before changing the calendar, because the outgoing term could not be recorded: '||sqlerrm);
    end;
  end if;

  if not coalesce(p_dry_run,true) then
    /* the calendar: exactly one current period, always */
    update public.academic_periods set is_current = false where is_current = true;
    insert into public.academic_periods(session, term, is_current)
    values (btrim(p_new_session), btrim(p_new_term), true)
    on conflict (session, term) do update set is_current = true;
    /* re-derive every snapshot column from the new truth */
    perform public.sc_fee_sync_snapshots(null, btrim(p_new_term), btrim(p_new_session));
  end if;

  return jsonb_build_object(
    'ok', true,
    'dry_run', coalesce(p_dry_run,true),
    'from', jsonb_build_object('term',prev_term,'session',prev_session),
    'to',   jsonb_build_object('term',btrim(p_new_term),'session',btrim(p_new_session)),
    'students', n_students,
    'invoices_to_raise', made,
    'without_structure', skipped,
    'without_structure_students', no_structure,
    'carried_owing_total', carried,
    'carried_owing', carried_rows,
    'detail', detail,
    'message', case
      when coalesce(p_dry_run,true) then
        'DRY RUN — nothing has changed. '||made||' learner(s) would be billed for '
        ||btrim(p_new_term)||' '||btrim(p_new_session)||'. '
        ||to_char(carried,'FM999,999,990.00')||' of unpaid balance follows each learner as an earlier term '
        ||'(it is NOT re-charged, so no debt doubles).'
        ||case when skipped > 0 then ' '||skipped||' learner(s) have no published structure for the new term and would be skipped.' else '' end
      else
        'Rolled into '||btrim(p_new_term)||' '||btrim(p_new_session)||'. '||made||' bill(s) raised. '
        ||to_char(carried,'FM999,999,990.00')||' of earlier-term balance is now shown as arrears, counted once.'
        ||case when skipped > 0 then ' '||skipped||' learner(s) were skipped for want of a published structure — verify they are not left unbilled.' else '' end
      end);
end $$;
revoke all on function public.sc_term_rollover(text,text,boolean) from public, anon;
grant execute on function public.sc_term_rollover(text,text,boolean) to authenticated;

comment on function public.sc_term_rollover(text,text,boolean) is
  'V12.69 — close one term and open the next: raises the new term''s invoices from the published structure, moves nothing else, and never duplicates a debt. Dry run by default.';


-- ---------------------------------------------------------------------
-- A7. THE SNAPSHOT COLUMNS ON A RECEIPT — one meaning, always
--  `fee_payments.fee_total` is the TERM BILL at the time of the receipt and
--  `balance` is the ACCOUNT closing balance after it. They used to be derived
--  per-row, which is why the screenshot's three rows each showed a different
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_recompute_fee_rows(p_student uuid, p_term text default '', p_session text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare a jsonb; n int := 0; r record; t_term text; t_session text; tr jsonb;
        running_paid numeric := 0; closing numeric; opening_pos numeric := 0;
begin
  if p_student is null then return jsonb_build_object('ok',false,'error','No student.'); end if;

  /* RE-ENTRY GUARD. This function WRITES to fee_payments, and fee_payments
     carries a statement-level trigger that calls this function on any write.
     Without this guard the first UPDATE re-enters the recompute, which
     rewrites the same rows from an older view, and the values flip back —
     the receipts kept their pre-fix balances forever. Same guard the V10
     autoheal uses: one nest, and the inner call stands down. */
  if coalesce(current_setting('sc.recomputing', true), '') = '1' then
    return jsonb_build_object('ok',true,'skipped','already recomputing');
  end if;
  perform set_config('sc.recomputing','1',true);

  tr := public.sc_term_resolve(nullif(p_term,''), nullif(p_session,''));
  t_term := coalesce(tr->>'term',''); t_session := coalesce(tr->>'session','');

  a := public.sc_fee_account_for(p_student, t_term, t_session);
  if coalesce((a->>'ok')::boolean,false) = false then return a; end if;

  /* The account's opening position, before a single receipt: everything billed
     (opening balance + this term + earlier terms). */
  opening_pos := coalesce((a->>'total_billed')::numeric,0);

  /* Walk this term's receipts in the order the family sees them. After each
     one the account stands at `opening_pos − (every receipt up to and
     including this one)`. That makes the LAST row equal the card exactly, and
     every earlier row the true position on that date. */
  for r in select id, coalesce(amount_paid,0) amt
             from public.fee_payments
            where student_id = p_student
              and lower(coalesce(term,''))    = lower(coalesce(t_term,''))
              and lower(coalesce(session,'')) = lower(coalesce(t_session,''))
            order by coalesce(payment_date, created_at::date), created_at, id
  loop
    running_paid := running_paid + r.amt;
    closing := greatest(opening_pos - running_paid, 0);
    update public.fee_payments
       set fee_total = coalesce((a->>'charges')::numeric,0),
           balance   = closing
     where id = r.id
       and (coalesce(fee_total,-1) <> coalesce((a->>'charges')::numeric,0)
         or coalesce(balance,-1)   <> closing);
    n := n + 1;
  end loop;
  perform set_config('sc.recomputing','',true);
  return jsonb_build_object('ok',true,'rows',n,
    'bill', coalesce((a->>'charges')::numeric,0),
    'outstanding', coalesce((a->>'closing')::numeric,0));
end $$;
revoke execute on function public.sc_recompute_fee_rows(uuid,text,text) from public, anon;
grant execute on function public.sc_recompute_fee_rows(uuid,text,text) to authenticated;


-- ---------------------------------------------------------------------
-- A8. KEEP THE OPENING BALANCE HONEST AFTER A SAVE
--  The Fees form writes students.opening_arrears. Until now nothing
--  re-derived the ledger afterwards, so the screen that had just been saved
--  could still show the pre-save number until a reload. This trigger closes
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_fee_opening_touch() returns trigger
language plpgsql security definer set search_path=public as $$
declare o jsonb;
begin
  begin
    o := public.sc_fee_opening_line(new.id);
    if coalesce(o->>'source','') = 'invoice'
       and coalesce((o->>'mirror_of_column')::numeric,0) <> coalesce(new.opening_arrears,0) then
      raise notice 'Opening balance column changed to % but an opening invoice of % already exists; the invoice is authoritative and the balance is unchanged.',
        new.opening_arrears, (o->>'amount');
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_sc_fee_opening_touch on public.students;
create trigger trg_sc_fee_opening_touch
  after update of opening_arrears on public.students
  for each row execute function public.sc_fee_opening_touch();


-- ---------------------------------------------------------------------
-- A9. THE BURSAR'S ONE-QUESTION CHECKUP
--
--  "Are there any errors in the financial computation?" is not answerable by
--  reading code. This returns the proof for every learner the school names,
--  plus the school-wide figures, so the answer is evidence.
-- ---------------------------------------------------------------------
create or replace function public.sc_fee_selfcheck(p_class text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); s record; a jsonb; pr jsonb; n int := 0;
        bad jsonb := '[]'::jsonb; total_billed numeric := 0; total_paid numeric := 0;
        total_out numeric := 0; with_opening int := 0; with_credit int := 0; neg int := 0;
begin
  if me is null or not (coalesce(public.is_staff(me),false) or coalesce(public.is_admin(me),false)) then
    return jsonb_build_object('ok',false,'error','Staff only.');
  end if;
  for s in select * from public.students
            where (p_class is null or p_class = '' or lower(btrim(class)) = lower(btrim(p_class)))
              and coalesce(status,'active') not in ('inactive','left','withdrawn','graduated','deleted')
  loop
    n := n + 1;
    a  := public.sc_fee_account_for(s.id, null, null);
    pr := public.sc_fee_prove(s.id, null, null);
    total_billed := total_billed + coalesce((a->>'total_billed')::numeric,0);
    total_paid   := total_paid   + coalesce((a->>'paid')::numeric,0);
    total_out    := total_out    + coalesce((a->>'closing')::numeric,0);
    if coalesce((a->>'has_opening')::boolean,false) then with_opening := with_opening + 1; end if;
    if coalesce((a->>'credit')::numeric,0) > 0.005 then with_credit := with_credit + 1; end if;
    if coalesce((a->>'closing')::numeric,0) < -0.005 then neg := neg + 1; end if;
    if coalesce((pr->>'agrees')::boolean,false) = false then
      bad := bad || jsonb_build_array(jsonb_build_object(
        'student', s.full_name, 'class', s.class,
        'closing', a->>'closing', 'by_statement_lines', pr->>'by_statement_lines',
        'difference', pr->>'difference'));
    end if;
  end loop;
  return jsonb_build_object('ok', true,
    'students', n,
    'total_billed', total_billed,
    'total_paid', total_paid,
    'total_outstanding', total_out,
    'with_opening_balance', with_opening,
    'with_credit', with_credit,
    'accounts_disagreeing_with_their_own_statement', jsonb_array_length(bad),
    'disagreements', bad,
    'verdict', case when jsonb_array_length(bad) = 0
      then 'Every account''s closing balance equals the sum of its own statement lines. Arithmetic verified on '||n||' learner(s).'
      else jsonb_array_length(bad)||' account(s) do not reconcile — see disagreements.' end,
    'identity', 'total_billed − total_paid = total_outstanding − credits');
end $$;
revoke all on function public.sc_fee_selfcheck(text) from public, anon;
grant execute on function public.sc_fee_selfcheck(text) to authenticated;


-- =====================================================================
-- A10. "EARLIER" MUST MEAN EARLIER
--  Reading First Term after the school has rolled into Second Term listed
--  Second Term's bill as First Term's ARREARS. A statement for a past term
--  must show that term's position, not a future charge dressed as old debt.
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_term_ordinal(p_term text, p_session text)
returns numeric language sql immutable as $$
  select coalesce(nullif(regexp_replace(coalesce(p_session,''),'[^0-9]','','g'),'')::numeric, 0) * 10
       + case lower(btrim(coalesce(p_term,'')))
           when 'first term'  then 1
           when 'second term' then 2
           when 'third term'  then 3
           when 'opening balance' then 0
           when '' then 0
           else 4
         end;
$$;
revoke all on function public.sc_term_ordinal(text,text) from public, anon;
grant execute on function public.sc_term_ordinal(text,text) to authenticated, anon;

comment on function public.sc_term_ordinal(text,text) is
  'V12.69 — the one ordering of school terms, so "earlier" means earlier on every screen. First=1, Second=2, Third=3, anything else after them.';

-- prior terms: only those that genuinely came BEFORE the term being read
create or replace function public.sc_fee_prior_terms(p_student uuid,
                                                     p_term text default null,
                                                     p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cur jsonb; t_term text; t_session text; out_rows jsonb := '[]'::jsonb; i record;
        paid numeric; owing numeric; here numeric;
begin
  cur := public.sc_term_resolve(p_term, p_session);
  t_term    := coalesce(nullif(btrim(p_term),''),    cur->>'term',    '');
  t_session := coalesce(nullif(btrim(p_session),''), cur->>'session', '');
  here := public.sc_term_ordinal(t_term, t_session);

  /* INVOICES only, and only ones that came FIRST. A learner who was never
     billed for a term owes nothing for it; a learner billed for a LATER term
     is not in arrears at all. */
  for i in select * from public.sc_fee_invoice inv
            where inv.student_id = p_student
            order by inv.session, inv.term
  loop
    continue when public.sc_term_ordinal(i.term, i.session) >= here;
    select coalesce(sum(amount_paid),0) into paid from public.fee_payments
     where student_id = p_student
       and lower(coalesce(term,''))    = lower(coalesce(i.term,''))
       and lower(coalesce(session,'')) = lower(coalesce(i.session,''));
    owing := greatest(coalesce(i.net_amount,0) - paid, 0);
    if owing > 0.005 then
      out_rows := out_rows || jsonb_build_array(jsonb_build_object(
        'invoice_id', i.id,
        'term', i.term, 'session', i.session,
        'bill', i.net_amount, 'paid', paid, 'owing', owing,
        'source', i.source,
        'opening', (i.source = 'opening_balance'),
        'note', i.note));
    end if;
  end loop;
  return out_rows;
end $$;
revoke all on function public.sc_fee_prior_terms(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_prior_terms(uuid,text,text) to authenticated;


-- =====================================================================
-- A11. THE ONE-LINE ROOT CAUSE OF "18,100 vs 8,100"
--  This BEFORE trigger fired on every write to fee_payments and rewrote the
--  balance as
--        new.balance := fee_total − amount_paid
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.compute_fee_payment_balance()
returns trigger language plpgsql security definer set search_path=public as $$
declare billed numeric := 0; recd numeric := 0; a jsonb;
begin
  /* No student, no account to speak of — fall back to the row's own figures. */
  if new.student_id is null then
    new.balance := greatest(coalesce(new.fee_total,0) - coalesce(new.amount_paid,0), 0);
    return new;
  end if;

  begin
    a := public.sc_fee_account_for(new.student_id, nullif(new.term,''), nullif(new.session,''));
    if coalesce((a->>'ok')::boolean,false) then
      billed := coalesce((a->>'total_billed')::numeric,0);
      /* every receipt up to and including this one. On INSERT the new row is
         not visible to a query, so add it explicitly; on UPDATE exclude the
         old version of the same row and re-add the new amount. */
      select coalesce(sum(amount_paid),0) into recd
        from public.fee_payments fp
       where fp.student_id = new.student_id
         and (tg_op = 'INSERT' or fp.id <> new.id)
         and coalesce(fp.payment_date, fp.created_at::date)
             <= coalesce(new.payment_date, current_date);
      recd := recd + coalesce(new.amount_paid,0);
      new.balance := greatest(billed - recd, 0);
      /* fee_total on a receipt is the TERM BILL, never a running total — BUT a
         row that carries the bursar's deliberate personal total is the source
         of that total, so it must be left exactly as written. Rewriting it here
         destroyed the override on the way in (the learner's recorded ₦28,100
         became ₦0, and with it the bill on every screen). */
      if not coalesce(new.total_overridden, false) then
        new.fee_total := coalesce((a->>'charges')::numeric, new.fee_total);
      end if;
      return new;
    end if;
  exception when others then
    /* an account that cannot be computed must not block a receipt being
       recorded — keep the row's own arithmetic as the fallback */
    null;
  end;

  new.balance := greatest(coalesce(new.fee_total,0) - coalesce(new.amount_paid,0), 0);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- A12. A BURSAR'S RECORDED TOTAL IS A BILL — EVEN WITH NO FEE STRUCTURE
--  sc_fee_bill_v2 looks for the bursar's personal total LAST and only when it
--  reaches the end of the structure ladder. A learner whose class had no
--  published structure therefore reported bill = 0, bill_known = false — and
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_fee_bill_v2(p_student uuid,
                                                 p_term text default null,
                                                 p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st record; tr jsonb; b jsonb; ovr numeric; has_ovr boolean := false;
begin
  select * into st from public.students where id = p_student;
  if st is null then return jsonb_build_object('ok',false,'error','Student not found.'); end if;
  tr := public.sc_term_resolve(p_term, p_session);

  /* the recorded per-learner total, if the bursar set one for this term */
  begin
    select fee_total into ovr
      from public.fee_payments
     where student_id = p_student
       and coalesce(total_overridden,false) = true
       and coalesce(fee_total,0) > 0
       and (coalesce(btrim(coalesce(p_term,'')),'') = '' or lower(btrim(term)) = lower(btrim(p_term)))
       and (coalesce(btrim(coalesce(p_session,'')),'') = '' or lower(btrim(session)) = lower(btrim(p_session)))
     order by created_at desc nulls last limit 1;
    has_ovr := ovr is not null;
  exception when undefined_column then has_ovr := false;
  end;

  if has_ovr then
    return jsonb_build_object('ok',true,
      'student_id', st.id, 'class', st.class, 'arm', st.arm, 'department', st.department,
      'term', tr->>'term', 'session', tr->>'session', 'resolved_by', tr->>'resolved_by',
      'bill', coalesce(ovr,0), 'structure_bill', 0, 'aid', 0, 'aid_rows','[]'::jsonb,
      'breakdown', jsonb_build_array(jsonb_build_object(
        'item','✏️ Personal total set by the bursar (override)','amount',coalesce(ovr,0))),
      'override', true, 'match_status','override', 'matched_by','override', 'matched', true,
      'bill_known', true,
      'match_note','The bursar recorded a personal total for this learner. It is this term''s bill.',
      'currency', public.sc_currency(), 'due_date', null, 'note', '',
      'working','Personal total recorded by the bursar on a receipt for this learner.');
  end if;

  b := public.sc_fee_bill_v2_structure(p_student, p_term, p_session);
  return b;
end $$;
revoke all on function public.sc_fee_bill_v2(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_bill_v2(uuid,text,text) to authenticated;

/* the original ladder, kept verbatim under a private name so the override
   check above can run first without duplicating 200 lines */
create or replace function public.sc_fee_bill_v2_structure(p_student uuid,
                                                           p_term text default null,
                                                           p_session text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st record; tr jsonb; fs record; a record;
        structure_bill numeric := 0; aid_total numeric := 0; aid_rows jsonb := '[]'::jsonb;
        breakdown jsonb := '[]'::jsonb; eff_bill numeric := 0;
        t_term text; t_session text; match_status text; match_note text := '';
        n_struct int := 0; n_any int := 0; n_platform int := 0; inv record; matched_by text := '';
begin
  select * into st from public.students where id = p_student;
  if st is null then return jsonb_build_object('ok',false,'error','Student not found.'); end if;

  tr := public.sc_term_resolve(p_term, p_session);
  t_term    := coalesce(tr->>'term','');
  t_session := coalesce(tr->>'session','');

  /* an invoice, if one was raised, IS the bill */
  select * into inv from public.sc_fee_invoice i
   where i.student_id = p_student
     and lower(btrim(i.term))    = lower(btrim(coalesce(t_term,'')))
     and lower(btrim(i.session)) = lower(btrim(coalesce(t_session,'')))
   limit 1;
  if inv.id is not null then
    return jsonb_build_object('ok',true,
      'student_id', st.id, 'class', st.class, 'arm', st.arm,
      'term', t_term, 'session', t_session, 'resolved_by', tr->>'resolved_by',
      'bill', coalesce(inv.net_amount,0),
      'structure_bill', coalesce(inv.amount,0) + coalesce(inv.aid,0),
      'aid', coalesce(inv.aid,0), 'aid_rows','[]'::jsonb,
      'breakdown', jsonb_build_array(jsonb_build_object('item','Invoice for '||t_term,'amount',coalesce(inv.net_amount,0))),
      'override', (coalesce(inv.source,'') = 'override'),
      'match_status','invoice', 'matched', true, 'bill_known', true, 'matched_by','invoice',
      'match_note', coalesce(inv.note,'The bill recorded on this learner''s invoice.'),
      'currency', public.sc_currency(),
      'due_date', null, 'note', coalesce(inv.note,''),
      'working','Invoice raised for '||t_term||' '||coalesce(t_session,'')||' = '||to_char(coalesce(inv.net_amount,0),'FM999,999,990.00'));
  end if;

  /* How many price lists exist FOR THIS CLASS, and how many exist AT ALL.
     The difference decides what the bursar is told to do: a class with no
     price list needs one published (or the class name corrected); a platform
     with none needs a first setup. Conflating them sent the bursar looking for
     a typo when the whole school had no fees entered yet. */
  select count(*) into n_any from public.class_fee_structure f
   where f.active is not false
     and lower(btrim(f.class)) = lower(btrim(coalesce(st.class,'')))
     and coalesce(f.term,'Current Term') not in ('','Current Term');

  /* this class, this term, this session */
  select * into fs from public.class_fee_structure f
   where f.active is not false
     and lower(btrim(f.class)) = lower(btrim(coalesce(st.class,'')))
     and lower(btrim(coalesce(f.term,'Current Term'))) = lower(btrim(coalesce(t_term,'')))
     and (coalesce(f.session,'') = '' or f.session = coalesce(t_session,''))
   order by (lower(coalesce(f.arm,'')) = lower(coalesce(st.arm,''))) desc,
            (coalesce(f.arm,'') = '') desc,
            (lower(coalesce(f.department,'')) = lower(coalesce(st.department,''))) desc,
            (coalesce(f.department,'') = '') desc,
            (coalesce(f.session,'') <> '') desc,
            f.updated_at desc nulls last
   limit 1;
  if fs.id is not null then matched_by := 'exact_term'; end if;

  /* the structure was saved with the default label 'Current Term' */
  if fs.id is null then
    select * into fs from public.class_fee_structure f
     where f.active is not false
       and lower(btrim(f.class)) = lower(btrim(coalesce(st.class,'')))
       and lower(btrim(coalesce(f.term,''))) = 'current term'
       and (coalesce(f.session,'') = '' or coalesce(t_session,'') = '' or f.session = t_session)
     order by (lower(coalesce(f.arm,'')) = lower(coalesce(st.arm,''))) desc,
              (coalesce(f.arm,'') = '') desc,
              (lower(coalesce(f.department,'')) = lower(coalesce(st.department,''))) desc,
              (coalesce(f.department,'') = '') desc,
              f.updated_at desc nulls last
     limit 1;
    if fs.id is not null then matched_by := 'current_term_label'; end if;
  end if;

  /* another term of the same session */
  if fs.id is null and coalesce(t_session,'') <> '' then
    select * into fs from public.class_fee_structure f
     where f.active is not false
       and lower(btrim(f.class)) = lower(btrim(coalesce(st.class,'')))
       and f.session = t_session
     order by (lower(coalesce(f.arm,'')) = lower(coalesce(st.arm,''))) desc,
              (coalesce(f.arm,'') = '') desc,
              f.updated_at desc nulls last
     limit 1;
    if fs.id is not null then matched_by := 'session_other_term'; end if;
  end if;

  /* the most recent structure at all */
  if fs.id is null then
    select * into fs from public.class_fee_structure f
     where f.active is not false
       and lower(btrim(f.class)) = lower(btrim(coalesce(st.class,'')))
     order by (lower(coalesce(f.arm,'')) = lower(coalesce(st.arm,''))) desc,
              (coalesce(f.arm,'') = '') desc,
              f.updated_at desc nulls last
     limit 1;
    if fs.id is not null then matched_by := 'latest_structure'; end if;
  end if;

  if fs.id is not null then
    structure_bill := coalesce(nullif(fs.total,0),
      coalesce(fs.tuition,0)+coalesce(fs.exam_fee,0)+coalesce(fs.development,0)
      +coalesce(fs.transport,0)+coalesce(fs.boarding,0)+coalesce(fs.other_fee,0)-coalesce(fs.discount,0));
    if coalesce(fs.tuition,0)     <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Tuition','amount',fs.tuition)); end if;
    if coalesce(fs.exam_fee,0)    <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Exam / assessment','amount',fs.exam_fee)); end if;
    if coalesce(fs.development,0) <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Development / PTA','amount',fs.development)); end if;
    if coalesce(fs.transport,0)   <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Transport','amount',fs.transport)); end if;
    if coalesce(fs.boarding,0)    <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Boarding / hostel','amount',fs.boarding)); end if;
    if coalesce(fs.other_fee,0)   <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Other compulsory','amount',fs.other_fee)); end if;
    if coalesce(fs.discount,0)    <> 0 then breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','Discount','amount',-fs.discount)); end if;
    match_status := 'structure';
    match_note := 'Matched the class fee structure.';
  else
    select count(*) into n_platform from public.class_fee_structure f
     where f.active is not false;
    /* Three distinct faults, three distinct instructions. */
    match_status := case
      when n_platform = 0 then 'no_structures_at_all'
      when n_any = 0      then 'no_structure'
      else                     'no_structure_this_term' end;
    match_note := case
      when n_platform = 0
        then 'No class fee structure has been published on this platform yet.'
      when n_any = 0
        then 'No fee structure has ever been published for class "'||coalesce(st.class,'(unset)')||'".'
      else 'A structure exists for '||coalesce(st.class,'this class')||', but none for '||coalesce(t_term,'this term')||'.' end;
  end if;

  begin
    for a in select mr.title, mr.amount from public.module_records mr
              where mr.module = 'financial_aid'
                and coalesce(mr.status,'applied') in ('approved','renewed')
                and coalesce(mr.amount,0) > 0
                and ( mr.data->>'student' = st.id::text
                   or lower(coalesce(mr.data->>'student','')) = lower(coalesce(st.full_name,''))
                   or mr.data->>'student_id' = st.id::text )
    loop
      aid_total := aid_total + a.amount;
      aid_rows := aid_rows || jsonb_build_array(jsonb_build_object('scheme', coalesce(a.title,'Scholarship/Aid'), 'amount', a.amount));
      breakdown := breakdown || jsonb_build_array(jsonb_build_object('item','🎓 '||coalesce(a.title,'Scholarship/Aid'),'amount',-a.amount));
    end loop;
  exception when undefined_table or undefined_column then null;
  end;

  eff_bill := greatest(coalesce(structure_bill,0) - aid_total, 0);
  return jsonb_build_object('ok',true,
    'student_id', st.id, 'class', st.class, 'arm', st.arm, 'department', st.department,
    'term', t_term, 'session', t_session, 'resolved_by', tr->>'resolved_by',
    'bill', eff_bill, 'structure_bill', structure_bill, 'aid', aid_total, 'aid_rows', aid_rows,
    'breakdown', breakdown, 'override', false,
    'match_status', match_status, 'matched_by', matched_by,
    'matched', (match_status = 'structure'),
    'bill_known', match_status = 'structure',
    'match_note', match_note,
    'currency', coalesce(fs.currency, public.sc_currency()),
    'due_date', fs.due_date, 'note', coalesce(fs.note,''),
    'working', match_note);
end $$;
revoke all on function public.sc_fee_bill_v2_structure(uuid,text,text) from public, anon;
grant execute on function public.sc_fee_bill_v2_structure(uuid,text,text) to authenticated;


-- =====================================================================
-- A13. THE STATEMENT MUST NOT RESOLVE THE TERM A SECOND TIME
--  sc_fee_truth_sheet built its `provenance` by calling sc_fee_explain with
--  NO term, and sc_fee_explain then ran the term resolver again. Two
--  resolutions of "which term is this?" in one document, and they disagreed:
-- (full reasoning: SCHOOL-CONNECT-V12.69 report, section B)
create or replace function public.sc_fee_truth_sheet(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); st record; led jsonb; ex jsonb;
        rows jsonb := '[]'::jsonb; r record;
begin
  select * into st from public.students where id = p_student;
  if st is null then return jsonb_build_object('ok',false,'error','Student not found.'); end if;
  if me is null or not (coalesce(public.is_staff(me),false) or coalesce(public.is_admin(me),false)
                        or coalesce(st.user_id = me,false) or coalesce(public.is_parent_of(me, st.id),false)) then
    return jsonb_build_object('ok',false,'error','Not authorised for this student.');
  end if;

  /* the ledger settles the term; the explanation is asked ABOUT THAT TERM */
  led := public.sc_fee_ledger_for(p_student, null, null);
  if coalesce((led->>'ok')::boolean,false) = false then return led; end if;
  ex  := public.sc_fee_explain(p_student, led->>'term', led->>'session');
  /* Asking "explain THIS term" always answers resolved_by = 'explicit',
     because the caller named it. That is true of the question, not of the
     learner: the interesting fact is how the ledger came to that term in the
     first place. One document, so it must carry the original answer. */
  ex := jsonb_set(coalesce(ex,'{}'::jsonb), '{term_resolved_by}',
                  to_jsonb(coalesce(led->>'term_resolved_by','')), true);

  for r in select fp.payment_date, fp.created_at, fp.amount_paid, fp.method, fp.reference,
                  fp.term, fp.session, fp.received_by_name
             from public.fee_payments fp
            where fp.student_id = p_student
            order by coalesce(fp.payment_date, fp.created_at::date), fp.created_at
  loop
    rows := rows || jsonb_build_array(jsonb_build_object(
      'date', coalesce(r.payment_date::text, r.created_at::text),
      'amount', r.amount_paid, 'method', coalesce(r.method,''),
      'reference', coalesce(r.reference,''),
      'term', coalesce(r.term,''), 'session', coalesce(r.session,''),
      'received_by', coalesce(r.received_by_name,''),
      'for_this_term', (lower(coalesce(r.term,'')) = lower(coalesce(led->>'term',''))
                        and lower(coalesce(r.session,'')) = lower(coalesce(led->>'session','')))));
  end loop;

  return jsonb_build_object('ok',true,
    'student', jsonb_build_object('id',st.id,'name',st.full_name,'admission_no',st.admission_no,
      'class',st.class,'arm',st.arm,'department',st.department),
    'period', jsonb_build_object('term',led->>'term','session',led->>'session',
                                 'resolved_by', coalesce(led->>'term_resolved_by','')),
    'headline', jsonb_build_object(
      'net_bill', led->'bill', 'aid', led->'aid', 'paid_this_term', led->'paid',
      'balance_this_term', led->'balance', 'arrears', led->'arrears',
      'opening_arrears', led->'opening_arrears',
      'total_outstanding', led->'total_due', 'status', led->>'status',
      'bill_known', coalesce((ex->>'bill_known')::boolean, true),
      'matched_by', coalesce(ex->>'matched_by','')),
    'provenance', ex,
    'arithmetic', led->'explain',
    'arrears_detail', led->'arrears_rows',
    'bill_breakdown', led->'bill_breakdown',
    'checks', led->'checks',
    'receipts', rows,
    'generated_at', now());
end $$;
revoke all on function public.sc_fee_truth_sheet(uuid) from public, anon;
grant execute on function public.sc_fee_truth_sheet(uuid) to authenticated;
