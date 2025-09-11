const firebaseConfig = {
  apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84", // Tu API Key está bien
  authDomain: "finztone-app.firebaseapp.com",
  projectId: "finztone-app",
  storageBucket: "finztone-app.appspot.com", // Corregí un pequeño error aquí, era .appspot.com
  messagingSenderId: "95145879307",
  appId: "1:95145879307:web:e10017a75edf32f1fde40e",
  measurementId: "G-T8KMJXNSTP"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---- LÓGICA DE LA PÁGINA DE INGRESOS (ADMIN) ----
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');

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

function cargarCuentasEnSelector() {
    db.collection('cuentas').get().then(snapshot => {
        // Limpiamos el selector excepto la primera opción
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const option = new Option(`${cuenta.nombre} ($${cuenta.saldoActual.toLocaleString('es-MX')})`, doc.id);
            accountSelect.appendChild(option);
        });
    });
}

// Genera un folio
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `INC-ADM-${userInitials}-${timestamp}`;
}

// Lógica para guardar un nuevo ingreso aprobado
addIncomeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const accountId = accountSelect.value;
    if (!accountId) {
        return alert('Por favor, selecciona una cuenta de destino.');
    }
    const accountName = accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0];
    const montoIngreso = parseFloat(addIncomeForm['income-amount'].value);

    const accountRef = db.collection('cuentas').doc(accountId);
    const newIncomeRef = db.collection('ingresos').doc();

    try {
        await db.runTransaction(async (transaction) => {
            const accountDoc = await transaction.get(accountRef);
            if (!accountDoc.exists) {
                throw "¡La cuenta seleccionada no existe!";
            }

            const saldoActual = accountDoc.data().saldoActual;
            const nuevoSaldo = saldoActual + montoIngreso;

    const companyName = addIncomeForm['income-company'].value.trim();
            if (companyName) {
                const companiesRef = db.collection('empresas');
                const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
                if (existingCompany.empty) {
                    // Nota: .add() no se puede usar en transacciones. Usaremos .set() en una nueva referencia.
                    const newCompanyRef = companiesRef.doc();
                    transaction.set(newCompanyRef, { nombre: companyName });
                }
            }

    const incomeData = {
        descripcion: addIncomeForm['income-description'].value,  
        monto: montoIngreso,
        categoria: addIncomeForm['income-category'].value,
        fecha: addIncomeForm['income-date'].value,
        empresa: companyName,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        fechaDeCreacion: new Date(),
        status: 'aprobado',         
        cuentaId: accountId,
        cuentaNombre: accountName
    };

    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    transaction.update(accountRef, { saldoActual: nuevoSaldo });
            transaction.set(newIncomeRef, incomeData);
        });

        alert('¡Ingreso registrado y saldo actualizado!');
        addIncomeForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
        cargarCuentasEnSelector(); // Recargamos para mostrar el nuevo saldo

    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Ocurrió un error al guardar el ingreso. La operación fue cancelada.");
    }
});


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
        const ingresos = [];
        snapshot.forEach(doc => ingresos.push({ id: doc.id, ...doc.data() }));
        mostrarIngresosAprobados(ingresos);
    }, error => console.error("Error al obtener ingresos filtrados: ", error));
}

// Función para mostrar la lista de TODOS los ingresos aprobados
function mostrarIngresosAprobados(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No se encontraron ingresos con los filtros seleccionados.</p>';
        return;
    }

    ingresos.forEach(ingreso => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item'); // Reutilizamos clase
        itemContainer.dataset.id = ingreso.id;

        const fecha = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = ingreso.nombreCreador !== "Administrador"
            ? `<a href="perfil_empleado.html?id=${ingreso.creadoPor}">${ingreso.nombreCreador}</a>`
            : "Administrador";

        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}</span>
                    <span class="expense-details">Registrado por: ${creadorLink} | ${ingreso.categoria} - ${fecha}</span>
                </div>
                <span class="expense-amount">$${ingreso.monto.toFixed(2)}</span>
            </div>
            <div class="item-details" style="display: none;">
                <p><strong>Folio:</strong> ${ingreso.folio || 'N/A'}</p>
                <p><strong>Empresa/Cliente:</strong> ${ingreso.empresa || 'No especificada'}</p>
                <p><strong>Método de Cobro:</strong> ${ingreso.metodoPago || 'No especificado'}</p>
                <p><strong>Comentarios:</strong> ${ingreso.comentarios || 'Ninguno'}</p>
                ${ingreso.datosFactura ? `<p><strong>RFC:</strong> ${ingreso.datosFactura.rfc || 'N/A'}</p><p><strong>Folio Fiscal:</strong> ${ingreso.datosFactura.folioFiscal || 'N/A'}</p>` : ''}
            </div>
        `;
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


auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltroDeMeses();
        cargarCuentasEnSelector();
        cargarIngresosAprobados();
    } else {
        window.location.href = 'index.html';
    }
});
