// La línea 'import' ahora es lo primero que se ejecuta.
import { auth, db } from './firebase-init.js';

// --- VERIFICADOR DE SESIÓN ACTIVA ---
auth.onAuthStateChanged((user) => {
  if (user) {
    // Si se detecta un usuario al cargar, lo redirigimos.
    console.log("Usuario ya logueado detectado:", user.email);
    handleLoginSuccess(user);
  } else {
    // Si no hay usuario, no hacemos nada.
    console.log("No hay sesión activa.");
  }
});

// --- FUNCIÓN CENTRAL DE REDIRECCIÓN ---
function handleLoginSuccess(user) {
    const userDocRef = db.collection('usuarios').doc(user.uid);

    userDocRef.get()
        .then((doc) => {
            if (!doc.exists) {
                // Si el usuario no tiene perfil, se le crea uno de admin con suscripción gratuita.
                console.log('Administrador sin perfil detectado. Creando perfil...');
                
                const newAdminData = {
                    email: user.email,
                    nombre: "Administrador",
                    rol: 'admin',
                    status: 'activo',
                    fechaDeCreacion: new Date()
                };

                const profilePromise = userDocRef.set(newAdminData);
                const subPromise = db.collection('suscripciones').doc(user.uid).set({
                    planNombre: 'Gratuito',
                    limiteColaboradores: 2,
                    estado: 'activo',
                    fechaDeInicio: new Date()
                });

                return Promise.all([profilePromise, subPromise]).then(() => {
                    window.location.href = 'dashboard.html';
                });

            } else {
                // Si el perfil existe, redirigimos según el rol.
                const userData = doc.data();
                if (userData.rol === 'empleado') {
                    window.location.href = 'empleado_dashboard.html';
                } else if (userData.rol === 'coadmin') {
                    window.location.href = 'coadmin_dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            }
        })
        .catch(error => {
            console.error("Error al obtener el rol del usuario:", error);
            alert('Ocurrió un error al verificar tu rol.');
            auth.signOut();
        });
}

// --- LISTENER DEL FORMULARIO DE LOGIN ÚNICO ---
const loginForm = document.getElementById('admin-login-form');
loginForm.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const email = loginForm['admin-email'].value;
    const password = loginForm['admin-password'].value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            handleLoginSuccess(userCredential.user);
        })
        .catch((error) => {
            alert(traducirErrorDeFirebase(error.code));
        });
});


// --- FUNCIÓN AUXILIAR PARA TRADUCIR ERRORES ---
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

// --- RECUPERACIÓN DE CONTRASEÑA ---
const forgotPasswordLink = document.getElementById('forgot-password-link');

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (evento) => {
        evento.preventDefault(); // Evitamos que el enlace recargue la página
        
        // Obtenemos el correo directamente del formulario de login
        const emailInput = loginForm['admin-email']; 
        const email = emailInput ? emailInput.value.trim() : '';

        // Validamos que el campo no esté vacío
        if (!email) {
            alert("Por favor, ingresa tu correo electrónico en el campo superior y vuelve a hacer clic en 'Olvidé mi contraseña'.");
            emailInput.focus(); // Ponemos el cursor en el campo de correo
            return;
        }

        // Llamamos a la función de Firebase para enviar el correo
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert(`Te hemos enviado un enlace para restablecer tu contraseña a: ${email}. \n\nPor favor, revisa tu bandeja de entrada (y tu carpeta de spam).`);
            })
            .catch((error) => {
                console.error("Error al enviar correo de recuperación:", error);
                // Reutilizamos tu función de traducción de errores
                alert(traducirErrorDeFirebase(error.code)); 
            });
    });
}
