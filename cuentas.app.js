// cuentas.app.js (VERSIÓN ACTUALIZADA)

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

const addAccountForm = document.getElementById('add-account-form');
const accountsListContainer = document.getElementById('accounts-list');

// --- LÓGICA DE DESCARGA ---

async function descargarRegistrosCuenta(cuentaId, cuentaNombre) {
    if (!cuentaId) return;
    alert(`Preparando la descarga de todos los registros de la cuenta: ${cuentaNombre}...`);

    try {
        const gastosPromise = db.collection('gastos').where('cuentaId', '==', cuentaId).get();
        const ingresosPromise = db.collection('ingresos').where('cuentaId', '==', cuentaId).get();
        const nominaPromise = db.collection('pagos_nomina').where('cuentaId', '==', cuentaId).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaPromise
        ]);

        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Gasto', Concepto: data.descripcion, Monto: -(data.totalConImpuestos || data.monto), Creador: data.nombreCreador });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Ingreso', Concepto: data.descripcion, Monto: data.totalConImpuestos || data.monto, Creador: data.nombreCreador });
        });
        nominaSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fechaDePago.toDate().toISOString().split('T')[0], Tipo: 'Nómina', Concepto: `Pago a ${data.userName}`, Monto: -data.montoDescontado, Creador: 'Sistema' });
        });

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-Cuenta-${cuentaNombre.replace(/ /g, '_')}`);

    } catch (error) {
        console.error("Error al descargar registros de la cuenta:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---

auth.onAuthStateChanged(user => {
    if (user) {
        cargarCuentasConHistorial();
    } else {
        window.location.href = 'index.html';
    }
});

addAccountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const accountName = addAccountForm['account-name'].value;
    const initialBalance = parseFloat(addAccountForm['initial-balance'].value);

    db.collection('cuentas').add({
        nombre: accountName,
        saldoInicial: initialBalance,
        saldoActual: initialBalance,
        fechaDeCreacion: new Date()
    })
    .then(() => {
        alert(`¡Cuenta "${accountName}" creada exitosamente!`);
        addAccountForm.reset();
        cargarCuentasConHistorial(); // Recarga la lista para mostrar la nueva cuenta
    })
    .catch(error => console.error("Error al crear la cuenta: ", error));
});

async function cargarCuentasConHistorial() {
    const cuentasSnapshot = await db.collection('cuentas').orderBy('fechaDeCreacion', 'desc').get();
    const cuentas = cuentasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const ingresosSnapshot = await db.collection('ingresos').where('status', '==', 'aprobado').get();
    const gastosSnapshot = await db.collection('gastos').where('status', '==', 'aprobado').get();
    const nominaSnapshot = await db.collection('pagos_nomina').get();
    
    const todosLosMovimientos = [];
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'ingreso', ...doc.data() }));
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'gasto', ...doc.data() }));
    nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'nomina', ...doc.data() }));

    accountsListContainer.innerHTML = '';
    if (cuentas.length === 0) {
        accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
        return;
    }

    cuentas.forEach(cuenta => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('account-item');
        
        const historial = todosLosMovimientos
            .filter(mov => mov.cuentaId === cuenta.id)
            .sort((a, b) => (b.fechaDeCreacion?.toDate() || b.fechaDePago?.toDate()) - (a.fechaDeCreacion?.toDate() || a.fechaDePago?.toDate()));

        let historialHTML = '<p style="padding: 15px;">No hay movimientos en esta cuenta.</p>';
        if (historial.length > 0) {
             historialHTML = historial.map(mov => { /* ... (tu código de historial sin cambios) ... */ }).join('');
        }

        itemElement.innerHTML = `
            <div class="account-item-header">
                <div class="account-info">
                    <div class="account-name">${cuenta.nombre}</div>
                    <div class="account-date" style="font-size: 0.9em; color: #aeb9c5;">Saldo Inicial: $${cuenta.saldoInicial.toLocaleString('es-MX')}</div>
                </div>
                <div class="header-actions" style="display: flex; align-items: center; gap: 15px;">
                     <button class="btn-secondary download-account-btn" data-account-id="${cuenta.id}" data-account-name="${cuenta.nombre}">Descargar</button>
                    <div class="account-balance">$${cuenta.saldoActual.toLocaleString('es-MX')}</div>
                </div>
            </div>
            <div class="account-history" style="display: none;">
                ${historialHTML}
            </div>
        `;
        accountsListContainer.appendChild(itemElement);
    });
}

accountsListContainer.addEventListener('click', (e) => {
    // Lógica para descargar registros
    if (e.target.classList.contains('download-account-btn')) {
        const cuentaId = e.target.dataset.accountId;
        const cuentaNombre = e.target.dataset.accountName;
        descargarRegistrosCuenta(cuentaId, cuentaNombre);
        return; // Detiene la ejecución para no abrir/cerrar el historial
    }

    // Lógica para abrir/cerrar historial
    const header = e.target.closest('.account-item-header');
    if (header) {
        const history = header.nextElementSibling;
        if (history) {
            history.style.display = history.style.display === 'block' ? 'none' : 'block';
        }
    }
});
