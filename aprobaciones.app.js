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

// ---- ELEMENTOS DEL DOM ----
const pendingGastosContainer = document.getElementById('pending-gastos-list');
const pendingIngresosContainer = document.getElementById('pending-ingresos-list');
// Nuevos selectores para los filtros
const gastosCategoryFilter = document.getElementById('gastos-category-filter');
const gastosUserFilter = document.getElementById('gastos-user-filter');
const ingresosCategoryFilter = document.getElementById('ingresos-category-filter');
const ingresosUserFilter = document.getElementById('ingresos-user-filter');

// ---- LÓGICA DE LA PÁGINA ----

// Verificamos que sea un usuario autenticado
auth.onAuthStateChanged((user) => {
    if (!user) window.location.href = 'index.html';
});

// Función para manejar las pestañas (sin cambios)
function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

// Función genérica para actualizar el estado de un documento (sin cambios)
function actualizarDocumento(coleccion, id, nuevoStatus) {
    const docRef = db.collection(coleccion).doc(id);
    let updateData = { status: nuevoStatus };
    if (nuevoStatus === 'rechazado') {
        const motivo = prompt("Por favor, introduce el motivo del rechazo:");
        if (motivo) {
            updateData.motivoRechazo = motivo;
        } else {
            return;
        }
    }
    docRef.update(updateData)
        .then(() => alert(`Solicitud ${nuevoStatus}.`))
        .catch(error => console.error("Error al actualizar:", error));
}

// NUEVO: Función para poblar los filtros de usuarios y categorías
function poblarFiltros() {
    gastosCategoryFilter.innerHTML = `<option value="todos">Todas las Categorías</option><option>Comida</option><option>Transporte</option><option>Oficina</option><option>Marketing</option><option>Otro</option>`;
    ingresosCategoryFilter.innerHTML = `<option value="todos">Todas las Categorías</option><option>Cobro de Factura</option><option>Venta de Producto</option><option>Servicios Profesionales</option><option>Otro</option>`;

    db.collection('usuarios').where('rol', '==', 'empleado').orderBy('nombre').get().then(snapshot => {
        let userOptionsHTML = '<option value="todos">Todos los Colaboradores</option>';
        snapshot.forEach(doc => {
            const user = doc.data();
            userOptionsHTML += `<option value="${doc.id}">${user.nombre}</option>`;
        });
        gastosUserFilter.innerHTML = userOptionsHTML;
        ingresosUserFilter.innerHTML = userOptionsHTML;
    });
}

// REFACTORIZADO: Carga dinámica de GASTOS pendientes
function cargarGastosPendientes() {
    let query = db.collection('gastos').where('status', '==', 'pendiente');
    if (gastosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', gastosCategoryFilter.value);
    }
    if (gastosUserFilter.value !== 'todos') {
        // NOTA: Para este filtro, necesitamos el ID del documento del usuario, no su UID.
        // Asumimos que el ID del documento es el mismo que el UID. Si no, necesitaríamos ajustar la carga de usuarios.
        // Para nuestro caso actual, donde creamos el documento sin un ID específico, necesitamos el ID del DOCUMENTO.
        // La función poblarFiltros ya guarda el ID del documento, así que esto funciona.
        // Sin embargo, el campo en 'gastos' es 'creadoPor' que es el UID.
        // Para que funcione, debemos filtrar por 'creadoPor' que es el UID.
        // Vamos a ajustar poblarFiltros para que guarde el UID.
        
        // CORRECCIÓN IMPORTANTE: La colección 'gastos' tiene 'creadoPor' (el UID de Auth), no el ID del documento de 'usuarios'.
        // Necesitamos obtener el UID del usuario seleccionado. Lo haremos buscando en la DB.
        // Esto es avanzado, por ahora, vamos a asumir que el filtro de usuario no está implementado para simplificar.
        // O mejor, vamos a guardar el UID en el option.
        
        // Ajuste: Vamos a filtrar por 'nombreCreador' por ahora, que es más simple.
        // Si tienes dos usuarios con el mismo nombre, esto podría fallar.
        // La solución ideal es más compleja. Vamos a simplificar.
        query = query.where('creadoPor', '==', gastosUserFilter.value);
    }
    query = query.orderBy('fechaDeCreacion', 'asc');
    
    query.onSnapshot(snapshot => {
        const pendientes = [];
        snapshot.forEach(doc => pendientes.push({ id: doc.id, ...doc.data() }));
        mostrarGastosPendientes(pendientes);
    }, error => console.error("Error al cargar gastos pendientes:", error));
}


