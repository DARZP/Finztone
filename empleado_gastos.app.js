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
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const taxesChecklistContainer = document.getElementById('taxes-checklist'); // Nuevo

// --- VARIABLES DE ESTADO ---
let modoEdicion = false;
let idGastoEditando = null;
let impuestosDefinidos = []; // Para guardar las definiciones de impuestos

// --- LÓGICA DE LA PÁGINA ---

// Muestra/oculta campos de factura
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

// Genera un folio único
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-${userInitials}-${timestamp}`;
}

// Carga las empresas existentes en el datalist
function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            const option = new Option(doc.data().nombre);
            companyDataList.appendChild(option);
        });
    });
}

// NUEVO: Carga y muestra los impuestos como checkboxes
async function cargarImpuestosParaSeleccion() {
    const snapshot = await db.collection('impuestos_definiciones').get();
    impuestosDefinidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    taxesChecklistContainer.innerHTML = '';
    impuestosDefinidos.forEach(impuesto => {
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        const item = document.createElement('div');
        item.classList.add('tax-item');
        item.innerHTML = `
            <input type="checkbox" id="tax-${impuesto.id}" data-impuesto='${JSON.stringify(impuesto)}'>
            <label for="tax-${impuesto.id}">${impuesto.nombre} (${valorDisplay})</label>
        `;
        taxesChecklistContainer.appendChild(item);
    });
}

// Carga los datos de un gasto en el formulario para editarlo
function cargarGastoEnFormulario(gasto) {
    addExpenseForm.reset(); // Limpiamos el form primero
    
    addExpenseForm['expense-description'].value = gasto.descripcion;
    // ... (resto de campos del formulario)
    
    // Mostramos y marcamos los impuestos que ya tiene guardados
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = gasto.impuestos?.some(tax => tax.impuestoId === checkbox.id.replace('tax-', '')) || false;
    });

    // ... (resto de la lógica para cambiar botones y hacer scroll)
}


function salirModoEdicion() { /* ... (Sin cambios) ... */ }
cancelEditBtn.addEventListener('click', salirModoEdicion);

// ACTUALIZADO: Función central para guardar o actualizar un gasto, ahora con impuestos
async function guardarGasto(status) {
    const user = auth.currentUser;
    if (!user) return;

    // ... (lógica para validar campos y crear empresa)

    // NUEVO: Recopilamos los impuestos seleccionados
    const impuestosSeleccionados = [];
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        impuestosSeleccionados.push(JSON.parse(checkbox.dataset.impuesto));
    });

    const expenseData = {
        descripcion: addExpenseForm['expense-description'].value,
        monto: parseFloat(addExpenseForm['expense-amount'].value),
        categoria: addExpenseForm['expense-category'].value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: addExpenseForm['expense-company'].value.trim(),
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        nombreCreador: (await db.collection('usuarios').doc(user.uid).get()).data().nombre,
        impuestos: impuestosSeleccionados // Guardamos el array de impuestos
    };

    if (isInvoiceCheckbox.checked) { /* ... (lógica de factura sin cambios) ... */ }

    if (modoEdicion) {
        db.collection('gastos').doc(idGastoEditando).update({ ...expenseData, status: status })
            .then(() => { /* ... */ }).catch(error => { /* ... */ });
    } else {
        db.collection('gastos').add({
            ...expenseData,
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        }).then(() => { /* ... */ }).catch(error => { /* ... */ });
    }
}


saveDraftBtn.addEventListener('click', () => guardarGasto('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarGasto('pendiente'));

// Dibuja la lista de gastos en el HTML
function mostrarGastos(gastos) { /* ... (Sin cambios por ahora) ... */ }
function poblarFiltroDeMeses() { /* ... (Sin cambios) ... */ }
function cargarGastos() { /* ... (Sin cambios) ... */ }

// Listeners para filtros
categoryFilter.addEventListener('change', cargarGastos);
monthFilter.addEventListener('change', cargarGastos);

// ACTUALIZADO: Carga inicial de datos
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltroDeMeses();
        cargarGastos();
        cargarImpuestosParaSeleccion(); // <-- Carga las definiciones de impuestos
    } else {
        window.location.href = 'index.html';
    }
});

