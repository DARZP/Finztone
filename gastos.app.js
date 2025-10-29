import { auth, db, functions, storage } from './firebase-init.js';

// --- SOLO VARIABLES GLOBALES DE ESTADO/DATOS (NO DOM) ---
let empresasCargadas = [];
let historialDeGastos = [];
let listaDeBorradores = [];
let adminUidGlobal = null;
let modoEdicion = false;
let idGastoEditando = null;

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    // --- DECLARACIÓN DE ELEMENTOS DEL DOM (MOVIDO AQUÍ) ---
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
    const cancelButton = document.getElementById('cancel-edit-btn');
    const draftsSection = document.getElementById('drafts-section');
    const draftsListContainer = document.getElementById('drafts-list');
    const montoInput = document.getElementById('expense-amount'); // Añadido aquí también
    const summaryBruto = document.getElementById('summary-bruto'); // Añadido aquí
    const summaryImpuestos = document.getElementById('summary-impuestos'); // Añadido aquí
    const summaryNeto = document.getElementById('summary-neto'); // Añadido aquí

    // --- VERIFICACIÓN DE ELEMENTOS (OPCIONAL PERO RECOMENDADO) ---
    // Asegurarse de que los elementos cruciales existen antes de continuar
    if (!addExpenseForm || !expenseListContainer || !categoryFilter || !monthFilter || !draftsSection || !draftsListContainer) {
        console.error("Error crítico: Faltan elementos esenciales del DOM. Revisa los IDs en gastos.html.");
        alert("Error al cargar la página. Faltan componentes.");
        return; // Detiene la ejecución si falta algo
    }

    // --- LÓGICA DE USUARIO Y ROLES ---
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

        // --- CARGA DE DATOS Y LISTENERS (AHORA SEGUROS) ---
        cargarClientesYProyectos(adminUidGlobal);
        poblarFiltrosYCategorias(); // Ahora 'monthFilter' y 'categoryFilter' existen
        cargarCuentasEnSelector(adminUidGlobal);
        cargarImpuestosParaSeleccion(adminUidGlobal);
        cargarGastosAprobados(adminUidGlobal);
        cargarBorradores();

        // Listeners para los filtros del historial
        categoryFilter.onchange = () => filtrarYMostrarGastos();
        monthFilter.onchange = () => filtrarYMostrarGastos();

        // Listeners del formulario (ahora seguros)
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
        paymentMethodSelect.addEventListener('change', () => {
            const metodo = paymentMethodSelect.value;
            if (metodo === 'Tarjeta de Crédito') {
                cargarCuentasEnSelector(adminUidGlobal, 'credito');
            } else {
                cargarCuentasEnSelector(adminUidGlobal);
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
        montoInput.addEventListener('input', recalcularTotales);
        taxesChecklistContainer.addEventListener('change', recalcularTotales);

        // Listener para Cancelar Edición (ahora seguro)
        if (cancelButton) {
            cancelButton.addEventListener('click', salirModoEdicion);
        }

         // Listener para Borradores (ahora seguro)
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

    } else {
        window.location.href = 'index.html';
    }

    // --- FUNCIONES (Definidas aquí dentro o fuera, pero llamadas desde aquí) ---
    // (Asegúrate que todas las funciones que manipulan el DOM usen las
    // variables declaradas al inicio de auth.onAuthStateChanged)

    async function cargarClientesYProyectos(adminUid) {
        // ... (sin cambios internos, usa clientSelect, projectSelect)
        const empresasSnapshot = await db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get();
        empresasCargadas = empresasSnapshot.docs.map(doc => ({ id: doc.id, nombre: doc.data().nombre }));
        clientSelect.innerHTML = '<option value="">Ninguno</option>';
        empresasCargadas.forEach(empresa => { clientSelect.innerHTML += `<option value="${empresa.id}">${empresa.nombre}</option>`; });
    }

    function generarFolio(userId) {
        // ... (sin cambios)
        return `EXP-ADM-${userId.substring(0, 4).toUpperCase()}-${Date.now()}`;
    }

    function cargarCuentasEnSelector(adminUid, tipo = null) {
        // ... (sin cambios internos, usa accountSelect)
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
                const displaySaldo = esCredito ? '' : ` (Saldo: $${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`;
                accountSelect.appendChild(new Option(`${cuenta.nombre} (${etiqueta})${displaySaldo}`, doc.id));
            });
            if (selectedValue && accountSelect.querySelector(`option[value="${selectedValue}"]`)) {
                 accountSelect.value = selectedValue;
            }
        });
    }

    async function cargarImpuestosParaSeleccion(adminUid) {
        // ... (sin cambios internos, usa taxesChecklistContainer)
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
        // ... (sin cambios internos, usa montoInput, summaryBruto, etc.)
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
        // ... (sin cambios internos, usa addExpenseForm, clientSelect, etc.)
        addExpenseForm.reset();
        addExpenseForm['expense-description'].value = gasto.descripcion || '';
        expensePlaceInput.value = gasto.establecimiento || '';
        addExpenseForm['expense-amount'].value = gasto.monto || 0;
        formCategorySelect.value = gasto.categoria || '';
        addExpenseForm['expense-date'].value = gasto.fecha || '';
        paymentMethodSelect.value = gasto.metodoPago || 'Efectivo';
        addExpenseForm['expense-comments'].value = gasto.comentarios || '';

        if (gasto.empresa && empresasCargadas.length > 0) {
            const cliente = empresasCargadas.find(e => e.nombre === gasto.empresa);
            if (cliente) {
                clientSelect.value = cliente.id;
                clientSelect.dispatchEvent(new Event('change'));
                setTimeout(() => { projectSelect.value = gasto.proyectoId || ""; }, 500);
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

        if (gasto.datosFactura) {
            isInvoiceCheckbox.checked = true;
            invoiceDetailsContainer.style.display = 'block';
            if (!document.getElementById('invoice-rfc')) {
                invoiceDetailsContainer.innerHTML = `...`; // Código para crear inputs
            }
            document.getElementById('invoice-rfc').value = gasto.datosFactura.rfc || '';
            document.getElementById('invoice-folio').value = gasto.datosFactura.folioFiscal || '';
        } else {
            isInvoiceCheckbox.checked = false;
            invoiceDetailsContainer.style.display = 'none';
        }

        if (gasto.status === 'aprobado' && gasto.cuentaId) {
            accountSelect.value = gasto.cuentaId;
        }

        recalcularTotales();
        saveDraftBtn.textContent = 'Actualizar Borrador';
        const currentUser = auth.currentUser; // Renombramos para evitar conflicto con 'user' de auth.onAuthStateChanged
        if(currentUser) {
            db.collection('usuarios').doc(currentUser.uid).get().then(userDoc => {
                if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                    addApprovedBtn.textContent = 'Guardar y Enviar para Aprobación';
                } else {
                     addApprovedBtn.textContent = 'Guardar Cambios';
                }
            });
        }
        if (cancelButton) cancelButton.style.display = 'block';
        modoEdicion = true;
        idGastoEditando = gasto.id;
        window.scrollTo(0, 0);
    }

    function salirModoEdicion() {
        // ... (sin cambios internos, usa addExpenseForm, clientSelect, etc.)
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

        const currentUser = auth.currentUser;
        if(currentUser) {
            db.collection('usuarios').doc(currentUser.uid).get().then(userDoc => {
                if(userDoc.exists && userDoc.data().rol === 'coadmin') {
                    addApprovedBtn.textContent = 'Enviar para Aprobación';
                } else {
                    addApprovedBtn.textContent = 'Agregar Gasto Aprobado';
                }
            });
        }

        if (cancelButton) cancelButton.style.display = 'none';

        modoEdicion = false;
        idGastoEditando = null;
    }

    async function guardarGastoAdmin(statusDeseado) {
        // ... (código interno sin cambios significativos, usa addExpenseForm, etc.)
        // (Asegúrate que la lógica de transacción use adminUidGlobal donde sea necesario,
        // como al crear movimientos_impuestos)
         const currentUser = auth.currentUser; // Renombramos
        if (!currentUser) return alert("Error de autenticación");

        const cuentaId = accountSelect.value;
        const montoBruto = parseFloat(montoInput.value) || 0;

        if (montoBruto <= 0 && statusDeseado !== 'borrador') {
            return alert('Por favor, introduce un monto válido.');
        }

        saveDraftBtn.disabled = true;
        addApprovedBtn.disabled = true;
        addApprovedBtn.textContent = 'Procesando...';

        try {
            const userDoc = await db.collection('usuarios').doc(currentUser.uid).get(); // Usamos currentUser
            const userData = userDoc.exists ? userDoc.data() : { rol: 'admin', nombre: 'Administrador' };

            let finalStatus = statusDeseado;
            // ... (resto de la lógica para determinar finalStatus)
            if (userData.rol === 'coadmin' && statusDeseado === 'aprobado') {
                finalStatus = 'pendiente';
            }
             if (modoEdicion && userData.rol === 'admin') {
                 if (statusDeseado === 'borrador') {
                     finalStatus = 'borrador';
                 } else {
                     const docActual = await db.collection('gastos').doc(idGastoEditando).get();
                     finalStatus = docActual.data()?.status || 'pendiente';
                     if (docActual.data()?.status === 'borrador' && statusDeseado === 'aprobado') {
                         finalStatus = 'pendiente';
                     }
                 }
            }


            if (finalStatus === 'aprobado' && userData.rol === 'admin' && !cuentaId) {
                throw new Error('Por favor, selecciona una cuenta de origen para un gasto aprobado.');
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
                montoNeto = montoBruto + totalImpuestos;
            }
            const clienteSeleccionado = empresasCargadas.find(e => e.id === clientSelect.value);

            const expenseData = {
                // ... (resto de los datos)
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
                creadorId: currentUser.uid, // Usamos currentUser
                adminUid: adminUidGlobal,
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
                 expenseData.datosFactura = {
                     rfc: rfcInput ? rfcInput.value : '',
                     folioFiscal: folioInput ? folioInput.value : ''
                 };
            }

            if (modoEdicion && idGastoEditando) {
                 if (!comprobanteURL) {
                    const docActual = await db.collection('gastos').doc(idGastoEditando).get();
                    expenseData.comprobanteURL = docActual.data()?.comprobanteURL || '';
                }
                await db.collection('gastos').doc(idGastoEditando).update(expenseData);
                alert('¡Gasto actualizado!');

            } else {
                 expenseData.folio = generarFolio(currentUser.uid); // Usamos currentUser
                expenseData.creadoPor = currentUser.uid; // Usamos currentUser
                expenseData.emailCreador = currentUser.email; // Usamos currentUser
                expenseData.fechaDeCreacion = new Date();

                if (finalStatus === 'borrador' || finalStatus === 'pendiente') {
                    await db.collection('gastos').add(expenseData);
                    alert(finalStatus === 'borrador' ? '¡Borrador guardado!' : '¡Gasto enviado para aprobación!');
                } else {
                    const cuentaRef = db.collection('cuentas').doc(cuentaId);
                    const newExpenseRef = db.collection('gastos').doc();
                    expenseData.id = newExpenseRef.id;

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
                        transaction.set(newExpenseRef, expenseData);
                        impuestosSeleccionados.forEach(imp => {
                            const montoImpuesto = imp.tipo === 'porcentaje' ? (montoBruto * imp.valor) / 100 : imp.valor;
                            const taxMovRef = db.collection('movimientos_impuestos').doc();
                            transaction.set(taxMovRef, {
                                origen: `Gasto - ${expenseData.descripcion}`, tipoImpuesto: imp.nombre, monto: montoImpuesto,
                                fecha: new Date(), status: 'pagado', adminUid: adminUidGlobal // Corregido
                            });
                        });
                    });
                    alert('¡Gasto registrado, saldo actualizado e impuestos generados!');
                }
            }

            salirModoEdicion();

        } catch (error) {
            console.error("Error al guardar el gasto: ", error);
            alert("Error: " + error.message);
            // Re-habilita botones en caso de error
            saveDraftBtn.disabled = false;
            addApprovedBtn.disabled = false;
             salirModoEdicion(); // Llama para restaurar texto
        }
        // El 'finally' ya no es necesario aquí si llamamos a salirModoEdicion al final del try y en el catch
    }


    function poblarFiltrosYCategorias() {
        // ... (sin cambios internos, usa monthFilter, categoryFilter, formCategorySelect)
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
        // ... (sin cambios internos, usa expenseListContainer)
        if (!adminUid) return;
        expenseListContainer.innerHTML = '<p>Cargando historial...</p>';

        try {
            const obtenerHistorial = functions.httpsCallable('obtenerHistorialGastos');
            const resultado = await obtenerHistorial({ adminUid: adminUid });

            historialDeGastos = resultado.data.gastos.filter(g => g.status !== 'borrador');
            filtrarYMostrarGastos();

        } catch (error) {
            console.error("Error al llamar a la función obtenerHistorialGastos:", error);
            expenseListContainer.innerHTML = `<p style="color:red;">No se pudo cargar el historial: ${error.message}</p>`;
        }
    }

    function filtrarYMostrarGastos() {
        // ... (sin cambios internos, usa categoryFilter, monthFilter)
        let gastosFiltrados = [...historialDeGastos];

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
        itemContainer.dataset.id = gasto.id; // <-- AÑADIDO: Data ID for linking
        const fechaFormateada = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
        const creadorLink = (gasto.nombreCreador !== "Administrador" && gasto.creadorId) ? `<a href="perfil_empleado.html?id=${gasto.creadorId}">${gasto.nombreCreador}</a>` : (gasto.nombreCreador || "Sistema");

        // --- ICONO AÑADIDO ---
        const iconoComprobante = gasto.comprobanteURL ? `<a href="${gasto.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';

        itemContainer.innerHTML = `
            <div class="item-summary">
                <div class="expense-info">
                    <span class="expense-description">${gasto.descripcion}${iconoComprobante}</span> {/* <-- Icono añadido */}
                    <span class="expense-details">Registrado por: ${creadorLink} | ${gasto.categoria} - ${fechaFormateada} | Estado: ${gasto.status}</span>
                </div>
                <span class="expense-amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span>
            </div>
            {/* --- DIV PARA DETALLES AÑADIDO --- */}
            <div class="item-details-view" style="display: none;"></div> 
        `;
        expenseListContainer.appendChild(itemContainer);
    });
}

    function cargarBorradores() {
        // ... (sin cambios internos, usa draftsSection, draftsListContainer)
         const currentUser = auth.currentUser; // Renombramos
        if (!currentUser || !adminUidGlobal) return;

        db.collection('gastos')
            .where('adminUid', '==', adminUidGlobal)
            .where('creadoPor', '==', currentUser.uid) // Usamos currentUser
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

    // --- NUEVO LISTENER PARA EXPANDIR DETALLES DEL HISTORIAL ---
expenseListContainer.addEventListener('click', (e) => {
    // Ignorar clics en enlaces (como el del creador o el icono)
    if (e.target.tagName === 'A' || e.target.closest('a')) return;

    const itemElement = e.target.closest('.expense-item');
    if (!itemElement) return;

    const detailsContainer = itemElement.querySelector('.item-details-view');
    const gastoId = itemElement.dataset.id;

    // Buscar los datos del gasto en el array global
    const gasto = historialDeGastos.find(g => g.id === gastoId);

    if (!detailsContainer || !gasto) return;

    const isVisible = detailsContainer.style.display === 'block';

    if (isVisible) {
        detailsContainer.style.display = 'none';
    } else {
        // Construir el HTML de los detalles
        let detailsHTML = `<p><strong>Método de Pago:</strong> ${gasto.metodoPago || 'N/A'}</p>`;
        if (gasto.empresa) {
            detailsHTML += `<p><strong>Cliente/Empresa:</strong> ${gasto.empresa}</p>`;
        }
        if (gasto.proyectoNombre) {
            detailsHTML += `<p><strong>Proyecto:</strong> ${gasto.proyectoNombre}</p>`;
        }
        if (gasto.comentarios) {
            detailsHTML += `<p><strong>Comentarios:</strong> ${gasto.comentarios}</p>`;
        }

        if (gasto.impuestos && gasto.impuestos.length > 0) {
            detailsHTML += '<h4>Impuestos Desglosados</h4><div class="tax-breakdown">';
            gasto.impuestos.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (gasto.monto * imp.valor) / 100 : imp.valor;
                detailsHTML += `<div class="tax-line"><span>- ${imp.nombre}</span><span>$${montoImpuesto.toLocaleString('es-MX')}</span></div>`;
            });
            detailsHTML += '</div>';
        }

        // Si no hay detalles extra, mostrar un mensaje
        if (!gasto.empresa && !gasto.proyectoNombre && !gasto.comentarios && (!gasto.impuestos || gasto.impuestos.length === 0)) {
             detailsHTML += '<p>No hay detalles adicionales para este registro.</p>';
        }


        detailsContainer.innerHTML = detailsHTML;
        detailsContainer.style.display = 'block';
    }
});
    
    function mostrarBorradores() {
        // ... (sin cambios internos, usa draftsSection, draftsListContainer)
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


}); // Fin de auth.onAuthStateChanged
