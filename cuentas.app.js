import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

const addAccountForm = document.getElementById('add-account-form');
const accountsListContainer = document.getElementById('accounts-list');
const accountTypeSelect = document.getElementById('account-type');
const initialBalanceGroup = document.getElementById('initial-balance-group');
const cutoffDateGroup = document.getElementById('cutoff-date-group');

accountTypeSelect.addEventListener('change', () => {
    const isCredit = accountTypeSelect.value === 'credito';

    // Grupos de campos
    initialBalanceGroup.style.display = isCredit ? 'none' : 'block';
    cutoffDateGroup.style.display = isCredit ? 'block' : 'none';
    document.getElementById('total-debt-group').style.display = isCredit ? 'block' : 'none';
    document.getElementById('current-period-debt-group').style.display = isCredit ? 'block' : 'none';

    // Campos requeridos
    document.getElementById('initial-balance').required = !isCredit;
    document.getElementById('cutoff-date').required = isCredit;
});

async function descargarRegistrosCuenta(cuentaId, cuentaNombre) {
    const user = auth.currentUser;
    if (!user || !cuentaId) return;

    alert(`Preparando la descarga de todos los registros de la cuenta: ${cuentaNombre}...`);

    try {
        // --- CORRECCIÓN: Añadimos .where('adminUid', '==', user.uid) a cada consulta ---
        const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();
        const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();

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

        if (registros.length === 0) {
            return alert("No se encontraron registros para esta cuenta.");
        }

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-Cuenta-${cuentaNombre.replace(/ /g, '_')}`);

    } catch (error) {
        console.error("Error al descargar registros de la cuenta:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

auth.onAuthStateChanged(async (user) => { // <-- Se añade 'async'
    if (user) {
        // --- INICIA LA NUEVA LÓGICA PARA EL BOTÓN DE VOLVER ---
        const backButton = document.getElementById('back-button');
        try {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().rol === 'coadmin') {
                backButton.href = 'coadmin_dashboard.html';
            } else {
                backButton.href = 'dashboard.html';
            }
        } catch (error) {
            console.error("Error al obtener perfil para configurar el botón de volver:", error);
            backButton.href = 'dashboard.html'; // Ruta por defecto en caso de error
        }
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
        accountData.saldoActual = parseFloat(addAccountForm['initial-balance'].value) || 0;
    } else { // Crédito
        const totalDebt = parseFloat(addAccountForm['total-debt'].value) || 0;
        const currentPeriodDebt = parseFloat(addAccountForm['current-period-debt'].value) || 0;

        accountData.diaCorte = parseInt(addAccountForm['cutoff-date'].value);
        // --- LA CORRECCIÓN CLAVE ---
        // La deuda total ES la suma de la deuda pre-existente MÁS la del período actual que se está registrando.
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

function cargarCuentas() {
    const user = auth.currentUser;
    if (!user) return;

    db.collection('cuentas').where('adminUid', '==', user.uid).orderBy('fechaDeCreacion', 'desc')
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
                itemElement.href = `perfil_cuenta.html?id=${cuenta.id}`; // El enlace principal

                const esCredito = cuenta.tipo === 'credito';
                const valorPrincipal = esCredito ? cuenta.deudaActual : cuenta.saldoActual;
                const etiquetaValor = esCredito ? 'Deuda Actual' : 'Saldo Actual';
                const tipoCuentaTexto = esCredito ? `Crédito (Corte día ${cuenta.diaCorte})` : 'Débito';

                itemElement.innerHTML = `
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
                `;
                accountsListContainer.appendChild(itemElement);
            });
        });
}

accountsListContainer.addEventListener('click', (e) => {
    // Si el clic es en el botón de descarga, lo manejamos y prevenimos la navegación
    if (e.target.classList.contains('download-account-btn')) {
        e.preventDefault(); 
        const cuentaId = e.target.dataset.accountId;
        const cuentaNombre = e.target.dataset.accountName;
        descargarRegistrosCuenta(cuentaId, cuentaNombre);
    }
});
