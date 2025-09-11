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

// --- LÓGICA DE LA PÁGINA ---

// Protección de la ruta
auth.onAuthStateChanged(user => {
    if (user) {
        cargarCuentas();
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

    // 2. Obtenemos TODOS los ingresos y gastos que han sido aprobados y asignados a una cuenta
    const ingresosSnapshot = await db.collection('ingresos').where('status', '==', 'aprobado').get();
    const gastosSnapshot = await db.collection('gastos').where('status', '==', 'aprobado').get();
    
    const todosLosMovimientos = [];
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'ingreso', ...doc.data() }));
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'gasto', ...doc.data() }));

    // 3. Mostramos las cuentas y les asignamos sus movimientos
    accountsListContainer.innerHTML = '';
    if (cuentas.length === 0) {
        accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
        return;
    }

    cuentas.forEach(cuenta => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('account-item');
        
        // Buscamos los movimientos que pertenecen a ESTA cuenta y los ordenamos por fecha
        const historial = todosLosMovimientos
            .filter(mov => mov.cuentaId === cuenta.id)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let historialHTML = '<p>No hay movimientos en esta cuenta.</p>';
        if (historial.length > 0) {
            historialHTML = historial.map(mov => {
                const esIngreso = mov.tipo === 'ingreso';
                const signo = esIngreso ? '+' : '-';
                const icono = esIngreso ? '🟢' : '🔴';
                const claseIcono = esIngreso ? 'ingreso' : 'gasto';

                return `
                    <div class="history-item">
                        <div class="history-icon ${claseIcono}">${icono}</div>
                        <div class="history-details">
                            <div class="description">${mov.descripcion}</div>
                            <div class="meta">${new Date(mov.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES')} por ${mov.nombreCreador}</div>
                        </div>
                        <div class="history-amount">
                            <span>${signo}$${mov.monto.toLocaleString('es-MX')}</span>
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

// Listener para manejar el despliegue del historial
accountsListContainer.addEventListener('click', (e) => {
    const header = e.target.closest('.account-item-header');
    if (header) {
        const history = header.nextElementSibling;
        const isVisible = history.style.display === 'block';
        history.style.display = isVisible ? 'none' : 'block';
    }
});
