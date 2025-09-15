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

// --- ELEMENTOS DEL DOM ---
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const companyDataList = document.getElementById('company-list');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const formCategorySelect = document.getElementById('income-category');

// --- VARIABLES DE ESTADO ---
let modoEdicion = false;
let idIngresoEditando = null;
let impuestosDefinidos = [];

// --- LÓGICA DE LA PÁGINA ---

auth.onAuthStateChanged((user) => {
    if (user) {
        cargarEmpresas();
        poblarFiltrosYCategorias();
        cargarIngresos();
        cargarImpuestosParaSeleccion();
    } else {
        window.location.href = 'index.html';
    }
});

isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

cancelEditBtn.addEventListener('click', salirModoEdicion);
saveDraftBtn.addEventListener('click', () => guardarIngreso('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarIngreso('pendiente'));
categoryFilter.addEventListener('change', cargarIngresos);
monthFilter.addEventListener('change', cargarIngresos);

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `INC-${userInitials}-${timestamp}`;
}

function cargarEmpresas() {
    db.collection('empresas').get().then(snapshot => {
        companyDataList.innerHTML = '';
        snapshot.forEach(doc => {
            companyDataList.appendChild(new Option(doc.data().nombre));
        });
    });
}

async function cargarImpuestosParaSeleccion() {
    const snapshot = await db.collection('impuestos_definiciones').get();
    impuestosDefinidos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    taxesChecklistContainer.innerHTML = '';
    if (impuestosDefinidos.length === 0) {
        taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: #777;">No hay impuestos definidos.</p>';
        return;
    }
    impuestosDefinidos.forEach(impuesto => {
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        const item = document.createElement('div');
        item.classList.add('tax-item');
        item.innerHTML = `<input type="checkbox" id="tax-${impuesto.id}" data-impuesto='${JSON.stringify(impuesto)}'><label for="tax-${impuesto.id}">${impuesto.nombre} (${valorDisplay})</label>`;
        taxesChecklistContainer.appendChild(item);
    });
}

function cargarIngresoEnFormulario(ingreso) {
    addIncomeForm.reset();
    addIncomeForm['income-description'].value = ingreso.descripcion || '';
    addIncomeForm['income-amount'].value = ingreso.monto || 0;
    formCategorySelect.value = ingreso.categoria || '';
    addIncomeForm['income-date'].value = ingreso.fecha || '';
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
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
        const impuestoId = checkbox.id.replace('tax-', '');
        checkbox.checked = ingreso.impuestos?.some(tax => tax.id === impuestoId) || false;
    });
    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'block';
    modoEdicion = true;
    idIngresoEditando = ingreso.id;
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addIncomeForm.reset();
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    modoEdicion = false;
    idIngresoEditando = null;
}

async function guardarIngreso(status) {
    const user = auth.currentUser;
    if (!user) return;
    const description = addIncomeForm['income-description'].value;
    const amount = addIncomeForm['income-amount'].value;
    const date = addIncomeForm['income-date'].value;
    if (!description || !amount || !date) {
        return alert('Por favor, completa al menos el concepto, monto y fecha.');
    }
    const companyName = addIncomeForm['income-company'].value.trim();
    if (companyName) {
        const companiesRef = db.collection('empresas');
        const existingCompany = await companiesRef.where('nombre', '==', companyName).get();
        if (existingCompany.empty) {
            await companiesRef.add({ nombre: companyName });
            cargarEmpresas();
        }
    }
    const userProfile = await db.collection('usuarios').doc(user.uid).get();
    const userName = userProfile.exists ? userProfile.data().nombre : user.email;
    const impuestosSeleccionados = [];
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        impuestosSeleccionados.push(JSON.parse(checkbox.dataset.impuesto));
    });
    const incomeData = {
        descripcion: description,
        monto: parseFloat(amount),
        categoria: formCategorySelect.value,
        fecha: date,
        empresa: companyName,
        metodoPago: addIncomeForm['payment-method'].value,
        comentarios: addIncomeForm['income-comments'].value,
        nombreCreador: userName,
        impuestos: impuestosSeleccionados
    };
    if (isInvoiceCheckbox.checked) {
        incomeData.datosFactura = {
            rfc: document.getElementById('invoice-rfc').value,
            folioFiscal: document.getElementById('invoice-folio').value
        };
    }
    if (modoEdicion) {
        db.collection('ingresos').doc(idIngresoEditando).update({ ...incomeData, status: status })
            .then(() => {
                alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Ingreso enviado!');
                salirModoEdicion();
            }).catch(error => console.error("Error al actualizar:", error));
    } else {
        db.collection('ingresos').add({
            ...incomeData,
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            fechaDeCreacion: new Date(),
            status: status
        }).then(() => {
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado!');
            salirModoEdicion();
        }).catch(error => console.error("Error al guardar:", error));
    }
}

function mostrarIngresos(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No se encontraron ingresos.</p>';
        return;
    }
    ingresos.forEach(ingreso => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = ingreso.id;
        const fechaFormateada = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const botonEditarHTML = ingreso.status === 'borrador' ? `<button class="btn-edit" data-id="${ingreso.id}">Editar</button>` : '';
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}</span>
                    <span class="expense-details">${ingreso.categoria} - ${fechaFormateada}</span>
                </div>
                <div class="status-display status-${ingreso.status}">${ingreso.status}</div>
                <span class="expense-amount">$${ingreso.monto.toLocaleString('es-MX')}</span>
                ${botonEditarHTML}
            </div>
            <div class="item-details" style="display: none;"></div>
        `;
        incomeListContainer.appendChild(itemContainer);
    });
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const ingresoId = e.currentTarget.dataset.id;
            const ingresoAEditar = ingresos.find(i => i.id === ingresoId);
            if (ingresoAEditar) {
                cargarIngresoEnFormulario(ingresoAEditar);
            }
        });
    });
}

function poblarFiltrosYCategorias() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
    const categorias = ["Cobro de Factura", "Venta de Producto", "Servicios Profesionales", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
}

function cargarIngresos() {
    const user = auth.currentUser;
    if (!user) return;
    let query = db.collection('ingresos').where('creadoPor', '==', user.uid);
    if (categoryFilter.value && categoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', categoryFilter.value);
    }
    if (monthFilter.value && monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString().split('T')[0];
        query = query.where('fecha', '>=', startDate).where('fecha', '<=', endDate);
    }
    query.orderBy('fecha', 'desc').onSnapshot(snapshot => {
        const ingresos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarIngresos(ingresos);
    }, error => console.error("Error al obtener ingresos:", error));
}
