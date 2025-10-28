import { auth, db, functions, storage } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');
const accountSelectGroup = document.getElementById('account-select-group');
const isInvoiceCheckbox = document.getElementById('is-invoice');
const invoiceDetailsContainer = document.getElementById('invoice-details');
const categoryFilter = document.getElementById('category-filter');
const monthFilter = document.getElementById('month-filter');
const accountSelect = document.getElementById('account-select');
const taxesChecklistContainer = document.getElementById('taxes-checklist');
const saveDraftBtn = document.getElementById('save-draft-btn');
const addApprovedBtn = document.getElementById('add-approved-btn');
const formCategorySelect = document.getElementById('expense-category');
const addTaxesCheckbox = document.getElementById('add-taxes-checkbox');
const taxesDetailsContainer = document.getElementById('taxes-details-container');
const paymentMethodSelect = document.getElementById('payment-method');
const expensePlaceInput = document.getElementById('expense-place');
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
let historialDeGastos = [];
let listaDeBorradores = [];
let adminUidGlobal = null;
let modoEdicion = false;
let idGastoEditando = null;

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
        cargarGastosAprobados(adminUidGlobal); 
        cargarBorradores(); // Carga borradores después de datos iniciales

        // Listeners para los filtros del historial
        categoryFilter.onchange = () => filtrarYMostrarGastos();
        monthFilter.onchange = () => filtrarYMostrarGastos();
        
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
    // (Aseguramos que existan los inputs antes de usarlos)
    if (isInvoiceCheckbox.checked) {
        invoiceDetailsContainer.style.display = 'block';
        // Creamos los inputs si no existen (puede pasar al editar borrador)
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


paymentMethodSelect.addEventListener('change', () => {
    const metodo = paymentMethodSelect.value;
    if (metodo === 'Tarjeta de Crédito') {
        cargarCuentasEnSelector(adminUidGlobal, 'credito');
    } else {
        cargarCuentasEnSelector(adminUidGlobal); // Carga todas por defecto (débito incluidas)
    }
});

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
        .where('empresaId', '==', empresaId)
        .where('adminUid', '==', adminUidGlobal) 
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

saveDraftBtn.addEventListener('click', () => guardarGastoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarGastoAdmin('aprobado'));
document.getElementById('expense-amount').addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);

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

function generarFolio(userId) {
    return `EXP-ADM-${userId.substring(0, 4).toUpperCase()}-${Date.now()}`;
}

function cargarCuentasEnSelector(adminUid, tipo = null) {
    let query = db.collection('cuentas').where('adminUid', '==', adminUid);
    if (tipo) {
        query = query.where('tipo', '==', tipo);
    }
    query.orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const esCredito = cuenta.tipo === 'credito';
            const etiqueta = esCredito ? 'Crédito' : 'Débito';
            // Mostramos saldo solo si no es crédito
            const displaySaldo = esCredito ? '' : ` (Saldo: $${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`;
            accountSelect.appendChild(new Option(`${cuenta.nombre} (${etiqueta})${displaySaldo}`, doc.id));
        });
        // Intentamos re-seleccionar la cuenta si ya había una
        if (selectedValue && accountSelect.querySelector(`option[value="${selectedValue}"]`)) {
             accountSelect.value = selectedValue;
        }
    });
}


