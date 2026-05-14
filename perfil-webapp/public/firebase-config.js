import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHqreP4kXLXkQHfyHMUSPx1TJbe6_PMOc",
  authDomain: "perfil-webapp.firebaseapp.com",
  projectId: "perfil-webapp",
  storageBucket: "perfil-webapp.firebasestorage.app",
  messagingSenderId: "992684840171",
  appId: "1:992684840171:web:542a703c47ae7e71ac5aae"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
