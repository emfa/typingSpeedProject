(function () {
  'use strict';
  var Q = window.Qubool, D = window.__DATA__ || {}, host = D.host || location.host;
  var asked = decodeURIComponent(location.pathname).slice(0, 48);
  document.getElementById('host').textContent = 'guest@' + host;
  document.getElementById('arch').innerHTML = Q.jaaliSVG('Kaif & Jabeen', { width: 380, height: 140, cell: 60 });
  Q.type(document.getElementById('out'), [
    { typed: true, text: 'ssh guest@' + host },
    { text: 'looking up invite ' + asked + ' … not found', cls: 'q-out' },
    { text: 'Please check the link you were sent.', cls: 'q-say', pause: 0 }
  ], {});
  // A device that used the old open links may still remember a reply; it no longer applies.
  try { localStorage.removeItem('qubool:open'); } catch (e) {}
})();
