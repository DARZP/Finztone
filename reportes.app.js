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

auth.onAuthStateChanged(user => {
    if (user) {
        poblarFiltroUsuarios();
        poblarFiltroCuentas();   
        poblarFiltroEmpresas();
    } else {
        window.location.href = 'index.html';
    }
});

function poblarFiltroUsuarios() {
    db.collection('usuarios').where('rol', '==', 'empleado').orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const user = doc.data();
                const option = new Option(user.nombre, doc.id);
                userFilter.appendChild(option);
            });
        });
}

function poblarFiltroEmpresas() {
    db.collection('empresas').orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const empresa = doc.data();
                // OJO: Usamos el NOMBRE como valor, ya que en los gastos/ingresos no guardamos el ID
                const option = new Option(empresa.nombre, empresa.nombre);
                companyFilter.appendChild(option);
            });
        });
}

function poblarFiltroCuentas() {
    db.collection('cuentas').orderBy('nombre').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const cuenta = doc.data();
                const option = new Option(cuenta.nombre, doc.id);
                accountFilter.appendChild(option);
            });
        });
}

// FUNCIÓN PRINCIPAL PARA GENERAR EL REPORTE
generateBtn.addEventListener('click', async () => {
    // 1. Recopilar todas las selecciones del formulario
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
    generateBtn.disabled = true; // Desactivamos el botón para evitar múltiples clics

    try {
        let reportData = [];
        const queries = [];
        const types = [];

        // 2. Construir las consultas a la base de datos según lo seleccionado
        if (includeIngresos) {
            queries.push(db.collection('ingresos').where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('ingresos');
        }
        if (includeGastos) {
            queries.push(db.collection('gastos').where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate).get());
            types.push('gastos');
        }
        if (includeNomina) {
            queries.push(db.collection('pagos_nomina').where('fechaDePago', '>=', startDate).where('fechaDePago', '<=', endDate).get());
            types.push('pagos_nomina');
        }
        if (includeImpuestos) {
            queries.push(db.collection('movimientos_impuestos').where('fecha', '>=', startDate).where('fecha', '<=', endDate).get());
            types.push('movimientos_impuestos');
        }

        // 3. Ejecutar todas las consultas
        const results = await Promise.all(queries);
        
        // 4. Procesar y unificar los resultados de forma específica
        results.forEach((snapshot, index) => {
            const type = types[index]; // Obtenemos el tipo de la consulta
            snapshot.forEach(doc => {
                const data = doc.data();

                // Filtramos por colaborador y cuenta
                if (selectedUserId !== 'todos' && (data.creadoPor !== selectedUserId && data.userId !== selectedUserId)) return;
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
            return alert('No se encontraron registros con los criterios seleccionados.');
        }

        // 5. Ordenar y exportar a CSV
        reportData.sort((a, b) => new Date(a.Fecha.split('/').reverse().join('-')) - new Date(b.Fecha.split('/').reverse().join('-')));
        exportToCSV(reportData);

    } catch (error) {
        console.error("Error al generar el reporte: ", error);
        alert("Ocurrió un error al generar el reporte.");
    } finally {
        generateBtn.disabled = false; // Reactivamos el botón al finalizar
    }
});

// Función auxiliar para convertir los datos a un archivo CSV y descargarlo
function exportToCSV(data) {
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => 
            headers.map(fieldName => 
                JSON.stringify(row[fieldName], (key, value) => value === null ? '' : value)
            ).join(',')
        )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' }); // Añadimos BOM para compatibilidad con Excel

    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte-Finztone-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
