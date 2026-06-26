// SNS Foncier — Sync Firestore temps réel

const firebaseConfig = {
  apiKey:            "AIzaSyDOEKpjxz7Tzh74xaF8E0yktC7SZTulHws",
  authDomain:        "sns-foncier.firebaseapp.com",
  projectId:         "sns-foncier",
  storageBucket:     "sns-foncier.firebasestorage.app",
  messagingSenderId: "1067152720019",
  appId:             "1:1067152720019:web:c5bb13cdf153704b940d66"
};

const APP_KEYS    = ["sns4-req", "sns4-dos", "sns4-users"];
const DOC_PATH    = "gestion-fonciere/data";
const WRITE_TOKEN = "SNSFoncier@2024#Secure";
const PRELOAD_KEY = "__sns_preload";
const SESSION_KEY = "__sns_session";

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Store mémoire (remplace localStorage pour les clés APP_KEYS)
const memStore = Object.create(null);

// Nettoyer les surcharges d'instance des versions précédentes
try { delete localStorage.getItem;    } catch (_) {}
try { delete localStorage.setItem;    } catch (_) {}
try { delete localStorage.removeItem; } catch (_) {}
APP_KEYS.forEach(k => {
  try { Storage.prototype.removeItem.call(window.localStorage, k); } catch (_) {}
});

// Override Storage.prototype (fonctionne sur Safari/iOS contrairement à l'override d'instance)
const _proto = {
  get : Storage.prototype.getItem,
  set : Storage.prototype.setItem,
  del : Storage.prototype.removeItem,
};
Storage.prototype.getItem = function (key) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    return (key in memStore) ? memStore[key] : null;
  }
  return _proto.get.call(this, key);
};
Storage.prototype.setItem = function (key, val) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    const str = String(val);
    memStore[key] = str;
    db.doc(DOC_PATH)
      .set({ [key]: str, _token: WRITE_TOKEN }, { merge: true })
      .catch(e => console.warn("[Firebase] Write:", e.message));
    return;
  }
  _proto.set.call(this, key, val);
};
Storage.prototype.removeItem = function (key) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    delete memStore[key];
    return;
  }
  _proto.del.call(this, key);
};

// ── Détection du composant kp() via le React fiber tree ──────
// kp() a : hook0=user, hook1=reqs[], hook2=dossiers[], hook3=users[],
//           hook4=loading(bool), hook5=currentTab(string)
// On cherche un composant avec 3 hooks tableau + 1 hook tab-string.
// La détection est volontairement laxiste (pas de positions fixes)
// pour résister aux différences de build.

const TAB_VALUES = new Set(["dashboard", "dossiers", "requerants", "users"]);

