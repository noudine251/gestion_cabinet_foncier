// SNS Foncier — Sync Firestore temps réel

var firebaseConfig = {
  apiKey:            "AIzaSyDOEKpjxz7Tzh74xaF8E0yktC7SZTulHws",
  authDomain:        "sns-foncier.firebaseapp.com",
  projectId:         "sns-foncier",
  storageBucket:     "sns-foncier.firebasestorage.app",
  messagingSenderId: "1067152720019",
  appId:             "1:1067152720019:web:c5bb13cdf153704b940d66"
};

var APP_KEYS    = ["sns4-req", "sns4-dos", "sns4-users"];
var DOC_PATH    = "gestion-fonciere/data";
var WRITE_TOKEN = "SNSFoncier@2024#Secure";
var PRELOAD_KEY = "__sns_preload";
var SESSION_KEY = "__sns_session";

firebase.initializeApp(firebaseConfig);
var db   = firebase.firestore();
var auth = firebase.auth();

// App secondaire pour créer des comptes sans déconnecter l'admin
var _secondaryApp = firebase.initializeApp(firebaseConfig, 'sns-secondary');
var authSecondary = _secondaryApp.auth();

// Exposés globalement pour le composant React (app.js)
window.__snsAuth          = auth;
window.__snsAuthSecondary = authSecondary;

// Persistance locale : l'utilisateur reste connecté après refresh
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});

// Store mémoire (remplace localStorage pour les clés APP_KEYS)
var memStore = Object.create(null);

// Nettoyer les surcharges d'instance des versions précédentes
try { delete localStorage.getItem;    } catch (_) {}
try { delete localStorage.setItem;    } catch (_) {}
try { delete localStorage.removeItem; } catch (_) {}
APP_KEYS.forEach(function(k) {
  try { Storage.prototype.removeItem.call(window.localStorage, k); } catch (_) {}
});

// Override Storage.prototype
var _proto = {
  get : Storage.prototype.getItem,
  set : Storage.prototype.setItem,
  del : Storage.prototype.removeItem,
};
Storage.prototype.getItem = function(key) {
  if (this === window.localStorage && APP_KEYS.indexOf(key) !== -1) {
    return (key in memStore) ? memStore[key] : null;
  }
  return _proto.get.call(this, key);
};
Storage.prototype.setItem = function(key, val) {
  if (this === window.localStorage && APP_KEYS.indexOf(key) !== -1) {
    var str = String(val);
    memStore[key] = str;
    db.doc(DOC_PATH)
      .set(Object.assign({ _token: WRITE_TOKEN }, (function(o){ o[key]=str; return o; })({})), { merge: true })
      .catch(function(e) { console.warn("[SNS] Write:", e.message); });
    return;
  }
  _proto.set.call(this, key, val);
};
Storage.prototype.removeItem = function(key) {
  if (this === window.localStorage && APP_KEYS.indexOf(key) !== -1) {
    delete memStore[key];
    return;
  }
  _proto.del.call(this, key);
};

// ── Capture des setters React via __REACT_DEVTOOLS_GLOBAL_HOOK__ ─
// React appelle ce hook après CHAQUE commit (rendu confirmé).
// On l'utilise pour extraire et mettre à jour les setState de kp()
// immédiatement après chaque rendu, sans attendre onSnapshot.

var TAB_VALUES = { dashboard: 1, dossiers: 1, requerants: 1, users: 1 };

function extractSettersFromRoot(fiberRoot) {
  if (!fiberRoot || !fiberRoot.current) return;
  var seen = new WeakSet();

  function walk(fiber, d) {
    if (!fiber || d > 400 || seen.has(fiber)) return;
    seen.add(fiber);

    try {
      var hooks = [];
      var h = fiber.memoizedState;
      var lim = 0;
      while (h && lim++ < 60) {
        if (h && typeof h === 'object' && 'memoizedState' in h) {
          hooks.push(h);
          h = h.next;
        } else break;
      }

      if (hooks.length >= 6) {
        // kp() a un hook dont la valeur est un nom de tab
        var hasTab = false;
        for (var i = 0; i < hooks.length; i++) {
          if (typeof hooks[i].memoizedState === 'string' && TAB_VALUES[hooks[i].memoizedState]) {
            hasTab = true;
            break;
          }
        }

        if (hasTab) {
          // Trouver les 3 hooks tableau avec dispatch (reqs, dossiers, users)
          var arr = [];
          for (var j = 0; j < hooks.length; j++) {
            var hk = hooks[j];
            if (Array.isArray(hk.memoizedState) &&
                hk.queue && typeof hk.queue.dispatch === 'function') {
              arr.push({ idx: j, hook: hk });
            }
          }

          if (arr.length >= 3) {
            var firstIdx = arr[0].idx;
            var uHook = firstIdx > 0 ? hooks[firstIdx - 1] : null;
            // Mettre à jour les setters globaux
            window.__snsSetters = {
              setReqs:     arr[0].hook.queue.dispatch,
              setDossiers: arr[1].hook.queue.dispatch,
              setUsers:    arr[2].hook.queue.dispatch,
              setUser:     (uHook && uHook.queue) ? uHook.queue.dispatch : null,
              getUser:     function() { return uHook ? uHook.memoizedState : null; }
            };
            return;
          }
        }
      }
    } catch (_) {}

    walk(fiber.child, d + 1);
    walk(fiber.sibling, d + 1);
  }

  walk(fiberRoot.current, 0);
}

