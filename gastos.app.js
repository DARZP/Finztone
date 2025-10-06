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
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');
const formCategorySelect = document.getElementById('expense-category');
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const paymentMethodSelect = document.getElementById('payment-method');
const expensePlaceInput = document.getElementById('expense-place');
const clientSelect = document.getElementById('client-select');
const projectSelect = document.getElementById('project-select');

let todasLasCuentas = [];
let empresasCargadas = [];

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        db.collection('cuentas').where('adminUid', '==', user.uid).orderBy('nombre').onSnapshot(snapshot => {
            todasLasCuentas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            paymentMethodSelect.dispatchEvent(new Event('change'));
        });

        cargarClientesYProyectos();
        poblarFiltrosYCategorias();
        cargarImpuestosParaSeleccion();
        cargarGastosAprobados();
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

paymentMethodSelect.addEventListener('change', () => {
    const metodo = paymentMethodSelect.value;
    if (metodo === 'Tarjeta de Crédito') {
        cargarCuentasEnSelector('credito');
    } else {
        cargarCuentasEnSelector('debito');
    }
});

clientSelect.addEventListener('change', async () => {
    const user = auth.currentUser;
    if (!user) return;
    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;
    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }
    const proyectosSnapshot = await db.collection('proyectos')
        .where('empresaId', '==', empresaId)
        .where('adminUid', '==', user.uid)
        .where('status', '==', 'activo')
        .get();
    if (proyectosSnapshot.empty) {
        projectSelect.innerHTML = '<option value="">Este cliente no tiene proyectos activos</option>';
    } else {
        projectSelect.innerHTML = '<option value="">Seleccionar Proyecto</option>';
        proyectosSnapshot.forEach(doc => {
            projectSelect.innerHTML += `<option value="${doc.id}">${doc.data().nombre}</option>`;
        });
        projectSelect.disabled = false;
    }
});

saveDraftBtn.addEventListener('click', () => guardarGastoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarGastoAdmin('aprobado'));
document.getElementById('expense-amount').addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);
categoryFilter.addEventListener('change', cargarGastosAprobados);
monthFilter.addEventListener('change', cargarGastosAprobados);

// --- FUNCIONES ---

async function cargarClientesYProyectos() {
    const user = auth.currentUser;
    if (!user) return;
    const empresasSnapshot = await db.collection('empresas')
        .where('adminUid', '==', user.uid)
        .orderBy('nombre').get();
    empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));
    clientSelect.innerHTML = '<option value="">Ninguno</option>';
    empresasCargadas.forEach(empresa => {
        clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`;
    });
}

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-ADM-${userInitials}-${timestamp}`;
}

function cargarCuentasEnSelector(filtroTipo) {
    const selectedValue = accountSelect.value;
    accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta de origen</option>';
    const cuentasFiltradas = todasLasCuentas.filter(cuenta => cuenta.tipo === filtroTipo);
    if (cuentasFiltradas.length === 0) {
        accountSelect.innerHTML += `<option value="" disabled>No hay cuentas de tipo '${filtroTipo}'</option>`;
    } else {
        cuentasFiltradas.forEach(cuenta => {
            const esCredito = cuenta.tipo === 'credito';
            const valor = esCredito ? cuenta.deudaActual : cuenta.saldoActual;
            const etiqueta = esCredito ? 'Deuda' : 'Saldo';
            const optionText = `${cuenta.nombre} (${etiqueta}: $${(valor || 0).toLocaleString('es-MX')})`;
            accountSelect.appendChild(new Option(optionText, cuenta.id));
        });
    }
    accountSelect.value = selectedValue;
}

async function cargarImpuestosParaSeleccion() {
    const user = auth.currentUser;
    if (!user) return;
    const snapshot = await db.collection('impuestos_definiciones')
        .where('adminUid', '==', user.uid)
        .get();
    taxesChecklistContainer.innerHTML = '';
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
    const montoBruto = parseFloat(document.getElementById('expense-amount').value) || 0;
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
    document.getElementById('summary-bruto').textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    document.getElementById('summary-impuestos').textContent = `$${totalImpuestos.toLocaleString('es-MX')}`;
    document.getElementById('summary-neto').textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

async function guardarGastoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return;
    const cuentaId = accountSelect.value;
    if (status === 'aprobado' && !cuentaId) return alert('Por favor, selecciona una cuenta de origen para un gasto aprobado.');
    const montoBruto = parseFloat(document.getElementById('expense-amount').value) || 0;
    if (montoBruto <= 0) return alert('Por favor, introduce un monto válido.');

    let montoNeto = montoBruto;
    const impuestosSeleccionados = [];
    if (addTaxesCheckbox.checked) {
        let totalImpuestos = 0;
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
            const impuesto = JSON.parse(checkbox.dataset.impuesto);
            impuestosSeleccionados.push(impuesto);
            totalImpuestos += impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
        });
        montoNeto = montoBruto + totalImpuestos;
    }
    
    const clienteIdSeleccionado = clientSelect.value;
    const proyectoIdSeleccionado = projectSelect.value;
    const clienteSeleccionado = empresasCargadas.find(e => e.id === clienteIdSeleccionado);

    const expenseData = {
        descripcion: addExpenseForm['expense-description'].value,
        establecimiento: expensePlaceInput.value.trim(),
        monto: montoBruto,
        totalConImpuestos: montoNeto,
        impuestos: impuestosSeleccionados,
        categoria: formCategorySelect.value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: clienteSeleccionado ? clienteSeleccionado.nombre : '',
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        adminUid: user.uid,
        fechaDeCreacion: new Date(),
        status: status,
        cuentaId: cuentaId,
        cuentaNombre: cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : '',
        proyectoId: proyectoIdSeleccionado,
        proyectoNombre: proyectoIdSeleccionado ? projectSelect.options[projectSelect.selectedIndex].text : ''
    };

    if (isInvoiceCheckbox.checked) {
        expenseData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    if (status === 'borrador') {
        return db.collection('gastos').add(expenseData).then(() => {
            alert('¡Borrador guardado!');
            addExpenseForm.reset();
        });
    }

    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    const newExpenseRef = db.collection('gastos').doc();
    try {
        await db.runTransaction(async (transaction) => {
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!cuentaDoc.exists) throw "La cuenta no existe.";
            const cuentaData = cuentaDoc.data();
            if (cuentaData.tipo === 'credito') {
                const nuevaDeuda = (cuentaData.deudaActual || 0) + montoNeto;
                transaction.update(cuentaRef, { deudaActual: nuevaDeuda });
            } else {
                const nuevoSaldo = (cuentaData.saldoActual || 0) - montoNeto;
                if (nuevoSaldo < 0) throw "Saldo insuficiente en la cuenta seleccionada.";
                transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
            }
            transaction.set(newExpenseRef, expenseData);
            impuestosSeleccionados.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                transaction.set(taxMovRef, {
                    origen: `Gasto Admin - ${expenseData.descripcion}`,
                    tipoImpuesto: imp.nombre,
                    monto: montoImpuesto,
                    fecha: new Date(),
                    status: 'pagado',
                    adminUid: user.uid
                });
            });
        });
        alert('¡Gasto registrado, saldo actualizado e impuestos generados!');
        addExpenseForm.reset();
        clientSelect.dispatchEvent(new Event('change'));
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Error: " + error);
    }
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
    const categorias = ["Comida", "Transporte", "Oficina", "Marketing", "Impuestos", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
}

