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

const addUserForm = document.getElementById('add-user-form');
const userListContainer = document.getElementById('user-list');

// colaboradores.app.js

addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        return alert("Error de autenticación. Por favor, inicia sesión de nuevo.");
    }

    try {
        // --- ¡NUEVA LÓGICA DE VERIFICACIÓN! ---
        
        // 1. Obtenemos la información de la suscripción del admin
        const subRef = db.collection('suscripciones').doc(user.uid);
        const subDoc = await subRef.get();

        if (!subDoc.exists) {
            return alert("No se pudo verificar tu plan de suscripción.");
        }
        const subData = subDoc.data();
        const limiteColaboradores = subData.limiteColaboradores;

        // 2. Contamos los colaboradores actuales que tiene este admin
        const colaboradoresQuery = await db.collection('usuarios')
            .where('adminUid', '==', user.uid)
            .where('rol', '==', 'empleado')
            .get();
        
        const colaboradoresActuales = colaboradoresQuery.size;

        // 3. Comparamos el uso actual con el límite del plan
        if (colaboradoresActuales >= limiteColaboradores) {
            alert(`Has alcanzado el límite de ${limiteColaboradores} colaboradores para tu plan "${subData.planNombre}". Por favor, actualiza tu plan para añadir más usuarios.`);
            return; // Detenemos la ejecución si se alcanzó el límite
        }

        // --- SI PASA LA VERIFICACIÓN, CONTINUAMOS CON LA CREACIÓN ---

        const name = addUserForm['user-name'].value;
        const email = addUserForm['user-email'].value;
        const position = addUserForm['user-position'].value;
        const salary = parseFloat(addUserForm['user-salary'].value);

        const newEmployeeUid = prompt("Pega aquí el UID del nuevo colaborador creado en Firebase Authentication:");
        if (!newEmployeeUid) {
            alert("La creación fue cancelada. Debes proporcionar un UID.");
            return;
        }

        const newUserData = {
            nombre: name,
            email: email,
            cargo: position,
            sueldoBruto: salary,
            fechaDeIngreso: new Date(),
            rol: 'empleado',
            adminUid: user.uid
        };

        await db.collection('usuarios').doc(newEmployeeUid).set(newUserData);
        
        alert(`¡Colaborador agregado exitosamente! Colaboradores en uso: ${colaboradoresActuales + 1} de ${limiteColaboradores}.`);
        addUserForm.reset();

    } catch (error) {
        console.error('Error al agregar colaborador: ', error);
        alert("Ocurrió un error inesperado al intentar agregar al colaborador.");
    }
});
