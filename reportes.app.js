// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
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

// --- LÓGICA DE LA PÁGINA DE PERFIL ---

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

// Elementos del DOM
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

let currentUserData = null; // Guardaremos los datos del usuario aquí

if (userId) {
    editProfileBtn.href = `editar_perfil.html?id=${userId}`;
}

// Carga los datos del perfil y LUEGO la actividad
async function cargarDatosPerfil() {
    if (!userId) {
        profileName.textContent = "ID de usuario no proporcionado.";
        return;
    }
    
    try {
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            currentUserData = userDoc.data();
            
            profileName.textContent = currentUserData.nombre;
            profileEmail.textContent = currentUserData.email;
            profilePosition.textContent = currentUserData.cargo;
            profileSalary.textContent = `$${currentUserData.sueldoBruto.toLocaleString('es-MX')}`;
            profilePhone.textContent = currentUserData.telefono || 'No registrado';
            profileClabe.textContent = currentUserData.clabe || 'No registrada';
            profileRfc.textContent = currentUserData.rfc || 'No registrado';

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

            // Una vez que tenemos los datos del perfil (sobre todo el email), cargamos la actividad
            cargarActividad(currentUserData.email);

        } else {
            profileName.textContent = "Usuario no encontrado";
        }
    } catch (error) {
        console.error("Error obteniendo datos del perfil:", error);
    }
}


// REESCRITO: Función para cargar TODA la actividad del empleado
async function cargarActividad(userEmail) {
    if (!userId || !userEmail) return;

    // 1. Creamos las tres consultas
    const gastosPromise = db.collection('gastos').where('emailCreador', '==', userEmail).get();
    const ingresosPromise = db.collection('ingresos').where('emailCreador', '==', userEmail).get();
    const nominaPromise = db.collection('pagos_nomina').where('userId', '==', userId).get();

    try {
        const [gastosSnapshot, ingresosSnapshot, nominaSnapshot] = await Promise.all([
            gastosPromise, ingresosPromise, nominaPromise
        ]);

        let todosLosMovimientos = [];

        // 2. Añadimos cada tipo de movimiento a un solo array
        gastosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Gasto', ...doc.data() }));
        ingresosSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Ingreso', ...doc.data() }));
        nominaSnapshot.forEach(doc => todosLosMovimientos.push({ tipo: 'Nómina', ...doc.data() }));

        // 3. Ordenamos el array combinado por la fecha más reciente
        todosLosMovimientos.sort((a, b) => {
            const dateA = a.fechaDePago?.toDate() || a.fechaDeCreacion?.toDate() || 0;
            const dateB = b.fechaDePago?.toDate() || b.fechaDeCreacion?.toDate() || 0;
            return dateB - dateA;
        });

        // 4. Mostramos los resultados
        activityFeed.innerHTML = '';
        if (todosLosMovimientos.length === 0) {
            activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
            return;
        }

        todosLosMovimientos.slice(0, 15).forEach(mov => { // Mostramos hasta 15 movimientos
            const fecha = (mov.fechaDePago || mov.fechaDeCreacion).toDate().toLocaleDateString('es-ES');
            const monto = mov.montoNeto || mov.montoDescontado || mov.totalConImpuestos || mov.monto;
            const descripcion = mov.descripcion || `Pago de nómina (${mov.periodo})`;
            
            const itemElement = document.createElement('div');
            itemElement.classList.add('activity-feed-item');
            const signo = mov.tipo === 'Gasto' ? '-' : '+';
            
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

// Protección de la ruta y carga de datos
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarDatosPerfil();
    } else {
        window.location.href = 'index.html';
    }
});
