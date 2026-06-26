// ============================================================
//  SNS Foncier — Sync Firestore temps réel
//  Stratégie : injection directe dans le state React (fiber)
//  → zéro rechargement, navigation préservée
// ============================================================

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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Store mémoire ────────────────────────────────────────────
const memStore = Object.create(null);

// ── Nettoyer les surcharges d'instance des versions précédentes ─
try { delete localStorage.getItem;    } catch (_) {}
try { delete localStorage.setItem;    } catch (_) {}
try { delete localStorage.removeItem; } catch (_) {}
APP_KEYS.forEach(k => {
  try { Storage.prototype.removeItem.call(window.localStorage, k); } catch (_) {}
});

// ── Override Storage.prototype ────────────────────────────────
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
      .catch(e => console.warn("[Firebase] ⚠️ Write:", e.message));
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

// ── Injection directe dans le state React ────────────────────
// L'analyse de app.js révèle que le composant principal kp() a :
//   hook 0 : user (null)
//   hook 1 : reqs []          ← sns4-req
//   hook 2 : dossiers []      ← sns4-dos
//   hook 3 : users [admin]    ← sns4-users
//   hook 4 : loading (bool)
//   hook 5 : currentTab ("dashboard"/"dossiers"/"requerants"/"users")
//
// On trouve le composant via le React fiber tree, puis on appelle
// ses dispatch() directement — équivalent à setReqs()/setDossiers()/setUsers().
// La navigation (currentTab) n'est jamais touchée.

const TAB_VALUES = new Set(["dashboard", "dossiers", "requerants", "users"]);

function findAppSetters() {
  const root = document.getElementById('root');
  if (!root) return null;

  // Clé React 18 : __reactFiber$xxxx
  const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber'));
  if (!fiberKey) return null;

  function check(fiber, depth) {
    if (!fiber || depth > 500) return null;
    try {
      const h = fiber.memoizedState;
      if (h &&
          Array.isArray(h.next?.memoizedState) &&                             // hook 1 : reqs
          Array.isArray(h.next?.next?.memoizedState) &&                       // hook 2 : dossiers
          Array.isArray(h.next?.next?.next?.memoizedState) &&                 // hook 3 : users
          TAB_VALUES.has(h.next?.next?.next?.next?.next?.memoizedState)) {    // hook 5 : tab
        return {
          setReqs:     h.next.queue.dispatch,
          setDossiers: h.next.next.queue.dispatch,
          setUsers:    h.next.next.next.queue.dispatch,
        };
      }
    } catch (_) {}
    return check(fiber.child, depth + 1) || check(fiber.sibling, depth + 1);
  }

  return check(root[fiberKey], 0);
}

// ── Chargement initial ────────────────────────────────────────
async function syncFromFirebase() {
  // Reload de sync : données déjà dans sessionStorage → instantané
  const preload = sessionStorage.getItem(PRELOAD_KEY);
  if (preload) {
    try {
      const data = JSON.parse(preload);
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      sessionStorage.removeItem(PRELOAD_KEY);
      console.log("[Firebase] ⚡ Données pré-chargées");
      return;
    } catch (_) {}
  }
  // Chargement normal depuis le serveur
  try {
    const snap = await db.doc(DOC_PATH).get({ source: 'server' });
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      console.log("[Firebase] ✅ Données chargées");
    }
  } catch (err) {
    console.warn("[Firebase] ⚠️ Serveur inaccessible, cache :", err.message);
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
  snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    if (!window.__appReady) return;
    if (!snapshot.exists) return;

    const data = snapshot.data();
    const hasChange = APP_KEYS.some(k => data[k] !== undefined && data[k] !== memStore[k]);
    if (!hasChange) return;

    // Mettre à jour le store mémoire
    APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });

    console.log("[Firebase] 🔄 Changement distant reçu → injection React");

    // ── Stratégie 1 : injection directe dans le state React ──
    // Navigation préservée, aucun rechargement.
    const setters = findAppSetters();
    if (setters) {
      try {
        if (data["sns4-req"]   !== undefined) setters.setReqs(JSON.parse(data["sns4-req"]));
        if (data["sns4-dos"]   !== undefined) setters.setDossiers(JSON.parse(data["sns4-dos"]));
        if (data["sns4-users"] !== undefined) setters.setUsers(JSON.parse(data["sns4-users"]));
        console.log("[Firebase] ✅ State React mis à jour directement");
        return;
      } catch (e) {
        console.warn("[Firebase] Injection échouée :", e.message);
      }
    }

    // ── Stratégie 2 : reload rapide via sessionStorage (fallback) ──
    console.warn("[Firebase] Fiber non trouvé → reload rapide");
    const preload = {};
    APP_KEYS.forEach(k => { if (data[k] !== undefined) preload[k] = data[k]; });
    sessionStorage.setItem(PRELOAD_KEY, JSON.stringify(preload));
    window.location.reload();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

window.__firebaseReady = syncFromFirebase();
