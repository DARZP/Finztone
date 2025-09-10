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
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const companyDataList = document.getElementById('company-list');

// Muestra/oculta campos de factura
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

// Carga las empresas existentes para el autocompletado
function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nombre;
            companyDataList.appendChild(option);
        });
    });
}

// Genera un folio
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-ADM-${userInitials}-${timestamp}`;
}

// Lógica para guardar un nuevo gasto aprobado
addExpenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    // Lógica para verificar y crear la empresa si es nueva
    const companyName = addExpenseForm['expense-company'].value.trim();
    if (companyName) {
        const companiesRef = db.collection('empresas');
        const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
        if (existingCompany.empty) {
            await companiesRef.add({ nombre: companyName });
            cargarEmpresas();
        }
    }

    const expenseData = {
        descripcion: addExpenseForm['expense-description'].value,
        monto: parseFloat(addExpenseForm['expense-amount'].value),
        categoria: addExpenseForm['expense-category'].value,
        fecha: addExpenseForm['expense-date'].value,
        empresa: companyName,
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        fechaDeCreacion: new Date(),
        status: 'aprobado'
    };

    if (isInvoiceCheckbox.checked) {
        expenseData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    db.collection('gastos').add(expenseData)
    .then(() => {
        alert('¡Gasto registrado exitosamente!');
        addExpenseForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    })
    .catch((error) => console.error('Error al agregar el gasto: ', error));
});

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


// Verificamos auth y cargamos datos
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas(); // Cargamos las empresas al iniciar
        db.collection('gastos')
          .where('status', '==', 'aprobado')
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(snapshot => {
                const gastos = [];
                snapshot.forEach(doc => gastos.push({ id: doc.id, ...doc.data() }));
                mostrarGastosAprobados(gastos);
            }, error => console.error("Error al obtener gastos: ", error));
    } else {
        window.location.href = 'index.html';
    }
});