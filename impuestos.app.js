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
const addTaxForm = document.getElementById('add-tax-form');
const taxesListContainer = document.getElementById('taxes-list');
const taxMovementsContainer = document.getElementById('tax-movements-list');
const taxTypeFilter = document.getElementById('tax-type-filter');
const monthFilter = document.getElementById('month-filter');
const statusFilter = document.getElementById('status-filter');
const paymentSection = document.getElementById('payment-section');
const paymentAccountSelect = document.getElementById('payment-account-select');
const paySelectedBtn = document.getElementById('pay-selected-btn');
const selectedCountSpan = document.getElementById('selected-count');

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(user => {
    if (user) {
        cargarImpuestosDefinidos();
        poblarFiltros();
        cargarCuentasEnSelector();
        cargarMovimientosDeImpuestos();
    } else {
        window.location.href = 'index.html';
    }
});

// Lógica para crear una nueva definición de impuesto
addTaxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const taxName = addTaxForm['tax-name'].value;
    const taxType = addTaxForm['tax-type'].value;
    const taxValue = parseFloat(addTaxForm['tax-value'].value);

    db.collection('impuestos_definiciones').add({
        nombre: taxName,
        tipo: taxType,
        valor: taxValue,
        fechaDeCreacion: new Date()
    }).then(() => {
        alert(`¡El impuesto "${taxName}" ha sido guardado!`);
        addTaxForm.reset();
    }).catch(error => console.error("Error al guardar el impuesto: ", error));
});

// Carga y muestra la lista de impuestos definidos
function cargarImpuestosDefinidos() {
    db.collection('impuestos_definiciones').orderBy('nombre').onSnapshot(snapshot => {
        taxesListContainer.innerHTML = '';
        if (snapshot.empty) {
            taxesListContainer.innerHTML = '<p>Aún no has definido ningún tipo de impuesto.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const tax = doc.data();
            const itemElement = document.createElement('div');
            itemElement.classList.add('account-item');
            const valorDisplay = tax.tipo === 'porcentaje' ? `${tax.valor}%` : `$${tax.valor.toLocaleString('es-MX')}`;
            itemElement.innerHTML = `
                <div class="account-info"><div class="account-name">${tax.nombre}</div></div>
                <div class="account-balance">${valorDisplay}</div>
            `;
            taxesListContainer.appendChild(itemElement);
        });
    });
}

// Puebla los menús de filtro
function poblarFiltros() {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
    db.collection('impuestos_definiciones').orderBy('nombre').get().then(snapshot => {
        taxTypeFilter.innerHTML = '<option value="todos">Todos los tipos</option>';
        snapshot.forEach(doc => {
            const taxName = doc.data().nombre;
            taxTypeFilter.appendChild(new Option(taxName, taxName));
        });
    });
}

// Carga las cuentas en el selector de pago
function cargarCuentasEnSelector() {
    db.collection('cuentas').orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = paymentAccountSelect.value;
        paymentAccountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const option = new Option(`${cuenta.nombre} ($${cuenta.saldoActual.toLocaleString('es-MX')})`, doc.id);
            paymentAccountSelect.appendChild(option);
        });
        paymentAccountSelect.value = selectedValue;
    });
}

// Carga los movimientos de impuestos aplicando los filtros
function cargarMovimientosDeImpuestos() {
    let query = db.collection('movimientos_impuestos');

    if (statusFilter.value !== 'todos') {
        query = query.where('status', '==', statusFilter.value);
    }
    if (monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        query = query.where('fecha', '>=', startDate).where('fecha', '<', endDate);
    }
    
    query = query.orderBy('fecha', 'desc');

    query.onSnapshot(snapshot => {
        const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const tipoImpuestoFiltrado = taxTypeFilter.value;
        const movimientosFiltrados = tipoImpuestoFiltrado === 'todos'
            ? movimientos
            : movimientos.filter(mov => {
                if (mov.desglose) {
                    return mov.desglose.some(d => d.nombre === tipoImpuestoFiltrado);
                } else {
                    return mov.tipoImpuesto === tipoImpuestoFiltrado;
                }
            });
        mostrarMovimientos(movimientosFiltrados);
    }, error => {
        console.error("Error al obtener movimientos:", error);
    });
}

