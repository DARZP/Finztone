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
        // La lógica clave: si el usuario tiene un 'adminUid' en su perfil, lo usamos. Si no, usamos su propio 'uid'.
        const adminUid = userData.adminUid || user.uid; 

        // Configuramos el botón de volver según el rol.
        if (userDoc.exists && userData.rol === 'coadmin') {
            backButton.href = 'coadmin_dashboard.html';
        } else {
            backButton.href = 'dashboard.html';
        }
        
        // Poblamos todos los filtros usando el 'adminUid' correcto.
        poblarFiltroUsuarios(adminUid);
        poblarFiltroCuentas(adminUid);   
        poblarFiltroEmpresas(adminUid);
    } else {
        window.location.href = 'index.html';
    }
});

// --- CORRECCIÓN 2: Las funciones ahora aceptan 'adminUid' y lo usan en las consultas ---
function poblarFiltroUsuarios(adminUid) {
    db.collection('usuarios').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const userData = doc.data();
                const option = new Option(userData.nombre, doc.id);
                userFilter.appendChild(option);
            });
        });
}

function poblarFiltroEmpresas(adminUid) {
    db.collection('empresas').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const empresa = doc.data();
                const option = new Option(empresa.nombre, empresa.nombre);
                companyFilter.appendChild(option);
            });
        });
}

function poblarFiltroCuentas(adminUid) {
    db.collection('cuentas').where('adminUid', '==', adminUid).orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const cuenta = doc.data();
                const option = new Option(cuenta.nombre, doc.id);
                accountFilter.appendChild(option);
            });
        });
}

// --- CORRECCIÓN 3: La lógica de generación de reporte también usa el 'adminUid' correcto ---
generateBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return alert("Por favor, inicia sesión de nuevo.");
    
    // Volvemos a obtener el adminUid para asegurar que la lógica sea autónoma y segura.
    const userDoc = await db.collection('usuarios').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const adminUid = userData.adminUid || user.uid;

    const startDate = new Date(startDateInput.value + 'T00:00:00');
    const endDate = new Date(endDateInput.value + 'T23:59:59');
    const includeIngresos = includeIngresosCheck.checked;
    const includeGastos = includeGastosCheck.checked;
    const includeNomina = includeNominaCheck.checked;
    const includeImpuestos = includeImpuestosCheck.checked;
    const selectedUserId = userFilter.value;
    const selectedAccountId = accountFilter.value;
    const selectedCompanyName = companyFilter.value;

    if (!startDateInput.value || !endDateInput.value) {
        return alert('Por favor, selecciona una fecha de inicio y de fin.');
    }

    alert('Generando reporte... Esto puede tardar un momento.');
    generateBtn.disabled = true;

    try {
        let reportData = [];
        const queries = [];
        const types = [];

        // Ahora todas las consultas se construyen usando el 'adminUid' correcto.
        if (includeIngresos) {
            queries.push(db.collection('ingresos').where('adminUid', '==', adminUid).where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('ingresos');
        }
        if (includeGastos) {
            queries.push(db.collection('gastos').where('adminUid', '==', adminUid).where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('gastos');
        }
        if (includeNomina) {
            queries.push(db.collection('pagos_nomina').where('adminUid', '==', adminUid).where('fechaDePago', '>=', startDate).where('fechaDePago', '<=', endDate).get());
            types.push('pagos_nomina');
        }
        if (includeImpuestos) {
            queries.push(db.collection('movimientos_impuestos').where('adminUid', '==', adminUid).where('fecha', '>=', startDate).where('fecha', '<=', endDate).get());
            types.push('movimientos_impuestos');
        }

        const results = await Promise.all(queries);
        
        results.forEach((snapshot, index) => {
            const type = types[index];
            snapshot.forEach(doc => {
                const data = doc.data();

                if (selectedUserId !== 'todos' && (data.creadorId !== selectedUserId && data.userId !== selectedUserId)) return;
                if (selectedAccountId !== 'todas' && data.cuentaId !== selectedAccountId) return;
                if (selectedCompanyName !== 'todas' && data.empresa !== selectedCompanyName) return;

                let row = {
                    Fecha: (data.fechaDeCreacion || data.fechaDePago || data.fecha).toDate().toLocaleDateString('es-ES'),
                    Tipo: 'N/A',
                    Concepto: data.descripcion || data.origen || '',
                    Categoria: data.categoria || 'N/A',
                    Monto: 0,
                    'Metodo de Pago': data.metodoPago || 'N/A',
                    Colaborador: data.nombreCreador || data.userName || 'N/A',
                    Cuenta: data.cuentaNombre || 'N/A'
                };

                if (type === 'ingresos') {
                    row.Tipo = 'Ingreso';
                    row.Monto = data.totalConImpuestos || data.monto;
                } else if (type === 'gastos') {
                    row.Tipo = 'Gasto';
                    row.Monto = -(data.totalConImpuestos || data.monto);
                } else if (type === 'pagos_nomina') {
                    row.Tipo = 'Nómina';
                    row.Concepto = `Pago de nómina: ${data.userName}`;
                    row.Monto = -data.montoDescontado;
                } else if (type === 'movimientos_impuestos') {
                    row.Tipo = `Impuesto (${data.tipoImpuesto})`;
                    row.Concepto = data.origen;
                    row.Monto = -data.monto;
                }
                
                reportData.push(row);
            });
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