async function cargarImpuestosParaSeleccion(adminUid) {
    const snapshot = await db.collection('impuestos_definiciones').where('adminUid', '==', adminUid).get();
    taxesChecklistContainer.innerHTML = '';
    if (snapshot.empty) {
        taxesChecklistContainer.innerHTML = '<p style="font-size: 0.9em; color: #aeb9c5;">No hay impuestos definidos.</p>';
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
    const montoBruto = parseFloat(document.getElementById('expense-amount').value) || 0;
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
    document.getElementById('summary-bruto').textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    document.getElementById('summary-impuestos').textContent = `$${totalImpuestos.toLocaleString('es-MX')}`;
    document.getElementById('summary-neto').textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

// --- COPIADA DESDE empleado_gastos.app.js ---
function cargarGastoEnFormulario(gasto) {
    addExpenseForm.reset();
    addExpenseForm['expense-description'].value = gasto.descripcion || '';
    expensePlaceInput.value = gasto.establecimiento || '';
    addExpenseForm['expense-amount'].value = gasto.monto || 0;
    formCategorySelect.value = gasto.categoria || '';
    addExpenseForm['expense-date'].value = gasto.fecha || '';
    paymentMethodSelect.value = gasto.metodoPago || 'Efectivo'; // Usamos paymentMethodSelect
    addExpenseForm['expense-comments'].value = gasto.comentarios || '';

    // Lógica para seleccionar cliente y proyecto (si existen)
    if (gasto.empresa && empresasCargadas.length > 0) {
        const cliente = empresasCargadas.find(e => e.nombre === gasto.empresa);
        if (cliente) {
            clientSelect.value = cliente.id;
            clientSelect.dispatchEvent(new Event('change'));
            setTimeout(() => {
                projectSelect.value = gasto.proyectoId || "";
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

    // Lógica para marcar impuestos seleccionados
    if (gasto.impuestos && gasto.impuestos.length > 0) {
        addTaxesCheckbox.checked = true;
        taxesDetailsContainer.style.display = 'block';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
        const idsDeImpuestosDelGasto = gasto.impuestos.map(tax => tax.id);
        idsDeImpuestosDelGasto.forEach(taxId => {
            const checkbox = document.querySelector(`#taxes-checklist input[data-impuesto*='"id":"${taxId}"']`);
            if (checkbox) checkbox.checked = true;
        });
    } else {
        addTaxesCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';
        document.querySelectorAll('#taxes-checklist input[type="checkbox"]').forEach(checkbox => checkbox.checked = false);
    }

    // Lógica para datos de factura
    if (gasto.datosFactura) {
        isInvoiceCheckbox.checked = true;
        invoiceDetailsContainer.style.display = 'block';
         // Creamos los inputs si no existen
        if (!document.getElementById('invoice-rfc')) {
             invoiceDetailsContainer.innerHTML = `
                <div class="input-group"><label for="invoice-rfc">RFC</label><input type="text" id="invoice-rfc"></div>
                <div class="input-group"><label for="invoice-folio">Folio Fiscal</label><input type="text" id="invoice-folio"></div>
            `;
        }
        document.getElementById('invoice-rfc').value = gasto.datosFactura.rfc || '';
        document.getElementById('invoice-folio').value = gasto.datosFactura.folioFiscal || '';
    } else {
        isInvoiceCheckbox.checked = false;
        invoiceDetailsContainer.style.display = 'none';
    }

    // Seleccionamos la cuenta de origen si existe y es aprobada (solo para Admin)
    if (gasto.status === 'aprobado' && gasto.cuentaId) {
        accountSelect.value = gasto.cuentaId;
    }

    recalcularTotales();
    saveDraftBtn.textContent = 'Actualizar Borrador';
    // Ajustamos texto del botón principal
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
    idGastoEditando = gasto.id;
    window.scrollTo(0, 0);
}

// --- COPIADA DESDE empleado_gastos.app.js (con ajustes) ---
function salirModoEdicion() {
    addExpenseForm.reset();
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
    
    // Restauramos texto del botón principal
    const user = auth.currentUser;
    if(user) {
        db.collection('usuarios').doc(user.uid).get().then(userDoc => {
            if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                addApprovedBtn.textContent = 'Enviar para Aprobación';
            } else {
                addApprovedBtn.textContent = 'Agregar Gasto Aprobado';
            }
        });
    }
    
    // Ocultamos botón Cancelar
    if (cancelButton) cancelButton.style.display = 'none';

    modoEdicion = false;
    idGastoEditando = null;
}

// --- FUNCIÓN guardarGastoAdmin MODIFICADA ---
async function guardarGastoAdmin(statusDeseado) {
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación");

    const cuentaId = accountSelect.value;
    const montoBruto = parseFloat(document.getElementById('expense-amount').value) || 0;
    
    // Permitimos monto 0 solo si se guarda como borrador
    if (montoBruto <= 0 && statusDeseado !== 'borrador') {
        return alert('Por favor, introduce un monto válido.');
    }

    saveDraftBtn.disabled = true;
    addApprovedBtn.disabled = true;
    addApprovedBtn.textContent = 'Procesando...';

    try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : { rol: 'admin', nombre: 'Administrador' };
        
        // Determinamos el estado final basado en el rol y la acción
        let finalStatus = statusDeseado;
        if (userData.rol === 'coadmin' && statusDeseado === 'aprobado') {
            finalStatus = 'pendiente';
        }
        // Si es admin y está editando, el status 'aprobado' significa guardar cambios (mantenemos 'aprobado' si ya lo era)
        // O si guarda como borrador, se queda como borrador.
        if (modoEdicion && userData.rol === 'admin') {
             if (statusDeseado === 'borrador') {
                 finalStatus = 'borrador';
             } else {
                 // Si presiona "Guardar Cambios", mantenemos el estado que tenía
                 const docActual = await db.collection('gastos').doc(idGastoEditando).get();
                 finalStatus = docActual.data()?.status || 'pendiente'; // Default a pendiente si algo falla
                 // EXCEPCIÓN: Si un admin edita un borrador y presiona "Guardar Cambios", lo mandamos a pendiente
                 if (docActual.data()?.status === 'borrador' && statusDeseado === 'aprobado') {
                     finalStatus = 'pendiente'; // Para que pase por aprobación si lo edita
                 }
             }
        }


        // Validaciones
        if (finalStatus === 'aprobado' && userData.rol === 'admin' && !cuentaId) {
            throw new Error('Por favor, selecciona una cuenta de origen para un gasto aprobado.');
        }

        // Subida de archivo (igual que antes)
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

        // Recopilación de datos (igual que antes)
        let montoNeto = montoBruto;
        const impuestosSeleccionados = [];
        if (addTaxesCheckbox.checked) {
            // ... (tu lógica de cálculo de impuestos) ...
            let totalImpuestos = 0;
            document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
                const impuesto = JSON.parse(checkbox.dataset.impuesto);
                impuestosSeleccionados.push(impuesto);
                totalImpuestos += impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
            });
            montoNeto = montoBruto + totalImpuestos;
        }
        const clienteSeleccionado = empresasCargadas.find(e => e.id === clientSelect.value);

        const expenseData = {
            descripcion: addExpenseForm['expense-description'].value,
            establecimiento: expensePlaceInput.value.trim(),
            monto: montoBruto,
            totalConImpuestos: montoNeto,
            impuestos: impuestosSeleccionados,
            categoria: formCategorySelect.value,
            fecha: addExpenseForm['expense-date'].value,
            empresa: clienteSeleccionado ? clienteSeleccionado.nombre : '',
            metodoPago: addExpenseForm['payment-method'].value,
            comentarios: addExpenseForm['expense-comments'].value,
            nombreCreador: userData.nombre,
            creadorId: user.uid,
            adminUid: adminUidGlobal, // Usamos la variable global
            // (Quitamos folio, creadoPor, emailCreador, fechaDeCreacion de aquí, se añaden solo al crear)
            status: finalStatus,
            cuentaId: finalStatus === 'aprobado' ? cuentaId : '',
            cuentaNombre: finalStatus === 'aprobado' && cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : '',
            proyectoId: projectSelect.value,
            proyectoNombre: projectSelect.value ? projectSelect.options[projectSelect.selectedIndex].text : '',
            comprobanteURL: comprobanteURL // Se sobreescribe si hay nuevo archivo
        };
        
        if (isInvoiceCheckbox.checked) {
             const rfcInput = document.getElementById('invoice-rfc');
             const folioInput = document.getElementById('invoice-folio');
             expenseData.datosFactura = { 
                 rfc: rfcInput ? rfcInput.value : '', 
                 folioFiscal: folioInput ? folioInput.value : '' 
             };
        }

        // --- LÓGICA DE GUARDADO/ACTUALIZACIÓN ---
        if (modoEdicion && idGastoEditando) {
            // Actualizar documento existente
            if (!comprobanteURL) { // Mantener URL si no se subió nuevo archivo
                const docActual = await db.collection('gastos').doc(idGastoEditando).get();
                expenseData.comprobanteURL = docActual.data()?.comprobanteURL || '';
            }
            await db.collection('gastos').doc(idGastoEditando).update(expenseData);
            alert('¡Gasto actualizado!');

            // IMPORTANTE: Si un admin actualiza y el estado es 'aprobado',
            // NO afectamos el saldo aquí. El saldo solo se afecta
            // al aprobar por primera vez (en Aprobaciones o al crear directo como admin).
            // Editar un gasto ya aprobado no cambia saldos retrospectivamente.

        } else {
            // Crear nuevo documento (lógica original)
            expenseData.folio = generarFolio(user.uid);
            expenseData.creadoPor = user.uid;
            expenseData.emailCreador = user.email;
            expenseData.fechaDeCreacion = new Date();

            if (finalStatus === 'borrador' || finalStatus === 'pendiente') {
                await db.collection('gastos').add(expenseData);
                alert(finalStatus === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado para aprobación!');
            } else { // Admin creando directo como aprobado
                const cuentaRef = db.collection('cuentas').doc(cuentaId);
                const newExpenseRef = db.collection('gastos').doc(); // Generamos ID por adelantado
                expenseData.id = newExpenseRef.id; // Guardamos el ID en los datos

                await db.runTransaction(async (transaction) => {
                    const cuentaDoc = await transaction.get(cuentaRef);
                    if (!cuentaDoc.exists) throw "La cuenta no existe.";
                    const cuentaData = cuentaDoc.data();
                    if (cuentaData.tipo === 'credito') {
                        transaction.update(cuentaRef, { deudaActual: (cuentaData.deudaActual || 0) + montoNeto, deudaTotal: (cuentaData.deudaTotal || 0) + montoNeto });
                    } else {
                        if ((cuentaData.saldoActual || 0) < montoNeto) throw "Saldo insuficiente en la cuenta seleccionada.";
                        transaction.update(cuentaRef, { saldoActual: cuentaData.saldoActual - montoNeto });
                    }
                    transaction.set(newExpenseRef, expenseData); // Usamos set con el ID generado
                    impuestosSeleccionados.forEach(imp => {
                        const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                        const taxMovRef = db.collection('movimientos_impuestos').doc();
                        transaction.set(taxMovRef, {
                            origen: `Gasto - ${expenseData.descripcion}`, tipoImpuesto: imp.nombre, monto: montoImpuesto,
                            fecha: new Date(), status: 'pagado', adminUid: adminUidGlobal // Usamos adminUidGlobal
                        });
                    });
                });
                alert('¡Gasto registrado, saldo actualizado e impuestos generados!');
            }
        }
        
        salirModoEdicion(); // Limpia formulario y resetea estado

    } catch (error) {
        console.error("Error al guardar el gasto: ", error);
        alert("Error: " + error.message);
    } finally {
        saveDraftBtn.disabled = false;
        addApprovedBtn.disabled = false;
        // Restauramos texto del botón principal al finalizar
        salirModoEdicion(); // Llama de nuevo para asegurar el texto correcto del botón
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
    const categorias = ["Comida", "Transporte", "Oficina", "Marketing", "Impuestos", "Otro"];
    let filterOptionsHTML = '<option value="todos">Todas</option>';
    let formOptionsHTML = '<option value="" disabled selected>Selecciona una categoría</option>';
    categorias.forEach(cat => {
        filterOptionsHTML += `<option value="${cat}">${cat}</option>`;
        formOptionsHTML += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = filterOptionsHTML;
    formCategorySelect.innerHTML = formOptionsHTML;
}

async function cargarGastosAprobados(adminUid) {
    if (!adminUid) return;
    expenseListContainer.innerHTML = '<p>Cargando historial...</p>';

    try {
        const obtenerHistorial = functions.httpsCallable('obtenerHistorialGastos');
        const resultado = await obtenerHistorial({ adminUid: adminUid });
        
        // Filtramos para excluir borradores
        historialDeGastos = resultado.data.gastos.filter(g => g.status !== 'borrador'); 
        filtrarYMostrarGastos(); 

    } catch (error) {
        console.error("Error al llamar a la función obtenerHistorialGastos:", error);
        expenseListContainer.innerHTML = `<p style="color:red;">No se pudo cargar el historial: ${error.message}</p>`;
    }
}

function filtrarYMostrarGastos() {
    let gastosFiltrados = [...historialDeGastos]; // Usamos la lista sin borradores

    const selectedCategory = categoryFilter.value;
    if (selectedCategory && selectedCategory !== 'todos') {
        gastosFiltrados = gastosFiltrados.filter(g => g.categoria === selectedCategory);
    }

    const selectedMonth = monthFilter.value;
    if (selectedMonth && selectedMonth !== 'todos') {
        gastosFiltrados = gastosFiltrados.filter(g => g.fecha.startsWith(selectedMonth));
    }
    
    mostrarGastosAprobados(gastosFiltrados);
}

function mostrarGastosAprobados(gastos) {
    expenseListContainer.innerHTML = '';
    if (gastos.length === 0) {
        expenseListContainer.innerHTML = '<p>No se encontraron gastos con los filtros seleccionados.</p>';
        return;
    }
    gastos.forEach(gasto => {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('expense-item');
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = (gasto.nombreCreador !== "Administrador" && gasto.creadorId) ? `<a href="perfil_empleado.html?id=${gasto.creadorId}">${gasto.nombreCreador}</a>` : (gasto.nombreCreador || "Sistema");
        
        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${gasto.descripcion}</span>
                    <span class="expense-details">Registrado por: ${creadorLink} | ${gasto.categoria} - ${fechaFormateada} | Estado: ${gasto.status}</span>
                </div>
                <span class="expense-amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span>
            </div>`; 
        expenseListContainer.appendChild(itemContainer);
    });
}

// (Listener de click en historial ya no es necesario si quitamos el botón editar de ahí)

// =========== FUNCIONES PARA BORRADORES (ADMIN/COADMIN) ===========

function cargarBorradores() {
    const user = auth.currentUser;
    if (!user || !adminUidGlobal) return;

    db.collection('gastos')
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
            cargarGastoEnFormulario(draftAEditar); 
            if (cancelButton) cancelButton.style.display = 'block'; 
        }
    }

    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar este borrador?')) {
            try {
                await db.collection('gastos').doc(draftId).delete();
                alert('Borrador eliminado.');
                if (modoEdicion && idGastoEditando === draftId) {
                    salirModoEdicion();
                }
            } catch (error) {
                console.error("Error al borrar borrador:", error);
                alert('No se pudo eliminar el borrador.');
            }
        }
    }
});
