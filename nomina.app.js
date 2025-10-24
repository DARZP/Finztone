import { auth, db } from './firebase-init.js';

// ---- ELEMENTOS DEL DOM ----
const userListContainer = document.getElementById('user-list');
const periodSelector = document.getElementById('period-selector');
const pendingPayrollSection = document.getElementById('pending-payroll-section');
const pendingPayrollList = document.getElementById('pending-payroll-list');
const backButton = document.getElementById('back-button');

// ---- DATOS GLOBALES ----
let listaDeCuentas = [];
let listaDeUsuarios = [];
let currentUserData = {};

// ---- LÓGICA DE LA PÁGINA ----
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        if (!userDoc.exists) {
            alert("Error: Perfil de usuario no encontrado.");
            return;
        }
        currentUserData = userDoc.data();
        const adminUid = currentUserData.rol === 'admin' ? user.uid : currentUserData.adminUid;

        await cargarCuentas(adminUid);
        poblarFiltroDePeriodos();
        cargarDatosNomina(adminUid, periodSelector.value);
        periodSelector.addEventListener('change', () => cargarDatosNomina(adminUid, periodSelector.value));

        if (currentUserData.rol && currentUserData.rol.trim().toLowerCase() === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
        } else { // Es Admin
            backButton.href = 'dashboard.html';
            pendingPayrollSection.style.display = 'block';
            cargarPagosPendientes(adminUid);
        }
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarCuentas(adminUid) {
    listaDeCuentas = [];
    const snapshot = await db.collection('cuentas').where('adminUid', '==', adminUid).get();
    snapshot.forEach(doc => listaDeCuentas.push({ id: doc.id, ...doc.data() }));
}

function generarSelectorDeCuentas(idSufijo = '') {
    let optionsHTML = '<option value="" disabled selected>Seleccionar Cuenta</option>';
    listaDeCuentas.forEach(cuenta => {
        const etiqueta = cuenta.tipo === 'credito' ? 'Crédito' : 'Débito';
        optionsHTML += `<option value="${cuenta.id}">${cuenta.nombre} (${etiqueta})</option>`;
    });
    return `<select class="account-selector-payroll" id="account-selector-${idSufijo}">${optionsHTML}</select>`;
}

function mostrarUsuarios(usuarios, pagosDelPeriodo) {
    userListContainer.innerHTML = '';
    if (usuarios.length === 0) {
        userListContainer.innerHTML = '<p>No hay empleados activos registrados.</p>';
        return;
    }

    usuarios.forEach(usuario => {
        const isPaid = pagosDelPeriodo.some(pago => pago.userId === usuario.id && pago.status === 'aprobado');
        const containerElement = document.createElement('div');
        containerElement.classList.add('payroll-item-container');

        const statusClass = isPaid ? 'status-paid' : 'status-pending';
        const statusText = isPaid ? 'Pagado' : 'Pendiente';
        
        // --- LA LÓGICA DE VISIBILIDAD MEJORADA Y ROBUSTA ---
        const esCoAdmin = currentUserData.rol && currentUserData.rol.trim().toLowerCase() === 'coadmin';
        const selectorContainerClass = (esCoAdmin || isPaid) ? 'hidden' : '';
        const buttonText = esCoAdmin ? 'Enviar para Aprobación' : 'Marcar como Pagado';

        containerElement.innerHTML = `
            <div class="user-item" data-user-id="${usuario.id}">
                <a href="perfil_empleado.html?id=${usuario.id}" class="user-info-link">
                    <div class="user-name">${usuario.nombre}</div>
                    <div class="user-details">${usuario.cargo} - Sueldo Neto: $${calcularSueldoNeto(usuario).toLocaleString('es-MX')}</div>
                </a>
                <div class="account-selector-container ${selectorContainerClass}">
                    ${generarSelectorDeCuentas(usuario.id)}
                </div>
                <div class="status ${statusClass}">${statusText}</div>
                <button class="btn-pay" ${isPaid ? 'disabled' : ''}>${buttonText}</button>
            </div>
            <div class="item-details-view" id="details-${usuario.id}" style="display: none;"></div>
        `;
        userListContainer.appendChild(containerElement);
    });

    userListContainer.querySelectorAll('.btn-pay:not([disabled])').forEach(button => {
        const userItem = button.closest('.user-item');
        const userId = userItem.dataset.userId;
        const user = usuarios.find(u => u.id === userId);
        button.addEventListener('click', () => registrarPago(user));
    });
}

