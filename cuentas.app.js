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

// --- Elementos del DOM ---
const addAccountForm = document.getElementById('add-account-form');
const accountsListContainer = document.getElementById('accounts-list');
// Nuevos elementos para el formulario interactivo
const accountTypeSelect = document.getElementById('account-type');
const initialBalanceGroup = document.getElementById('initial-balance-group');
const cutoffDateGroup = document.getElementById('cutoff-date-group');

// --- LÓGICA DEL FORMULARIO INTERACTIVO ---
accountTypeSelect.addEventListener('change', () => {
    if (accountTypeSelect.value === 'credito') {
        initialBalanceGroup.style.display = 'none';
        document.getElementById('initial-balance').required = false;
        cutoffDateGroup.style.display = 'block';
        document.getElementById('cutoff-date').required = true;
    } else {
        initialBalanceGroup.style.display = 'block';
        document.getElementById('initial-balance').required = true;
        cutoffDateGroup.style.display = 'none';
        document.getElementById('cutoff-date').required = false;
    }
});

// --- LÓGICA DE DESCARGA (EXISTENTE, SIN CAMBIOS) ---
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
        cargarCuentas();
    } else {
        window.location.href = 'index.html';
    }
});

addAccountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const accountName = addAccountForm['account-name'].value;
    const accountType = addAccountForm['account-type'].value;

    let accountData = {
        nombre: accountName,
        tipo: accountType,
        adminUid: auth.currentUser.uid,
        fechaDeCreacion: new Date()
    };

    if (accountType === 'debito') {
        const initialBalance = parseFloat(addAccountForm['initial-balance'].value);
        accountData.saldoActual = initialBalance;
    } else { // Es de tipo 'credito'
        const cutoffDate = parseInt(addAccountForm['cutoff-date'].value);
        accountData.diaCorte = cutoffDate;
        accountData.deudaActual = 0; // Las tarjetas de crédito empiezan sin deuda
    }

    db.collection('cuentas').add(accountData)
    .then(() => {
        alert(`¡La cuenta "${accountName}" ha sido creada exitosamente!`);
        addAccountForm.reset();
        accountTypeSelect.dispatchEvent(new Event('change')); // Resetea la vista del form
    })
    .catch(error => console.error("Error al crear la cuenta: ", error));
});


async function cargarCuentas() {
    // FUSIONADO: Usamos tu función cargarCuentasConHistorial, renombrada para mayor claridad
    const user = auth.currentUser;
    if (!user) return;

    db.collection('cuentas').where('adminUid', '==', user.uid).orderBy('fechaDeCreacion', 'desc')
        .onSnapshot(async (cuentasSnapshot) => {
            
            const cuentas = cuentasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Obtenemos todos los movimientos una sola vez para eficiencia
            const ingresosSnapshot = await db.collection('ingresos').where('status', '==', 'aprobado').where('adminUid', '==', user.uid).get();
            const gastosSnapshot = await db.collection('gastos').where('status', '==', 'aprobado').where('adminUid', '==', user.uid).get();
            const nominaSnapshot = await db.collection('pagos_nomina').where('adminUid', '==', user.uid).get();
            
            const todosLosMovimientos = [];
            ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'ingreso', ...doc.data() }));
            gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'gasto', ...doc.data() }));
            nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'nomina', ...doc.data() }));

            accountsListContainer.innerHTML = '';
            if (cuentas.length === 0) {
                accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
                return;
            }

            cuentas.forEach(cuenta => {
                const itemElement = document.createElement('div'); // Contenedor principal que no es un enlace
                itemElement.classList.add('account-item-wrapper');
                
                const historial = todosLosMovimientos
                    .filter(mov => mov.cuentaId === cuenta.id)
                    .sort((a, b) => (b.fechaDeCreacion?.toDate() || b.fechaDePago?.toDate()) - (a.fechaDeCreacion?.toDate() || a.fechaDePago?.toDate()));

                let historialHTML = '<p style="padding: 15px;">No hay movimientos en esta cuenta.</p>';
                if (historial.length > 0) {
                    // Aquí puedes poner tu lógica para generar el historialHTML si lo necesitas
                    historialHTML = '';
                }

                const esCredito = cuenta.tipo === 'credito';
                const valorPrincipal = esCredito ? cuenta.deudaActual : cuenta.saldoActual;
                const etiquetaValor = esCredito ? 'Deuda Actual' : 'Saldo Actual';
                const tipoCuentaTexto = esCredito ? `Crédito (Corte día ${cuenta.diaCorte})` : 'Débito';

                itemElement.innerHTML = `
                    <a href="perfil_cuenta.html?id=${cuenta.id}" class="account-item">
                        <div class="account-info">
                            <div class="account-name">${cuenta.nombre}</div>
                            <div class="account-date" style="font-size: 0.9em; color: #aeb9c5;">
                                ${tipoCuentaTexto}
                            </div>
                        </div>
                        <div class="header-actions" style="display: flex; align-items: center; gap: 15px;">
                            <div class="account-balance" style="text-align: right;">
                                <span>$${(valorPrincipal || 0).toLocaleString('es-MX')}</span>
                                <div style="font-size: 0.8em; color: #aeb9c5; font-weight: 400;">${etiquetaValor}</div>
                            </div>
                            <button class="btn-secondary download-account-btn" data-account-id="${cuenta.id}" data-account-name="${cuenta.nombre}">Descargar</button>
                        </div>
                    </a>
                    <div class="account-history" style="display: none;">
                        ${historialHTML}
                    </div>
                `;
                accountsListContainer.appendChild(itemElement);
            });
        });
}

accountsListContainer.addEventListener('click', (e) => {
    // Lógica para descargar registros
    if (e.target.classList.contains('download-account-btn')) {
        e.preventDefault(); // Previene la navegación si se hace clic en el botón
        const cuentaId = e.target.dataset.accountId;
        const cuentaNombre = e.target.dataset.accountName;
        descargarRegistrosCuenta(cuentaId, cuentaNombre);
        return;
    }

    // Lógica para abrir/cerrar historial (si el clic no fue en el botón de descarga)
    const header = e.target.closest('.account-item');
    if (header) {
        e.preventDefault(); // Previene la navegación al hacer clic para desplegar
        const wrapper = header.closest('.account-item-wrapper');
        const history = wrapper.querySelector('.account-history');
        if (history) {
            history.style.display = history.style.display === 'block' ? 'none' : 'block';
        }
    }
});
