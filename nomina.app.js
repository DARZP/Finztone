import { auth, db } from './firebase-init.js';

// ---- ELEMENTOS DEL DOM ----
const userListContainer = document.getElementById('user-list');
const periodSelector = document.getElementById('period-selector');

// ---- DATOS GLOBALES ----
let listaDeCuentas = [];
let listaDeUsuarios = []; // Guardaremos la lista de usuarios para reutilizarla

// ---- LÓGICA DE LA PÁGINA ----

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
        cargarCuentas(user).then(() => {
            poblarFiltroDePeriodos();
            cargarDatosNomina(user, periodSelector.value);
        });
        periodSelector.addEventListener('change', () => cargarDatosNomina(user, periodSelector.value));
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarCuentas(user) {
    listaDeCuentas = [];
    // --- CORRECCIÓN DE SEGURIDAD ---
    const snapshot = await db.collection('cuentas').where('adminUid', '==', user.uid).get();
    snapshot.forEach(doc => {
        listaDeCuentas.push({ id: doc.id, ...doc.data() });
    });
}

// Genera el HTML del selector de cuentas para una fila
function generarSelectorDeCuentas() {
    let optionsHTML = '<option value="" disabled selected>Cuenta de Orien</option>';
    listaDeCuentas.forEach(cuenta => {
        optionsHTML += `<option value="${cuenta.id}">${cuenta.nombre}</option>`;
    });
    return `<select class="account-selector-payroll">${optionsHTML}</select>`;
}

async function marcarPago(userId, userName, amount) {
    const user = auth.currentUser;
    if (!user) return alert('Error de autenticación');

    const userItemElement = userListContainer.querySelector(`[data-user-id="${userId}"]`);
    const accountSelector = userItemElement.querySelector('.account-selector-payroll');
    const cuentaId = accountSelector.value;
    const periodo = periodSelector.value;

    if (!cuentaId) {
        return alert(`Por favor, selecciona una cuenta de origen para ${userName}.`);
    }
    
    const cuentaNombre = accountSelector.options[accountSelector.selectedIndex].text;
    const tipoDeDescuento = document.querySelector('input[name="payment-type"]:checked').value;
    if (!confirm(`Confirmas el pago a ${userName} desde la cuenta ${cuentaNombre}?`)) return;

    const button = userItemElement.querySelector('.btn-pay');
    button.disabled = true;
    button.textContent = 'Procesando...';

    try {
        // --- 1. VERIFICAR ROL DEL USUARIO ACTUAL ---
        const currentUserDoc = await db.collection('usuarios').doc(user.uid).get();
        const currentUserData = currentUserDoc.exists ? currentUserDoc.data() : { rol: 'admin', nombre: 'Administrador' };
        
        // --- 2. OBTENER DATOS Y HACER CÁLCULOS ---
        const userToPayRef = db.collection('usuarios').doc(userId);
        const userToPayDoc = await userToPayRef.get();
        if (!userToPayDoc.exists) throw new Error("El colaborador a pagar no fue encontrado.");
        
        const userToPayData = userToPayDoc.data();
        const sueldoBruto = userToPayData.sueldoBruto || 0;
        const deducciones = userToPayData.deducciones || [];

        let totalDeducciones = 0;
        deducciones.forEach(ded => {
            totalDeducciones += ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
        });
        
        const sueldoNeto = sueldoBruto - totalDeducciones;
        const montoADescontar = tipoDeDescuento === 'neto' ? sueldoNeto : sueldoBruto;

        // --- 3. LÓGICA CONDICIONAL BASADA EN EL ROL ---
        if (currentUserData.rol === 'coadmin') {
            // Si es Co-Admin, solo crea una solicitud pendiente.
            await db.collection('pagos_nomina').add({
                userId,
                userName,
                periodo,
                montoBruto: sueldoBruto,
                sueldoNeto,
                montoDescontado: montoADescontar,
                fechaDeCreacion: new Date(),
                cuentaId,
                cuentaNombre,
                adminUid: currentUserData.adminUid || user.uid, // Usa el adminUid del co-admin
                creadoPor: user.uid,
                nombreCreador: currentUserData.nombre,
                status: 'pendiente' // El estado clave
            });
            alert(`¡Solicitud de pago para ${userName} enviada para aprobación!`);
        } else {
            // Si es Admin, ejecuta la transacción completa.
            const accountRef = db.collection('cuentas').doc(cuentaId);
            const newPaymentRef = db.collection('pagos_nomina').doc();
            
            await db.runTransaction(async (transaction) => {
                const accountDoc = await transaction.get(accountRef);
                if (!accountDoc.exists) throw "La cuenta de origen no existe.";
                const cuentaData = accountDoc.data();

                if (cuentaData.tipo === 'credito') {
                    const nuevaDeudaActual = (cuentaData.deudaActual || 0) + montoADescontar;
                    const nuevaDeudaTotal = (cuentaData.deudaTotal || 0) + montoADescontar;
                    transaction.update(accountRef, { deudaActual: nuevaDeudaActual, deudaTotal: nuevaDeudaTotal });
                } else { // Débito
                    const nuevoSaldo = (cuentaData.saldoActual || 0) - montoADescontar;
                    if(nuevoSaldo < 0) throw new Error("Saldo insuficiente.");
                    transaction.update(accountRef, { saldoActual: nuevoSaldo });
                }

                transaction.set(newPaymentRef, {
                    userId, userName, periodo, montoBruto: sueldoBruto, sueldoNeto, montoDescontado: montoADescontar,
                    fechaDePago: new Date(), cuentaId, cuentaNombre, adminUid: user.uid, status: 'aprobado'
                });

                const estadoImpuesto = tipoDeDescuento === 'neto' ? 'pagado (retenido)' : 'pendiente de pago';
                deducciones.forEach(ded => {
                    let montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                    const newTaxMovementRef = db.collection('movimientos_impuestos').doc();
                    transaction.set(newTaxMovementRef, {
                        origen: `Nómina - ${userName}`, pagoId: newPaymentRef.id, tipoImpuesto: ded.nombre,
                        monto: montoDeducido, fecha: new Date(), status: estadoImpuesto, adminUid: user.uid
                    });
                });
            });
            alert(`¡Pago para ${userName} registrado!`);
        }
        
        cargarCuentas(user); // Recargamos las cuentas para ver el saldo actualizado si aplica.

    } catch (error) {
        console.error("Error en la transacción de nómina: ", error);
        alert("Ocurrió un error: " + error.message);
        button.disabled = false; // Rehabilitamos el botón si hay error
        button.textContent = 'Marcar como Pagado';
    }
}

