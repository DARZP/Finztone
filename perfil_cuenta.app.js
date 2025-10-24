import { auth, db } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const accountNameTitle = document.getElementById('account-name-title');
const debitDetails = document.getElementById('debit-details');
const debitBalance = document.getElementById('debit-balance');
const creditDetailsSection = document.getElementById('credit-details-section');
const currentPeriodDebt = document.getElementById('current-period-debt');
const totalDebtDisplay = document.getElementById('total-debt-display');
const cutoffDay = document.getElementById('cutoff-day');
const daysUntilCutoff = document.getElementById('days-until-cutoff');
const movementsList = document.getElementById('movements-list');
const payCardBtn = document.getElementById('pay-card-btn');
const periodSelector = document.getElementById('period-selector');
const payPeriodBtn = document.getElementById('pay-period-btn');
const periodControls = document.getElementById('period-controls');

const urlParams = new URLSearchParams(window.location.search);
const cuentaId = urlParams.get('id');
let todosLosMovimientos = [];
let periodosCalculados = {};
let adminUidGlobal = null;

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user && cuentaId) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        adminUidGlobal = userData.adminUid || user.uid;
        
        cargarDatosDeCuenta(adminUidGlobal);

    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeCuenta(adminUid) {
    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    cuentaRef.onSnapshot(async (doc) => {
        if (!doc.exists) {
            alert("Cuenta no encontrada.");
            window.location.href = 'cuentas.html';
            return;
        }
        const cuentaData = doc.data();
        accountNameTitle.textContent = cuentaData.nombre;

        // Pasamos el adminUid a la función que carga los movimientos.
        await cargarTodosLosMovimientos(cuentaData, adminUid);

        if (cuentaData.tipo === 'credito') {
            debitDetails.style.display = 'none';
            creditDetailsSection.style.display = 'block';
            periodControls.style.display = 'flex';
            currentPeriodDebt.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
            totalDebtDisplay.textContent = `$${(cuentaData.deudaTotal || 0).toLocaleString('es-MX')}`;
            const hoy = new Date();
            let proximoCorte = new Date(hoy.getFullYear(), hoy.getMonth(), cuentaData.diaCorte);
            if (hoy.getDate() > cuentaData.diaCorte) {
                proximoCorte.setMonth(proximoCorte.getMonth() + 1);
            }
            const diffTime = proximoCorte - hoy;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cutoffDay.textContent = `Día ${cuentaData.diaCorte} de cada mes`;
            daysUntilCutoff.textContent = `${diffDays} días`;
            payCardBtn.onclick = () => realizarPago(cuentaData, 'actual');
            payPeriodBtn.onclick = () => realizarPago(cuentaData, 'periodo');
            agruparMovimientosPorPeriodo(cuentaData.diaCorte);
            poblarSelectorDePeriodos();
        } else { // Débito
            creditDetailsSection.style.display = 'none';
            periodControls.style.display = 'none';
            debitDetails.style.display = 'block';
            debitBalance.textContent = `$${(cuentaData.saldoActual || 0).toLocaleString('es-MX')}`;
            mostrarMovimientos(todosLosMovimientos);
        }
    });
}

async function cargarTodosLosMovimientos(cuentaData, adminUid) {
    const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();
    const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();
    const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('cuentaId', '==', cuentaId).get();

    const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([gastosPromise, ingresosPromise, nominaPromise]);

    todosLosMovimientos = [];
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'gasto', ...doc.data() }));
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'ingreso', ...doc.data() }));
    nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'nomina', ...doc.data() }));
}

