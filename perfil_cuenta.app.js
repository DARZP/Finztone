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

// --- LÓGICA PRINCIPAL ---

auth.onAuthStateChanged((user) => {
    if (user && cuentaId) {
        cargarDatosDeCuenta();
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeCuenta() {
    const cuentaRef = db.collection('cuentas').doc(cuentaId);
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
            periodControls.style.display = 'flex';

            currentPeriodDebt.textContent = `$${(cuentaData.deudaActual || 0).toLocaleString('es-MX')}`;
            totalDebtDisplay.textContent = `$${(cuentaData.deudaTotal || 0).toLocaleString('es-MX')}`;
            
            // Lógica para calcular días restantes
            const hoy = new Date();
            let proximoCorte = new Date(hoy.getFullYear(), hoy.getMonth(), cuentaData.diaCorte);
            if(hoy.getDate() > cuentaData.diaCorte) {
                proximoCorte.setMonth(proximoCorte.getMonth() + 1);
            }
            const diffTime = proximoCorte - hoy;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            cutoffDay.textContent = `Día ${cuentaData.diaCorte} de cada mes`;
            daysUntilCutoff.textContent = `${diffDays} días`;

            payCardBtn.onclick = () => realizarPago(cuentaData, 'actual');
            payPeriodBtn.onclick = () => realizarPago(cuentaData, 'periodo');

            await cargarTodosLosMovimientos(cuentaData);

        } else { // Débito
            creditDetailsSection.style.display = 'none';
            periodControls.style.display = 'none';
            debitDetails.style.display = 'block';
            debitBalance.textContent = `$${(cuentaData.saldoActual || 0).toLocaleString('es-MX')}`;
            await cargarTodosLosMovimientos(cuentaData);
        }
    });
}

async function cargarTodosLosMovimientos(cuentaData) {
    const user = auth.currentUser;
    if (!user) return;

    const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();
    const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();
    const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', user.uid).where('cuentaId', '==', cuentaId).get();

    const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([gastosPromise, ingresosPromise, nominaPromise]);

    todosLosMovimientos = [];
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'gasto', ...doc.data() }));
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'ingreso', ...doc.data() }));
    nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipoMovimiento: 'nomina', ...doc.data() }));
    
    if(cuentaData.tipo === 'credito') {
        agruparMovimientosPorPeriodo(cuentaData.diaCorte);
        poblarSelectorDePeriodos();
    } else {
        mostrarMovimientos(todosLosMovimientos);
    }
}

