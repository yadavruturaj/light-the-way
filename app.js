// Light the Way: main app logic.
// All data lives in this browser's localStorage under one key.
(function () {
  'use strict';

  const STORAGE_KEY = 'light-the-way:v1';
  const $ = (id) => document.getElementById(id);

  // ---------- Dates (local time, as "YYYY-MM-DD") ----------
  function dayKey(date) {
    const d = date || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function shiftDay(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + n));
  }

  // ---------- Saving and loading ----------
  function freshState() {
    return { goal: null, tasks: [], draft: null, lastQuote: -1 };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...freshState(), ...JSON.parse(raw) } : freshState();
    } catch (e) {
      return freshState();
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Couldn't save. Your browser may be blocking storage.");
    }
  }

  let state = loadState();

  // ---------- Small UI helpers ----------
  let toastTimer;
  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // A confirmation dialog built into the page. Resolves to true (yes),
  // false (no / Esc) or "extra" (the optional third button).
  function ask({ title, body, yes, no, extra }) {
    const dialog = $('confirm');
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    $('confirm-yes').textContent = yes;
    $('confirm-no').textContent = no;
    $('confirm-extra').textContent = extra || '';
    $('confirm-extra').hidden = !extra;

    return new Promise((resolve) => {
      const finish = (answer) => {
        $('confirm-yes').onclick = $('confirm-no').onclick = $('confirm-extra').onclick = null;
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) dialog.close();
        resolve(answer);
      };
      const onCancel = (e) => { e.preventDefault(); finish(false); };
      $('confirm-yes').onclick = () => finish(true);
      $('confirm-no').onclick = () => finish(false);
      $('confirm-extra').onclick = () => finish('extra');
      dialog.addEventListener('cancel', onCancel);
      dialog.showModal();
      $('confirm-no').focus();
    });
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // ---------- Quote of the visit ----------
  function showQuote() {
    const list = window.LTW_QUOTES || [];
    if (!list.length) return;
    let i;
    do { i = Math.floor(Math.random() * list.length); }
    while (list.length > 1 && i === state.lastQuote);
    state.lastQuote = i;
    saveState();
    $('quote-text').textContent = list[i].text;
    $('quote-by').textContent = list[i].by ? list[i].by : 'Affirmation';
  }

  // ---------- Claude prompt and parsing its reply ----------
  function buildPrompt(d) {
    const whenWhere = [d.when, d.where].filter(Boolean).join(', ');
    const lines = [
      `I'm using a daily habit app called Light the Way. Please make me a ${d.days}-day plan for this goal.`,
      '',
      `Goal: ${d.goal}`,
      d.why ? `Why it matters to me: ${d.why}` : null,
      `Time I can give each day: about ${d.minutes} minutes`,
      whenWhere ? `When and where: ${whenWhere}` : null,
      '',
      'Please follow these rules:',
      `- Exactly one task per day, ${d.days} days in total.`,
      `- Each task should take about ${d.minutes} minutes and be specific, so I know exactly what to do.`,
      '- Start easy and build up gradually.',
      '- After each task, add a "tiny version" that takes 2 minutes, for days when I have very little energy.',
      '- Reply with only the list: no introduction, headings or notes. One line per day, in exactly this format:',
      '',
      'Day 1: <task> | Tiny: <2-minute version>',
      'Day 2: <task> | Tiny: <2-minute version>'
    ];
    return lines.filter((l) => l !== null).join('\n');
  }

  // Reads lines like "Day 3: Do X | Tiny: Do Y". Also accepts "3. Do X".
  function parsePlan(text) {
    const byDay = new Map();
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\*\*|__|`/g, '').replace(/^[\s>*•-]+/, '').trim();
      const m = line.match(/^day\s*(\d{1,3})\s*[:.)\-–—]\s*(.+)$/i) || line.match(/^(\d{1,3})\s*[:.)]\s*(.+)$/);
      if (!m) continue;
      const dayNum = parseInt(m[1], 10);
      const parts = m[2].split(/\s*\|\s*tiny(?:\s+version)?\s*[:\-–—]\s*/i);
      const taskText = parts[0].replace(/\s*\|\s*$/, '').trim();
      if (!taskText || byDay.has(dayNum)) continue;
      byDay.set(dayNum, { text: taskText, tiny: (parts[1] || '').trim() });
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  // ---------- Progress maths ----------
  function doneDates() {
    return new Set(state.tasks.filter((t) => t.doneOn).map((t) => t.doneOn));
  }

  // Streak with grace: one missed day keeps the streak alive,
  // two missed days in a row end it. Today doesn't count as missed yet.
  function streak() {
    const dates = doneDates();
    const today = dayKey();
    const startedOn = state.goal ? state.goal.startedOn : today;
    let day = dates.has(today) ? today : shiftDay(today, -1);
    let count = 0;
    let misses = 0;
    while (day >= startedOn) {
      if (dates.has(day)) { count++; misses = 0; }
      else if (++misses >= 2) break;
      day = shiftDay(day, -1);
    }
    return count;
  }

  // ---------- Screens ----------
  const VIEWS = ['setup', 'plan', 'today', 'finished'];
  function showView(name) {
    VIEWS.forEach((v) => { $(v).hidden = v !== name; });
    $('backup-btn').hidden = !state.goal;
    $('reset-btn').hidden = !state.goal && !state.draft;
  }

  function render(options) {
    if (!state.goal) {
      if (state.draft && state.draft.step === 'plan') { renderPlan(); showView('plan'); }
      else { fillSetup(); showView('setup'); }
      return;
    }
    if (state.tasks.every((t) => t.doneOn)) { renderFinished(); showView('finished'); return; }
    renderToday(options);
    showView('today');
  }

  // Step 1: goal form
  function fillSetup() {
    const d = state.draft || {};
    $('goal-input').value = d.goal || '';
    $('why-input').value = d.why || '';
    $('minutes-select').value = d.minutes || '20';
    $('days-select').value = d.days || '30';
    $('when-input').value = d.when || '';
    $('where-input').value = d.where || '';
  }

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const goal = $('goal-input').value.trim();
    if (!goal) {
      $('goal-error').hidden = false;
      $('goal-input').focus();
      return;
    }
    state.draft = {
      ...(state.draft || {}),
      step: 'plan',
      goal,
      why: $('why-input').value.trim(),
      minutes: $('minutes-select').value,
      days: $('days-select').value,
      when: $('when-input').value.trim(),
      where: $('where-input').value.trim()
    };
    saveState();
    render();
    window.scrollTo(0, 0);
  });
  $('goal-input').addEventListener('input', () => { $('goal-error').hidden = true; });

  // Step 2: prompt and paste
  function renderPlan() {
    $('prompt-text').textContent = buildPrompt(state.draft);
    $('paste-input').value = state.draft.paste || '';
    updateParseResult();
  }

  function updateParseResult() {
    const text = $('paste-input').value;
    const tasks = parsePlan(text);
    const box = $('parse-result');
    box.innerHTML = '';
    box.className = 'parse-result';
    $('start-btn').disabled = tasks.length === 0;
    if (!text.trim()) return;
    if (!tasks.length) {
      box.classList.add('bad');
      box.textContent = "I couldn't find any lines like \"Day 1: ...\". Make sure you pasted Claude's whole reply.";
      return;
    }
    box.classList.add('ok');
    const head = document.createElement('div');
    head.textContent = `Found ${plural(tasks.length, 'daily task')}. The first few:`;
    const list = document.createElement('ol');
    tasks.slice(0, 3).forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t.text;
      list.appendChild(li);
    });
    box.append(head, list);
  }

  $('paste-input').addEventListener('input', () => {
    state.draft.paste = $('paste-input').value;
    saveState();
    updateParseResult();
  });

  $('copy-btn').addEventListener('click', async () => {
    const text = $('prompt-text').textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Now paste it into Claude.');
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($('prompt-text'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Text selected. Press Ctrl+C (or Copy) to copy it.');
    }
  });

  $('back-btn').addEventListener('click', () => {
    state.draft.step = 'setup';
    saveState();
    render();
  });

  $('start-btn').addEventListener('click', () => {
    const tasks = parsePlan($('paste-input').value);
    if (!tasks.length) return;
    const d = state.draft;
    state.goal = {
      goal: d.goal,
      why: d.why,
      minutes: Number(d.minutes),
      when: d.when,
      where: d.where,
      startedOn: dayKey()
    };
    state.tasks = tasks.map((t, i) => ({
      day: i + 1,
      text: t.text,
      tiny: t.tiny,
      doneOn: null,
      kind: null,
      feeling: null
    }));
    state.draft = null;
    saveState();
    render();
    window.scrollTo(0, 0);
    toast('Ganpati Bappa Morya! Your path begins.');
  });

  // Daily view
  function renderToday(options) {
    const opts = options || {};
    const today = dayKey();
    const tasks = state.tasks;
    const lit = tasks.filter((t) => t.doneOn).length;
    const doneToday = tasks.find((t) => t.doneOn === today);
    const next = tasks.find((t) => !t.doneOn);

    $('goal-title').textContent = state.goal.goal;
    $('goal-why').textContent = state.goal.why ? `Why: ${state.goal.why}` : '';
    $('goal-why').hidden = !state.goal.why;
    $('stat-lit').textContent = `${lit}/${tasks.length}`;
    $('stat-streak').textContent = streak();
    $('stat-left').textContent = tasks.length - lit;

    window.LTW_drawPath($('path-today'), tasks, { justLit: opts.justLit });

    // "Don't miss twice" nudge
    const dates = doneDates();
    const yesterday = shiftDay(today, -1);
    const missedYesterday = !dates.has(yesterday) && yesterday >= state.goal.startedOn && lit > 0;
    $('nudge').hidden = !(missedYesterday && !doneToday);
    $('nudge').textContent = "You missed yesterday, and that's okay. Just don't miss twice. Even the tiny version counts today.";

    $('task-card').hidden = !!doneToday;
    $('done-card').hidden = !doneToday;

    if (doneToday) {
      $('done-day').textContent = `Day ${doneToday.day} done`;
      $('done-text').textContent = doneToday.kind === 'tiny'
        ? `You did the tiny version of: ${doneToday.text}`
        : doneToday.text;
      document.querySelectorAll('[data-feel]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.feel === doneToday.feeling));
      });
      $('next-up').textContent = next ? `Tomorrow: ${next.text}` : '';
      $('next-up').hidden = !next;
    } else if (next) {
      $('task-day').textContent = `Day ${next.day} of ${tasks.length}`;
      $('task-text').textContent = next.text;
      $('task-tiny').textContent = next.tiny ? `Hard day? Tiny version: ${next.tiny}` : '';
      $('task-tiny').hidden = !next.tiny;
      $('tiny-btn').hidden = !next.tiny;
      const whenWhere = [state.goal.when, state.goal.where].filter(Boolean).join(', ');
      $('task-when').textContent = `About ${state.goal.minutes} minutes${whenWhere ? ` · ${whenWhere}` : ''}`;
    }
  }

  function markDone(kind) {
    const next = state.tasks.find((t) => !t.doneOn);
    if (!next || state.tasks.some((t) => t.doneOn === dayKey())) return;
    next.doneOn = dayKey();
    next.kind = kind;
    saveState();
    render({ justLit: state.tasks.indexOf(next) });
    toast(`Lantern ${next.day} is lit.`);
  }
  $('done-btn').addEventListener('click', () => markDone('full'));
  $('tiny-btn').addEventListener('click', () => markDone('tiny'));

  document.querySelectorAll('[data-feel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = state.tasks.find((x) => x.doneOn === dayKey());
      if (!t) return;
      t.feeling = btn.dataset.feel;
      saveState();
      render();
      toast('Thanks for checking in.');
    });
  });

  $('undo-btn').addEventListener('click', () => {
    const t = state.tasks.find((x) => x.doneOn === dayKey());
    if (!t) return;
    t.doneOn = null;
    t.kind = null;
    t.feeling = null;
    saveState();
    render();
    toast(`Lantern ${t.day} is waiting for you.`);
  });

  // Goal reached
  function renderFinished() {
    const tasks = state.tasks;
    const tiny = tasks.filter((t) => t.kind === 'tiny').length;
    const first = state.goal.startedOn;
    const last = tasks.map((t) => t.doneOn).sort().pop();
    const [y1, m1, d1] = first.split('-').map(Number);
    const [y2, m2, d2] = last.split('-').map(Number);
    const span = Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000) + 1;
    $('finished-text').textContent =
      `"${state.goal.goal}": ${plural(tasks.length, 'lantern')} lit over ${plural(span, 'day')}` +
      (tiny ? `, including ${tiny} tiny version${tiny === 1 ? '' : 's'} on hard days.` : '.') +
      ' That is what showing up looks like.';
    window.LTW_drawPath($('path-finished'), tasks);
  }

  // ---------- Backup, restore and start over ----------
  function exportBackup() {
    const data = JSON.stringify({ app: 'light-the-way', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `light-the-way-backup-${dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup saved to your downloads.');
  }
  $('backup-btn').addEventListener('click', exportBackup);

  $('restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    try {
      const parsed = JSON.parse(await file.text());
      incoming = parsed.state || parsed;
      if (!incoming || !Array.isArray(incoming.tasks) || !('goal' in incoming)) throw new Error('bad file');
    } catch (err) {
      toast("That file isn't a Light the Way backup.");
      return;
    }
    if (state.goal) {
      const ok = await ask({
        title: 'Replace your current path?',
        body: 'Restoring this backup replaces your current goal and progress on this device.',
        yes: 'Yes, restore it',
        no: 'Cancel'
      });
      if (ok !== true) return;
    }
    state = { ...freshState(), ...incoming };
    saveState();
    render();
    toast('Backup restored.');
  });

  async function startOver(finishedGoal) {
    const lit = state.tasks.filter((t) => t.doneOn).length;
    const body = !state.goal
      ? 'This clears the goal details you entered.'
      : finishedGoal
        ? `This clears "${state.goal.goal}" so you can set a new goal. Back up first if you want to keep a record of it.`
        : `This removes your goal "${state.goal.goal}" and your ${plural(lit, 'lit lantern')}. You can't undo this unless you have a backup.`;
    const answer = await ask({
      title: finishedGoal ? 'Start a new goal?' : 'Give up this progress and start over?',
      body,
      yes: finishedGoal ? 'Yes, start fresh' : 'Yes, start over',
      no: 'Keep my progress',
      extra: state.goal ? 'Back up first' : null
    });
    if (answer === 'extra') {
      exportBackup();
      return startOver(finishedGoal);
    }
    if (answer !== true) return;
    const lastQuote = state.lastQuote;
    state = freshState();
    state.lastQuote = lastQuote;
    saveState();
    render();
    window.scrollTo(0, 0);
    toast('Cleared. A fresh path is ready when you are.');
  }
  $('reset-btn').addEventListener('click', () => startOver(false));
  $('new-goal-btn').addEventListener('click', () => startOver(true));

  // Refresh the screen if the app is left open past midnight.
  let lastSeenDay = dayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dayKey() !== lastSeenDay) {
      lastSeenDay = dayKey();
      render();
    }
  });

  // ---------- Start ----------
  showQuote();
  render();
})();
