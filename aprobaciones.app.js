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
const pendingGastosContainer = document.getElementById('pending-gastos-list');
const pendingIngresosContainer = document.getElementById('pending-ingresos-list');
const gastosCategoryFilter = document.getElementById('gastos-category-filter');
const gastosUserFilter = document.getElementById('gastos-user-filter');
const ingresosCategoryFilter = document.getElementById('ingresos-category-filter');
const ingresosUserFilter = document.getElementById('ingresos-user-filter');

// --- DATOS GLOBALES ---
let listaDeCuentas = [];

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarCuentas().then(() => {
            poblarFiltros();
            cargarGastosPendientes();
            cargarIngresosPendientes();
            setupClickListeners();
        });
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarCuentas() {
    listaDeCuentas = [];
    const snapshot = await db.collection('cuentas').orderBy('nombre').get();
    snapshot.forEach(doc => {
        listaDeCuentas.push({ id: doc.id, ...doc.data() });
    });
}

function generarSelectorDeCuentas(itemId) {
    let optionsHTML = '<option value="" disabled selected>Seleccionar cuenta</option>';
    listaDeCuentas.forEach(cuenta => {
        optionsHTML += `<option value="${cuenta.id}">${cuenta.nombre}</option>`;
    });
    return `<select class="account-selector" data-item-id="${itemId}">${optionsHTML}</select>`;
}

function openTab(evt, tabName) { /* ... (Sin cambios) ... */ }

async function aprobarDocumento(coleccion, docId, tipo) {
    const itemElement = document.querySelector(`[data-id="${docId}"]`);
    const accountSelector = itemElement.querySelector(`.account-selector`);
    const cuentaId = accountSelector.value;
    if (!cuentaId) {
        return alert('Por favor, selecciona una cuenta para aprobar esta transacción.');
    }
    const cuentaNombre = accountSelector.options[accountSelector.selectedIndex].text;
    const docRef = db.collection(coleccion).doc(docId);
    const accountRef = db.collection('cuentas').doc(cuentaId);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            const accountDoc = await transaction.get(accountRef);
            if (!doc.exists || !accountDoc.exists) throw "El registro o la cuenta ya no existen.";
            const monto = doc.data().monto;
            const saldoActual = accountDoc.data().saldoActual;
            const nuevoSaldo = tipo === 'ingreso' ? saldoActual + monto : saldoActual - monto;
            transaction.update(docRef, { status: 'aprobado', cuentaId: cuentaId, cuentaNombre: cuentaNombre });
            transaction.update(accountRef, { saldoActual: nuevoSaldo });
        });
        alert('¡Solicitud aprobada y saldo de cuenta actualizado!');
        cargarCuentas();
    } catch (error) {
        console.error("Error en la transacción de aprobación: ", error);
        alert("Ocurrió un error al aprobar. La operación fue cancelada.");
    }
}

function rechazarDocumento(coleccion, id) {
    const motivo = prompt("Introduce el motivo del rechazo:");
    if (motivo) {
        db.collection(coleccion).doc(id).update({
            status: 'rechazado', motivoRechazo: motivo
        }).then(() => alert('Solicitud rechazada.'));
    }
}

function poblarFiltros() { /* ... (Sin cambios) ... */ }
function cargarGastosPendientes() { /* ... (Sin cambios) ... */ }
function cargarIngresosPendientes() { /* ... (Sin cambios) ... */ }

