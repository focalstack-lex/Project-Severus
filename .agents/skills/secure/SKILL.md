---
name: secure
description: Run full Security-First Deployment Gate check on the active workspace (secrets, npm audit, Auth/AuthZ, CORS, CSP, input validation, DB sanitization, rate limits). Triggers on /secure or when user asks for a security audit.
---

# Secure — Security-First Deployment Gate Audit Skill

When `/secure` is invoked by the user in any chat session, the agent MUST immediately execute a comprehensive, full-spectrum security audit of the current workspace against the **Security-First Deployment Gate**.

## Execution Procedure

Execute all 10 security verification steps sequentially and gather empirical evidence using terminal commands:

### 1. Secrets & Credentials Scan
- Search codebase for hardcoded API keys, JWT secrets, passwords, or private tokens using terminal grep commands.
- Verify `.env` is listed in `.gitignore` and `.env.example` contains sanitized placeholders.

### 2. Dependency Audit
- Run package manager audit command (e.g. `npm audit`, `cargo audit`, or `pip-audit`).
- Classify any critical or high vulnerability findings.

### 3. Server-Side Input Validation
- Inspect API routes, controllers, and backend endpoints for schema validation (e.g., Zod, Yup, Joi, or strict TypeScript types).
- Verify client-side inputs are re-validated server-side before DB writes or command executions.

### 4. Authentication & Authorization Enforcement
- Audit protected API routes and pages for server-side auth middleware or session checks (`getServerSession`, `auth()`, JWT verification).
- Confirm zero privilege escalation paths (e.g., proper role-based access control).

### 5. Transport & Security Headers
- Check for HTTPS enforcement, TLS headers, CSP (Content Security Policy), HSTS, `X-Content-Type-Options`, and `X-Frame-Options`.

### 6. CORS & Origin Isolation
- Inspect CORS configurations to ensure authenticated endpoints do not allow `*` origins.

### 7. Error Handling & Logging
- Scan for swallowed exceptions (`bare except: pass`, empty `.catch(() => {})`, or silenced error logs).
- Confirm internal error tracebacks are logged internally and never leaked to API clients.

### 8. Database Security & Parameterization
- Confirm all DB queries use parameterized statements or ORM abstractions (Prisma, Drizzle, TypeORM, SQLAlchemy) to prevent SQL injection.

### 9. Release Artifact & Debug Sanitization
- Ensure dev tools, mock endpoints, and debug flags are disabled or stripped from production builds.

### 10. Rate Limiting Audit
- Verify rate limits are configured on authentication (`/api/auth/*`), password resets, and high-frequency write endpoints.

---

## Security Audit Report Format

Upon completing the verification steps, output the final report:

# SECURITY GATE AUDIT REPORT

| Check Item | Status | Finding / Evidence |
| :--- | :--- | :--- |
| 1. Secrets Scan | PASS / FAIL | Cite file:line or clean status |
| 2. Dependency Audit | PASS / FAIL | Audit output summary |
| 3. Server Input Validation | PASS / FAIL | Validation evidence |
| 4. Auth & AuthZ | PASS / FAIL | Route protection status |
| 5. Security Headers & TLS | PASS / FAIL | Header configuration |
| 6. CORS Policy | PASS / FAIL | Allowed origins |
| 7. Error Handling | PASS / FAIL | Logging & leak status |
| 8. Parameterized DB Queries | PASS / FAIL | Query sanitization status |
| 9. Release Artifact Cleanliness | PASS / FAIL | Debug flag status |
| 10. Rate Limiting | PASS / FAIL | Rate limit status |

**GATE STATUS: APPROVED FOR DEPLOYMENT / BLOCKED**

---

## Automatic Journal Logging
Automatically log the audit result in the workspace's `JOURNAL.md` (or `journal/YYYY-MM-DD.md`) citing timestamp and gate outcome.
