import { auth, db, functions } from './firebase-init.js';

const addUserForm = document.getElementById('add-user-form');
const userListContainer = document.getElementById('user-list');

function mostrarUsuarios(usuarios) {
    userListContainer.innerHTML = '';
    if (usuarios.length === 0) {
        userListContainer.innerHTML = '<p>No hay colaboradores registrados.</p>';
        return;
    }

    usuarios.forEach(usuario => {
        const userElement = document.createElement('div'); // Cambiado de <a> a <div>
        userElement.classList.add('user-item');
        userElement.dataset.userId = usuario.id; // Guardamos el ID del usuario aquí

        const sueldoFormateado = (usuario.sueldoBruto || 0).toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN'
        });

        // --- LÓGICA NUEVA PARA EL BOTÓN ---
        const esActivo = usuario.status !== 'inactivo'; // Asumimos 'activo' si no es 'inactivo'
        const botonTexto = esActivo ? 'Desactivar' : 'Activar';
        const botonClass = esActivo ? 'btn-reject' : 'btn-approve'; // Reusamos los colores de los botones
        
        userElement.innerHTML = `
            <a href="perfil_empleado.html?id=${usuario.id}" class="user-info-link" style="text-decoration: none; color: inherit; flex-grow: 1;">
                <div class="user-info">
                    <div class="user-name">${usuario.nombre}</div>
                    <div class="user-details">${usuario.cargo || 'Sin cargo'} - ${usuario.email}</div>
                </div>
                <div class="user-salary">${sueldoFormateado}</div>
            </a>
            <button class="btn ${botonClass} status-btn" style="padding: 8px 16px; font-size: 0.9em;">
                ${botonTexto}
            </button>
        `;
        userListContainer.appendChild(userElement);
    });
}

userListContainer.addEventListener('click', async (e) => {
    // Solo reaccionamos si se hizo clic en un botón con la clase 'status-btn'
    if (!e.target.classList.contains('status-btn')) {
        return;
    }

    const boton = e.target;
    const userItem = boton.closest('.user-item');
    const userId = userItem.dataset.userId;
    
    // Determinamos cuál será el nuevo estado
    const esActivoActualmente = boton.classList.contains('btn-reject');
    const nuevoEstado = esActivoActualmente ? 'inactivo' : 'activo';

    if (!confirm(`¿Estás seguro de que deseas ${boton.textContent.toLowerCase()} a este colaborador?`)) {
        return;
    }

    boton.disabled = true;
    boton.textContent = '...';

    try {
        // Obtenemos una referencia a nuestra nueva función y la llamamos
        const actualizarEstado = functions.httpsCallable('actualizarEstadoColaborador');
        const result = await actualizarEstado({ userId: userId, nuevoEstado: nuevoEstado });

        alert(result.data.message);
        // La lista se refrescará automáticamente gracias a onSnapshot

    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("Error: " + error.message);
        // Revertimos el botón si hay un error
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
        // ... (la lógica de verificar el plan no cambia) ...
        const subRef = db.collection('suscripciones').doc(user.uid);
        const subDoc = await subRef.get();
        if (!subDoc.exists) throw new Error("No se pudo verificar tu plan.");
        const limiteColaboradores = subDoc.data().limiteColaboradores;
        const colaboradoresQuery = await db.collection('usuarios').where('adminUid', '==', user.uid).where('status', '==', 'activo').get();
        if (colaboradoresQuery.size >= limiteColaboradores) {
            throw new Error(`Has alcanzado el límite de ${limiteColaboradores} colaboradores.`);
        }

        // Obtenemos el rol seleccionado de los radio buttons
        const selectedRole = document.querySelector('input[name="user-role"]:checked').value;

        const dataToSend = {
            nombre: addUserForm['user-name'].value,
            email: addUserForm['user-email'].value,
            cargo: addUserForm['user-position'].value,
            sueldoBruto: parseFloat(addUserForm['user-salary'].value),
            rol: selectedRole, // <--- Lo añadimos aquí
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
        
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- 1. CONFIGURAR EL BOTÓN DE VOLVER ---
        const backButton = document.getElementById('back-button');
        try {
            // --- 2. OBTENER EL PERFIL DEL USUARIO ---
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};

            // Asignar la URL al botón de volver y ajustar la vista para el Co-Admin
            if (userData.rol === 'coadmin') {
                backButton.href = 'coadmin_dashboard.html';
                document.getElementById('add-user-form').style.display = 'none';
                const listCardTitle = document.querySelector('.list-card h2');
                if (listCardTitle) {
                    listCardTitle.textContent = 'Equipo de Colaboradores';
                }
            } else {
                backButton.href = 'dashboard.html';
            }

            // --- 3. CARGAR LA LISTA DE COLABORADORES (Lógica Simplificada) ---
            const adminUid = userData.adminUid || user.uid;

            db.collection('usuarios')
                .where('adminUid', '==', adminUid)
                .orderBy('nombre')
                .onSnapshot(snapshot => {
                    let usuarios = [];
                    snapshot.forEach(doc => {
                        // Añadimos a todos los usuarios que pertenecen al admin
                        usuarios.push({ id: doc.id, ...doc.data() });
                    });
                    
                    // --- LA CORRECCIÓN CLAVE ESTÁ AQUÍ ---
                    // Si el usuario es un coadmin, lo filtramos de la lista después de recibirla.
                    if (userData.rol === 'coadmin') {
                        usuarios = usuarios.filter(u => u.id !== user.uid);
                    }

                    mostrarUsuarios(usuarios);

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
