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

// --- NUEVOS ELEMENTOS DEL DOM PARA BORRADORES ---
const draftsSection = document.getElementById('drafts-section');
const draftsListContainer = document.getElementById('drafts-list');

// --- VARIABLES GLOBALES ---
let empresasCargadas = [];
let historialDeIngresos = [];
let listaDeBorradores = []; // <--- NUEVA
let adminUidGlobal = null; // <--- NUEVA VARIABLE GLOBAL

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        

        adminUidGlobal = userData.adminUid || user.uid;

        
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

        // --- CAMBIO CLAVE: Usamos la variable global en todas las llamadas ---
        cargarClientesYProyectos(adminUidGlobal);
        poblarFiltrosYCategorias();
        cargarCuentasEnSelector(adminUidGlobal);
        cargarImpuestosParaSeleccion(adminUidGlobal);
        cargarIngresosAprobados(adminUidGlobal, userData.rol);
        cargarBorradores(); // <--- NUEVA LLAMADA
        
        // Listeners para los filtros
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
isInvoiceCheckbox.addEventListener('change', () => { invoiceDetailsContainer.style.display = isInvoiceCheckbox.checked ? 'block' : 'none'; });
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
    let totalImpuestos = 0;
    document.querySelectorAll('#taxes-checklist input[type="checkbox"]:checked').forEach(checkbox => {
        const impuesto = JSON.parse(checkbox.dataset.impuesto);
        const montoCalculado = impuesto.tipo === 'porcentaje' ? (montoBruto * impuesto.valor) / 100 : impuesto.valor;
        totalImpuestos += montoCalculado;
        checkbox.closest('.tax-item').querySelector('.calculated-amount').textContent = `$${montoCalculado.toLocaleString('es-MX')}`; // O -$ para ingresos
    });
    // ...

    // --- EL CAMBIO ESTÁ AQUÍ ---
    // Antes sumaba o restaba: const montoNeto = montoBruto + totalImpuestos;
    const montoNeto = montoBruto; // Ahora el neto es IGUAL al bruto

    summaryBruto.textContent = `$${montoBruto.toLocaleString('es-MX')}`;
    summaryImpuestos.textContent = `$${totalImpuestos.toLocaleString('es-MX')}`;
    summaryNeto.textContent = `$${montoNeto.toLocaleString('es-MX')}`;
}

async function guardarIngresoAdmin(status) {
    // (Esta función es larga, pero no necesita cambios, 
    // ya que obtiene el 'adminUid' de forma interna y correcta al 
    // leer el perfil del 'user'. Dejamos tu código original aquí.)
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
            // Ya no sumamos ni restamos totalImpuestos a montoNeto.
            // montoNeto se queda con el mismo valor que montoBruto.
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
            folio: `INC-ADM-${user.uid.substring(0, 4).toUpperCase()}-${Date.now()}`,
            creadoPor: user.uid,
            emailCreador: user.email,
            nombreCreador: userData.nombre,
            creadorId: user.uid, // <--- Este campo es importante
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

        } else { // Es un admin guardando un ingreso aprobado
            const cuentaRef = db.collection('cuentas').doc(cuentaId);
            await db.runTransaction(async (transaction) => {
                const cuentaDoc = await transaction.get(cuentaRef);
                if (!cuentaDoc.exists) throw "La cuenta no existe.";
                const nuevoSaldo = (cuentaDoc.data().saldoActual || 0) + montoNeto;
                const newIncomeRef = db.collection('ingresos').doc();
                
                transaction.set(newIncomeRef, incomeData);
                transaction.update(cuentaRef, { saldoActual: nuevoSaldo });

                // --- NUEVO: GUARDAR LOS IMPUESTOS DEL INGRESO ---
                impuestosSeleccionados.forEach(imp => {
                    const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                    const taxMovRef = db.collection('movimientos_impuestos').doc();
                    transaction.set(taxMovRef, {
                        origen: `Ingreso - ${incomeData.descripcion}`, 
                        tipoImpuesto: imp.nombre, 
                        monto: montoImpuesto,
                        fecha: new Date(), 
                        status: 'pendiente', // Los dejamos como pendientes para descontarlos después
                        adminUid: incomeData.adminUid 
                    });
                });
            });
            alert('¡Ingreso registrado, saldo actualizado y retenciones generadas!');
        }
        
        addIncomeForm.reset();
        clientSelect.dispatchEvent(new Event('change'));
        
    } catch (error) {
        console.error("Error al guardar el ingreso:", error);
        alert("Error: " + error.message);
    } finally {
        saveDraftBtn.disabled = false;
        addApprovedBtn.disabled = false;
        // (Restauramos el texto correcto según el rol)
        const user = auth.currentUser;
        if(user) {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                addApprovedBtn.textContent = 'Enviar para Aprobación';
            } else {
                addApprovedBtn.textContent = 'Agregar Ingreso Aprobado';
            }
        }
    }
}

