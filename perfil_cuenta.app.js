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
const payCardBtn = document.getElementById('pay-card-btn');

// Obtenemos el ID de la cuenta desde la URL
const urlParams = new URLSearchParams(window.location.search);
const cuentaId = urlParams.get('id');

async function realizarPagoTarjeta(cuentaCreditoId, cuentaCreditoData) {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Pedimos el monto a pagar
    const montoAPagarStr = prompt("¿Qué monto deseas pagar?", cuentaCreditoData.deudaActual.toString());
    const montoAPagar = parseFloat(montoAPagarStr);

    if (!montoAPagar || montoAPagar <= 0) {
        return alert("Monto inválido. La operación fue cancelada.");
    }
    if (montoAPagar > cuentaCreditoData.deudaActual) {
        return alert("El monto a pagar no puede ser mayor que la deuda actual.");
    }

    // 2. Obtenemos las cuentas de débito para que el usuario elija de dónde pagar
    const cuentasDebitoSnapshot = await db.collection('cuentas')
        .where('adminUid', '==', user.uid)
        .where('tipo', '==', 'debito')
        .get();
    
    if (cuentasDebitoSnapshot.empty) {
        return alert("No tienes cuentas de débito para realizar el pago.");
    }

    const cuentasDebito = cuentasDebitoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let promptMessage = "Selecciona la cuenta de origen para el pago:\n";
    cuentasDebito.forEach((cuenta, index) => {
        promptMessage += `${index + 1}: ${cuenta.nombre} (Saldo: $${cuenta.saldoActual.toLocaleString()})\n`;
    });

    const eleccionStr = prompt(promptMessage);
    const eleccionIndex = parseInt(eleccionStr) - 1;

    if (isNaN(eleccionIndex) || eleccionIndex < 0 || eleccionIndex >= cuentasDebito.length) {
        return alert("Selección inválida. La operación fue cancelada.");
    }

    const cuentaDebitoSeleccionada = cuentasDebito[eleccionIndex];

    // 3. Realizamos la transacción
    const cuentaCreditoRef = db.collection('cuentas').doc(cuentaCreditoId);
    const cuentaDebitoRef = db.collection('cuentas').doc(cuentaDebitoSeleccionada.id);

    try {
        await db.runTransaction(async (transaction) => {
            const credDoc = await transaction.get(cuentaCreditoRef);
            const debDoc = await transaction.get(cuentaDebitoRef);

            if (!credDoc.exists || !debDoc.exists) {
                throw "Una de las cuentas no fue encontrada.";
            }

            const saldoDebito = debDoc.data().saldoActual;
            if (saldoDebito < montoAPagar) {
                throw `Saldo insuficiente en la cuenta "${debDoc.data().nombre}".`;
            }

            // Actualizamos ambas cuentas
            const nuevaDeuda = credDoc.data().deudaActual - montoAPagar;
            const nuevoSaldo = saldoDebito - montoAPagar;
            
            transaction.update(cuentaCreditoRef, { deudaActual: nuevaDeuda });
            transaction.update(cuentaDebitoRef, { saldoActual: nuevoSaldo });
        });

        alert(`¡Pago de $${montoAPagar.toLocaleString()} realizado exitosamente!`);

    } catch (error) {
        console.error("Error en la transacción de pago:", error);
        alert("Error: " + error);
    }
}
    

// --- LÓGICA PRINCIPAL ---

auth.onAuthStateChanged((user) => {
    if (user && cuentaId) {
        cargarDatosDeCuenta(cuentaId);
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeCuenta(id) {
    const cuentaRef = db.collection('cuentas').doc(id);
    cuentaRef.onSnapshot(async (doc) => {
        if (!doc.exists) { /* ... */ return; }
        const cuentaData = doc.data();
        accountNameTitle.textContent = cuentaData.nombre;

        if (cuentaData.tipo === 'credito') {
            debitDetails.style.display = 'none';
            creditDetailsSection.style.display = 'block';

            creditDebt.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
            cutoffDay.textContent = `Día ${cuentaData.diaCorte} de cada mes`;
            paymentDue.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;

            // Activamos el botón de pago y le pasamos los datos necesarios
            payCardBtn.textContent = "Realizar un Pago";
            payCardBtn.disabled = false;
            payCardBtn.onclick = () => realizarPagoTarjeta(id, cuentaData);
            
        } else { // Es de tipo 'debito'
            creditDetailsSection.style.display = 'none';
            debitDetails.style.display = 'block';
            debitBalance.textContent = `$${(cuentaData.saldoActual || 0).toLocaleString('es-MX')}`;
        }

        await cargarMovimientos(id);
    });
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
