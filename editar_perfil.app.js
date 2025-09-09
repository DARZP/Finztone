const firebaseConfig = {
  apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84", // Tu API Key está bien
  authDomain: "finztone-app.firebaseapp.com",
  projectId: "finztone-app",
  storageBucket: "finztone-app.appspot.com", // Corregí un pequeño error aquí, era .appspot.com
  messagingSenderId: "95145879307",
  appId: "1:95145879307:web:e10017a75edf32f1fde40e",
  measurementId: "G-T8KMJXNSTP"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 1. Obtenemos el ID del empleado de la URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

// Elementos del DOM
const editForm = document.getElementById('edit-profile-form');
const backButton = document.getElementById('back-to-profile-btn');

// Preparamos el botón de "Cancelar" para que nos regrese al perfil
if (userId) {
    backButton.href = `perfil_empleado.html?id=${userId}`;
}

// 2. Función para cargar los datos en el formulario
function cargarDatosParaEdicion() {
    if (!userId) return;
    
    db.collection('usuarios').doc(userId).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            editForm['profile-name'].value = data.nombre || '';
            editForm['profile-position'].value = data.cargo || '';
            editForm['profile-salary'].value = data.sueldoBruto || 0;
            // Nuevos campos
            editForm['profile-phone'].value = data.telefono || '';
            editForm['profile-clabe'].value = data.clabe || '';
            editForm['profile-rfc'].value = data.rfc || '';
        } else {
            alert('Usuario no encontrado.');
        }
    });
}

// 3. Lógica para guardar los cambios
editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!userId) return;

    const updatedData = {
        nombre: editForm['profile-name'].value,
        cargo: editForm['profile-position'].value,
        sueldoBruto: parseFloat(editForm['profile-salary'].value),
        telefono: editForm['profile-phone'].value,
        clabe: editForm['profile-clabe'].value,
        rfc: editForm['profile-rfc'].value
    };

    db.collection('usuarios').doc(userId).update(updatedData)
        .then(() => {
            alert('¡Perfil actualizado exitosamente!');
            window.location.href = `perfil_empleado.html?id=${userId}`; // Regresamos al perfil
        })
        .catch(error => {
            console.error("Error al actualizar el perfil: ", error);
            alert('Ocurrió un error al guardar los cambios.');
        });
});

// Protección de la ruta y carga de datos inicial
auth.onAuthStateChanged(user => {
    if (user) {
        cargarDatosParaEdicion();
    } else {
        window.location.href = 'index.html';
    }
}); 