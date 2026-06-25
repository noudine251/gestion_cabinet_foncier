// ============================================================
//  SNS Foncier — Synchronisation Firebase Firestore
//  Remplace localStorage par Firebase pour la sync temps réel
//  ⚠️  Remplissez firebaseConfig avec vos valeurs Firebase
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyDOEKpjxz7Tzh74xaF8E0yktC7SZTulHws",
  authDomain:        "sns-foncier.firebaseapp.com",
  projectId:         "sns-foncier",
  storageBucket:     "sns-foncier.firebasestorage.app",
  messagingSenderId: "1067152720019",
  appId:             "1:1067152720019:web:c5bb13cdf153704b940d66"
};

// Clés localStorage utilisées par l'application
const APP_KEYS   = ["sns4-req", "sns4-dos", "sns4-users"];
const DOC_PATH   = "gestion-fonciere/data";
const WRITE_TOKEN = "SNSFoncier@2024#Secure";

// ─── Initialisation Firebase ────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Référence à la vraie méthode localStorage (avant interception)
const _realSet = localStorage.setItem.bind(localStorage);
const _realGet = localStorage.getItem.bind(localStorage);

// Timestamp de la dernière écriture locale (pour éviter boucle reload)
let lastLocalWrite = 0;

// ─── 1. Charger les données Firebase → localStorage ──────────
async function syncFromFirebase() {
  try {
    const snap = await db.doc(DOC_PATH).get();
    if (snap.exists) {
      const data = snap.data();
      APP_KEYS.forEach(key => {
        if (data[key] !== undefined) {
          _realSet(key, data[key]);
        }
      });
      console.log("[Firebase] ✅ Données chargées depuis le cloud");
    } else {
      console.log("[Firebase] 📭 Aucune donnée cloud — démarrage avec localStorage");
    }
  } catch (err) {
    console.warn("[Firebase] ⚠️ Lecture échouée, mode hors-ligne :", err.message);
  }
}

// ─── 2. Intercepter localStorage.setItem → écrire dans Firebase aussi ─
localStorage.setItem = function (key, value) {
  _realSet(key, value);
  if (APP_KEYS.includes(key)) {
    lastLocalWrite = Date.now();
    db.doc(DOC_PATH)
      .set({ [key]: value, _token: WRITE_TOKEN }, { merge: true })
      .catch(err => console.warn("[Firebase] ⚠️ Écriture:", err.message));
  }
};

// ─── 3. Écouter les changements en temps réel (autres appareils) ─────
db.doc(DOC_PATH).onSnapshot(
  snapshot => {
    if (!snapshot.exists) return;

    // Ignorer nos propres écritures (fenêtre de 2 secondes)
    if (Date.now() - lastLocalWrite < 2000) return;

    const data = snapshot.data();
    let changed = false;

    APP_KEYS.forEach(key => {
      const remote = data[key];
      const local  = _realGet(key);
      if (remote !== undefined && remote !== local) {
        _realSet(key, remote);
        changed = true;
      }
    });

    if (changed) {
      console.log("[Firebase] 🔄 Mise à jour reçue — rechargement de l'application...");
      setTimeout(() => window.location.reload(), 600);
    }
  },
  err => console.warn("[Firebase] ⚠️ Listener:", err.message)
);

// ─── 4. Exposer la promesse de sync (utilisée par index.html) ────────
window.__firebaseReady = syncFromFirebase();
