import { auth, db } from './firebase-init.js';

// ---- PROTECCIÓN DE LA PÁGINA Y LÓGICA DEL DASHBOARD ----

const userEmailElement = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');

// 1. Verificamos el estado de la autenticación
auth.onAuthStateChanged((user) => {
    if (user) {
        // Si el usuario ha iniciado sesión...
        console.log('Usuario autenticado:', user.email);
        // Mostramos su correo en la barra de navegación
        userEmailElement.textContent = user.email;
    } else {
        // Si el usuario no ha iniciado sesión...
        console.log('No hay usuario autenticado. Redirigiendo a la página de inicio.');
        // Lo redirigimos a la página de inicio de sesión
        window.location.href = 'index.html';
    }
});

// 2. Lógica para el botón de cerrar sesión
logoutButton.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            // Cierre de sesión exitoso
            console.log('El usuario ha cerrado sesión.');
            alert('Has cerrado sesión exitosamente.');
            // Redirigimos al usuario a la página de inicio de sesión
            window.location.href = 'index.html';
        })
        .catch((error) => {
            // Ocurrió un error
            console.error('Error al cerrar sesión:', error);
            alert('Ocurrió un error al intentar cerrar sesión.');
        });
});
