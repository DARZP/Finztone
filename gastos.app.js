// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
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

// ---- ELEMENTOS DEL DOM ----
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltroDeMeses();
        cargarCuentasEnSelector();
        cargarImpuestosParaSeleccion();
        cargarGastosAprobados();
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
    return `EXP-ADM-${userInitials}-${timestamp}`;
}

function cargarCuentasEnSelector() {
    db.collection('cuentas').orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            accountSelect.appendChild(new Option(`${cuenta.nombre} ($${cuenta.saldoActual.toLocaleString()})`, doc.id));
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
        item.innerHTML = `<input type="checkbox" id="tax-${impuesto.id}" data-impuesto='${JSON.stringify(impuesto)}'><label for="tax-${impuesto.id}">${impuesto.nombre} (${valorDisplay})</label>`;
        taxesChecklistContainer.appendChild(item);
    });
}

// FUNCIÓN CENTRAL PARA GUARDAR GASTOS (CON TRANSACCIÓN)
async function guardarGastoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return;
    
    const cuentaId = accountSelect.value;
    if (status === 'aprobado' && !cuentaId) {
        return alert('Por favor, selecciona una cuenta de origen para un gasto aprobado.');
    }

    const montoInput = parseFloat(addExpenseForm['expense-amount'].value);
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
        montoNeto = montoBruto + totalImpuestos;
    } else {
        montoNeto = montoInput;
        montoBruto = montoNeto; // Simplificación por ahora
    }
    
    const companyName = addExpenseForm['expense-company'].value.trim();
    
    const expenseData = {
        descripcion: addExpenseForm['expense-description'].value,
        monto: montoBruto,
        totalConImpuestos: montoNeto,
        impuestos: impuestosSeleccionados,
        tipoTotal: tipoDeTotal,
        categoria: addExpenseForm['expense-category'].value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: companyName,
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
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
        expenseData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    if (status === 'borrador') {
        db.collection('gastos').add(expenseData).then(() => {
            alert('¡Borrador guardado!');
            addExpenseForm.reset();
            isInvoiceCheckbox.checked = false;
            invoiceDetailsContainer.style.display = 'none';
        });
        return;
    }

    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    const newExpenseRef = db.collection('gastos').doc();
    try {
        await db.runTransaction(async (transaction) => {
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!cuentaDoc.exists) throw "La cuenta no existe.";
            
            const saldoActual = cuentaDoc.data().saldoActual;
            const nuevoSaldo = saldoActual - montoNeto;
            if (nuevoSaldo < 0) throw "Saldo insuficiente en la cuenta seleccionada.";
            
            transaction.set(newExpenseRef, expenseData);
            transaction.update(cuentaRef, { saldoActual: nuevoSaldo });

            impuestosSeleccionados.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                transaction.set(taxMovRef, {
                    origen: `Gasto Admin - ${expenseData.descripcion}`,
                    tipoImpuesto: imp.nombre,
                    monto: montoImpuesto,
                    fecha: new Date(),
                    status: 'pagado'
                });
            });
        });
        alert('¡Gasto registrado, saldo actualizado e impuestos generados!');
        addExpenseForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Error: " + error);
    }
}

saveDraftBtn.addEventListener('click', () => guardarGastoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarGastoAdmin('aprobado'));

// --- LÓGICA DE FILTROS Y VISTA ---

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

function cargarGastosAprobados() {
    const selectedCategory = categoryFilter.value;
    const selectedMonth = monthFilter.value;
    let query = db.collection('gastos').where('status', '==', 'aprobado');
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
        const gastos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastosAprobados(gastos);
    }, error => console.error("Error al obtener gastos filtrados: ", error));
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
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
        const creadorLink = gasto.nombreCreador !== "Administrador"
            ? `<a href="perfil_empleado.html?id=${gasto.creadoPor}">${gasto.nombreCreador}</a>`
            : "Administrador";
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
                <p><strong>Empresa:</strong> ${gasto.empresa || 'No especificada'}</p>
                <p><strong>Cuenta:</strong> ${gasto.cuentaNombre || 'No especificada'}</p>
                <p><strong>Comentarios:</strong> ${gasto.comentarios || 'Ninguno'}</p>
                ${gasto.impuestos && gasto.impuestos.length > 0 ? '<h4>Impuestos Desglosados</h4>' : ''}
                ${gasto.impuestos?.map(imp => `<p>- ${imp.nombre}: $${((gasto.monto * imp.valor / 100) || imp.valor).toLocaleString()}</p>`).join('') || ''}
            </div>
        `;
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

categoryFilter.addEventListener('change', cargarGastosAprobados);
monthFilter.addEventListener('change', cargarGastosAprobados);
