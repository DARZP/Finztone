// --- VERIFICADOR DE SESIÓN ACTIVA ---
auth.onAuthStateChanged((user) => {
  if (user) {
    // Si el observador detecta un usuario activo al cargar la página...
    console.log("Usuario ya logueado detectado:", user.email);
    // ...lo mandamos directamente a la función que decide a qué dashboard enviarlo.
    handleLoginSuccess(user);
  } else {
    // Si no hay usuario, no hacemos nada y dejamos que se muestre la página de login.
    console.log("No hay sesión activa, mostrando página de login.");
  }
});

import { auth, db } from './firebase-init.js';

console.log("¡Firebase conectado exitosamente!");


// Función para manejar la navegación por pestañas (Sin cambios)
function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

// Asegurarse de que la primera pestaña esté activa al cargar (Sin cambios)
document.addEventListener('DOMContentLoaded', (event) => {
    const firstTab = document.querySelector('.tab-link');
    if (firstTab) {
        firstTab.click();
    }
});

function handleLoginSuccess(user) {
    // Búsqueda más eficiente: directamente por el UID del usuario.
    const userDocRef = db.collection('usuarios').doc(user.uid);

    userDocRef.get()
        .then((doc) => {
            if (!doc.exists) {
                // El usuario existe en Authentication pero no en Firestore.
                // Asumimos que es un nuevo Administrador y le creamos su perfil.
                console.log('Administrador sin perfil detectado. Creando perfil...');
                
                const newAdminData = {
                    email: user.email,
                    nombre: "Administrador", // Nombre por defecto
                    rol: 'admin',
                    status: 'activo', // Añadimos el status por consistencia
                    fechaDeCreacion: new Date()
                };

                // Creamos el perfil y la suscripción gratuita por defecto
                const profilePromise = userDocRef.set(newAdminData);
                const subPromise = db.collection('suscripciones').doc(user.uid).set({
                    planNombre: 'Gratuito',
                    limiteColaboradores: 2,
                    estado: 'activo',
                    fechaDeInicio: new Date()
                });

                // Esperamos a que todo se guarde antes de redirigir
                return Promise.all([profilePromise, subPromise]).then(() => {
                    console.log('Perfil de administrador y suscripción creados. Redirigiendo...');
                    window.location.href = 'dashboard.html';
                });

            } else {
                // El perfil ya existe, redirigimos según el rol.
                const userData = doc.data();
                if (userData.rol === 'empleado') {
                    console.log('Usuario es Empleado, redirigiendo...');
                    window.location.href = 'empleado_dashboard.html';
                } else if (userData.rol === 'coadmin') { // <-- ¡NUEVA LÓGICA!
                    console.log('Usuario es Co-Administrador, redirigiendo...');
                    window.location.href = 'coadmin_dashboard.html';
                } else { // El rol es 'admin' o no está definido (se asume admin)
                    console.log('Usuario es Administrador, redirigiendo...');
                    window.location.href = 'dashboard.html';
                }
            }
        })
        .catch(error => {
            console.error("Error al obtener el rol del usuario:", error);
            alert('Ocurrió un error al verificar tu rol. Contacta al administrador.');
            auth.signOut();
        });
}

// 1. Escuchador para el formulario de Administrador (actualizado)
const adminLoginForm = document.getElementById('admin-login-form');
adminLoginForm.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const email = adminLoginForm['admin-email'].value;
    const password = adminLoginForm['admin-password'].value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // En lugar de redirigir aquí, llamamos a nuestra nueva función central.
            handleLoginSuccess(userCredential.user);
        })
        .catch((error) => {
            alert(traducirErrorDeFirebase(error.code));
        });
});

// 2. NUEVO Escuchador para el formulario de Empleado
const employeeLoginForm = document.getElementById('employee-login-form');
employeeLoginForm.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const email = employeeLoginForm['employee-email'].value;
    const password = employeeLoginForm['employee-password'].value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // El formulario de empleado también usa la misma función central.
            handleLoginSuccess(userCredential.user);
        })
        .catch((error) => {
            alert(traducirErrorDeFirebase(error.code));
        });
});


// FUNCIÓN AUXILIAR: Traduce los códigos de error (Sin cambios)
function traducirErrorDeFirebase(codigoDeError) {
    switch (codigoDeError) {
        case 'auth/user-not-found':
            return 'El correo electrónico no está registrado.';
        case 'auth/wrong-password':
            return 'La contraseña es incorrecta.';
        case 'auth/invalid-email':
            return 'El formato del correo electrónico no es válido.';
        case 'auth/too-many-requests':
            return 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.';
        default:
            return 'Ocurrió un error inesperado al intentar iniciar sesión.';
    }
}
