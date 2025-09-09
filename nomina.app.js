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

// ---- LÓGICA DE LA PÁGINA DE NÓMINA ----

const addUserForm = document.getElementById('add-user-form');
const userListContainer = document.getElementById('user-list');
const periodSelector = document.getElementById('period-selector');

// Lógica para agregar un nuevo usuario (se queda igual)
addUserForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = addUserForm['user-name'].value;
    const email = addUserForm['user-email'].value;
    const position = addUserForm['user-position'].value;
    const salary = parseFloat(addUserForm['user-salary'].value);

    db.collection('usuarios').add({
        nombre: name, email: email, cargo: position, sueldoBruto: salary, fechaDeIngreso: new Date()
    })
    .then(() => {
        alert('¡Empleado agregado a la base de datos!\n\nIMPORTANTE: Ahora ve a Firebase Authentication y crea una cuenta para este usuario.');
        addUserForm.reset();
    })
    .catch((error) => console.error('Error al agregar empleado: ', error));
});

// NUEVO: Función para generar una lista de períodos de pago (últimos 12)
function generarPeriodos() {
    const periodos = [];
    let fecha = new Date();

    for (let i = 0; i < 12; i++) {
        const year = fecha.getFullYear();
        const month = fecha.getMonth();
        const monthStr = String(month + 1).padStart(2, '0');
        
        // Segunda quincena
        periodos.push({ value: `${year}-${monthStr}-Q2`, text: `${fecha.toLocaleString('es-ES', { month: 'long' })} ${year} - 2da Quincena` });
        // Primera quincena
        periodos.push({ value: `${year}-${monthStr}-Q1`, text: `${fecha.toLocaleString('es-ES', { month: 'long' })} ${year} - 1ra Quincena` });

        // Retrocedemos al mes anterior
        fecha.setMonth(fecha.getMonth() - 1);
    }
    return periodos;
}

// NUEVO: Función para poblar el selector con los períodos
function poblarSelectorDePeriodos() {
    const periodos = generarPeriodos();
    periodos.forEach(p => {
        const option = document.createElement('option');
        option.value = p.value;
        option.textContent = p.text;
        periodSelector.appendChild(option);
    });
}

// Función para marcar un pago (actualizada para usar el período seleccionado)
function marcarPago(userId, userName, amount) {
    if (!confirm(`¿Estás seguro de que quieres marcar como pagada la nómina de ${userName}?`)) return;

    const selectedPeriod = periodSelector.value;
    db.collection('pagos_nomina').add({
        userId: userId, periodo: selectedPeriod, monto: amount, fechaDePago: new Date()
    })
    .then(() => alert(`Pago para ${userName} registrado en el período ${selectedPeriod}.`))
    .catch(error => console.error("Error al registrar el pago: ", error));
}

// Función para mostrar usuarios (actualizada para ser más simple)
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
        const statusClass = isPaid ? 'status-paid' : 'status-pending';
        const statusText = isPaid ? 'Pagado' : 'Pendiente';
        
        userElement.innerHTML = `
            <div class="user-info">
                <div class="user-name">${usuario.nombre}</div>
                <div class="user-details">${usuario.cargo} - ${usuario.email}</div>
            </div>
            <div class="status ${statusClass}">${statusText}</div>
            <button class="btn-pay" data-user-id="${usuario.id}" data-user-name="${usuario.nombre}" data-user-salary="${usuario.sueldoBruto}" ${isPaid || !selectedPeriodIsCurrent ? 'disabled' : ''}>
                Marcar como Pagado
            </button>
        `;
        userListContainer.appendChild(userElement);
    });

    document.querySelectorAll('.btn-pay:not([disabled])').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget;
            marcarPago(target.dataset.userId, target.dataset.userName, parseFloat(target.dataset.userSalary));
        });
    });
}

// REESTRUCTURADO: Función principal que carga todos los datos
function cargarDatosNomina(periodo) {
    db.collection('usuarios').orderBy('nombre').get().then(usersSnapshot => {
        const usuarios = [];
        usersSnapshot.forEach(doc => usuarios.push({ id: doc.id, ...doc.data() }));

        // Escuchamos los pagos del período seleccionado en tiempo real
        db.collection('pagos_nomina').where('periodo', '==', periodo).onSnapshot(paymentsSnapshot => {
            const pagosDelPeriodo = [];
            paymentsSnapshot.forEach(doc => pagosDelPeriodo.push({ id: doc.id, ...doc.data() }));
            mostrarUsuarios(usuarios, pagosDelPeriodo);
        });
    });
}

// Verificamos auth y configuramos la página
auth.onAuthStateChanged((user) => {
    if (user) {
        poblarSelectorDePeriodos();
        cargarDatosNomina(periodSelector.value); // Carga inicial con el período actual
        periodSelector.addEventListener('change', () => {
            cargarDatosNomina(periodSelector.value); // Recarga los datos cuando cambia el selector
        });
    } else {
        window.location.href = 'index.html';
    }
});