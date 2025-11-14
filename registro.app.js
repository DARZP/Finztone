import { auth, db } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const signupForm = document.getElementById('signup-form');
const userNameInput = document.getElementById('user-name');
const companyNameInput = document.getElementById('company-name');
const emailInput = document.getElementById('user-email');
const passwordInput = document.getElementById('user-password');
const confirmPasswordInput = document.getElementById('confirm-password');

// --- LISTENER DEL FORMULARIO DE REGISTRO ---
signupForm.addEventListener('submit', (e) => {
    
    // --- 1. LA CORRECCIÓN CLAVE (Evita el "rebooteo") ---
    // Prevenimos que el formulario recargue la página.
    e.preventDefault(); 

    const nombre = userNameInput.value.trim();
    const nombreEmpresa = companyNameInput.value.trim() || nombre; // Si la empresa está vacía, usa el nombre
    const email = emailInput.value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // 2. Validar las contraseñas
    if (password.length < 6) {
        alert("La contraseña debe tener al menos 6 caracteres.");
        return; // Detiene la ejecución
    }
    if (password !== confirmPassword) {
        alert("Las contraseñas no coinciden. Por favor, inténtalo de nuevo.");
        return; // Detiene la ejecución
    }

    // 3. Crear el usuario en Firebase Authentication
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            console.log("Usuario creado en Auth:", user.uid);

            // Preparamos las escrituras en la base de datos
            
            // 4. Crear el perfil del usuario en Firestore
            const userDocRef = db.collection('usuarios').doc(user.uid);
            const profilePromise = userDocRef.set({
                email: user.email,
                nombre: nombre,
                nombreEmpresa: nombreEmpresa,
                rol: 'admin', // El que se registra es siempre 'admin'
                status: 'activo',
                fechaDeCreacion: new Date()
            });

            // 5. Crear la suscripción gratuita inicial
            const subDocRef = db.collection('suscripciones').doc(user.uid);
            const subPromise = subDocRef.set({
                planNombre: 'Gratuito',
                limiteColaboradores: 2, // Límite del plan gratuito
                estado: 'activo',
                fechaDeInicio: new Date()
            });

            // 6. Esperar a que ambas escrituras se completen
            return Promise.all([profilePromise, subPromise]);
        })
        .then(() => {
            // 7. Redirigir al dashboard
            console.log("Perfil y suscripción creados. Redirigiendo al dashboard...");
            window.location.href = 'dashboard.html';
        })
        .catch((error) => {
            // 8. Manejar errores comunes de registro
            console.error("Error al registrar la cuenta:", error);
            if (error.code === 'auth/email-already-in-use') {
                alert('Este correo electrónico ya está registrado. Por favor, inicia sesión.');
            } else if (error.code === 'auth/weak-password') {
                alert('La contraseña es demasiado débil. Debe tener al menos 6 caracteres.');
            } else {
                alert('Ocurrió un error al crear la cuenta: ' + error.message);
            }
        });
});
