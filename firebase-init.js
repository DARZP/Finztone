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

// =========================================================
// SISTEMA GLOBAL DE NOTIFICACIONES (TOASTS)
// =========================================================

export function mostrarNotificacion(mensaje, tipo = 'success') {
    // 1. Buscamos o creamos el contenedor de los toasts
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // 2. Creamos la notificación
    const toast = document.createElement('div');
    toast.classList.add('toast', tipo);
    
    // 3. Asignamos un icono según el tipo (usando Phosphor Icons o Emojis por defecto)
    let icon = '<i class="ph ph-info" style="font-size: 1.5em; color: #3b82f6;"></i>';
    if (tipo === 'success') icon = '<i class="ph ph-check-circle" style="font-size: 1.5em; color: #10b981;"></i>';
    if (tipo === 'error') icon = '<i class="ph ph-warning-circle" style="font-size: 1.5em; color: #ef4444;"></i>';

    toast.innerHTML = `${icon} <span>${mensaje}</span>`;
    container.appendChild(toast);

    // 4. Animamos la entrada (un pequeño delay para que CSS note el cambio)
    setTimeout(() => toast.classList.add('show'), 10);

    // 5. Lo removemos automáticamente después de 3.5 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); // Espera a que termine la animación para borrarlo del HTML
    }, 3500);
}

// Hacemos la función disponible globalmente en la ventana por si alguna vista no la importa
window.mostrarNotificacion = mostrarNotificacion;
