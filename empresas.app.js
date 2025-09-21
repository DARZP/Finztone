// --- CONFIGURACIÓN DE FIREBASE (igual que en los otros archivos) ---
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

// --- ELEMENTOS DEL DOM ---
const addCompanyForm = document.getElementById('add-company-form');
const companyListContainer = document.getElementById('company-list');

// --- LÓGICA DE LA PÁGINA ---

// Protección de la ruta y carga inicial de datos
auth.onAuthStateChanged((user) => {
    if (user) {
        // Carga y muestra la lista de empresas en tiempo real
        db.collection('empresas').orderBy('nombre').onSnapshot(snapshot => {
            const empresas = [];
            snapshot.forEach(doc => {
                empresas.push({ id: doc.id, ...doc.data() });
            });
            mostrarEmpresas(empresas);
        }, error => {
            console.error("Error al obtener las empresas: ", error);
        });
    } else {
        window.location.href = 'index.html';
    }
});

// Listener para el formulario de registro de nuevas empresas
addCompanyForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const companyName = addCompanyForm['company-name'].value;
    const companyRfc = addCompanyForm['company-rfc'].value;
    const contactName = addCompanyForm['contact-name'].value;
    const contactEmail = addCompanyForm['contact-email'].value;

    // Añadimos el nuevo documento a la colección 'empresas'
    db.collection('empresas').add({
        nombre: companyName,
        rfc: companyRfc,
        contactoNombre: contactName,
        contactoEmail: contactEmail,
        fechaDeCreacion: new Date()
    })
    .then(() => {
        alert(`¡Empresa "${companyName}" registrada exitosamente!`);
        addCompanyForm.reset();
    })
    .catch((error) => {
        console.error('Error al registrar la empresa: ', error);
        alert('Ocurrió un error al registrar la empresa.');
    });
});


// Función para renderizar la lista de empresas en el HTML
function mostrarEmpresas(empresas) {
    companyListContainer.innerHTML = ''; // Limpiamos la lista actual
    if (empresas.length === 0) {
        companyListContainer.innerHTML = '<p>No hay empresas registradas.</p>';
        return;
    }

    empresas.forEach(empresa => {
        const empresaElement = document.createElement('a');
        // Por ahora, el enlace no llevará a ningún lado. En el siguiente paso lo activaremos.
        empresaElement.href = `#`; // Próximamente: perfil_empresa.html?id=${empresa.id}
        empresaElement.classList.add('user-item'); // Reutilizamos la clase de CSS
        
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
