(function () {
  'use strict';
  var Q = window.Qubool;
  var $ = function (id) { return document.getElementById(id); };
  var SENDERS = Q.senders;
  var data = null, show = 'all', arming = null, editing = null, timer = null;
  // Signed out after this many seconds without a click or key press (the server says how long).
  var idle = 300, lastActive = Date.now(), lastTouch = Date.now();

  /* ---------- talking to the Worker ---------- */
  // quiet: an automatic call (the 30-second refresh, preview uploads) that must not keep the session alive.
  function api(method, path, body, type, quiet) {
    var opts = { method: method, headers: {} };
    if (!quiet) { opts.headers['x-qubool-activity'] = '1'; lastTouch = Date.now(); }
    if (body !== undefined) {
      if (type) { opts.headers['content-type'] = type; opts.body = body; }
      else { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (res.status === 401) { signedOut(d.error); throw d; }
        if (!res.ok) throw d;
        return d;
      });
    }, function () { throw { error: 'offline' }; });
  }
  var MESSAGES = {
    offline: 'Could not reach the server. Check your connection.',
    duplicate: 'already on the list', not_a_name: 'not a name', no_sender: 'no sender',
    note_too_long: 'Notes are 280 characters at most.', bad_time: 'Times look like 12:30.', bad_date: 'Pick a date.',
    bad_map_link: 'The map link must start with https://', venue_too_long: 'The venue name is 120 characters at most.',
  };
  var say = function (err, fallback) { return (err && MESSAGES[err.error]) || fallback || 'That did not save. Try again.'; };

  /* ---------- sign in ---------- */
  function signedOut(reason) {
    clearInterval(timer);
    var wasIn = !!data;
    // Nothing about the guests stays on screen once the session ends.
    data = null; editing = null; arming = null;
    $('rows').textContent = ''; $('stats').textContent = '';
    $('app').hidden = true; $('who-am-i').hidden = true; $('login').hidden = false;
    $('login-hint').textContent = reason === 'idle' ? 'Signed out after ' + Math.round(idle / 60) + ' minutes without activity. Sign in again to carry on.'
      : reason === 'signed_out' && wasIn ? 'Your session ended. Sign in again to carry on.'
      : 'Each host has their own passphrase. You are signed out after ' + Math.round(idle / 60) + ' minutes without activity, and when the browser closes.';
    if (reason === 'not_configured') {
      $('login-hint').textContent = 'Sign-in is not set up yet. Add HOST_LOGINS and SESSION_SECRET as secrets on the Worker in Cloudflare (see the README).';
      $('login-btn').disabled = true;
    }
    $('pass').focus();
  }
  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    var hint = $('login-hint');
    fetch('/api/host/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: $('pass').value }) })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (r) {
        if (r.ok) { $('pass').value = ''; idle = r.d.idleSeconds || idle; lastActive = Date.now(); load(true).catch(function () {}); return; }
        hint.textContent = r.d.error === 'locked' ? 'Too many wrong tries. Wait 15 minutes, then try again.'
          : r.d.error === 'not_configured' ? 'Sign-in is not set up yet (see the README).' : 'That passphrase is not right.';
      }, function () { hint.textContent = MESSAGES.offline; });
  });
  $('logout').addEventListener('click', function () { api('POST', '/api/host/logout').then(function () { signedOut(); }, function () { signedOut(); }); });

  /* ---------- load and refresh ---------- */
  function load(first, quiet) {
    return api('GET', '/api/host/state', undefined, undefined, quiet).then(function (d) {
      data = d; idle = d.idleSeconds || idle;
      $('login').hidden = true; $('app').hidden = false;
      $('who-am-i').hidden = false; $('who-am-i').textContent = 'Signed in as ' + d.user + '. Every guest gets their own link; send it, tick it off, and their reply appears here.';
      if (first) { fillEvent(); clearInterval(timer); timer = setInterval(function () { if (!document.hidden && !editing) load(false, true).catch(function () {}); }, 30000); }
      render();
      makePreviews();
    });
  }

  /* ---------- totals ---------- */
  function totals() {
    var t = { invited: data.guests.length, yes: 0, seats: 0, veg: 0, nonveg: 0, waiting: 0, quiet: 0 };
    data.guests.forEach(function (g) {
      var r = g.rsvp;
      if (!r) { t.waiting++; if (g.opens) t.quiet++; return; }
      if (r.coming === 'yes') { t.yes++; t.seats += r.seats; t.veg += r.veg; t.nonveg += r.nonveg; }
    });
    return t;
  }

  /* ---------- rendering ---------- */
  var when = function (iso) { return iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
  var link = function (g) { return data.origin + '/' + g.code; };
  function dayText() {
    var e = data.event; if (!e.date) return 'the day';
    var p = e.date.split('-'), months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return +p[2] + ' ' + months[+p[1] - 1];
  }
  function message(g) {
    return 'Hi ' + Q.first(g.name) + ', ' + SENDERS[g.from] + ' here. I am getting married on ' + dayText() +
      ', and I made you an invitation that is yours alone. Open it here: ' + link(g);
  }
  function replyCells(r) {
    if (!r) return '<td><span class="q-quiet">no reply yet</span></td><td class="q-num"><span class="q-quiet">–</span></td><td><span class="q-quiet">–</span></td><td><span class="q-quiet">–</span></td>';
    var tag = r.coming === 'yes' ? '<span class="q-tag q-tag-on">Coming</span>' : '<span class="q-tag">Regrets</span>';
    var plates = r.coming === 'yes'
      ? '<span class="q-plates">' + (r.veg ? '<span class="q-meal q-meal-veg">' + Q.mealMark('veg') + r.veg + '</span>' : '') + (r.nonveg ? '<span class="q-meal q-meal-nonveg">' + Q.mealMark('nonveg') + r.nonveg + '</span>' : '') + '</span>'
      : '<span class="q-quiet">–</span>';
    return '<td>' + tag + '<div class="q-quiet small">' + Q.esc(when(r.updatedAt)) + (r.changes ? ' · changed ' + r.changes + '×' : '') + '</div></td>' +
      '<td class="q-num">' + (r.coming === 'yes' ? r.seats : '<span class="q-quiet">–</span>') + '</td><td>' + plates + '</td>' +
      '<td class="msg">' + (r.message ? Q.esc(r.message) : '<span class="q-quiet">–</span>') + '</td>';
  }
  function visible(g) {
    var r = g.rsvp;
    return show === 'all' || show === g.from || (show === 'unsent' && !g.sentAt) || (show === 'waiting' && !r) ||
      (show === 'yes' && r && r.coming === 'yes') || (show === 'no' && r && r.coming === 'no');
  }
  function render() {
    var t = totals();
    $('stats').innerHTML = [[t.seats, 'Seats to set'], [t.veg, 'Veg plates'], [t.nonveg, 'Non-veg plates'], [t.yes + ' / ' + t.invited, 'Said yes'], [t.waiting, 'Yet to reply'], [t.quiet, 'Opened, no reply']]
      .map(function (x) { return '<div class="q-stat"><b>' + x[0] + '</b><span class="q-label">' + x[1] + '</span></div>'; }).join('');

    var list = data.guests.filter(visible), rows = $('rows');
    rows.textContent = '';
    list.forEach(function (g) {
      var tr = document.createElement('tr'), cut = g.code.lastIndexOf('-');
      tr.dataset.code = g.code;
      tr.innerHTML =
        '<td><span class="who"><span class="q-seal q-seal-small">' + Q.jaaliSVG(g.name, { width: 40, height: 40, cell: 26, weight: 1 }) + '</span><span><span class="n"></span><span class="q-quiet small">' + SENDERS[g.from] + '</span></span></span></td>' +
        '<td><span class="url">/' + Q.esc(g.code.slice(0, cut)) + '<b>' + Q.esc(g.code.slice(cut)) + '</b></span><span class="acts"><button class="q-btn q-btn-small" type="button" data-act="link">Copy link</button><button class="q-btn q-btn-small" type="button" data-act="msg">Copy message</button></span></td>' +
        '<td><label class="sent"><input type="checkbox" data-act="sent"' + (g.sentAt ? ' checked' : '') + ' aria-label="Link sent to ' + Q.esc(g.name) + '"><span class="q-quiet">' + (g.sentAt ? 'sent' : 'not yet') + '</span></label></td>' +
        '<td>' + (g.opens ? Q.esc(when(g.lastOpenedAt)) + (g.opens > 1 ? '<div class="q-quiet small">' + g.opens + ' visits</div>' : '') : '<span class="q-quiet">not yet</span>') + '</td>' +
        replyCells(g.rsvp) +
        '<td class="note"><span class="note-text"></span><button class="q-btn q-btn-small" type="button" data-act="note">' + (g.note ? 'Edit' : 'Add note') + '</button></td>' +
        '<td><button class="q-btn q-btn-small' + (arming === g.code ? ' q-btn-danger' : '') + '" type="button" data-act="remove">' + (arming === g.code ? 'Confirm remove' : 'Remove') + '</button></td>';
      tr.querySelector('.n').textContent = g.name;
      tr.querySelector('.note-text').textContent = g.note;
      rows.appendChild(tr);
      if (editing === g.code) rows.appendChild(noteEditor(g));
    });
    $('state').textContent = !data.guests.length ? 'No guests yet. Add names above and their links appear here.'
      : !list.length ? 'Nobody in this view.'
      : list.length + (list.length === 1 ? ' guest shown.' : ' guests shown.') + ' Refreshes every 30 seconds.';

  }
  function noteEditor(g) {
    var tr = document.createElement('tr'); tr.className = 'note-row';
    tr.innerHTML = '<td colspan="10"><div class="note-edit"><label class="q-label" for="note-input">A line from ' + SENDERS[g.from] + ' to ' + Q.esc(Q.first(g.name)) + ', shown only on their card</label>' +
      '<textarea class="q-input area" id="note-input" maxlength="280" rows="2"></textarea>' +
      '<div class="acts"><button class="q-btn q-btn-small" type="button" data-act="note-save">Save note</button><button class="q-btn q-btn-small" type="button" data-act="note-cancel">Cancel</button><span class="q-hint" id="note-hint"></span></div></div></td>';
    tr.querySelector('textarea').value = g.note;
    tr.dataset.code = g.code;
    setTimeout(function () { var t = $('note-input'); if (t) t.focus(); }, 0);
    return tr;
  }

  /* ---------- actions ---------- */
  function copy(text, btn) {
    var label = btn.textContent;
    var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1400); };
    var fallback = function () {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done();
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  function arm(id) {
    arming = id; render();
    setTimeout(function () { if (arming === id) { arming = null; render(); } }, 4000);
  }
  $('rows').addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.dataset.act === 'sent') return;
    var code = el.closest('tr').dataset.code, g = data.guests.filter(function (x) { return x.code === code; })[0]; if (!g) return;
    var act = el.dataset.act;
    if (act === 'link') copy(link(g), el);
    else if (act === 'msg') copy(message(g), el);
    else if (act === 'note') { editing = code; render(); }
    else if (act === 'note-cancel') { editing = null; render(); }
    else if (act === 'note-save') {
      var note = $('note-input').value;
      api('PATCH', '/api/host/guests/' + code, { note: note }).then(function () { g.note = note.replace(/\s+/g, ' ').trim(); editing = null; render(); },
        function (err) { $('note-hint').textContent = say(err); });
    }
    else if (act === 'remove') {
      if (arming !== code) return arm(code);
      arming = null;
      api('DELETE', '/api/host/guests/' + code).then(function () { return load(false); }, function (err) { $('state').textContent = say(err); });
    }
  });
  $('rows').addEventListener('change', function (e) {
    if (e.target.dataset.act !== 'sent') return;
    var code = e.target.closest('tr').dataset.code, checked = e.target.checked;
    api('PATCH', '/api/host/guests/' + code, { sent: checked }).then(function () { return load(false); }, function (err) { e.target.checked = !checked; $('state').textContent = say(err); });
  });
  document.querySelector('.filters').addEventListener('change', function (e) { show = e.target.value; render(); });
  // One name per line, or the JSON exported from the old console: [{ "name": "…", "from": "k", "line": 2 }, …]
  function parseNames(text, from) {
    var t = text.trim();
    if (/^[\[{]/.test(t)) {
      var j = JSON.parse(t), list = Array.isArray(j) ? j : j.guests;
      return list.map(function (g) { return { name: g.name, from: g.from || from, line: typeof g.line === 'number' ? g.line : undefined }; });
    }
    return t.split(/\r?\n/).map(function (n) { return n.trim(); }).filter(Boolean).map(function (n) { return { name: n, from: from }; });
  }
  $('add').addEventListener('submit', function (e) {
    e.preventDefault();
    var hint = $('add-hint'), from = $('from-j').checked ? 'j' : 'k', entries;
    try { entries = parseNames($('names').value, from); } catch (err) { hint.textContent = 'That looks like JSON but could not be read.'; return; }
    if (!entries.length) { hint.textContent = 'Type at least one name.'; return; }
    $('add-btn').disabled = true;
    api('POST', '/api/host/guests', { entries: entries }).then(function (r) {
      $('names').value = '';
      var parts = [];
      if (r.added.length) parts.push(r.added.length === 1 ? r.added[0].name + ' added. Their link is at the bottom of the list.' : r.added.length + ' guests added.');
      if (r.skipped.length) parts.push('Skipped: ' + r.skipped.map(function (s) { return s.name + ' (' + (MESSAGES[s.reason] || s.reason) + ')'; }).join(', ') + '. For two people with the same name, add a surname or initial.');
      hint.textContent = parts.join(' ');
      return load(false);
    }, function (err) { hint.textContent = say(err); }).then(function () { $('add-btn').disabled = false; });
  });

  /* ---------- the day ---------- */
  function fillEvent() {
    var e = data.event;
    $('ev-date').value = e.date || ''; $('ev-nikah').value = e.nikah || ''; $('ev-reception').value = e.reception || ''; $('ev-lunch').value = e.lunch || '';
    $('ev-venue').value = e.venue || ''; $('ev-maps').value = e.maps || ''; $('ev-open').checked = data.repliesOpen;
  }
  $('event').addEventListener('submit', function (e) {
    e.preventDefault();
    var ev = { date: $('ev-date').value, nikah: $('ev-nikah').value || null, reception: $('ev-reception').value || null, lunch: $('ev-lunch').value || null, venue: $('ev-venue').value, maps: $('ev-maps').value };
    api('PUT', '/api/host/settings', { event: ev, repliesOpen: $('ev-open').checked }).then(function () {
      $('ev-hint').textContent = 'Saved. Every invite shows this now.';
      return load(false).then(fillEvent);
    }, function (err) { $('ev-hint').textContent = say(err); });
  });

  /* ---------- link previews: drawn here, stored by the Worker, shown by WhatsApp and Slack ---------- */
  var INK = { ground: '#0b1512', raised: '#13231d', emerald: '#17654c', gilt: '#ebd08a', brass: '#d4a94e', ink: '#f1e9d8', muted: '#a9b5a8', line: '#263a32' };
  var fontsReady = null;
  function loadFonts() {
    if (!fontsReady) fontsReady = Promise.all(['300 96px Fraunces', 'italic 300 96px Fraunces', '400 40px Fraunces', 'italic 400 36px Fraunces', '500 22px "JetBrains Mono"']
      .map(function (f) { return document.fonts.load(f); })).catch(function () {});
    return fontsReady;
  }
  // opts: { name, from, sha, date } with name null for the generic card.
  function drawPreview(canvas, opts) {
    var W = 1200, H = 630, c = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    c.fillStyle = INK.ground; c.fillRect(0, 0, W, H);
    // The arch, with the guest's lattice in it.
    var ax = 96, aw = 400, ay = 64, r = aw / 2;
    c.save();
    c.beginPath(); c.moveTo(ax, H); c.lineTo(ax, ay + r); c.arc(ax + r, ay + r, r, Math.PI, 0); c.lineTo(ax + aw, H); c.closePath();
    c.fillStyle = INK.emerald; c.fill(); c.clip();
    var seed = opts.name || 'Kaif & Jabeen', p = Q.jaaliParams(seed);
    c.translate(ax, ay);
    var path = new Path2D(Q.jaaliPath(p, aw, H - ay, 84));
    c.strokeStyle = INK.gilt; c.lineJoin = 'miter'; c.lineCap = 'square'; c.lineWidth = p.strap ? 6.5 : 2.2; c.stroke(path);
    if (p.strap) { c.strokeStyle = INK.emerald; c.lineWidth = 3; c.stroke(path); }
    c.restore();
    c.strokeStyle = INK.gilt; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(ax, H); c.lineTo(ax, ay + r); c.arc(ax + r, ay + r, r, Math.PI, 0); c.lineTo(ax + aw, H); c.stroke();
    // The words.
    var x = 568;
    c.textBaseline = 'alphabetic';
    c.fillStyle = INK.brass; c.font = '500 22px "JetBrains Mono", monospace';
    c.fillText(('Reception' + (opts.sha ? ' · invite ' + opts.sha : '')).toUpperCase().split('').join(' '), x, 150);
    c.fillStyle = INK.ink; c.font = '400 40px Fraunces, Georgia, serif';
    c.fillText(opts.name ? 'Assalamu alaikum, ' + Q.first(opts.name) + '.' : 'You are invited.', x, 230);
    c.font = '300 104px Fraunces, Georgia, serif';
    c.fillText('Kaif', x, 360);
    var kw = c.measureText('Kaif ').width;
    c.fillStyle = INK.brass; c.font = 'italic 300 104px Fraunces, Georgia, serif'; c.fillText('&', x + kw, 360);
    var aw2 = c.measureText('& ').width;
    c.fillStyle = INK.ink; c.font = '300 104px Fraunces, Georgia, serif'; c.fillText('Jabeen', x + kw + aw2, 360);
    c.fillStyle = INK.muted; c.font = '500 24px "JetBrains Mono", monospace';
    c.fillText(opts.date ? opts.date + ' · reception and lunch' : 'Reception and lunch', x, 430);
    c.fillStyle = INK.line; c.fillRect(x, 470, 520, 1);
    c.fillStyle = INK.brass; c.font = 'italic 400 36px Fraunces, Georgia, serif';
    c.fillText('— ' + (opts.from ? SENDERS[opts.from] : 'Kaif & Jabeen'), x, 540);
  }
  function shortDate() {
    var e = data && data.event; if (!e || !e.date) return '';
    var p = e.date.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + +p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0];
  }
  var drawing = false;
  function makePreviews() {
    if (drawing || !data) return;
    var todo = data.guests.filter(function (g) { return !g.previewAt; });
    if (!todo.length) { $('preview-hint').textContent = data.guests.length ? 'Every guest has their own link preview (the picture WhatsApp and Slack show).' : ''; return; }
    drawing = true;
    var canvas = document.createElement('canvas'), done = 0;
    loadFonts().then(function next() {
      var g = todo[done];
      if (!g) { drawing = false; $('preview-hint').textContent = 'Every guest has their own link preview (the picture WhatsApp and Slack show).'; return; }
      $('preview-hint').textContent = 'Drawing link previews: ' + (done + 1) + ' of ' + todo.length + '…';
      drawPreview(canvas, { name: g.name, from: g.from, sha: Q.sha(g.name), date: shortDate() });
      canvas.toBlob(function (blob) {
        api('PUT', '/api/host/guests/' + g.code + '/preview', blob, 'image/jpeg', true).then(function () { g.previewAt = new Date().toISOString(); }, function () {})
          .then(function () { done++; next(); });
      }, 'image/jpeg', 0.86);
    });
  }
  // For scripts/og.mjs, which renders the generic preview once at build time.
  window.QuboolPreview = { draw: drawPreview, fonts: loadFonts };

  /* ---------- the idle sign-out ---------- */
  // Clicks and typing count as activity. If the host is busy on the page without saving anything,
  // tell the server once a minute so it does not end the session under them.
  function touch() {
    lastActive = Date.now();
    if (data && Date.now() - lastTouch > 60000) api('POST', '/api/host/ping').catch(function () {});
  }
  ['pointerdown', 'keydown', 'input'].forEach(function (ev) { document.addEventListener(ev, touch, true); });
  setInterval(function () {
    if (data && Date.now() - lastActive > idle * 1000) {
      fetch('/api/host/logout', { method: 'POST' }).catch(function () {});
      signedOut('idle');
    }
  }, 2000);

  load(true).catch(function () {});
})();
