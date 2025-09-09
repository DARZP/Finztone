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
const db = firebase.firestore(); // ¡Ahora usamos Firestore!

// ---- LÓGICA DE LA PÁGINA DE GASTOS ----

const addExpenseForm = document.getElementById('add-expense-form');

// 2. Lógica para guardar un nuevo gasto en la base de datos
addExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Evitamos que la página se recargue

    // Obtenemos los valores del formulario
    const description = addExpenseForm['expense-description'].value;
    const amount = parseFloat(addExpenseForm['expense-amount'].value);
    const category = addExpenseForm['expense-category'].value;
    const date = addExpenseForm['expense-date'].value;
    const userId = auth.currentUser.uid; // Obtenemos el ID del usuario actual

    // Usamos 'db.collection()' para apuntar a nuestra colección de gastos
    db.collection('gastos').add({
        descripcion: description,
        monto: amount,
        categoria: category,
        fecha: date,
        creadoPor: userId, // Guardamos quién creó el registro
        fechaDeCreacion: new Date() // Guardamos la fecha exacta del registro
    })
    .then((docRef) => {
        console.log('Gasto registrado con ID: ', docRef.id);
        alert('¡Gasto registrado exitosamente!');
        addExpenseForm.reset(); // Limpiamos el formulario
    })
    .catch((error) => {
        console.error('Error al agregar el gasto: ', error);
        alert('Ocurrió un error al registrar el gasto.');
    });
});

// ---- LÓGICA PARA LEER Y MOSTRAR LOS GASTOS ----

const expenseListContainer = document.getElementById('expense-list');

// Función que se encarga de mostrar los gastos en la página
function mostrarGastos(gastos) {
    // Primero, limpiamos la lista por si había algo antes
    expenseListContainer.innerHTML = '';

    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>Aún no hay gastos registrados.</p>';
        return;
    }

    // Por cada gasto en la lista, creamos un elemento HTML
    gastos.forEach(gasto => {
        // Creamos un nuevo div para este item
        const gastoElement = document.createElement('div');
        gastoElement.classList.add('expense-item');

        // Formateamos la fecha para que sea más legible
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        // Llenamos el div con la información del gasto
        gastoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${gasto.descripcion}</span>
                <span class="expense-details">${gasto.categoria} - ${fecha}</span>
            </div>
            <span class="expense-amount">$${gasto.monto.toFixed(2)}</span>
        `;

        // Añadimos el nuevo elemento a nuestro contenedor en la página
        expenseListContainer.appendChild(gastoElement);
    });
}

// ---- MODIFICACIÓN A LA VERIFICACIÓN DE AUTH ----

// Ahora, modificaremos la función onAuthStateChanged para que,
// una vez que sabemos que el usuario está logueado, pidamos sus gastos.

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('Usuario autenticado:', user.uid);
        
        // ¡NUEVO! Escuchamos los cambios en la colección de gastos en tiempo real
        db.collection('gastos')
          .where('creadoPor', '==', user.uid) // Solo traemos los gastos de este usuario
          .orderBy('fechaDeCreacion', 'desc') // Los ordenamos del más nuevo al más viejo
          .onSnapshot(querySnapshot => {
                const gastos = [];
                querySnapshot.forEach(doc => {
                    gastos.push({ id: doc.id, ...doc.data() });
                });
                console.log('Gastos encontrados:', gastos);
                mostrarGastos(gastos); // Llamamos a la función para dibujarlos en pantalla
            }, error => {
                console.error("Error al obtener gastos: ", error);
            });

    } else {
        window.location.href = 'index.html';
    }
});