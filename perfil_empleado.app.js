import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

// --- ELEMENTOS DEL DOM ---
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id'); // ID del perfil que se está viendo

const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePosition = document.getElementById('profile-position');
const profileSalary = document.getElementById('profile-salary');
const profilePhone = document.getElementById('profile-phone');
const profileClabe = document.getElementById('profile-clabe');
const profileRfc = document.getElementById('profile-rfc');
const activityFeed = document.getElementById('activity-feed');
const editProfileBtn = document.getElementById('edit-profile-btn');
const editSalaryBtn = document.getElementById('edit-salary-btn');
const editDeductionsBtn = document.getElementById('edit-deductions-btn');
const profileDeductionsList = document.getElementById('profile-deductions-list');
const profileNetSalary = document.getElementById('profile-net-salary');
const downloadEmployeeRecordsBtn = document.getElementById('download-employee-records-btn');

let currentUserData = null;
let todosLosMovimientos = [];

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user && userId) {
        const viewerDoc = await db.collection('usuarios').doc(user.uid).get();
        const viewerData = viewerDoc.exists ? viewerDoc.data() : {};

        if (viewerData.rol === 'admin') {
            editProfileBtn.style.display = 'block';
            editProfileBtn.href = `editar_perfil.html?id=${userId}`;
        } else if (viewerData.rol === 'coadmin') {
            editSalaryBtn.style.display = 'inline-block';
            editDeductionsBtn.style.display = 'block';
        }

        await cargarDatosPerfil();
        await cargarActividad();
        downloadEmployeeRecordsBtn.addEventListener('click', descargarRegistrosColaborador);
    } else {
        window.location.href = 'index.html';
    }
});

// --- EVENT LISTENERS PARA EDICIÓN ---
editSalaryBtn.addEventListener('click', async () => {
    const sueldoActual = currentUserData.sueldoBruto || 0;
    const nuevoSueldoStr = prompt("Introduce el nuevo Sueldo Bruto Mensual:", sueldoActual);
    if (nuevoSueldoStr === null) return;
    const nuevoSueldo = parseFloat(nuevoSueldoStr);
    if (isNaN(nuevoSueldo) || nuevoSueldo < 0) return alert("Por favor, introduce un número válido.");
    try {
        await db.collection('usuarios').doc(userId).update({ sueldoBruto: nuevoSueldo });
        alert("¡Sueldo actualizado exitosamente!");
        cargarDatosPerfil();
    } catch (error) {
        console.error("Error al actualizar el sueldo:", error);
        alert("Ocurrió un error al guardar el cambio.");
    }
});

editDeductionsBtn.addEventListener('click', () => {
    window.location.href = `editar_deducciones.html?id=${userId}`;
});

// --- FUNCIONES DE CARGA Y PROCESAMIENTO ---

async function cargarDatosPerfil() {
    if (!userId) return;
    try {
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            profileName.textContent = currentUserData.nombre;
            profileEmail.textContent = currentUserData.email;
            profilePosition.textContent = currentUserData.cargo || 'No disponible';            profilePhone.textContent = currentUserData.telefono || 'No registrado';
            profileClabe.textContent = currentUserData.clabe || 'No registrada';
            profileRfc.textContent = currentUserData.rfc || 'No registrado';
            profileSalary.textContent = (currentUserData.sueldoBruto || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

            const sueldoBruto = currentUserData.sueldoBruto || 0;
            const deducciones = currentUserData.deducciones || [];
            let totalDeducciones = 0;
            let deduccionesHTML = '';
            deducciones.forEach(ded => {
                let montoDeducido = ded.tipo === 'porcentaje' ? (sueldoBruto * ded.valor) / 100 : ded.valor;
                totalDeducciones += montoDeducido;
                deduccionesHTML += `<div class="deduction-line"><span class="name">(-) ${ded.nombre}</span><span class="amount">-$${montoDeducido.toLocaleString('es-MX')}</span></div>`;
            });
            const sueldoNeto = sueldoBruto - totalDeducciones;
            profileDeductionsList.innerHTML = deduccionesHTML;
            profileNetSalary.textContent = sueldoNeto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
        } else {
            profileName.textContent = "Usuario no encontrado";
        }
    } catch (error) {
        console.error("Error cargando datos del perfil:", error);
    }
}

