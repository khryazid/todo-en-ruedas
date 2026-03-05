# QA Checklist Tracking: Onboarding/Setup Flow

## Steps:
- [x] Go to http://localhost:5173
- [x] Step 1: Registration/Signup
    - [x] Find Signup link/form
    - [x] Register with `admin@test.com` and `Kh123123!`
    - [x] Confirm login
- [x] Step 2: Verification of redirect to `/setup`
- [/] Step 3: Application Setup Form
    - [x] Fill: Todo En Ruedas CA
    - [x] Fill: Tipo de RIF J
    - [x] Fill: RIF Numérico 12345678
    - [x] Fill: Dirección (Av. Libertador, Caracas)
    - [x] Fill: Margen de Ganancia Global por Defecto 30
    - [x] Fill: IVA por Defecto 16
    - [x] Save configuration
- [x] Step 4: Verification of redirect to `/dashboard` (Redirected to /sales, which is part of dashboard)
- [x] Step 5: Verification of Setup Lock
    - [x] Try manual navigation back to `/setup`
    - [x] Confirm redirection back to `/sales` (SetupLock works)

## Observations & Issues:
- App redirects to `http://localhost:5173/setup` automatically because no users or company exist. (Severity: Baja - UX)
- "Margen de Ganancia" and "IVA" fields were **missing** from the initial `/setup` form. I had to navigate to `/settings` post-setup to configure them. (Severity: Media - Lógico/UX)
- Redirection from `/setup` (Lock) goes to `/sales` instead of `/dashboard`. (Severity: Baja - UX)
- Registration and Business Setup are combined in one form during first-run. (Severity: Baja - UX)
- Successful redirection to `/dashboard` (landed on `/sales`) after setup completion.
