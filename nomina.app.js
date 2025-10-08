// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
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

// ---- ELEMENTOS DEL DOM ----
const userListContainer = document.getElementById('user-list');
const periodSelector = document.getElementById('period-selector');

// ---- DATOS GLOBALES ----
let listaDeCuentas = [];
let listaDeUsuarios = []; // Guardaremos la lista de usuarios para reutilizarla

// ---- LÓGICA DE LA PÁGINA ----

auth.onAuthStateChanged((user) => {
    if (user) {
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
    const user = auth.currentUser; // Obtenemos el usuario admin actual
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

    const accountRef = db.collection('cuentas').doc(cuentaId);
    const newPaymentRef = db.collection('pagos_nomina').doc();
    const userRef = db.collection('usuarios').doc(userId);
    let montoADescontar;
    
    try {
        await db.runTransaction(async (transaction) => {
            const accountDoc = await transaction.get(accountRef);
            const userDoc = await transaction.get(userRef);
            if (!accountDoc.exists || !userDoc.exists) throw "La cuenta o el usuario no existen.";

            const saldoActual = accountDoc.data().saldoActual;
            const sueldoBruto = userDoc.data().sueldoBruto || 0;
            const deducciones = userDoc.data().deducciones || [];

            let totalDeducciones = 0;
            deducciones.forEach(ded => {
                let montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                totalDeducciones += montoDeducido;
            });
            
            const sueldoNeto = sueldoBruto - totalDeducciones;
            montoADescontar = tipoDeDescuento === 'neto' ? sueldoNeto : sueldoBruto;
            const nuevoSaldo = saldoActual - montoADescontar;
            if(nuevoSaldo < 0) throw new Error("Saldo insuficiente en la cuenta de origen.");

            transaction.set(newPaymentRef, {
                userId: userId,
                userName: userName,
                periodo: periodo,
                montoBruto: sueldoBruto,
                montoNeto: sueldoNeto,
                montoDescontado: montoADescontar,
                fechaDePago: new Date(),
                cuentaId: cuentaId,
                cuentaNombre: cuentaNombre,
                adminUid: user.uid // <-- LÍNEA AÑADIDA
            });
            
            const estadoImpuesto = tipoDeDescuento === 'neto' ? 'pagado (retenido)' : 'pendiente de pago';
            deducciones.forEach(ded => {
                let montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                const newTaxMovementRef = db.collection('movimientos_impuestos').doc();
                transaction.set(newTaxMovementRef, {
                    origen: `Nómina - ${userName}`,
                    pagoId: newPaymentRef.id,
                    tipoImpuesto: ded.nombre,
                    monto: montoDeducido,
                    fecha: new Date(),
                    status: estadoImpuesto,
                    adminUid: user.uid // <-- LÍNEA AÑADIDA
                });
            });

            transaction.update(accountRef, { saldoActual: nuevoSaldo });
        });
        alert(`¡Pago para ${userName} registrado y deducciones generadas!`);
        cargarCuentas(user);
    } catch (error) {
        console.error("Error en la transacción: ", error);
        alert("Ocurrió un error: " + error.message);
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
