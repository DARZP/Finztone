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
const accountNameTitle = document.getElementById('account-name-title');
const debitDetails = document.getElementById('debit-details');
const debitBalance = document.getElementById('debit-balance');
const creditDetailsSection = document.getElementById('credit-details-section');
const creditDebt = document.getElementById('credit-debt');
const cutoffDay = document.getElementById('cutoff-day');
const paymentDue = document.getElementById('payment-due');
const movementsList = document.getElementById('movements-list');

// Obtenemos el ID de la cuenta desde la URL
const urlParams = new URLSearchParams(window.location.search);
const cuentaId = urlParams.get('id');

// --- LÓGICA PRINCIPAL ---

auth.onAuthStateChanged((user) => {
    if (user && cuentaId) {
        cargarDatosDeCuenta(cuentaId);
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeCuenta(id) {
    try {
        // 1. Obtenemos la información de la cuenta
        const cuentaRef = db.collection('cuentas').doc(id);
        cuentaRef.onSnapshot(async (doc) => {
            if (!doc.exists) {
                console.error("No se encontró la cuenta");
                accountNameTitle.textContent = "Cuenta no encontrada";
                return;
            }
            const cuentaData = doc.data();
            accountNameTitle.textContent = cuentaData.nombre;

            // 2. Mostramos la sección correcta según el tipo de cuenta
            if (cuentaData.tipo === 'credito') {
                debitDetails.style.display = 'none';
                creditDetailsSection.style.display = 'block';

                creditDebt.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
                cutoffDay.textContent = `Día ${cuentaData.diaCorte} de cada mes`;
                // Lógica de "pago para no generar intereses" (por ahora es la deuda total)
                paymentDue.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
                
            } else { // Es de tipo 'debito'
                creditDetailsSection.style.display = 'none';
                debitDetails.style.display = 'block';

                debitBalance.textContent = `$${(cuentaData.saldoActual || 0).toLocaleString('es-MX')}`;
            }

            // 3. Cargamos el historial de movimientos de esa cuenta
            await cargarMovimientos(id);
        });
    } catch (error) {
        console.error("Error al cargar los datos de la cuenta:", error);
    }
}

async function cargarMovimientos(id) {
    const gastosPromise = db.collection('gastos').where('cuentaId', '==', id).get();
    const ingresosPromise = db.collection('ingresos').where('cuentaId', '==', id).get();
    const nominaPromise = db.collection('pagos_nomina').where('cuentaId', '==', id).get();

    const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
        gastosPromise, ingresosPromise, nominaPromise
    ]);

    const movimientos = [];
    gastosSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'gasto', ...doc.data() }));
    ingresosSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'ingreso', ...doc.data() }));
    nominaSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'nomina', ...doc.data() }));

    movimientos.sort((a, b) => {
        const dateA = a.fechaDePago?.toDate() || new Date(a.fecha);
        const dateB = b.fechaDePago?.toDate() || new Date(b.fecha);
        return dateB - dateA; // Ordena del más reciente al más antiguo
    });
    
    mostrarMovimientos(movimientos);
}

function mostrarMovimientos(movimientos) {
    movementsList.innerHTML = '';
    if (movimientos.length === 0) {
        movementsList.innerHTML = '<p>No hay movimientos registrados en esta cuenta.</p>';
        return;
    }

    movimientos.forEach(mov => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('activity-feed-item'); // Reutilizamos un estilo que ya tenemos

        const esGasto = mov.tipoMovimiento !== 'ingreso';
        const signo = esGasto ? '-' : '+';
        const colorMonto = esGasto ? 'color: #ff8a80;' : 'color: var(--primary-color);';

        const monto = mov.totalConImpuestos || mov.monto || mov.montoDescontado;
        const fecha = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha);

        itemElement.innerHTML = `
            <div class="item-info">
                <span class="item-description">${mov.descripcion || `Pago de nómina a ${mov.userName}`}</span>
                <span class="item-details">${fecha.toLocaleDateString('es-ES')} - por ${mov.nombreCreador || 'Sistema'}</span>
            </div>
            <span class="item-amount" style="${colorMonto}">${signo}$${(monto || 0).toLocaleString('es-MX')}</span>
        `;
        movementsList.appendChild(itemElement);
    });
}
