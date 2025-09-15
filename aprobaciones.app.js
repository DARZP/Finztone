// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
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

// --- LÓGICA DE LA PÁGINA ---

auth.onAuthStateChanged((user) => {
    if (user) {
        poblarFiltros();
        cargarGastosPendientes();
        cargarIngresosPendientes();
        setupClickListeners(); // Preparamos los clics para los desplegables
    } else {
        window.location.href = 'index.html';
    }
});

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

// Función simple para aprobar/rechazar (la mejoraremos en el siguiente paso)
function actualizarDocumento(coleccion, id, nuevoStatus) {
    const docRef = db.collection(coleccion).doc(id);
    let updateData = { status: nuevoStatus };
    if (nuevoStatus === 'rechazado') {
        const motivo = prompt("Por favor, introduce el motivo del rechazo:");
        if (motivo) { updateData.motivoRechazo = motivo; } else { return; }
    }
    docRef.update(updateData)
        .then(() => alert(`Solicitud ${nuevoStatus}.`))
        .catch(error => console.error("Error al actualizar:", error));
}

function poblarFiltros() {
    gastosCategoryFilter.innerHTML = `<option value="todos">Todas las Categorías</option><option>Comida</option><option>Transporte</option><option>Oficina</option><option>Marketing</option><option>Otro</option>`;
    ingresosCategoryFilter.innerHTML = `<option value="todos">Todas las Categorías</option><option>Cobro de Factura</option><option>Venta de Producto</option><option>Servicios Profesionales</option><option>Otro</option>`;
    db.collection('usuarios').where('rol', '==', 'empleado').orderBy('nombre').get().then(snapshot => {
        let userOptionsHTML = '<option value="todos">Todos los Colaboradores</option>';
        snapshot.forEach(doc => {
            const user = doc.data();
            // Guardamos el UID de Auth (creadoPor) que es lo que necesitamos para filtrar
            userOptionsHTML += `<option value="${user.uid_auth || doc.id}">${user.nombre}</option>`;
        });
        gastosUserFilter.innerHTML = userOptionsHTML;
        ingresosUserFilter.innerHTML = userOptionsHTML;
    });
}

function cargarGastosPendientes() {
    let query = db.collection('gastos').where('status', '==', 'pendiente');
    if (gastosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', gastosCategoryFilter.value);
    }
    // El filtro de usuario se implementará con la lógica avanzada de Bruto/Neto
    query = query.orderBy('fechaDeCreacion', 'asc');
    query.onSnapshot(snapshot => {
        const pendientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        mostrarGastosPendientes(pendientes);
    });
}

function cargarIngresosPendientes() {
    let query = db.collection('ingresos').where('status', '==', 'pendiente');
    if (ingresosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', ingresosCategoryFilter.value);
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
                    <div><span class="description">${gasto.descripcion}</span><span class="amount">$${gasto.monto.toLocaleString('es-MX')}</span></div>
                    <div class="meta">Enviado por: ${gasto.nombreCreador || gasto.emailCreador} | Cat: ${gasto.categoria}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-approve" data-id="${gasto.id}">Aprobar</button>
                    <button class="btn btn-reject" data-id="${gasto.id}">Rechazar</button>
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
    pendingGastosContainer.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => actualizarDocumento('gastos', btn.dataset.id, 'aprobado')));
    pendingGastosContainer.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', () => actualizarDocumento('gastos', btn.dataset.id, 'rechazado')));
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
                    <button class="btn btn-approve" data-id="${ingreso.id}">Aprobar</button>
                    <button class="btn btn-reject" data-id="${ingreso.id}">Rechazar</button>
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
    pendingIngresosContainer.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'aprobado')));
    pendingIngresosContainer.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'rechazado')));
}

function setupClickListeners() {
    const listContainers = [pendingGastosContainer, pendingIngresosContainer];
    listContainers.forEach(container => {
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn')) return;
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
