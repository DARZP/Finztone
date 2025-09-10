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
    return `INC-ADM-${userInitials}-${timestamp}`;
}

// Lógica para guardar un nuevo ingreso aprobado
addIncomeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    // Lógica para verificar y crear la empresa si es nueva
    const companyName = addIncomeForm['income-company'].value.trim();
    if (companyName) {
        const companiesRef = db.collection('empresas');
        const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
        if (existingCompany.empty) {
            await companiesRef.add({ nombre: companyName });
            cargarEmpresas();
        }
    }

    const incomeData = {
        descripcion: addIncomeForm['income-description'].value,
        monto: parseFloat(addIncomeForm['income-amount'].value),
        categoria: addIncomeForm['income-category'].value,
        fecha: addIncomeForm['income-date'].value,
        empresa: companyName,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        folio: generarFolio(user.uid),
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: "Administrador",
        fechaDeCreacion: new Date(),
        status: 'aprobado'
    };

    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    db.collection('ingresos').add(incomeData)
    .then(() => {
        alert('¡Ingreso registrado exitosamente!');
        addIncomeForm.reset();
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
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
        ingresoElement.classList.add('expense-item'); // Reutilizamos estilos
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

// Verificamos auth y cargamos datos
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas(); // Cargamos las empresas al iniciar
        db.collection('ingresos')
          .where('status', '==', 'aprobado')
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(snapshot => {
                const ingresos = [];
                snapshot.forEach(doc => ingresos.push({ id: doc.id, ...doc.data() }));
                mostrarIngresosAprobados(ingresos);
            }, error => console.error("Error al obtener ingresos: ", error));
    } else {
        window.location.href = 'index.html';
    }
});