async function cargarActividad() {
    const viewer = auth.currentUser;
    if (!userId || !viewer) return;

    const viewerDoc = await db.collection('usuarios').doc(viewer.uid).get();
    const viewerData = viewerDoc.exists ? viewerDoc.data() : {};
    const adminUid = viewerData.adminUid || viewer.uid;

    try {
    const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
    const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
    const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('userId', '==', userId).get();
    
    // --- LA LÍNEA CORREGIDA ---
    // Cambiamos 'nominaSnapshot' por 'nominaPromise' dentro del array.
    const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([gastosPromise, ingresosPromise, nominaPromise]);

    // El resto de tu código ya es correcto
    todosLosMovimientos = [];
    gastosSnapshot.forEach(doc => todosLosMovimientos.push({ id: doc.id, tipo: 'Gasto', ...doc.data() }));
    ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ id: doc.id, tipo: 'Ingreso', ...doc.data() }));
    nominaSnapshot.forEach(doc => todosLosMovimientos.push({ id: doc.id, tipo: 'Nómina', ...doc.data() }));

    if (todosLosMovimientos.length === 0) {
        activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
        return;
    }

        todosLosMovimientos.sort((a, b) => {
            const dateA = a.fechaDePago?.toDate() || a.fechaDeCreacion?.toDate() || new Date(a.fecha?.replace(/-/g, '/')) || 0;
            const dateB = b.fechaDePago?.toDate() || b.fechaDeCreacion?.toDate() || new Date(b.fecha?.replace(/-/g, '/')) || 0;
            return dateB - dateA;
        });
        
        activityFeed.innerHTML = '';
        todosLosMovimientos.slice(0, 15).forEach(mov => {
            const fecha = (mov.fechaDePago?.toDate() || mov.fechaDeCreacion?.toDate() || new Date(mov.fecha)).toLocaleDateString('es-ES');
            const monto = mov.montoNeto || mov.montoDescontado || (mov.totalConImpuestos || mov.monto);
            const descripcion = mov.descripcion || `Pago de nómina (${mov.periodo})`;
            const itemElement = document.createElement('div');
            itemElement.classList.add('activity-feed-item');
            // **CHANGE 1: Add a data-id attribute to link the HTML to the data**
            itemElement.dataset.movId = mov.id; 
            const signo = (mov.tipo === 'Gasto' || mov.tipo === 'Nómina') ? '-' : '+';
            const iconoComprobante = mov.comprobanteURL ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';
            
            // **CHANGE 2: Add a container for the details**
            itemElement.innerHTML = `
                <div class="item-summary-clickable">
                    <div class="item-info">
                        <span class="item-description">${descripcion} (${mov.tipo})${iconoComprobante}</span>
                        <span class="item-details">${fecha} - Estado: ${mov.status || 'Pagado'}</span>
                    </div>
                    <span class="item-amount">${signo}$${monto.toLocaleString('es-MX')}</span>
                </div>
                <div class="item-details-view" style="display: none;"></div>
            `;
            activityFeed.appendChild(itemElement);
        });
    } catch (error) {
        console.error("Error al cargar la actividad del empleado:", error);
        activityFeed.innerHTML = '<p>Ocurrió un error al cargar la actividad.</p>';
    }
}

async function descargarRegistrosColaborador() {
    if (!currentUserData) return;
    alert(`Preparando la descarga de todos los registros de ${currentUserData.nombre}. Esto puede tardar...`);
    try {
        const viewer = auth.currentUser;
        if (!viewer) return alert("Error de autenticación");
        const viewerDoc = await db.collection('usuarios').doc(viewer.uid).get();
        const adminUid = viewerDoc.exists ? (viewerDoc.data().adminUid || viewer.uid) : viewer.uid;
        
        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
        const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('userId', '==', userId).get();
        
        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([gastosPromise, ingresosPromise, nominaPromise]);

        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha || '', Tipo: 'Gasto', Concepto: data.descripcion || '', Monto: -(data.totalConImpuestos || data.monto), Estado: data.status || '' });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fecha || '', Tipo: 'Ingreso', Concepto: data.descripcion || '', Monto: data.totalConImpuestos || data.monto, Estado: data.status || '' });
        });
        nominaSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({ Fecha: data.fechaDePago.toDate().toISOString().split('T')[0], Tipo: 'Nómina', Concepto: `Pago de nómina (${data.periodo})`, Monto: data.montoNeto, Estado: 'Pagado' });
        });
        
        if (registros.length === 0) {
            return alert("Este colaborador no tiene registros para descargar.");
        }
        registros.sort((a, b) => new Date(a.Fecha.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')) - new Date(b.Fecha.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')));
        exportToCSV(registros, `Registros-${currentUserData.nombre.replace(/ /g, '_')}`);
    } catch (error) {
        console.error("Error al descargar registros del colaborador:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}

activityFeed.addEventListener('click', (e) => {
    // We only react to clicks on the summary part, ignoring links
    const summary = e.target.closest('.item-summary-clickable');
    if (!summary || e.target.tagName === 'A') return;

    const itemElement = summary.closest('.activity-feed-item');
    const detailsContainer = itemElement.querySelector('.item-details-view');
    const movId = itemElement.dataset.movId;
    
    // Find the data for the clicked item from our global array
    const mov = todosLosMovimientos.find(m => m.id === movId);

    if (!detailsContainer || !mov) return;

    const isVisible = detailsContainer.style.display === 'block';

    if (isVisible) {
        detailsContainer.style.display = 'none';
    } else {
        // Build the details HTML
        let detailsHTML = '';

        if (mov.empresa) {
            detailsHTML += `<p><strong>Empresa:</strong> ${mov.empresa}</p>`;
        }
        if (mov.proyectoNombre) {
            detailsHTML += `<p><strong>Proyecto:</strong> ${mov.proyectoNombre}</p>`;
        }

        if (mov.impuestos && mov.impuestos.length > 0) {
            detailsHTML += '<h4>Impuestos Desglosados</h4>';
            mov.impuestos.forEach(imp => {
                const montoImpuesto = imp.tipo === 'porcentaje' ? (mov.monto * imp.valor) / 100 : imp.valor;
                detailsHTML += `<div class="tax-line"><span>- ${imp.nombre}</span><span>$${montoImpuesto.toLocaleString('es-MX')}</span></div>`;
            });
        }

        if (!detailsHTML) {
            detailsHTML = '<p>No hay detalles adicionales para este registro.</p>';
        }

        detailsContainer.innerHTML = detailsHTML;
        detailsContainer.style.display = 'block';
    }
});
