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
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const formCategorySelect = document.getElementById('expense-category');
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const montoInput = document.getElementById('expense-amount');
const summaryBruto = document.getElementById('summary-bruto');
const summaryImpuestos = document.getElementById('summary-impuestos');
const summaryNeto = document.getElementById('summary-neto');

// --- VARIABLES DE ESTADO ---
let modoEdicion = false;
let idGastoEditando = null;
let impuestosDefinidos = [];

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltrosYCategorias();
        cargarGastos();
        cargarImpuestosParaSeleccion();
        recalcularTotales();
    } else {
        window.location.href = 'index.html';
    }
});

addTaxesCheckbox.addEventListener('change', () => {
    taxesDetailsContainer.style.display = addTaxesCheckbox.checked ? 'block' : 'none';
    recalcularTotales();
});
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});
montoInput.addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);
cancelEditBtn.addEventListener('click', salirModoEdicion);
saveDraftBtn.addEventListener('click', () => guardarGasto('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarGasto('pendiente'));
categoryFilter.addEventListener('change', cargarGastos);
monthFilter.addEventListener('change', cargarGastos);

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
            companyDataList.appendChild(new Option(doc.data().nombre));
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
            <label>
                <input type="checkbox" data-impuesto='${JSON.stringify(impuesto)}'>
                ${impuesto.nombre} (${valorDisplay})
            </label>
            <span class="calculated-amount"></span>
        `;
        taxesChecklistContainer.appendChild(item);
    });
}

function recalcularTotales() {
    const montoBruto = parseFloat(montoInput.value) || 0;
    let totalImpuestos = 0;
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        const impuesto = JSON.parse(checkbox.dataset.impuesto);
        const montoCalculado = impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
        totalImpuestos += montoCalculado;
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `$${montoCalculado.toLocaleString('es-MX')}`;
    });
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:not(:checked)').forEach(checkbox => {
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = '';
    });
    const montoNeto = montoBruto + totalImpuestos;
    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

function cargarGastoEnFormulario(gasto) {
    addExpenseForm.reset();
    addExpenseForm['expense-description'].value = gasto.descripcion || '';
    addExpenseForm['expense-amount'].value = gasto.monto || 0;
    formCategorySelect.value = gasto.categoria || '';
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
    if (gasto.impuestos && gasto.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
            const impuestoData = JSON.parse(checkbox.dataset.impuesto);
            checkbox.checked = gasto.impuestos.some(tax => tax.id === impuestoData.id);
        });
    } else {
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
    }
    recalcularTotales();
    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'block';
    modoEdicion = true;
    idGastoEditando = gasto.id;
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addExpenseForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    addTaxesCheckbox.checked = false;
    taxesDetailsContainer.style.display = 'none';
    recalcularTotales();
    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    modoEdicion = false;
    idGastoEditando = null;
}

async function guardarGasto(status) {
    const user = auth.currentUser;
    if (!user) return;
    const montoBruto = parseFloat(addExpenseForm['expense-amount'].value) || 0;
    if (montoBruto <= 0) {
        return alert('Por favor, introduce un monto válido.');
    }
    let montoNeto = montoBruto;
    const impuestosSeleccionados = [];
    if (addTaxesCheckbox.checked) {
        let totalImpuestos = 0;
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
            impuestosSeleccionados.push(JSON.parse(checkbox.dataset.impuesto));
        });
        impuestosSeleccionados.forEach(imp => {
            totalImpuestos += imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
        });
        montoNeto = montoBruto + totalImpuestos;
    }
    const companyName = addExpenseForm['expense-company'].value.trim();
    const userProfile = await db.collection('usuarios').doc(user.uid).get();
    const userName = userProfile.exists ? userProfile.data().nombre : user.email;
    const expenseData = {
        descripcion: addExpenseForm['expense-description'].value,
        monto: montoBruto,
        totalConImpuestos: montoNeto,
        impuestos: impuestosSeleccionados,
        categoria: formCategorySelect.value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: companyName,
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        nombreCreador: userName
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
            const gastoAEditar = gastos.find(g => g.id === gastoId);
            if (gastoAEditar) {
                cargarGastoEnFormulario(gastoAEditar);
            }
        });
    });
}

function poblarFiltrosYCategorias() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
    const categorias = ["Comida", "Transporte", "Oficina", "Marketing", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
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
