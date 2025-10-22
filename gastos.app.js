import { auth, db, functions, storage } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const addExpenseForm = document.getElementById('add-expense-form');
const expenseListContainer = document.getElementById('expense-list');
const accountSelectGroup = document.getElementById('account-select-group'); // Grupo que contiene la cuenta de origen
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

let empresasCargadas = [];
let historialDeGastos = []; // Variable global para guardar el historial

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const adminUid = userData.rol === 'admin' ? user.uid : userData.adminUid;

        if (!adminUid) {
            alert("Error: No se pudo identificar al administrador principal.");
            return;
        }

        if (userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
            if (accountSelectGroup) accountSelectGroup.style.display = 'none';
            if (accountSelect) accountSelect.required = false;

            // --- LÍNEA AÑADIDA ---
            // Cambiamos el texto del botón principal para el Co-admin.
            if (addApprovedBtn) addApprovedBtn.textContent = 'Enviar para Aprobación';
            
        } else {
            backButton.href = 'dashboard.html';
        }

        // --- CARGA DE DATOS COMPARTIDOS ---
        cargarClientesYProyectos(adminUid);
        poblarFiltrosYCategorias();
        cargarCuentasEnSelector(adminUid); // Se carga para el admin
        cargarImpuestosParaSeleccion(adminUid);

        // --- CARGA DEL HISTORIAL ---
        cargarGastosAprobados(adminUid); // Llamada inicial al historial

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
    invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none';
});

paymentMethodSelect.addEventListener('change', () => {
    const metodo = paymentMethodSelect.value;
    if (metodo === 'Tarjeta de Crédito') {
        cargarCuentasEnSelector('credito');
    } else {
        cargarCuentasEnSelector('debito');
    }
});

