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

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(user => {
    if (user) {
        cargarImpuestosDefinidos();
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
        taxMovementsContainer.innerHTML = '';
        if (snapshot.empty) {
            taxMovementsContainer.innerHTML = '<tr><td colspan="5">No hay movimientos de impuestos registrados.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const mov = doc.data();
            const fecha = mov.fecha.toDate().toLocaleDateString('es-ES');
            
            // Fila principal (visible)
            const row = document.createElement('tr');
            row.classList.add('tax-movement-item');
            row.dataset.id = doc.id; // Asignamos un ID para el click
            row.innerHTML = `
                <td>${fecha}</td>
                <td>${mov.origen}</td>
                <td>Consolidado (${mov.desglose.length} deducciones)</td>
                <td>$${mov.montoTotal.toLocaleString('es-MX')}</td>
                <td><span class="status status-${mov.status.replace(/ /g, '-')}">${mov.status}</span></td>
            `;

            // Fila de detalles (oculta)
            const detailsRow = document.createElement('tr');
            detailsRow.classList.add('details-row');
            detailsRow.dataset.detailsFor = doc.id; // La vinculamos a la fila principal
            
            let detailsHTML = '';
            mov.desglose.forEach(item => {
                detailsHTML += `
                    <div class="deduction-detail">
                        <span>- ${item.nombre}</span>
                        <span>$${item.monto.toLocaleString('es-MX')}</span>
                    </div>
                `;
            });

            detailsRow.innerHTML = `<td colspan="5" class="details-cell">${detailsHTML}</td>`;

            taxMovementsContainer.appendChild(row);
            taxMovementsContainer.appendChild(detailsRow);
        });
    });
}

taxMovementsContainer.addEventListener('click', (e) => {
    const mainRow = e.target.closest('.tax-movement-item');
    if (mainRow) {
        const detailsRow = taxMovementsContainer.querySelector(`[data-details-for="${mainRow.dataset.id}"]`);
        if (detailsRow) {
            const isVisible = detailsRow.style.display === 'table-row';
            detailsRow.style.display = isVisible ? 'none' : 'table-row';
        }
    }
});
