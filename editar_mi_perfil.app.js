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

const editForm = document.getElementById('edit-my-profile-form');

// Leemos el ID del usuario del URL para saber a quién estamos editando
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

// Función para cargar los datos del usuario en el formulario
async function loadUserData() {
    if (!userId) {
        alert("ID de usuario no encontrado.");
        window.location.href = 'mi_perfil.html';
        return;
    }
    const userDoc = await db.collection('usuarios').doc(userId).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        editForm['profile-name'].value = userData.nombre || '';
        editForm['profile-phone'].value = userData.telefono || '';
        editForm['profile-clabe'].value = userData.clabe || '';
        editForm['profile-rfc'].value = userData.rfc || '';
    } else {
        alert("Perfil de usuario no encontrado.");
    }
}

// Listener para guardar los cambios
editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const updatedData = {
        nombre: editForm['profile-name'].value,
        telefono: editForm['profile-phone'].value,
        clabe: editForm['profile-clabe'].value,
        rfc: editForm['profile-rfc'].value,
    };

    db.collection('usuarios').doc(userId).update(updatedData)
        .then(() => {
            alert("¡Perfil actualizado exitosamente!");
            window.location.href = 'mi_perfil.html';
        })
        .catch(error => {
            console.error("Error al actualizar:", error);
            alert("Ocurrió un error al guardar los cambios.");
        });
});

// Verificamos la autenticación y cargamos los datos
auth.onAuthStateChanged((user) => {
    if (user) {
        loadUserData();
    } else {
        window.location.href = 'index.html';
    }
});
