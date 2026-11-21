# ArchiStudio Backend API (Express 5 + Prisma + PostgreSQL)

> Layanan RESTful API backend untuk sistem pelaporan proyek konstruksi ArchiStudio Internal Office, dioptimalkan untuk serverless environment (Node.js 20+ / Vercel Serverless / Railway).

---

## 🛠️ Stack Teknologi

- **Runtime**: Node.js 20+ (CommonJS mode)
- **Framework**: Express 5.x
- **Bahasa**: TypeScript 5.x (Strict mode, no `any`, no `@ts-ignore`)
- **Database & ORM**: PostgreSQL via Supabase Pooler + Prisma ORM 6.x
- **Autentikasi**: JWT Access Token (15 menit) + Refresh Token rotasi di database via Header `Authorization: Bearer`
- **Object Storage**: Backblaze B2 S3-Compatible API via AWS SDK v3
- **PDF Generation**: `pdfmake` murni (Template Opsi A Klasik, Kepala Laporan Biru)
- **Validasi & Sanitasi**: Zod schemas
- **Logging**: Winston logger terpusat & Morgan HTTP logger

---

## 🏗️ Arsitektur 4-Layer Backend

Backend menerapkan pemisahan tanggung jawab yang ketat pada setiap modul fitur:

```text
src/
├── features/
│   ├── auth/          # Login, token refresh, logout, get me
│   ├── user/          # Manajemen akun anggota tim, reset kata sandi, soft nonaktif
│   ├── project/       # Master project, zona waktu IANA, hari libur rutin
│   ├── area/          # Master area per project & riwayat penugasan supervisor
│   ├── upload/        # Presigned upload URL object storage & signed view URL
│   ├── report/        # Laporan harian, draf, submit, paraf otomatis, kunci bertahap, revisi Owner, & buka kunci area
│   ├── dashboard/     # Ringkasan KPI proyek, status area per tanggal, & rekap keterlambatan supervisor
│   └── pdf-export/    # Ekspor PDF Laporan Harian A4 Template Opsi A on-demand
├── helpers/           # Helper tanggal zona waktu (date.helper.ts) & response builder (response.helper.ts)
├── middlewares/       # AuthMiddleware (JWT + RBAC) & ErrorHandlerMiddleware
├── utils/             # Adapter penyimpanan S3-compatible (storage.adapter.ts) & katalog AppErrors (errors.ts)
└── routes/            # Penggabungan router terpusat (/api/v1)
```

1. **Route (`*.route.ts`)**: Mendaftarkan endpoint URL dan memasang middleware autentikasi serta guard RBAC (`AuthMiddleware.authorizeRoles`).
2. **Controller (`*.controller.ts`)**: Menerima request HTTP, memvalidasi input via Zod (`validate()`), memanggil Service, dan membungkus hasil dengan `ResponseHelper`.
3. **Service (`*.service.ts`)**: Menjalankan logika bisnis, mengevaluasi Business Rules (`BR-*`), melempar `ResponseError` berbasis katalog `AppErrors`, dan **tidak pernah memanggil `prisma.*` secara langsung**.
4. **Repository (`*.repository.ts`)**: Menangani interaksi langsung dengan database PostgreSQL menggunakan `prisma` client, membungkus mutasi multi-tabel dalam `prisma.$transaction`.

---

## ⚙️ Variabel Lingkungan (`.env`)

Salin file `.env.example` ke `.env` dan lengkapi variabel berikut:

```env
NODE_ENV="development"
PORT=4000
CORS_ORIGIN="http://localhost:3000"

# Supabase PostgreSQL (Transaction Pooler + Direct connection)
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"

# Autentikasi JWT (Header Bearer)
JWT_ACCESS_SECRET="ganti-dengan-secret-acak-minimal-32-karakter-access"
JWT_REFRESH_SECRET="ganti-dengan-secret-acak-minimal-32-karakter-refresh"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_DAYS=30

# Backblaze B2 (S3-Compatible Storage)
STORAGE_PROVIDER="b2"
STORAGE_ENDPOINT="<endpoint-url-dari-detail-bucket>"
STORAGE_BUCKET="<bucket-name>"
STORAGE_ACCESS_KEY_ID="isi-keyId"
STORAGE_SECRET_ACCESS_KEY="isi-application-key"
STORAGE_UPLOAD_EXPIRES_SECONDS=300
STORAGE_VIEW_EXPIRES_SECONDS=900
```

Masukkan `keyId` ke `STORAGE_ACCESS_KEY_ID`, `applicationKey` ke `STORAGE_SECRET_ACCESS_KEY`, `bucket name` ke `STORAGE_BUCKET`, dan `endpoint URL` ke `STORAGE_ENDPOINT`. Region signing dibaca otomatis dari endpoint B2, jadi `STORAGE_REGION` tidak perlu diisi. `keyName` dan `bucket id` tidak dipakai oleh aplikasi. Gunakan bucket private serta application key yang dibatasi ke bucket ini dengan izin baca, tulis, dan hapus. Untuk upload langsung dari browser, tambahkan origin frontend pada CORS bucket dan izinkan metode `PUT` serta header `Content-Type`.

---

## 📜 Skrip Perintah (Scripts)

| Perintah | Deskripsi |
| :--- | :--- |
| `npm run dev` | Menjalankan server development dengan hot reload (`tsx watch src/server.ts`). |
| `npm run build` | Melakukan kompilasi TypeScript ke folder `dist/`. |
| `npm run start` | Menjalankan build produksi dari `dist/src/server.js`. |
| `npm run typecheck` | Menjalankan pemeriksaan tipe TypeScript murni (`tsc --noEmit`). |
| `npm run test` | Menjalankan seluruh test suite unit & integrasi menggunakan Vitest. |
| `npm run prisma:generate` | Menghasilkan TypeScript Prisma Client berdasarkan `prisma/schema.prisma`. |
| `npm run prisma:migrate` | Menerapkan migrasi database PostgreSQL. |
| `npm run prisma:seed` | Menjalankan seeding akun pengguna (`owner`, `admin`, `supervisor1`, `supervisor2`) dan sample data. |

---

## 🧪 Pengujian Otomatis

Seluruh modul telah dilindungi oleh **11 test suites (49 test cases)**:
- `auth-service.test.ts`: Autentikasi, login kredensial, token rotasi, dan pembatalan sesi.
- `user-service.test.ts`: Proteksi RBAC akun, reset kata sandi, dan status nonaktif.
- `project-service.test.ts`: Pembuatan proyek, zona waktu IANA, dan hari libur rutin.
- `area-service.test.ts`: Pergantian supervisor ber-tanggal dan validasi 1 supervisor aktif.
- `upload-and-lock.test.ts`: Presigned URL storage dan kalkulasi kunci bertahap.
- `daily-report-submission.test.ts`: Form laporan harian, cutoff 17:00, dan paraf otomatis.
- `report-revision.test.ts`: Revisi Owner dengan audit snapshot JSON.
- `dashboard-service.test.ts`: Kalkulasi ringkasan KPI dan rekap keterlambatan supervisor.
- `report-unlock.test.ts`: Pembukaan kunci manual area tertunggak > 3 hari.
- `pdf-export.test.ts`: Pembangunan layout Template Opsi A dan pembuatan file PDF.
- `date-helper.test.ts`: Helper perhitungan cutoff zona waktu dan hari kerja wajib lapor.
