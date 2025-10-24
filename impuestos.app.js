import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

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
const backButton = document.getElementById('back-button');

let adminUidGlobal = null; // Variable global para el adminUid

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- CORRECCIÓN 1: Identificamos el rol y el adminUid correcto ---
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        adminUidGlobal = userData.adminUid || user.uid;

        // Configuramos la UI según el rol
        if (userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
        } else {
            backButton.href = 'dashboard.html';
        }

        // Cargamos todos los datos iniciales usando el adminUid correcto
        cargarImpuestosDefinidos(adminUidGlobal);
        await poblarFiltros(adminUidGlobal); 
        cargarCuentasEnSelector(adminUidGlobal);
        cargarMovimientosDeImpuestos(adminUidGlobal); 
    } else {
        window.location.href = 'index.html';
    }
});

addTaxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!adminUidGlobal) return alert("Error de autenticación.");

    // --- CORRECCIÓN 2: El nuevo impuesto se asocia al adminUidGlobal ---
    db.collection('impuestos_definiciones').add({
        nombre: addTaxForm['tax-name'].value,
        tipo: addTaxForm['tax-type'].value,
        valor: parseFloat(addTaxForm['tax-value'].value),
        fechaDeCreacion: new Date(),
        adminUid: adminUidGlobal
    }).then(() => {
        alert("¡El impuesto ha sido guardado!");
        addTaxForm.reset();
    }).catch(error => console.error("Error al guardar el impuesto: ", error));
});

function cargarImpuestosDefinidos(adminUid) {
    // --- CORRECCIÓN 3: Todas las funciones ahora usan el adminUid que reciben ---
    db.collection('impuestos_definiciones').where('adminUid', '==', adminUid).orderBy('nombre').onSnapshot(snapshot => {
        taxesListContainer.innerHTML = '';
        if (snapshot.empty) {
            taxesListContainer.innerHTML = '<p>Aún no has definido ningún tipo de impuesto.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const tax = doc.data();
            const itemElement = document.createElement('div');
            itemElement.classList.add('account-item');
            itemElement.innerHTML = `
                <div class="account-info"><div class="account-name">${tax.nombre}</div></div>
                <div class="header-actions">
                    <div class="account-balance">${tax.tipo === 'porcentaje' ? `${tax.valor}%` : `$${tax.valor.toLocaleString('es-MX')}`}</div>
                    <button class="btn-secondary download-tax-btn" data-tax-name="${tax.nombre}">Descargar</button>
                </div>
            `;
            taxesListContainer.appendChild(itemElement);
        });
    });
}

async function poblarFiltros(adminUid) {
    monthFilter.innerHTML = '<option value="todos">Todos los meses</option>';
    let fecha = new Date();
    for (let i = 0; i < 12; i++) {
        const value = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const text = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        monthFilter.appendChild(new Option(text, value));
        fecha.setMonth(fecha.getMonth() - 1);
    }
    const snapshot = await db.collection('impuestos_definiciones').where('adminUid', '==', adminUid).orderBy('nombre').get();
    taxTypeFilter.innerHTML = '<option value="todos">Todos los tipos</option>';
    snapshot.forEach(doc => {
        taxTypeFilter.appendChild(new Option(doc.data().nombre, doc.data().nombre));
    });
}

function cargarCuentasEnSelector(adminUid) {
    db.collection('cuentas').where('adminUid', '==', adminUid).orderBy('nombre').onSnapshot(snapshot => {
        paymentAccountSelect.innerHTML = '<option value="" disabled selected>Selecciona una cuenta</option>';
        snapshot.forEach(doc => {
            const cuenta = doc.data();
            paymentAccountSelect.appendChild(new Option(`${cuenta.nombre} ($${(cuenta.saldoActual || 0).toLocaleString('es-MX')})`, doc.id));
        });
    });
}