function agruparMovimientosPorPeriodo(diaCorte) {
    periodosCalculados = { 'actual': { movimientos: [], total: 0, pagos: 0 } };
    const pagosDePeriodos = todosLosMovimientos.filter(m => m.esPagoDePeriodo);

    todosLosMovimientos.forEach(mov => {
        if (mov.esPagoDePeriodo) return;
        const fechaMov = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha.replace(/-/g, '/'));
        const hoy = new Date();
        let fechaCorteEsteMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaCorte);

        if (fechaMov > fechaCorteEsteMes) {
            periodosCalculados['actual'].movimientos.push(mov);
        } else {
            let mesPeriodo = fechaMov.getMonth();
            let anioPeriodo = fechaMov.getFullYear();
            if (fechaMov.getDate() > diaCorte) {
                mesPeriodo += 1;
                if (mesPeriodo > 11) { mesPeriodo = 0; anioPeriodo += 1; }
            }
            const keyPeriodo = `${anioPeriodo}-${String(mesPeriodo + 1).padStart(2, '0')}`;
            if (!periodosCalculados[keyPeriodo]) {
                periodosCalculados[keyPeriodo] = { movimientos: [], total: 0, pagos: 0 };
            }
            periodosCalculados[keyPeriodo].movimientos.push(mov);
        }
    });

    pagosDePeriodos.forEach(pago => {
        if (pago.periodoPagado && periodosCalculados[pago.periodoPagado]) {
            periodosCalculados[pago.periodoPagado].movimientos.push(pago);
            periodosCalculados[pago.periodoPagado].pagos += pago.monto;
        }
    });

    for (const key in periodosCalculados) {
        let totalGastos = 0;
        periodosCalculados[key].movimientos.forEach(mov => {
            if (mov.esPagoDePeriodo) return;
            const monto = mov.totalConImpuestos || mov.monto || mov.montoDescontado;
            if (mov.tipoMovimiento === 'gasto' || mov.tipoMovimiento === 'nomina') {
                totalGastos += monto;
            }
        });
        periodosCalculados[key].total = totalGastos - periodosCalculados[key].pagos;
    }
}