async function registrarPago(empleado) {
    const adminUid = currentUserData.adminUid || auth.currentUser.uid;
    const creadorUid = auth.currentUser.uid;
    const creadorNombre = currentUserData.nombre;
    const periodo = periodSelector.value;
    const tipoDeDescuento = document.querySelector('input[name="payment-type"]:checked').value;
    const sueldoBruto = empleado.sueldoBruto || 0;
    const sueldoNeto = calcularSueldoNeto(empleado);
    const montoADescontar = tipoDeDescuento === 'neto' ? sueldoNeto : sueldoBruto;

    if (!confirm(`¿Confirmas el registro del pago para ${empleado.nombre} por el período ${periodo}?`)) return;

    const esCoAdmin = currentUserData.rol && currentUserData.rol.trim().toLowerCase() === 'coadmin';

    if (esCoAdmin) {
        // Lógica para el Co-administrador (enviar a aprobación)
        try {
            await db.collection('pagos_nomina').add({
                userId: empleado.id, userName: empleado.nombre, periodo, montoBruto: sueldoBruto, sueldoNeto,
                montoDescontado: montoADescontar, deducciones: empleado.deducciones || [], fechaDeCreacion: new Date(),
                adminUid: adminUid, creadoPor: creadorUid, nombreCreador: creadorNombre, status: 'pendiente'
            });
            alert(`¡Solicitud de pago para ${empleado.nombre} enviada para aprobación!`);
        } catch (error) {
            alert("Error al enviar la solicitud: " + error.message);
        }
    } else {
        // Lógica para el Administrador (pago directo)
        const userItemElement = userListContainer.querySelector(`.user-item[data-user-id="${empleado.id}"]`);
        const accountSelector = userItemElement.querySelector('.account-selector-payroll');
        const cuentaId = accountSelector ? accountSelector.value : null;
        if (!cuentaId) return alert(`Por favor, selecciona una cuenta de origen para ${empleado.nombre}.`);
        
        const cuentaRef = db.collection('cuentas').doc(cuentaId);
        const nuevoPagoRef = db.collection('pagos_nomina').doc();
        try {
            await db.runTransaction(async (transaction) => {
                const cuentaDoc = await transaction.get(cuentaRef);
                if (!cuentaDoc.exists) throw new Error("La cuenta de origen no fue encontrada.");
                const cuentaData = cuentaDoc.data();
                if (cuentaData.tipo === 'credito') {
                    transaction.update(cuentaRef, { deudaActual: (cuentaData.deudaActual || 0) + montoADescontar, deudaTotal: (cuentaData.deudaTotal || 0) + montoADescontar });
                } else {
                    if ((cuentaData.saldoActual || 0) < montoADescontar) throw new Error("Saldo insuficiente en la cuenta.");
                    transaction.update(cuentaRef, { saldoActual: cuentaData.saldoActual - montoADescontar });
                }
                const datosPago = {
                    userId: empleado.id, userName: empleado.nombre, periodo, montoBruto: sueldoBruto, sueldoNeto, montoDescontado: montoADescontar,
                    fechaDePago: new Date(), cuentaId, cuentaNombre: cuentaData.nombre, adminUid: adminUid, status: 'aprobado'
                };
                transaction.set(nuevoPagoRef, datosPago);
                (empleado.deducciones || []).forEach(ded => {
                    const montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                    const taxMovRef = db.collection('movimientos_impuestos').doc();
                    transaction.set(taxMovRef, {
                        origen: `Nómina - ${empleado.nombre}`, tipoImpuesto: ded.nombre, monto: montoDeducido,
                        fecha: new Date(), status: 'pagado (retenido)', adminUid: adminUid
                    });
                });
            });
            alert(`¡Pago para ${empleado.nombre} registrado exitosamente!`);
        } catch (error) {
            console.error("Error en la transacción de pago:", error);
            alert("Error al procesar el pago: " + error.message);
        }
    }
}

