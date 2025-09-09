const firebaseConfig = {
    apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84",
    authDomain: "finztone-app.firebaseapp.com",
    projectId: "finztone-app",
    storageBucket: "finztone-app.appspot.com",
    messagingSenderId: "95145879307",
    appId: "1:95145879307:web:e10017a75edf32f1fde40e",
    measurementId: "G-T8KMJXNSTP"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

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