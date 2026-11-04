/*
 * Roda dentro do service worker (importado pelo arquivo gerado pelo vite-plugin-pwa).
 * O app grava em meta.dueSchedule a lista de faturas em aberto; aqui só comparamos datas
 * e mostramos a notificação. Nenhum dado sai do aparelho.
 */
(function (scope) {
  var DB_NAME = 'controle-financeiro';
  var ALERT_DAYS = 3;
  var MAX_OVERDUE_DAYS = 7;

  function daysBetween(from, to) {
    var utc = function (d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); };
    return Math.round((utc(to) - utc(from)) / 86400000);
  }

  function localToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Decide o que notificar. Sem efeitos colaterais, para poder ser testado. */
  function pickDueAlerts(schedule, today) {
    return (schedule || []).map(function (b) {
      return Object.assign({}, b, { days: daysBetween(today, b.dueDate) });
    }).filter(function (b) { return b.days <= ALERT_DAYS && b.days >= -MAX_OVERDUE_DAYS; });
  }

  function dueText(days) {
    if (days === 0) return 'vence hoje';
    if (days === 1) return 'vence amanhã';
    if (days > 1) return 'vence em ' + days + ' dias';
    return days === -1 ? 'venceu ontem' : 'venceu há ' + -days + ' dias';
  }

  function money(cents) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }

  /** Abre o banco sem nunca criá-lo nem mudar a versão (quem cuida disso é o app). */
  function openDb() {
    return new Promise(function (resolve) {
      var req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = function () { req.transaction.abort(); };
      req.onerror = function () { resolve(null); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }

  function metaGet(db, key) {
    return new Promise(function (resolve) {
      var get = db.transaction('meta', 'readonly').objectStore('meta').get(key);
      get.onsuccess = function () { resolve(get.result ? get.result.value : null); };
      get.onerror = function () { resolve(null); };
    });
  }

  function metaPut(db, key, value) {
    return new Promise(function (resolve) {
      var tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: key, value: value });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }

  function checkDue() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return Promise.resolve();
    return openDb().then(function (db) {
      if (!db) return;
      var today = localToday();
      // Evita repetir: no máximo uma rodada de avisos por dia.
      return metaGet(db, 'dueNotifiedOn').then(function (last) {
        if (last === today) return;
        return metaGet(db, 'dueSchedule').then(function (schedule) {
          var alerts = pickDueAlerts(schedule, today);
          if (!alerts.length) return;
          return Promise.all(alerts.map(function (b) {
            return scope.registration.showNotification('Fatura ' + b.cardName + ' ' + dueText(b.days), {
              body: 'Falta pagar ' + money(b.remaining),
              icon: 'icon-192.png',
              tag: 'fatura-' + b.cardId + '-' + b.month,
            });
          })).then(function () { return metaPut(db, 'dueNotifiedOn', today); });
        });
      }).finally(function () { db.close(); });
    }).catch(function () { /* notificação nunca pode derrubar o app */ });
  }

  scope.__pickDueAlerts = pickDueAlerts;

  if (typeof scope.addEventListener === 'function') {
    scope.addEventListener('periodicsync', function (event) {
      if (event.tag === 'vencimentos') event.waitUntil(checkDue());
    });
    scope.addEventListener('notificationclick', function (event) {
      event.notification.close();
      event.waitUntil(scope.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        if (list.length) return list[0].focus();
        return scope.clients.openWindow('./');
      }));
    });
  }
})(self);