function cargarPagosPendientes(adminUid) {
    db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('status', '==', 'pendiente').onSnapshot(snapshot => {
        pendingPayrollList.innerHTML = '';
        if (snapshot.empty) {
            pendingPayrollList.innerHTML = '<p>No hay solicitudes de pago pendientes.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const pago = { id: doc.id, ...doc.data() };
            const containerElement = document.createElement('div');
            containerElement.classList.add('payroll-item-container');
            containerElement.innerHTML = `<div class="pending-item" data-pago-id="${pago.id}"><div class="item-summary"><div class="item-details"><div><span class="description">Pago a: ${pago.userName}</span><span class="amount">$${pago.montoDescontado.toLocaleString('es-MX')}</span></div><div class="meta">Período: ${pago.periodo} | Solicitado por: ${pago.nombreCreador}</div></div><div class="item-actions">${generarSelectorDeCuentas()}<button class="btn btn-approve">Aprobar</button><button class="btn btn-reject">Rechazar</button></div></div></div><div class="item-details-view" style="display: none;"></div>`;
            pendingPayrollList.appendChild(containerElement);
            containerElement.querySelector('.btn-approve').addEventListener('click', () => aprobarPago(pago.id, containerElement));
            containerElement.querySelector('.btn-reject').addEventListener('click', () => rechazarPago(pago.id));
            containerElement.querySelector('.pending-item').addEventListener('click', (e) => {
                if (e.target.closest('button, select')) return;
                const detailsContainer = containerElement.querySelector('.item-details-view');
                const isVisible = detailsContainer.style.display === 'block';
                if (isVisible) {
                    detailsContainer.style.display = 'none';
                } else {
                    let deductionsHTML = '<h4>Desglose de Deducciones</h4>';
                    if (!pago.deducciones || pago.deducciones.length === 0) {
                        deductionsHTML += '<p>Esta solicitud no tiene deducciones asociadas.</p>';
                    } else {
                        pago.deducciones.forEach(ded => {
                            const montoDeducido = ded.tipo === 'porcentaje' ? (pago.montoBruto * ded.valor) / 100 : ded.valor;
                            deductionsHTML += `<div class="tax-line"><span>- ${ded.nombre}</span><span>$${montoDeducido.toLocaleString('es-MX')}</span></div>`;
                        });
                    }
                    detailsContainer.innerHTML = deductionsHTML;
                    detailsContainer.style.display = 'block';
                }
            });
        });
    });
}

async function aprobarPago(pagoId, itemContainer) {
    const adminUid = auth.currentUser.uid;
    const cuentaId = itemContainer.querySelector('select').value;
    if (!cuentaId) return alert("Por favor, selecciona una cuenta para aprobar el pago.");
    if (!confirm("¿Estás seguro de que quieres aprobar este pago? Esta acción es irreversible.")) return;

    const pagoRef = db.collection('pagos_nomina').doc(pagoId);
    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    try {
        await db.runTransaction(async (transaction) => {
            const pagoDoc = await transaction.get(pagoRef);
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!pagoDoc.exists || !cuentaDoc.exists) throw "El pago o la cuenta ya no existen.";
            const pagoData = pagoDoc.data();
            const cuentaData = cuentaDoc.data();
            const monto = pagoData.montoDescontado;
            if (cuentaData.tipo === 'credito') {
                transaction.update(cuentaRef, { deudaActual: (cuentaData.deudaActual || 0) + monto, deudaTotal: (cuentaData.deudaTotal || 0) + monto });
            } else {
                if ((cuentaData.saldoActual || 0) < monto) throw "Saldo insuficiente.";
                transaction.update(cuentaRef, { saldoActual: cuentaData.saldoActual - monto });
            }
            transaction.update(pagoRef, { status: 'aprobado', fechaDePago: new Date(), cuentaId: cuentaId, cuentaNombre: cuentaData.nombre });
            (pagoData.deducciones || []).forEach(ded => {
                const montoDeducido = ded.tipo === 'porcentaje' ? (pagoData.montoBruto * ded.valor) / 100 : ded.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                transaction.set(taxMovRef, {
                    origen: `Nómina - ${pagoData.userName}`, tipoImpuesto: ded.nombre, monto: montoDeducido,
                    fecha: new Date(), status: 'pagado (retenido)', adminUid: adminUid
                });
            });
        });
        alert("¡Pago aprobado y procesado!");
    } catch (error) {
        console.error("Error al aprobar pago:", error);
        alert("Error al aprobar el pago: " + error.message);
    }
}

