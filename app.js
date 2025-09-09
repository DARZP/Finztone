const firebaseConfig = {
    apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84",
    authDomain: "finztone-app.firebaseapp.com",
    projectId: "finztone-app",
    storageBucket: "finztone-app.appspot.com",
    messagingSenderId: "95145879307",
    appId: "1:95145879307:web:e10017a75edf32f1fde40e",
    measurementId: "G-T8KMJXNSTP"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Creamos referencias a los servicios que vamos a usar
const auth = firebase.auth();
const db = firebase.firestore();

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


// ---- NUEVA LÓGICA CENTRAL DE REDIRECCIÓN ----

// Esta nueva función se encarga de decidir a dónde enviar al usuario después de iniciar sesión.
function handleLoginSuccess(user) {
    // Buscamos el perfil del usuario en nuestra base de datos 'usuarios' usando su email.
    db.collection('usuarios').where('email', '==', user.email).get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                // Si el usuario existe en Authentication pero no en nuestra base de datos 'usuarios',
                // asumimos que es el administrador principal.
                console.log('Usuario es Administrador (no tiene perfil en la base de datos).');
                window.location.href = 'dashboard.html';
            } else {
                // Si encontramos un perfil, leemos sus datos.
                const userData = querySnapshot.docs[0].data();
                if (userData.rol === 'empleado') {
                    // Si el campo 'rol' dice 'empleado', lo enviamos a su dashboard.
                    console.log('Usuario es Empleado, redirigiendo...');
                    window.location.href = 'empleado_dashboard.html';
                } else {
                    // Si el campo 'rol' no existe o es diferente, lo tratamos como admin.
                    console.log('Usuario es Administrador, redirigiendo...');
                    window.location.href = 'dashboard.html';
                }
            }
        })
        .catch(error => {
            console.error("Error al obtener el rol del usuario:", error);
            alert('Ocurrió un error al verificar tu rol. Contacta al administrador.');
            auth.signOut(); // Cerramos sesión si hay un error crítico
        });
}


// ---- LÓGICA DE INICIO DE SESIÓN (ACTUALIZADA) ----

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