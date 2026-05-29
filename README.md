# FerroBot 🤖🇵🇪

FerroBot is a modern, multi-tenant SaaS platform built for Peruvian hardware stores (*ferreterías*). It automates customer support, product quotes, order processing, and delivery notifications using AI-driven WhatsApp integration, while providing a web dashboard for business owners and team members.

---

## 🌟 Key Features

* **AI WhatsApp Conversational Bot**:
  * Automatically handles quotes (`cotizaciones`), orders (`pedidos`), and delivery status.
  * Pauses automatically (`bot_pausado = true`) when a staff member intervenes.
  * Handles audio messages (transcribed with OpenAI Whisper) and image messages (analyzed with GPT-4o Vision).
* **Multi-tenant SaaS Dashboard**:
  * Secure role-based dashboard (`dueno` and `vendedor` permissions) mapped via `miembros_ferreteria`.
  * Visual metrics/KPIs for business owners.
  * Real-time WhatsApp conversation viewer with manual reply interface.
  * Catalog management (with spreadsheet/image import assistance).
* **Delivery & Repartidor Portal**:
  * Unauthenticated URL-token authentication for delivery agents.
  * Delivery dispatching, route updates, and incidence reports from a mobile-friendly view.
* **SUNAT-compliant Billing Foundations**:
  * Generates PDF invoices and boletas using `@react-pdf/renderer` stored in Supabase storage.
  * Integration helpers for Peruvian e-invoicing.

---

## 💻 Tech Stack

* **Frontend Framework**: Next.js 16 (App Router, Turbopack)
* **UI & Rendering**: React 19, Tailwind CSS v4, Lucide React icons, Recharts
* **Database & Auth**: Supabase (PostgreSQL, Row Level Security, SSR cookies session auth)
* **WhatsApp Provider**: YCloud WhatsApp Cloud API integration
* **AI Processing**: DeepSeek API (for intent recognition) and OpenAI API (Whisper & Vision)
* **Libraries**: `@react-pdf/renderer` (PDF compilation), `exceljs` & `papaparse` (catalog processing), `leaflet` (GPS tracking/maps)

---

## 🚀 Getting Started

### 1. Install Dependencies
Make sure you have Node.js 18+ and npm installed. Run:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
YCLOUD_API_KEY=your-ycloud-api-key
YCLOUD_WEBHOOK_SECRET=your-ycloud-webhook-secret
DEEPSEEK_API_KEY=your-deepseek-api-key
OPENAI_API_KEY=your-openai-api-key # Optional: Whisper + Vision
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-cron-secret
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to view the application dashboard.

---

## 📁 Project Structure

```text
├── .github/              # GitHub Actions
├── public/               # Static assets
├── supabase/             # Supabase settings & local DB migrations
└── src/
    ├── app/              # Next.js 16 App Router (pages & API endpoints)
    │   ├── (dashboard)   # Main Dashboard layouts and routes
    │   ├── api           # API endpoints (YCloud webhooks, delivery APIs, crons)
    │   └── ...           # Public pages (Auth, Tracking, Invite links)
    ├── components/       # Shared UI and feature-specific React components
    ├── lib/              # Core business logic and integrations
    │   ├── ai            # Orchestrator, DeepSeek, and OpenAI wrapper tools
    │   ├── auth          # Roles, permissions, and session helpers
    │   ├── bot           # Message handler and session manager
    │   ├── whatsapp      # YCloud webhook handling and communication API
    │   └── ...           # Billing, delivery, contabilidad, and encryption utils
    ├── types/            # TypeScript type definitions
    └── proxy.ts          # Authentication proxy middleware
```

---

## 🛠️ Code Standards

Please review [CLAUDE.md](file:///C:/Users/LENOVO/.gemini/antigravity/scratch/ferrobot/CLAUDE.md) for detailed guidelines about:
* Next.js 16 Search Params and Suspense requirements.
* Supabase client instantiation guidelines (Client vs. Server vs. Admin client).
* Database Schema structure and RLS conventions.
* Phone number format policies.