// Installer/fusionner avec __REACT_DEVTOOLS_GLOBAL_HOOK__
// Ce hook DOIT être installé avant le chargement de app.js
(function() {
  var existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) {
    // React DevTools déjà installé — on enveloppe onCommitFiberRoot
    var orig = existing.onCommitFiberRoot;
    existing.onCommitFiberRoot = function(id, root, priorityLevel) {
      try { if (orig) orig.apply(this, arguments); } catch (_) {}
      try { extractSettersFromRoot(root); } catch (_) {}
    };
  } else {
    // Pas de DevTools — installer un hook minimal
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      isDisabled: false,
      hasUnsupportedRendererAttached: false,
      _nextID: 0,
      inject: function() { return ++this._nextID; },
      onScheduleRoot: function() {},
      onCommitFiberRoot: function(id, root) {
        try { extractSettersFromRoot(root); } catch (_) {}
      },
      onCommitFiberUnmount: function() {},
      onPostCommitFiberRoot: function() {},
      onUncaughtError: function() {},
      onCaughtError: function() {},
      checkDCE: function() {},
    };
  }
})();

// ── Chargement initial depuis Firestore ───────────────────────
window.__snsSync = syncFromFirebase;
function syncFromFirebase() {
  var preload = sessionStorage.getItem(PRELOAD_KEY);
  if (preload) {
    try {
      var data = JSON.parse(preload);
      APP_KEYS.forEach(function(k) { if (data[k] !== undefined) memStore[k] = data[k]; });
      sessionStorage.removeItem(PRELOAD_KEY);
      return Promise.resolve();
    } catch (_) {}
  }
  return db.doc(DOC_PATH).get({ source: 'server' })
    .then(function(snap) {
      if (snap.exists) {
        var d = snap.data();
        APP_KEYS.forEach(function(k) { if (d[k] !== undefined) memStore[k] = d[k]; });
      }
    })
    .catch(function() {
      return db.doc(DOC_PATH).get({ source: 'cache' })
        .then(function(snap) {
          if (snap.exists) {
            var d = snap.data();
            APP_KEYS.forEach(function(k) { if (d[k] !== undefined) memStore[k] = d[k]; });
          }
        })
        .catch(function() {});
    });
}

// ── Listener temps réel ──────────────────────────────────────
var _snapshotUnsub = null;

function _onSnapshotData(snapshot) {
  if (snapshot.metadata.hasPendingWrites) return;
  if (!window.__appReady) return;
  if (!snapshot.exists) return;

  var data = snapshot.data();
  var hasChange = APP_KEYS.some(function(k) {
    return data[k] !== undefined && data[k] !== memStore[k];
  });
  if (!hasChange) return;

  APP_KEYS.forEach(function(k) { if (data[k] !== undefined) memStore[k] = data[k]; });

  var s = window.__snsSetters;
  if (s) {
    try {
      var ok = false;
      var v;
      if (data["sns4-req"] !== undefined) {
        v = data["sns4-req"] ? JSON.parse(data["sns4-req"]) : [];
        if (Array.isArray(v)) { s.setReqs(v); ok = true; }
      }
      if (data["sns4-dos"] !== undefined) {
        v = data["sns4-dos"] ? JSON.parse(data["sns4-dos"]) : [];
        if (Array.isArray(v)) { s.setDossiers(v); ok = true; }
      }
      if (data["sns4-users"] !== undefined) {
        v = data["sns4-users"] ? JSON.parse(data["sns4-users"]) : [];
        if (Array.isArray(v)) { s.setUsers(v); ok = true; }
      }
      if (ok) return;
    } catch (_) {}
  }

  try {
    var user = s && s.getUser ? s.getUser() : null;
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch (_) {}

  var preload = {};
  APP_KEYS.forEach(function(k) { if (data[k] !== undefined) preload[k] = data[k]; });
  sessionStorage.setItem(PRELOAD_KEY, JSON.stringify(preload));
  window.location.reload();
}

function _startListener() {
  if (_snapshotUnsub) return;
  _snapshotUnsub = db.doc(DOC_PATH).onSnapshot(
    _onSnapshotData,
    function(err) { console.warn("[SNS] Listener:", err.message); _snapshotUnsub = null; }
  );
}

// ── Démarrage conditionnel selon l'état d'authentification ──
var _firebaseReadyResolve;
window.__firebaseReady = new Promise(function(resolve) { _firebaseReadyResolve = resolve; });

auth.onAuthStateChanged(function(user) {
  if (user) {
    // Utilisateur connecté : synchroniser les données et démarrer le listener
    syncFromFirebase().then(_firebaseReadyResolve).catch(_firebaseReadyResolve);
    _startListener();
  } else {
    // Pas encore connecté : résoudre immédiatement pour afficher la page de connexion
    _firebaseReadyResolve();
    if (_snapshotUnsub) { _snapshotUnsub(); _snapshotUnsub = null; }
  }
});
