import { auth, db } from './firebase-init.js';
import { exportToCSV } from './utils.js';

// --- ELEMENTOS DEL DOM ---
const generateBtn = document.getElementById('generate-spreadsheet-btn');
const userFilter = document.getElementById('user-filter');
const accountFilter = document.getElementById('account-filter');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const includeIngresosCheck = document.getElementById('include-ingresos');
const includeGastosCheck = document.getElementById('include-gastos');
const includeNominaCheck = document.getElementById('include-nomina');
const includeImpuestosCheck = document.getElementById('include-impuestos');
const companyFilter = document.getElementById('company-filter');
const backButton = document.getElementById('back-button');

// --- LÓGICA PRINCIPAL ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- CORRECCIÓN 1: Identificamos el rol y el adminUid correcto ---
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const adminUid = userData.adminUid || user.uid; // La lógica clave

        // Configuramos el botón de volver
        backButton.href = userData.rol === 'coadmin' ? 'coadmin_dashboard.html' : 'dashboard.html';
        
        // Poblamos los filtros usando el adminUid correcto
        poblarFiltroUsuarios(adminUid);
        poblarFiltroCuentas(adminUid);
        poblarFiltroEmpresas(adminUid);
    } else {
        window.location.href = 'index.html';
    }
});

// --- CORRECCIÓN 2: Las funciones ahora aceptan 'adminUid' como parámetro ---
function poblarFiltroUsuarios(adminUid) {
    db.collection('usuarios').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                userFilter.appendChild(new Option(doc.data().nombre, doc.id));
            });
        });
}

function poblarFiltroEmpresas(adminUid) {
    db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                companyFilter.appendChild(new Option(doc.data().nombre, doc.data().nombre));
            });
        });
}

function poblarFiltroCuentas(adminUid) {
    db.collection('cuentas').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                accountFilter.appendChild(new Option(doc.data().nombre, doc.id));
            });
        });
}

// --- CORRECCIÓN 3: La lógica de generación de reporte también usa el 'adminUid' ---
generateBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return alert("Por favor, inicia sesión de nuevo.");

    // Volvemos a obtener el adminUid para asegurar que la lógica sea autónoma
    const userDoc = await db.collection('usuarios').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const adminUid = userData.adminUid || user.uid;
    
    // El resto de la lógica de obtención de filtros es la misma
    const startDate = new Date(startDateInput.value + 'T00:00:00');
    const endDate = new Date(endDateInput.value + 'T23:59:59');
    // ... (resto de las variables de filtros) ...

    if (!startDateInput.value || !endDateInput.value) {
        return alert('Por favor, selecciona una fecha de inicio y de fin.');
    }

    alert('Generando reporte... Esto puede tardar un momento.');
    generateBtn.disabled = true;

    try {
        let reportData = [];
        const queries = [];
        const types = [];

        // Ahora todas las consultas usan el 'adminUid' correcto
        if (includeIngresosCheck.checked) {
            queries.push(db.collection('ingresos').where('adminUid', '==', adminUid).where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('ingresos');
        }
        if (includeGastosCheck.checked) {
            queries.push(db.collection('gastos').where('adminUid', '==', adminUid).where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('gastos');
        }
        if (includeNominaCheck.checked) {
            queries.push(db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('fechaDePago', '>=', startDate).where('fechaDePago', '<=', endDate).get());
            types.push('pagos_nomina');
        }
        if (includeImpuestosCheck.checked) {
            queries.push(db.collection('movimientos_impuestos').where('adminUid', '==', adminUid).where('fecha', '>=', startDate).where('fecha', '<=', endDate).get());
            types.push('movimientos_impuestos');
        }

        // El resto de la lógica para procesar y exportar los datos no necesita cambios
        // ... (Tu lógica existente para Promise.all, mapeo de datos y exportToCSV) ...

        const results = await Promise.all(queries);
        
        results.forEach((snapshot, index) => {
            // ... (Tu código de procesamiento de resultados que ya funcionaba) ...
        });
        
        if (reportData.length === 0) {
            alert('No se encontraron registros con los criterios seleccionados.');
        } else {
             reportData.sort((a, b) => new Date(a.Fecha.split('/').reverse().join('-')) - new Date(b.Fecha.split('/').reverse().join('-')));
             exportToCSV(reportData, "Reporte-FINZTONE");
        }

    } catch (error) {
        console.error("Error al generar el reporte: ", error);
        alert("Ocurrió un error al generar el reporte.");
    } finally {
        generateBtn.disabled = false;
    }
});
