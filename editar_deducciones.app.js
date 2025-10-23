import { auth, db } from './firebase-init.js';

const editForm = document.getElementById('edit-deductions-form');
const backButton = document.getElementById('back-to-profile-btn');
const deductionsChecklist = document.getElementById('deductions-checklist');

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

// El botón de cancelar siempre vuelve al perfil del empleado
if (userId) { 
    backButton.href = `perfil_empleado.html?id=${userId}`; 
}

auth.onAuthStateChanged(user => {
    if (user) {
        cargarDatosParaEdicion();
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosParaEdicion() {
    const admin = auth.currentUser;
    if (!userId || !admin) return;
    
    // Obtenemos el perfil del admin/coadmin para saber cuál es el adminUid principal
    const adminProfile = await db.collection('usuarios').doc(admin.uid).get();
    const adminUid = adminProfile.data().adminUid || admin.uid;

    // Obtenemos el perfil del empleado que estamos editando
    const userDoc = await db.collection('usuarios').doc(userId).get();
    if (!userDoc.exists) return alert('Usuario no encontrado.');
    const userData = userDoc.data();

    // Obtenemos las definiciones de impuestos del admin principal
    const impuestosSnapshot = await db.collection('impuestos_definiciones')
        .where('adminUid', '==', adminUid)
        .get();
        
    const impuestosDefinidos = impuestosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    mostrarDefinicionesDeImpuestos(impuestosDefinidos, userData.deducciones || []);
}

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

    // Solo actualizamos el campo de las deducciones
    db.collection('usuarios').doc(userId).update({ deducciones: deduccionesSeleccionadas })
        .then(() => {
            alert('¡Deducciones actualizadas exitosamente!');
            window.location.href = `perfil_empleado.html?id=${userId}`;
        })
        .catch(error => {
            console.error("Error al actualizar deducciones:", error);
            alert('Ocurrió un error al guardar los cambios.');
        });
});