function mostrarUsuarios(usuarios, pagosDelPeriodo) {
    userListContainer.innerHTML = '';
    if (usuarios.length === 0) {
        userListContainer.innerHTML = '<p>No hay empleados registrados.</p>';
        return;
    }
    
    const selectedPeriodIsCurrent = periodSelector.value === generarPeriodos()[0].value;

    usuarios.forEach(usuario => {
        const isPaid = pagosDelPeriodo.some(pago => pago.userId === usuario.id);
        const userElement = document.createElement('div');
        userElement.classList.add('user-item');
        userElement.dataset.userId = usuario.id;
        
        const statusClass = isPaid ? 'status-paid' : 'status-pending';
        const statusText = isPaid ? 'Pagado' : 'Pendiente';
        
        userElement.innerHTML = `
            <a href="perfil_empleado.html?id=${usuario.id}" class="user-info-link">
                <div class="user-name">${usuario.nombre}</div>
                <div class="user-details">${usuario.cargo} - ${usuario.email}</div>
            </a>
            <div class="account-selector-container">
                ${isPaid ? '' : generarSelectorDeCuentas()}
            </div>
            <div class="status ${statusClass}">${statusText}</div>
            <button class="btn-pay" ${isPaid ? 'disabled' : ''}>
                Marcar como Pagado
            </button>
        `;
        userListContainer.appendChild(userElement);
    });

    userListContainer.querySelectorAll('.btn-pay:not([disabled])').forEach(button => {
        const userItem = button.closest('.user-item');
        const userId = userItem.dataset.userId;
        const user = usuarios.find(u => u.id === userId);
        button.addEventListener('click', () => {
            marcarPago(userId, user.nombre, user.sueldoBruto);
        });
    });
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