function findAppSetters() {
  const root = document.getElementById('root');
  if (!root) return null;

  const fiberKey = Object.keys(root).find(
    k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (!fiberKey) return null;

  const seen = new WeakSet();

  function walk(fiber, depth) {
    if (!fiber || depth > 500 || seen.has(fiber)) return null;
    seen.add(fiber);

    try {
      // Collecter les hooks de ce fiber
      const hooks = [];
      let h = fiber.memoizedState;
      let lim = 0;
      while (h && lim++ < 50) {
        if (h !== null && typeof h === 'object' && 'memoizedState' in h) {
          hooks.push(h);
          h = h.next;
        } else break;
      }

      if (hooks.length >= 6) {
        // Chercher le hook dont la valeur est un nom de tab
        const tabIdx = hooks.findIndex(
          h => typeof h.memoizedState === 'string' && TAB_VALUES.has(h.memoizedState)
        );

        // Le tab doit apparaître au moins en position 4 (après user+reqs+dossiers+users)
        if (tabIdx >= 4) {
          // Trouver les hooks tableau avec dispatch() avant le hook tab
          const arrHooks = [];
          for (let i = 0; i < tabIdx; i++) {
            const hk = hooks[i];
            if (Array.isArray(hk.memoizedState) &&
                hk.queue && typeof hk.queue.dispatch === 'function') {
              arrHooks.push({ idx: i, hook: hk });
            }
          }

          if (arrHooks.length >= 3) {
            // Le hook juste avant le 1er tableau = hook user
            const firstArrIdx = arrHooks[0].idx;
            const userHook    = firstArrIdx > 0 ? hooks[firstArrIdx - 1] : null;
            return {
              setReqs:     arrHooks[0].hook.queue.dispatch,
              setDossiers: arrHooks[1].hook.queue.dispatch,
              setUsers:    arrHooks[2].hook.queue.dispatch,
              setUser:     userHook && userHook.queue ? userHook.queue.dispatch : null,
              getUser:     function() { return userHook ? userHook.memoizedState : null; },
            };
          }
        }
      }
    } catch (_) {}

    return walk(fiber.child, depth + 1) || walk(fiber.sibling, depth + 1);
  }

  return walk(root[fiberKey], 0);
}

// Exposé pour index.html (restauration de session après fallback reload)
window.__snsFindSetters = findAppSetters;

// ── Chargement initial depuis Firestore ───────────────────────
async function syncFromFirebase() {
  const preload = sessionStorage.getItem(PRELOAD_KEY);
  if (preload) {
    try {
      const data = JSON.parse(preload);
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      sessionStorage.removeItem(PRELOAD_KEY);
      return;
    } catch (_) {}
  }
  try {
    const snap = await db.doc(DOC_PATH).get({ source: 'server' });
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
    }
  } catch (_) {
    try {
      const snap = await db.doc(DOC_PATH).get({ source: 'cache' });
      if (snap.exists) {
        const data = snap.data();
        APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      }
    } catch (_) {}
  }
}

// ── Listener temps réel ──────────────────────────────────────
db.doc(DOC_PATH).onSnapshot(
  function(snapshot) {
    if (snapshot.metadata.hasPendingWrites) return;
    if (!window.__appReady) return;
    if (!snapshot.exists) return;

    var data = snapshot.data();
    var hasChange = APP_KEYS.some(function(k) {
      return data[k] !== undefined && data[k] !== memStore[k];
    });
    if (!hasChange) return;

    // Mettre à jour le store mémoire
    APP_KEYS.forEach(function(k) { if (data[k] !== undefined) memStore[k] = data[k]; });

    var setters = findAppSetters();

    // ── Stratégie 1 : injection directe dans React ──────────
    // Aucun rechargement, navigation préservée
    if (setters) {
      try {
        var ok = false;
        var v;

        if (data["sns4-req"] !== undefined) {
          v = data["sns4-req"] ? JSON.parse(data["sns4-req"]) : [];
          if (Array.isArray(v)) { setters.setReqs(v); ok = true; }
        }
        if (data["sns4-dos"] !== undefined) {
          v = data["sns4-dos"] ? JSON.parse(data["sns4-dos"]) : [];
          if (Array.isArray(v)) { setters.setDossiers(v); ok = true; }
        }
        if (data["sns4-users"] !== undefined) {
          v = data["sns4-users"] ? JSON.parse(data["sns4-users"]) : [];
          if (Array.isArray(v)) { setters.setUsers(v); ok = true; }
        }

        if (ok) return; // succès — pas de rechargement
      } catch (_) {}
    }

    // ── Stratégie 2 : reload rapide (fallback) ──────────────
    // Préserver la session pour ne pas retourner à la page de connexion
    try {
      var currentUser = setters && setters.getUser ? setters.getUser() : null;
      if (currentUser) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      }
    } catch (_) {}

    var preload = {};
    APP_KEYS.forEach(function(k) { if (data[k] !== undefined) preload[k] = data[k]; });
    sessionStorage.setItem(PRELOAD_KEY, JSON.stringify(preload));
    window.location.reload();
  },
  function(err) { console.warn("[Firebase] Listener:", err.message); }
);

window.__firebaseReady = syncFromFirebase();
