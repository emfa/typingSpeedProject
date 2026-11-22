(function () {
  'use strict';
  var Q = window.Qubool;
  var $ = function (id) { return document.getElementById(id); };

  // Open links are gone: forget any open-link reply an earlier version remembered on this device.
  try { localStorage.removeItem('qubool:open'); } catch (e) {}

  /* ---------- what the server baked into the page ---------- */
  // { code, name, from, note, line, rsvp, event, repliesOpen, maxSeats, host }: this page only ever opens on a guest's own link.
  var D = window.__DATA__;
  if (!D || !D.code) return;
  var EVENT = D.event || {}, MAX_SEATS = D.maxSeats || 4, HOST = D.host || location.host;
  var SENDERS = Q.senders;

  /* ---------- dates ---------- */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateParts() { var p = EVENT.date.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function prettyDate() {
    if (!EVENT.date) return '';
    var p = dateParts(), wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    return DAYS[wd] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
  }
  function prettyTime(t) {
    var h = +t.split(':')[0], m = t.split(':')[1];
    return ((h + 11) % 12 + 1) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function daysToGo() {
    var p = dateParts(), now = new Date();
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }
  function ordinal(n) { var t = n % 100; return n + (t > 10 && t < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function googleCalendar() {
    var p = dateParts(), dates;
    if (EVENT.reception) {
      // India has no daylight saving: IST is UTC+5:30 all year.
      var t = EVENT.reception.split(':'), start = Date.UTC(p.y, p.m - 1, p.d, +t[0], +t[1]) - 330 * 60000;
      var f = function (ms) { var d = new Date(ms); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; };
      dates = f(start) + '/' + f(start + 3 * 3600000);
    } else {
      var next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
      dates = p.y + pad(p.m) + pad(p.d) + '/' + next.getUTCFullYear() + pad(next.getUTCMonth() + 1) + pad(next.getUTCDate());
    }
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Kaif & Jabeen: wedding reception') +
      '&dates=' + dates + '&details=' + encodeURIComponent('Reception and lunch. ' + (EVENT.maps || '')) + '&location=' + encodeURIComponent(EVENT.venue || EVENT.maps || '');
  }

  function renderEvent() {
    var when = prettyDate();
    if (when && EVENT.reception) when += ' · ' + prettyTime(EVENT.reception);
    $('when').textContent = when || 'To be announced';
    var where = $('where');
    where.textContent = '';
    if (EVENT.maps) {
      // The venue name, or "See it on the map" before one is set, opens the map.
      var a = document.createElement('a');
      a.href = EVENT.maps; a.target = '_blank'; a.rel = 'noopener'; a.className = 'maplink';
      a.appendChild(document.createElement('span')).textContent = EVENT.venue || 'See it on the map';
      if (EVENT.venue) { a.appendChild(document.createTextNode(' ')); var tap = a.appendChild(document.createElement('span')); tap.className = 'maptap'; tap.textContent = '(tap to open maps)'; }
      where.appendChild(a);
    } else where.textContent = EVENT.venue || 'To be announced';
    [['t-nikah', EVENT.nikah], ['t-reception', EVENT.reception], ['t-lunch', EVENT.lunch]].forEach(function (x) {
      if (!x[1]) return;
      $(x[0]).textContent = prettyTime(x[1]);
      if (EVENT.date) $(x[0]).setAttribute('datetime', EVENT.date + 'T' + x[1]);
    });
    $('actions').hidden = !(EVENT.date || EVENT.maps);
    $('cal').hidden = !EVENT.date;
    if (EVENT.date) {
      $('cal-google').href = googleCalendar();
      $('cal-ics').href = '/' + D.code + '/invite.ics';
    }
    $('maps').hidden = !EVENT.maps; if (EVENT.maps) $('maps').href = EVENT.maps;
  }

  /* ---------- the guest ---------- */
  var guest = {
    name: D.name, first: Q.first(D.name), from: D.from, sender: SENDERS[D.from], other: SENDERS[D.from === 'k' ? 'j' : 'k'],
    code: D.code, sha: Q.sha(D.name), quip: Q.lineFor(D.name, D.from, D.line), note: D.note || '', jaali: Q.jaaliParams(D.name),
    user: Q.first(D.name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'guest'
  };
  var INVITE = 'Before we officially close out 2026, I’m spinning up one last P1 bridge call—I’m getting married! Don’t worry, there’s no outage to fix, no logs to dig through, and zero RCAs to write. Just mute your notifications, come hungry, and help us end the year on a high note.';

  function applyGuest() {
    var g = guest;
    $('arch').innerHTML = Q.jaaliSVG(g.name, { width: 380, height: 200, cell: 60 });
    $('hash').textContent = g.sha;
    $('greet').textContent = 'Hey ' + g.first + ',';
    $('invite-text').textContent = INVITE;
    $('note').hidden = !g.note;
    $('note').textContent = g.note ? '“' + g.note + '”' : '';
    $('sign').textContent = '— ' + g.sender;
    $('ps').textContent = 'P.S. ' + g.quip;
    $('ask').textContent = 'Will you be there, ' + g.first + '?';
    $('host').textContent = g.user + '@' + HOST;
    $('foot').textContent = 'Invite ' + g.sha + '. The lattice on your card is drawn from your name: tiling ' + g.jaali.label + ', contact angle ' + g.jaali.theta.toFixed(1) + '°. Nobody else has this one.';
    render();
  }

  /* ---------- terminal ---------- */
  var out = $('out'), shell = $('shell'), cmd = $('cmd'), said = $('said'), run = null;
  function print(text, cls) {
    var r = document.createElement('span');
    r.className = 'q-term-line' + (cls ? ' ' + cls : '');
    r.textContent = text;
    out.appendChild(r);
    out.scrollTop = out.scrollHeight;
    // Screen readers hear a command's answer (the boot script types through Q.type, not here).
    if (!shell.hidden) said.appendChild(document.createElement('span')).textContent = text + ' ';
  }
  function echo(text, prompt) {
    var r = document.createElement('span'); r.className = 'q-term-line';
    var p = document.createElement('span'); p.className = 'q-p'; p.textContent = (prompt || '$') + ' ';
    r.appendChild(p); r.appendChild(document.createTextNode(text));
    out.appendChild(r);
  }
  function linesFor(g) {
    var l = [
      { typed: true, text: 'ssh ' + g.user + '@' + HOST },
      { text: 'verifying invite ' + g.sha + ' … ok', cls: 'q-out' },
      { text: 'Assalamu alaikum, ' + g.first + '.', cls: 'q-say', pause: 500 },
      { typed: true, text: 'cat note.txt' },
      { text: g.note || g.quip, pause: 600 }
    ];
    if (g.note) l.push({ text: g.quip, cls: 'q-out', pause: 400 });
    l.push({ typed: true, text: './open-invite', pause: 200 });
    l.push({ text: saved ? 'invite open, signed ' + g.sender + '. Your reply is saved; type rsvp --status to see it.' : 'invite open, signed ' + g.sender + '. Scroll down, or type help.', cls: 'q-out', pause: 0 });
    return l;
  }
  function booted() {
    var c = out.querySelector('.q-caret'); if (c) c.remove();
    $('skip').hidden = true;
    shell.hidden = false;
    out.scrollTop = out.scrollHeight;
    var card = $('card'); card.classList.remove('draw'); void card.offsetWidth; card.classList.add('draw'); setTimeout(function () { card.classList.remove('draw'); }, 2400);
  }
  function boot(instant) {
    if (run) run.stop();
    shell.hidden = true; $('skip').hidden = !!instant;
    // Print it all once to measure the finished height, and hold that height while the lines type, so the card below never moves.
    var lines = linesFor(guest), cs;
    Q.type(out, lines, { instant: true });
    cs = getComputedStyle(out);
    out.style.minHeight = Math.min(out.scrollHeight - (cs.boxSizing === 'border-box' ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)), parseFloat(cs.maxHeight) || 1e4) + 'px';
    run = Q.type(out, lines, { instant: !!instant, onDone: booted });
  }
  $('skip').addEventListener('click', function () { boot(true); });

  function describeReply(r) {
    return r.coming === 'yes' ? 'qubool hai, ' + r.seats + (r.seats === 1 ? ' seat' : ' seats') + ' (' + r.veg + ' veg, ' + r.nonveg + ' non-veg)' : 'regrets';
  }

  var COMMANDS = {
    help: function () {
      ['whoami            who the invite thinks you are',
       'ls                what is in here',
       'cat <file>        invite.txt, note.txt, schedule.txt, menu.txt',
       'date              how long until the day',
       'maps              where it is',
       'rsvp --qubool --seats N --veg N',
       'rsvp --regrets',
       'rsvp --status     what you have told me',
       'curl              your invite, from a real terminal',
       'git log           how we got here',
       'clear'].forEach(function (l) { print(l, 'q-out'); });
    },
    whoami: function () {
      print(guest.name + ' · invite ' + guest.sha);
      print('lattice: tiling ' + guest.jaali.label + ', contact angle ' + guest.jaali.theta.toFixed(1) + '°' + (guest.jaali.strap ? ', strapwork' : ''), 'q-out');
    },
    ls: function () { print('invite.txt  note.txt  schedule.txt  menu.txt  rsvp*'); },
    cat: function (a) {
      var f = a[0];
      if (!f) return print('cat: which file? Try ls.', 'q-out');
      if (f === 'invite.txt') { print('Hey ' + guest.first + ','); print(INVITE); print('— ' + guest.sender, 'q-say'); }
      else if (f === 'note.txt') print(guest.note || guest.quip);
      else if (f === 'schedule.txt') {
        var at = function (t, none) { return ((t ? prettyTime(t) : none) + '        ').slice(0, 8); };
        print(at(EVENT.nikah, 'Morning') + '  nikah       family only');
        print(at(EVENT.reception, 'TBA') + '  reception   you are invited');
        print(at(EVENT.lunch, 'TBA') + '  lunch       you are invited');
        if (EVENT.date) print(prettyDate(), 'q-out');
      }
      else if (f === 'menu.txt') print('cat: menu.txt: Permission denied. It is a surprise; bring an appetite.', 'q-out');
      else print('cat: ' + f + ': No such file. Try ls.', 'q-out');
    },
    date: function () {
      if (!EVENT.date) return print('To be announced.', 'q-out');
      var n = daysToGo();
      print(prettyDate() + (EVENT.reception ? ', ' + prettyTime(EVENT.reception) : ''));
      print(n > 1 ? n + ' days to go.' : n === 1 ? 'Tomorrow.' : n === 0 ? 'Today. Where are you?' : 'It has happened. Thank you for being part of it.', 'q-out');
    },
    maps: function () { print(EVENT.venue || 'The venue is on the map.'); print(EVENT.maps ? 'Use the Open in Maps button under the schedule.' : 'To be announced.', 'q-out'); },
    rsvp: function (a) {
      if (a.indexOf('--status') >= 0) {
        if (!saved) return print('no reply yet. Try rsvp --qubool --seats 1 --veg 0', 'q-out');
        print('saved: ' + describeReply(saved) + (saved.message ? ' · "' + saved.message + '"' : ''), 'q-ok');
        return print('last changed ' + new Date(saved.updatedAt).toLocaleString(), 'q-out');
      }
      if (sending) return print('rsvp: still sending your last answer.', 'q-out');
      var yes = a.indexOf('--qubool') >= 0 || a.indexOf('--yes') >= 0, no = a.indexOf('--regrets') >= 0 || a.indexOf('--no') >= 0;
      if (!yes && !no) { print('usage: rsvp --qubool --seats N --veg N', 'q-out'); print('       rsvp --regrets', 'q-out'); print('       rsvp --status', 'q-out'); return; }
      if (!D.repliesOpen) return print('rsvp: replies are closed. Message ' + guest.sender + ' directly.', 'q-out');
      var num = function (flag) { var i = a.indexOf(flag); return i >= 0 ? parseInt(a[i + 1], 10) : NaN; };
      if (no) s.coming = 'no';
      else {
        s.coming = 'yes';
        var seats = num('--seats'), veg = num('--veg');
        if (!isNaN(seats)) s.seats = Math.max(1, Math.min(MAX_SEATS, seats));
        if (!isNaN(veg)) { s.veg = Math.max(0, Math.min(s.seats, veg)); s.meal = s.seats === 1 ? (s.veg ? 'veg' : 'nonveg') : s.meal; }
        syncInputs(); render();
        // Ask rather than guess: the caterer counts plates.
        if (s.seats === 1 && !s.meal) { print('rsvp: one seat, which lunch? add --veg 1 for veg, --veg 0 for non-veg.', 'q-out'); return; }
        if (s.seats > 1 && !isNaN(seats) && isNaN(veg)) { print('rsvp: how many of the ' + s.seats + ' are vegetarian? add --veg N (0 to ' + s.seats + ').', 'q-out'); return; }
        if (s.seats === 1) s.veg = s.meal === 'veg' ? 1 : 0;
      }
      syncInputs(); render();
      if (!ready()) { print('rsvp: ' + ($('send-hint').textContent || 'the reply is not complete yet.'), 'q-out'); return; }
      print('rsvp: sending…', 'q-out');
      send('terminal').then(function (r) {
        print('[main ' + Q.sha(r.updatedAt + guest.code) + '] rsvp: ' + describeReply(r), 'q-ok');
        print(r.coming === 'yes' ? thanksLine() : 'You will be missed. Thank you for telling me.', 'q-say');
      }, function (err) { print('rsvp: ' + errorText(err), 'q-out'); });
    },
    qubool: function () { COMMANDS.rsvp(['--qubool']); },
    git: function (a) {
      if (a[0] !== 'log') return print('git: only log works here. The history is not up for rebase.', 'q-out');
      print('commit ' + Q.sha('reception') + ' (HEAD -> main)');   print('    feat: reception, with lunch', 'q-out');
      print('commit ' + Q.sha('nikah'));                           print('    feat: nikah (family only)', 'q-out');
      print('commit ' + Q.sha('init'));                            print('    init: two families, one main branch', 'q-out');
    },
    curl: function () {
      print('curl ' + location.origin + '/' + guest.code + '    your invite, as text', 'q-out');
      print('curl -d coming=yes -d seats=2 -d veg=1 ' + location.origin + '/' + guest.code + '/rsvp', 'q-out');
    },
    sudo: function () { print(guest.user + ' is not in the sudoers file. This incident will be reported to ' + guest.other + '.', 'q-out'); },
    exit: function () { print('There is no exit. There is only lunch.', 'q-out'); },
    clear: function () { out.textContent = ''; }
  };

  shell.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = cmd.value.trim(); cmd.value = '';
    if (!raw) return;
    said.textContent = '';
    echo(raw);
    var parts = raw.split(/\s+/), fn = COMMANDS[parts[0].toLowerCase()];
    if (fn) fn(parts.slice(1)); else print('command not found: ' + parts[0] + '. Try help.', 'q-out');
    out.scrollTop = out.scrollHeight;
  });

  /* ---------- RSVP ---------- */
  var s = { coming: null, seats: 1, veg: 0, meal: null };
  var saved = null;          // the reply as the server last confirmed it
  var sending = false, failed = null;
  $('meal').innerHTML =
    '<label><input type="radio" name="meal" id="meal-veg" value="veg"><span><span class="q-meal q-meal-veg">' + Q.mealMark('veg') + 'Veg</span></span></label>' +
    '<label><input type="radio" name="meal" id="meal-nonveg" value="nonveg"><span><span class="q-meal q-meal-nonveg">' + Q.mealMark('nonveg') + 'Non-veg</span></span></label>';

  function fromSaved(r) {
    saved = r;
    if (!r) return;
    s = { coming: r.coming, seats: r.coming === 'yes' ? r.seats : 1, veg: r.coming === 'yes' ? r.veg : 0, meal: null };
    if (r.coming === 'yes' && r.seats === 1) s.meal = r.veg ? 'veg' : 'nonveg';
    $('msg').value = r.message || '';
  }
  function syncInputs() {
    $('coming-yes').checked = s.coming === 'yes'; $('coming-no').checked = s.coming === 'no';
    $('meal-veg').checked = s.meal === 'veg'; $('meal-nonveg').checked = s.meal === 'nonveg';
  }
  function plates() {
    if (s.seats === 1) return { veg: s.meal === 'veg' ? 1 : 0, nonveg: s.meal === 'nonveg' ? 1 : 0 };
    return { veg: s.veg, nonveg: s.seats - s.veg };
  }
  function ready() {
    return s.coming === 'no' || (s.coming === 'yes' && (s.seats > 1 || !!s.meal));
  }
  function command() {
    if (!s.coming) return '';
    var nw = function (t) { return ' <span class="nw">' + t + '</span>'; };
    if (s.coming === 'no') return nw('<span class="q-flag">--regrets</span>');
    var p = plates();
    return nw('<span class="q-flag">--qubool</span>') + nw('--seats ' + s.seats) + nw('--veg ' + p.veg) + nw('--nonveg ' + p.nonveg);
  }
  function body(via) {
    var p = plates(), yes = s.coming === 'yes';
    return { coming: s.coming, seats: yes ? s.seats : 0, veg: yes ? p.veg : 0, message: $('msg').value.trim(), via: via };
  }
  function replyText() {
    var b = body('web'), p = plates();
    return 'RSVP: Kaif & Jabeen reception' + (EVENT.date ? ', ' + prettyDate() : '') + '\n' +
      'Name: ' + guest.name + '\n' +
      (b.coming === 'yes' ? 'Coming: yes, ' + b.seats + (b.seats === 1 ? ' seat' : ' seats') + ' (' + p.veg + ' veg, ' + p.nonveg + ' non-veg)' : 'Coming: no, with regrets') + '\n' +
      (b.message ? 'Note: ' + b.message + '\n' : '') + 'Invite: ' + guest.sha;
  }

  // Saves the reply. Resolves with the reply as stored, or rejects with { status, error }.
  function send(via) {
    sending = true; failed = null; render();
    // A stalled phone connection gives up after 15 seconds and says so, rather than "Sending…" for ever.
    var ctl = window.AbortController && new AbortController(), wait = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch('/api/rsvp/' + guest.code, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(via)), signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        clearTimeout(wait);
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw { status: res.status, error: data.error || 'server_error' };
          return data;
        });
      }, function () { clearTimeout(wait); throw { status: 0, error: 'offline' }; })
      .then(function (data) {
        sending = false; fromSaved(data.rsvp); showDone(via === 'terminal');
        return data.rsvp;
      })
      .catch(function (err) {
        sending = false; failed = err; render();
        throw err;
      });
  }
  function errorText(err) {
    var e = err && err.error;
    return e === 'closed' ? 'Replies are closed now. Message ' + guest.sender + ' directly.'
      : e === 'offline' ? 'Could not reach the invite. Check your connection and send again.'
      : e === 'not_found' ? 'This invite is no longer on the list. Message ' + guest.sender + ' directly.'
      : 'That did not save. Send it again, or copy your reply and message ' + guest.sender + '.';
  }

  function render() {
    var yes = s.coming === 'yes', p = plates(), ok = ready();
    $('more').hidden = !yes;
    $('split').hidden = s.seats === 1;
    $('one').hidden = s.seats !== 1;
    $('plates').hidden = s.seats === 1;
    $('plates').innerHTML = '<span class="q-plates"><span class="q-meal q-meal-veg">' + Q.mealMark('veg') + p.veg + ' veg</span><span class="q-meal q-meal-nonveg">' + Q.mealMark('nonveg') + p.nonveg + ' non-veg</span></span>';
    $('seats').textContent = s.seats; $('veg').textContent = s.veg;
    document.querySelectorAll('[data-step]').forEach(function (b) {
      var k = b.dataset.step, v = s[k] + (+b.dataset.by);
      b.disabled = k === 'seats' ? (v < 1 || v > MAX_SEATS) : (v < 0 || v > s.seats);
    });
    $('echo').innerHTML = '<span class="q-p">$</span> rsvp' + (command() || ' <span style="color:var(--term-dim)"># waiting for your answer</span>');
    var btn = $('send');
    btn.disabled = !ok || sending || !D.repliesOpen;
    btn.textContent = sending ? 'Sending…' : saved ? 'Save my new answer' : 'Send RSVP';
    $('copy').hidden = !failed;
    $('send-hint').textContent = !D.repliesOpen ? 'Replies are closed now. Message ' + guest.sender + ' directly.'
      : failed ? errorText(failed)
      : !s.coming ? 'Say whether you can come, then send your reply.'
      : !ok ? 'Choose veg or non-veg for your lunch.'
      : 'Saved straight to ' + guest.sender + '’s guest list. You can change it later from this link.';
  }
  function thanksLine() { return EVENT.date ? 'See you on the ' + ordinal(dateParts().d) + ', insha’Allah.' : 'See you there, insha’Allah.'; }
  function showDone(quiet) {
    if (!saved) return;
    var yes = saved.coming === 'yes';
    $('form').hidden = true; $('done').hidden = false;
    $('thanks').textContent = yes ? thanksLine() : 'You will be missed. Thank you for telling me.';
    $('receipt').innerHTML = '<span class="q-p">$</span> rsvp' + command() + ' <span style="color:var(--term-green)"># saved</span>';
    $('next').textContent = 'Saved for ' + guest.sender + ' on ' + new Date(saved.updatedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) +
      '. Plans change: you can change your answer from this link until the day.';
    $('edit').hidden = !D.repliesOpen;
    if (!quiet) $('thanks').focus();
  }
  function showForm() { $('done').hidden = true; $('form').hidden = false; syncInputs(); render(); }

  $('form').addEventListener('change', function (e) {
    if (e.target.name === 'coming') s.coming = e.target.value;
    if (e.target.name === 'meal') s.meal = e.target.value;
    failed = null; render();
  });
  $('form').addEventListener('input', function (e) { if (e.target.id === 'msg') { failed = null; render(); } });
  $('form').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b) return;
    s[b.dataset.step] += +b.dataset.by;
    if (s.veg > s.seats) s.veg = s.seats;
    failed = null; render();
  });
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!ready() || sending) return;
    send('web').catch(function () {});
  });
  $('copy').addEventListener('click', function () {
    var text = replyText(), done = function () { $('copy').textContent = 'Copied. Paste it to ' + guest.sender; };
    try { navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); }); } catch (err) { fallbackCopy(text); done(); }
  });
  function fallbackCopy(text) {
    var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) {}
    t.remove();
  }
  $('edit').addEventListener('click', showForm);

  /* ---------- start ---------- */
  function start() {
    fromSaved(D.rsvp);
    syncInputs();
    applyGuest();
    if (saved) showDone(true);
    boot(false);
  }
  renderEvent();
  start();
  try { console.log('%cAssalamu alaikum, curious one.', 'font: 600 16px Georgia, serif; color: #d4a94e', '\nYes, the lattice is drawn from your name: one hash, four tilings, and a construction called polygons in contact.\nIt runs on a Cloudflare Worker with a small SQLite database. Try curl on your link.\nThe menu is not in the source. See you at lunch.'); } catch (e) {}
})();
