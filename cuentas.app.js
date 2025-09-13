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

// --- ELEMENTOS DEL DOM ---
const addAccountForm = document.getElementById('add-account-form');
const accountsListContainer = document.getElementById('accounts-list');

// Protección de la ruta
auth.onAuthStateChanged(user => {
    if (user) {
        cargarCuentasConHistorial();
    } else {
        window.location.href = 'index.html';
    }
});

// Lógica para crear una nueva cuenta
addAccountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const accountName = addAccountForm['account-name'].value;
    const initialBalance = parseFloat(addAccountForm['initial-balance'].value);

    db.collection('cuentas').add({
        nombre: accountName,
        saldoInicial: initialBalance,
        saldoActual: initialBalance, // El saldo actual empieza siendo el inicial
        fechaDeCreacion: new Date()
    })
    .then(() => {
        alert(`¡Cuenta "${accountName}" creada exitosamente!`);
        addAccountForm.reset();
    })
    .catch(error => console.error("Error al crear la cuenta: ", error));
});

async function cargarCuentasConHistorial() {
    // 1. Obtenemos todas las cuentas
    const cuentasSnapshot = await db.collection('cuentas').orderBy('fechaDeCreacion', 'desc').get();
    const cuentas = cuentasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Obtenemos TODOS los movimientos
    const ingresosSnapshot = await db.collection('ingresos').where('status', '==', 'aprobado').get();
    const gastosSnapshot = await db.collection('gastos').where('status', '==', 'aprobado').get();
    const nominaSnapshot = await db.collection('pagos_nomina').get();
    
    const todosLosMovimientos = [];
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'ingreso', ...doc.data() }));
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'gasto', ...doc.data() }));
    nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'nomina', ...doc.data() }));

    // 3. Mostramos las cuentas y les asignamos sus movimientos
    accountsListContainer.innerHTML = '';
    if (cuentas.length === 0) {
        accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
        return;
    }

    cuentas.forEach(cuenta => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('account-item');
        
        const historial = todosLosMovimientos
            .filter(mov => mov.cuentaId === cuenta.id)
            .sort((a, b) => {
                // Hacemos el ordenamiento más seguro
                const dateA = a.fechaDeCreacion?.toDate() || a.fechaDePago?.toDate() || 0;
                const dateB = b.fechaDeCreacion?.toDate() || b.fechaDePago?.toDate() || 0;
                return dateB - dateA;
            });

        let historialHTML = '<p>No hay movimientos en esta cuenta.</p>';
        if (historial.length > 0) {
            historialHTML = historial.map(mov => {
                const esIngreso = mov.tipo === 'ingreso';
                const signo = esIngreso ? '+' : '-';
                const icono = esIngreso ? '🟢' : '🔴';
                const claseIcono = esIngreso ? 'ingreso' : 'gasto';

                let descripcion = mov.descripcion;
                let fecha = mov.fecha ? new Date(mov.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES') : 'Fecha no disp.';
                let creador = mov.nombreCreador;

                if (mov.tipo === 'nomina') {
                    descripcion = `Pago de nómina: ${mov.userName}`;
                    fecha = mov.fechaDePago.toDate().toLocaleDateString('es-ES');
                    creador = 'Sistema (Nómina)';
                }

                const montoFormateado = (typeof mov.monto === 'number') ? mov.monto.toLocaleString('es-MX') : '0.00';
                
                return `
                    <div class="history-item">
                        <div class="history-icon ${claseIcono}">${icono}</div>
                        <div class="history-details">
                            <div class="description">${descripcion}</div>
                            <div class="meta">${fecha} por ${creador}</div>
                        </div>
                        <div class="history-amount">
                            <span>${signo}$${montoFormateado}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        itemElement.innerHTML = `
            <div class="account-item-header">
                <div class="account-info">
                    <div class="account-name">${cuenta.nombre}</div>
                    <div class="account-date">Saldo Inicial: $${cuenta.saldoInicial.toLocaleString('es-MX')}</div>
                </div>
                <div class="account-balance">$${cuenta.saldoActual.toLocaleString('es-MX')}</div>
            </div>
            <div class="account-history">
                ${historialHTML}
            </div>
        `;
        accountsListContainer.appendChild(itemElement);
    });
}

accountsListContainer.addEventListener('click', (e) => {
    const header = e.target.closest('.account-item-header');
    if (header) {
        const history = header.nextElementSibling;
        const isVisible = history.style.display === 'block';
        history.style.display = isVisible ? 'none' : 'block';
    }
});
        
