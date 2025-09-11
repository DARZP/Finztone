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

const editForm = document.getElementById('edit-profile-form');
const backButton = document.getElementById('back-to-profile-btn');
const deductionsChecklist = document.getElementById('deductions-checklist');

// --- LÓGICA DE LA PÁGINA ---
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
if (userId) { backButton.href = `perfil_empleado.html?id=${userId}`; }

// Función para mostrar los checkboxes de los impuestos
function mostrarDefinicionesDeImpuestos(impuestosDefinidos, deduccionesActuales = []) {
    deductionsChecklist.innerHTML = '';
    const deduccionesActualesIds = deduccionesActuales.map(d => d.impuestoId);

    impuestosDefinidos.forEach(impuesto => {
        const isChecked = deduccionesActualesIds.includes(impuesto.id);
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        
        const item = document.createElement('div');
        item.classList.add('deduction-item');
        item.innerHTML = `
            <input type="checkbox" id="${impuesto.id}" data-impuesto='${JSON.stringify(impuesto)}' ${isChecked ? 'checked' : ''}>
            <label for="${impuesto.id}">${impuesto.nombre} (${valorDisplay})</label>
        `;
        deductionsChecklist.appendChild(item);
    });
}

// Carga los datos del usuario Y las definiciones de impuestos al mismo tiempo
async function cargarDatosParaEdicion() {
    if (!userId) return;

    // 1. Obtenemos el perfil del usuario
    const userDoc = await db.collection('usuarios').doc(userId).get();
    if (!userDoc.exists) return alert('Usuario no encontrado.');
    const userData = userDoc.data();

    // 2. Obtenemos todas las definiciones de impuestos
    const impuestosSnapshot = await db.collection('impuestos_definiciones').get();
    const impuestosDefinidos = impuestosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Llenamos el formulario con los datos del usuario
    editForm['profile-name'].value = userData.nombre || '';
    // ... (llena el resto de los campos: cargo, sueldo, etc.)
    editForm['profile-position'].value = userData.cargo || '';
    editForm['profile-salary'].value = userData.sueldoBruto || 0;
    editForm['profile-phone'].value = userData.telefono || '';
    editForm['profile-clabe'].value = userData.clabe || '';
    editForm['profile-rfc'].value = userData.rfc || '';
    
    // 4. Mostramos los checkboxes, marcando los que el usuario ya tiene
    mostrarDefinicionesDeImpuestos(impuestosDefinidos, userData.deducciones);
}

// Lógica para guardar los cambios, incluyendo las deducciones seleccionadas
editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!userId) return;

    // Recopilamos las deducciones seleccionadas
    const deduccionesSeleccionadas = [];
    document.querySelectorAll('#deductions-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        const impuestoData = JSON.parse(checkbox.dataset.impuesto);
        deduccionesSeleccionadas.push({
            impuestoId: impuestoData.id,
            nombre: impuestoData.nombre,
            tipo: impuestoData.tipo,
            valor: impuestoData.valor
        });
    });


    const updatedData = {
        nombre: editForm['profile-name'].value,
        cargo: editForm['profile-position'].value,
        sueldoBruto: parseFloat(editForm['profile-salary'].value),
        telefono: editForm['profile-phone'].value,
        clabe: editForm['profile-clabe'].value,
        rfc: editForm['profile-rfc'].value,
        deducciones: deduccionesSeleccionadas // <-- Guardamos el array de deducciones
    };

    db.collection('usuarios').doc(userId).update(updatedData)
        .then(() => {
            alert('¡Perfil actualizado exitosamente!');
            window.location.href = `perfil_empleado.html?id=${userId}`;
        })
        .catch(error => {
            console.error("Error al actualizar el perfil: ", error);
            alert('Ocurrió un error al guardar los cambios.');
        });
});

// Protección de la ruta
auth.onAuthStateChanged(user => {
    if (user) {
        cargarDatosParaEdicion();
    } else {
        window.location.href = 'index.html';
    }
});
Pruébalo


}); 