// Muestra el historial de movimientos en la tabla
function mostrarMovimientos(movimientos) {
    taxMovementsContainer.innerHTML = '';
    if (movimientos.length === 0) {
        taxMovementsContainer.innerHTML = '<tr><td colspan="6">No se encontraron movimientos.</td></tr>';
        return;
    }
    movimientos.forEach(mov => {
        const fecha = mov.fecha.toDate().toLocaleDateString('es-ES');
        const row = document.createElement('tr');
        
        const checkboxHTML = mov.status === 'pendiente de pago'
            ? `<td><input type="checkbox" class="tax-checkbox" data-id="${mov.id}" data-monto="${mov.montoTotal || mov.monto}"></td>`
            : '<td></td>';

        const esConsolidado = mov.desglose && mov.desglose.length > 0;
        const tipoDisplay = esConsolidado ? `Consolidado (${mov.desglose.length} ded.)` : mov.tipoImpuesto;
        const montoDisplay = mov.montoTotal !== undefined ? mov.montoTotal : mov.monto;

        if (esConsolidado) {
            row.classList.add('tax-movement-item');
            row.dataset.id = mov.id;
        }

        row.innerHTML = `
            ${checkboxHTML}
            <td>${fecha}</td>
            <td>${mov.origen}</td>
            <td>${tipoDisplay}</td>
            <td>$${montoDisplay.toLocaleString('es-MX')}</td>
            <td><span class="status status-${mov.status.replace(/ /g, '-')}">${mov.status}</span></td>
        `;
        
        taxMovementsContainer.appendChild(row);

        if (esConsolidado) {
            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('details-row');
            detailsRow.dataset.detailsFor = mov.id;
            let detailsHTML = '';
            mov.desglose.forEach(item => {
                detailsHTML += `<div class="deduction-detail"><span>- ${item.nombre}</span><span>$${item.monto.toLocaleString('es-MX')}</span></div>`;
            });
            detailsRow.innerHTML = `<td colspan="6">${detailsHTML}</td>`;
            taxMovementsContainer.appendChild(detailsRow);
        }
    });
}

// Listener para desplegar detalles
taxMovementsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tax-checkbox')) return;
    const mainRow = e.target.closest('.tax-movement-item');
    if (mainRow) {
        const detailsRow = taxMovementsContainer.querySelector(`[data-details-for="${mainRow.dataset.id}"]`);
        if (detailsRow) {
            detailsRow.style.display = detailsRow.style.display === 'table-row' ? 'none' : 'table-row';
        }
    }
});

// Listeners para los filtros
taxTypeFilter.addEventListener('change', cargarMovimientosDeImpuestos);
monthFilter.addEventListener('change', cargarMovimientosDeImpuestos);
statusFilter.addEventListener('change', cargarMovimientosDeImpuestos);

// Lógica para el botón de pagar
paySelectedBtn.addEventListener('click', async () => {
    const selectedCheckboxes = document.querySelectorAll('.tax-checkbox:checked');
    const cuentaId = paymentAccountSelect.value;

    if (selectedCheckboxes.length === 0) return alert('No has seleccionado ningún impuesto para pagar.');
    if (!cuentaId) return alert('Por favor, selecciona una cuenta de origen para el pago.');

    let totalAPagar = 0;
    const idsAPagar = [];
    selectedCheckboxes.forEach(cb => {
        totalAPagar += parseFloat(cb.dataset.monto);
        idsAPagar.push(cb.dataset.id);
    });

    if (!confirm(`El total a pagar es $${totalAPagar.toLocaleString()}. ¿Proceder con el pago?`)) return;

    const cuentaRef = db.collection('cuentas').doc(cuentaId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const cuentaDoc = await transaction.get(cuentaRef);
            if (!cuentaDoc.exists) throw "La cuenta no existe.";
            const saldoActual = cuentaDoc.data().saldoActual;
            if (saldoActual < totalAPagar) throw "No hay saldo suficiente en la cuenta.";
            
            const nuevoSaldo = saldoActual - totalAPagar;

            idsAPagar.forEach(id => {
                const movRef = db.collection('movimientos_impuestos').doc(id);
                transaction.update(movRef, { status: 'pagado' });
            });
            
            const newExpenseRef = db.collection('gastos').doc();
            transaction.set(newExpenseRef, {
                descripcion: `Pago de impuestos consolidados (${idsAPagar.length} items)`,
                monto: totalAPagar,
                categoria: 'Impuestos',
                fecha: new Date().toISOString().split('T')[0],
                status: 'aprobado',
                cuentaId: cuentaId,
                cuentaNombre: paymentAccountSelect.options[paymentAccountSelect.selectedIndex].text.split(' (')[0],
                creadoPor: auth.currentUser.uid,
                nombreCreador: "Administrador",
                fechaDeCreacion: new Date()
            });

            transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
        });
        alert('¡Pago de impuestos registrado exitosamente!');
        cargarCuentasEnSelector();
    } catch (error) {
        console.error("Error en la transacción de pago de impuestos: ", error);
        alert("Error: " + error);
    }
});

// Listener para mostrar/ocultar la sección de pago
taxMovementsContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('tax-checkbox')) {
        const selectedCount = document.querySelectorAll('.tax-checkbox:checked').length;
        paymentSection.style.display = selectedCount > 0 ? 'block' : 'none';
        selectedCountSpan.textContent = selectedCount;
    }
});
