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

// ── Store mémoire (source de vérité, plus de localStorage) ───
const memStore = Object.create(null);

// ── Nettoyer les anciennes données dans le vrai localStorage ──
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
    memStore[key]  = str;
    lastLocalWrite = Date.now();
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

// ── Anti-boucle ──────────────────────────────────────────────
let lastLocalWrite = 0;

// ── Cache du code app.js (chargé une seule fois en mémoire) ──
let appCode = null;

async function getAppCode() {
  if (appCode) return appCode;
  const res = await fetch('app.js');
  appCode = await res.text();
  return appCode;
}

// ── Re-rendu React sans rechargement de page ─────────────────
// On injecte app.js comme script INLINE → toujours exécuté par
// le navigateur (pas de déduplication sur les scripts sans src).
async function rerenderApp() {
  const wrapper = document.getElementById('app-wrapper');
  if (!wrapper) { window.location.reload(); return; }

  try {
    const code = await getAppCode();

    // Nouveau conteneur React propre (sans marqueurs internes React)
    wrapper.innerHTML = '<div id="root"></div>';

    // Supprimer les précédents scripts app.js injectés
    document.querySelectorAll('script[data-sns-app]').forEach(s => s.remove());

    // Script inline → exécuté immédiatement, garanti par tous les navigateurs
    const s = document.createElement('script');
    s.textContent = code;
    s.setAttribute('data-sns-app', '1');
    document.body.appendChild(s);

    console.log("[Firebase] ✅ Interface mise à jour en temps réel");
  } catch (err) {
    console.warn("[Firebase] rerenderApp échoué → rechargement :", err.message);
    window.location.reload();
  }
}

// ── Chargement initial : données fraîches depuis le serveur ───
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
    // Hors-ligne : fallback sur le cache local
    console.warn("[Firebase] ⚠️ Serveur inaccessible, cache :", err.message);
    try {
      const snap = await db.doc(DOC_PATH).get({ source: 'cache' });
      if (snap.exists) {
        const data = snap.data();
        APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
        console.log("[Firebase] ✅ Données depuis cache offline");
      }
    } catch (_) {
      console.warn("[Firebase] ⚠️ Aucune donnée disponible");
    }
  }
}

// ── Listener temps réel (tous navigateurs / appareils) ────────
db.doc(DOC_PATH).onSnapshot(
  snapshot => {
    // Écriture locale non encore confirmée par le serveur → ignorer
    if (snapshot.metadata.hasPendingWrites) return;
    // Notre propre écriture récente (< 2 s) → ignorer
    if (Date.now() - lastLocalWrite < 2000) return;
    // App pas encore montée → ignorer
    if (!window.__appReady) return;
    if (!snapshot.exists) return;

    // Mettre à jour le store mémoire
    const data = snapshot.data();
    APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });

    console.log("[Firebase] 🔄 Changement reçu → mise à jour de l'interface");
    rerenderApp();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

// ── Promesse exposée pour index.html ─────────────────────────
window.__firebaseReady = syncFromFirebase();
