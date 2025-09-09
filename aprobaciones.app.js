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
const pendingListContainer = document.getElementById('pending-list');

// Verificamos que sea un usuario autenticado
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});

// Función para actualizar el estado de un gasto
function actualizarGasto(id, nuevoStatus) {
    const gastoRef = db.collection('gastos').doc(id);

    if (nuevoStatus === 'rechazado') {
        const motivo = prompt("Por favor, introduce el motivo del rechazo:");
        if (motivo) { // Si el usuario escribe un motivo y no cancela
            gastoRef.update({
                status: 'rechazado',
                motivoRechazo: motivo
            })
            .then(() => alert('Solicitud rechazada.'))
            .catch(error => console.error("Error al rechazar:", error));
        }
    } else { // Si es 'aprobado'
        gastoRef.update({
            status: 'aprobado'
        })
        .then(() => alert('Solicitud aprobada.'))
        .catch(error => console.error("Error al aprobar:", error));
    }
}

// Función para mostrar la lista de gastos pendientes
function mostrarPendientes(gastos) {
    pendingListContainer.innerHTML = '';
    if (gastos.length === 0) {
        pendingListContainer.innerHTML = '<p>¡Excelente! No hay solicitudes pendientes.</p>';
        return;
    }

    gastos.forEach(gasto => {
        const itemElement = document.createElement('div');
        itemElement.classList.add('pending-item');
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');

        itemElement.innerHTML = `
            <div class="item-details">
                <div>
                    <span class="description">${gasto.descripcion}</span>
                    <span class="amount">$${gasto.monto.toFixed(2)}</span>
                </div>
                <div class="meta">
                    Enviado por: ${gasto.nombreCreador || gasto.emailCreador} | Categoría: ${gasto.categoria} | Fecha: ${fecha}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-approve" data-id="${gasto.id}">Aprobar</button>
                <button class="btn btn-reject" data-id="${gasto.id}">Rechazar</button>
            </div>
        `;
        pendingListContainer.appendChild(itemElement);
    });

    // Añadimos los listeners a los botones recién creados
    document.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => actualizarGasto(btn.dataset.id, 'aprobado'));
    });
    document.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', () => actualizarGasto(btn.dataset.id, 'rechazado'));
    });
}


// Buscamos en Firestore los gastos con status 'pendiente' EN TIEMPO REAL
db.collection('gastos')
  .where('status', '==', 'pendiente')
  .orderBy('fechaDeCreacion', 'asc')
  .onSnapshot(querySnapshot => {
        const pendientes = [];
        querySnapshot.forEach(doc => {
            pendientes.push({ id: doc.id, ...doc.data() });
        });
        mostrarPendientes(pendientes);
    }, error => {
        console.error("Error al obtener solicitudes pendientes: ", error);
        alert('No se pudieron cargar las solicitudes.');
    });