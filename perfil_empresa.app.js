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
let adminUidGlobal = null;
let viewerRoleGlobal = null;

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user && empresaId) {
        const viewerDoc = await db.collection('usuarios').doc(user.uid).get();
        const viewerData = viewerDoc.exists ? viewerDoc.data() : {};
        adminUidGlobal = viewerData.adminUid || user.uid;
        viewerRoleGlobal = viewerData.rol || 'admin';

        if (viewerRoleGlobal === 'coadmin') {
            if (editCompanyBtn) editCompanyBtn.style.display = 'none';
            if (addProjectForm) addProjectForm.style.display = 'none';
        }
        
        cargarDatosDeEmpresa(adminUidGlobal, empresaId);
        downloadCompanyRecordsBtn.addEventListener('click', () => descargarRegistrosEmpresa(adminUidGlobal));

    } else {
        window.location.href = 'index.html';
    }
});

async function cargarDatosDeEmpresa(adminUid, id) {
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
            .where('adminUid', '==', adminUid)
            .where('empresaId', '==', id)
            .orderBy('fechaDeCreacion', 'desc')
            .onSnapshot(snapshot => {
                const proyectos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                mostrarProyectos(proyectos, viewerRoleGlobal);
            });
    } catch (error) {
        console.error("Error al cargar datos de la empresa:", error);
        alert("Ocurrió un error al cargar la página.");
    }
}

function mostrarProyectos(proyectos, viewerRole) {
    activeProjectsList.innerHTML = '';
    inactiveProjectsList.innerHTML = '';
    const activos = proyectos.filter(p => p.status === 'activo');
    const inactivos = proyectos.filter(p => p.status !== 'activo');

    if (activos.length === 0) activeProjectsList.innerHTML = '<p>Esta empresa no tiene proyectos activos.</p>';
    else activos.forEach(p => renderizarProyecto(p, viewerRole));

    if (inactivos.length === 0) inactiveProjectsList.innerHTML = '<p>No hay proyectos inactivos.</p>';
    else inactivos.forEach(p => renderizarProyecto(p, viewerRole));
}

function renderizarProyecto(proyecto, viewerRole) {
    const item = document.createElement('div');
    item.classList.add('project-container'); 
    const isActive = proyecto.status === 'activo';
    const lineThrough = isActive ? '' : 'style="text-decoration: line-through;"';
    let actionButtonHTML = '';
    if (viewerRole === 'admin') {
        const buttonText = isActive ? 'Archivar' : 'Activar';
        const buttonClass = isActive ? 'btn-deactivate' : 'btn-activate';
        actionButtonHTML = `<button class="btn btn-secondary ${buttonClass}" data-id="${proyecto.id}">${buttonText}</button>`;
    }

    item.innerHTML = `
        <div class="activity-feed-item project-header" data-project-id="${proyecto.id}">
            <div class="item-info"><span class="item-description" ${lineThrough}>${proyecto.nombre}</span></div>
            ${actionButtonHTML}
        </div>
        <div class="project-history" id="history-${proyecto.id}" style="display: none;">Cargando historial...</div>
        <div class="project-actions">
            <button class="btn-secondary download-project-btn" data-project-id="${proyecto.id}" data-project-name="${proyecto.nombre}">Descargar Registros</button>
        </div>
    `;
    
    if (isActive) activeProjectsList.appendChild(item);
    else inactiveProjectsList.appendChild(item);
}

