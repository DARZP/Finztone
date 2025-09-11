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
const taxMovementsContainer = document.getElementById('tax-movements-list'); // Contenedor para el historial

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(user => {
    if (user) {
        cargarImpuestosDefinidos();
        cargarMovimientosDeImpuestos(); // <--- Llamamos a la nueva función
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
    })
    .then(() => {
        alert(`¡El impuesto "${taxName}" ha sido guardado!`);
        addTaxForm.reset();
    })
    .catch(error => console.error("Error al guardar el impuesto: ", error));
});

function cargarImpuestosDefinidos() {
    db.collection('impuestos_definiciones').orderBy('nombre')
      .onSnapshot(snapshot => {
        taxesListContainer.innerHTML = '';
        if (snapshot.empty) {
            taxesListContainer.innerHTML = '<p>Aún no has definido ningún tipo de impuesto o deducción.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const tax = doc.data();
            const itemElement = document.createElement('div');
            itemElement.classList.add('account-item');
            const valorDisplay = tax.tipo === 'porcentaje' ? `${tax.valor}%` : `$${tax.valor.toLocaleString('es-MX')}`;
            itemElement.innerHTML = `
                <div class="account-info">
                    <div class="account-name">${tax.nombre}</div>
                </div>
                <div class="account-balance">${valorDisplay}</div>
            `;
            taxesListContainer.appendChild(itemElement);
        });
    });
}

// ¡ESTA ES LA FUNCIÓN QUE FALTABA!
// Carga y muestra el historial de movimientos de impuestos
function cargarMovimientosDeImpuestos() {
    db.collection('movimientos_impuestos').orderBy('fecha', 'desc')
      .onSnapshot(snapshot => {
        if (!taxMovementsContainer) return;
        taxMovementsContainer.innerHTML = '';
        if (snapshot.empty) {
            taxMovementsContainer.innerHTML = '<tr><td colspan="5">No hay movimientos de impuestos registrados.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const mov = doc.data();
            const fecha = mov.fecha.toDate().toLocaleDateString('es-ES');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${fecha}</td>
                <td>${mov.origen}</td>
                <td>${mov.tipoImpuesto}</td>
                <td>$${mov.monto.toLocaleString('es-MX')}</td>
                <td><span class="status status-${mov.status.replace(/ /g, '-')}">${mov.status}</span></td>
            `;
            taxMovementsContainer.appendChild(row);
        });
    });
}
