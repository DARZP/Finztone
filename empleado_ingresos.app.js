import { auth, db, functions, storage } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const saveDraftBtn = document.getElementById('save-draft-btn');
const sendForApprovalBtn = document.getElementById('send-for-approval-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const formCategorySelect = document.getElementById('income-category');
const formPaymentMethodSelect = document.getElementById('payment-method');
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const montoInput = document.getElementById('income-amount');
const summaryBruto = document.getElementById('summary-bruto');
const summaryImpuestos = document.getElementById('summary-impuestos');
const summaryNeto = document.getElementById('summary-neto');
const incomePlaceInput = document.getElementById('income-place');
const clientSelect = document.getElementById('client-select');
const projectSelect = document.getElementById('project-select');
const receiptFileInput = document.getElementById('receipt-file');

// --- NUEVOS ELEMENTOS DEL DOM PARA BORRADORES ---
const draftsSection = document.getElementById('drafts-section');
const draftsListContainer = document.getElementById('drafts-list');

// --- VARIABLES GLOBALES ---
let empresasCargadas = [];
let modoEdicion = false;
let idIngresoEditando = null;
let adminUidGlobal = null;
let listaDeBorradores = []; // <--- NUEVA

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
            cargarIngresos();
            cargarImpuestosParaSeleccion();
            recalcularTotales();
            cargarBorradores(); // <--- NUEVA LLAMADA

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
saveDraftBtn.addEventListener('click', () => guardarIngreso('borrador'));
sendForApprovalBtn.addEventListener('click', () => guardarIngreso('pendiente'));
categoryFilter.addEventListener('change', cargarIngresos);
monthFilter.addEventListener('change', cargarIngresos);

clientSelect.addEventListener('change', async () => {
    if (!adminUidGlobal) return;
    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;

    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }

    // (Código ya corregido en el turno anterior)
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
    return `INC-${userInitials}-${timestamp}`;
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
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `-$${montoCalculado.toLocaleString('es-MX')}`;
    });
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:not(:checked)').forEach(checkbox => {
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = '';
    });
    const montoNeto = montoBruto - totalImpuestos;
    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `-$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

function cargarIngresoEnFormulario(ingreso) {
    addIncomeForm.reset();
    addIncomeForm['income-description'].value = ingreso.descripcion || '';
    incomePlaceInput.value = ingreso.establecimiento || '';
    addIncomeForm['income-amount'].value = ingreso.monto || 0;
    formCategorySelect.value = ingreso.categoria || '';
    addIncomeForm['income-date'].value = ingreso.fecha || '';
    formPaymentMethodSelect.value = ingreso.metodoPago || 'Efectivo';
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
    if (ingreso.impuestos && ingreso.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => {
            const impuestoData = JSON.parse(checkbox.dataset.impuesto);
            checkbox.checked = ingreso.impuestos.some(tax => tax.id === impuestoData.id);
        });
    } else {
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
    }
    recalcularTotales();
    saveDraftBtn.textContent = 'Actualizar Borrador';
    sendForApprovalBtn.style.display = 'block';
    cancelEditBtn.style.display = 'block';
    modoEdicion = true;
    idIngresoEditando = ingreso.id;
    window.scrollTo(0, 0);
}

function salirModoEdicion() {
    addIncomeForm.reset();
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
    idIngresoEditando = null;
}

async function guardarIngreso(status) {
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación.");
    const montoBruto = parseFloat(addIncomeForm['income-amount'].value) || 0;
    if (montoBruto <= 0) return alert('Por favor, introduce un monto válido.');

    saveDraftBtn.disabled = true;
    sendForApprovalBtn.disabled = true;
    sendForApprovalBtn.textContent = 'Enviando...';

    try {
        let comprobanteURL = '';
        const file = receiptFileInput.files[0];

        if (file) {
            alert('Subiendo archivo...');

            const generarUrl = functions.httpsCallable('generarUrlDeSubida');
            const urlResult = await generarUrl({ fileName: file.name, contentType: file.type });
            const { uploadUrl, filePath } = urlResult.data;

            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });

            if (!uploadResponse.ok) throw new Error('La subida del archivo falló.');

            const fileRef = storage.ref(filePath);
            comprobanteURL = await fileRef.getDownloadURL();
        }

        const userProfileQuery = await db.collection('usuarios').where('email', '==', user.email).limit(1).get();
        if (userProfileQuery.empty) throw new Error("No se pudo encontrar el perfil del usuario.");
        const userProfileDoc = userProfileQuery.docs[0];
        const userProfileData = userProfileDoc.data();
        const userName = userProfileData.nombre;
        const adminUid = userProfileData.adminUid;

        let montoNeto = montoBruto;
        const impuestosSeleccionados = [];
        if (addTaxesCheckbox.checked) {
            let totalImpuestos = 0;
            document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
                const impuesto = JSON.parse(checkbox.dataset.impuesto);
                impuestosSeleccionados.push(impuesto);
                totalImpuestos += impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
            });
            montoNeto = montoBruto - totalImpuestos;
        }

        const clienteIdSeleccionado = clientSelect.value;
        const proyectoIdSeleccionado = projectSelect.value;
        const clienteSeleccionado = empresasCargadas.find(e => e.id === clienteIdSeleccionado);

        const incomeData = {
            descripcion: addIncomeForm['income-description'].value,
            establecimiento: incomePlaceInput.value.trim(),
            monto: montoBruto,
            totalConImpuestos: montoNeto,
            impuestos: impuestosSeleccionados,
            categoria: formCategorySelect.value,
            fecha: addIncomeForm['income-date'].value,
            empresa: clienteSeleccionado ? clienteSeleccionado.nombre : '',
            metodoPago: formPaymentMethodSelect.value,
            comentarios: addIncomeForm['income-comments'].value,
            nombreCreador: userName,
            creadorId: userProfileDoc.id,
            adminUid: adminUid,
            proyectoId: proyectoIdSeleccionado,
            proyectoNombre: proyectoIdSeleccionado ? projectSelect.options[projectSelect.selectedIndex].text : '',
            comprobanteURL: comprobanteURL,
        };

        if (isInvoiceCheckbox.checked) {
            incomeData.datosFactura = {
                rfc: document.getElementById('invoice-rfc').value,
                folioFiscal: document.getElementById('invoice-folio').value
            };
        }

        if (modoEdicion) {
            await db.collection('ingresos').doc(idIngresoEditando).update({ ...incomeData, status: status });
            alert(status === 'borrador' ? '¡Borrador actualizado!' : '¡Ingreso enviado!');
        } else {
            await db.collection('ingresos').add({
                ...incomeData,
                folio: generarFolio(user.uid),
                creadoPor: user.uid,
                emailCreador: user.email,
                fechaDeCreacion: new Date(),
                status: status
            });
            alert(status === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado!');
        }

        salirModoEdicion();

    } catch (error) {
        console.error("Error al guardar ingreso:", error);
        alert("Ocurrió un error: " + error.message);
    } finally {
        saveDraftBtn.disabled = false;
        sendForApprovalBtn.disabled = false;
        sendForApprovalBtn.textContent = 'Enviar para Aprobación';
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
        
        // (Botón de editar quitado de aquí)
        
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}</span>
                    <span class="expense-details">${ingreso.categoria} - ${fechaFormateada}</span>
                </div>
                <div class="status-display status-${ingreso.status}">${ingreso.status}</div>
                <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
            </div>
            <div class="item-details" style="display: none;"></div>`;
        incomeListContainer.appendChild(itemContainer);
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
    let paymentOptionsHTML = '';
    const metodosPago = ["Transferencia", "Efectivo", "Tarjeta de Crédito"];

    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    metodosPago.forEach(met => {
        paymentOptionsHTML += `<option value="${met}">${met}</option>`;
    });

    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
    formPaymentMethodSelect.innerHTML = paymentOptionsHTML;
}

