import { auth, db, functions, storage } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const addIncomeForm = document.getElementById('add-income-form');
const incomeListContainer = document.getElementById('income-list');
const accountSelectGroup = document.getElementById('account-select-group');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');
const formCategorySelect = document.getElementById('income-category');
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
const backButton = document.getElementById('back-button');
const cancelButton = document.getElementById('cancel-edit-btn'); // Botón Cancelar Edición

// --- ELEMENTOS DEL DOM PARA BORRADORES ---
const draftsSection = document.getElementById('drafts-section');
const draftsListContainer = document.getElementById('drafts-list');

// --- VARIABLES GLOBALES ---
let empresasCargadas = [];
let historialDeIngresos = [];
let listaDeBorradores = [];
let adminUidGlobal = null;
let modoEdicion = false;
let idIngresoEditando = null;

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        
        adminUidGlobal = userData.rol === 'admin' ? user.uid : userData.adminUid;

        if (!adminUidGlobal) {
            alert("Error: No se pudo identificar al administrador principal.");
            return;
        }

        if (userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
            if (accountSelectGroup) accountSelectGroup.style.display = 'none';
            if (accountSelect) accountSelect.required = false;
            if (addApprovedBtn) addApprovedBtn.textContent = 'Enviar para Aprobación';
        } else {
            backButton.href = 'dashboard.html';
        }

        cargarClientesYProyectos(adminUidGlobal);
        poblarFiltrosYCategorias();
        cargarCuentasEnSelector(adminUidGlobal);
        cargarImpuestosParaSeleccion(adminUidGlobal);
        cargarIngresosAprobados(adminUidGlobal, userData.rol);
        cargarBorradores(); // Carga borradores
        
        // Listeners para los filtros del historial
        categoryFilter.onchange = () => filtrarYMostrarIngresos();
        monthFilter.onchange = () => filtrarYMostrarIngresos();
        recalcularTotales();
        
    } else {
        window.location.href = 'index.html';
    }
});

// --- LISTENERS DEL FORMULARIO ---
addTaxesCheckbox.addEventListener('change', () => {
    taxesDetailsContainer.style.display = addTaxesCheckbox.checked ? 'block' : 'none';
    recalcularTotales();
});

isInvoiceCheckbox.addEventListener('change', () => {
    if (isInvoiceCheckbox.checked) {
        invoiceDetailsContainer.style.display = 'block';
        if (!document.getElementById('invoice-rfc')) {
             invoiceDetailsContainer.innerHTML = `
                <div class="input-group"><label for="invoice-rfc">RFC</label><input type="text" id="invoice-rfc"></div>
                <div class="input-group"><label for="invoice-folio">Folio Fiscal</label><input type="text" id="invoice-folio"></div>
            `;
        }
    } else {
        invoiceDetailsContainer.style.display = 'none';
    }
});

montoInput.addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);
saveDraftBtn.addEventListener('click', () => guardarIngresoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarIngresoAdmin('aprobado'));

clientSelect.addEventListener('change', async () => {
    if (!adminUidGlobal) return;
    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;
    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }
    const proyectosSnapshot = await db.collection('proyectos').where('empresaId', '==', empresaId).where('status', '==', 'activo').where('adminUid', '==', adminUidGlobal).get();
    if (proyectosSnapshot.empty) {
        projectSelect.innerHTML = '<option value="">Este cliente no tiene proyectos activos</option>';
    } else {
        projectSelect.innerHTML = '<option value="">Seleccionar Proyecto</option>';
        proyectosSnapshot.forEach(doc => { projectSelect.innerHTML += `<option value="${doc.id}">${doc.data().nombre}</option>`; });
        projectSelect.disabled = false;
    }
});

// Listener para el botón "Cancelar Edición"
if (cancelButton) {
    cancelButton.addEventListener('click', salirModoEdicion);
}

// --- FUNCIONES ---

