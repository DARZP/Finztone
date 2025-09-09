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

// ---- LÓGICA DE LA PÁGINA DE APROBACIONES ----
const pendingGastosContainer = document.getElementById('pending-gastos-list');
const pendingIngresosContainer = document.getElementById('pending-ingresos-list');

// Verificamos que sea un usuario autenticado
auth.onAuthStateChanged((user) => {
    if (!user) window.location.href = 'index.html';
});

// Función para manejar las pestañas
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

// Función genérica para actualizar el estado de un documento
function actualizarDocumento(coleccion, id, nuevoStatus) {
    const docRef = db.collection(coleccion).doc(id);
    let updateData = { status: nuevoStatus };

    if (nuevoStatus === 'rechazado') {
        const motivo = prompt("Por favor, introduce el motivo del rechazo:");
        if (motivo) {
            updateData.motivoRechazo = motivo;
        } else {
            return; // Si el admin cancela el prompt, no hacemos nada
        }
    }
    
    docRef.update(updateData)
        .then(() => alert(`Solicitud ${nuevoStatus}.`))
        .catch(error => console.error("Error al actualizar:", error));
}

// Función para mostrar la lista de GASTOS pendientes
function mostrarGastosPendientes(gastos) {
    pendingGastosContainer.innerHTML = gastos.length === 0 ? '<p>No hay gastos pendientes.</p>' : '';
    gastos.forEach(gasto => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');
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

// Función para mostrar la lista de INGRESOS pendientes
function mostrarIngresosPendientes(ingresos) {
    pendingIngresosContainer.innerHTML = ingresos.length === 0 ? '<p>No hay ingresos pendientes.</p>' : '';
    ingresos.forEach(ingreso => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES');
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
    // Añadimos listeners a los botones
    pendingIngresosContainer.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'aprobado'));
    });
    pendingIngresosContainer.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => actualizarDocumento('ingresos', btn.dataset.id, 'rechazado'));
    });
}

// Buscamos en Firestore los GASTOS pendientes en tiempo real
db.collection('gastos').where('status', '==', 'pendiente').orderBy('fechaDeCreacion', 'asc')
  .onSnapshot(querySnapshot => {
        const pendientes = [];
        querySnapshot.forEach(doc => pendientes.push({ id: doc.id, ...doc.data() }));
        mostrarGastosPendientes(pendientes);
    });

// Buscamos en Firestore los INGRESOS pendientes en tiempo real
db.collection('ingresos').where('status', '==', 'pendiente').orderBy('fechaDeCreacion', 'asc')
  .onSnapshot(querySnapshot => {
        const pendientes = [];
        querySnapshot.forEach(doc => pendientes.push({ id: doc.id, ...doc.data() }));
        mostrarIngresosPendientes(pendientes);
    });