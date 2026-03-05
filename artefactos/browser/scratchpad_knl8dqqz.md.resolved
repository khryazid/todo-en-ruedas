# QA Test Plan: Todo En Ruedas

## Phase 1 - Auth (Section 1)
- [ ] Navigate to http://localhost:5173
- [ ] Verify redirect to /login
- [ ] Login with WRONG credentials (wrong@test.com / wrong123) - verify toast error
- [ ] Login with valid admin credentials (admin@test.com / Kh123123!)
- [ ] Verify arrival at /dashboard or /pos
- [ ] Screenshot the dashboard

## Phase 2 - Setup Lock (Section 0)
- [ ] While logged in, try navigating to /setup
- [ ] Verify redirect away from /setup
- [ ] Screenshot status

## Phase 3 - POS Tests (Section 2.1 - Catalog)
- [ ] Navigate to POS (/pos)
- [ ] Verify search bar visibility and focus
- [ ] Test category tabs (click "General")
- [ ] Identify "Más Vendidos" bar and screenshot
- [ ] Search "BCV" and verify dropdown
- [ ] Click search result and verify item in cart
- [ ] Test grid/list toggle and screenshot list view
- [ ] Switch back to grid

## Phase 4 - POS Tests (Section 2.2 - Cart & Stock)
- [ ] Add "Producto BCV" to cart
- [ ] Increment quantity above stock - verify "⚠️ Stock insuficiente" toast
- [ ] Apply 10% discount and verify total
- [ ] Remove item using trash icon
- [ ] Test "Vaciar Carrito" button

## Phase 5 - POS Checkout (Section 2.3 & 2.4)
- [ ] Add product to cart
- [ ] Click "COBRAR"
- [ ] Verify USD and Bs totals
- [ ] Process CASH sale
- [ ] Verify post-sale receipt options
- [ ] Screenshot success screen

## Phase 6 - Credit Sale Test
- [ ] Add product to cart
- [ ] Open checkout
- [ ] Toggle "Crédito" without client - verify warning toast
- [ ] Search or create client
- [ ] Complete credit sale
- [ ] Screenshot result
