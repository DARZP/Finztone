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
const downloadEmployeeRecordsBtn = document.getElementById('download-employee-records-btn'); // <-- Nuevo elemento

let currentUserData = null; 

async function descargarRegistrosColaborador() {
    if (!currentUserData) return;
    alert(`Preparando la descarga de todos los registros de ${currentUserData.nombre}. Esto puede tardar...`);

    try {
        const email = currentUserData.email;
        
        const userIdFromUrl = urlParams.get('id'); 

        const gastosPromise = db.collection('gastos').where('emailCreador', '==', email).get();
        const ingresosPromise = db.collection('ingresos').where('emailCreador', '==', email).get();
        
        const nominaPromise = db.collection('pagos_nomina').where('userId', '==', userIdFromUrl).get();

        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, 
            ingresosPromise, 
            nominaPromise 
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
                Monto: data.montoNeto, // El monto neto que recibió el empleado
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
        
auth.onAuthStateChanged((user) => {
    if (user) {
        if (userId) {
            editProfileBtn.href = `editar_perfil.html?id=${userId}`;
            cargarDatosPerfil();
            downloadEmployeeRecordsBtn.addEventListener('click', descargarRegistrosColaborador); // <-- Añadimos el listener
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
        // ... (resto de tu código para cargar datos del perfil, sin cambios) ...

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
        profileNetSalary.textContent = `$${sueldoNeto.toLocaleString('es-MX')}`;

        cargarActividad(currentUserData.email);

    } else {
        profileName.textContent = "Usuario no encontrado";
    }
}

async function cargarActividad(userEmail) {
    if (!userId || !userEmail) return;

    const gastosPromise = db.collection('gastos').where('emailCreador', '==', userEmail).get();
    const ingresosPromise = db.collection('ingresos').where('emailCreador', '==', userEmail).get();
    const nominaPromise = db.collection('pagos_nomina').where('userId', '==', userId).get();

    try {
        // ... (resto de tu código para cargar actividad, sin cambios) ...
        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaPromise
        ]);

        let todosLosMovimientos = [];

        gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Gasto', ...doc.data() }));
        ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Ingreso', ...doc.data() }));
        nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Nómina', ...doc.data() }));

        todosLosMovimientos.sort((a, b) => {
            const dateA = a.fechaDePago?.toDate() || a.fechaDeCreacion?.toDate() || 0;
            const dateB = b.fechaDePago?.toDate() || b.fechaDeCreacion?.toDate() || 0;
            return dateB - dateA;
        });

        activityFeed.innerHTML = '';
        if (todosLosMovimientos.length === 0) {
            activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
            return;
        }

        todosLosMovimientos.slice(0, 15).forEach(mov => {
            const fecha = (mov.fechaDePago || mov.fechaDeCreacion).toDate().toLocaleDateString('es-ES');
            const monto = mov.montoNeto || mov.montoDescontado || (mov.totalConImpuestos || mov.monto);
            const descripcion = mov.descripcion || `Pago de nómina (${mov.periodo})`;
            
            const itemElement = document.createElement('div');
            itemElement.classList.add('activity-feed-item');
            const signo = (mov.tipo === 'Gasto' || mov.tipo === 'Nómina') ? '-' : '+';
            
            itemElement.innerHTML = `
                <div class="item-info">
                    <span class="item-description">${descripcion} (${mov.tipo})</span>
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
