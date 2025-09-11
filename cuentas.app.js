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

// Lógica para mostrar las cuentas existentes
function cargarCuentas() {
    db.collection('cuentas').orderBy('fechaDeCreacion', 'desc')
      .onSnapshot(snapshot => {
        accountsListContainer.innerHTML = '';
        if (snapshot.empty) {
            accountsListContainer.innerHTML = '<p>Aún no has creado ninguna cuenta.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const itemElement = document.createElement('div');
            itemElement.classList.add('account-item');
            const fecha = cuenta.fechaDeCreacion.toDate().toLocaleDateString('es-ES');
            
            itemElement.innerHTML = `
                <div class="account-info">
                    <div class="account-name">${cuenta.nombre}</div>
                    <div class="account-date">Creada el ${fecha}</div>
                </div>
                <div class="account-balance">$${cuenta.saldoActual.toLocaleString('es-MX')}</div>
            `;
            accountsListContainer.appendChild(itemElement);
        });
    });
}
