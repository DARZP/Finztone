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

// --- LÓGICA DE LA PÁGINA DE PERFIL DE EMPRESA ---

// Obtenemos el ID de la empresa de la URL (ej: ?id=ABC123XYZ)
const urlParams = new URLSearchParams(window.location.search);
const empresaId = urlParams.get('id');

// Elementos del DOM
const companyNameEl = document.getElementById('company-name');
const companyRfcEl = document.getElementById('company-rfc');
const contactNameEl = document.getElementById('contact-name');
const contactEmailEl = document.getElementById('contact-email');
const editCompanyBtn = document.getElementById('edit-company-btn');

const addProjectForm = document.getElementById('add-project-form');
const activeProjectsList = document.getElementById('active-projects-list');
const inactiveProjectsList = document.getElementById('inactive-projects-list');


auth.onAuthStateChanged((user) => {
    if (user && empresaId) {
        cargarDatosDeEmpresa(empresaId);
    } else if (!empresaId) {
        alert("ID de empresa no proporcionado.");
        window.location.href = 'empresas.html';
    } else {
        window.location.href = 'index.html';
    }
});

// Función principal para cargar toda la información
async function cargarDatosDeEmpresa(id) {
    // 1. Cargar datos de la empresa
    const empresaDoc = await db.collection('empresas').doc(id).get();
    if (empresaDoc.exists) {
        const data = empresaDoc.data();
        companyNameEl.textContent = data.nombre || 'No disponible';
        companyRfcEl.textContent = data.rfc || 'No disponible';
        contactNameEl.textContent = data.contactoNombre || 'No disponible';
        contactEmailEl.textContent = data.contactoEmail || 'No disponible';
        // Haremos la página de editar en el siguiente paso
        // editCompanyBtn.href = `editar_empresa.html?id=${id}`;
    } else {
        alert("Empresa no encontrada.");
    }

    // 2. Cargar proyectos de la empresa en tiempo real
    db.collection('proyectos').where('empresaId', '==', id).orderBy('fechaDeCreacion', 'desc')
        .onSnapshot(snapshot => {
            const proyectos = [];
            snapshot.forEach(doc => proyectos.push({ id: doc.id, ...doc.data() }));
            mostrarProyectos(proyectos);
        });
}

// Función para mostrar los proyectos en sus respectivas listas
function mostrarProyectos(proyectos) {
    activeProjectsList.innerHTML = '';
    inactiveProjectsList.innerHTML = '';

    if (proyectos.length === 0) {
        activeProjectsList.innerHTML = '<p>Esta empresa aún no tiene proyectos.</p>';
        return;
    }

    proyectos.forEach(proyecto => {
        const item = document.createElement('div');
        item.classList.add('activity-feed-item'); // Reutilizamos estilos
        
        if (proyecto.status === 'activo') {
            item.innerHTML = `
                <div class="item-info">
                    <span class="item-description">${proyecto.nombre}</span>
                </div>
                <button class="btn btn-secondary btn-deactivate" data-id="${proyecto.id}">Desactivar</button>
            `;
            activeProjectsList.appendChild(item);
        } else { // Si es 'inactivo'
            item.innerHTML = `
                <div class="item-info">
                    <span class="item-description" style="text-decoration: line-through;">${proyecto.nombre}</span>
                </div>
                <button class="btn btn-activate" data-id="${proyecto.id}">Activar</button>
            `;
            inactiveProjectsList.appendChild(item);
        }
    });
}

// Listener para el formulario de agregar proyecto
addProjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const projectName = addProjectForm['project-name'].value;

    db.collection('proyectos').add({
        nombre: projectName,
        empresaId: empresaId,
        status: 'activo', // Los proyectos nuevos siempre están activos
        fechaDeCreacion: new Date()
    }).then(() => {
        addProjectForm.reset();
    }).catch(error => console.error("Error al agregar proyecto:", error));
});

// Listener para los botones de activar/desactivar (usando delegación de eventos)
document.addEventListener('click', (e) => {
    const projectId = e.target.dataset.id;
    if (!projectId) return;

    if (e.target.classList.contains('btn-deactivate')) {
        db.collection('proyectos').doc(projectId).update({ status: 'inactivo' });
    }

    if (e.target.classList.contains('btn-activate')) {
        db.collection('proyectos').doc(projectId).update({ status: 'activo' });
    }
});
