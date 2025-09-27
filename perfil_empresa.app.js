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

const urlParams = new URLSearchParams(window.location.search);
const empresaId = urlParams.get('id');

// Elementos del DOM
const companyNameEl = document.getElementById('company-name');
const downloadCompanyRecordsBtn = document.getElementById('download-company-records-btn');
const companyRfcEl = document.getElementById('company-rfc');
const contactNameEl = document.getElementById('contact-name');
const contactEmailEl = document.getElementById('contact-email');
const editCompanyBtn = document.getElementById('edit-company-btn');

const addProjectForm = document.getElementById('add-project-form');
const activeProjectsList = document.getElementById('active-projects-list');
const inactiveProjectsList = document.getElementById('inactive-projects-list');
let empresaData = null; // Variable global para guardar datos de la empresa

async function descargarRegistrosEmpresa() {
    if (!empresaData) return;

    alert('Preparando la descarga de todos los registros de la empresa. Esto puede tardar un momento...');
    
    try {
        const gastosPromise = db.collection('gastos').where('empresa', '==', empresaData.nombre).get();
        const ingresosPromise = db.collection('ingresos').where('empresa', '==', empresaData.nombre).get();
        
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);
        
        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha,
                Tipo: 'Gasto',
                Concepto: data.descripcion,
                Proyecto: data.proyectoNombre || 'N/A',
                Monto: -data.monto,
                Total: -data.totalConImpuestos,
                Creador: data.nombreCreador
            });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha,
                Tipo: 'Ingreso',
                Concepto: data.descripcion,
                Proyecto: data.proyectoNombre || 'N/A',
                Monto: data.monto,
                Total: data.totalConImpuestos,
                Creador: data.nombreCreador
            });
        });

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-${empresaData.nombre}`);

    } catch (error) {
        console.error("Error al descargar registros de la empresa:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

async function descargarRegistrosProyecto(proyectoId, proyectoNombre) {
    alert(`Preparando la descarga de registros para el proyecto: ${proyectoNombre}...`);
    try {
        const gastosPromise = db.collection('gastos').where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('proyectoId', '==', proyectoId).get();
        
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Gasto', Concepto: data.descripcion, Monto: -data.totalConImpuestos, Creador: data.nombreCreador });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Ingreso', Concepto: data.descripcion, Monto: data.totalConImpuestos, Creador: data.nombreCreador });
        });

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Proyecto-${proyectoNombre}`);

    } catch (error) {
        console.error("Error al descargar registros del proyecto:", error);
        alert("Ocurrió un error al generar el reporte del proyecto.");
    }
}