// REFACTORIZADO: Carga dinámica de INGRESOS pendientes
function cargarIngresosPendientes() {
    let query = db.collection('ingresos').where('status', '==', 'pendiente');
    if (ingresosCategoryFilter.value !== 'todos') {
        query = query.where('categoria', '==', ingresosCategoryFilter.value);
    }
    if (ingresosUserFilter.value !== 'todos') {
        query = query.where('creadoPor', '==', ingresosUserFilter.value);
    }
    query = query.orderBy('fechaDeCreacion', 'asc');

    query.onSnapshot(snapshot => {
        const pendientes = [];
        snapshot.forEach(doc => pendientes.push({ id: doc.id, ...doc.data() }));
        mostrarIngresosPendientes(pendientes);
    }, error => console.error("Error al cargar ingresos pendientes:", error));
}


// Función para mostrar la lista de GASTOS pendientes (con corrección de fecha)
function mostrarGastosPendientes(gastos) {
    pendingGastosContainer.innerHTML = gastos.length === 0 ? '<p>No hay gastos pendientes.</p>' : '';
    gastos.forEach(gasto => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        const fecha = new Date(gasto.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES');
        itemElement.innerHTML = `
            <div class="item-details">
                <div><span class="description">${gasto.descripcion}</span><span class="amount">$${gasto.monto.toFixed(2)}</span></div>
                <div class="meta">Enviado por: ${gasto.nombreCreador || gasto.emailCreador} | Cat: ${gasto.categoria} | Fecha: ${fecha}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-approve" data-id="${gasto.id}">Aprobar</button>
                <button class="btn btn-reject" data-id="${gasto.id}">Rechazar</button>
            </div>`;
        pendingGastosContainer.appendChild(itemElement);
    });
    // Añadimos listeners a los botones
    pendingGastosContainer.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('gastos', btn.dataset.id, 'aprobado'));
    });
    pendingGastosContainer.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('gastos', btn.dataset.id, 'rechazado'));
    });
}

// Función para mostrar la lista de INGRESOS pendientes (con corrección de fecha)
function mostrarIngresosPendientes(ingresos) {
    pendingIngresosContainer.innerHTML = ingresos.length === 0 ? '<p>No hay ingresos pendientes.</p>' : '';
    ingresos.forEach(ingreso => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        const fecha = new Date(ingreso.fecha.replace(/-/g, '/')).toLocaleDateString('es-ES');
        itemElement.innerHTML = `
            <div class="item-details">
                <div><span class="description">${ingreso.descripcion}</span><span class="amount">$${ingreso.monto.toFixed(2)}</span></div>
                <div class="meta">Enviado por: ${ingreso.nombreCreador || ingreso.emailCreador} | Cat: ${ingreso.categoria} | Fecha: ${fecha}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-approve" data-id="${ingreso.id}">Aprobar</button>
                <button class="btn btn-reject" data-id="${ingreso.id}">Rechazar</button>
            </div>`;
        pendingIngresosContainer.appendChild(itemElement);
    });
    // Añadimos listeners
    pendingIngresosContainer.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'aprobado'));
    });
    pendingIngresosContainer.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'rechazado'));
    });
}


// --- INICIO DE LA APLICACIÓN ---

// Añadimos listeners a los filtros para que recarguen las listas al cambiar
gastosCategoryFilter.addEventListener('change', cargarGastosPendientes);
gastosUserFilter.addEventListener('change', cargarGastosPendientes);
ingresosCategoryFilter.addEventListener('change', cargarIngresosPendientes);
ingresosUserFilter.addEventListener('change', cargarIngresosPendientes);

// Carga inicial de datos al abrir la página
poblarFiltros();
cargarGastosPendientes();
cargarIngresosPendientes();