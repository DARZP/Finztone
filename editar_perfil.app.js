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

const editForm = document.getElementById('edit-profile-form');
const backButton = document.getElementById('back-to-profile-btn');
const deductionsChecklist = document.getElementById('deductions-checklist');

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
if (userId) { backButton.href = `perfil_empleado.html?id=${userId}`; }

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

async function cargarDatosParaEdicion() {
    const user = auth.currentUser;
    if (!userId || !user) return;
    
    const userDoc = await db.collection('usuarios').doc(userId).get();
    if (!userDoc.exists) return alert('Usuario no encontrado.');
    const userData = userDoc.data();

    const impuestosSnapshot = await db.collection('impuestos_definiciones')
        .where('adminUid', '==', user.uid)
        .get();
        
    const impuestosDefinidos = impuestosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    editForm['profile-name'].value = userData.nombre || '';
    editForm['profile-position'].value = userData.cargo || '';
    editForm['profile-salary'].value = userData.sueldoBruto || 0;
    editForm['profile-phone'].value = userData.telefono || '';
    editForm['profile-clabe'].value = userData.clabe || '';
    editForm['profile-rfc'].value = userData.rfc || '';
    
    mostrarDefinicionesDeImpuestos(impuestosDefinidos, userData.deducciones || []);
}

editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!userId) return;

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
        deducciones: deduccionesSeleccionadas
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

auth.onAuthStateChanged(user => {
    if (user) {
        cargarDatosParaEdicion();
    } else {
        window.location.href = 'index.html';
    }
});
