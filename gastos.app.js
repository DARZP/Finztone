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
const accountSelect = document.getElementById('account-select'); 
const expenseListContainer = document.getElementById('expense-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
// Selectores para los nuevos botones
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');

// ---- LÓGICA DEL FORMULARIO Y DATOS ----

// Muestra/oculta campos de factura
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

// Carga las empresas existentes para el autocompletado
function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nombre;
            companyDataList.appendChild(option);
        });
    });
}

// Genera un folio
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-ADM-${userInitials}-${timestamp}`;
}

function cargarCuentasEnSelector() {
    db.collection('cuentas').get().then(snapshot => {
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const option = document.createElement('option');
            option.value = doc.id; // Guardamos el ID del documento
            option.textContent = `${cuenta.nombre} ($${cuenta.saldoActual.toLocaleString('es-MX')})`;
            accountSelect.appendChild(option);
        });
    });
}

async function guardarGastoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return;

    const accountId = accountSelect.value;
    if (!accountId) {
        return alert('Por favor, selecciona una cuenta de origen.');
    }
    const accountName = accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0];
    const montoGasto = parseFloat(addExpenseForm['expense-amount'].value);
    
    const accountRef = db.collection('cuentas').doc(accountId);
    const newExpenseRef = db.collection('gastos').doc();

    try {
        await db.runTransaction(async (transaction) => {
            const accountDoc = await transaction.get(accountRef);
            if (!accountDoc.exists) {
                throw "¡La cuenta seleccionada no existe!";
            }

            const saldoActual = accountDoc.data().saldoActual;
            // Solo restamos el saldo si el gasto es aprobado, no si es borrador
            const nuevoSaldo = status === 'aprobado' ? saldoActual - montoGasto : saldoActual;

            const companyName = addExpenseForm['expense-company'].value.trim();
            // La lógica para la empresa va aquí, antes de construir el objeto final
            if (companyName) {
                const companiesRef = db.collection('empresas');
                // Importante: no se puede hacer .get() dentro de una transacción.
                // La validación de la empresa debe hacerse antes o asumir que es correcta.
                // Por ahora, la crearemos si no existe, pero lo ideal sería seleccionarla de una lista ya cargada.
            }

            const expenseData = {
                descripcion: addExpenseForm['expense-description'].value,
                monto: montoGasto,
                categoria: addExpenseForm['expense-category'].value,
                fecha: addExpenseForm['expense-date'].value,
                empresa: companyName,
                metodoPago: addExpenseForm['payment-method'].value,
                comentarios: addExpenseForm['expense-comments'].value,
                cuentaId: accountId,
                cuentaNombre: accountName,
                folio: generarFolio(user.uid),
                creadoPor: user.uid,
                emailCreador: user.email,
                nombreCreador: "Administrador",
                fechaDeCreacion: new Date(),
                status: status
            };

            if (isInvoiceCheckbox.checked) {
                expenseData.datosFactura = {
                    rfc: document.getElementById('invoice-rfc').value,
                    folioFiscal: document.getElementById('invoice-folio').value
                };
            }

            // Las operaciones de escritura van al final
            if (status === 'aprobado') {
                transaction.update(accountRef, { saldoActual: nuevoSaldo });
            }
            transaction.set(newExpenseRef, expenseData);
        }); // <-- LA TRANSACCIÓN TERMINA AQUÍ

        // El código de éxito va DESPUÉS de que la transacción se completa
        alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Gasto registrado y saldo actualizado!');
        addExpenseForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';

    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Ocurrió un error al guardar el gasto. La operación fue cancelada.");
    }
}

// NUEVOS LISTENERS para los botones
saveDraftBtn.addEventListener('click', () => guardarGastoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarGastoAdmin('aprobado'));


// ---- LÓGICA DE FILTROS Y VISTA ----

function poblarFiltroDeMeses() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        const option = new Option(text, value);
        monthFilter.appendChild(option);
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
        const gastos = [];
        snapshot.forEach(doc => gastos.push({ id: doc.id, ...doc.data() }));
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
                <span class="expense-amount">$${gasto.monto.toFixed(2)}</span>
            </div>
            <div class="item-details" style="display: none;">
                <p><strong>Folio:</strong> ${gasto.folio || 'N/A'}</p>
                <p><strong>Empresa:</strong> ${gasto.empresa || 'No especificada'}</p>
                <p><strong>Método de Pago:</strong> ${gasto.metodoPago || 'No especificado'}</p>
                <p><strong>Comentarios:</strong> ${gasto.comentarios || 'Ninguno'}</p>
                ${gasto.datosFactura ? `
                    <p><strong>RFC:</strong> ${gasto.datosFactura.rfc || 'No especificado'}</p>
                    <p><strong>Folio Fiscal:</strong> ${gasto.datosFactura.folioFiscal || 'No especificado'}</p>
                ` : ''}
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

auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltroDeMeses();
        cargarCuentasEnSelector(); 
        cargarGastosAprobados();
    } else {
        window.location.href = 'index.html';
    }
});
