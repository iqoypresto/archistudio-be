# Pembersihan Sesi Foto Laporan

## Tujuan

`ReportUploadSession` mengelola file yang diunggah langsung sebelum laporan dikirim. Session tidak membuat laporan `DRAFT`; hanya laporan SUBMITTED yang dibuat ketika endpoint submit berhasil. Pengguna mengonfirmasi tidak ada catatan draft lama di database.

## Siklus session

- FE membuat session saat Supervisor memasuki langkah Foto atau sebelum upload pertama, bukan ketika menekan Kirim.
- Session dibatasi untuk satu Supervisor, area, dan tanggal laporan. Masa aktif awal 24 jam; masa berlaku diperpanjang saat signed upload URL baru diminta.
- Setiap storage key dicatat sebelum signed URL dikembalikan. Key memiliki prefix project/area/tanggal/supervisor/session.
- Foto upload baru bermula sebagai `PENDING`. Setelah server memvalidasi submit, satu transaksi membuat laporan SUBMITTED, mengaitkan metadata foto ke laporan, menandai foto session sebagai `ATTACHED`, dan session sebagai `COMMITTED`.
- Cleaner mengklaim session `UPLOADING`/`FINALIZING` yang kedaluwarsa menjadi `CLEANUP_PENDING`, menghapus foto pending secara idempoten, dan menandai foto sebagai `DELETED`. Foto `ATTACHED` tidak pernah dihapus.
- Foto pending dari session committed dibersihkan setelah masa retry habis. Session `CLEANED`/`COMMITTED` berumur 30 hari dihapus dari database; record foto laporan dan objek foto yang sudah terkait tidak ikut terhapus.

## Scheduler hosting

Set secret `UPLOAD_CLEANUP_TOKEN` (minimal 32 karakter) pada environment backend dan scheduler. Panggil endpoint berikut minimal sekali per jam dengan metode POST dan header `x-upload-cleanup-token`. Endpoint memproses paling banyak 25 session per panggilan; panggil berulang bila antrean perlu dikuras.

`POST /api/v1/reports/upload-sessions/cleanup`

Jangan masukkan token ke query string atau log. Endpoint menolak request bila secret belum dikonfigurasi. Scheduler tidak dijalankan di dalam proses Express agar kompatibel dengan serverless.

## Migrasi schema

- Pertahankan tabel upload session dan enum status karena upload foto pada langkah Foto memerlukannya.
- Ubah siklus laporan agar schema/API tidak menyimpan draft: `ReportStatus` hanya bernilai `SUBMITTED`, status default menjadi `SUBMITTED`, dan timestamp/paraf submit wajib.
- Pengguna memastikan tidak ada catatan draft lama. Migrasi tidak memindahkan atau menghapus row draft; penyesuaian enum dapat dilakukan tanpa konversi data draft. Jalankan melalui Human Gate migrasi database proyek.
- Pastikan versi FE/BE yang dirilis sejalan: FE mengirim `sessionId` ketika minta signed URL dan pada `POST /reports/submit`; BE menolak upload session yang tidak dimiliki, kedaluwarsa, atau tidak cocok area/tanggal.