// (Función cargarIngresos modificada en el turno anterior para usar Cloud Function)
async function cargarIngresos() {
    const user = auth.currentUser;
    if (!user || !adminUidGlobal) return;

    try {
        const obtenerHistorial = functions.httpsCallable('obtenerHistorialIngresos');
        const resultado = await obtenerHistorial({ adminUid: adminUidGlobal, rol: 'empleado' });

        // Filtramos solo los de este empleado Y que NO sean borradores
        const misIngresos = resultado.data.ingresos.filter(ingreso => ingreso.creadorId === user.uid && ingreso.status !== 'borrador');

        let ingresosFiltrados = [...misIngresos];

        if (categoryFilter.value && categoryFilter.value !== 'todos') {
            ingresosFiltrados = ingresosFiltrados.filter(i => i.categoria === categoryFilter.value);
        }
        if (monthFilter.value && monthFilter.value !== 'todos') {
            const [year, month] = monthFilter.value.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0, 23, 59, 59).toISOString().split('T')[0];
            ingresosFiltrados = ingresosFiltrados.filter(i => i.fecha >= startDate && i.fecha <= endDate);
        }

        mostrarIngresos(ingresosFiltrados);

    } catch (error) {
        console.error("Error al obtener ingresos desde Cloud Function:", error);
        incomeListContainer.innerHTML = '<p>Ocurrió un error al cargar el historial.</p>';
    }
}

