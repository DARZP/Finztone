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
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const companyDataList = document.getElementById('company-list');

// ---- VARIABLES DE ESTADO ----
let modoEdicion = false;
let idGastoEditando = null;

// ---- LÓGICA DE LA PÁGINA ----

// Muestra/oculta los campos de factura
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

// Genera un folio único
function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-${userInitials}-${timestamp}`;
}

// Carga las empresas existentes en el datalist para el autocompletado
function cargarEmpresas() {
    db.collection('empresas').get().then(querySnapshot => {
        companyDataList.innerHTML = '';
        querySnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.data().nombre;
            companyDataList.appendChild(option);
        });
    }).catch(error => console.error("Error al cargar empresas:", error));
}

// Carga los datos de un gasto en el formulario para editarlo
function cargarGastoEnFormulario(gasto) {
    addExpenseForm['expense-description'].value = gasto.descripcion;
    addExpenseForm['expense-amount'].value = gasto.monto;
    addExpenseForm['expense-category'].value = gasto.categoria;
    addExpenseForm['expense-date'].value = gasto.fecha;
    addExpenseForm['expense-company'].value = gasto.empresa || '';
    addExpenseForm['payment-method'].value = gasto.metodoPago || 'Efectivo';
    addExpenseForm['expense-comments'].value = gasto.comentarios || '';

    if (gasto.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        document.getElementById('invoice-rfc').value = gasto.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = gasto.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }

    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'none';
    cancelEditBtn.style.display = 'block';

    window.scrollTo(0, 0);
}

// Limpia el formulario y sale del modo edición
function salirModoEdicion() {
    addExpenseForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';

    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    
    modoEdicion = false;
    idGastoEditando = null;
}

cancelEditBtn.addEventListener('click', salirModoEdicion);

// Función central para guardar o actualizar un gasto
async function guardarGasto(status) {
    const user = auth.currentUser;
    if (!user) return alert('No se ha podido identificar al usuario.');

    const description = addExpenseForm['expense-description'].value;
    const amount = addExpenseForm['expense-amount'].value;
    const date = addExpenseForm['expense-date'].value;
    if (!description || !amount || !date) {
        return alert('Por favor, completa al menos el concepto, monto y fecha.');
    }

    const companyName = addExpenseForm['expense-company'].value.trim();
    if (companyName) {
        const companiesRef = db.collection('empresas');
        const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
        if (existingCompany.empty) {
            await companiesRef.add({ nombre: companyName });
            cargarEmpresas();
        }
    }

    const userProfile = await db.collection('usuarios').where('email', '==', user.email).get();
    const userName = userProfile.empty ? user.email : userProfile.docs[0].data().nombre;

    const expenseData = {
        descripcion: description,
        monto: parseFloat(amount),
        categoria: addExpenseForm['expense-category'].value,
        fecha: date,
        empresa: companyName,
        metodoPago: addExpenseForm['payment-method'].value,
        comentarios: addExpenseForm['expense-comments'].value,
        nombreCreador: userName,
    };

    if (isInvoiceCheckbox.checked) {
        expenseData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    if (modoEdicion) {
        db.collection('gastos').doc(idGastoEditando).update({ ...expenseData, status: status })
            .then(() => {
                alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Gasto enviado!');
                salirModoEdicion();
            })
            .catch(error => console.error("Error al actualizar:", error));
    } else {
        db.collection('gastos').add({
            ...expenseData,
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        })
        .then(() => {
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado!');
            salirModoEdicion();
        })
        .catch(error => console.error("Error al guardar:", error));
    }
}

// Asignamos acciones a los botones
saveDraftBtn.addEventListener('click', () => guardarGasto('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarGasto('pendiente'));

// Dibuja la lista de gastos en el HTML
function mostrarGastos(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>Aún no has registrado gastos.</p>';
        return;
    }

    gastos.forEach(gasto => {
        const gastoElement = document.createElement('div');
        gastoElement.classList.add('expense-item');
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        
        const botonEditarHTML = gasto.status === 'borrador' 
            ? `<button class="btn-edit" data-id="${gasto.id}">Editar</button>` 
            : '';

        gastoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${gasto.descripcion}</span>
                <span class="expense-details">${gasto.categoria} - ${fecha}</span>
            </div>
            <div class="status status-${gasto.status}">${gasto.status}</div>
            <span class="expense-amount">$${gasto.monto.toFixed(2)}</span>
            ${botonEditarHTML}
        `;
        expenseListContainer.appendChild(gastoElement);
    });

    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const gastoId = e.currentTarget.dataset.id;
            modoEdicion = true;
            idGastoEditando = gastoId;
            const gastoAEditar = gastos.find(g => g.id === gastoId);
            if (gastoAEditar) {
                cargarGastoEnFormulario(gastoAEditar);
            }
        });
    });
}

// Carga inicial de datos y protección de la ruta
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas(); // Cargamos las empresas al iniciar
        db.collection('gastos')
          .where('creadoPor', '==', user.uid)
          .orderBy('fechaDeCreacion', 'desc')
          .onSnapshot(querySnapshot => {
                const gastos = [];
                querySnapshot.forEach(doc => {
                    gastos.push({ id: doc.id, ...doc.data() });
                });
                mostrarGastos(gastos);
            }, error => console.error("Error al obtener gastos: ", error));
    } else {
        window.location.href = 'index.html';
    }
});