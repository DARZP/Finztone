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

addUserForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        return alert("Error de autenticación. Por favor, inicia sesión de nuevo.");
    }

    const name = addUserForm['user-name'].value;
    const email = addUserForm['user-email'].value;
    const position = addUserForm['user-position'].value;
    const salary = parseFloat(addUserForm['user-salary'].value);

    // --- ¡NUEVA LÓGICA! ---
    // Usamos el UID del nuevo empleado como ID del documento
    // (Esto requiere que primero crees el usuario en Firebase Authentication)
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
        adminUid: user.uid // <-- AÑADIMOS EL ID DEL ADMIN ACTUAL
    };

    db.collection('usuarios').doc(newEmployeeUid).set(newUserData)
        .then(() => {
            alert('¡Colaborador agregado exitosamente!');
            addUserForm.reset();
        })
        .catch((error) => console.error('Error al agregar colaborador: ', error));
});

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

auth.onAuthStateChanged((user) => {
    if (user) {
        db.collection('usuarios').orderBy('nombre').onSnapshot(snapshot => {
            const usuarios = [];
            snapshot.forEach(doc => usuarios.push({ id: doc.id, ...doc.data() }));
            mostrarUsuarios(usuarios);
        }, error => console.error("Error al obtener usuarios: ", error));
    } else {
        window.location.href = 'index.html';
    }
});
