import { auth, db } from './firebase-init.js'; // Usamos nuestro archivo central

const userDisplayElement = document.getElementById('user-email'); // El elemento que vamos a cambiar
const logoutButton = document.getElementById('logout-button');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Buscamos el perfil del usuario en Firestore usando su UID
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Mostramos el nombre del usuario en lugar del email
                userDisplayElement.textContent = userData.nombre || 'Administrador';
            } else {
                // Si por alguna razón no se encuentra, mostramos un texto genérico
                userDisplayElement.textContent = 'Administrador';
            }
        } catch (error) {
            console.error("Error al obtener el perfil del usuario:", error);
            userDisplayElement.textContent = user.email; // Como respaldo, mostramos el email
        }
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
});

