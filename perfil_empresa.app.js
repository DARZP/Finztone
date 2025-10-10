import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

const urlParams = new URLSearchParams(window.location.search);
const empresaId = urlParams.get('id');

// --- Elementos del DOM ---
const companyNameEl = document.getElementById('company-name');
const companyRfcEl = document.getElementById('company-rfc');
const contactNameEl = document.getElementById('contact-name');
const contactEmailEl = document.getElementById('contact-email');
const editCompanyBtn = document.getElementById('edit-company-btn');
const downloadCompanyRecordsBtn = document.getElementById('download-company-records-btn');
const addProjectForm = document.getElementById('add-project-form');
const activeProjectsList = document.getElementById('active-projects-list');
const inactiveProjectsList = document.getElementById('inactive-projects-list');

let empresaData = null; 

// --- LÓGICA DE DESCARGA ---

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
                Fecha: data.fecha || '',
                Tipo: 'Gasto',
                Concepto: data.descripcion || '',
                Proyecto: data.proyectoNombre || 'N/A',
                Monto: -data.monto,
                Total: -(data.totalConImpuestos || data.monto),
                Creador: data.nombreCreador || ''
            });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha || '',
                Tipo: 'Ingreso',
                Concepto: data.descripcion || '',
                Proyecto: data.proyectoNombre || 'N/A',
                Monto: data.monto,
                Total: data.totalConImpuestos || data.monto,
                Creador: data.nombreCreador || ''
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
            registros.push({ Fecha: data.fecha, Tipo: 'Gasto', Concepto: data.descripcion, Monto: -(data.totalConImpuestos || data.monto), Creador: data.nombreCreador });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Ingreso', Concepto: data.descripcion, Monto: data.totalConImpuestos || data.monto, Creador: data.nombreCreador });
        });

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Proyecto-${proyectoNombre}`);

    } catch (error) {
        console.error("Error al descargar registros del proyecto:", error);
        alert("Ocurrió un error al generar el reporte del proyecto.");
    }
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---

auth.onAuthStateChanged((user) => {
    if (user && empresaId) {
        cargarDatosDeEmpresa(user, empresaId);
        downloadCompanyRecordsBtn.addEventListener('click', descargarRegistrosEmpresa);
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeEmpresa(user, id) {
    const empresaDoc = await db.collection('empresas').doc(id).get();
    if (empresaDoc.exists) {
        empresaData = empresaDoc.data();
        companyNameEl.textContent = empresaData.nombre || 'No disponible';
        companyRfcEl.textContent = empresaData.rfc || 'No disponible';
        contactNameEl.textContent = empresaData.contactoNombre || 'No disponible';
        contactEmailEl.textContent = empresaData.contactoEmail || 'No disponible';
        editCompanyBtn.href = `editar_empresa.html?id=${id}`;
    } else {
        alert("Empresa no encontrada.");
    }

    db.collection('proyectos')
        .where('adminUid', '==', user.uid) // <-- CORRECCIÓN DE SEGURIDAD
        .where('empresaId', '==', id)
        .orderBy('fechaDeCreacion', 'desc')
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

        item.innerHTML = `
            <div class="activity-feed-item project-header" data-project-id="${proyecto.id}">
                <div class="item-info">
                    <span class="item-description" ${lineThrough}>${proyecto.nombre}</span>
                </div>
                <button class="btn btn-secondary ${buttonClass}" data-id="${proyecto.id}">${buttonText}</button>
            </div>
            <div class="project-history" id="history-${proyecto.id}" style="display: none;">Cargando historial...</div>
        `;

        // --- CORREGIDO --- Bloque de código reubicado a su lugar correcto
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

async function cargarHistorialDeProyecto(proyectoId) {
    const historyContainer = document.getElementById(`history-${proyectoId}`);
    if (!historyContainer) return;

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

addProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const projectName = addProjectForm['project-name'].value;
    const user = auth.currentUser;
    if(!user) return;

    db.collection('proyectos').add({
        nombre: projectName,
        empresaId: empresaId,
        status: 'activo',
        fechaDeCreacion: new Date(),
        adminUid: user.uid // Asegurarse de guardar el adminUid
    }).then(() => {
        addProjectForm.reset();
    }).catch(error => console.error("Error al agregar proyecto:", error));
});


// --- LÓGICA UNIFICADA Y CORREGIDA PARA TODOS LOS CLICS ---
document.addEventListener('click', (e) => {
    // Lógica para activar/desactivar proyecto
    const statusBtn = e.target.closest('.btn-deactivate, .btn-activate');
    if (statusBtn) {
        const statusProjectId = statusBtn.dataset.id;
        const newStatus = statusBtn.classList.contains('btn-deactivate') ? 'inactivo' : 'activo';
        db.collection('proyectos').doc(statusProjectId).update({ status: newStatus });
    }

    // Lógica para descargar registros del proyecto
    const downloadBtn = e.target.closest('.download-project-btn');
    if (downloadBtn) {
        const projectId = downloadBtn.dataset.projectId;
        const projectName = downloadBtn.dataset.projectName;
        descargarRegistrosProyecto(projectId, projectName);
    }
    
    // Lógica para mostrar/ocultar historial
    const projectHeader = e.target.closest('.project-header');
    if (projectHeader) {
        // Evitamos que el clic en un botón dentro del header active esto
        if (!e.target.matches('button')) {
            const historyProjectId = projectHeader.dataset.projectId;
            cargarHistorialDeProyecto(historyProjectId);
        }
    }
});
