// Sign-in, sign-up, password and account forms: each <form data-api="/api/..."> posts its fields as JSON.
// data-next: where to go afterwards; data-done: a message to show instead. Checkboxes send true/false.
(function () {
  'use strict';
  function post(url, data) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); });
  }
  document.querySelectorAll('form[data-api]').forEach(function (form) {
    var msg = form.querySelector('.msg'), btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (form.dataset.confirm && !form.querySelector('[name=confirm]')) return;
      var data = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      if (form.dataset.token) data.token = form.dataset.token;
      if (data.password2 !== undefined) { if (data.password2 !== data.password) { show('The two passwords are different.', true); return; } delete data.password2; }
      btn.disabled = true; show('');
      post(form.dataset.api, data).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { show(r.body.message || 'Something went wrong. Please try again.', true); return; }
        if (form.dataset.done) { show(form.dataset.done, false); form.reset(); return; }
        location.href = form.dataset.next || '/account';
      }).catch(function () { btn.disabled = false; show('No connection. Please try again.', true); });
    });
    function show(text, bad) { if (!msg) return; msg.textContent = text; msg.className = 'msg' + (bad ? ' bad' : text ? ' good' : ''); }
  });
  document.querySelectorAll('[data-post]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      post(b.dataset.post, b.dataset.body ? JSON.parse(b.dataset.body) : {}).then(function (r) {
        if (b.dataset.next && r.ok) { location.href = b.dataset.next; return; }
        b.disabled = false; var out = document.getElementById(b.dataset.out || ''); if (out) { out.textContent = r.ok ? (b.dataset.done || 'Done.') : (r.body.message || 'Something went wrong.'); out.className = 'msg ' + (r.ok ? 'good' : 'bad'); }
        if (r.ok && b.dataset.reload) location.reload();
      });
    });
  });
  // name picker: two word lists + a number
  var pick = document.getElementById('namePick');
  if (pick) pick.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = pick.a.value + pick.b.value + pick.n.value, out = pick.querySelector('.msg');
    post('/api/account/name', { name: n }).then(function (r) { if (r.ok) location.reload(); else { out.textContent = r.body.message; out.className = 'msg bad'; } });
  });
})();
