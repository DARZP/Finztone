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

// ---- LÓGICA DE LA PÁGINA DE COLABORADORES ----

const addUserForm = document.getElementById('add-user-form');
const userListContainer = document.getElementById('user-list');

// Lógica para agregar un nuevo colaborador a Firestore
addUserForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = addUserForm['user-name'].value;
    const email = addUserForm['user-email'].value;
    const position = addUserForm['user-position'].value;
    const salary = parseFloat(addUserForm['user-salary'].value);

    db.collection('usuarios').add({
        nombre: name,
        email: email,
        cargo: position,
        sueldoBruto: salary,
        fechaDeIngreso: new Date(),
        rol: 'empleado' // Asignamos el rol por defecto
    })
    .then(() => {
        alert('¡Colaborador agregado!\n\nRecuerda crear su cuenta en Firebase Authentication.');
        addUserForm.reset();
    })
    .catch((error) => console.error('Error al agregar colaborador: ', error));
});

// Función para mostrar la lista de colaboradores
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
        
        userElement.innerHTML = `
            <div class="user-info">
                <div class="user-name">${usuario.nombre}</div>
                <div class="user-details">${usuario.cargo} - ${usuario.email}</div>
            </div>
            <div class="user-salary">$${usuario.sueldoBruto.toLocaleString('es-MX')}</div>
        `;
        userListContainer.appendChild(userElement);
    });
}

// Carga inicial de datos y protección de la ruta
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