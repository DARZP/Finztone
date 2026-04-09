import { auth, db } from './firebase-init.js'; // Usamos nuestro archivo central

// --- Elementos del DOM ---
const userDisplayElement = document.getElementById('user-email'); 
const logoutButton = document.getElementById('logout-button');

// Elementos del Resumen Financiero
const totalIngresosEl = document.getElementById('total-ingresos-mes');
const totalGastosEl = document.getElementById('total-gastos-mes');
const balanceNetoEl = document.getElementById('balance-neto-mes');
let chartInstance = null; // Variable para guardar la gráfica

// --- Autenticación y Carga Principal ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            // Buscamos el perfil del usuario en Firestore usando su UID
            const userDoc = await db.collection('usuarios').doc(user.uid).get();
            let adminUid = user.uid; // Por defecto es el suyo
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                userDisplayElement.textContent = userData.nombre || 'Administrador';
                adminUid = userData.adminUid || user.uid; // Si es coadmin, usa el del jefe
            } else {
                userDisplayElement.textContent = 'Administrador';
            }

            // Llamamos a la nueva función para cargar la gráfica y los totales
            cargarResumenFinanciero(adminUid);

        } catch (error) {
            console.error("Error al obtener el perfil del usuario:", error);
            userDisplayElement.textContent = user.email; 
        }
    } else {
        window.location.href = 'index.html';
    }
});

// --- Función del Resumen Financiero y Gráfica ---
function cargarResumenFinanciero(adminUid) {
    const fechaActual = new Date();
    const mesActual = fechaActual.getMonth(); // 0 a 11
    const anioActual = fechaActual.getFullYear();
    const diasDelMes = new Date(anioActual, mesActual + 1, 0).getDate(); // Cuántos días tiene este mes

    let ingresosData = [];
    let gastosData = [];

    // Función interna que procesa los datos y dibuja la gráfica
    const procesarYDibujar = () => {
        let totalIngresos = 0;
        let totalGastos = 0;

        // Arrays para la gráfica (un valor por cada día del mes)
        const labelsDias = Array.from({length: diasDelMes}, (_, i) => i + 1);
        const datosIngresos = new Array(diasDelMes).fill(0);
        const datosGastos = new Array(diasDelMes).fill(0);

        // Procesar Ingresos
        ingresosData.forEach(ingreso => {
            if (ingreso.status === 'aprobado' || ingreso.status === 'pagado') {
                // Aseguramos leer la fecha correctamente evitando desfases de zona horaria
                const fechaObj = ingreso.fecha.toDate ? ingreso.fecha.toDate() : new Date(ingreso.fecha + 'T12:00:00');
                
                if (fechaObj.getMonth() === mesActual && fechaObj.getFullYear() === anioActual) {
                    const monto = parseFloat(ingreso.totalConImpuestos || ingreso.monto || 0);
                    totalIngresos += monto;
                    datosIngresos[fechaObj.getDate() - 1] += monto; // Sumamos al día correspondiente
                }
            }
        });

        // Procesar Gastos
        gastosData.forEach(gasto => {
            if (gasto.status === 'aprobado' || gasto.status === 'pagado') {
                const fechaObj = gasto.fecha.toDate ? gasto.fecha.toDate() : new Date(gasto.fecha + 'T12:00:00');
                
                if (fechaObj.getMonth() === mesActual && fechaObj.getFullYear() === anioActual) {
                    const monto = parseFloat(gasto.totalConImpuestos || gasto.monto || 0);
                    totalGastos += monto;
                    datosGastos[fechaObj.getDate() - 1] += monto; 
                }
            }
        });

        const balanceNeto = totalIngresos - totalGastos;

        // 1. Actualizar Textos en las Tarjetas
        if (totalIngresosEl) totalIngresosEl.textContent = `$${totalIngresos.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
        if (totalGastosEl) totalGastosEl.textContent = `$${totalGastos.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
        if (balanceNetoEl) {
            balanceNetoEl.textContent = `$${balanceNeto.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
            balanceNetoEl.style.color = balanceNeto < 0 ? '#ef4444' : '#3b82f6'; // Rojo si es negativo, azul si es positivo
        }

        // 2. Dibujar la Gráfica
        const ctx = document.getElementById('financialChart');
        if (!ctx) return;

        if (chartInstance) {
            chartInstance.destroy(); // Destruimos la gráfica anterior para no encimarlas
        }

        // Detectar si estamos en modo claro u oscuro para el color de las letras de la gráfica
        const textColor = document.body.classList.contains('light-mode') ? '#64748b' : '#aeb9c5';
        const gridColor = document.body.classList.contains('light-mode') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

        chartInstance = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: labelsDias,
                datasets: [
                    {
                        label: 'Ingresos',
                        data: datosIngresos,
                        borderColor: '#10b981', // Verde
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4, // Curvas suaves
                        fill: true
                    },
                    {
                        label: 'Gastos',
                        data: datosGastos,
                        borderColor: '#ef4444', // Rojo
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: "'Poppins', sans-serif" } } }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { ticks: { color: textColor }, grid: { color: gridColor } }
                }
            }
        });
    };

    // Escuchamos Ingresos en tiempo real
    db.collection('ingresos').where('adminUid', '==', adminUid).onSnapshot(snap => {
        ingresosData = snap.docs.map(doc => doc.data());
        procesarYDibujar();
    });

    // Escuchamos Gastos en tiempo real
    db.collection('gastos').where('adminUid', '==', adminUid).onSnapshot(snap => {
        gastosData = snap.docs.map(doc => doc.data());
        procesarYDibujar();
    });
}

// --- Cerrar Sesión ---
logoutButton.addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
});

