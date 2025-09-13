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

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(user => {
    if (user) {
        cargarImpuestosDefinidos();
        poblarFiltros();
        cargarMovimientosDeImpuestos();
    } else {
        window.location.href = 'index.html';
    }
});

addTaxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const taxName = addTaxForm['tax-name'].value;
    const taxType = addTaxForm['tax-type'].value;
    const taxValue = parseFloat(addTaxForm['tax-value'].value);

    db.collection('impuestos_definiciones').add({
        nombre: taxName, tipo: taxType, valor: taxValue, fechaDeCreacion: new Date()
    }).then(() => {
        alert(`¡El impuesto "${taxName}" ha sido guardado!`);
        addTaxForm.reset();
    }).catch(error => console.error("Error al guardar el impuesto: ", error));
});

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

// REESCRITO: Carga de movimientos con filtros directos a la base de datos
function cargarMovimientosDeImpuestos() {
    let query = db.collection('movimientos_impuestos');

    // Ahora los filtros funcionan directamente en la consulta, ¡mucho más eficiente!
    if (statusFilter.value !== 'todos') {
        query = query.where('status', '==', statusFilter.value);
    }
    if (taxTypeFilter.value !== 'todos') {
        query = query.where('tipoImpuesto', '==', taxTypeFilter.value);
    }
    if (monthFilter.value !== 'todos') {
        const [year, month] = monthFilter.value.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        query = query.where('fecha', '>=', startDate).where('fecha', '<', endDate);
    }
    
    query = query.orderBy('fecha', 'desc');

    query.onSnapshot(snapshot => {
        mostrarMovimientos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, error => {
        console.error("Error al obtener movimientos:", error);
        alert("Error al cargar los datos. Revisa la consola por si falta un índice de Firestore.");
    });
}

function mostrarMovimientos(movimientos) {
    taxMovementsContainer.innerHTML = '';
    if (movimientos.length === 0) {
        taxMovementsContainer.innerHTML = '<tr><td colspan="5">No se encontraron movimientos.</td></tr>';
        return;
    }
    movimientos.forEach(mov => {
        const fecha = mov.fecha.toDate().toLocaleDateString('es-ES');
        const row = document.createElement('tr');

        const esConsolidado = mov.desglose && mov.desglose.length > 0;

        const tipoDisplay = esConsolidado ? `Consolidado (${mov.desglose.length} ded.)` : mov.tipoImpuesto;
        const montoDisplay = mov.montoTotal !== undefined ? mov.montoTotal : mov.monto;

        if (esConsolidado) {
            row.classList.add('tax-movement-item');
            row.dataset.id = mov.id;
        }

        row.innerHTML = `
            <td>${fecha}</td>
            <td>${mov.origen}</td>
            <td>${mov.tipoImpuesto}</td>
            <td>$${mov.monto.toLocaleString('es-MX')}</td>
            <td><span class="status status-${mov.status.replace(/ /g, '-')}">${mov.status}</span></td>
        `;
        
        taxMovementsContainer.appendChild(row);
    });
}

// Los listeners para los filtros se quedan igual
taxTypeFilter.addEventListener('change', cargarMovimientosDeImpuestos);
monthFilter.addEventListener('change', cargarMovimientosDeImpuestos);
statusFilter.addEventListener('change', cargarMovimientosDeImpuestos);
