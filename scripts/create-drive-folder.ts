import { env } from "../src/configs/env.config.js";
import { createDriveApplicationFolder } from "../src/utils/storage/drive-upload.adapter.js";

async function main(): Promise<void> {
  if (env.GOOGLE_DRIVE_FOLDER_ID) {
    console.log(`GOOGLE_DRIVE_FOLDER_ID sudah disetel: ${env.GOOGLE_DRIVE_FOLDER_ID}`);
    return;
  }
  const folderId = await createDriveApplicationFolder();
  console.log(`Tambahkan ke be/.env: GOOGLE_DRIVE_FOLDER_ID=${folderId}`);
}

main().catch((error: unknown) => {
  console.error("Gagal membuat folder privat Google Drive.", error);
  process.exitCode = 1;
});
