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

// 1. Obtenemos el ID del empleado de la URL
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');

// Elementos del DOM donde mostraremos la info
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePosition = document.getElementById('profile-position');
const profileSalary = document.getElementById('profile-salary');
const profilePhone = document.getElementById('profile-phone');
const profileClabe = document.getElementById('profile-clabe');
const profileRfc = document.getElementById('profile-rfc');
const activityFeed = document.getElementById('activity-feed');
const editProfileBtn = document.getElementById('edit-profile-btn');

// Hacemos que el botón "Editar" apunte a la página de edición correcta
if (userId) {
    editProfileBtn.href = `editar_perfil.html?id=${userId}`;
}

// 2. Función para cargar los datos del perfil
function cargarDatosPerfil() {
    if (!userId) {
        profileName.textContent = "ID de usuario no proporcionado.";
        return;
    }
    
    db.collection('usuarios').doc(userId).onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            profileName.textContent = userData.nombre;
            profileEmail.textContent = userData.email;
            profilePosition.textContent = userData.cargo;
            profileSalary.textContent = `$${userData.sueldoBruto.toLocaleString('es-MX')}`;
            // Mostramos los datos adicionales o un texto por defecto si no existen
            profilePhone.textContent = userData.telefono || 'No registrado';
            profileClabe.textContent = userData.clabe || 'No registrada';
            profileRfc.textContent = userData.rfc || 'No registrado';
        } else {
            profileName.textContent = "Usuario no encontrado";
        }
    }, error => {
        console.log("Error obteniendo datos:", error);
    });
}

// 3. Función para cargar la actividad (gastos) del empleado
function cargarActividad() {
    if (!userId) return;

    db.collection('gastos')
      .where('creadoPor', '==', userId)
      .orderBy('fechaDeCreacion', 'desc')
      .limit(10)
      .onSnapshot(querySnapshot => {
            activityFeed.innerHTML = '';
            if (querySnapshot.empty) {
                activityFeed.innerHTML = '<p>Este empleado no tiene actividad reciente.</p>';
                return;
            }
            querySnapshot.forEach(doc => {
                const gasto = doc.data();
                const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES');
                const itemElement = document.createElement('div');
                itemElement.classList.add('activity-feed-item');
                itemElement.innerHTML = `
                    <div class="item-info">
                        <span class="item-description">${gasto.descripcion} (Gasto)</span>
                        <span class="item-details">${fecha} - Estado: ${gasto.status}</span>
                    </div>
                    <span class="item-amount">-$${gasto.monto.toFixed(2)}</span>
                `;
                activityFeed.appendChild(itemElement);
            });
        });
}

// Protección de la ruta y carga de datos
auth.onAuthStateChanged((user) => {
    if (user) {
        cargarDatosPerfil();
        cargarActividad();
    } else {
        window.location.href = 'index.html';
    }
}); 