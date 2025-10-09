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