clientSelect.addEventListener('change', async () => {
    const user = auth.currentUser;
    if (!user) return;
    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;
    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }
    const proyectosSnapshot = await db.collection('proyectos')
        .where('empresaId', '==', empresaId)
        .where('adminUid', '==', user.uid)
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
categoryFilter.addEventListener('change', cargarGastosAprobados);
monthFilter.addEventListener('change', cargarGastosAprobados);

// --- FUNCIONES ---

async function cargarClientesYProyectos(adminUid) {
    const empresasSnapshot = await db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get();
    empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));
    clientSelect.innerHTML = '<option value="">Ninguno</option>';
    empresasCargadas.forEach(empresa => { clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`; });
}

function generarFolio(userId) {
    const date = new Date();
    const userInitials = userId.substring(0, 4).toUpperCase();
    const timestamp = date.getTime();
    return `EXP-ADM-${userInitials}-${timestamp}`;
}

function cargarCuentasEnSelector(adminUid) {
    // Esta función es principalmente para el Admin
    db.collection('cuentas').where('adminUid', '==', adminUid).orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const esCredito = cuenta.tipo === 'credito';
            const etiqueta = esCredito ? 'Crédito' : 'Débito';
            accountSelect.appendChild(new Option(`${cuenta.nombre} (${etiqueta})`, doc.id));
        });
        accountSelect.value = selectedValue;
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

async function guardarGastoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return;
    const cuentaId = accountSelect.value;
    const montoBruto = parseFloat(document.getElementById('expense-amount').value) || 0;
    if (montoBruto <= 0) return alert('Por favor, introduce un monto válido.');

    // Deshabilitar botones para evitar envíos duplicados
    saveDraftBtn.disabled = true;
    addApprovedBtn.disabled = true;
    addApprovedBtn.textContent = 'Procesando...';

    try {
        // --- 1. VERIFICAR EL ROL DEL USUARIO ---
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : { rol: 'admin', nombre: 'Administrador' };
        
        // --- 2. LÓGICA DE ESTADO DINÁMICO ---
        // Si el usuario es un Co-Admin, cualquier gasto "aprobado" se convierte en "pendiente".
        let finalStatus = status;
        if (userData.rol === 'coadmin' && status === 'aprobado') {
            finalStatus = 'pendiente';
        }

        // La validación de la cuenta solo es necesaria si el estado final es 'aprobado'
        if (finalStatus === 'aprobado' && !cuentaId) {
            throw new Error('Por favor, selecciona una cuenta de origen para un gasto aprobado.');
        }

        // --- 3. LÓGICA DE SUBIDA DE ARCHIVO (sin cambios) ---
        let comprobanteURL = '';
        const file = receiptFileInput.files[0];
        if (file) {
            const generarUrl = functions.httpsCallable('generarUrlDeSubida');
            const urlResult = await generarUrl({ fileName: file.name, contentType: file.type });
            const { uploadUrl, filePath } = urlResult.data;
            await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
            const fileRef = storage.ref(filePath);
            comprobanteURL = await fileRef.getDownloadURL();
        }

        // --- 4. PREPARAR DATOS DEL GASTO (sin cambios en la lógica) ---
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
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            nombreCreador: userData.nombre, // Usamos el nombre del perfil
            adminUid: user.uid,
            fechaDeCreacion: new Date(),
            status: finalStatus, // Usamos el estado final
            cuentaId: finalStatus === 'aprobado' ? cuentaId : '',
            cuentaNombre: finalStatus === 'aprobado' && cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : '',
            proyectoId: projectSelect.value,
            proyectoNombre: projectSelect.value ? projectSelect.options[projectSelect.selectedIndex].text : '',
            comprobanteURL: comprobanteURL
        };

        // --- 5. LÓGICA DE GUARDADO CONDICIONAL ---
        // Si es un borrador o un gasto pendiente (de un Co-Admin), solo guardamos el registro.
        if (finalStatus === 'borrador' || finalStatus === 'pendiente') {
            await db.collection('gastos').add(expenseData);
            alert(finalStatus === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado para aprobación!');
        } else {
            // Si es un admin guardando un gasto aprobado, ejecutamos la transacción completa.
            const cuentaRef = db.collection('cuentas').doc(cuentaId);
            const newExpenseRef = db.collection('gastos').doc();
            await db.runTransaction(async (transaction) => {
                const cuentaDoc = await transaction.get(cuentaRef);
                if (!cuentaDoc.exists) throw "La cuenta no existe.";
                const cuentaData = cuentaDoc.data();
                if (cuentaData.tipo === 'credito') {
                    const nuevaDeudaActual = (cuentaData.deudaActual || 0) + montoNeto;
                    const nuevaDeudaTotal = (cuentaData.deudaTotal || 0) + montoNeto;
                    transaction.update(cuentaRef, { deudaActual: nuevaDeudaActual, deudaTotal: nuevaDeudaTotal });
                } else {
                    const nuevoSaldo = (cuentaData.saldoActual || 0) - montoNeto;
                    if (nuevoSaldo < 0) throw "Saldo insuficiente en la cuenta seleccionada.";
                    transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
                }
                transaction.set(newExpenseRef, expenseData);
                impuestosSeleccionados.forEach(imp => {
                    const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                    const taxMovRef = db.collection('movimientos_impuestos').doc();
                    transaction.set(taxMovRef, {
                        origen: `Gasto - ${expenseData.descripcion}`,
                        tipoImpuesto: imp.nombre,
                        monto: montoImpuesto,
                        fecha: new Date(),
                        status: 'pagado',
                        adminUid: user.uid
                    });
                });
            });
            alert('¡Gasto registrado, saldo actualizado e impuestos generados!');
        }

        // Reseteamos el formulario al finalizar
        addExpenseForm.reset();
        clientSelect.dispatchEvent(new Event('change'));
        isInvoiceCheckbox.checked = false;
        taxesDetailsContainer.style.display = 'none';

    } catch (error) {
        console.error("Error al guardar el gasto: ", error);
        alert("Error: " + error.message);
    } finally {
        // Rehabilitamos los botones en cualquier caso
        saveDraftBtn.disabled = false;
        addApprovedBtn.disabled = false;
        addApprovedBtn.textContent = 'Agregar Gasto Aprobado';
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
        
        historialDeGastos = resultado.data.gastos; // Guardamos en la variable global
        filtrarYMostrarGastos(); // Mostramos los resultados

    } catch (error) {
        console.error("Error al llamar a la función obtenerHistorialGastos:", error);
        expenseListContainer.innerHTML = `<p style="color:red;">No se pudo cargar el historial: ${error.message}</p>`;
    }
}

function filtrarYMostrarGastos() {
    let gastosFiltrados = [...historialDeGastos];

    const selectedCategory = categoryFilter.value;
    if (selectedCategory && selectedCategory !== 'todos') {
        gastosFiltrados = gastosFiltrados.filter(g => g.categoria === selectedCategory);
    }

    const selectedMonth = monthFilter.value;
    if (selectedMonth && selectedMonth !== 'todos') {
        // Asume que la fecha está en formato 'YYYY-MM-DD'
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
                    <span class="expense-details">Registrado por: ${creadorLink} | ${gasto.categoria} - ${fechaFormateada}</span>
                </div>
                <span class="expense-amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span>
            </div>`;
        expenseListContainer.appendChild(itemContainer);
    });
}

expenseListContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') return;
    const item = e.target.closest('.expense-item');
    if (item) {
        const details = item.querySelector('.item-details');
        details.style.display = details.style.display === 'block' ? 'none' : 'block';
    }
});
