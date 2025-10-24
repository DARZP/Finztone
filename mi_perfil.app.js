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

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();

                // --- CORRECCIÓN CLAVE: Lógica para el botón "Volver" ---
                // Verificamos el rol y asignamos el dashboard correspondiente.
                if (userData.rol === 'coadmin') {
                    backButton.href = 'coadmin_dashboard.html';
                } else if (userData.rol === 'empleado') {
                    backButton.href = 'empleado_dashboard.html';
                } else { // 'admin' o cualquier otro caso
                    backButton.href = 'dashboard.html';
                }

                // El resto de la lógica para llenar el perfil no cambia.
                profileName.textContent = userData.nombre || 'No disponible';
                profileEmail.textContent = userData.email;
                profileRole.textContent = userData.rol || 'No disponible';
                profilePhone.textContent = userData.telefono || 'No registrado';
                profileClabe.textContent = userData.clabe || 'No registrada';
                profileRfc.textContent = userData.rfc || 'No registrado';

                // Configuramos el botón de editar.
                editProfileBtn.href = `editar_mi_perfil.html?id=${userDoc.id}`;

            } else {
                console.error("No se encontró el perfil del usuario en Firestore.");
                alert("No se pudo cargar tu perfil.");
                backButton.href = 'index.html';
                editProfileBtn.style.display = 'none';
            }
        } catch (error) {
            console.error("Error al obtener el perfil:", error);
            alert("Ocurrió un error al cargar tu perfil.");
        }

        // La funcionalidad de cambiar contraseña no necesita cambios.
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
        window.location.href = 'index.html';
    }
});
