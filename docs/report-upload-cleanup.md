# Pembersihan sesi foto laporan

## Runtime

- Supervisor membuat `ReportUploadSession` saat menekan **Kirim Laporan**. Sesi aktif selama 24 jam dan kedaluwarsa diperpanjang saat signed upload URL baru diminta.
- Setiap storage key tercatat sebelum signed URL dikembalikan. Key memiliki prefix `project/area/tanggal/supervisor/session`.
- Foto lama yang sudah terpasang ke draf transisi dicatat sebagai `ATTACHED`; foto baru sebagai `PENDING`.
- Submit menandai sesi `FINALIZING`, memeriksa objek di storage, lalu satu transaksi membuat/menyelesaikan laporan, memasang relasi foto, dan mengubah sesi menjadi `COMMITTED`.
- Cleaner mengklaim sesi `UPLOADING`/`FINALIZING` yang kedaluwarsa menjadi `CLEANUP_PENDING`, menghapus foto pending secara idempoten, dan menandai foto `DELETED`. Foto `ATTACHED` tidak pernah dihapus. Foto pending dari sesi committed dibersihkan setelah masa retry habis.
- Sesi `CLEANED`/`COMMITTED` yang telah berumur 30 hari dihapus dari database; record foto laporan dan objek foto tidak ikut terhapus.

## Scheduler hosting

Set secret `UPLOAD_CLEANUP_TOKEN` (minimal 32 karakter) pada environment backend dan scheduler. Panggil endpoint berikut minimal sekali per jam dengan metode POST dan header `x-upload-cleanup-token`. Endpoint memproses paling banyak 25 sesi per panggilan; panggil berulang bila antrean perlu dikuras.

`POST /api/v1/reports/upload-sessions/cleanup`

Jangan memasukkan token ke query string atau log. Endpoint menolak request bila secret belum dikonfigurasi. Scheduler tidak dijalankan di dalam proses Express agar kompatibel dengan serverless.

## Migrasi

Schema dan SQL migrasi menambah tabel `report_upload_sessions`, `report_upload_session_photos`, serta enum status. Jalankan migrasi melalui prosedur deployment database sebelum merilis versi backend/frontend yang mengirim `sessionId`. Migrasi tidak menghapus data existing.
