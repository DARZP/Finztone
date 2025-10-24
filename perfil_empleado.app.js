import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

// --- VARIABLES GLOBALES Y ELEMENTOS DEL DOM ---
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

        cargarDatosPerfil();
        downloadEmployeeRecordsBtn.addEventListener('click', descargarRegistrosColaborador);

    } else {
        window.location.href = 'index.html';
    }
});

// --- EVENT LISTENERS PARA EDICIÓN GRANULAR ---
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
    const userDoc = await db.collection('usuarios').doc(userId).get();
    if (userDoc.exists) {
        currentUserData = userDoc.data();
        profileName.textContent = currentUserData.nombre;
        profileEmail.textContent = currentUserData.email;
        profilePosition.textContent = currentUserData.cargo || 'No disponible';
        profilePhone.textContent = currentUserData.telefono || 'No registrado';
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

        cargarActividad();
    } else {
        profileName.textContent = "Usuario no encontrado";
    }
}

async function cargarActividad() {
    const viewer = auth.currentUser;
    // 'userId' es el ID del perfil que estamos viendo (en este caso, el del Administrador)
    if (!userId || !viewer) {
        console.error("ERROR: No se encontró el 'userId' del perfil o el 'viewer'.");
        return;
    }

    console.log("--- INICIANDO DIAGNÓSTICO DE 'cargarActividad' ---");
    
    // Obtenemos el perfil del espectador (el Co-admin)
    const viewerDoc = await db.collection('usuarios').doc(viewer.uid).get();
    const viewerData = viewerDoc.exists ? viewerDoc.data() : {};
    const adminUid = viewerData.adminUid || viewer.uid;

    console.log("Perfil que se está viendo (userId):", userId);
    console.log("Quien está viendo (viewer.uid):", viewer.uid);
    console.log("ID del equipo (adminUid) que se usará en las consultas:", adminUid);

    try {
        console.log("PASO 1: Ejecutando consultas a la base de datos...");

        const gastosPromise = db.collection('gastos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', adminUid).where('creadorId', '==', userId).get();
        const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('userId', '==', userId).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaPromise
        ]);

        console.log(`PASO 2: Consultas finalizadas.`);
        console.log(`- Gastos encontrados: ${gastosSnapshot.size}`);
        console.log(`- Ingresos encontrados: ${ingresosSnapshot.size}`);
        console.log(`- Pagos de Nómina encontrados: ${nominaSnapshot.size}`);

        let todosLosMovimientos = [];
        gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Gasto', ...doc.data() }));
        ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Ingreso', ...doc.data() }));
        nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Nómina', ...doc.data() }));

        console.log(`PASO 3: Total de movimientos combinados: ${todosLosMovimientos.length}`);

        if (todosLosMovimientos.length === 0) {
            activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
            console.log("--- FIN DEL DIAGNÓSTICO ---");
            return;
        }
        
        todosLosMovimientos.sort((a, b) => {
            const dateA = a.fechaDePago?.toDate() || a.fechaDeCreacion?.toDate() || new Date(a.fecha?.replace(/-/g, '/')) || 0;
            const dateB = b.fechaDePago?.toDate() || b.fechaDeCreacion?.toDate() || new Date(b.fecha?.replace(/-/g, '/')) || 0;
            return dateB - dateA;
        });

        activityFeed.innerHTML = '';
        if (todosLosMovimientos.length === 0) {
            activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
            return;
        }

        todosLosMovimientos.slice(0, 15).forEach(mov => {
            const fecha = (mov.fechaDePago?.toDate() || mov.fechaDeCreacion?.toDate() || new Date(mov.fecha)).toLocaleDateString('es-ES');
            const monto = mov.montoNeto || mov.montoDescontado || (mov.totalConImpuestos || mov.monto);
            const descripcion = mov.descripcion || `Pago de nómina (${mov.periodo})`;
            const itemElement = document.createElement('div');
            itemElement.classList.add('activity-feed-item');
            const signo = (mov.tipo === 'Gasto' || mov.tipo === 'Nómina') ? '-' : '+';
            const iconoComprobante = mov.comprobanteURL ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` : '';
            itemElement.innerHTML = `<div class="item-info"><span class="item-description">${descripcion} (${mov.tipo})${iconoComprobante}</span><span class="item-details">${fecha} - Estado: ${mov.status || 'Pagado'}</span></div><span class="item-amount">${signo}$${monto.toLocaleString('es-MX')}</span>`;
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

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, 
            ingresosPromise, 
            nominaPromise 
        ]);

        const registros = [];
        gastosSnapshot.forEach(doc => { /* ... (tu código para procesar gastos) ... */ });
        ingresosSnapshot.forEach(doc => { /* ... (tu código para procesar ingresos) ... */ });
        nominaSnapshot.forEach(doc => { /* ... (tu código para procesar nómina) ... */ });

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