function poblarFiltrosYCategorias() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    const currentMonthValue = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
    monthFilter.value = currentMonthValue;
    
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
        
        historialDeIngresos = resultado.data.ingresos;
        filtrarYMostrarIngresos();

    } catch (error) {
        console.error("Error al llamar a la función obtenerHistorialIngresos:", error);
        alert("Error al cargar el historial: " + error.message);
        incomeListContainer.innerHTML = `<p class="error-message">No se pudo cargar el historial.</p>`;
    }
}

function filtrarYMostrarIngresos() {
    let ingresosFiltrados = [...historialDeIngresos];

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

    const gruposPorFecha = {};
    ingresos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    ingresos.forEach(ingreso => {
        const fechaStr = ingreso.fecha; 
        if (!gruposPorFecha[fechaStr]) gruposPorFecha[fechaStr] = { total: 0, items: [] };
        gruposPorFecha[fechaStr].items.push(ingreso);
        gruposPorFecha[fechaStr].total += (ingreso.totalConImpuestos || ingreso.monto);
    });

    for (const [fecha, grupo] of Object.entries(gruposPorFecha)) {
        const [year, month, day] = fecha.split('-');
        const fechaFormateada = new Date(year, month - 1, day).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

        const dayGroup = document.createElement('div');
        dayGroup.style.marginBottom = '15px';

        const dayHeader = document.createElement('div');
        dayHeader.classList.add('day-header');
        dayHeader.style.cssText = 'cursor: pointer; background: rgba(255,255,255,0.1); padding: 12px 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 500; transition: background 0.3s;';
        dayHeader.innerHTML = `
            <span>📅 ${fechaFormateada}</span>
            <span>Total: $${grupo.total.toLocaleString('es-MX')} <span class="toggle-icon" style="font-size: 0.8em; margin-left: 10px;">▼</span></span>
        `;

        const dayItems = document.createElement('div');
        dayItems.style.display = 'none'; 
        dayItems.style.padding = '10px 0 0 10px';

        grupo.items.forEach(ingreso => {
            const itemContainer = document.createElement('div');
            itemContainer.classList.add('expense-item');
            itemContainer.dataset.id = ingreso.id;
            
            const creadorLink = (ingreso.nombreCreador !== "Administrador" && ingreso.creadorId) ? `<a href="perfil_empleado.html?id=${ingreso.creadorId}">${ingreso.nombreCreador}</a>` : (ingreso.nombreCreador || "Sistema");
            const iconoComprobante = ingreso.comprobanteURL ? `<a href="${ingreso.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';

            itemContainer.innerHTML = `
                <div class="item-summary">
                    <div class="expense-info">
                        <span class="expense-description">${ingreso.descripcion}${iconoComprobante}</span>
                        <span class="expense-details">Por: ${creadorLink} | ${ingreso.categoria} | ${ingreso.status}</span>
                    </div>
                    <span class="expense-amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span>
                </div>
                <div class="item-details-view" style="display: none;"></div> 
            `;
            dayItems.appendChild(itemContainer);
        });

        dayHeader.addEventListener('click', () => {
            const isHidden = dayItems.style.display === 'none';
            dayItems.style.display = isHidden ? 'block' : 'none';
            dayHeader.querySelector('.toggle-icon').textContent = isHidden ? '▲' : '▼';
            dayHeader.style.background = isHidden ? 'rgba(0, 169, 157, 0.2)' : 'rgba(255,255,255,0.1)';
        });

        dayGroup.appendChild(dayHeader);
        dayGroup.appendChild(dayItems);
        incomeListContainer.appendChild(dayGroup);
    }
}

incomeListContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') return;
    const item = e.target.closest('.expense-item');
    if (item) {
        const details = item.querySelector('.item-details');
        if(details) details.style.display = details.style.display === 'block' ? 'none' : 'block';
    }
});

// =========== FUNCIONES NUEVAS PARA BORRADORES (ADMIN/COADMIN) ===========

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
                <button class="btn-delete" data-id="${draft.id}">Borrar</button>
            </div>
        `;
        draftsListContainer.appendChild(draftElement);
    });
}

// --- NUEVO LISTENER PARA EXPANDIR DETALLES DEL HISTORIAL ---
incomeListContainer.addEventListener('click', (e) => {
    // Ignorar clics en enlaces
    if (e.target.tagName === 'A' || e.target.closest('a')) return;

    const itemElement = e.target.closest('.expense-item'); // Buscamos por la clase usada
    if (!itemElement) return;

    const detailsContainer = itemElement.querySelector('.item-details-view');
    const ingresoId = itemElement.dataset.id;

    // Buscar los datos del ingreso en el array global
    const ingreso = historialDeIngresos.find(i => i.id === ingresoId);

    if (!detailsContainer || !ingreso) return;

    const isVisible = detailsContainer.style.display === 'block';

    if (isVisible) {
        detailsContainer.style.display = 'none';
    } else {
        // Construir el HTML de los detalles
        let detailsHTML = `<p><strong>Método de Cobro:</strong> ${ingreso.metodoPago || 'N/A'}</p>`;
         if (ingreso.empresa) {
            detailsHTML += `<p><strong>Cliente/Empresa:</strong> ${ingreso.empresa}</p>`;
        }
        if (ingreso.proyectoNombre) {
            detailsHTML += `<p><strong>Proyecto:</strong> ${ingreso.proyectoNombre}</p>`;
        }
         if (ingreso.comentarios) {
            detailsHTML += `<p><strong>Comentarios:</strong> ${ingreso.comentarios}</p>`;
        }

        // Para ingresos, los impuestos son retenciones
        if (ingreso.impuestos && ingreso.impuestos.length > 0) {
            detailsHTML += '<h4>Retenciones Desglosadas</h4><div class="tax-breakdown">';
            ingreso.impuestos.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (ingreso.monto * imp.valor) / 100 : imp.valor;
                detailsHTML += `<div class="tax-line"><span>- ${imp.nombre}</span><span>-$${montoImpuesto.toLocaleString('es-MX')}</span></div>`; // Signo negativo
            });
            detailsHTML += '</div>';
        }

        if (!ingreso.empresa && !ingreso.proyectoNombre && !ingreso.comentarios && (!ingreso.impuestos || ingreso.impuestos.length === 0)) {
             detailsHTML += '<p>No hay detalles adicionales para este registro.</p>';
        }

        detailsContainer.innerHTML = detailsHTML;
        detailsContainer.style.display = 'block';
    }
});

// Listener solo para el botón de Borrar
draftsListContainer.addEventListener('click', async (e) => {
    const draftId = e.target.dataset.id;
    if (!draftId) return;

    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar este borrador?')) {
            try {
                await db.collection('ingresos').doc(draftId).delete(); // <--- Colección 'ingresos'
                alert('Borrador eliminado.');
            } catch (error) {
                console.error("Error al borrar borrador:", error);
                alert('No se pudo eliminar el borrador.');
            }
        }
    }
});
