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
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const formCategorySelect = document.getElementById('income-category');
const formPaymentMethodSelect = document.getElementById('payment-method'); // Añadido
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const montoInput = document.getElementById('income-amount');
const summaryBruto = document.getElementById('summary-bruto');
const summaryImpuestos = document.getElementById('summary-impuestos');
const summaryNeto = document.getElementById('summary-neto');

// --- VARIABLES DE ESTADO ---
let modoEdicion = false;
let idIngresoEditando = null;

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltrosYCategorias();
        cargarIngresos();
        cargarImpuestosParaSeleccion();
        recalcularTotales();
    } else {
        window.location.href = 'index.html';
    }
});

// --- LISTENERS ---
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
saveDraftBtn.addEventListener('click', () => guardarIngreso('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarIngreso('pendiente'));
categoryFilter.addEventListener('change', cargarIngresos);
monthFilter.addEventListener('change', cargarIngresos);

// --- FUNCIONES ---

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `INC-${userInitials}-${timestamp}`;
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
    taxesChecklistContainer.innerHTML = '';
    if (snapshot.empty) {
        taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: #777;">No hay impuestos definidos.</p>';
        return;
    }
    snapshot.forEach(doc => {
        const impuesto = { id: doc.id, ...doc.data() };
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        const item = document.createElement('div');
        item.classList.add('tax-item');
        item.innerHTML = `<label><input type="checkbox" data-impuesto='${JSON.stringify(impuesto)}'> ${impuesto.nombre} (${valorDisplay})</label><span class="calculated-amount"></span>`;
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
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `-$${montoCalculado.toLocaleString('es-MX')}`;
    });
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:not(:checked)').forEach(checkbox => {
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = '';
    });
    const montoNeto = montoBruto - totalImpuestos;
    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `-$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

function cargarIngresoEnFormulario(ingreso) {
    addIncomeForm.reset();
    addIncomeForm['income-description'].value = ingreso.descripcion || '';
    addIncomeForm['income-amount'].value = ingreso.monto || 0;
    formCategorySelect.value = ingreso.categoria || '';
    addIncomeForm['income-date'].value = ingreso.fecha || '';
    addIncomeForm['income-company'].value = ingreso.empresa || '';
    formPaymentMethodSelect.value = ingreso.metodoPago || 'Efectivo';
    addIncomeForm['income-comments'].value = ingreso.comentarios || '';
    if (ingreso.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        document.getElementById('invoice-rfc').value = ingreso.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = ingreso.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }
    if (ingreso.impuestos && ingreso.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
            const impuestoData = JSON.parse(checkbox.dataset.impuesto);
            checkbox.checked = ingreso.impuestos.some(tax => tax.id === impuestoData.id);
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
    idIngresoEditando = ingreso.id;
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addIncomeForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    addTaxesCheckbox.checked = false;
    taxesDetailsContainer.style.display = 'none';
    recalcularTotales();
    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    modoEdicion = false;
    idIngresoEditando = null;
}

async function guardarIngreso(status) {
    const user = auth.currentUser;
    if (!user) return;
    const montoBruto = parseFloat(addIncomeForm['income-amount'].value) || 0;
    if (montoBruto <= 0) return alert('Por favor, introduce un monto válido.');
    
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
        montoNeto = montoBruto - totalImpuestos;
    }

    const userProfile = await db.collection('usuarios').doc(user.uid).get();
    const userName = userProfile.exists ? userProfile.data().nombre : user.email;

    const incomeData = {
        descripcion: addIncomeForm['income-description'].value,
        monto: montoBruto,
        totalConImpuestos: montoNeto,
        impuestos: impuestosSeleccionados,
        categoria: formCategorySelect.value,
        fecha: addIncomeForm['income-date'].value,
        empresa: addIncomeForm['income-company'].value.trim(),
        metodoPago: formPaymentMethodSelect.value,
        comentarios: addIncomeForm['income-comments'].value,
        nombreCreador: userName
    };
    if (isInvoiceCheckbox.checked) { /* ... */ }

    if (modoEdicion) {
        db.collection('ingresos').doc(idIngresoEditando).update({ ...incomeData, status: status })
            .then(() => {
                alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Ingreso enviado!');
                salirModoEdicion();
            }).catch(error => console.error("Error al actualizar:", error));
    } else {
        db.collection('ingresos').add({
            ...incomeData,
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        }).then(() => {
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado!');
            salirModoEdicion();
        }).catch(error => console.error("Error al guardar:", error));
    }
}

function mostrarIngresos(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No se encontraron ingresos.</p>';
        return;
    }
    ingresos.forEach(ingreso => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = ingreso.id;
        const fechaFormateada = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const botonEditarHTML = ingreso.status === 'borrador' ? `<button class="btn-edit" data-id="${ingreso.id}">Editar</button>` : '';
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}</span>
                    <span class="expense-details">${ingreso.categoria} - ${fechaFormateada}</span>
                </div>
                <div class="status-display status-${ingreso.status}">${ingreso.status}</div>
                <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
                ${botonEditarHTML}
            </div>
            <div class="item-details" style="display: none;"></div>`;
        incomeListContainer.appendChild(itemContainer);
    });
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const ingresoId = e.currentTarget.dataset.id;
            const ingresoAEditar = ingresos.find(i => i.id === ingresoId);
            if (ingresoAEditar) {
                cargarIngresoEnFormulario(ingresoAEditar);
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
    const categorias = ["Cobro de Factura", "Venta de Producto", "Servicios Profesionales", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    let paymentOptionsHTML = '';
    const metodosPago = ["Transferencia", "Efectivo", "Tarjeta de Crédito"];

    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    metodosPago.forEach(met => {
        paymentOptionsHTML += `<option value="${met}">${met}</option>`;
    });

    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
    formPaymentMethodSelect.innerHTML = paymentOptionsHTML;
}

function cargarIngresos() {
    const user = auth.currentUser;
    if (!user) return;
    let query = db.collection('ingresos').where('creadoPor', '==', user.uid);
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
        const ingresos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarIngresos(ingresos);
    }, error => console.error("Error al obtener ingresos:", error));
}
