import { auth, db } from './firebase-init.js';

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
const totalDebtDisplay = document.getElementById('total-debt-display');

// Obtenemos el ID de la cuenta desde la URL
const urlParams = new URLSearchParams(window.location.search);
const cuentaId = urlParams.get('id');

async function realizarPagoTarjeta(cuentaCreditoId, cuentaCreditoData) {
    const user = auth.currentUser;
    if (!user) return;

    // ... (El código para pedir el monto y seleccionar la cuenta de débito no cambia) ...
    const montoAPagarStr = prompt("¿Qué monto deseas pagar?", cuentaCreditoData.deudaActual.toString());
    const montoAPagar = parseFloat(montoAPagarStr);
    if (!montoAPagar || montoAPagar <= 0 || montoAPagar > cuentaCreditoData.deudaActual) {
        return alert("Monto inválido. La operación fue cancelada.");
    }
    const cuentasDebitoSnapshot = await db.collection('cuentas').where('adminUid', '==', user.uid).where('tipo', '==', 'debito').get();
    if (cuentasDebitoSnapshot.empty) { return alert("No tienes cuentas de débito para realizar el pago."); }
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

    // --- TRANSACCIÓN ACTUALIZADA PARA INCLUIR REGISTROS ---
    const cuentaCreditoRef = db.collection('cuentas').doc(cuentaCreditoId);
    const cuentaDebitoRef = db.collection('cuentas').doc(cuentaDebitoSeleccionada.id);
    const fechaActualISO = new Date().toISOString().split('T')[0];

    try {
        await db.runTransaction(async (transaction) => {
            const credDoc = await transaction.get(cuentaCreditoRef);
            const debDoc = await transaction.get(cuentaDebitoRef);

            if (!credDoc.exists || !debDoc.exists) { throw "Una de las cuentas no fue encontrada."; }

            const saldoDebito = debDoc.data().saldoActual;
            if (saldoDebito < montoAPagar) { throw `Saldo insuficiente en la cuenta "${debDoc.data().nombre}".`; }

            // 1. Actualizamos los saldos/deudas
            const nuevaDeuda = credDoc.data().deudaActual - montoAPagar;
            const nuevoSaldo = saldoDebito - montoAPagar;
            transaction.update(cuentaCreditoRef, { deudaActual: nuevaDeuda });
            transaction.update(cuentaDebitoRef, { saldoActual: nuevoSaldo });

            // --- ¡NUEVA LÓGICA! ---
            // 2. Creamos un registro de GASTO para la cuenta de DÉBITO
            const gastoRef = db.collection('gastos').doc();
            transaction.set(gastoRef, {
                descripcion: `Pago a tarjeta ${credDoc.data().nombre}`,
                monto: montoAPagar,
                totalConImpuestos: montoAPagar,
                categoria: 'Pagos',
                fecha: fechaActualISO,
                status: 'aprobado',
                cuentaId: cuentaDebitoSeleccionada.id,
                cuentaNombre: cuentaDebitoSeleccionada.nombre,
                adminUid: user.uid,
                creadoPor: user.uid,
                nombreCreador: "Sistema",
                fechaDeCreacion: new Date()
            });

            // 3. Creamos un registro de INGRESO para la cuenta de CRÉDITO
            const ingresoRef = db.collection('ingresos').doc();
            transaction.set(ingresoRef, {
                descripcion: `Pago recibido desde ${debDoc.data().nombre}`,
                monto: montoAPagar,
                totalConImpuestos: montoAPagar,
                categoria: 'Pagos',
                fecha: fechaActualISO,
                status: 'aprobado',
                cuentaId: cuentaCreditoId,
                cuentaNombre: cuentaCreditoData.nombre,
                adminUid: user.uid,
                creadoPor: user.uid,
                nombreCreador: "Sistema",
                fechaDeCreacion: new Date()
            });
        });

        alert(`¡Pago de $${montoAPagar.toLocaleString()} realizado exitosamente!`);

    } catch (error) {
        console.error("Error en la transacción de pago:", error);
        alert("Error: " + error);
    }
}

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
        if (!doc.exists) { 
            alert("Cuenta no encontrada.");
            window.location.href = 'cuentas.html';
            return; 
        }
        const cuentaData = doc.data();
        accountNameTitle.textContent = cuentaData.nombre;

        if (cuentaData.tipo === 'credito') {
            debitDetails.style.display = 'none';
            creditDetailsSection.style.display = 'block';

            creditDebt.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
            totalDebtDisplay.textContent = `$${(cuentaData.deudaTotal || 0).toLocaleString('es-MX')}`;
            cutoffDay.textContent = `Día ${cuentaData.diaCorte} de cada mes`;

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
    const user = auth.currentUser;
    if (!user) return;

    // --- CORRECCIÓN: Añadimos el filtro .where('adminUid', '==', user.uid) a cada consulta ---
    const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('cuentaId', '==', id).get();
    const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('cuentaId', '==', id).get();
    const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', user.uid).where('cuentaId', '==', id).get();

    const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
        gastosPromise, ingresosPromise, nominaPromise
    ]);

    const movimientos = [];
    gastosSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'gasto', ...doc.data() }));
    ingresosSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'ingreso', ...doc.data() }));
    nominaSnapshot.forEach(doc => movimientos.push({ tipoMovimiento: 'nomina', ...doc.data() }));

    movimientos.sort((a, b) => {
        const dateA = a.fechaDePago?.toDate() || new Date(a.fecha.replace(/-/g, '/'));
        const dateB = b.fechaDePago?.toDate() || new Date(b.fecha.replace(/-/g, '/'));
        return dateB - dateA;
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
        itemElement.classList.add('activity-feed-item'); 

        const esGasto = mov.tipoMovimiento !== 'ingreso';
        const signo = esGasto ? '-' : '+';
        const colorMonto = esGasto ? 'color: #ff8a80;' : 'color: var(--primary-color);';

        const monto = mov.totalConImpuestos || mov.monto || mov.montoDescontado;
        const fecha = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha);
        
        // --- LÓGICA NUEVA PARA EL ICONO DEL COMPROBANTE ---
        const iconoComprobante = mov.comprobanteURL 
            ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.2em; margin-left: 10px;">📎</a>` 
            : '';

        itemElement.innerHTML = `
            <div class="item-info">
                <span class="item-description">
                    ${mov.descripcion || `Pago de nómina a ${mov.userName}`}
                    ${iconoComprobante} </span>
                <span class="item-details">${fecha.toLocaleDateString('es-ES')} - por ${mov.nombreCreador || 'Sistema'}</span>
            </div>
            <span class="item-amount" style="${colorMonto}">${signo}$${(monto || 0).toLocaleString('es-MX')}</span>
        `;
        movementsList.appendChild(itemElement);
    });
}
