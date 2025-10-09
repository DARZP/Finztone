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
const storage = firebase.storage();
const functions = firebase.app().functions('us-central1');

// --- ELEMENTOS DEL DOM ---
const addExpenseForm = document.getElementById('add-expense-form');
const receiptFileInput = document.getElementById('receipt-file');
const expenseListContainer = document.getElementById('expense-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const formCategorySelect = document.getElementById('expense-category');
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const montoInput = document.getElementById('expense-amount');
const summaryBruto = document.getElementById('summary-bruto');
const summaryImpuestos = document.getElementById('summary-impuestos');
const summaryNeto = document.getElementById('summary-neto');
const formPaymentMethodSelect = document.getElementById('payment-method');
const expensePlaceInput = document.getElementById('expense-place');
const clientSelect = document.getElementById('client-select');
const projectSelect = document.getElementById('project-select');

let empresasCargadas = [];
let modoEdicion = false;
let idGastoEditando = null;
let adminUidGlobal = null;

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userProfileQuery = await db.collection('usuarios').where('email', '==', user.email).limit(1).get();
            if (userProfileQuery.empty) throw "Perfil de usuario no encontrado.";
            
            adminUidGlobal = userProfileQuery.docs[0].data().adminUid;
            if (!adminUidGlobal) throw "El empleado no está vinculado a un administrador.";

            cargarClientesYProyectos();
            poblarFiltrosYCategorias();
            cargarGastos();
            cargarImpuestosParaSeleccion();
            recalcularTotales();

        } catch (error) {
            console.error("Error crítico al cargar datos iniciales:", error);
            alert("No se pudo cargar la información de la página. " + error);
        }
    } else {
        window.location.href = 'index.html';
    }
});

// --- LISTENERS ---
addTaxesCheckbox.addEventListener('change', () => {
    taxesDetailsContainer.style.display = addTaxesCheckbox.checked ? 'block' : 'none';
    recalcularTotales();
});
isInvoiceCheckbox.addEventListener('change', () => {
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});
montoInput.addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);
cancelEditBtn.addEventListener('click', salirModoEdicion);
saveDraftBtn.addEventListener('click', () => guardarGasto('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarGasto('pendiente'));
categoryFilter.addEventListener('change', cargarGastos);
monthFilter.addEventListener('change', cargarGastos);

clientSelect.addEventListener('change', async () => {
    if (!adminUidGlobal) return;
    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;

    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }

    const proyectosSnapshot = await db.collection('proyectos')
        .where('adminUid', '==', adminUidGlobal)
        .where('empresaId', '==', empresaId)
        .where('status', '==', 'activo')
        .get();

    if (proyectosSnapshot.empty) {
        projectSelect.innerHTML = '<option value="">Este cliente no tiene proyectos activos</option>';
    } else {
        projectSelect.innerHTML = '<option value="">Seleccionar Proyecto</option>';
        proyectosSnapshot.forEach(doc => {
            projectSelect.innerHTML += `<option value="${doc.id}">${doc.data().nombre}</option>`;
        });
        projectSelect.disabled = false;
    }
});

// --- FUNCIONES ---

async function cargarClientesYProyectos() {
    if (!adminUidGlobal) return;
    const empresasSnapshot = await db.collection('empresas').where('adminUid', '==', adminUidGlobal).orderBy('nombre').get();
    empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));

    clientSelect.innerHTML = '<option value="">Ninguno</option>';
    empresasCargadas.forEach(empresa => {
        clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`;
    });
}

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-${userInitials}-${timestamp}`;
}

async function cargarImpuestosParaSeleccion() {
    if (!adminUidGlobal) return;
    const snapshot = await db.collection('impuestos_definiciones').where('adminUid', '==', adminUidGlobal).get();
    taxesChecklistContainer.innerHTML = '';
    if (snapshot.empty) {
        taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: var(--text-color-light);">No hay impuestos definidos.</p>';
        return;
    }
    snapshot.forEach(doc => {
        const impuesto = { id: doc.id, ...doc.data() };
        const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
        const item = document.createElement('div');
        item.classList.add('tax-item');
        item.innerHTML = `<label><input type="checkbox" data-impuesto='${JSON.stringify(impuesto)}'> ${impuesto.nombre} (${valorDisplay})</label><span class="calculated-amount"></span>`;
        taxesChecklistContainer.appendChild(item);
    });
}

function recalcularTotales() {
    const montoBruto = parseFloat(montoInput.value) || 0;
    let totalImpuestos = 0;
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        const impuesto = JSON.parse(checkbox.dataset.impuesto);
        const montoCalculado = impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
        totalImpuestos += montoCalculado;
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `$${montoCalculado.toLocaleString('es-MX')}`;
    });
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:not(:checked)').forEach(checkbox => {
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = '';
    });
    const montoNeto = montoBruto + totalImpuestos;
    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

