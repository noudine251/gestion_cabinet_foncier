// ============================================================
//  SNS Foncier — Migration totale Firestore
//  Aucune donnée app dans localStorage.
//  Toutes les lectures/écritures passent par memStore ↔ Firestore.
//  onSnapshot → rerenderApp() met à jour tous les navigateurs.
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

// ── Initialisation Firebase ──────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ── Store mémoire (source de vérité pour les données app) ────
const memStore = Object.create(null);

// ── Nettoyage : supprimer les anciennes données du vrai localStorage ─
APP_KEYS.forEach(k => {
  try { Storage.prototype.removeItem.call(window.localStorage, k); } catch(_) {}
});

// ── Override Storage.prototype (Chrome, Firefox, Safari, mobile) ─
// On intercepte le prototype, pas l'objet instance — seule méthode
// garantie de fonctionner sur tous les navigateurs.
const _proto = {
  get : Storage.prototype.getItem,
  set : Storage.prototype.setItem,
  del : Storage.prototype.removeItem,
};

Storage.prototype.getItem = function(key) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    return (key in memStore) ? memStore[key] : null;
  }
  return _proto.get.call(this, key);
};

Storage.prototype.setItem = function(key, val) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    const str = String(val);
    memStore[key] = str;
    lastLocalWrite = Date.now();
    db.doc(DOC_PATH)
      .set({ [key]: str, _token: WRITE_TOKEN }, { merge: true })
      .catch(e => console.warn("[Firebase] ⚠️ Write:", e.message));
    return;
  }
  _proto.set.call(this, key, val);
};

Storage.prototype.removeItem = function(key) {
  if (this === window.localStorage && APP_KEYS.includes(key)) {
    delete memStore[key];
    return;
  }
  _proto.del.call(this, key);
};

// ── Timestamp du dernier write local (anti-boucle) ───────────
let lastLocalWrite = 0;

// ── Re-rendu React sans rechargement de page ─────────────────
function rerenderApp() {
  const wrapper = document.getElementById('app-wrapper');
  if (!wrapper) { window.location.reload(); return; }

  // Nouveau conteneur React propre (sans marqueurs internes React)
  wrapper.innerHTML = '<div id="root"></div>';

  // Retirer l'ancien script app.js
  document.querySelectorAll('script[data-sns-app]').forEach(s => s.remove());

  // Re-exécuter app.js depuis le cache navigateur (instantané)
  const s = document.createElement('script');
  s.src = 'app.js';
  s.setAttribute('data-sns-app', '1');
  document.body.appendChild(s);

  console.log("[Firebase] ✅ Interface mise à jour (temps réel)");
}

// ── 1. Chargement initial : données fraîches depuis le serveur ─
async function syncFromFirebase() {
  try {
    // source:'server' contourne le cache IndexedDB offline — garantit des données fraîches
    const snap = await db.doc(DOC_PATH).get({ source: 'server' });
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      console.log("[Firebase] ✅ Données chargées depuis Firestore");
    } else {
      console.log("[Firebase] 📭 Document vide — premier démarrage");
    }
  } catch (err) {
    // Hors-ligne : fallback cache
    console.warn("[Firebase] ⚠️ Serveur inaccessible, tentative cache :", err.message);
    try {
      const snap = await db.doc(DOC_PATH).get({ source: 'cache' });
      if (snap.exists) {
        const data = snap.data();
        APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
        console.log("[Firebase] ✅ Données chargées depuis le cache hors-ligne");
      }
    } catch (_) {
      console.warn("[Firebase] ⚠️ Aucune donnée disponible (hors-ligne)");
    }
  }
}

// ── 2. Listener temps réel (tous navigateurs / appareils) ─────
db.doc(DOC_PATH).onSnapshot(
  { includeMetadataChanges: true },
  snapshot => {
    // Écriture locale non confirmée → ignorer
    if (snapshot.metadata.hasPendingWrites) return;
    // Données venant du cache IndexedDB (pas du serveur) → ignorer
    if (snapshot.metadata.fromCache) return;
    // Notre propre écriture récente (< 2 s) → ignorer
    if (Date.now() - lastLocalWrite < 2000) return;
    // App pas encore montée (snapshot initial) → ignorer
    if (!window.__appReady) return;
    if (!snapshot.exists) return;

    // Mettre à jour le store mémoire avec les données du serveur
    const data = snapshot.data();
    APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });

    console.log("[Firebase] 🔄 Changement reçu → mise à jour de l'interface");
    rerenderApp();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

// ── 3. Promesse exposée pour index.html ──────────────────────
window.__firebaseReady = syncFromFirebase();
