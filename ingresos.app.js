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

// Inicializamos Firebase y sus servicios
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---- LÓGICA DE LA PÁGINA DE INGRESOS ----

const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');

// Lógica para guardar un nuevo ingreso en la base de datos
addIncomeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const description = addIncomeForm['income-description'].value;
    const amount = parseFloat(addIncomeForm['income-amount'].value);
    const category = addIncomeForm['income-category'].value;
    const date = addIncomeForm['income-date'].value;
    const userId = auth.currentUser.uid;

    db.collection('ingresos').add({ // <--- Apunta a la nueva colección 'ingresos'
        descripcion: description,
        monto: amount,
        categoria: category,
        fecha: date,
        creadoPor: userId,
        fechaDeCreacion: new Date()
    })
    .then((docRef) => {
        console.log('Ingreso registrado con ID: ', docRef.id);
        alert('¡Ingreso registrado exitosamente!');
        addIncomeForm.reset();
    })
    .catch((error) => {
        console.error('Error al agregar el ingreso: ', error);
        alert('Ocurrió un error al registrar el ingreso.');
    });
});

// Función que se encarga de mostrar los ingresos en la página
function mostrarIngresos(ingresos) {
    incomeListContainer.innerHTML = '';

    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>Aún no hay ingresos registrados.</p>';
        return;
    }

    ingresos.forEach(ingreso => {
        const ingresoElement = document.createElement('div');
        ingresoElement.classList.add('income-item'); // Clase CSS para ingresos

        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        ingresoElement.innerHTML = `
            <div class="income-info">
                <span class="income-description">${ingreso.descripcion}</span>
                <span class="income-details">${ingreso.categoria} - ${fecha}</span>
            </div>
            <span class="income-amount">$${ingreso.monto.toFixed(2)}</span>
        `;
        incomeListContainer.appendChild(ingresoElement);
    });
}

// Verificamos el estado de autenticación y cargamos los datos
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('Usuario autenticado:', user.uid);
        
        db.collection('ingresos') // <--- Lee de la nueva colección 'ingresos'
          .where('creadoPor', '==', user.uid)
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(querySnapshot => {
                const ingresos = [];
                querySnapshot.forEach(doc => {
                    ingresos.push({ id: doc.id, ...doc.data() });
                });
                mostrarIngresos(ingresos); // Llama a la función para mostrar ingresos
            }, error => {
                console.error("Error al obtener ingresos: ", error);
            });
    } else {
        window.location.href = 'index.html';
    }
});