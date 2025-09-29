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

function mostrarUsuarios(usuarios) {
    userListContainer.innerHTML = '';
    if (usuarios.length === 0) {
        userListContainer.innerHTML = '<p>No hay colaboradores registrados.</p>';
        return;
    }

    usuarios.forEach(usuario => {
        const userElement = document.createElement('a');
        userElement.href = `perfil_empleado.html?id=${usuario.id}`; 
        userElement.classList.add('user-item');
        
        const sueldoFormateado = (usuario.sueldoBruto || 0).toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        });

        userElement.innerHTML = `
            <div class="user-info">
                <div class="user-name">${usuario.nombre}</div>
                <div class="user-details">${usuario.cargo || 'Sin cargo'} - ${usuario.email}</div>
            </div>
            <div class="user-salary">${sueldoFormateado}</div>
        `;
        userListContainer.appendChild(userElement);
    });
}

// --- LÓGICA PARA AGREGAR UN NUEVO COLABORADOR ---

addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        return alert("Error de autenticación. Por favor, inicia sesión de nuevo.");
    }

    try {
        // 1. Verificamos el plan actual del administrador
        const subRef = db.collection('suscripciones').doc(user.uid);
        const subDoc = await subRef.get();

        if (!subDoc.exists) {
            return alert("No se pudo verificar tu plan de suscripción.");
        }
        const subData = subDoc.data();
        const limiteColaboradores = subData.limiteColaboradores;

        // 2. Contamos los colaboradores actuales
        const colaboradoresQuery = await db.collection('usuarios')
            .where('adminUid', '==', user.uid)
            .where('rol', '==', 'empleado')
            .get();
        
        const colaboradoresActuales = colaboradoresQuery.size;

        if (colaboradoresActuales >= limiteColaboradores) {
            alert(`Has alcanzado el límite de ${limiteColaboradores} colaboradores para tu plan "${subData.planNombre}". Por favor, actualiza tu plan para añadir más usuarios.`);
            return;
        }

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

auth.onAuthStateChanged((user) => {
    if (user) {
        // Esta es la consulta correcta para cargar y mostrar la lista al entrar a la página
        db.collection('usuarios')
            .where('adminUid', '==', user.uid)
            .where('rol', '==', 'empleado')
            .orderBy('nombre')
            .onSnapshot(snapshot => {
                const usuarios = [];
                snapshot.forEach(doc => usuarios.push({ id: doc.id, ...doc.data() }));
                mostrarUsuarios(usuarios);
            }, error => {
                console.error("Error al obtener usuarios:", error);
                // Si ves este error, probablemente necesites crear un índice en Firestore.
                // Revisa la consola (F12) para ver el enlace de creación.
                alert("Ocurrió un error al cargar la lista. Revisa la consola (F12) para más detalles.");
            });
    } else {
        window.location.href = 'index.html';
    }
});
