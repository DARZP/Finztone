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

// ---- LÓGICA DE LA PÁGINA DE REPORTES ----

// Elementos del DOM
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const generateBtn = document.getElementById('generate-report-btn');
const totalIncomeEl = document.getElementById('total-income');
const totalExpensesEl = document.getElementById('total-expenses');
const totalPayrollEl = document.getElementById('total-payroll');
const balanceEl = document.getElementById('balance');
const chartCanvas = document.getElementById('expenses-chart');
let expensesChart = null; // Variable para guardar la instancia del gráfico

// Verificación de autenticación
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'index.html';
    }
});

// Event listener para el botón de generar reporte
generateBtn.addEventListener('click', async () => {
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    endDate.setHours(23, 59, 59, 999); // Ajustar para incluir todo el día de fin

    if (!startDateInput.value || !endDateInput.value) {
        alert('Por favor, selecciona una fecha de inicio y de fin.');
        return;
    }

    // 1. Obtener datos de Firestore
    const incomePromise = db.collection('ingresos').where('fecha', '>=', startDateInput.value).where('fecha', '<=', endDateInput.value).get();
    const expensesPromise = db.collection('gastos').where('fecha', '>=', startDateInput.value).where('fecha', '<=', endDateInput.value).get();
    const payrollPromise = db.collection('pagos_nomina').where('fechaDePago', '>=', startDate).where('fechaDePago', '<=', endDate).get();

    const [incomeSnapshot, expensesSnapshot, payrollSnapshot] = await Promise.all([incomePromise, expensesPromise, payrollPromise]);

    // 2. Calcular totales
    const totalIncome = incomeSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
    const totalExpenses = expensesSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
    const totalPayroll = payrollSnapshot.docs.reduce((sum, doc) => sum + doc.data().monto, 0);
    const balance = totalIncome - (totalExpenses + totalPayroll);

    // 3. Actualizar las tarjetas KPI
    totalIncomeEl.textContent = `$${totalIncome.toFixed(2)}`;
    totalExpensesEl.textContent = `$${totalExpenses.toFixed(2)}`;
    totalPayrollEl.textContent = `$${totalPayroll.toFixed(2)}`;
    balanceEl.textContent = `$${balance.toFixed(2)}`;
    balanceEl.className = balance >= 0 ? 'positive' : 'negative';

    // 4. Preparar datos y crear el gráfico
    const expensesByCategory = {};
    expensesSnapshot.docs.forEach(doc => {
        const expense = doc.data();
        if (expensesByCategory[expense.categoria]) {
            expensesByCategory[expense.categoria] += expense.monto;
        } else {
            expensesByCategory[expense.categoria] = expense.monto;
        }
    });

    // Destruir el gráfico anterior si existe, para evitar errores
    if (expensesChart) {
        expensesChart.destroy();
    }

    // Crear el nuevo gráfico de pastel
    expensesChart = new Chart(chartCanvas, {
        type: 'pie',
        data: {
            labels: Object.keys(expensesByCategory),
            datasets: [{
                label: 'Gastos por Categoría',
                data: Object.values(expensesByCategory),
                backgroundColor: ['#00A99D', '#FFC107', '#FF5722', '#3F51B5', '#E91E63', '#4CAF50'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
});