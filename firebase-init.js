// Contenido de firebase-init.js

// 1. La configuración centralizada y CORREGIDA
const firebaseConfig = {
    apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84",
    authDomain: "finztone-app.firebaseapp.com",
    projectId: "finztone-app",
    storageBucket: "finztone-app.firebasestorage.app", // <--- ¡LA LÍNEA CORREGIDA!
    messagingSenderId: "95145879307",
    appId: "1:95145879307:web:e10017a75edf32f1fde40e",
    measurementId: "G-T8KMJXNSTP"
};

// 2. Inicializamos Firebase una sola vez
firebase.initializeApp(firebaseConfig);

// 3. Exportamos todos los servicios que necesita la aplicación
export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
export const functions = firebase.app().functions('us-central1');

// --- SISTEMA GLOBAL DE TEMA CLARO/OSCURO ---
const savedTheme = localStorage.getItem('finztone_theme');
if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
}

// --- SISTEMA GLOBAL DE TEMA CLARO/OSCURO ---
export function aplicarTema(preferencia) {
    const body = document.body;
    
    if (preferencia === 'light') {
        body.classList.add('light-mode');
    } else if (preferencia === 'dark') {
        body.classList.remove('light-mode');
    } else {
        // MODO AUTOMÁTICO
        const horaActual = new Date().getHours();
        // Si son las 6:00 AM (6) o más, pero antes de las 7:00 PM (19), es de día (Claro)
        if (horaActual >= 6 && horaActual < 19) {
            body.classList.add('light-mode');
        } else {
            // De las 7:00 PM en adelante, o antes de las 6:00 AM, es de noche (Oscuro)
            body.classList.remove('light-mode');
        }
    }
}

// 1. Al cargar cualquier página, leemos la preferencia guardada (o por defecto 'auto')
const preferenciaGuardada = localStorage.getItem('finztone_theme_pref') || 'auto';
aplicarTema(preferenciaGuardada);

// 2. Revisamos silenciosamente cada minuto por si la hora cambia mientras usan la app
setInterval(() => {
    if ((localStorage.getItem('finztone_theme_pref') || 'auto') === 'auto') {
        aplicarTema('auto');
    }
}, 60000);
