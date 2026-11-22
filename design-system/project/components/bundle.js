/* Qubool — the invite's small runtime. Plain script, no dependencies. Assigns window.Qubool. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var SQ2 = Math.SQRT2;
  var SQ3 = Math.sqrt(3);

  /* ---------- identity: a guest's name becomes numbers ---------- */

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

  // FNV-1a, 32 bit. Same name in, same number out, on every device.
  function hash(s) {
    s = norm(s);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // mulberry32: a tiny seeded random stream.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The seven-character invite hash printed on a guest's card.
  // Never change norm(), hash() or sha(): every guest's hash and lattice, already sent and drawn into link previews, depend on them.
  function sha(s) {
    var a = ('0000000' + hash(s).toString(16)).slice(-8);
    var b = ('0000000' + hash(norm(s) + '#qubool').toString(16)).slice(-8);
    return (a + b).slice(1, 8);
  }

  function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'friend'; }

  /* ---------- jaali: the lattice drawn from a name ---------- */

  var TILINGS = [
    { id: 'square', label: '4.4.4.4', lo: 58, hi: 76 },
    { id: 'octagon', label: '4.8.8', lo: 52, hi: 72 },
    { id: 'hexagon', label: '6.6.6', lo: 50, hi: 68 },
    { id: 'trihex', label: '3.6.3.6', lo: 48, hi: 66 }
  ];

  function jaaliParams(seed) {
    var h = typeof seed === 'number' ? seed >>> 0 : hash(seed);
    var r = rng(h);
    var t = TILINGS[Math.floor(r() * TILINGS.length)];
    var theta = t.lo + r() * (t.hi - t.lo);
    var split = r() < 0.45 ? 0 : 0.06 + r() * 0.12;
    var strap = r() < 0.6 && split === 0;
    return {
      seed: h,
      tiling: t.id,
      label: t.label,
      theta: Math.round(theta * 10) / 10,
      split: Math.round(split * 100) / 100,
      strap: strap
    };
  }

  // The polygons of one tiling that cover a w × h box. cell = the repeat distance.
  function polygons(tiling, cell, w, h) {
    var out = [], i, j, x, y, e;
    var m = cell;
    if (tiling === 'square') {
      for (j = -1; j * cell < h + m; j++) for (i = -1; i * cell < w + m; i++) {
        out.push({ cx: i * cell, cy: j * cell, n: 4, R: cell / SQ2, rot: Math.PI / 4 });
      }
    } else if (tiling === 'octagon') {
      e = cell * (SQ2 - 1);
      for (j = -1; j * cell < h + m; j++) for (i = -1; i * cell < w + m; i++) {
        out.push({ cx: i * cell, cy: j * cell, n: 8, R: (cell / 2) / Math.cos(Math.PI / 8), rot: Math.PI / 8 });
        out.push({ cx: (i + 0.5) * cell, cy: (j + 0.5) * cell, n: 4, R: e / SQ2, rot: 0 });
      }
    } else if (tiling === 'hexagon') {
      var R = cell / SQ3;
      for (i = -1; i * 1.5 * R < w + m; i++) for (j = -1; j * cell < h + m; j++) {
        x = i * 1.5 * R; y = j * cell + (i & 1 ? cell / 2 : 0);
        out.push({ cx: x, cy: y, n: 6, R: R, rot: 0 });
      }
    } else {
      e = cell / 2;
      for (j = -1; j * SQ3 * e < h + m; j++) for (i = -2; i * 2 * e < w + m; i++) {
        x = i * 2 * e + (j & 1 ? e : 0); y = j * SQ3 * e;
        out.push({ cx: x, cy: y, n: 6, R: e, rot: 0 });
        out.push({ cx: x + e, cy: y + SQ3 * e / 3, n: 3, R: e / SQ3, rot: -Math.PI / 2 });
        out.push({ cx: x + e, cy: y - SQ3 * e / 3, n: 3, R: e / SQ3, rot: Math.PI / 2 });
      }
    }
    return out;
  }

  function f1(n) { return Math.round(n * 10) / 10; }

  // Hankin's "polygons in contact": from each edge, two rays leave at the contact
  // angle and meet their neighbours. The lines they draw are the lattice.
  function hankin(p, theta, split, parts) {
    var n = p.n, vs = [], k, a;
    for (k = 0; k < n; k++) { a = p.rot + k * TAU / n; vs.push([p.cx + p.R * Math.cos(a), p.cy + p.R * Math.sin(a)]); }
    var c = Math.cos(theta), s = Math.sin(theta);
    for (k = 0; k < n; k++) {
      var v0 = vs[k], v1 = vs[(k + 1) % n], v2 = vs[(k + 2) % n];
      var ex = v1[0] - v0[0], ey = v1[1] - v0[1];
      var len = Math.sqrt(ex * ex + ey * ey);
      var ux = ex / len, uy = ey / len;
      var fx = v2[0] - v1[0], fy = v2[1] - v1[1];
      var wx = fx / len, wy = fy / len;
      var ax = (v0[0] + v1[0]) / 2 - ux * split * len, ay = (v0[1] + v1[1]) / 2 - uy * split * len;
      var bx = (v1[0] + v2[0]) / 2 + wx * split * len, by = (v1[1] + v2[1]) / 2 + wy * split * len;
      var dax = ux * c - uy * s, day = ux * s + uy * c;
      var dbx = -wx * c - wy * s, dby = wx * s - wy * c;
      var den = dax * dby - day * dbx;
      if (Math.abs(den) < 1e-9) continue;
      var t = ((bx - ax) * dby - (by - ay) * dbx) / den;
      if (t <= 0) continue;
      parts.push('M' + f1(ax) + ' ' + f1(ay) + 'L' + f1(ax + dax * t) + ' ' + f1(ay + day * t) + 'L' + f1(bx) + ' ' + f1(by));
    }
  }

  // The path data alone, for callers that draw their own svg.
  function jaaliPath(seed, w, h, cell) {
    var p = seed && typeof seed === 'object' ? seed : jaaliParams(seed);
    var parts = [];
    var polys = polygons(p.tiling, cell || 56, w, h);
    for (var i = 0; i < polys.length; i++) hankin(polys[i], p.theta * Math.PI / 180, p.split, parts);
    return parts.join('');
  }

  // A complete svg string. Colour comes from CSS (.q-jaali in bundle.css).
  function jaaliSVG(seed, opts) {
    opts = opts || {};
    var w = opts.width || 320, h = opts.height || 200, cell = opts.cell || 56;
    var p = jaaliParams(seed);
    var d = jaaliPath(p, w, h, cell);
    var weight = opts.weight || (p.strap ? 4.5 : 1.4);
    var svg = '<svg class="q-jaali" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    svg += '<path d="' + d + '" style="stroke-width:' + weight + 'px"/>';
    if (p.strap && !opts.weight) svg += '<path class="q-jaali-cut" d="' + d + '" style="stroke-width:' + (weight - 2.4) + 'px"/>';
    return svg + '</svg>';
  }

  /* ---------- who invited whom ---------- */

  // Guest codes (k-priya-nair-x7q2pa) are minted by the Worker; nameSlug gives their middle part.
  var SENDERS = { k: 'Kaif', j: 'Jabeen' };

  function nameSlug(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* ---------- one-liners: the P.S. on each card, in the sender's voice ---------- */

  // Kaif's guests are mostly engineers; Jabeen's get plain warm lines.
  // Append new lines at the end: a guest's line number points into this list.
  var LINES = {
    k: [
      'I promise the biryani scales horizontally.',
      'No pager, no on-call. The only incident will be dessert running out.',
      'No stand-up, no retro. One deliverable: lunch.',
      'This is the one release I am not rolling back.',
      'It would not be a proper release without you.',
      'Zero downtime planned, except between courses.',
      'Bring your appetite. I have load-tested the menu.',
      'The agenda has one item, and it is served hot.',
      'The seating plan passed code review. Mostly.',
      'I have cached a plate for you. Cache invalidation is your problem.',
      'Merge conflicts are not on the menu. Biryani is.',
      'This deadline is hard. No extensions, no hotfixes.',
      'I have scheduled zero meetings that day. Please do the same.',
      'No tickets to file. Just show up and eat.',
      'Commit to the date. I already have.',
      'Latency from the reception to lunch: under five minutes.'
    ],
    j: [
      'It would not feel complete without you there.',
      'Bring your appetite. The menu has been chosen with care.',
      'The agenda has one item, and it is served hot.',
      'Come for the lunch, stay for the photographs.',
      'Save the date, and save room for dessert.',
      'There will be more food than you expect.',
      'It would mean a lot to see your face in the crowd.',
      'Wear something comfortable. Lunch is generous.',
      'I have been looking forward to celebrating this with you.',
      'Bring your best smile. The photographer will find you.'
    ]
  };

  // How many lines each set had when the first links were made. A link without a line
  // number keeps the pick it had then, so a card that was already sent never changes.
  var FIRST_LINES = { k: 8, j: 4 };

  // A guest's one-liner. With a line number (assigned by the host console so lines
  // spread evenly) it is that line; without one, the original pick from the name's hash.
  function lineFor(name, from, line) {
    var pool = LINES[from] || LINES.k;
    if (typeof line === 'number' && line >= 0 && line < pool.length) return pool[line];
    return pool[legacyLine(name, from)];
  }
  // The line a link without a line number shows.
  function legacyLine(name, from) { return hash(name) % (FIRST_LINES[from] || FIRST_LINES.k); }
  // The least-used line number for a sender, given the numbers already handed out.
  function nextLine(from, used) {
    var pool = LINES[from] || LINES.k, count = pool.map(function () { return 0; });
    (used || []).forEach(function (n) { if (typeof n === 'number' && n >= 0 && n < count.length) count[n]++; });
    var best = 0;
    for (var i = 1; i < count.length; i++) if (count[i] < count[best]) best = i;
    return best;
  }

  // Everything the invite derives for one guest: { name, from: 'k' | 'j', note, line, slug }.
  function guest(g) {
    g = g || {};
    var name = g.name || 'Friend', from = SENDERS[g.from] ? g.from : 'k';
    return {
      name: name,
      first: first(name),
      from: from,
      sender: SENDERS[from],
      note: g.note || '',
      sha: sha(name),
      slug: g.slug || '',
      line: typeof g.line === 'number' ? g.line : null,
      quip: lineFor(name, from, g.line),
      jaali: jaaliParams(name)
    };
  }

  /* ---------- meal marks: shape and word, never colour alone ---------- */

  function mealMark(kind) {
    var veg = kind === 'veg';
    return '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<rect x="0.75" y="0.75" width="12.5" height="12.5" rx="1.5"/>' +
      (veg ? '<circle class="q-m" cx="7" cy="7" r="3"/>' : '<path class="q-m" d="M7 3.6L10.6 10H3.4Z"/>') +
      '</svg>';
  }

  /* ---------- terminal typing ---------- */

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/\x3C/g, '&lt;').replace(/>/g, '&gt;'); }

  // lines: [{ text, cls, prompt, typed, pause }]. Typed lines appear a key at a time;
  // the rest print whole. Reduced motion prints everything at once.
  function type(el, lines, opts) {
    opts = opts || {};
    var speed = opts.speed || 34;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stopped = false, timer = null;
    el.textContent = '';
    var caret = document.createElement('span');
    caret.className = 'q-caret';

    function row(line) {
      var r = document.createElement('span');
      r.className = 'q-term-line' + (line.cls ? ' ' + line.cls : '');
      if (line.prompt !== false && line.typed) {
        var p = document.createElement('span');
        p.className = 'q-p';
        p.textContent = (line.prompt || '$') + ' ';
        r.appendChild(p);
      }
      var t = document.createElement('span');
      r.appendChild(t);
      el.appendChild(r);
      return { row: r, text: t };
    }

    if (still || opts.instant) {
      lines.forEach(function (l) { row(l).text.textContent = l.text; });
      if (opts.onDone) opts.onDone();
      return { stop: function () {} };
    }

    var li = 0;
    function next() {
      if (stopped) return;
      if (li >= lines.length) { if (opts.onDone) opts.onDone(); return; }
      var line = lines[li++], r = row(line);
      r.row.appendChild(caret);
      if (!line.typed) {
        r.text.textContent = line.text;
        timer = setTimeout(next, line.pause == null ? 260 : line.pause);
        return;
      }
      var ci = 0;
      (function key() {
        if (stopped) return;
        if (ci < line.text.length) {
          r.text.textContent = line.text.slice(0, ++ci);
          timer = setTimeout(key, speed + (line.text.charCodeAt(ci - 1) % 5) * 9);
        } else {
          timer = setTimeout(next, line.pause == null ? 420 : line.pause);
        }
      })();
    }
    next();
    return { stop: function () { stopped = true; clearTimeout(timer); } };
  }

  window.Qubool = {
    hash: hash, rng: rng, sha: sha, first: first,
    tilings: TILINGS, jaaliParams: jaaliParams, jaaliPath: jaaliPath, jaaliSVG: jaaliSVG,
    lines: LINES, lineFor: lineFor, legacyLine: legacyLine, nextLine: nextLine, guest: guest,
    senders: SENDERS, nameSlug: nameSlug,
    mealMark: mealMark, type: type, esc: esc
  };
})();
