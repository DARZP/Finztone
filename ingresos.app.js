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

let empresasCargadas = [];

// --- LÓGICA DE LA PÁGINA ---
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
        } else {
            backButton.href = 'dashboard.html';
        }

        cargarClientesYProyectos(adminUid);
        poblarFiltrosYCategorias();
        cargarCuentasEnSelector(adminUid);
        cargarImpuestosParaSeleccion(adminUid);
        cargarIngresosAprobados(adminUid, user.uid); // Pasamos ambos UIDs
        recalcularTotales();

        // Re-asignar listeners de filtros aquí para asegurar que tengan el adminUid
        categoryFilter.onchange = () => cargarIngresosAprobados(adminUid, user.uid);
        monthFilter.onchange = () => cargarIngresosAprobados(adminUid, user.uid);

    } else {
        window.location.href = 'index.html';
    }
});


// --- LISTENERS ---
addTaxesCheckbox.addEventListener('change', recalcularTotales);
isInvoiceCheckbox.addEventListener('change', () => { invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none'; });
montoInput.addEventListener('input', recalcularTotales);
taxesChecklistContainer.addEventListener('change', recalcularTotales);
saveDraftBtn.addEventListener('click', () => guardarIngresoAdmin('borrador'));
addApprovedBtn.addEventListener('click', () => guardarIngresoAdmin('aprobado'));

clientSelect.addEventListener('change', async () => {
    const user = auth.currentUser;
    if (!user) return;
    const userDoc = await db.collection('usuarios').doc(user.uid).get();
    const adminUid = userDoc.exists ? (userDoc.data().adminUid || user.uid) : user.uid;

    const empresaId = clientSelect.value;
    projectSelect.innerHTML = '<option value="">Cargando...</option>';
    projectSelect.disabled = true;

    if (!empresaId) {
        projectSelect.innerHTML = '<option value="">Selecciona un cliente primero</option>';
        return;
    }
    const proyectosSnapshot = await db.collection('proyectos').where('empresaId', '==', empresaId).where('status', '==', 'activo').where('adminUid', '==', adminUid).get();
    if (proyectosSnapshot.empty) {
        projectSelect.innerHTML = '<option value="">Este cliente no tiene proyectos activos</option>';
    } else {
        projectSelect.innerHTML = '<option value="">Seleccionar Proyecto</option>';
        proyectosSnapshot.forEach(doc => { projectSelect.innerHTML += `<option value="${doc.id}">${doc.data().nombre}</option>`; });
        projectSelect.disabled = false;
    }
});

// --- FUNCIONES ---

async function cargarClientesYProyectos(adminUid) {
    const empresasSnapshot = await db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get();
    empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));
    clientSelect.innerHTML = '<option value="">Ninguno</option>';
    empresasCargadas.forEach(empresa => { clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`; });
}

function generarFolio(userId) { return `INC-ADM-${userId.substring(0, 4).toUpperCase()}-${Date.now()}`; }

function cargarCuentasEnSelector(adminUid) {
    db.collection('cuentas').where('adminUid', '==', adminUid).where('tipo', '==', 'debito').orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = accountSelect.value;
        accountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            accountSelect.appendChild(new Option(`${cuenta.nombre} (Saldo: $${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`, doc.id));
        });
        accountSelect.value = selectedValue;
    });
}

async function cargarImpuestosParaSeleccion(adminUid) {
    const snapshot = await db.collection('impuestos_definiciones').where('adminUid', '==', adminUid).get();
    taxesChecklistContainer.innerHTML = '';
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

async function guardarIngresoAdmin(status) {
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación");

    const montoBruto = parseFloat(montoInput.value) || 0;
    if (montoBruto <= 0) return alert('Por favor, introduce un monto válido.');

    saveDraftBtn.disabled = true;
    addApprovedBtn.disabled = true;
    addApprovedBtn.textContent = 'Procesando...';

    try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : { rol: 'admin', nombre: 'Administrador' };
        
        let finalStatus = status;
        if (userData.rol === 'coadmin' && status === 'aprobado') {
            finalStatus = 'pendiente';
        }

        const cuentaId = accountSelect.value;
        if (finalStatus === 'aprobado' && !cuentaId) {
            throw new Error('Por favor, selecciona una cuenta de destino para un ingreso aprobado.');
        }

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
            folio: generarFolio(user.uid),
            creadoPor: user.uid,
            emailCreador: user.email,
            nombreCreador: userData.nombre,
            adminUid: userData.adminUid || user.uid,
            fechaDeCreacion: new Date(),
            status: finalStatus,
            cuentaId: finalStatus === 'aprobado' ? cuentaId : '',
            cuentaNombre: finalStatus === 'aprobado' && cuentaId ? accountSelect.options[accountSelect.selectedIndex].text.split(' (')[0] : '',
            proyectoId: projectSelect.value,
            proyectoNombre: projectSelect.value ? projectSelect.options[projectSelect.selectedIndex].text : '',
            comprobanteURL: comprobanteURL
        };

        if (isInvoiceCheckbox.checked) {
            incomeData.datosFactura = { rfc: document.getElementById('invoice-rfc').value, folioFiscal: document.getElementById('invoice-folio').value };
        }

        if (finalStatus === 'borrador' || finalStatus === 'pendiente') {
            await db.collection('ingresos').add(incomeData);
            alert(finalStatus === 'borrador' ? '¡Borrador guardado!' : '¡Ingreso enviado para aprobación!');
        } else {
            const cuentaRef = db.collection('cuentas').doc(cuentaId);
            await db.runTransaction(async (transaction) => {
                const cuentaDoc = await transaction.get(cuentaRef);
                if (!cuentaDoc.exists) throw "La cuenta no existe.";
                const nuevoSaldo = (cuentaDoc.data().saldoActual || 0) + montoNeto;
                const newIncomeRef = db.collection('ingresos').doc();
                transaction.set(newIncomeRef, incomeData);
                transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
            });
            alert('¡Ingreso registrado!');
        }
        addIncomeForm.reset();
        clientSelect.dispatchEvent(new Event('change'));
        
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error: " + error.message);
    } finally {
        saveDraftBtn.disabled = false;
        addApprovedBtn.disabled = false;
        addApprovedBtn.textContent = 'Agregar Ingreso Aprobado';
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

async function cargarIngresosAprobados(adminUid, currentUserId) {
    if (!adminUid || !currentUserId) return;

    try {
        const userDoc = await db.collection('usuarios').doc(currentUserId).get();
        const currentUserRole = userDoc.exists ? userDoc.data().rol : 'admin';

        let query;
        if (currentUserRole === 'coadmin') {
            // --- LA CORRECIÓN CLAVE ESTÁ AQUÍ ---
            // Ahora la consulta es súper específica:
            // "Tráeme los ingresos que pertenecen a mi jefe Y que además cree yo".
            query = db.collection('ingresos')
                .where('adminUid', '==', adminUid)
                .where('creadoPor', '==', currentUserId)
                .where('status', '==', 'aprobado');
        } else {
            // La consulta para el Admin no cambia
            query = db.collection('ingresos')
                .where('adminUid', '==', adminUid)
                .where('status', '==', 'aprobado');
        }

        const selectedCategory = categoryFilter.value;
        if (selectedCategory && selectedCategory !== 'todos') {
            query = query.where('categoria', '==', selectedCategory);
        }

        const selectedMonth = monthFilter.value;
        if (selectedMonth && selectedMonth !== 'todos') {
            const [year, month] = selectedMonth.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 1).toISOString().split('T')[0];
            query = query.where('fecha', '>=', startDate).where('fecha', '<', endDate);
        }
        
        query = query.orderBy('fecha', 'desc');

        query.onSnapshot(snapshot => {
            const ingresos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            mostrarIngresosAprobados(ingresos);
        }, error => {
            console.error("Error al obtener ingresos:", error);
            // Si el error indica que falta un índice, el enlace estará en la consola.
            alert("Error al cargar el historial. Revisa la consola (F12) para ver si necesitas crear un índice en Firestore.");
        });

    } catch (error) {
        console.error("Error en la lógica de carga de ingresos:", error);
    }
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
                    <span class="expense-details">Registrado por: ${creadorLink} | ${ingreso.categoria} - ${fechaFormateada}</span>
                </div>
                <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
            </div>
            <div class="item-details" style="display: none;">
                </div>`;
        incomeListContainer.appendChild(itemContainer);
    });
}

incomeListContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') return;
    const item = e.target.closest('.expense-item');
    if (item) {
        const details = item.querySelector('.item-details');
        if(details) details.style.display = details.style.display === 'block' ? 'none' : 'block';
    }
});
