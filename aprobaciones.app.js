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
    const user = auth.currentUser;
    if(!user) return;
    listaDeCuentas = [];
    const snapshot = await db.collection('cuentas').where('adminUid', '==', user.uid).orderBy('nombre').get();
    snapshot.forEach(doc => {
        listaDeCuentas.push({ id: doc.id, ...doc.data() });
    });
}

function generarSelectorDeCuentas(itemId) {
    let optionsHTML = '<option value="" disabled selected>Seleccionar cuenta</option>';
    listaDeCuentas.forEach(cuenta => {
        const etiqueta = cuenta.tipo === 'credito' ? 'Crédito' : 'Débito';
        optionsHTML += `<option value="${cuenta.id}">${cuenta.nombre} (${etiqueta})</option>`;
    });
    return `<select class="account-selector" data-item-id="${itemId}">${optionsHTML}</select>`;
}

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) { tabcontent[i].style.display = "none"; }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}
      
async function aprobarDocumento(coleccion, docId, tipo) {
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación.");

    const itemElement = document.querySelector(`[data-id="${docId}"]`);
    const accountSelector = itemElement.querySelector(`.account-selector`);
    const cuentaId = accountSelector.value;

    if (!cuentaId) {
        return alert('Por favor, selecciona una cuenta para aprobar.');
    }

    const docRef = db.collection(coleccion).doc(docId);
    const accountRef = db.collection('cuentas').doc(cuentaId);

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            const accountDoc = await transaction.get(accountRef);
            if (!doc.exists || !accountDoc.exists) throw "El registro o la cuenta ya no existen.";

            const data = doc.data();
            const cuentaData = accountDoc.data();
            const montoPrincipal = data.monto;
            const montoTotal = data.totalConImpuestos || data.monto;
            const impuestos = data.impuestos || [];

            if (tipo === 'gasto') {
                if (cuentaData.tipo === 'credito') {
                    const nuevaDeuda = (cuentaData.deudaActual || 0) + montoTotal;
                    transaction.update(accountRef, { deudaActual: nuevaDeuda });
                } else {
                    const nuevoSaldo = (cuentaData.saldoActual || 0) - montoTotal;
                    if (nuevoSaldo < 0) throw "Saldo insuficiente en la cuenta.";
                    transaction.update(accountRef, { saldoActual: nuevoSaldo });
                }
            } else {
                if (cuentaData.tipo === 'credito') throw "No se pueden aprobar ingresos directamente a una tarjeta de crédito.";
                const nuevoSaldo = (cuentaData.saldoActual || 0) + montoTotal;
                transaction.update(accountRef, { saldoActual: nuevoSaldo });
            }
            
            transaction.update(docRef, { 
                status: 'aprobado', 
                cuentaId: cuentaId, 
                cuentaNombre: accountDoc.data().nombre,
                adminUid: user.uid
            });
            
            impuestos.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (montoPrincipal * imp.valor) / 100 : imp.valor;
                const taxMovRef = db.collection('movimientos_impuestos').doc();
                const estadoImpuesto = tipo === 'gasto' ? 'pagado' : 'pagado (retenido)';
                
                transaction.set(taxMovRef, {
                    origen: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} - ${data.descripcion}`,
                    tipoImpuesto: imp.nombre,
                    monto: montoImpuesto,
                    fecha: new Date(),
                    status: estadoImpuesto,
                    adminUid: user.uid
                });
            });
        });
        alert('¡Solicitud aprobada y cuenta actualizada!');
    } catch (error) {
        console.error("Error en la transacción de aprobación: ", error);
        alert("Ocurrió un error al aprobar: " + error);
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

function poblarFiltros() {
    const user = auth.currentUser;
    if(!user) return;
    gastosCategoryFilter.innerHTML = `<option value="todos">Todas</option><option>Comida</option><option>Transporte</option><option>Oficina</option><option>Marketing</option><option>Otro</option>`;
    ingresosCategoryFilter.innerHTML = `<option value="todos">Todas</option><option>Cobro de Factura</option><option>Venta de Producto</option><option>Servicios Profesionales</option><option>Otro</option>`;
    db.collection('usuarios').where('adminUid', '==', user.uid).orderBy('nombre').get().then(snapshot => {
        let userOptionsHTML = '<option value="todos">Todos</option>';
        snapshot.forEach(doc => {
            const userData = doc.data();
            userOptionsHTML += `<option value="${doc.id}">${userData.nombre}</option>`;
        });
        gastosUserFilter.innerHTML = userOptionsHTML;
        ingresosUserFilter.innerHTML = userOptionsHTML;
    });
}

function cargarGastosPendientes() {
    const user = auth.currentUser;
    if(!user) return;
    let query = db.collection('gastos').where('adminUid', '==', user.uid).where('status', '==', 'pendiente');
    if (gastosCategoryFilter.value && gastosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', gastosCategoryFilter.value);
    }
    if (gastosUserFilter.value && gastosUserFilter.value !== 'todos') {
        query = query.where('creadorId', '==', gastosUserFilter.value);
    }
    query = query.orderBy('fechaDeCreacion', 'asc');
    query.onSnapshot(snapshot => {
        const pendientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastosPendientes(pendientes);
    });
}

function cargarIngresosPendientes() {
    const user = auth.currentUser;
    if(!user) return;
    let query = db.collection('ingresos').where('adminUid', '==', user.uid).where('status', '==', 'pendiente');
    if (ingresosCategoryFilter.value && ingresosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', ingresosCategoryFilter.value);
    }
    if (ingresosUserFilter.value && ingresosUserFilter.value !== 'todos') {
        query = query.where('creadorId', '==', ingresosUserFilter.value);
    }
    query = query.orderBy('fechaDeCreacion', 'asc');
    query.onSnapshot(snapshot => {
        const pendientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarIngresosPendientes(pendientes);
    });
}

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
                    <div><span class="description">${gasto.descripcion}</span><span class="amount">$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</span></div>
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
                ${gasto.comprobanteURL ? `<p><strong>Comprobante:</strong> <a href="${gasto.comprobanteURL}" target="_blank" class="link">Ver Archivo Adjunto</a></p>` : ''}
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
                    <div><span class="description">${ingreso.descripcion}</span><span class="amount">$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</span></div>
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
                ${ingreso.comprobanteURL ? `<p><strong>Comprobante:</strong> <a href="${ingreso.comprobanteURL}" target="_blank" class="link">Ver Archivo Adjunto</a></p>` : ''}
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

function setupClickListeners() {
    const listContainers = [pendingGastosContainer, pendingIngresosContainer];
    listContainers.forEach(container => {
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn') || e.target.tagName === 'SELECT') return;
            const item = e.target.closest('.pending-item');
            if (item) {
                const details = item.querySelector('.item-details-view');
                if (details) {
                    details.style.display = details.style.display === 'block' ? 'none' : 'block';
                }
            }
        });
    });
}

gastosCategoryFilter.addEventListener('change', cargarGastosPendientes);
gastosUserFilter.addEventListener('change', cargarGastosPendientes);
ingresosCategoryFilter.addEventListener('change', cargarIngresosPendientes);
ingresosUserFilter.addEventListener('change', cargarIngresosPendientes);