async function rechazarPago(pagoId) {
    const motivo = prompt("Introduce un motivo para el rechazo (opcional):");
    if (motivo === null) return;
    await db.collection('pagos_nomina').doc(pagoId).update({
        status: 'rechazado',
        motivoRechazo: motivo
    });
    alert("La solicitud de pago ha sido rechazada.");
}

function calcularSueldoNeto(usuario) {
    const sueldoBruto = usuario.sueldoBruto || 0;
    let totalDeducciones = 0;
    (usuario.deducciones || []).forEach(ded => {
        totalDeducciones += ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
    });
    return sueldoBruto - totalDeducciones;
}

function generarPeriodos() {
    const periodos = [];
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const year = fecha.getFullYear();
        const month = fecha.getMonth();
        const monthStr = String(month + 1).padStart(2, '0');
        periodos.push({ value: `${year}-${monthStr}-Q2`, text: `${fecha.toLocaleString('es-ES', { month: 'long' })} ${year} - 2da Quincena` });
        periodos.push({ value: `${year}-${monthStr}-Q1`, text: `${fecha.toLocaleString('es-ES', { month: 'long' })} ${year} - 1ra Quincena` });
        fecha.setMonth(fecha.getMonth() - 1);
    }
    return periodos;
}

function poblarFiltroDePeriodos() {
    periodSelector.innerHTML = '';
    const periodos = generarPeriodos();
    periodos.forEach(p => {
        periodSelector.appendChild(new Option(p.text, p.value));
    });
}

function cargarDatosNomina(adminUid, periodo) {
    db.collection('usuarios').where('adminUid', '==', adminUid).where('rol', '==', 'empleado').where('status', '==', 'activo').orderBy('nombre').get().then(usersSnapshot => {
        listaDeUsuarios = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('periodo', '==', periodo).onSnapshot(paymentsSnapshot => {
            const pagosDelPeriodo = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            mostrarUsuarios(listaDeUsuarios, pagosDelPeriodo);
        });
    });
}

userListContainer.addEventListener('click', (e) => {
    if (e.target.closest('a, button, select')) return;
    const userItem = e.target.closest('.user-item');
    if (!userItem) return;
    const userId = userItem.dataset.userId;
    const detailsContainer = document.getElementById(`details-${userId}`);
    const user = listaDeUsuarios.find(u => u.id === userId);
    if (!detailsContainer || !user) return;
    const isVisible = detailsContainer.style.display === 'block';
    if (isVisible) {
        detailsContainer.style.display = 'none';
    } else {
        let deductionsHTML = '<h4>Desglose de Deducciones</h4>';
        if (!user.deducciones || user.deducciones.length === 0) {
            deductionsHTML += '<p>Este empleado no tiene deducciones fijas asignadas.</p>';
        } else {
            const sueldoBruto = user.sueldoBruto || 0;
            user.deducciones.forEach(ded => {
                const montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                deductionsHTML += `<div class="tax-line"><span>- ${ded.nombre}</span><span>$${montoDeducido.toLocaleString('es-MX')}</span></div>`;
            });
        }
        detailsContainer.innerHTML = deductionsHTML;
        detailsContainer.style.display = 'block';
    }
});