function agruparMovimientosPorPeriodo(diaCorte) {
    periodosCalculados = { 'actual': { movimientos: [], total: 0 } };

    todosLosMovimientos.forEach(mov => {
        const fechaMov = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha.replace(/-/g, '/'));
        const hoy = new Date();

        let fechaCorteEsteMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaCorte);
        
        if (fechaMov > fechaCorteEsteMes) { // Pertenece al período actual
            periodosCalculados['actual'].movimientos.push(mov);
        } else { // Pertenece a un período pasado
            let mesPeriodo = fechaMov.getMonth();
            let anioPeriodo = fechaMov.getFullYear();

            if(fechaMov.getDate() > diaCorte) {
                mesPeriodo += 1;
                if(mesPeriodo > 11) {
                    mesPeriodo = 0;
                    anioPeriodo += 1;
                }
            }
            
            const keyPeriodo = `${anioPeriodo}-${String(mesPeriodo + 1).padStart(2, '0')}`;
            if (!periodosCalculados[keyPeriodo]) {
                periodosCalculados[keyPeriodo] = { movimientos: [], total: 0 };
            }
            periodosCalculados[keyPeriodo].movimientos.push(mov);
        }
    });

    // Calcular totales de cada período
    for (const key in periodosCalculados) {
        let total = 0;
        periodosCalculados[key].movimientos.forEach(mov => {
            const monto = mov.totalConImpuestos || mov.monto || mov.montoDescontado;
            total += (mov.tipoMovimiento === 'gasto' || mov.tipoMovimiento === 'nomina') ? monto : -monto;
        });
        periodosCalculados[key].total = total;
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

periodSelector.addEventListener('change', () => {
    const periodoSeleccionado = periodSelector.value;
    const dataPeriodo = periodosCalculados[periodoSeleccionado];
    
    mostrarMovimientos(dataPeriodo.movimientos);

    if(periodoSeleccionado !== 'actual' && dataPeriodo.total > 0) {
        payPeriodBtn.style.display = 'block';
        payPeriodBtn.textContent = `Pagar $${dataPeriodo.total.toLocaleString('es-MX')}`;
    } else {
        payPeriodBtn.style.display = 'none';
    }
});

function mostrarMovimientos(movimientos) {
    // ... (Esta función no cambia, es la misma que ya tenías)
    movementsList.innerHTML = '';
    if (movimientos.length === 0) {
        movementsList.innerHTML = '<p>No hay movimientos en este período.</p>';
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
        const fecha = mov.fechaDePago ? mov.fechaDePago.toDate() : new Date(mov.fecha);
        const iconoComprobante = mov.comprobanteURL ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.2em; margin-left: 10px;">📎</a>` : '';

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
    let periodoPagadoKey = null; // Guardaremos la clave del período que se paga

    if (tipoPago === 'periodo') {
        periodoPagadoKey = periodSelector.value;
        montoAPagar = periodosCalculados[periodoPagadoKey].total;
        if (!confirm(`Vas a pagar el total del período seleccionado: $${montoAPagar.toLocaleString('es-MX')}. ¿Continuar?`)) return;
    } else { // Pago al período actual
        const montoStr = prompt("¿Qué monto deseas abonar al período actual?", cuentaCreditoData.deudaActual.toString());
        montoAPagar = parseFloat(montoStr);
        if (isNaN(montoAPagar) || montoAPagar <= 0) return alert("Monto inválido.");
    }

    // ... (La lógica para seleccionar la cuenta de débito no cambia) ...
    const cuentasDebitoSnapshot = await db.collection('cuentas').where('adminUid', '==', user.uid).where('tipo', '==', 'debito').get();
    if (cuentasDebitoSnapshot.empty) return alert("No tienes cuentas de débito para realizar el pago.");
    const cuentasDebito = cuentasDebitoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    let promptMessage = "Selecciona la cuenta de origen para el pago:\n";
    cuentasDebito.forEach((cuenta, index) => {
        promptMessage += `${index + 1}: ${cuenta.nombre} (Saldo: $${(cuenta.saldoActual || 0).toLocaleString()})\n`;
    });
    const eleccionStr = prompt(promptMessage);
    const eleccionIndex = parseInt(eleccionStr) - 1;
    if (isNaN(eleccionIndex) || eleccionIndex < 0 || eleccionIndex >= cuentasDebito.length) return alert("Selección inválida.");
    const cuentaDebitoSeleccionada = cuentasDebito[eleccionIndex];

    // --- TRANSACCIÓN MEJORADA ---
    const cuentaCreditoRef = db.collection('cuentas').doc(cuentaId);
    const cuentaDebitoRef = db.collection('cuentas').doc(cuentaDebitoSeleccionada.id);
    const fechaActualISO = new Date().toISOString().split('T')[0];

    try {
        await db.runTransaction(async (transaction) => {
            const credDoc = await transaction.get(cuentaCreditoRef);
            const debDoc = await transaction.get(cuentaDebitoRef);

            if (!credDoc.exists || !debDoc.exists) throw "Una de las cuentas no fue encontrada.";
            if (debDoc.data().saldoActual < montoAPagar) throw `Saldo insuficiente en la cuenta "${debDoc.data().nombre}".`;

            let nuevaDeudaActual = credDoc.data().deudaActual;
            let nuevaDeudaTotal = credDoc.data().deudaTotal;

            // La deuda total siempre se reduce por el monto del pago
            nuevaDeudaTotal -= montoAPagar;

            // Si es un pago al período actual, también reducimos la deuda actual
            if (tipoPago === 'actual') {
                nuevaDeudaActual -= montoAPagar;
            }

            const nuevoSaldoDebito = debDoc.data().saldoActual - montoAPagar;

            transaction.update(cuentaCreditoRef, { deudaActual: nuevaDeudaActual, deudaTotal: nuevaDeudaTotal });
            transaction.update(cuentaDebitoRef, { saldoActual: nuevoSaldoDebito });

            const gastoRef = db.collection('gastos').doc();
            transaction.set(gastoRef, {
                descripcion: `Pago a tarjeta ${credDoc.data().nombre}`,
                monto: montoAPagar, totalConImpuestos: montoAPagar, categoria: 'Pagos', fecha: fechaActualISO,
                status: 'aprobado', cuentaId: cuentaDebitoSeleccionada.id, cuentaNombre: cuentaDebitoSeleccionada.nombre,
                adminUid: user.uid, creadoPor: user.uid, nombreCreador: "Sistema", fechaDeCreacion: new Date()
            });

            const ingresoData = {
                descripcion: `Pago recibido desde ${debDoc.data().nombre}`,
                monto: montoAPagar, totalConImpuestos: montoAPagar, categoria: 'Pagos', fecha: fechaActualISO,
                status: 'aprobado', cuentaId: cuentaId, cuentaNombre: cuentaCreditoData.nombre,
                adminUid: user.uid, creadoPor: user.uid, nombreCreador: "Sistema", fechaDeCreacion: new Date(),
                esPagoDePeriodo: tipoPago === 'periodo', // Etiqueta para identificar el tipo de pago
                periodoPagado: periodoPagadoKey // Etiqueta con el período pagado (ej: '2025-09')
            };

            const ingresoRef = db.collection('ingresos').doc();
            transaction.set(ingresoRef, ingresoData);
        });
        alert(`¡Pago de $${montoAPagar.toLocaleString()} realizado exitosamente!`);
    } catch (error) {
        console.error("Error en la transacción:", error);
        alert("Error: " + error.message);
    }
}
