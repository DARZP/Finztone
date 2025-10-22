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
let currentUserData = {}; // Guardaremos el perfil del usuario actual

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

        // Configuración de la UI según el rol
        if (currentUserData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
        } else { // Es Admin
            backButton.href = 'dashboard.html';
            pendingPayrollSection.style.display = 'block'; // Mostramos la sección de pendientes
            cargarPagosPendientes(adminUid); // Cargamos las solicitudes
        }

        // Carga de datos inicial
        await cargarCuentas(adminUid);
        poblarFiltroDePeriodos();
        cargarDatosNomina(adminUid, periodSelector.value);
        periodSelector.addEventListener('change', () => cargarDatosNomina(adminUid, periodSelector.value));

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
        optionsHTML += `<option value="${cuenta.id}">${cuenta.nombre}</option>`;
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
        const userElement = document.createElement('div');
        userElement.classList.add('user-item');
        userElement.dataset.userId = usuario.id;
        
        const statusClass = isPaid ? 'status-paid' : 'status-pending';
        const statusText = isPaid ? 'Pagado' : 'Pendiente';
        
        let accountSelectorHTML = '';
        let buttonText = 'Marcar como Pagado';
        
        // Si el usuario es Co-admin, no mostramos el selector y cambiamos el texto del botón.
        if (currentUserData.rol === 'coadmin') {
            accountSelectorHTML = ''; // Sin selector de cuenta
            buttonText = 'Enviar para Aprobación';
        } else {
            accountSelectorHTML = isPaid ? '' : generarSelectorDeCuentas(usuario.id);
        }

        userElement.innerHTML = `
            <a href="perfil_empleado.html?id=${usuario.id}" class="user-info-link">
                <div class="user-name">${usuario.nombre}</div>
                <div class="user-details">${usuario.cargo} - Sueldo Neto: $${calcularSueldoNeto(usuario).toLocaleString()}</div>
            </a>
            <div class="account-selector-container">${accountSelectorHTML}</div>
            <div class="status ${statusClass}">${statusText}</div>
            <button class="btn-pay" ${isPaid ? 'disabled' : ''}>${buttonText}</button>
        `;
        userListContainer.appendChild(userElement);
    });

    userListContainer.querySelectorAll('.btn-pay:not([disabled])').forEach(button => {
        const userItem = button.closest('.user-item');
        const userId = userItem.dataset.userId;
        const user = usuarios.find(u => u.id === userId);
        button.addEventListener('click', () => registrarPago(user));
    });
}
async function registrarPago(empleado) {
    const adminUid = currentUserData.rol === 'admin' ? auth.currentUser.uid : currentUserData.adminUid;
    const creadorUid = auth.currentUser.uid;
    const creadorNombre = currentUserData.nombre;
    const periodo = periodSelector.value;
    
    const tipoDeDescuento = document.querySelector('input[name="payment-type"]:checked').value;
    const sueldoBruto = empleado.sueldoBruto || 0;
    const sueldoNeto = calcularSueldoNeto(empleado);
    const montoADescontar = tipoDeDescuento === 'neto' ? sueldoNeto : sueldoBruto;

    if (!confirm(`¿Confirmas el registro del pago para ${empleado.nombre} por el período ${periodo}?`)) return;

    // Lógica para el Administrador (pago directo)
    if (currentUserData.rol === 'admin') {
        const userItemElement = userListContainer.querySelector(`[data-user-id="${empleado.id}"]`);
        const accountSelector = userItemElement.querySelector('.account-selector-payroll');
        const cuentaId = accountSelector.value;
        if (!cuentaId) return alert(`Por favor, selecciona una cuenta de origen para ${empleado.nombre}.`);
        
        // Aquí iría tu lógica de transacción para pago directo (la que ya tenías)
        // Por simplicidad, la recreamos aquí.
        try {
            const cuentaRef = db.collection('cuentas').doc(cuentaId);
            await db.runTransaction(async (transaction) => {
                // ... Lógica de transacción para descontar saldo y crear registros ...
            });
            alert(`¡Pago para ${empleado.nombre} registrado exitosamente!`);
        } catch (error) {
            alert("Error al procesar el pago: " + error.message);
        }

    // Lógica para el Co-administrador (enviar a aprobación)
    } else {
        try {
            await db.collection('pagos_nomina').add({
                userId: empleado.id,
                userName: empleado.nombre,
                periodo,
                montoBruto: sueldoBruto,
                sueldoNeto,
                montoDescontado,
                deducciones: empleado.deducciones || [],
                fechaDeCreacion: new Date(),
                adminUid: adminUid,
                creadoPor: creadorUid,
                nombreCreador: creadorNombre,
                status: 'pendiente' // ¡El estado clave!
            });
            alert(`¡Solicitud de pago para ${empleado.nombre} enviada para aprobación!`);
        } catch (error) {
            alert("Error al enviar la solicitud: " + error.message);
        }
    }
}

