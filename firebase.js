// ============================================================
//  SNS Foncier — Synchronisation Firestore temps réel
//  Les clés app ne passent PLUS par localStorage :
//  elles sont stockées dans memStore (mémoire) synchronisé
//  avec Firestore via onSnapshot.
//  Quand un autre navigateur modifie les données, rerenderApp()
//  recharge l'interface sans recharger la page entière.
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

// ── Store mémoire (remplace localStorage pour les données app) ─
const memStore = Object.create(null);

// ── Sauvegarde des méthodes localStorage natives ──────────────
const _lsGet = localStorage.getItem.bind(localStorage);
const _lsSet = localStorage.setItem.bind(localStorage);
const _lsDel = localStorage.removeItem.bind(localStorage);

// ── Override localStorage : APP_KEYS → memStore, reste → natif ─
localStorage.getItem = function (key) {
  if (APP_KEYS.includes(key)) return (key in memStore) ? memStore[key] : null;
  return _lsGet(key);
};
localStorage.setItem = function (key, val) {
  if (APP_KEYS.includes(key)) {
    memStore[key] = val;
    lastLocalWrite = Date.now();
    db.doc(DOC_PATH)
      .set({ [key]: val, _token: WRITE_TOKEN }, { merge: true })
      .catch(e => console.warn("[Firebase] ⚠️ Écriture:", e.message));
  } else {
    _lsSet(key, val);
  }
};
localStorage.removeItem = function (key) {
  if (APP_KEYS.includes(key)) delete memStore[key];
  else _lsDel(key);
};

// ── Timestamp du dernier write local (anti-boucle) ───────────
let lastLocalWrite = 0;

// ── Re-rendu React sans rechargement de page ─────────────────
function rerenderApp() {
  const wrapper = document.getElementById('app-wrapper');
  if (!wrapper) { window.location.reload(); return; }

  // Conteneur React vierge — supprime les marqueurs internes React
  wrapper.innerHTML = '<div id="root"></div>';

  // Retirer l'ancien script app.js du DOM
  document.querySelectorAll('script[data-sns-app]').forEach(s => s.remove());

  // Re-exécuter app.js (servi depuis le cache navigateur, instantané)
  const s = document.createElement('script');
  s.src = 'app.js';
  s.setAttribute('data-sns-app', '1');
  document.body.appendChild(s);

  console.log("[Firebase] ✅ Interface mise à jour en temps réel");
}

// ── 1. Chargement initial Firestore → memStore ────────────────
async function syncFromFirebase() {
  try {
    const snap = await db.doc(DOC_PATH).get();
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });
      console.log("[Firebase] ✅ Données chargées depuis Firestore");
    } else {
      console.log("[Firebase] 📭 Pas de données cloud — démarrage local");
    }
  } catch (err) {
    console.warn("[Firebase] ⚠️ Chargement initial:", err.message);
  }
}

// ── 2. Listener temps réel (tous navigateurs / appareils) ─────
db.doc(DOC_PATH).onSnapshot(
  { includeMetadataChanges: true },
  snapshot => {
    // Écriture locale non encore confirmée par le serveur → ignorer
    if (snapshot.metadata.hasPendingWrites) return;
    // Notre propre write récent (< 2 s) → ignorer
    if (Date.now() - lastLocalWrite < 2000) return;
    // App pas encore montée (snapshot initial) → ignorer
    if (!window.__appReady) return;
    if (!snapshot.exists) return;

    // Mettre à jour le store mémoire avec les données distantes
    const data = snapshot.data();
    APP_KEYS.forEach(k => { if (data[k] !== undefined) memStore[k] = data[k]; });

    console.log("[Firebase] 🔄 Changement reçu d'un autre navigateur → re-rendu");
    rerenderApp();
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

// ── 3. Promesse de sync exposée pour index.html ───────────────
window.__firebaseReady = syncFromFirebase();
