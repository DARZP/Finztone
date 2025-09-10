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

// ---- LÓGICA DE LA PÁGINA DE INGRESOS (ADMIN) ----
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');

// Lógica para guardar un nuevo ingreso (directamente como 'aprobado')
addIncomeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    db.collection('ingresos').add({
        descripcion: addIncomeForm['income-description'].value,
        monto: parseFloat(addIncomeForm['income-amount'].value),
        categoria: addIncomeForm['income-category'].value,
        fecha: addIncomeForm['income-date'].value,
        empresa: addIncomeForm['income-company'].value,
        metodoPago: addIncomeForm['payment-method'].value,
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        fechaDeCreacion: new Date(),
        status: 'aprobado' // <-- Se guarda directamente como aprobado
    })
    .then(() => {
        alert('¡Ingreso registrado exitosamente!');
        addIncomeForm.reset();
    })
    .catch((error) => console.error('Error al agregar el ingreso: ', error));
});

// Función para mostrar la lista de TODOS los ingresos aprobados
function mostrarIngresosAprobados(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No hay ingresos aprobados en el historial.</p>';
        return;
    }

    ingresos.forEach(ingreso => {
        const ingresoElement = document.createElement('div');
        // Reusamos los estilos de la lista de gastos
        ingresoElement.classList.add('expense-item');
        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        
        ingresoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${ingreso.descripcion}</span>
                <span class="expense-details">Registrado por: ${ingreso.nombreCreador} | ${ingreso.categoria} - ${fecha}</span>
            </div>
            <span class="expense-amount">$${ingreso.monto.toFixed(2)}</span>
        `;
        incomeListContainer.appendChild(ingresoElement);
    });
}

// Verificamos auth y cargamos TODOS los ingresos con status 'aprobado'
auth.onAuthStateChanged((user) => {
    if (user) {
        db.collection('ingresos')
          .where('status', '==', 'aprobado') // <-- ¡LA CONSULTA CLAVE!
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(querySnapshot => {
                const ingresos = [];
                querySnapshot.forEach(doc => {
                    ingresos.push({ id: doc.id, ...doc.data() });
                });
                mostrarIngresosAprobados(ingresos);
            }, error => {
              // Si te pide un índice, la consola mostrará el error con el enlace para crearlo.
              console.error("Error al obtener ingresos aprobados: ", error);
            });
    } else {
        window.location.href = 'index.html';
    }
});