function cargarGastoEnFormulario(gasto) {
    addExpenseForm.reset();
    addExpenseForm['expense-description'].value = gasto.descripcion || '';
    expensePlaceInput.value = gasto.establecimiento || '';
    addExpenseForm['expense-amount'].value = gasto.monto || 0;
    formCategorySelect.value = gasto.categoria || '';
    addExpenseForm['expense-date'].value = gasto.fecha || '';
    addExpenseForm['payment-method'].value = gasto.metodoPago || 'Efectivo';
    addExpenseForm['expense-comments'].value = gasto.comentarios || '';

    if (gasto.empresa) {
        const cliente = empresasCargadas.find(e => e.nombre === gasto.empresa);
        if (cliente) {
            clientSelect.value = cliente.id;
            clientSelect.dispatchEvent(new Event('change'));
            setTimeout(() => {
                projectSelect.value = gasto.proyectoId || "";
            }, 500);
        }
    }

    if (gasto.impuestos && gasto.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        const idsDeImpuestosDelGasto = gasto.impuestos.map(tax => tax.id);
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
            const impuestoData = JSON.parse(checkbox.dataset.impuesto);
            checkbox.checked = idsDeImpuestosDelGasto.includes(impuestoData.id);
        });
    } else {
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
    }
    
    if (gasto.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        document.getElementById('invoice-rfc').value = gasto.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = gasto.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }

    recalcularTotales();
    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'block';
    modoEdicion = true;
    idGastoEditando = gasto.id;
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addExpenseForm.reset();
    clientSelect.value = "";
    clientSelect.dispatchEvent(new Event('change'));
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    addTaxesCheckbox.checked = false;
    taxesDetailsContainer.style.display = 'none';
    recalcularTotales();
    saveDraftBtn.textContent = 'Guardar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'none';
    modoEdicion = false;
    idGastoEditando = null;
}

