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

// ---- ELEMENTOS DEL DOM ----
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');

// ---- LÓGICA DE LA PÁGINA ----

// Añade este listener para el checkbox
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

// Reemplaza tu función guardarIngreso con esta
async function guardarIngreso(status) {
    const user = auth.currentUser;
    if (!user) return alert('No se ha podido identificar al usuario.');

    const description = addIncomeForm['income-description'].value;
    const amount = addIncomeForm['income-amount'].value;
    const date = addIncomeForm['income-date'].value;
    if (!description || !amount || !date) {
        return alert('Por favor, completa al menos el concepto, monto y fecha.');
    }

    const userProfile = await db.collection('usuarios').where('email', '==', user.email).get();
    const userName = userProfile.empty ? user.email : userProfile.docs[0].data().nombre;

    const incomeData = {
        descripcion: description,
        monto: parseFloat(amount),
        categoria: addIncomeForm['income-category'].value,
        fecha: date,
        // Nuevos campos
        empresa: addIncomeForm['income-company'].value,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        // Datos de sistema
        creadoPor: user.uid,
        emailCreador: user.email,
        nombreCreador: userName,
        fechaDeCreacion: new Date(),
        status: status
    };

    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    db.collection('ingresos').add(incomeData)
    .then(() => {
        const message = status === 'borrador' ? '¡Borrador de ingreso guardado!' : '¡Ingreso enviado para aprobación!';
        alert(message);
        addIncomeForm.reset();
        isInvoiceCheckbox.checked = false; // Aseguramos que se reinicie
        invoiceDetailsContainer.style.display = 'none';
    })
    .catch((error) => console.error('Error al guardar el ingreso: ', error));
}


saveDraftBtn.addEventListener('click', () => guardarIngreso('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarIngreso('pendiente'));

function mostrarIngresos(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>Aún no has registrado ingresos.</p>';
        return;
    }

    ingresos.forEach(ingreso => {
        const ingresoElement = document.createElement('div');
        ingresoElement.classList.add('expense-item'); // Reusamos la clase de estilo
        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        
        ingresoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${ingreso.descripcion}</span>
                <span class="expense-details">${ingreso.categoria} - ${fecha}</span>
            </div>
            <div class="status status-${ingreso.status}">${ingreso.status}</div>
            <span class="expense-amount">$${ingreso.monto.toFixed(2)}</span>
        `;
        incomeListContainer.appendChild(ingresoElement);
    });
}

auth.onAuthStateChanged((user) => {
    if (user) {
        db.collection('ingresos')
          .where('creadoPor', '==', user.uid)
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(querySnapshot => {
                const ingresos = [];
                querySnapshot.forEach(doc => {
                    ingresos.push({ id: doc.id, ...doc.data() });
                });
                mostrarIngresos(ingresos);
            }, error => console.error("Error al obtener ingresos: ", error));
    } else {
        window.location.href = 'index.html';
    }
}); 