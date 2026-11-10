// ============================================================
// KLAVE — Firebase Initialization & SDK Bindings
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateEmail,
  deleteUser,
  linkWithCredential,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  increment,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyAXIqvcrGXA-__O5FWot1WvbMCyKqoM2UA",
  authDomain: "klave-d1f20.firebaseapp.com",
  projectId: "klave-d1f20",
  storageBucket: "klave-d1f20.firebasestorage.app",
  messagingSenderId: "934276472122",
  appId: "1:934276472122:web:b4c51aa75da4dcebe9c403"
});

const auth = getAuth(app);
const db = getFirestore(app);

// Expose unified Firebase helpers so app modules never need redundant dynamic imports
window._auth = auth;
window._db = db;
window._googleProvider = new GoogleAuthProvider();
window._signInWithPopup = signInWithPopup;
window._EmailAuthProvider = EmailAuthProvider;
window._reauthenticate = reauthenticateWithCredential;
window._updatePassword = updatePassword;
window._updateEmail = updateEmail;
window._deleteUser = deleteUser;
window._linkWithCredential = linkWithCredential;
window._updateProfile = updateProfile;
window._createUser = createUserWithEmailAndPassword;
window._signIn = signInWithEmailAndPassword;
window._signOut = signOut;
window._sendVerification = sendEmailVerification;

window._collection = collection;
window._addDoc = addDoc;
window._getDocs = getDocs;
window._getDoc = getDoc;
window._setDoc = setDoc;
window._updateDoc = updateDoc;
window._deleteDoc = deleteDoc;
window._doc = doc;
window._query = query;
window._where = where;
window._increment = increment;
window._writeBatch = writeBatch;
window._ts = serverTimestamp;

onAuthStateChanged(auth, user => {
  const hasGoogle = user && user.providerData && user.providerData.some(p => p.providerId === 'google.com');
  window._currentUser = user && (user.emailVerified || hasGoogle) ? user : null;
  if (user) user.getIdToken(true).catch(() => {});
  if (typeof onAuthChange === 'function') onAuthChange(window._currentUser);
});

async function loadBeats() {
  try {
    const snap = await getDocs(collection(db, 'beats'));
    if (!snap.empty) {
      window._firestoreBeats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (typeof renderHome === 'function') renderHome();
      if (typeof renderSearch === 'function') renderSearch();
    }
  } catch (e) {
    console.log('Using local / mock beats');
  } finally {
    document.documentElement.classList.remove('beats-loading');
  }
}

window.addEventListener('load', loadBeats);
window._loadBeats = loadBeats;