async function guardarGasto(status) {
    // --- Validaciones iniciales ---
    const user = auth.currentUser;
    if (!user || !adminUidGlobal) {
        return alert("Error de autenticación.");
    }
    const montoBruto = parseFloat(montoInput.value) || 0;
    if (montoBruto <= 0 && status !== 'borrador') { // Permite borradores con monto 0
        return alert('Por favor, introduce un monto válido.');
    }

    // --- Deshabilitar botones ---
    saveDraftBtn.disabled = true;
    sendForApprovalBtn.disabled = true;
    sendForApprovalBtn.textContent = 'Enviando...';

    try {
        let comprobanteURL = '';
        const file = receiptFileInput.files[0];

        // --- LÓGICA DE SUBIDA (CORREGIDA) ---
        if (file) {
            alert('Subiendo archivo...');

            const generarUrl = functions.httpsCallable('generarUrlDeSubida');
            const urlResult = await generarUrl({
                fileName: file.name,
                contentType: file.type
            });
            
            const { uploadUrl, filePath } = urlResult.data;

            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });

            if (!uploadResponse.ok) {
                throw new Error('La subida del archivo a Cloud Storage falló.');
            }
            
            // La corrección clave: Pedimos la URL de descarga final.
            const fileRef = firebase.storage().ref(filePath);
            comprobanteURL = await fileRef.getDownloadURL();
        }

        // --- Recopilación de datos (sin cambios) ---
        const userProfileQuery = await db.collection('usuarios').where('email', '==', user.email).limit(1).get();
        if (userProfileQuery.empty) throw "No se pudo encontrar el perfil del usuario.";
        const userProfileDoc = userProfileQuery.docs[0];
        const userName = userProfileDoc.data().nombre;

        let montoNeto = montoBruto;
        const impuestosSeleccionados = [];
        if (addTaxesCheckbox.checked) {
            let totalImpuestos = 0;
            document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
                const impuesto = JSON.parse(checkbox.dataset.impuesto);
                impuestosSeleccionados.push(impuesto);
                totalImpuestos += impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
            });
            montoNeto = montoBruto + totalImpuestos;
        }
        
        const clienteIdSeleccionado = clientSelect.value;
        const proyectoIdSeleccionado = projectSelect.value;
        const clienteSeleccionado = empresasCargadas.find(e => e.id === clienteIdSeleccionado);

        const expenseData = {
            descripcion: addExpenseForm['expense-description'].value,
            establecimiento: expensePlaceInput.value.trim(),
            monto: montoBruto,
            totalConImpuestos: montoNeto,
            impuestos: impuestosSeleccionados,
            categoria: formCategorySelect.value,
            fecha: addExpenseForm['expense-date'].value,
            empresa: clienteSeleccionado ? clienteSeleccionado.nombre : '',
            proyectoId: proyectoIdSeleccionado,
            proyectoNombre: proyectoIdSeleccionado ? projectSelect.options[projectSelect.selectedIndex].text : '',
            metodoPago: formPaymentMethodSelect.value,
            comentarios: addExpenseForm['expense-comments'].value,
            nombreCreador: userName,
            creadorId: userProfileDoc.id,
            adminUid: adminUidGlobal,
            comprobanteURL: comprobanteURL, 
        };
        
        if (isInvoiceCheckbox.checked) {
            expenseData.datosFactura = {
                rfc: document.getElementById('invoice-rfc').value,
                folioFiscal: document.getElementById('invoice-folio').value
            };
        }

        if (modoEdicion) {
            if (!comprobanteURL && idGastoEditando) {
                const docActual = await db.collection('gastos').doc(idGastoEditando).get();
                expenseData.comprobanteURL = docActual.data().comprobanteURL || '';
            }
            await db.collection('gastos').doc(idGastoEditando).update({ ...expenseData, status: status });
            alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Gasto enviado para aprobación!');
        } else {
             await db.collection('gastos').add({
                ...expenseData,
                folio: generarFolio(user.uid),
                creadoPor: user.uid,
                emailCreador: user.email,
                fechaDeCreacion: new Date(),
                status: status
            });
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado para aprobación!');
        }
        
        salirModoEdicion();

    } catch (error) {
        console.error("Error al guardar gasto: ", error);
        alert("Ocurrió un error: " + error.message);
    } finally {
        // --- Rehabilitar botones ---
        saveDraftBtn.disabled = false;
        sendForApprovalBtn.disabled = false;
        sendForApprovalBtn.textContent = 'Enviar para Aprobación';
    }
}
   
function mostrarGastos(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>No se encontraron gastos.</p>';
        return;
    }
    gastos.forEach(gasto => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = gasto.id;
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const botonEditarHTML = gasto.status === 'borrador' ? `<button class="btn-edit" data-id="${gasto.id}">Editar</button>` : '';
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${gasto.descripcion}</span>
                    <span class="expense-details">${gasto.categoria} - ${fechaFormateada}</span>
                </div>
                <div class="status-display status-${gasto.status}">${gasto.status}</div>
                <span class="expense-amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span>
                ${botonEditarHTML}
            </div>
            <div class="item-details" style="display: none;"></div>
        `;
        expenseListContainer.appendChild(itemContainer);
    });
    document.querySelectorAll('.btn-edit').forEach(button => {
        button.addEventListener('click', (e) => {
            const gastoId = e.currentTarget.dataset.id;
            const gastoAEditar = gastos.find(g => g.id === gastoId);
            if (gastoAEditar) {
                cargarGastoEnFormulario(gastoAEditar);
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
    const categorias = ["Comida", "Transporte", "Oficina", "Marketing", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
}

function cargarGastos() {
    const user = auth.currentUser;
    if (!user) return;
    let query = db.collection('gastos').where('creadoPor', '==', user.uid);
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
        const gastos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastos(gastos);
    }, error => console.error("Error al obtener gastos:", error));
}








