import { auth, db } from './firebase-init.js';

const userDisplayElement = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        if (userDoc.exists) {
            userDisplayElement.textContent = userDoc.data().nombre || 'Co-Admin';
        } else {
            userDisplayElement.textContent = 'Co-Admin';
        }
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    auth.signOut().then(() => { window.location.href = 'index.html'; });
});
