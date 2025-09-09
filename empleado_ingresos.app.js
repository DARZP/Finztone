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
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');

// ---- VARIABLES DE ESTADO ----
let modoEdicion = false;
let idIngresoEditando = null;

// ---- LÓGICA DE LA PÁGINA ----

isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `INC-${userInitials}-${timestamp}`; // "INC" for Income
}

function cargarIngresoEnFormulario(ingreso) {
    addIncomeForm['income-description'].value = ingreso.descripcion;
    addIncomeForm['income-amount'].value = ingreso.monto;
    addIncomeForm['income-category'].value = ingreso.categoria;
    addIncomeForm['income-date'].value = ingreso.fecha;
    addIncomeForm['income-company'].value = ingreso.empresa || '';
    addIncomeForm['payment-method'].value = ingreso.metodoPago || 'Efectivo';
    addIncomeForm['income-comments'].value = ingreso.comentarios || '';

    if (ingreso.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        document.getElementById('invoice-rfc').value = ingreso.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = ingreso.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }

    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.textContent = 'Enviar para Aprobación';
    sendForApprovalBtn.style.display = 'inline-block'; // Mostramos ambos en modo edición
    cancelEditBtn.style.display = 'inline-block';

    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addIncomeForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';

    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.textContent = 'Enviar para Aprobación';
    cancelEditBtn.style.display = 'none';
    
    modoEdicion = false;
    idIngresoEditando = null;
}

cancelEditBtn.addEventListener('click', salirModoEdicion);

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
        empresa: addIncomeForm['income-company'].value,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        nombreCreador: userName,
    };

    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }

    if (modoEdicion) {
        db.collection('ingresos').doc(idIngresoEditando).update({
            ...incomeData,
            status: status
        })
        .then(() => {
            alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Ingreso enviado para aprobación!');
            salirModoEdicion();
        })
        .catch(error => console.error("Error al actualizar:", error));
    } else {
        db.collection('ingresos').add({
            ...incomeData,
            folio: generarFolio(user.uid), // <-- Folio se genera aquí
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        })
        .then(() => {
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado!');
            salirModoEdicion();
        })
        .catch(error => console.error("Error al guardar:", error));
    }
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
        ingresoElement.classList.add('expense-item'); // Reusamos clases de CSS
        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        
        const botonEditarHTML = ingreso.status === 'borrador' 
            ? `<button class="btn-edit" data-id="${ingreso.id}">Editar</button>` 
            : '';

        ingresoElement.innerHTML = `
            <div class="expense-info">
                <span class="expense-description">${ingreso.descripcion}</span>
                <span class="expense-details">${ingreso.categoria} - ${fecha}</span>
            </div>
            <div class="status status-${ingreso.status}">${ingreso.status}</div>
            <span class="expense-amount">$${ingreso.monto.toFixed(2)}</span>
            ${botonEditarHTML}
        `;
        incomeListContainer.appendChild(ingresoElement);
    });

    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const ingresoId = e.currentTarget.dataset.id;
            modoEdicion = true;
            idIngresoEditando = ingresoId;
            const ingresoAEditar = ingresos.find(i => i.id === ingresoId);
            if (ingresoAEditar) {
                cargarIngresoEnFormulario(ingresoAEditar);
            }
        });
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