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

        // --- CORRECCIÓN 2: La consulta de proyectos usa el adminUid correcto ---
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

    // --- CORRECCIÓN 3: Los botones de activar/archivar solo se muestran al Admin ---
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
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        let movimientosHTML = '';
        
        gastosSnapshot.forEach(doc => {
            const gasto = doc.data();
            let impuestosHTML = '';
            if (gasto.impuestos && gasto.impuestos.length > 0) {
                impuestosHTML += '<div class="tax-breakdown">';
                gasto.impuestos.forEach(imp => {
                    const montoImpuesto = imp.tipo === 'porcentaje' ? (gasto.monto * imp.valor) / 100 : imp.valor;
                    impuestosHTML += `<div class="tax-line"><span>- ${imp.nombre}</span><span>$${montoImpuesto.toLocaleString('es-MX')}</span></div>`;
                });
                impuestosHTML += '</div>';
            }

            movimientosHTML += `
                <div class="history-item expense">
                    <div class="history-main-line">
                        <span>Gasto: ${gasto.descripcion}</span>
                        <strong>-$${(gasto.totalConImpuestos || gasto.monto).toLocaleString('es-MX')}</strong>
                    </div>
                    <div class="history-meta">Registrado por: ${gasto.nombreCreador || 'N/A'}</div>
                    ${impuestosHTML}
                </div>
            `;
        });

        ingresosSnapshot.forEach(doc => {
            const ingreso = doc.data();
            // (Puedes añadir la misma lógica de desglose de impuestos para ingresos si lo necesitas)
            movimientosHTML += `
                <div class="history-item income">
                    <div class="history-main-line">
                        <span>Ingreso: ${ingreso.descripcion}</span>
                        <strong>+$${(ingreso.totalConImpuestos || ingreso.monto).toLocaleString('es-MX')}</strong>
                    </div>
                    <div class="history-meta">Registrado por: ${ingreso.nombreCreador || 'N/A'}</div>
                </div>
            `;
        });

        historyContainer.innerHTML = movimientosHTML || '<p class="history-line">No hay movimientos para este proyecto.</p>';
    } catch (error) {
        console.error("Error al cargar historial:", error);
        historyContainer.innerHTML = '<p class="history-line error">Error al cargar historial.</p>';
    }
}

async function descargarRegistrosEmpresa(adminUid) {
    if (!empresaData) return;
    alert('Preparando la descarga de todos los registros de la empresa...');
    try {
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('empresa', '==', empresaData.nombre).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('empresa', '==', empresaData.nombre).get();
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);
        
        const registros = [];
        // Lógica de mapeo para gastos (ya sin comentarios)
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ 
                Fecha: data.fecha, 
                Tipo: 'Gasto', 
                Concepto: data.descripcion, 
                Proyecto: data.proyectoNombre || 'N/A', 
                Monto: -(data.totalConImpuestos || data.monto), 
                Creador: data.nombreCreador 
            });
        });
        // Lógica de mapeo para ingresos (ya sin comentarios)
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ 
                Fecha: data.fecha, 
                Tipo: 'Ingreso', 
                Concepto: data.descripcion, 
                Proyecto: data.proyectoNombre || 'N/A', 
                Monto: data.totalConImpuestos || data.monto, 
                Creador: data.nombreCreador 
            });
        });

        if(registros.length === 0) return alert("No hay registros para esta empresa.");
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-${empresaData.nombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

async function descargarRegistrosProyecto(proyectoId, proyectoNombre, adminUid) {
    alert(`Preparando descarga para el proyecto: ${proyectoNombre}...`);
    try {
        // --- CORRECCIÓN 6: Las consultas de descarga usan el adminUid correcto ---
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('proyectoId', '==', proyectoId).get();
        const [gastosSnapshot, ingresosSnapshot] = await Promise.all([gastosPromise, ingresosPromise]);

        const registros = [];
        gastosSnapshot.forEach(doc => { /* Tu lógica de mapeo de datos aquí */ });
        ingresosSnapshot.forEach(doc => { /* Tu lógica de mapeo de datos aquí */ });
        
        if(registros.length === 0) return alert("No hay registros para este proyecto.");
        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Proyecto-${proyectoNombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}
