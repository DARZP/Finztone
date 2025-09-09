// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
// ¡Pega aquí la misma configuración de Firebase que usaste antes!
const firebaseConfig = {
  apiKey: "AIzaSyA4zRiQnr2PiG1zQc_k-Of9CmGQQSkVQ84", // Tu API Key está bien
  authDomain: "finztone-app.firebaseapp.com",
  projectId: "finztone-app",
  storageBucket: "finztone-app.appspot.com", // Corregí un pequeño error aquí, era .appspot.com
  messagingSenderId: "95145879307",
  appId: "1:95145879307:web:e10017a75edf32f1fde40e",
  measurementId: "G-T8KMJXNSTP"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---- LÓGICA DE LA PÁGINA DE GASTOS (ADMIN) ----
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');

// Función para generar un folio
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `${userInitials}-${timestamp}`;
}

// Lógica para guardar un nuevo gasto (directamente como 'aprobado')
addExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    db.collection('gastos').add({
        descripcion: addExpenseForm['expense-description'].value,
        monto: parseFloat(addExpenseForm['expense-amount'].value),
        categoria: addExpenseForm['expense-category'].value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: addExpenseForm['expense-company'].value,
        metodoPago: addExpenseForm['payment-method'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador", // O podrías buscar el nombre del admin
        fechaDeCreacion: new Date(),
        status: 'aprobado' // <-- Se guarda directamente como aprobado
    })
    .then(() => {
        alert('¡Gasto registrado exitosamente!');
        addExpenseForm.reset();
    })
    .catch((error) => console.error('Error al agregar el gasto: ', error));
});

// Función para mostrar la lista de TODOS los gastos aprobados
function mostrarGastosAprobados(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>No hay gastos aprobados en el historial.</p>';
        return;
    }

    gastos.forEach(gasto => {
        const gastoElement = document.createElement('div');
        gastoElement.classList.add('expense-item');
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        
        gastoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${gasto.descripcion}</span>
                <span class="expense-details">Registrado por: ${gasto.nombreCreador} | ${gasto.categoria} - ${fecha}</span>
            </div>
            <span class="expense-amount">$${gasto.monto.toFixed(2)}</span>
        `;
        expenseListContainer.appendChild(gastoElement);
    });
}

// Verificamos auth y cargamos TODOS los gastos con status 'aprobado'
auth.onAuthStateChanged((user) => {
    if (user) {
        db.collection('gastos')
          .where('status', '==', 'aprobado') // <-- ¡LA CONSULTA CLAVE!
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(querySnapshot => {
                const gastos = [];
                querySnapshot.forEach(doc => {
                    gastos.push({ id: doc.id, ...doc.data() });
                });
                mostrarGastosAprobados(gastos);
            }, error => console.error("Error al obtener gastos: ", error));
    } else {
        window.location.href = 'index.html';
    }
});