function cargarMovimientosDeImpuestos() {
    if (!adminUidGlobal) return;
    let query = db.collection('movimientos_impuestos').where('adminUid', '==', adminUidGlobal);

    if (statusFilter.value !== 'todos') query = query.where('status', '==', statusFilter.value);
    if (monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        query = query.where('fecha', '>=', startDate).where('fecha', '<', endDate);
    }
    if (taxTypeFilter.value !== 'todos') query = query.where('tipoImpuesto', '==', taxTypeFilter.value);
    
    query.orderBy('fecha', 'desc').onSnapshot(snapshot => {
        const movimientos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarMovimientos(movimientos);
    }, error => {
        console.error("Error al obtener movimientos:", error);
        alert("Error al cargar movimientos. Es posible que necesites crear un índice en Firestore (revisa la consola F12 para ver el enlace).");
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
        const checkboxHTML = mov.status === 'pendiente de pago' ? `<td><input type="checkbox" class="tax-checkbox" data-id="${mov.id}" data-monto="${mov.monto}"></td>` : '<td></td>';
        row.innerHTML = `${checkboxHTML}<td>${fecha}</td><td>${mov.origen}</td><td>${mov.tipoImpuesto}</td><td>$${(mov.monto || 0).toLocaleString('es-MX')}</td><td><span class="status status-${(mov.status || '').replace(/ /g, '-')}">${mov.status}</span></td>`;
        taxMovementsContainer.appendChild(row);
    });
}

paySelectedBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user || !adminUidGlobal) return;

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
            if ((cuentaDoc.data().saldoActual || 0) < totalAPagar) throw "No hay saldo suficiente en la cuenta.";
            
            idsAPagar.forEach(id => transaction.update(db.collection('movimientos_impuestos').doc(id), { status: 'pagado' }));
            
            transaction.set(db.collection('gastos').doc(), {
                descripcion: `Pago de impuestos consolidados (${idsAPagar.length} items)`,
                monto: totalAPagar, totalConImpuestos: totalAPagar, categoria: 'Impuestos', fecha: new Date().toISOString().split('T')[0], status: 'aprobado',
                cuentaId: cuentaId, cuentaNombre: paymentAccountSelect.options[paymentAccountSelect.selectedIndex].text.split(' (')[0],
                creadoPor: user.uid, nombreCreador: "Sistema", adminUid: adminUidGlobal, fechaDeCreacion: new Date()
            });
            transaction.update(cuentaRef, { saldoActual: (cuentaDoc.data().saldoActual - totalAPagar) });
        });
        alert('¡Pago de impuestos registrado exitosamente!');
    } catch (error) {
        console.error("Error en la transacción de pago de impuestos: ", error);
        alert("Error: " + error.message);
    }
});

async function descargarRegistrosImpuesto(nombreImpuesto, adminUid) {
    if (!adminUid || !nombreImpuesto) return;
    alert(`Preparando la descarga de todos los movimientos para: ${nombreImpuesto}...`);
    try {
        const movimientosSnapshot = await db.collection('movimientos_impuestos').where('adminUid', '==', adminUid).where('tipoImpuesto', '==', nombreImpuesto).get();
        const registros = movimientosSnapshot.docs.map(doc => {
            const data = doc.data();
            return { Fecha: data.fecha.toDate().toISOString().split('T')[0], Origen: data.origen, Monto: data.monto, Estado: data.status };
        });
        if (registros.length === 0) return alert(`No se encontraron movimientos para el impuesto "${nombreImpuesto}".`);
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Movimientos-${nombreImpuesto.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros de impuesto:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

// --- EVENT LISTENERS (AHORA USAN adminUidGlobal) ---
taxesListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('download-tax-btn')) {
        descargarRegistrosImpuesto(e.target.dataset.taxName, adminUidGlobal);
    }
});
taxTypeFilter.addEventListener('change', () => cargarMovimientosDeImpuestos(adminUidGlobal));
monthFilter.addEventListener('change', () => cargarMovimientosDeImpuestos(adminUidGlobal));
statusFilter.addEventListener('change', () => cargarMovimientosDeImpuestos(adminUidGlobal));

taxMovementsContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('tax-checkbox')) {
        const selectedCount = document.querySelectorAll('.tax-checkbox:checked').length;
        paymentSection.style.display = selectedCount > 0 ? 'block' : 'none';
        selectedCountSpan.textContent = selectedCount;
    }
});
