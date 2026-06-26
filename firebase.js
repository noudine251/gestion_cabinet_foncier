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
const PRELOAD_KEY = "__sns_preload"; // clé sessionStorage pour le reload rapide

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Store mémoire ────────────────────────────────────────────
const memStore = Object.create(null);

// ── Supprimer toute surcharge d'instance de versions précédentes ─
try { delete localStorage.getItem;    } catch (_) {}
try { delete localStorage.setItem;    } catch (_) {}
try { delete localStorage.removeItem; } catch (_) {}
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

// ── Chargement initial ────────────────────────────────────────
// Si sessionStorage contient des données pré-chargées (reload sync),
// on les utilise directement → résolution instantanée, zéro requête réseau.
async function syncFromFirebase() {
  const preload = sessionStorage.getItem(PRELOAD_KEY);
  if (preload) {
    try {
      const data = JSON.parse(preload);
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      sessionStorage.removeItem(PRELOAD_KEY);
      console.log("[Firebase] ⚡ Données pré-chargées — sync instantané");
      return; // pas besoin de fetch Firestore
    } catch (_) {}
  }

  // Chargement normal : données fraîches depuis le serveur
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
    console.warn("[Firebase] ⚠️ Serveur inaccessible, tentative cache :", err.message);
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
// Quand un autre navigateur modifie les données :
//   1. On stocke les nouvelles données dans sessionStorage (survit au reload)
//   2. window.location.reload() recharge la page
//   3. syncFromFirebase() trouve sessionStorage → charge instantanément
//   4. L'écran de chargement est caché immédiatement (voir index.html)
// → Résultat : mise à jour visible en < 200 ms, sans action utilisateur.
db.doc(DOC_PATH).onSnapshot(
  snapshot => {
    if (snapshot.metadata.hasPendingWrites) return; // ma propre écriture → ignorer
    if (!window.__appReady) return;                 // app pas encore montée → ignorer
    if (!snapshot.exists) return;

    const data = snapshot.data();

    // Vérifier qu'il y a réellement un changement dans les données app
    const hasChange = APP_KEYS.some(k => data[k] !== undefined && data[k] !== memStore[k]);
    if (!hasChange) return;

    // Pré-charger les données dans sessionStorage avant le reload
    const preload = {};
    APP_KEYS.forEach(k => { if (data[k] !== undefined) preload[k] = data[k]; });
    sessionStorage.setItem(PRELOAD_KEY, JSON.stringify(preload));

    console.log("[Firebase] 🔄 Changement distant → rechargement rapide");
    window.location.reload();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

window.__firebaseReady = syncFromFirebase();
