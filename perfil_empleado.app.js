import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

// --- VARIABLES GLOBALES Y ELEMENTOS DEL DOM ---
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePosition = document.getElementById('profile-position');
const profileSalary = document.getElementById('profile-salary');
const profilePhone = document.getElementById('profile-phone');
const profileClabe = document.getElementById('profile-clabe');
const profileRfc = document.getElementById('profile-rfc');
const activityFeed = document.getElementById('activity-feed');
const editProfileBtn = document.getElementById('edit-profile-btn');
const profileDeductionsList = document.getElementById('profile-deductions-list');
const profileNetSalary = document.getElementById('profile-net-salary');
const downloadEmployeeRecordsBtn = document.getElementById('download-employee-records-btn');

let currentUserData = null; 

// --- LÓGICA PRINCIPAL ---

auth.onAuthStateChanged((user) => {
    if (user) {
        if (userId) {
            editProfileBtn.href = `editar_perfil.html?id=${userId}`;
            cargarDatosPerfil();
            downloadEmployeeRecordsBtn.addEventListener('click', descargarRegistrosColaborador);
        }
    } else {
        window.location.href = 'index.html';
    }
});

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
    const admin = auth.currentUser; 
    if (!userId || !admin) return;

    try {
        const gastosPromise = db.collection('gastos').where('adminUid', '==', admin.uid).where('creadorId', '==', userId).get();
        const ingresosPromise = db.collection('ingresos').where('adminUid', '==', admin.uid).where('creadorId', '==', userId).get();
        const nominaPromise = db.collection('pagos_nomina').where('adminUid', '==', admin.uid).where('userId', '==', userId).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaSnapshot
        ]);

        let todosLosMovimientos = [];

        gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Gasto', ...doc.data() }));
        ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Ingreso', ...doc.data() }));
        nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Nómina', ...doc.data() }));

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

            // --- LÓGICA PARA EL ICONO DEL COMPROBANTE ---
            const iconoComprobante = mov.comprobanteURL 
                ? `<a href="${mov.comprobanteURL}" target="_blank" title="Ver comprobante" style="text-decoration: none; font-size: 1.1em; margin-left: 8px;">📎</a>` 
                : '';
            
            itemElement.innerHTML = `
                <div class="item-info">
                    <span class="item-description">
                        ${descripcion} (${mov.tipo})
                        ${iconoComprobante}
                    </span>
                    <span class="item-details">${fecha} - Estado: ${mov.status || 'Pagado'}</span>
                </div>
                <span class="item-amount">${signo}$${monto.toLocaleString('es-MX')}</span>
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
        const gastosPromise = db.collection('gastos').where('creadorId', '==', userId).get();
        const ingresosPromise = db.collection('ingresos').where('creadorId', '==', userId).get();
        const nominaPromise = db.collection('pagos_nomina').where('userId', '==', userId).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaSnapshot 
        ]);

        const registros = [];
        gastosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha || '',
                Tipo: 'Gasto',
                Concepto: data.descripcion || '',
                Monto: -(data.totalConImpuestos || data.monto),
                Estado: data.status || ''
            });
        });
        ingresosSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fecha || '',
                Tipo: 'Ingreso',
                Concepto: data.descripcion || '',
                Monto: data.totalConImpuestos || data.monto,
                Estado: data.status || ''
            });
        });
        nominaSnapshot.forEach(doc => {
            const data = doc.data();
            registros.push({
                Fecha: data.fechaDePago.toDate().toISOString().split('T')[0],
                Tipo: 'Nómina',
                Concepto: `Pago de nómina (${data.periodo})`,
                Monto: data.montoNeto,
                Estado: 'Pagado'
            });
        });

        registros.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        exportToCSV(registros, `Registros-${currentUserData.nombre.replace(/ /g, '_')}`);

    } catch (error) {
        console.error("Error al descargar registros del colaborador:", error);
        alert("Ocurrió un error al generar el reporte.");
    }
}
