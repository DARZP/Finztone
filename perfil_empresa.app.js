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

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- NUEVA LÓGICA: Obtenemos el perfil de QUIEN ESTÁ VIENDO la página ---
        const viewerDoc = await db.collection('usuarios').doc(user.uid).get();
        const viewerData = viewerDoc.exists ? viewerDoc.data() : {};

        // --- OCULTAMOS EL BOTÓN SI ES CO-ADMIN ---
        if (viewerData.rol === 'coadmin') {
            if (editProfileBtn) {
                editProfileBtn.style.display = 'none';
            }
        }

        // El resto de la lógica de la página no cambia
        if (userId) {
            editProfileBtn.href = `editar_perfil.html?id=${userId}`;
            cargarDatosPerfil();
            downloadEmployeeRecordsBtn.addEventListener('click', descargarRegistrosColaborador);
        }
    } else {
        window.location.href = 'index.html';
    }
});


async function cargarDatosDeEmpresa(user, id) {
    try {
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
            window.location.href = 'empresas.html';
        }

        db.collection('proyectos')
            .where('adminUid', '==', user.uid)
            .where('empresaId', '==', id)
            .orderBy('fechaDeCreacion', 'desc')
            .onSnapshot(snapshot => {
                const proyectos = [];
                snapshot.forEach(doc => proyectos.push({ id: doc.id, ...doc.data() }));
                mostrarProyectos(proyectos);
            });
    } catch (error) {
        console.error("Error al cargar datos de la empresa:", error);
        alert("Ocurrió un error al cargar la página.");
    }
}

function mostrarProyectos(proyectos) {
    activeProjectsList.innerHTML = '';
    inactiveProjectsList.innerHTML = '';

    const activos = proyectos.filter(p => p.status === 'activo');
    const inactivos = proyectos.filter(p => p.status !== 'activo');

    if (activos.length === 0) {
        activeProjectsList.innerHTML = '<p>Esta empresa aún no tiene proyectos activos.</p>';
    } else {
        activos.forEach(renderizarProyecto);
    }

    if (inactivos.length === 0) {
        inactiveProjectsList.innerHTML = '<p>No hay proyectos inactivos.</p>';
    } else {
        inactivos.forEach(renderizarProyecto);
    }
}

function renderizarProyecto(proyecto) {
    const item = document.createElement('div');
    item.classList.add('project-container'); 

    const isActive = proyecto.status === 'activo';
    const buttonText = isActive ? 'Archivar' : 'Activar';
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
        <div class="project-actions">
            <button class="btn-secondary download-project-btn" data-project-id="${proyecto.id}" data-project-name="${proyecto.nombre}">Descargar Registros</button>
        </div>
    `;
    
    if (isActive) {
        activeProjectsList.appendChild(item);
    } else {
        inactiveProjectsList.appendChild(item);
    }
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
        historyContainer.innerHTML = 'Cargando...';
    }

    try {
        const user = auth.currentUser; // Nos aseguramos de tener el usuario
        if (!user) return; // Salimos si no hay usuario

        const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('proyectoId', '==', proyectoId).get();
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        let movimientosHTML = '';
        gastosSnapshot.forEach(doc => {
            const gasto = doc.data();
            movimientosHTML += `<p class="history-line expense">Gasto: ${gasto.descripcion} <strong>-$${(gasto.totalConImpuestos || gasto.monto).toLocaleString()}</strong></p>`;
        });
        ingresosSnapshot.forEach(doc => {
            const ingreso = doc.data();
            movimientosHTML += `<p class="history-line income">Ingreso: ${ingreso.descripcion} <strong>+$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString()}</strong></p>`;
        });

        historyContainer.innerHTML = movimientosHTML || '<p class="history-line">No hay movimientos para este proyecto.</p>';
    } catch (error) {
        console.error("Error al cargar historial:", error);
        historyContainer.innerHTML = '<p class="history-line error">Error al cargar historial.</p>';
    }
}

addProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const projectName = addProjectForm['project-name'].value;
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación");

    db.collection('proyectos').add({
        nombre: projectName,
        empresaId: empresaId,
        status: 'activo',
        fechaDeCreacion: new Date(),
        adminUid: user.uid
    }).then(() => {
        addProjectForm.reset();
    }).catch(error => console.error("Error al agregar proyecto:", error));
});

document.addEventListener('click', (e) => {
    const statusBtn = e.target.closest('.btn-deactivate, .btn-activate');
    if (statusBtn) {
        const statusProjectId = statusBtn.dataset.id;
        const newStatus = statusBtn.classList.contains('btn-deactivate') ? 'inactivo' : 'activo';
        db.collection('proyectos').doc(statusProjectId).update({ status: newStatus });
    }

    const downloadBtn = e.target.closest('.download-project-btn');
    if (downloadBtn) {
        const projectId = downloadBtn.dataset.projectId;
        const projectName = downloadBtn.dataset.projectName;
        descargarRegistrosProyecto(projectId, projectName);
    }
    
    const projectHeader = e.target.closest('.project-header');
    if (projectHeader && !e.target.closest('button')) {
        const historyProjectId = projectHeader.dataset.projectId;
        cargarHistorialDeProyecto(historyProjectId);
    }
});

async function descargarRegistrosEmpresa() {
    if (!empresaData) return;
    alert('Preparando la descarga de todos los registros de la empresa...');
    try {
        const user = auth.currentUser;
        if (!user) return;
        const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('empresa', '==', empresaData.nombre).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('empresa', '==', empresaData.nombre).get();
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);
        
        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Gasto', Concepto: data.descripcion, Proyecto: data.proyectoNombre || 'N/A', Monto: -data.monto, Total: -(data.totalConImpuestos || data.monto), Creador: data.nombreCreador });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Ingreso', Concepto: data.descripcion, Proyecto: data.proyectoNombre || 'N/A', Monto: data.monto, Total: data.totalConImpuestos || data.monto, Creador: data.nombreCreador });
        });

        if(registros.length === 0) return alert("No hay registros para esta empresa.");
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-${empresaData.nombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

async function descargarRegistrosProyecto(proyectoId, proyectoNombre) {
    alert(`Preparando descarga para el proyecto: ${proyectoNombre}...`);
    try {
        const user = auth.currentUser;
        if(!user) return;
        const gastosPromise = db.collection('gastos').where('adminUid', '==', user.uid).where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', user.uid).where('proyectoId', '==', proyectoId).get();
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
        
        if(registros.length === 0) return alert("No hay registros para este proyecto.");
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Proyecto-${proyectoNombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}
