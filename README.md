# Smart Healthcare Cloud Platform

An AI-enabled cloud platform concept for connecting patients, clinicians, hospitals, and health-monitoring devices through secure health records, appointments, remote monitoring, and explainable decision support.

## Project Structure

```text
smart-healthcare-cloud-platform/
├── client/                         # React + TypeScript + Vite application
│   └── src/
│       ├── app/                    # Auth, theme, and toast providers
│       ├── components/             # Site shell and protected route guard
│       ├── pages/                  # Public pages, auth forms, role dashboards
│       ├── services/               # Typed REST client and token refresh
│       ├── main.tsx
│       └── styles.css              # Responsive design system and dark mode
│   ├── Dockerfile                  # Nginx static client imagene
│   ├── nginx.conf                  # SPA routing and API reverse proxy
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── config/                 # Environment configuration
│   │   ├── controllers/            # HTTP handlers
│   │   ├── middleware/             # Auth, validation, errors
│   │   ├── models/                 # Mongoose schemas
│   │   ├── routes/                 # REST API routes
│   │   ├── services/               # Risk, audit, email, SMS stub
│   │   ├── utils/                  # Tokens, encryption, errors
│   │   ├── app.ts
│   │   └── server.ts
│   ├── scripts/                    # Seed and IoT simulator
│   ├── tests/                      # Focused unit tests
│   └── package.json
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## Application

React 19, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Lucide, React Hook Form, and Zod. Public routes include Home, Services, About, Architecture, Contact, Privacy, and Terms. Login, registration, forgot/reset password, and role-gated patient, clinician, and admin dashboards share a typed REST client with refresh-token retry. Patient workflows cover profile/consent, records and prescriptions, appointments, vitals and risk explanations; clinician workflows cover schedule, patient history/vitals and prescriptions; admin workflows cover approvals, audit events and export.

The workspace uses a responsive medical design system with keyboard focus states, reduced-motion support, dark mode, skeletons, toasts, empty states, and mobile navigation. Remote vitals refresh by polling. Risk outputs are labeled “Decision support, not a diagnosis.”

## Backend

Node.js, Express, TypeScript, and MongoDB/Mongoose. API base path: `/api/v1`; health check: `/api/health`. The API uses access/refresh JWTs, bcrypt password hashes, role middleware, Zod request validation, AES-256-GCM encryption for clinical notes, audit events, rate limits, Helmet, and configurable CORS. Remote monitoring uses polling-friendly REST endpoints; the simulator posts demo readings. Risk results are explainable decision support, not a diagnosis.

### Requirements

- Node.js 20 or later and npm
- MongoDB 7 or later (local or hosted)

### Run on Windows PowerShell

1. Install Node.js and MongoDB, then open PowerShell in the project directory.
2. Copy `.env.example` to `.env` and set unique JWT secrets, `MONGODB_URI`, and a 32-character encryption key. Keep the demo password for local demos only.
3. Start MongoDB, then install dependencies from the repository root with `npm install`.
4. Seed the demo accounts using `npm run seed`.
5. Start the API and client together using `npm run dev`. The API is at `http://localhost:5000`; the website is at `http://localhost:5173`.
6. In another terminal, run `npm run device:simulate` to post simulated vitals. Stop the simulator with Ctrl+C.

The seeded accounts are `patient@demo.com`, `doctor@demo.com`, and `admin@demo.com`; each uses the development-only `DEMO_PASSWORD` from `.env` (example: `DemoPass123!`). Change this value outside local demos.

### API Summary

All successful responses use `{ "success": true, "message": "...", "data": ... }`; errors use the same shape with `success: false`. Auth routes are under `/api/v1/auth`; authenticated role-aware resources include `/users`, `/patients`, `/doctors`, `/appointments`, `/records`, `/prescriptions`, `/vitals`, `/alerts`, `/notifications`, `/analytics`, and admin-only `/audit-logs` and `/admin/export`. Reports accept PDF/JPEG/PNG uploads up to 10 MB and are downloaded through a patient-access-checked endpoint. List endpoints accept `page` and `limit` pagination parameters.

### Containers and Cloud Deployment

Run `docker compose up --build` for the client, API, and MongoDB at `http://localhost:8080`. Report bytes are stored privately in `UPLOAD_DIR`; use managed encrypted object storage for multi-instance production deployments. For AWS, Azure, or Render, deploy the containers with a managed MongoDB service, configure secrets through the platform secret store, terminate TLS at the platform ingress, and restrict CORS to the deployed client origin. Schedule automated encrypted database and report-object backups, define retention and restore drills, and avoid putting real patient information into demo environments.

### CI and Production Deployment

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs the backend test suite and both production builds on every push and pull request to `main`. Use the same checks before deploying to staging or production. For a hosted deployment, copy `.env.production.example` to `.env.production`, set real secrets and origins, then run `docker compose -f docker-compose.prod.yml up --build -d` to start the API, web frontend, and MongoDB together. This arrangement is designed for a platform-managed TLS endpoint in front of the web container while keeping the application and database behind a private internal network configuration.

### Demo Flow

1. Sign in as a patient and show the consolidated record and upcoming appointment view.
2. Start the device simulator and show new vitals, an explainable risk flag, and an in-app alert.
3. Sign in as a doctor to review the authorized patient data and appointment schedule.
4. Sign in as an administrator to inspect platform users and access audit events.

### Future Scope

Real wearable integrations; ABHA, FHIR, and HL7 interoperability; telemedicine video; multilingual support; durable notification delivery; managed object storage for reports; and production-grade key management.