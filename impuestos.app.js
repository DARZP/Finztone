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

// --- Elementos del DOM ---
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

// --- LÓGICA DE DESCARGA ---

async function descargarRegistrosImpuesto(nombreImpuesto) {
    const user = auth.currentUser;
    if (!user || !nombreImpuesto) return;
    alert(`Preparando la descarga de todos los movimientos para: ${nombreImpuesto}...`);

    try {
        const movimientosSnapshot = await db.collection('movimientos_impuestos')
            .where('adminUid', '==', user.uid)
            .where('tipoImpuesto', '==', nombreImpuesto)
            .get();

        const registros = [];
        movimientosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha.toDate().toISOString().split('T')[0],
                Origen: data.origen,
                Monto: data.monto,
                Estado: data.status
            });
        });

        if (registros.length === 0) {
            return alert(`No se encontraron movimientos para el impuesto "${nombreImpuesto}".`);
        }
        
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Movimientos-${nombreImpuesto.replace(/ /g, '_')}`);

    } catch (error) {
        console.error("Error al descargar registros de impuesto:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---

auth.onAuthStateChanged(async (user) => {
    if (user) {
        cargarImpuestosDefinidos();
        await poblarFiltros(); 
        cargarCuentasEnSelector();
        cargarMovimientosDeImpuestos(); 
    } else {
        window.location.href = 'index.html';
    }
});

addTaxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const taxName = addTaxForm['tax-name'].value;
    const taxType = addTaxForm['tax-type'].value;
    const taxValue = parseFloat(addTaxForm['tax-value'].value);

    db.collection('impuestos_definiciones').add({
        nombre: taxName,
        tipo: taxType,
        valor: taxValue,
        fechaDeCreacion: new Date(),
        adminUid: user.uid 
    }).then(() => {
        alert(`¡El impuesto "${taxName}" ha sido guardado!`);
        addTaxForm.reset();
    }).catch(error => console.error("Error al guardar el impuesto: ", error));
});

function cargarImpuestosDefinidos() {
    const user = auth.currentUser;
    if (!user) return;
    db.collection('impuestos_definiciones').where('adminUid', '==', user.uid).orderBy('nombre').onSnapshot(snapshot => {
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
                <div class="header-actions" style="display: flex; align-items: center; gap: 20px;">
                    <div class="account-balance">${valorDisplay}</div>
                    <button class="btn-secondary download-tax-btn" data-tax-name="${tax.nombre}">Descargar</button>
                </div>
            `;
            taxesListContainer.appendChild(itemElement);
        });
    });
}

taxesListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('download-tax-btn')) {
        const nombreImpuesto = e.target.dataset.taxName;
        descargarRegistrosImpuesto(nombreImpuesto);
    }
});

async function poblarFiltros() {
    const user = auth.currentUser;
    if (!user) return;

    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }

    // Usamos await para esperar a que la consulta termine
    const snapshot = await db.collection('impuestos_definiciones').where('adminUid', '==', user.uid).orderBy('nombre').get();
    
    taxTypeFilter.innerHTML = '<option value="todos">Todos los tipos</option>';
    snapshot.forEach(doc => {
        const taxName = doc.data().nombre;
        taxTypeFilter.appendChild(new Option(taxName, taxName));
    });
}


function cargarCuentasEnSelector() {
    const user = auth.currentUser;
    if (!user) return;
    db.collection('cuentas').where('adminUid', '==', user.uid).orderBy('nombre').onSnapshot(snapshot => {
        const selectedValue = paymentAccountSelect.value;
        paymentAccountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            const option = new Option(`${cuenta.nombre} ($${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`, doc.id);
            paymentAccountSelect.appendChild(option);
        });
        paymentAccountSelect.value = selectedValue;
    });
}

function cargarMovimientosDeImpuestos() {
    const user = auth.currentUser;
    if (!user) return;
    let query = db.collection('movimientos_impuestos').where('adminUid', '==', user.uid);

    if (statusFilter.value !== 'todos') {
        query = query.where('status', '==', statusFilter.value);
    }
    if (monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        query = query.where('fecha', '>=', startDate).where('fecha', '<', endDate);
    }
    if (taxTypeFilter.value !== 'todos') {
        query = query.where('tipoImpuesto', '==', taxTypeFilter.value);
    }
    
    query = query.orderBy('fecha', 'desc');

    query.onSnapshot(snapshot => {
        const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarMovimientos(movimientos);
    }, error => {
        console.error("Error al obtener movimientos:", error);
        // Si ves este error, es probable que necesites crear un índice compuesto en Firestore.
        // Revisa la consola (F12) para ver el enlace de creación que provee Firebase.
        alert("Error al cargar movimientos. Revisa la consola (F12).");
    });
}

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

        row.innerHTML = `
            ${checkboxHTML}
            <td>${fecha}</td>
            <td>${mov.origen}</td>
            <td>${mov.tipoImpuesto}</td>
            <td>$${(mov.monto || 0).toLocaleString('es-MX')}</td>
            <td><span class="status status-${(mov.status || '').replace(/ /g, '-')}">${mov.status}</span></td>
        `;
        taxMovementsContainer.appendChild(row);
    });
}

taxMovementsContainer.addEventListener('click', (e) => { /* No hace nada por ahora, se puede dejar vacío */ });

taxTypeFilter.addEventListener('change', cargarMovimientosDeImpuestos);
monthFilter.addEventListener('change', cargarMovimientosDeImpuestos);
statusFilter.addEventListener('change', cargarMovimientosDeImpuestos);

paySelectedBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;
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
                totalConImpuestos: totalAPagar,
                categoria: 'Impuestos',
                fecha: new Date().toISOString().split('T')[0],
                status: 'aprobado',
                cuentaId: cuentaId,
                cuentaNombre: paymentAccountSelect.options[paymentAccountSelect.selectedIndex].text.split(' (')[0],
                creadoPor: user.uid,
                nombreCreador: "Administrador",
                adminUid: user.uid,
                fechaDeCreacion: new Date()
            });

            transaction.update(cuentaRef, { saldoActual: nuevoSaldo });
        });
        alert('¡Pago de impuestos registrado exitosamente!');
    } catch (error) {
        console.error("Error en la transacción de pago de impuestos: ", error);
        alert("Error: " + error);
    }
});

taxMovementsContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('tax-checkbox')) {
        const selectedCount = document.querySelectorAll('.tax-checkbox:checked').length;
        paymentSection.style.display = selectedCount > 0 ? 'block' : 'none';
        selectedCountSpan.textContent = selectedCount;
    }
});
