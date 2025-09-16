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
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');
const formCategorySelect = document.getElementById('income-category');

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltrosYCategorias();
        cargarCuentasEnSelector();
        cargarImpuestosParaSeleccion();
        cargarIngresosAprobados();
    } else {
        window.location.href = 'index.html';
    }
});

// --- FUNCIONES DEL FORMULARIO ---

isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            companyDataList.appendChild(new Option(doc.data().nombre));
        });
    });
}

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `INC-ADM-${userInitials}-${timestamp}`;
}

function cargarCuentasEnSelector() {
    db.collection('cuentas').orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            accountSelect.appendChild(new Option(`${cuenta.nombre} ($${cuenta.saldoActual.toLocaleString('es-MX')})`, doc.id));
        });
        accountSelect.value = selectedValue;
    });
}

async function cargarImpuestosParaSeleccion() {
    const snapshot = await db.collection('impuestos_definiciones').get();
    taxesChecklistContainer.innerHTML = '';
    snapshot.forEach(doc => {
        const impuesto = { id: doc.id, ...doc.data() };
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        const item = document.createElement('div');
        item.classList.add('tax-item');
        item.innerHTML = `<input type="checkbox" id="tax-inc-${impuesto.id}" data-impuesto='${JSON.stringify(impuesto)}'><label for="tax-inc-${impuesto.id}">${impuesto.nombre} (${valorDisplay})</label>`;
        taxesChecklistContainer.appendChild(item);
    });
}

async function guardarIngresoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return;
    const cuentaId = accountSelect.value;
    if (status === 'aprobado' && !cuentaId) {
        return alert('Por favor, selecciona una cuenta de destino.');
    }
    const montoInput = parseFloat(addIncomeForm['income-amount'].value);
    if (isNaN(montoInput) || montoInput <= 0) {
        return alert('Por favor, introduce un monto válido.');
    }
    const tipoDeTotal = document.querySelector('input[name="total-type"]:checked').value;
    const impuestosSeleccionados = [];
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        impuestosSeleccionados.push(JSON.parse(checkbox.dataset.impuesto));
    });

    let montoBruto, montoNeto, totalImpuestos = 0;
    if (tipoDeTotal === 'bruto') {
        montoBruto = montoInput;
        impuestosSeleccionados.forEach(imp => {
            totalImpuestos += imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
        });
        montoNeto = montoBruto - totalImpuestos;
    } else {
        montoNeto = montoInput;
        montoBruto = montoNeto; // Simplificación
    }
    
    const companyName = addIncomeForm['income-company'].value.trim();
    const newIncomeRef = db.collection('ingresos').doc();
    const incomeData = {
        descripcion: addIncomeForm['income-description'].value,
        monto: montoBruto,
        totalConImpuestos: montoNeto,
        impuestos: impuestosSeleccionados,
        tipoTotal: tipoDeTotal,
        categoria: formCategorySelect.value,
        fecha: addIncomeForm['income-date'].value,
        empresa: companyName,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        fechaDeCreacion: new Date(),
        status: status,
        cuentaId: cuentaId,
        cuentaNombre: cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : ''
    };

    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    if (status === 'borrador') {
        return db.collection('ingresos').add(incomeData).then(() => {
            alert('¡Borrador guardado!');
            addIncomeForm.reset();
        });
    }

    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    try {
        await db.runTransaction(async (transaction) => {
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!cuentaDoc.exists) throw "La cuenta no existe.";
            const saldoActual = cuentaDoc.data().saldoActual;
            const nuevoSaldo = saldoActual + montoNeto;
            transaction.set(newIncomeRef, incomeData);
            transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
            impuestosSeleccionados.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                transaction.set(taxMovRef, {
                    origen: `Ingreso Admin - ${incomeData.descripcion}`,
                    tipoImpuesto: imp.nombre,
                    monto: montoImpuesto,
                    fecha: new Date(),
                    status: 'pendiente de pago'
                });
            });
        });
        alert('¡Ingreso registrado, saldo actualizado e impuestos generados!');
        addIncomeForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Error: " + error);
    }
}

saveDraftBtn.addEventListener('click', () => guardarIngresoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarIngresoAdmin('aprobado'));

// --- LÓGICA DE FILTROS Y VISTA ---
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
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
}

function cargarIngresosAprobados() {
    const selectedCategory = categoryFilter.value;
    const selectedMonth = monthFilter.value;
    let query = db.collection('ingresos').where('status', '==', 'aprobado');
    if (selectedCategory !== 'todos') {
        query = query.where('categoria', '==', selectedCategory);
    }
    if (selectedMonth !== 'todos') {
        const [year, month] = selectedMonth.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString().split('T')[0];
        query = query.where('fecha', '>=', startDate).where('fecha', '<=', endDate);
    }
    query = query.orderBy('fecha', 'desc');
    query.onSnapshot(snapshot => {
        const ingresos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarIngresosAprobados(ingresos);
    }, error => console.error("Error al obtener ingresos:", error));
}

function mostrarIngresosAprobados(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No se encontraron ingresos con los filtros seleccionados.</p>';
        return;
    }
    ingresos.forEach(ingreso => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = ingreso.id;
        const fechaFormateada = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = ingreso.nombreCreador !== "Administrador" ? `<a href="perfil_empleado.html?id=${ingreso.creadoPor}">${ingreso.nombreCreador}</a>` : "Administrador";
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}</span>
                    <span class="expense-details">Registrado por: ${creadorLink} | ${ingreso.categoria} - ${fechaFormateada}</span>
                </div>
                <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
            </div>
            <div class="item-details" style="display: none;">
                <p><strong>Folio:</strong> ${ingreso.folio || 'N/A'}</p>
                <p><strong>Empresa/Cliente:</strong> ${ingreso.empresa || 'No especificada'}</p>
                <p><strong>Cuenta:</strong> ${ingreso.cuentaNombre || 'No especificada'}</p>
                <p><strong>Comentarios:</strong> ${ingreso.comentarios || 'Ninguno'}</p>
                ${ingreso.impuestos && ingreso.impuestos.length > 0 ? '<h4>Impuestos Desglosados</h4>' : ''}
                ${ingreso.impuestos?.map(imp => `<p>- ${imp.nombre}: $${((ingreso.monto * imp.valor / 100) || imp.valor).toLocaleString()}</p>`).join('') || ''}
            </div>`;
        incomeListContainer.appendChild(itemContainer);
    });
}

incomeListContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') return;
    const item = e.target.closest('.expense-item');
    if (item) {
        const details = item.querySelector('.item-details');
        details.style.display = details.style.display === 'block' ? 'none' : 'block';
    }
});

categoryFilter.addEventListener('change', cargarIngresosAprobados);
monthFilter.addEventListener('change', cargarIngresosAprobados);