async function cargarClientesYProyectos(adminUid) {
    const empresasSnapshot = await db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get();
    empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));
    clientSelect.innerHTML = '<option value="">Ninguno</option>';
    empresasCargadas.forEach(empresa => { clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`; });
}

function generarFolio(userId) { return `INC-ADM-${userId.substring(0, 4).toUpperCase()}-${Date.now()}`; }

function cargarCuentasEnSelector(adminUid) {
    // Para ingresos, solo mostramos cuentas de débito
    db.collection('cuentas').where('adminUid', '==', adminUid).where('tipo', '==', 'debito').orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            accountSelect.appendChild(new Option(`${cuenta.nombre} (Saldo: $${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`, doc.id));
        });
        if (selectedValue && accountSelect.querySelector(`option[value="${selectedValue}"]`)) {
             accountSelect.value = selectedValue;
        }
    });
}


async function cargarImpuestosParaSeleccion(adminUid) {
    if (!adminUid) {
        console.error("No se proporcionó un adminUid para cargar los impuestos.");
        return;
    }
    try {
        const snapshot = await db.collection('impuestos_definiciones')
            .where('adminUid', '==', adminUid)
            .get();
        taxesChecklistContainer.innerHTML = '';
        if (snapshot.empty) {
            taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: #aeb9c5;">No hay impuestos definidos por el administrador.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const impuesto = { id: doc.id, ...doc.data() };
            const valorDisplay = impuesto.tipo === 'porcentaje' ? `${impuesto.valor}%` : `$${impuesto.valor}`;
            const item = document.createElement('div');
            item.classList.add('tax-item');
            item.innerHTML = `
                <label>
                    <input type="checkbox" data-impuesto='${JSON.stringify(impuesto)}'> 
                    ${impuesto.nombre} (${valorDisplay})
                </label>
                <span class="calculated-amount"></span>
            `;
            taxesChecklistContainer.appendChild(item);
        });
    } catch (error) {
        console.error("Error al obtener los impuestos de Firestore:", error);
        taxesChecklistContainer.innerHTML = '<p style="color:red;">Error al cargar impuestos. Revisa la consola.</p>';
    }
}

function recalcularTotales() {
    const montoBruto = parseFloat(montoInput.value) || 0;
    let totalImpuestos = 0; // En ingresos, los impuestos se restan (retenciones)
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        const impuesto = JSON.parse(checkbox.dataset.impuesto);
        const montoCalculado = impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
        totalImpuestos += montoCalculado;
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `-$${montoCalculado.toLocaleString('es-MX')}`;
    });
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:not(:checked)').forEach(checkbox => {
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = '';
    });
    const montoNeto = montoBruto - totalImpuestos; // Se resta
    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `-$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

// --- COPIADA DESDE empleado_ingresos.app.js ---
function cargarIngresoEnFormulario(ingreso) {
    addIncomeForm.reset();
    addIncomeForm['income-description'].value = ingreso.descripcion || '';
    incomePlaceInput.value = ingreso.establecimiento || '';
    addIncomeForm['income-amount'].value = ingreso.monto || 0;
    formCategorySelect.value = ingreso.categoria || '';
    addIncomeForm['income-date'].value = ingreso.fecha || '';
    addIncomeForm['payment-method'].value = ingreso.metodoPago || 'Transferencia'; // Ajustado el default
    addIncomeForm['income-comments'].value = ingreso.comentarios || '';

    // Lógica cliente/proyecto
    if (ingreso.empresa && empresasCargadas.length > 0) {
        const cliente = empresasCargadas.find(e => e.nombre === ingreso.empresa);
        if (cliente) {
            clientSelect.value = cliente.id;
            clientSelect.dispatchEvent(new Event('change'));
            setTimeout(() => {
                projectSelect.value = ingreso.proyectoId || "";
            }, 500);
        } else {
             clientSelect.value = "";
             projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
             projectSelect.disabled = true;
        }
    } else {
         clientSelect.value = "";
         projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
         projectSelect.disabled = true;
    }

    // Lógica impuestos
    if (ingreso.impuestos && ingreso.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
        const idsDeImpuestos = ingreso.impuestos.map(tax => tax.id);
        idsDeImpuestos.forEach(taxId => {
            const checkbox = document.querySelector(`#taxes-checklist input[data-impuesto*='"id":"${taxId}"']`);
            if (checkbox) checkbox.checked = true;
        });
    } else {
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
    }

    // Lógica factura
    if (ingreso.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
        if (!document.getElementById('invoice-rfc')) {
             invoiceDetailsContainer.innerHTML = `
                <div class="input-group"><label for="invoice-rfc">RFC</label><input type="text" id="invoice-rfc"></div>
                <div class="input-group"><label for="invoice-folio">Folio Fiscal</label><input type="text" id="invoice-folio"></div>
            `;
        }
        document.getElementById('invoice-rfc').value = ingreso.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = ingreso.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }

    // Seleccionamos cuenta si es aprobada (solo Admin)
    if (ingreso.status === 'aprobado' && ingreso.cuentaId) {
        accountSelect.value = ingreso.cuentaId;
    }

    recalcularTotales();
    saveDraftBtn.textContent = 'Actualizar Borrador';
    // Ajustamos texto botón principal
    const user = auth.currentUser;
    if(user) {
        db.collection('usuarios').doc(user.uid).get().then(userDoc => {
            if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                addApprovedBtn.textContent = 'Guardar y Enviar para Aprobación';
            } else {
                 addApprovedBtn.textContent = 'Guardar Cambios'; // Cambiado para edición
            }
        });
    }
    if (cancelButton) cancelButton.style.display = 'block'; // Muestra botón Cancelar
    modoEdicion = true;
    idIngresoEditando = ingreso.id;
    window.scrollTo(0, 0);
}

// --- COPIADA DESDE empleado_ingresos.app.js (con ajustes) ---
function salirModoEdicion() {
    addIncomeForm.reset();
    clientSelect.value = "";
    projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
    projectSelect.disabled = true;
    isInvoiceCheckbox.checked = false;
    invoiceDetailsContainer.style.display = 'none';
    addTaxesCheckbox.checked = false;
    taxesDetailsContainer.style.display = 'none';
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
    recalcularTotales();
    saveDraftBtn.textContent = 'Guardar Borrador';
    
    // Restauramos texto botón principal
    const user = auth.currentUser;
    if(user) {
        db.collection('usuarios').doc(user.uid).get().then(userDoc => {
            if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                addApprovedBtn.textContent = 'Enviar para Aprobación';
            } else {
                addApprovedBtn.textContent = 'Agregar Ingreso Aprobado';
            }
        });
    }
    
    // Ocultamos botón Cancelar
    if (cancelButton) cancelButton.style.display = 'none';

    modoEdicion = false;
    idIngresoEditando = null;
}

// --- FUNCIÓN guardarIngresoAdmin MODIFICADA ---
async function guardarIngresoAdmin(statusDeseado) {
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación");

    const montoBruto = parseFloat(montoInput.value) || 0;
    if (montoBruto <= 0 && statusDeseado !== 'borrador') {
        return alert('Por favor, introduce un monto válido.');
    }

    saveDraftBtn.disabled = true;
    addApprovedBtn.disabled = true;
    addApprovedBtn.textContent = 'Procesando...';

    try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : { rol: 'admin', nombre: 'Administrador' };
        
        // Determinamos estado final
        let finalStatus = statusDeseado;
        if (userData.rol === 'coadmin' && statusDeseado === 'aprobado') {
            finalStatus = 'pendiente';
        }
        if (modoEdicion && userData.rol === 'admin') {
             if (statusDeseado === 'borrador') {
                 finalStatus = 'borrador';
             } else {
                 const docActual = await db.collection('ingresos').doc(idIngresoEditando).get();
                 finalStatus = docActual.data()?.status || 'pendiente';
                 if (docActual.data()?.status === 'borrador' && statusDeseado === 'aprobado') {
                     finalStatus = 'pendiente';
                 }
             }
        }

        // Validaciones
        const cuentaId = accountSelect.value;
        if (finalStatus === 'aprobado' && userData.rol === 'admin' && !cuentaId) {
            throw new Error('Por favor, selecciona una cuenta de destino para un ingreso aprobado.');
        }

        // Subida de archivo
        let comprobanteURL = '';
        const file = receiptFileInput.files[0];
        if (file) {
            // ... (tu lógica de subida de archivo) ...
            const generarUrl = functions.httpsCallable('generarUrlDeSubida');
            const urlResult = await generarUrl({ fileName: file.name, contentType: file.type });
            const { uploadUrl, filePath } = urlResult.data;
            await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
            const fileRef = storage.ref(filePath);
            comprobanteURL = await fileRef.getDownloadURL();
        }

        // Recopilación de datos
        let montoNeto = montoBruto;
        const impuestosSeleccionados = [];
        if (addTaxesCheckbox.checked) {
             // ... (tu lógica de cálculo de impuestos, restando para ingresos) ...
            let totalImpuestos = 0;
            document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
                const impuesto = JSON.parse(checkbox.dataset.impuesto);
                impuestosSeleccionados.push(impuesto);
                totalImpuestos += impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
            });
            montoNeto = montoBruto - totalImpuestos;
        }
        const clienteSeleccionado = empresasCargadas.find(e => e.id === clientSelect.value);

        const incomeData = {
            descripcion: addIncomeForm['income-description'].value,
            establecimiento: incomePlaceInput.value.trim(),
            monto: montoBruto,
            totalConImpuestos: montoNeto,
            impuestos: impuestosSeleccionados,
            categoria: formCategorySelect.value,
            fecha: addIncomeForm['income-date'].value,
            empresa: clienteSeleccionado ? clienteSeleccionado.nombre : '',
            metodoPago: addIncomeForm['payment-method'].value,
            comentarios: addIncomeForm['income-comments'].value,
            nombreCreador: userData.nombre,
            creadorId: user.uid,
            adminUid: adminUidGlobal, // Usamos variable global
            status: finalStatus,
            cuentaId: finalStatus === 'aprobado' ? cuentaId : '',
            cuentaNombre: finalStatus === 'aprobado' && cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : '',
            proyectoId: projectSelect.value,
            proyectoNombre: projectSelect.value ? projectSelect.options[projectSelect.selectedIndex].text : '',
            comprobanteURL: comprobanteURL
        };

        if (isInvoiceCheckbox.checked) {
             const rfcInput = document.getElementById('invoice-rfc');
             const folioInput = document.getElementById('invoice-folio');
             incomeData.datosFactura = { 
                 rfc: rfcInput ? rfcInput.value : '', 
                 folioFiscal: folioInput ? folioInput.value : '' 
             };
        }

        // --- LÓGICA DE GUARDADO/ACTUALIZACIÓN ---
        if (modoEdicion && idIngresoEditando) {
            // Actualizar
            if (!comprobanteURL) {
                const docActual = await db.collection('ingresos').doc(idIngresoEditando).get();
                incomeData.comprobanteURL = docActual.data()?.comprobanteURL || '';
            }
            await db.collection('ingresos').doc(idIngresoEditando).update(incomeData);
            alert('¡Ingreso actualizado!');
            // (No afectamos saldo al editar)

        } else {
            // Crear nuevo
            incomeData.folio = generarFolio(user.uid);
            incomeData.creadoPor = user.uid;
            incomeData.emailCreador = user.email;
            incomeData.fechaDeCreacion = new Date();

            if (finalStatus === 'borrador' || finalStatus === 'pendiente') {
                await db.collection('ingresos').add(incomeData);
                alert(finalStatus === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado para aprobación!');
            } else { // Admin creando directo como aprobado
                const cuentaRef = db.collection('cuentas').doc(cuentaId);
                const newIncomeRef = db.collection('ingresos').doc(); // Generamos ID
                incomeData.id = newIncomeRef.id; // Guardamos ID

                await db.runTransaction(async (transaction) => {
                    const cuentaDoc = await transaction.get(cuentaRef);
                    if (!cuentaDoc.exists) throw "La cuenta no existe.";
                    // Ingresos solo van a cuentas de débito
                    if (cuentaDoc.data().tipo !== 'debito') throw "Los ingresos solo pueden ir a cuentas de débito.";
                    const nuevoSaldo = (cuentaDoc.data().saldoActual || 0) + montoNeto;
                    transaction.set(newIncomeRef, incomeData);
                    transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
                     // (Aquí podríamos añadir la lógica para impuestos retenidos si es necesario)
                });
                alert('¡Ingreso registrado y saldo de cuenta actualizado!');
            }
        }
        
        salirModoEdicion(); // Limpia formulario y resetea estado
        
    } catch (error) {
        console.error("Error al guardar el ingreso:", error);
        alert("Error: " + error.message);
    } finally {
        saveDraftBtn.disabled = false;
        addApprovedBtn.disabled = false;
        // Restauramos texto del botón principal
        salirModoEdicion(); // Llama de nuevo para asegurar texto
    }
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

async function cargarIngresosAprobados(adminUid, rol) {
    if (!adminUid) return;
    incomeListContainer.innerHTML = '<p>Cargando historial...</p>';

    try {
        const obtenerHistorial = functions.httpsCallable('obtenerHistorialIngresos');
        const resultado = await obtenerHistorial({ adminUid: adminUid, rol: rol });
        
        // Excluimos borradores
        historialDeIngresos = resultado.data.ingresos.filter(i => i.status !== 'borrador');
        filtrarYMostrarIngresos();

    } catch (error) {
        console.error("Error al llamar a la función obtenerHistorialIngresos:", error);
        alert("Error al cargar el historial: " + error.message);
        incomeListContainer.innerHTML = `<p class="error-message">No se pudo cargar el historial.</p>`;
    }
}

function filtrarYMostrarIngresos() {
    let ingresosFiltrados = [...historialDeIngresos]; // Usamos lista sin borradores

    const selectedCategory = categoryFilter.value;
    if (selectedCategory && selectedCategory !== 'todos') {
        ingresosFiltrados = ingresosFiltrados.filter(ing => ing.categoria === selectedCategory);
    }

    const selectedMonth = monthFilter.value;
    if (selectedMonth && selectedMonth !== 'todos') {
        ingresosFiltrados = ingresosFiltrados.filter(ing => ing.fecha.startsWith(selectedMonth));
    }
    
    mostrarIngresosAprobados(ingresosFiltrados);
}

function mostrarIngresosAprobados(ingresos) {
    incomeListContainer.innerHTML = '';
    if (ingresos.length === 0) {
        incomeListContainer.innerHTML = '<p>No se encontraron ingresos con los filtros seleccionados.</p>';
        return;
    }
    ingresos.forEach(ingreso => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        itemContainer.dataset.id = ingreso.id;
        const fechaFormateada = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = (ingreso.nombreCreador !== "Administrador" && ingreso.creadorId) ? `<a href="perfil_empleado.html?id=${ingreso.creadorId}">${ingreso.nombreCreador}</a>` : (ingreso.nombreCreador || "Sistema");
        const iconoComprobante = ingreso.comprobanteURL ? `<a href="${ingreso.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';

        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${ingreso.descripcion}${iconoComprobante}</span>
                    <span class="expense-details">Registrado por: ${creadorLink} | ${ingreso.categoria} - ${fechaFormateada} | Estado: ${ingreso.status}</span>
                </div>
                <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
            </div>
            <div class="item-details" style="display: none;">
                </div>`;
        incomeListContainer.appendChild(itemContainer);
    });
}

// (Listener de click en historial ya no es necesario)

// =========== FUNCIONES PARA BORRADORES (ADMIN/COADMIN) ===========

function cargarBorradores() {
    const user = auth.currentUser;
    if (!user || !adminUidGlobal) return;

    db.collection('ingresos') // Colección ingresos
        .where('adminUid', '==', adminUidGlobal) 
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

// Listener para Editar y Borrar Borradores
draftsListContainer.addEventListener('click', async (e) => {
    const draftId = e.target.dataset.id;
    if (!draftId) return;

    if (e.target.classList.contains('btn-edit')) {
        const draftAEditar = listaDeBorradores.find(d => d.id === draftId);
        if (draftAEditar) {
            cargarIngresoEnFormulario(draftAEditar); // Llamamos a la función copiada
            if (cancelButton) cancelButton.style.display = 'block'; 
        }
    }

    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar este borrador?')) {
            try {
                await db.collection('ingresos').doc(draftId).delete(); // Colección ingresos
                alert('Borrador eliminado.');
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