function mostrarGastosPendientes(gastos) {
    pendingGastosContainer.innerHTML = gastos.length === 0 ? '<p>No hay gastos pendientes.</p>' : '';
    gastos.forEach(gasto => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        itemElement.dataset.id = gasto.id;
        const fecha = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES');
        let taxDetailsHTML = '';
        if (gasto.impuestos && gasto.impuestos.length > 0) {
            taxDetailsHTML = '<h4>Desglose de Impuestos</h4><div class="tax-breakdown">';
            gasto.impuestos.forEach(tax => {
                const valor = tax.tipo === 'porcentaje' ? `${tax.valor}%` : `$${tax.valor}`;
                taxDetailsHTML += `<div class="tax-line"><span>- ${tax.nombre}</span><span>(${valor})</span></div>`;
            });
            taxDetailsHTML += '</div>';
        }
        itemElement.innerHTML = `
            <div class="item-summary">
                <div class="item-details">
                    <div><span class="description">${gasto.descripcion}</span><span class="amount">$${gasto.monto.toLocaleString('es-MX')}</span></div>
                    <div class="meta">Enviado por: ${gasto.nombreCreador || gasto.emailCreador} | Cat: ${gasto.categoria}</div>
                </div>
                <div class="item-actions">
                    ${generarSelectorDeCuentas(gasto.id)}
                    <button class="btn btn-approve">Aprobar</button>
                    <button class="btn btn-reject">Rechazar</button>
                </div>
            </div>
            <div class="item-details-view">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Empresa:</strong> ${gasto.empresa || 'N/A'}</p>
                <p><strong>Comentarios:</strong> ${gasto.comentarios || 'Ninguno'}</p>
                ${taxDetailsHTML}
            </div>`;
        pendingGastosContainer.appendChild(itemElement);
    });
    pendingGastosContainer.querySelectorAll('.btn-approve').forEach(btn => {
        const item = btn.closest('.pending-item');
        btn.addEventListener('click', () => aprobarDocumento('gastos', item.dataset.id, 'gasto'));
    });
    pendingGastosContainer.querySelectorAll('.btn-reject').forEach(btn => {
        const item = btn.closest('.pending-item');
        btn.addEventListener('click', () => rechazarDocumento('gastos', item.dataset.id));
    });
}

function mostrarIngresosPendientes(ingresos) {
    pendingIngresosContainer.innerHTML = ingresos.length === 0 ? '<p>No hay ingresos pendientes.</p>' : '';
    ingresos.forEach(ingreso => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        itemElement.dataset.id = ingreso.id;
        const fecha = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES');
        let taxDetailsHTML = '';
        if (ingreso.impuestos && ingreso.impuestos.length > 0) {
            taxDetailsHTML = '<h4>Desglose de Impuestos</h4><div class="tax-breakdown">';
            ingreso.impuestos.forEach(tax => {
                const valor = tax.tipo === 'porcentaje' ? `${tax.valor}%` : `$${tax.valor}`;
                taxDetailsHTML += `<div class="tax-line"><span>- ${tax.nombre}</span><span>(${valor})</span></div>`;
            });
            taxDetailsHTML += '</div>';
        }
        itemElement.innerHTML = `
            <div class="item-summary">
                <div class="item-details">
                    <div><span class="description">${ingreso.descripcion}</span><span class="amount">$${ingreso.monto.toLocaleString('es-MX')}</span></div>
                    <div class="meta">Enviado por: ${ingreso.nombreCreador || ingreso.emailCreador} | Cat: ${ingreso.categoria}</div>
                </div>
                <div class="item-actions">
                    ${generarSelectorDeCuentas(ingreso.id)}
                    <button class="btn btn-approve">Aprobar</button>
                    <button class="btn btn-reject">Rechazar</button>
                </div>
            </div>
            <div class="item-details-view">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Empresa:</strong> ${ingreso.empresa || 'N/A'}</p>
                <p><strong>Comentarios:</strong> ${ingreso.comentarios || 'Ninguno'}</p>
                ${taxDetailsHTML}
            </div>`;
        pendingIngresosContainer.appendChild(itemElement);
    });
    pendingIngresosContainer.querySelectorAll('.btn-approve').forEach(btn => {
        const item = btn.closest('.pending-item');
        btn.addEventListener('click', () => aprobarDocumento('ingresos', item.dataset.id, 'ingreso'));
    });
    pendingIngresosContainer.querySelectorAll('.btn-reject').forEach(btn => {
        const item = btn.closest('.pending-item');
        btn.addEventListener('click', () => rechazarDocumento('ingresos', item.dataset.id));
    });
}

function setupClickListeners() { /* ... (Sin cambios) ... */ }
gastosCategoryFilter.addEventListener('change', cargarGastosPendientes);
gastosUserFilter.addEventListener('change', cargarGastosPendientes);
ingresosCategoryFilter.addEventListener('change', cargarIngresosPendientes);
ingresosUserFilter.addEventListener('change', cargarIngresosPendientes);
