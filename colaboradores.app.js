import { auth, db, functions } from './firebase-init.js';

// --- Elementos del DOM ---
const addUserForm = document.getElementById('add-user-form');
const userListContainer = document.getElementById('user-list');
const backButton = document.getElementById('back-button'); // Asegúrate de tener esta variable

// --- Función para mostrar usuarios en la lista ---
function mostrarUsuarios(usuarios, currentUserRole) {
    userListContainer.innerHTML = '';
    if (usuarios.length === 0) {
        userListContainer.innerHTML = '<p>No hay colaboradores registrados.</p>';
        return;
    }

    usuarios.forEach(usuario => {
        const userElement = document.createElement('div');
        userElement.classList.add('user-item');
        userElement.dataset.userId = usuario.id;

        const sueldoFormateado = (usuario.sueldoBruto || 0).toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        });

        let botonHTML = '';
        if (currentUserRole === 'admin') {
            const esActivo = usuario.status !== 'inactivo';
            const botonTexto = esActivo ? 'Desactivar' : 'Activar';
            const botonClass = esActivo ? 'btn-reject' : 'btn-approve';
            botonHTML = `<button class="btn ${botonClass} status-btn">${botonTexto}</button>`;
        }
        
        userElement.innerHTML = `
            <a href="perfil_empleado.html?id=${usuario.id}" class="user-info-link">
                <div class="user-info">
                    <div class="user-name">${usuario.nombre}</div>
                    <div class="user-details">${usuario.cargo || 'Sin cargo'} - ${usuario.email}</div>
                </div>
                <div class="user-salary">${sueldoFormateado}</div>
            </a>
            ${botonHTML}
        `;
        userListContainer.appendChild(userElement);
    });
}

// --- LÓGICA PRINCIPAL DE LA PÁGINA ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            const adminUid = userData.adminUid || user.uid;

            // Lógica para el botón de volver y la vista del formulario
            if (userData.rol === 'coadmin') {
                backButton.href = 'coadmin_dashboard.html';
                addUserForm.style.display = 'none'; // Ocultamos el formulario
                const listCardTitle = document.querySelector('.list-card h2');
                if (listCardTitle) {
                    listCardTitle.textContent = 'Equipo de Colaboradores';
                }
            } else {
                backButton.href = 'dashboard.html';
            }

            // Construcción de la consulta a la base de datos
            let query = db.collection('usuarios').where('adminUid', '==', adminUid);
            if (userData.rol === 'coadmin') {
                query = query.where('status', '==', 'activo');
            }

            // Ejecución de la consulta y renderizado de la lista
            query.orderBy('nombre').onSnapshot(snapshot => {
                let usuarios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (userData.rol === 'coadmin') {
                    usuarios = usuarios.filter(u => u.id !== user.uid);
                }

                mostrarUsuarios(usuarios, userData.rol);

            }, error => {
                console.error("Error al obtener usuarios:", error);
                alert("Ocurrió un error al cargar la lista. Revisa la consola (F12).");
            });

        } catch (error) {
            console.error("Error al verificar el rol del usuario:", error);
            backButton.href = 'dashboard.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

// --- EVENT LISTENERS PARA LOS FORMULARIOS Y BOTONES ---

userListContainer.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('status-btn')) return;

    const boton = e.target;
    const userItem = boton.closest('.user-item');
    const userId = userItem.dataset.userId;
    const esActivoActualmente = boton.classList.contains('btn-reject');
    const nuevoEstado = esActivoActualmente ? 'inactivo' : 'activo';

    if (!confirm(`¿Estás seguro de que deseas ${boton.textContent.toLowerCase()} a este colaborador?`)) return;

    boton.disabled = true;
    boton.textContent = '...';

    try {
        const actualizarEstado = functions.httpsCallable('actualizarEstadoColaborador');
        const result = await actualizarEstado({ userId: userId, nuevoEstado: nuevoEstado });
        alert(result.data.message);
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("Error: " + error.message);
        boton.disabled = false;
        boton.textContent = esActivoActualmente ? 'Desactivar' : 'Activar';
    }
});

addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Error de autenticación.");

    const submitButton = addUserForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Procesando...';

    try {
        const subRef = db.collection('suscripciones').doc(user.uid);
        const subDoc = await subRef.get();
        if (!subDoc.exists) throw new Error("No se pudo verificar tu plan.");
        
        const limiteColaboradores = subDoc.data().limiteColaboradores;
        const colaboradoresQuery = await db.collection('usuarios').where('adminUid', '==', user.uid).where('status', '==', 'activo').get();
        
        if (colaboradoresQuery.size >= limiteColaboradores) {
            throw new Error(`Has alcanzado el límite de ${limiteColaboradores} colaboradores.`);
        }

        const selectedRole = document.querySelector('input[name="user-role"]:checked').value;
        const dataToSend = {
            nombre: addUserForm['user-name'].value,
            email: addUserForm['user-email'].value,
            cargo: addUserForm['user-position'].value,
            sueldoBruto: parseFloat(addUserForm['user-salary'].value),
            rol: selectedRole,
        };

        const crearColaborador = functions.httpsCallable('crearColaborador');
        const result = await crearColaborador(dataToSend);
        alert(result.data.message);
        addUserForm.reset();

    } catch (error) {
        console.error('Error al agregar colaborador: ', error);
        alert("Ocurrió un error: " + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Agregar Colaborador';
    }
});
