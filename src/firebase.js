// firebase.js — Configuración e inicialización de Firebase + helpers de Firestore
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, collection,
  onSnapshot, serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyByoT4gj6pt0Zfmz5v2RAhxaH7YNnspSuw",
  authDomain: "reyco-app.firebaseapp.com",
  projectId: "reyco-app",
  storageBucket: "reyco-app.firebasestorage.app",
  messagingSenderId: "365816656880",
  appId: "1:365816656880:web:08c364b239c48f8acf6335"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ─── Colección única "reyco_data", un documento por "key" (cases, clientes, etc.) ──
const COLLECTION = "reyco_data";

export async function dbGetCloud(key) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
    return snap.exists() ? snap.data().value : null;
  } catch (e) {
    console.error("dbGetCloud error:", e);
    return null;
  }
}

export async function dbSetCloud(key, value) {
  try {
    await setDoc(doc(db, COLLECTION, key), {
      value,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (e) {
    console.error("dbSetCloud error:", e);
    return false;
  }
}

// Suscripción en tiempo real: cuando algo cambia en la nube, actualiza la UI
export function dbSubscribe(key, callback) {
  return onSnapshot(doc(db, COLLECTION, key), (snap) => {
    if (snap.exists()) callback(snap.data().value);
  }, (err) => console.error("dbSubscribe error:", err));
}
