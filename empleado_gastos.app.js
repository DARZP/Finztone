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
const taxesChecklistContainer = document.getElementById('taxes-checklist');

let modoEdicion = false;
let idGastoEditando = null;
let impuestosDefinidos = [];

isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-${userInitials}-${timestamp}`;
}

function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            const option = new Option(doc.data().nombre);
            companyDataList.appendChild(option);
        });
    });
}

async function cargarImpuestosParaSeleccion() {
    const snapshot = await db.collection('impuestos_definiciones').get();
    impuestosDefinidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    taxesChecklistContainer.innerHTML = '';
    if (impuestosDefinidos.length === 0) {
        taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: #777;">No hay impuestos definidos.</p>';
        return;
    }
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

function cargarGastoEnFormulario(gasto) {
    addExpenseForm.reset();
    addExpenseForm['expense-description'].value = gasto.descripcion || '';
    addExpenseForm['expense-amount'].value = gasto.monto || 0;
    addExpenseForm['expense-category'].value = gasto.categoria || '';
    addExpenseForm['expense-date'].value = gasto.fecha || '';
    addExpenseForm['expense-company'].value = gasto.empresa || '';
    addExpenseForm['payment-method'].value = gasto.metodoPago || 'Efectivo';
    addExpenseForm['expense-comments'].value = gasto.comentarios || '';
    if (gasto.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        document.getElementById('invoice-rfc').value = gasto.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = gasto.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
        const impuestoId = checkbox.id.replace('tax-', '');
        checkbox.checked = gasto.impuestos?.some(tax => tax.id === impuestoId) || false;
    });
    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'block';
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addExpenseForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    modoEdicion = false;
    idGastoEditando = null;
}

cancelEditBtn.addEventListener('click', salirModoEdicion);

async function guardarGasto(status) {
    const user = auth.currentUser;
    if (!user) return;
    const description = addExpenseForm['expense-description'].value;
    const amount = addExpenseForm['expense-amount'].value;
    const date = addExpenseForm['expense-date'].value;
    if (!description || !amount || !date) {
        return alert('Por favor, completa al menos el concepto, monto y fecha.');
    }
    const companyName = addExpenseForm['expense-company'].value.trim();
    if (companyName) {
        const companiesRef = db.collection('empresas');
        const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
        if (existingCompany.empty) {
            await companiesRef.add({ nombre: companyName });
            cargarEmpresas();
        }
    }
    const userProfile = await db.collection('usuarios').doc(user.uid).get();
    const userName = userProfile.exists ? userProfile.data().nombre : user.email;
    const impuestosSeleccionados = [];
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        impuestosSeleccionados.push(JSON.parse(checkbox.dataset.impuesto));
    });
    const expenseData = {
        descripcion: description,
        monto: parseFloat(amount),
        categoria: addExpenseForm['expense-category'].value,
        fecha: date,
        empresa: companyName,
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        nombreCreador: userName,
        impuestos: impuestosSeleccionados
    };
    if (isInvoiceCheckbox.checked) {
        expenseData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }
    if (modoEdicion) {
        db.collection('gastos').doc(idGastoEditando).update({ ...expenseData, status: status })
            .then(() => {
                alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Gasto enviado!');
                salirModoEdicion();
            }).catch(error => console.error("Error al actualizar:", error));
    } else {
        db.collection('gastos').add({
            ...expenseData,
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        }).then(() => {
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado!');
            salirModoEdicion();
        }).catch(error => console.error("Error al guardar:", error));
    }
}

saveDraftBtn.addEventListener('click', () => guardarGasto('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarGasto('pendiente'));

function mostrarGastos(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>No se encontraron gastos.</p>';
        return;
    }
    gastos.forEach(gasto => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = gasto.id;
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const botonEditarHTML = gasto.status === 'borrador' ? `<button class="btn-edit" data-id="${gasto.id}">Editar</button>` : '';
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${gasto.descripcion}</span>
                    <span class="expense-details">${gasto.categoria} - ${fechaFormateada}</span>
                </div>
                <div class="status-display status-${gasto.status}">${gasto.status}</div>
                <span class="expense-amount">$${gasto.monto.toLocaleString('es-MX')}</span>
                ${botonEditarHTML}
            </div>
            <div class="item-details" style="display: none;"></div>
        `;
        expenseListContainer.appendChild(itemContainer);
    });
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const gastoId = e.currentTarget.dataset.id;
            modoEdicion = true;
            idGastoEditando = gastoId;
            const gastoAEditar = gastos.find(g => g.id === gastoId);
            if (gastoAEditar) {
                cargarGastoEnFormulario(gastoAEditar);
            }
        });
    });
}

function poblarFiltroDeMeses() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
}

function cargarGastos() {
    const user = auth.currentUser;
    if (!user) return;
    let query = db.collection('gastos').where('creadoPor', '==', user.uid);
    if (categoryFilter.value && categoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', categoryFilter.value);
    }
    if (monthFilter.value && monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString().split('T')[0];
        query = query.where('fecha', '>=', startDate).where('fecha', '<=', endDate);
    }
    query.orderBy('fecha', 'desc').onSnapshot(snapshot => {
        const gastos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastos(gastos);
    }, error => console.error("Error al obtener gastos:", error));
}

categoryFilter.addEventListener('change', cargarGastos);
monthFilter.addEventListener('change', cargarGastos);

auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltroDeMeses();
        cargarGastos();
        cargarImpuestosParaSeleccion();
    } else {
        window.location.href = 'index.html';
    }
});