function poblarSelectorDePeriodos() {
    periodSelector.innerHTML = '<option value="actual">Período Actual</option>';
    const periodosOrdenados = Object.keys(periodosCalculados).filter(p => p !== 'actual').sort().reverse();
    
    periodosOrdenados.forEach(key => {
        const [anio, mes] = key.split('-');
        const nombreMes = new Date(anio, mes - 1, 1).toLocaleString('es-ES', { month: 'long' });
        const textoOpcion = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio} (Deuda: $${periodosCalculados[key].total.toLocaleString('es-MX')})`;
        periodSelector.add(new Option(textoOpcion, key));
    });

    periodSelector.dispatchEvent(new Event('change'));
}

function mostrarMovimientos(movimientos) {
    movementsList.innerHTML = '';
    if (!movimientos || movimientos.length === 0) {
        movementsList.innerHTML = '<p>No hay movimientos registrados en este período.</p>';
        return;
    }
    movimientos.sort((a, b) => {
        const dateA = a.fechaDePago?.toDate() || new Date(a.fecha?.replace(/-/g, '/'));
        const dateB = b.fechaDePago?.toDate() || new Date(b.fecha?.replace(/-/g, '/'));
        return dateB - dateA;
    });

    movimientos.forEach(mov => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('activity-feed-item'); 
        const esGasto = mov.tipoMovimiento !== 'ingreso';
        const signo = esGasto ? '-' : '+';
        const colorMonto = esGasto ? 'color: #ff8a80;' : 'color: var(--primary-color);';
        const monto = mov.totalConImpuestos || mov.monto || mov.montoDescontado;
        const fecha = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha.replace(/-/g, '/'));
        const iconoComprobante = mov.comprobanteURL ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';

        itemElement.innerHTML = `
            <div class="item-info">
                <span class="item-description">
                    ${mov.descripcion || `Pago de nómina a ${mov.userName}`}
                    ${iconoComprobante}
                </span>
                <span class="item-details">${fecha.toLocaleDateString('es-ES')} - por ${mov.nombreCreador || 'Sistema'}</span>
            </div>
            <span class="item-amount" style="${colorMonto}">${signo}$${(monto || 0).toLocaleString('es-MX')}</span>
        `;
        movementsList.appendChild(itemElement);
    });
}

async function realizarPago(cuentaCreditoData, tipoPago) {
    const user = auth.currentUser;
    if (!user) return;
    
    let montoAPagar;
    let periodoPagadoKey = null;

    if (tipoPago === 'periodo') {
        periodoPagadoKey = periodSelector.value;
        montoAPagar = periodosCalculados[periodoPagadoKey].total;
        if (montoAPagar <= 0) return alert("Este período no tiene deuda pendiente.");
        if (!confirm(`Vas a pagar el total del período seleccionado: $${montoAPagar.toLocaleString('es-MX')}. ¿Continuar?`)) return;
    } else {
        const montoStr = prompt("¿Qué monto deseas abonar al período actual?", (cuentaCreditoData.deudaActual || 0).toString());
        montoAPagar = parseFloat(montoStr);
        if (isNaN(montoAPagar) || montoAPagar <= 0) return alert("Monto inválido.");
    }
    
    const cuentasDebitoSnapshot = await db.collection('cuentas').where('adminUid', '==', adminUidGlobal).where('tipo', '==', 'debito').get();
    if (cuentasDebitoSnapshot.empty) return alert("No tienes cuentas de débito para pagar.");
    
    const cuentasDebito = cuentasDebitoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let promptMessage = "Selecciona la cuenta de origen para el pago:\n";
    cuentasDebito.forEach((cuenta, index) => {
        promptMessage += `${index + 1}: ${cuenta.nombre} (Saldo: $${(cuenta.saldoActual || 0).toLocaleString()})\n`;
    });
    const eleccionStr = prompt(promptMessage);
    const eleccionIndex = parseInt(eleccionStr) - 1;
    if (isNaN(eleccionIndex) || eleccionIndex < 0 || eleccionIndex >= cuentasDebito.length) return alert("Selección inválida.");
    const cuentaDebitoSeleccionada = cuentasDebito[eleccionIndex];

    const cuentaCreditoRef = db.collection('cuentas').doc(cuentaId);
    const cuentaDebitoRef = db.collection('cuentas').doc(cuentaDebitoSeleccionada.id);
    const fechaActualISO = new Date().toISOString().split('T')[0];

    try {
        await db.runTransaction(async (transaction) => {
            const credDoc = await transaction.get(cuentaCreditoRef);
            const debDoc = await transaction.get(cuentaDebitoRef);
            if (!credDoc.exists || !debDoc.exists) throw "Una de las cuentas no fue encontrada.";
            if (debDoc.data().saldoActual < montoAPagar) throw `Saldo insuficiente en "${debDoc.data().nombre}".`;

            let nuevaDeudaActual = credDoc.data().deudaActual || 0;
            let nuevaDeudaTotal = credDoc.data().deudaTotal || 0;
            
            nuevaDeudaTotal -= montoAPagar;
            if (tipoPago === 'actual') nuevaDeudaActual -= montoAPagar;
            
            const nuevoSaldoDebito = debDoc.data().saldoActual - montoAPagar;
            
            transaction.update(cuentaCreditoRef, { deudaActual: nuevaDeudaActual, deudaTotal: nuevaDeudaTotal });
            transaction.update(cuentaDebitoRef, { saldoActual: nuevoSaldoDebito });

            transaction.set(db.collection('gastos').doc(), {
                descripcion: `Pago a tarjeta ${credDoc.data().nombre}`, monto: montoAPagar, totalConImpuestos: montoAPagar, categoria: 'Pagos', fecha: fechaActualISO,
                status: 'aprobado', cuentaId: cuentaDebitoSeleccionada.id, cuentaNombre: cuentaDebitoSeleccionada.nombre,
                adminUid: adminUidGlobal, creadoPor: user.uid, nombreCreador: "Sistema", fechaDeCreacion: new Date()
            });
            transaction.set(db.collection('ingresos').doc(), {
                descripcion: `Pago recibido desde ${debDoc.data().nombre}`, monto: montoAPagar, totalConImpuestos: montoAPagar, categoria: 'Pagos', fecha: fechaActualISO,
                status: 'aprobado', cuentaId: cuentaId, cuentaNombre: cuentaCreditoData.nombre,
                adminUid: adminUidGlobal, creadoPor: user.uid, nombreCreador: "Sistema", fechaDeCreacion: new Date(),
                esPagoDePeriodo: tipoPago === 'periodo', periodoPagado: periodoPagadoKey
            });
        });
        alert(`¡Pago de $${montoAPagar.toLocaleString()} realizado!`);
    } catch (error) {
        console.error("Error en la transacción:", error);
        alert("Error: " + error.message);
    }
}

// --- EVENT LISTENER ---
periodSelector.addEventListener('change', () => {
    const periodoSeleccionado = periodSelector.value;
    const dataPeriodo = periodosCalculados[periodoSeleccionado];
    if (!dataPeriodo) {
        mostrarMovimientos([]);
        return;
    }
    
    mostrarMovimientos(dataPeriodo.movimientos);

    if (periodoSeleccionado !== 'actual' && dataPeriodo.total > 0) {
        payPeriodBtn.style.display = 'block';
        payPeriodBtn.textContent = `Pagar $${dataPeriodo.total.toLocaleString('es-MX')}`;
    } else {
        payPeriodBtn.style.display = 'none';
    }
});