auth.onAuthStateChanged((user) => {
    if (user && empresaId) {
        cargarDatosDeEmpresa(empresaId);
        downloadCompanyRecordsBtn.addEventListener('click', descargarRegistrosEmpresa);
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeEmpresa(id) {
    const empresaDoc = await db.collection('empresas').doc(id).get();
    if (empresaDoc.exists) {
        empresaData = empresaDoc.data(); // Guardamos los datos globalmente
        companyNameEl.textContent = empresaData.nombre || 'No disponible';
        companyRfcEl.textContent = data.rfc || 'No disponible';
        contactNameEl.textContent = data.contactoNombre || 'No disponible';
        contactEmailEl.textContent = data.contactoEmail || 'No disponible';
        editCompanyBtn.href = `editar_empresa.html?id=${id}`;
    } else {
        alert("Empresa no encontrada.");
    }

    // 2. Cargar proyectos de la empresa en tiempo real
    db.collection('proyectos').where('empresaId', '==', id).orderBy('fechaDeCreacion', 'desc')
        .onSnapshot(snapshot => {
            const proyectos = [];
            snapshot.forEach(doc => proyectos.push({ id: doc.id, ...doc.data() }));
            mostrarProyectos(proyectos);
        });
}

function mostrarProyectos(proyectos) {
    activeProjectsList.innerHTML = '';
    inactiveProjectsList.innerHTML = '';

    if (proyectos.length === 0) {
        activeProjectsList.innerHTML = '<p>Esta empresa aún no tiene proyectos.</p>';
        return;
    }

    proyectos.forEach(proyecto => {
        const item = document.createElement('div');
        item.classList.add('project-container'); 

        const isActive = proyecto.status === 'activo';
        const buttonText = isActive ? 'Desactivar' : 'Activar';
        const buttonClass = isActive ? 'btn-deactivate' : 'btn-activate';
        const lineThrough = isActive ? '' : 'style="text-decoration: line-through;"';

        // El elemento principal del proyecto (lo que se ve siempre)
        item.innerHTML = `
            <div class="activity-feed-item project-header" data-project-id="${proyecto.id}">
                <div class="item-info">
                    <span class="item-description" ${lineThrough}>${proyecto.nombre}</span>
                </div>
                <button class="btn btn-secondary ${buttonClass}" data-id="${proyecto.id}">${buttonText}</button>
            </div>
            <div class="project-history" id="history-${proyecto.id}" style="display: none;">Cargando historial...</div>
        `;

        if (isActive) {
            activeProjectsList.appendChild(item);
        } else {
            inactiveProjectsList.appendChild(item);
        }
    });
}

async function cargarHistorialDeProyecto(proyectoId) {
    const historyContainer = document.getElementById(`history-${proyectoId}`);
    if (!historyContainer) return;

    // Alternar visibilidad
    const isVisible = historyContainer.style.display === 'block';
    if (isVisible) {
        historyContainer.style.display = 'none';
        return;
    } else {
        historyContainer.style.display = 'block';
    }

    try {
        const gastosPromise = db.collection('gastos').where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('proyectoId', '==', proyectoId).get();

        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        let movimientosHTML = '';
        gastosSnapshot.forEach(doc => {
            const gasto = doc.data();
            movimientosHTML += `<p class="history-line expense">Gasto: ${gasto.descripcion} <strong>-$${gasto.monto.toLocaleString()}</strong></p>`;
        });
        ingresosSnapshot.forEach(doc => {
            const ingreso = doc.data();
            movimientosHTML += `<p class="history-line income">Ingreso: ${ingreso.descripcion} <strong>+$${ingreso.monto.toLocaleString()}</strong></p>`;
        });

        historyContainer.innerHTML = movimientosHTML || '<p class="history-line">No hay movimientos para este proyecto.</p>';

    } catch (error) {
        console.error("Error al cargar historial:", error);
        historyContainer.innerHTML = '<p class="history-line">Error al cargar historial.</p>';
    }
}

// Listener para el formulario de agregar proyecto
addProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const projectName = addProjectForm['project-name'].value;

    db.collection('proyectos').add({
        nombre: projectName,
        empresaId: empresaId,
        status: 'activo', // Los proyectos nuevos siempre están activos
        fechaDeCreacion: new Date()
    }).then(() => {
        addProjectForm.reset();
    }).catch(error => console.error("Error al agregar proyecto:", error));
});

 item.innerHTML += `
            <div class="project-actions">
                <button class="btn-secondary download-project-btn" data-project-id="${proyecto.id}" data-project-name="${proyecto.nombre}">Descargar Registros del Proyecto</button>
            </div>
        `;
        
        if (proyecto.status === 'activo') {
            activeProjectsList.appendChild(item);
        } else {
            inactiveProjectsList.appendChild(item);
        }
    });
}


document.addEventListener('click', (e) => {
    // --- Lógica para activar/desactivar (ya la tienes) ---
    const statusProjectId = e.target.dataset.id;
    if (statusProjectId) {
        if (e.target.classList.contains('btn-deactivate')) {
            db.collection('proyectos').doc(statusProjectId).update({ status: 'inactivo' });
        }
        if (e.target.classList.contains('btn-activate')) {
            db.collection('proyectos').doc(statusProjectId).update({ status: 'activo' });
        }
        if (e.target.classList.contains('download-project-btn')) {
        const projectId = e.target.dataset.projectId;
        const projectName = e.target.dataset.projectName;
        descargarRegistrosProyecto(projectId, projectName);
    }
});
    }

    // --- NUEVA LÓGICA para mostrar/ocultar historial ---
    const projectHeader = e.target.closest('.project-header');
    if (projectHeader) {
        // Evitamos que el clic en el botón active también esto
        if (!e.target.matches('button')) {
            const historyProjectId = projectHeader.dataset.projectId;
            cargarHistorialDeProyecto(historyProjectId);
        }
    }
});