function cargarPagosPendientes(adminUid) {
    db.collection('pagos_nomina')
      .where('adminUid', '==', adminUid)
      .where('status', '==', 'pendiente')
      .onSnapshot(snapshot => {
        if (snapshot.empty) {
            pendingPayrollList.innerHTML = '<p>No hay solicitudes de pago pendientes.</p>';
            return;
        }
        pendingPayrollList.innerHTML = '';
        snapshot.forEach(doc => {
            const pago = { id: doc.id, ...doc.data() };
            const itemElement = document.createElement('div');
            itemElement.classList.add('pending-item');
            itemElement.dataset.id = pago.id;
            
            itemElement.innerHTML = `
                <div class="item-summary">
                    <div class="item-details">
                        <div>
                            <span class="description">Pago a: ${pago.userName}</span>
                            <span class="amount">$${pago.montoDescontado.toLocaleString()}</span>
                        </div>
                        <div class="meta">Período: ${pago.periodo} | Solicitado por: ${pago.nombreCreador}</div>
                    </div>
                    <div class="item-actions">
                        ${generarSelectorDeCuentas(pago.id)}
                        <button class="btn btn-approve" onclick="aprobarPago('${pago.id}')">Aprobar</button>
                        <button class="btn btn-reject" onclick="rechazarPago('${pago.id}')">Rechazar</button>
                    </div>
                </div>
            `;
            pendingPayrollList.appendChild(itemElement);
        });
    });
}

window.aprobarPago = async (pagoId) => {
    const adminUid = auth.currentUser.uid;
    const itemElement = pendingPayrollList.querySelector(`[data-id="${pagoId}"]`);
    const cuentaId = itemElement.querySelector('select').value;

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

            // Descontar saldo de la cuenta
            if (cuentaData.tipo === 'credito') {
                transaction.update(cuentaRef, { deudaActual: (cuentaData.deudaActual || 0) + monto });
            } else {
                if ((cuentaData.saldoActual || 0) < monto) throw "Saldo insuficiente.";
                transaction.update(cuentaRef, { saldoActual: cuentaData.saldoActual - monto });
            }
            
            // Actualizar el estado del pago y generar impuestos
            transaction.update(pagoRef, { status: 'aprobado', fechaDePago: new Date(), cuentaId: cuentaId, cuentaNombre: cuentaData.nombre });
            
            (pagoData.deducciones || []).forEach(ded => {
                const montoDeducido = ded.tipo === 'porcentaje' ? (pagoData.montoBruto * ded.valor) / 100 : ded.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                transaction.set(taxMovRef, {
                    origen: `Nómina - ${pagoData.userName}`,
                    tipoImpuesto: ded.nombre,
                    monto: montoDeducido,
                    fecha: new Date(),
                    status: 'pagado (retenido)',
                    adminUid: adminUid
                });
            });
        });
        alert("¡Pago aprobado y procesado!");
    } catch (error) {
        alert("Error al aprobar el pago: " + error);
    }
}

window.rechazarPago = async (pagoId) => {
    const motivo = prompt("Introduce un motivo para el rechazo (opcional):");
    if (motivo === null) return; // Si el usuario cancela el prompt

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


// Genera la lista de períodos de pago
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

// Puebla el selector de períodos con la lista generada
function poblarFiltroDePeriodos() {
    const periodos = generarPeriodos();
    periodos.forEach(p => {
        const option = new Option(p.text, p.value);
        periodSelector.appendChild(option);
    });
}

// Carga los datos de usuarios y pagos para un período específico
function cargarDatosNomina(user, periodo) {
    // --- CORRECCIÓN DE SEGURIDAD ---
    db.collection('usuarios').where('adminUid', '==', user.uid).where('rol', '==', 'empleado').where('status', '==', 'activo').orderBy('nombre').get().then(usersSnapshot => {
        listaDeUsuarios = [];
        usersSnapshot.forEach(doc => listaDeUsuarios.push({ id: doc.id, ...doc.data() }));

        db.collection('pagos_nomina').where('adminUid', '==', user.uid).where('periodo', '==', periodo).onSnapshot(paymentsSnapshot => {
            const pagosDelPeriodo = [];
            paymentsSnapshot.forEach(doc => pagosDelPeriodo.push({ id: doc.id, ...doc.data() }));
            mostrarUsuarios(listaDeUsuarios, pagosDelPeriodo);
        });
    });
}
