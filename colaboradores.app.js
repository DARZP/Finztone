import { auth, db, functions } from './firebase-init.js';

// --- Elementos del DOM ---
const usageBarFillEl = document.getElementById('usage-bar-fill');
const usageTextEl = document.getElementById('usage-text');
const planCards = document.querySelectorAll('.plan-card');

auth.onAuthStateChanged((user) => {
    if (user && user.uid) {
        // Escuchador para la suscripción del usuario
        const subRef = db.collection('suscripciones').doc(user.uid);
        subRef.onSnapshot(async (subDoc) => {
            if (subDoc.exists) {
                const subData = subDoc.data();
                
                // Contamos los colaboradores activos
                const colaboradoresQuery = db.collection('usuarios')
                    .where('adminUid', '==', user.uid)
                    .where('rol', '==', 'empleado')
                    .where('status', '==', 'activo');
                
                const snap = await colaboradoresQuery.get();
                const colaboradoresActuales = snap.size;
                const limiteColaboradores = subData.limiteColaboradores;

                // Actualizamos la barra de progreso
                const porcentajeUso = limiteColaboradores >= 9999 ? 0 : (colaboradoresActuales / limiteColaboradores) * 100;
                usageBarFillEl.style.width = `${porcentajeUso}%`;
                usageBarFillEl.textContent = `${Math.round(porcentajeUso)}%`;
                
                const limiteTexto = limiteColaboradores >= 9999 ? 'ilimitados' : limiteColaboradores;
                usageTextEl.textContent = `${colaboradoresActuales} de ${limiteTexto} colaboradores en uso.`;

                // Actualizamos la apariencia de las tarjetas de planes
                actualizarVistaDePlanes(subData.planNombre.toLowerCase());

            } else {
                console.log("No se encontró suscripción para este usuario.");
            }
        });
    } else {
        window.location.href = 'index.html';
    }
});

function actualizarVistaDePlanes(planActualId) {
    planCards.forEach(card => {
        const planId = card.id.replace('plan-', '');
        const button = card.querySelector('button');
        
        card.classList.remove('current-plan');
        button.disabled = false;
        button.textContent = button.dataset.plan === 'gratuito' ? 'Cambiar a Gratuito' : 'Actualizar';

        if (planId === planActualId) {
            card.classList.add('current-plan');
            button.disabled = true;
            button.textContent = 'Plan Actual';
        }
    });
}

// Añadimos event listeners a los botones de los planes
document.querySelector('.plans-container').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && !e.target.disabled) {
        const planId = e.target.dataset.plan;
        
        if (!confirm(`¿Estás seguro de que quieres cambiar al plan "${planId}"?`)) {
            return;
        }

        const cambiarPlan = functions.httpsCallable('cambiarPlanDeSuscripcion');
        e.target.textContent = 'Actualizando...';
        e.target.disabled = true;

        cambiarPlan({ planId: planId })
            .then(result => {
                alert(result.data.message);
            })
            .catch(error => {
                console.error("Error al cambiar de plan:", error);
                alert(`Error: ${error.message}`);
            });
    }
});