// =========== FUNCIONES NUEVAS PARA BORRADORES (EMPLEADO) ===========

function cargarBorradores() {
    const user = auth.currentUser;
    // ¡Usamos las variables globales!
    if (!user || !adminUidGlobal) return;

    db.collection('ingresos') // <--- Colección 'ingresos'
        .where('adminUid', '==', adminUidGlobal) // <--- LA CORRECCIÓN CLAVE
        .where('creadoPor', '==', user.uid)
        .where('status', '==', 'borrador')
        .orderBy('fechaDeCreacion', 'desc')
        .onSnapshot(snapshot => {
            listaDeBorradores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            mostrarBorradores();
        }, error => {
            console.error("Error al cargar borradores (revisa tus reglas de Firestore):", error);
            draftsSection.style.display = 'none';
        });
}

function mostrarBorradores() {
    if (listaDeBorradores.length === 0) {
        draftsSection.style.display = 'none';
        return;
    }
    
    draftsSection.style.display = 'block';
    draftsListContainer.innerHTML = '';

    listaDeBorradores.forEach(draft => {
        const fecha = draft.fecha ? new Date(draft.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES') : 'Sin fecha';
        const draftElement = document.createElement('div');
        draftElement.classList.add('draft-item');
        draftElement.innerHTML = `
            <div class="draft-info">
                <div class="draft-description">${draft.descripcion || 'Borrador sin descripción'}</div>
                <div class="draft-date">${fecha} - $${(draft.monto || 0).toLocaleString('es-MX')}</div>
            </div>
            <div class="draft-actions">
                <button class="btn-edit" data-id="${draft.id}">Editar</button>
                <button class="btn-delete" data-id="${draft.id}">Borrar</button>
            </div>
        `;
        draftsListContainer.appendChild(draftElement);
    });
}

// Listener para los botones de Editar y Borrar
draftsListContainer.addEventListener('click', async (e) => {
    const draftId = e.target.dataset.id;
    if (!draftId) return;

    // BOTÓN EDITAR
    if (e.target.classList.contains('btn-edit')) {
        const draftAEditar = listaDeBorradores.find(d => d.id === draftId);
        if (draftAEditar) {
            cargarIngresoEnFormulario(draftAEditar); // Usamos la función existente
        }
    }

    // BOTÓN BORRAR
    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar este borrador?')) {
            try {
                await db.collection('ingresos').doc(draftId).delete(); // <--- Colección 'ingresos'
                alert('Borrador eliminado.');
                // Salimos del modo edición si estábamos editando este borrador
                if (modoEdicion && idIngresoEditando === draftId) {
                    salirModoEdicion();
                }
            } catch (error) {
                console.error("Error al borrar borrador:", error);
                alert('No se pudo eliminar el borrador.');
            }
        }
    }
});