function cargarGastosAprobados() {
    const user = auth.currentUser;
    if (!user) return;
    const selectedCategory = categoryFilter.value;
    const selectedMonth = monthFilter.value;
    let query = db.collection('gastos').where('adminUid', '==', user.uid).where('status', '==', 'aprobado');
    if (selectedCategory && selectedCategory !== 'todos') {
        query = query.where('categoria', '==', selectedCategory);
    }
    if (selectedMonth && selectedMonth !== 'todos') {
        const [year, month] = selectedMonth.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString().split('T')[0];
        query = query.where('fecha', '>=', startDate).where('fecha', '<=', endDate);
    }
    query = query.orderBy('fecha', 'desc');
    query.onSnapshot(snapshot => {
        const gastos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastosAprobados(gastos);
    }, error => console.error("Error al obtener gastos:", error));
}

function mostrarGastosAprobados(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>No se encontraron gastos con los filtros seleccionados.</p>';
        return;
    }
    gastos.forEach(gasto => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = gasto.id;
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = gasto.nombreCreador !== "Administrador" ? `<a href="perfil_empleado.html?id=${gasto.creadoPor}">${gasto.nombreCreador}</a>` : "Administrador";
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${gasto.descripcion}</span>
                    <span class="expense-details">Registrado por: ${creadorLink} | ${gasto.categoria} - ${fechaFormateada}</span>
                </div>
                <span class="expense-amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span>
            </div>
            <div class="item-details" style="display: none;">
                <p><strong>Folio:</strong> ${gasto.folio || 'N/A'}</p>
                <p><strong>Establecimiento:</strong> ${gasto.establecimiento || 'No especificado'}</p>
                <p><strong>Cliente Asociado:</strong> ${gasto.empresa || 'Ninguno'}</p>
                <p><strong>Proyecto:</strong> ${gasto.proyectoNombre || 'Ninguno'}</p>
                <p><strong>Cuenta:</strong> ${gasto.cuentaNombre || 'No especificada'}</p>
                <p><strong>Comentarios:</strong> ${gasto.comentarios || 'Ninguno'}</p>
                ${gasto.impuestos && gasto.impuestos.length > 0 ? '<h4>Impuestos Desglosados</h4>' : ''}
                ${gasto.impuestos?.map(imp => `<p>- ${imp.nombre}: $${((gasto.monto * imp.valor / 100) || imp.valor).toLocaleString()}</p>`).join('') || ''}
            </div>`;
        expenseListContainer.appendChild(itemContainer);
    });
}

expenseListContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') return;
    const item = e.target.closest('.expense-item');
    if (item) {
        const details = item.querySelector('.item-details');
        details.style.display = details.style.display === 'block' ? 'none' : 'block';
    }
});
