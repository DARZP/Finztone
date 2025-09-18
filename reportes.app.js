// ---- CONFIGURACIÓN INICIAL DE FIREBASE ----
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

// --- LÓGICA DE LA PÁGINA ---

auth.onAuthStateChanged(user => {
    if (user) {
        poblarFiltroUsuarios();
        poblarFiltroCuentas();
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

generateBtn.addEventListener('click', async () => {
    // 1. Recopilar todas las selecciones del formulario
    const startDate = new Date(document.getElementById('start-date').value + 'T00:00:00');
    const endDate = new Date(document.getElementById('end-date').value + 'T23:59:59');
    const includeIngresos = document.getElementById('include-ingresos').checked;
    const includeGastos = document.getElementById('include-gastos').checked;
    const includeNomina = document.getElementById('include-nomina').checked;
    const includeImpuestos = document.getElementById('include-impuestos').checked;
    const selectedUserId = userFilter.value;
    const selectedAccountId = accountFilter.value;

    if (!document.getElementById('start-date').value || !document.getElementById('end-date').value) {
        return alert('Por favor, selecciona una fecha de inicio y de fin.');
    }

    alert('Generando reporte... Esto puede tardar un momento.');

    try {
        let reportData = [];
        const queries = [];

        // 2. Construir las consultas a la base de datos según lo seleccionado
        if (includeIngresos) {
            let q = db.collection('ingresos').where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate);
            queries.push(q.get());
        }
        if (includeGastos) {
            let q = db.collection('gastos').where('status', '==', 'aprobado').where('fechaDeCreacion', '>=', startDate).where('fechaDeCreacion', '<=', endDate);
            queries.push(q.get());
        }
        if (includeNomina) {
            let q = db.collection('pagos_nomina').where('fechaDePago', '>=', startDate).where('fechaDePago', '<=', endDate);
            queries.push(q.get());
        }
        if (includeImpuestos) {
            let q = db.collection('movimientos_impuestos').where('fecha', '>=', startDate).where('fecha', '<=', endDate);
            queries.push(q.get());
        }

        // 3. Ejecutar todas las consultas
        const results = await Promise.all(queries);
        
        // 4. Procesar y unificar los resultados
        results.forEach(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                // Filtramos por colaborador y cuenta aquí, en el cliente
                if (selectedUserId !== 'todos' && (data.creadoPor !== selectedUserId && data.userId !== selectedUserId)) return;
                if (selectedAccountId !== 'todas' && data.cuentaId !== selectedAccountId) return;

                // Formateamos cada tipo de registro a una estructura común
                let row = {
                    Fecha: (data.fechaDeCreacion || data.fechaDePago || data.fecha).toDate().toLocaleDateString('es-ES'),
                    Tipo: data.tipoImpuesto ? 'Impuesto' : (data.userName ? 'Nómina' : (data.totalConImpuestos > 0 ? 'Ingreso/Gasto' : 'N/A')),
                    Concepto: data.descripcion || data.origen || `Nómina ${data.userName}`,
                    Monto: data.montoTotal || data.monto,
                    Colaborador: data.nombreCreador || data.userName || 'N/A',
                    Cuenta: data.cuentaNombre || 'N/A'
                };
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
    }
});

// Función auxiliar para convertir los datos a un archivo CSV y descargarlo
function exportToCSV(data) {
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','), // Encabezado
        ...data.map(row => 
            headers.map(fieldName => 
                JSON.stringify(row[fieldName], (key, value) => value === null ? '' : value)
            ).join(',')
        )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'Reporte-Finztone.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}







          
