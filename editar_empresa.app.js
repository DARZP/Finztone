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

// --- ELEMENTOS DEL DOM ---
const editForm = document.getElementById('edit-company-form');
const backButton = document.getElementById('back-to-profile-btn');

// Obtenemos el ID de la empresa de la URL
const urlParams = new URLSearchParams(window.location.search);
const empresaId = urlParams.get('id');

// --- LÓGICA DE LA PÁGINA ---

// Protección de ruta y carga de datos
auth.onAuthStateChanged(user => {
    if (user && empresaId) {
        // Establecemos el enlace del botón "Cancelar" para volver al perfil correcto
        backButton.href = `perfil_empresa.html?id=${empresaId}`;
        cargarDatosDeEmpresa(empresaId);
    } else {
        window.location.href = 'index.html';
    }
});

// Función para cargar los datos actuales de la empresa en el formulario
async function cargarDatosDeEmpresa(id) {
    try {
        const doc = await db.collection('empresas').doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            // Llenamos el formulario con los datos existentes
            editForm['company-name'].value = data.nombre || '';
            editForm['company-rfc'].value = data.rfc || '';
            editForm['company-address'].value = data.direccion || '';
            editForm['contact-name'].value = data.contactoNombre || '';
            editForm['contact-email'].value = data.contactoEmail || '';
            editForm['contact-phone'].value = data.contactoTelefono || '';
            editForm['bank-name'].value = data.banco || '';
            editForm['bank-clabe'].value = data.clabe || '';
        } else {
            alert('No se encontró la empresa.');
        }
    } catch (error) {
        console.error("Error al cargar los datos de la empresa:", error);
    }
}

// Listener para guardar los cambios del formulario
editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!empresaId) return;

    // Recopilamos todos los datos actualizados del formulario
    const updatedData = {
        nombre: editForm['company-name'].value,
        rfc: editForm['company-rfc'].value,
        direccion: editForm['company-address'].value,
        contactoNombre: editForm['contact-name'].value,
        contactoEmail: editForm['contact-email'].value,
        contactoTelefono: editForm['contact-phone'].value,
        banco: editForm['bank-name'].value,
        clabe: editForm['bank-clabe'].value
    };

    // Actualizamos el documento en Firestore
    db.collection('empresas').doc(empresaId).update(updatedData)
        .then(() => {
            alert('¡Información de la empresa actualizada exitosamente!');
            // Redirigimos de vuelta al perfil de la empresa
            window.location.href = `perfil_empresa.html?id=${empresaId}`;
        })
        .catch(error => {
            console.error("Error al actualizar la empresa:", error);
            alert('Ocurrió un error al guardar los cambios.');
        });
});
