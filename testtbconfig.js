/* config.js */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
import { getDatabase, ref, set, get, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, setPersistence, browserSessionPersistence, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyAJEQqsEOBMcgXBe2JQwne0obz8JgyQoZs",
    authDomain: "khbdsc.firebaseapp.com",
    databaseURL: "https://khbdsc-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "khbdsc",
    storageBucket: "khbdsc.firebasestorage.app",
    messagingSenderId: "46883062471",
    appId: "1:46883062471:web:f6ccc6abf5d8785e51b4e2",
    measurementId: "G-17H1H45NWK"
};

const app = initializeApp(firebaseConfig);
// Khai báo tập trung SITE KEY
const RECAPTCHA_SITE_KEY = '6Ldl4UIsAAAAAJHqtzZeGxXmfNzFNGd5vf-s4QkK';
window.RECAPTCHA_SITE_KEY = RECAPTCHA_SITE_KEY; // Chia sẻ biến này cho tbscript.js

// TẢI ĐỘNG THẺ SCRIPT RECAPTCHA V3
const recaptchaScript = document.createElement('script');
recaptchaScript.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
document.head.appendChild(recaptchaScript);

// Khởi tạo App Check với biến đã khai báo
window.appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
});

const db = getDatabase(app);
const auth = getAuth(app);
// --- CHIA SẺ CÁC BIẾN DATABASE RA GLOBAL SCOPE ĐỂ tbscript.JS SỬ DỤNG ---
window.db = db;
window.auth = auth;

// Gán các hàm Firebase SDK vào window object để tbscript.js gọi được
window.FB_ref = ref;
window.FB_set = set;
window.FB_get = get;
window.FB_update = update;
window.FB_remove = remove;
window.FB_signInWithEmailAndPassword = signInWithEmailAndPassword;
window.FB_setPersistence = setPersistence;
window.FB_browserSessionPersistence = browserSessionPersistence;
window.FB_signOut = signOut;
// Cấu hình URL của Google Apps Script từ luudrive
window.WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwlfEd9fnn3JoG9zdSoDm_k5JVV-NJpH0PqA1_FjbuG9DssaEOvmBnwBkC4kjM8qkAU/exec";