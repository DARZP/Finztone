import { auth, db } from './firebase-init.js';

// --- Elementos del DOM ---
const planNombreEl = document.getElementById('plan-nombre');
const planEstadoEl = document.getElementById('plan-estado');
const usageBarFillEl = document.getElementById('usage-bar-fill');
const usageTextEl = document.getElementById('usage-text');


auth.onAuthStateChanged((user) => {
    if (user && user.uid) {
        // 1. Obtenemos la información de la suscripción del admin
        const subRef = db.collection('suscripciones').doc(user.uid);
        subRef.onSnapshot(async (subDoc) => {
            if (subDoc.exists) {
                const subData = subDoc.data();
                planNombreEl.textContent = subData.planNombre;
                planEstadoEl.textContent = subData.estado;
                
                // 2. Ahora, contamos cuántos colaboradores tiene este admin
                const colaboradoresQuery = await db.collection('usuarios')
                    .where('adminUid', '==', user.uid)
                    .where('rol', '==', 'empleado')
                    .get();
                
                const colaboradoresActuales = colaboradoresQuery.size;
                const limiteColaboradores = subData.limiteColaboradores;

                // 3. Actualizamos la barra de progreso y el texto
                const porcentajeUso = (colaboradoresActuales / limiteColaboradores) * 100;
                
                usageBarFillEl.style.width = `${porcentajeUso}%`;
                usageBarFillEl.textContent = `${Math.round(porcentajeUso)}%`;
                usageTextEl.textContent = `${colaboradoresActuales} de ${limiteColaboradores} colaboradores en uso.`;

            } else {
                console.log("No se encontró suscripción para este usuario.");
                planNombreEl.textContent = "No encontrado";
            }
        });
    } else {
        window.location.href = 'index.html';
    }
});