async function cargarHistorialDeProyecto(proyectoId, adminUid) {
    const historyContainer = document.getElementById(`history-${proyectoId}`);
    if (!historyContainer) return;
    const isVisible = historyContainer.style.display === 'block';

    if (isVisible) {
        historyContainer.style.display = 'none';
        return;
    }
    historyContainer.style.display = 'block';
    historyContainer.innerHTML = 'Cargando...';

    try {
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
        
        // --- LA LÍNEA CORREGIDA ---
        // Ahora usamos 'ingresosPromise' dentro del array, que es la variable correcta.
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        let todosLosMovimientos = [];
        gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'gasto', ...doc.data() }));
        ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'ingreso', ...doc.data() }));

        todosLosMovimientos.sort((a, b) => new Date(b.fecha.replace(/-/g, '/')) - new Date(a.fecha.replace(/-/g, '/')));

        let movimientosHTML = '';
        todosLosMovimientos.forEach(mov => {
            const iconoComprobante = mov.comprobanteURL 
                ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` 
                : '';

            if (mov.tipo === 'gasto') {
                let impuestosHTML = '';
                if (mov.impuestos && mov.impuestos.length > 0) {
                    impuestosHTML += '<div class="tax-breakdown" style="padding-left: 15px; margin-top: 5px;">';
                    mov.impuestos.forEach(imp => {
                        const montoImpuesto = imp.tipo === 'porcentaje' ? (mov.monto * imp.valor) / 100 : imp.valor;
                        impuestosHTML += `<div class="tax-line" style="font-size: 0.9em;"><span>- ${imp.nombre}</span><span>$${montoImpuesto.toLocaleString('es-MX')}</span></div>`;
                    });
                    impuestosHTML += '</div>';
                }
                movimientosHTML += `<div class="history-item expense"><div class="history-main-line"><span>Gasto: ${mov.descripcion}${iconoComprobante}</span><strong>-$${(mov.totalConImpuestos || mov.monto).toLocaleString('es-MX')}</strong></div><div class="history-meta">Registrado por: ${mov.nombreCreador || 'N/A'}</div>${impuestosHTML}</div>`;
            } else if (mov.tipo === 'ingreso') {
                movimientosHTML += `<div class="history-item income"><div class="history-main-line"><span>Ingreso: ${mov.descripcion}${iconoComprobante}</span><strong>+$${(mov.totalConImpuestos || mov.monto).toLocaleString('es-MX')}</strong></div><div class="history-meta">Registrado por: ${mov.nombreCreador || 'N/A'}</div></div>`;
            }
        });

        historyContainer.innerHTML = movimientosHTML || '<p class="history-line">No hay movimientos para este proyecto.</p>';
    } catch (error) {
        console.error("Error al cargar historial:", error);
        historyContainer.innerHTML = '<p class="history-line error">Error al cargar historial.</p>';
    }
}

addProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!adminUidGlobal) return alert("Error de autenticación");
    db.collection('proyectos').add({
        nombre: addProjectForm['project-name'].value,
        empresaId: empresaId,
        status: 'activo',
        fechaDeCreacion: new Date(),
        adminUid: adminUidGlobal
    }).then(() => addProjectForm.reset()).catch(error => console.error("Error al agregar proyecto:", error));
});

// --- CORRECCIÓN 3: Pasamos el 'adminUidGlobal' a las funciones que lo necesitan ---
document.addEventListener('click', (e) => {
    const statusBtn = e.target.closest('.btn-deactivate, .btn-activate');
    if (statusBtn) {
        db.collection('proyectos').doc(statusBtn.dataset.id).update({ status: statusBtn.classList.contains('btn-deactivate') ? 'inactivo' : 'activo' });
    }

    const downloadBtn = e.target.closest('.download-project-btn');
    if (downloadBtn) {
        descargarRegistrosProyecto(downloadBtn.dataset.projectId, downloadBtn.dataset.projectName, adminUidGlobal);
    }
    
    const projectHeader = e.target.closest('.project-header');
    if (projectHeader && !e.target.closest('button')) {
        cargarHistorialDeProyecto(projectHeader.dataset.projectId, adminUidGlobal);
    }
});

async function descargarRegistrosEmpresa(adminUid) {
    if (!empresaData) return;
    alert('Preparando la descarga de todos los registros de la empresa...');
    try {
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('empresa', '==', empresaData.nombre).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('empresa', '==', empresaData.nombre).get();
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);
        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Gasto', Concepto: data.descripcion, Proyecto: data.proyectoNombre || 'N/A', Monto: -(data.totalConImpuestos || data.monto), Creador: data.nombreCreador });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha, Tipo: 'Ingreso', Concepto: data.descripcion, Proyecto: data.proyectoNombre || 'N/A', Monto: data.totalConImpuestos || data.monto, Creador: data.nombreCreador });
        });
        if(registros.length === 0) return alert("No hay registros para esta empresa.");
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-${empresaData.nombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

// --- CORRECCIÓN 4: Rellenamos la lógica faltante en la descarga del proyecto ---
async function descargarRegistrosProyecto(proyectoId, proyectoNombre, adminUid) {
    alert(`Preparando descarga para el proyecto: ${proyectoNombre}...`);
    try {
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
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
