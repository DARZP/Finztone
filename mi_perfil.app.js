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

// --- Elementos del DOM ---
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profileRole = document.getElementById('profile-role');
const profilePhone = document.getElementById('profile-phone');
const profileClabe = document.getElementById('profile-clabe');
const profileRfc = document.getElementById('profile-rfc');

const backButton = document.getElementById('back-button');
const editProfileBtn = document.getElementById('edit-profile-btn');
const changePasswordBtn = document.getElementById('change-password-btn');


auth.onAuthStateChanged(async (user) => {
    if (user) {
        // 1. Si hay un usuario, buscamos su perfil en Firestore por su email
        const userProfileQuery = await db.collection('usuarios').where('email', '==', user.email).limit(1).get();

        if (!userProfileQuery.empty) {
            const userDoc = userProfileQuery.docs[0];
            const userData = userDoc.data();
            
            // 2. Rellenamos la página con la información
            profileName.textContent = userData.nombre || 'No disponible';
            profileEmail.textContent = userData.email;
            profileRole.textContent = userData.rol || 'No disponible';
            profilePhone.textContent = userData.telefono || 'No registrado';
            profileClabe.textContent = userData.clabe || 'No registrada';
            profileRfc.textContent = userData.rfc || 'No registrado';

            // 3. Configuramos los botones
            // El botón "Volver" apunta al dashboard correcto según el rol
            backButton.href = userData.rol === 'empleado' ? 'empleado_dashboard.html' : 'dashboard.html';
            
            // El botón "Editar" apuntará a una nueva página que crearemos después
            // Pasamos el ID del documento del usuario para saber a quién editar
            editProfileBtn.href = `editar_mi_perfil.html?id=${userDoc.id}`;

        } else {
            // Caso especial para el primer admin que no tiene perfil en Firestore
            profileName.textContent = 'Administrador Principal';
            profileEmail.textContent = user.email;
            profileRole.textContent = 'admin';
            backButton.href = 'dashboard.html';
            editProfileBtn.style.display = 'none'; // Ocultamos el botón de editar
        }

        // 4. Añadimos la funcionalidad al botón de cambiar contraseña
        changePasswordBtn.addEventListener('click', () => {
            const newPassword = prompt("Introduce tu nueva contraseña (mínimo 6 caracteres):");
            if (newPassword && newPassword.length >= 6) {
                user.updatePassword(newPassword)
                    .then(() => {
                        alert("¡Contraseña actualizada exitosamente!");
                    })
                    .catch((error) => {
                        console.error("Error al cambiar la contraseña:", error);
                        alert("Ocurrió un error. Es posible que necesites volver a iniciar sesión para realizar esta acción.");
                    });
            } else if (newPassword) {
                alert("La contraseña debe tener al menos 6 caracteres.");
            }
        });

    } else {
        // Si no hay usuario, lo redirigimos al inicio
        window.location.href = 'index.html';
    }
});
