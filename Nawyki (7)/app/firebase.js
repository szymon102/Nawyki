import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCIRWm0yJGGiuoSxcnXpot_FKYjtog_YQg",
  authDomain: "nawyki-6bc37.firebaseapp.com",
  projectId: "nawyki-6bc37",
  storageBucket: "nawyki-6bc37.firebasestorage.app",
  messagingSenderId: "383482937154",
  appId: "1:383482937154:web:e9757c01c52af4057512db"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
export { signInWithPopup, signOut };