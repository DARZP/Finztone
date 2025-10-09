import { auth, db } from './firebase-init.js';

const welcomeMessage = document.getElementById('welcome-message');
const logoutButton = document.getElementById('logout-button');

auth.onAuthStateChanged((user) => {
    if (user) {
        // Buscamos el nombre del empleado en la base de datos
        db.collection('usuarios').where('email', '==', user.email).get().then(snapshot => {
            if (!snapshot.empty) {
                const userData = snapshot.docs[0].data();
                welcomeMessage.textContent = `¡Hola, ${userData.nombre}!`;
            }
        });
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
});
