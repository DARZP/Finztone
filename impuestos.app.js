// impuestos.app.js (VERSIÓN FINAL CON DESCARGAS)

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
    if (!nombreImpuesto) return;
    alert(`Preparando la descarga de todos los movimientos para: ${nombreImpuesto}...`);

    try {
        const movimientosSnapshot = await db.collection('movimientos_impuestos').where('tipoImpuesto', '==', nombreImpuesto).get();

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

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Movimientos-${nombreImpuesto.replace(/ /g, '_')}`);

    } catch (error) {
        console.error("Error al descargar registros de impuesto:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---

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
        cargarImpuestosDefinidos(); // Recarga la lista
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
            
            // AÑADIMOS EL BOTÓN DE DESCARGA
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

// ... (resto de tus funciones: poblarFiltros, cargarCuentasEnSelector, etc., sin cambios) ...

// Listener para los botones de descarga en la lista de impuestos definidos
taxesListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('download-tax-btn')) {
        const nombreImpuesto = e.target.dataset.taxName;
        descargarRegistrosImpuesto(nombreImpuesto);
    }
});

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

function cargarMovimientosDeImpuestos() { /* ... (sin cambios) ... */ }
function mostrarMovimientos(movimientos) { /* ... (sin cambios) ... */ }
taxMovementsContainer.addEventListener('click', (e) => { /* ... (sin cambios) ... */ });
taxTypeFilter.addEventListener('change', cargarMovimientosDeImpuestos);
monthFilter.addEventListener('change', cargarMovimientosDeImpuestos);
statusFilter.addEventListener('change', cargarMovimientosDeImpuestos);
paySelectedBtn.addEventListener('click', async () => { /* ... (sin cambios) ... */ });
taxMovementsContainer.addEventListener('change', (e) => { /* ... (sin cambios) ... */ });
