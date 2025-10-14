import { auth, db } from './firebase-init.js'; // Usamos nuestro archivo central

const welcomeMessage = document.getElementById('welcome-message');
const logoutButton = document.getElementById('logout-button');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Buscamos el perfil del empleado usando su UID
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                welcomeMessage.textContent = `¡Hola, ${userData.nombre}!`;
            } else {
                 welcomeMessage.textContent = '¡Hola!';
            }
        } catch (error) {
            console.error("Error al obtener el perfil del empleado:", error);
            welcomeMessage.textContent = '¡Bienvenido!';
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
