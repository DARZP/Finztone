import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

// --- ELEMENTOS DEL DOM ---
const addAccountForm = document.getElementById('add-account-form');
const accountsListContainer = document.getElementById('accounts-list');
const accountTypeSelect = document.getElementById('account-type');
const initialBalanceGroup = document.getElementById('initial-balance-group');
const cutoffDateGroup = document.getElementById('cutoff-date-group');
const backButton = document.getElementById('back-button');

let adminUidGlobal = null; // Variable global para el adminUid

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- CORRECCIÓN 1: Identificamos el adminUid correcto ---
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        adminUidGlobal = userData.adminUid || user.uid;

        // Configuramos la UI según el rol
        if (userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
        } else {
            backButton.href = 'dashboard.html';
        }
        
        cargarCuentas(adminUidGlobal);

    } else {
        window.location.href = 'index.html';
    }
});

accountTypeSelect.addEventListener('change', () => {
    const isCredit = accountTypeSelect.value === 'credito';
    initialBalanceGroup.style.display = isCredit ? 'none' : 'block';
    cutoffDateGroup.style.display = isCredit ? 'block' : 'none';
    document.getElementById('total-debt-group').style.display = isCredit ? 'block' : 'none';
    document.getElementById('current-period-debt-group').style.display = isCredit ? 'block' : 'none';
    document.getElementById('initial-balance').required = !isCredit;
    document.getElementById('cutoff-date').required = isCredit;
});

addAccountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!adminUidGlobal) return alert("Error de autenticación.");

    const accountName = addAccountForm['account-name'].value;
    const accountType = addAccountForm['account-type'].value;

    let accountData = {
        nombre: accountName,
        tipo: accountType,
        // --- CORRECCIÓN 2: Usamos el adminUidGlobal para crear la cuenta ---
        adminUid: adminUidGlobal,
        fechaDeCreacion: new Date()
    };

    if (accountType === 'debito') {
        accountData.saldoActual = parseFloat(addAccountForm['initial-balance'].value) || 0;
    } else { // Crédito
        const totalDebt = parseFloat(addAccountForm['total-debt'].value) || 0;
        const currentPeriodDebt = parseFloat(addAccountForm['current-period-debt'].value) || 0;
        accountData.diaCorte = parseInt(addAccountForm['cutoff-date'].value);
        accountData.deudaTotal = totalDebt + currentPeriodDebt; 
        accountData.deudaActual = currentPeriodDebt;
    }

    db.collection('cuentas').add(accountData)
    .then(() => {
        alert(`¡La cuenta "${accountName}" ha sido creada exitosamente!`);
        addAccountForm.reset();
        accountTypeSelect.dispatchEvent(new Event('change'));
    })
    .catch(error => console.error("Error al crear la cuenta: ", error));
});

function cargarCuentas(adminUid) {
    // --- CORRECCIÓN 3: La consulta usa el adminUid correcto ---
    db.collection('cuentas').where('adminUid', '==', adminUid).orderBy('fechaDeCreacion', 'desc')
        .onSnapshot(snapshot => {
            accountsListContainer.innerHTML = '';
            if (snapshot.empty) {
                accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const cuenta = { id: doc.id, ...doc.data() };
                const itemElement = document.createElement('a');
                itemElement.classList.add('account-item');
                itemElement.href = `perfil_cuenta.html?id=${cuenta.id}`;
                const esCredito = cuenta.tipo === 'credito';
                itemElement.innerHTML = `
                    <div class="account-info">
                        <div class="account-name">${cuenta.nombre}</div>
                        <div class="account-date">${esCredito ? `Crédito (Corte día ${cuenta.diaCorte})` : 'Débito'}</div>
                    </div>
                    <div class="header-actions">
                        <div class="account-balance">
                            <span>$${((esCredito ? cuenta.deudaActual : cuenta.saldoActual) || 0).toLocaleString('es-MX')}</span>
                            <div>${esCredito ? 'Deuda Actual' : 'Saldo Actual'}</div>
                        </div>
                        <button class="btn-secondary download-account-btn" data-account-id="${cuenta.id}" data-account-name="${cuenta.nombre}">Descargar</button>
                    </div>
                `;
                accountsListContainer.appendChild(itemElement);
            });
        });
}

accountsListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('download-account-btn')) {
        e.preventDefault(); 
        const cuentaId = e.target.dataset.accountId;
        const cuentaNombre = e.target.dataset.accountName;
        descargarRegistrosCuenta(cuentaId, cuentaNombre, adminUidGlobal);
    }
});

async function descargarRegistrosCuenta(cuentaId, cuentaNombre, adminUid) {
    if (!adminUid || !cuentaId) return;
    alert(`Preparando la descarga de todos los registros de la cuenta: ${cuentaNombre}...`);

    try {
        // --- CORRECCIÓN 4: Las consultas de descarga usan el adminUid correcto ---
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();
        const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([gastosPromise, ingresosPromise, nominaPromise]);
        const registros = [];
        gastosSnapshot.forEach(doc => { /* ... (tu lógica de mapeo) ... */ });
        ingresosSnapshot.forEach(doc => { /* ... (tu lógica de mapeo) ... */ });
        nominaSnapshot.forEach(doc => { /* ... (tu lógica de mapeo) ... */ });

        if (registros.length === 0) return alert("No se encontraron registros para esta cuenta.");
        registros.sort((a, b) => new Date(a.Fecha.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')) - new Date(b.Fecha.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')));
        exportToCSV(registros, `Registros-Cuenta-${cuentaNombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros de la cuenta:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}
