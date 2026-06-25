// ============================================================
//  SNS Foncier — Migration totale Firestore + Sync temps réel
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Store mémoire ────────────────────────────────────────────
const memStore = Object.create(null);

// ── Supprimer les surcharges d'instance d'une version précédente ─
// (localStorage.setItem = ... persistait entre sessions et shadait
//  notre Storage.prototype override)
try { delete localStorage.getItem;    } catch (_) {}
try { delete localStorage.setItem;    } catch (_) {}
try { delete localStorage.removeItem; } catch (_) {}

// ── Nettoyer APP_KEYS du vrai localStorage ────────────────────
APP_KEYS.forEach(k => {
  try { Storage.prototype.removeItem.call(window.localStorage, k); } catch (_) {}
});

// ── Override Storage.prototype (Chrome, Firefox, Safari, iOS) ─
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
    // ⚠️  PAS de lastLocalWrite ici — c'était le bug :
    //     chaque écriture locale bloquait les sync distants pendant 2s
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

// ── Code app.js mis en cache mémoire (fetch une seule fois) ──
let appCode = null;
async function getAppCode() {
  if (appCode) return appCode;
  const res = await fetch('app.js');
  appCode = await res.text();
  return appCode;
}

// ── Re-rendu React sans rechargement de page ─────────────────
// Script inline (textContent) → toujours exécuté par le navigateur,
// jamais dédupliqué contrairement à script[src].
let rerenderTimer = null;
function rerenderApp() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(async () => {
    const wrapper = document.getElementById('app-wrapper');
    if (!wrapper) { window.location.reload(); return; }
    try {
      const code = await getAppCode();
      wrapper.innerHTML = '<div id="root"></div>';
      document.querySelectorAll('script[data-sns-app]').forEach(s => s.remove());
      const s = document.createElement('script');
      s.textContent = code;
      s.setAttribute('data-sns-app', '1');
      document.body.appendChild(s);
      console.log("[Firebase] ✅ Interface mise à jour en temps réel");
    } catch (err) {
      console.warn("[Firebase] rerenderApp échoué → rechargement :", err.message);
      window.location.reload();
    }
  }, 300);
}

// ── Chargement initial depuis le serveur ─────────────────────
async function syncFromFirebase() {
  try {
    const snap = await db.doc(DOC_PATH).get({ source: 'server' });
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      console.log("[Firebase] ✅ Données chargées depuis Firestore");
    } else {
      console.log("[Firebase] 📭 Pas encore de données cloud");
    }
  } catch (err) {
    console.warn("[Firebase] ⚠️ Serveur inaccessible, cache :", err.message);
    try {
      const snap = await db.doc(DOC_PATH).get({ source: 'cache' });
      if (snap.exists) {
        const data = snap.data();
        APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
        console.log("[Firebase] ✅ Données depuis cache offline");
      }
    } catch (_) {}
  }
}

// ── Listener temps réel ──────────────────────────────────────
// Seule garde : hasPendingWrites (= c'est MON écriture en attente).
// lastLocalWrite a été supprimé — c'était lui qui bloquait les
// mises à jour distantes en considérant à tort le snapshot comme
// "notre propre écriture récente".
db.doc(DOC_PATH).onSnapshot(
  snapshot => {
    if (snapshot.metadata.hasPendingWrites) return; // mon écriture locale → ignorer
    if (!window.__appReady) return;                 // app pas encore montée → ignorer
    if (!snapshot.exists) return;

    const data = snapshot.data();
    APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });

    console.log("[Firebase] 🔄 Changement distant reçu → re-rendu");
    rerenderApp();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

// ── Promesse exposée pour index.html ─────────────────────────
window.__firebaseReady = syncFromFirebase();
