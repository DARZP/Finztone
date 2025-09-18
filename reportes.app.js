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

// --- ELEMENTOS DEL DOM ---
const generateBtn = document.getElementById('generate-spreadsheet-btn');
const userFilter = document.getElementById('user-filter');
const accountFilter = document.getElementById('account-filter');

// --- LÓGICA DE LA PÁGINA ---

auth.onAuthStateChanged(user => {
    if (user) {
        poblarFiltroUsuarios();
        poblarFiltroCuentas();
    } else {
        window.location.href = 'index.html';
    }
});

function poblarFiltroUsuarios() {
    db.collection('usuarios').where('rol', '==', 'empleado').orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const user = doc.data();
                const option = new Option(user.nombre, doc.id);
                userFilter.appendChild(option);
            });
        });
}

function poblarFiltroCuentas() {
    db.collection('cuentas').orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const cuenta = doc.data();
                const option = new Option(cuenta.nombre, doc.id);
                accountFilter.appendChild(option);
            });
        });
}

generateBtn.addEventListener('click', () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const includeIngresos = document.getElementById('include-ingresos').checked;
    const includeGastos = document.getElementById('include-gastos').checked;
    const includeNomina = document.getElementById('include-nomina').checked;
    const includeImpuestos = document.getElementById('include-impuestos').checked;
    const selectedUserId = userFilter.value;
    const selectedAccountId = accountFilter.value;

    if (!startDate || !endDate) {
        return alert('Por favor, selecciona una fecha de inicio y de fin.');
    }

    alert(`
        REPORTE SOLICITADO:
        Período: ${startDate} a ${endDate}
        Incluir Ingresos: ${includeIngresos}
        Incluir Gastos: ${includeGastos}
        
        En el siguiente paso, usaremos estos datos para generar la hoja de cálculo.
    `);
});
