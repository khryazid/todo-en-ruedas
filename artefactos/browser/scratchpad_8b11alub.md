# QA Checklist Execution - Final Sections (8-11)

## Plan
- [x] Login as Admin (admin@test.com / Kh123123!)
- [x] **Section 8: Gastos**
    - [x] Navigate to 'Gastos'
    - [x] Register Gasto: Concepto: `Comida`, Monto: `5`, Tipo: `Variable`
    - [x] Verify appearance in table
- [ ] **Section 9: Cierre Diario**
    - [x] Navigate to 'Cierre Diario'
    - [x] Verify metrics (sales + expense)
    - [ ] Generate Reporte X/Z
- [ ] **Section 10: Dashboard**
    - [ ] Navigate to Dashboard
    - [ ] Verify charts/metrics
- [ ] **Section 11: Configuración**
    - [ ] Navigate to Configuración via Profile
    - [ ] Verify 'Tasas Activas' inputs

## Findings
- Gastos: Registering 'Comida' ($5.00) worked correctly. Total updated in real-time.
- Cierre Diario: Metrics correctly reflect $10.98 sales and $5.00 expenses, with Net Utility of $5.98.
- Note: 'Corte X (Ver)' button clicked but modal didn't appear immediately. Testing other report buttons.
