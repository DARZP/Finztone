import { auth, db } from './firebase-init.js';

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
        // Lógica simplificada: ahora que todos los usuarios tienen perfil,
        // lo buscamos directamente con el UID de autenticación.
        const userDocRef = db.collection('usuarios').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // 2. Rellenamos la página con la información
            profileName.textContent = userData.nombre || 'No disponible';
            profileEmail.textContent = userData.email;
            profileRole.textContent = userData.rol || 'No disponible';
            profilePhone.textContent = userData.telefono || 'No registrado';
            profileClabe.textContent = userData.clabe || 'No registrada';
            profileRfc.textContent = userData.rfc || 'No registrado';

            // 3. Configuramos los botones
            backButton.href = userData.rol === 'empleado' ? 'empleado_dashboard.html' : 'dashboard.html';
            editProfileBtn.href = `editar_mi_perfil.html?id=${userDoc.id}`;

        } else {
            // Este caso de respaldo es por si algo falla en la creación automática del perfil.
            console.error("No se encontró el perfil del usuario en Firestore.");
            alert("No se pudo cargar tu perfil. Intenta iniciar sesión de nuevo.");
            backButton.href = 'index.html';
            editProfileBtn.style.display = 'none';
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
