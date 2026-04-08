import { auth, db } from './firebase-init.js';

// --- ELEMENTOS DEL DOM ---
const addCompanyForm = document.getElementById('add-company-form');
const companyListContainer = document.getElementById('company-list');
const backButton = document.getElementById('back-button');
const formCard = document.querySelector('.form-card');

// Variable global declarada de forma segura
let adminUidGlobal = null; 

// --- LÓGICA DE LA PÁGINA ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- LÓGICA DE ROLES ---
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        
        // Asignamos el ID correcto a la variable global
        adminUidGlobal = userData.adminUid || user.uid; 

        // Configuramos la UI según el rol
        if (userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
            if (formCard) formCard.style.display = 'none';
        } else {
            backButton.href = 'dashboard.html';
        }

        // --- CARGA DE DATOS ---
        // Verificamos que no sea nulo antes de preguntar a Firebase
        if (adminUidGlobal) {
            db.collection('empresas')
              .where('adminUid', '==', adminUidGlobal)
              .orderBy('nombre')
              .onSnapshot(snapshot => {
                  const empresas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                  mostrarEmpresas(empresas);
              }, error => {
                  console.error('Error al obtener las empresas: ', error);
              });
        }

    } else {
        window.location.href = 'index.html';
    }
});

// --- LISTENER DEL FORMULARIO ---
if (addCompanyForm) {
    addCompanyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!adminUidGlobal) {
            return alert("Error: No se ha cargado la información del administrador. Recarga la página.");
        }

        db.collection('empresas').add({
            nombre: addCompanyForm['company-name'].value,
            rfc: addCompanyForm['company-rfc'].value,
            contactoNombre: addCompanyForm['contact-name'].value,
            contactoEmail: addCompanyForm['contact-email'].value,
            fechaDeCreacion: new Date(),
            adminUid: adminUidGlobal // Aquí usamos la variable global correctamente
        })
        .then(() => {
            alert(`¡Empresa registrada exitosamente!`);
            addCompanyForm.reset();
        })
        .catch((error) => {
            console.error('Error al registrar la empresa: ', error);
            alert('Ocurrió un error al registrar la empresa.');
        });
    });
}

// Función para renderizar la lista de empresas (sin cambios)
function mostrarEmpresas(empresas) {
    companyListContainer.innerHTML = '';
    if (empresas.length === 0) {
        companyListContainer.innerHTML = '<p>No hay empresas registradas.</p>';
        return;
    }

    empresas.forEach(empresa => {
        const empresaElement = document.createElement('a');
        empresaElement.href = `perfil_empresa.html?id=${empresa.id}`;
        empresaElement.classList.add('user-item');
        
        empresaElement.innerHTML = `
            <div class="user-info">
                <div class="user-name">${empresa.nombre}</div>
                <div class="user-details">${empresa.contactoNombre || 'Sin contacto'} - ${empresa.contactoEmail || 'Sin email'}</div>
            </div>
            <div class="user-salary">${empresa.rfc || 'Sin RFC'}</div>
        `;
        companyListContainer.appendChild(empresaElement);
    });
}
