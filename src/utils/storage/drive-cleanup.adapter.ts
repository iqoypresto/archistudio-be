import { ResponseError } from "../errors/response-error.util.js";
import { cancelDriveUploadSession, getDriveUploadOffset } from "./drive-upload.adapter.js";
import { deleteDriveFile } from "./drive-file.adapter.js";

export async function cancelAndDeleteDriveUpload(input: {
  sessionUri: string | null;
  driveFileId: string | null;
  sizeBytes: number;
}): Promise<void> {
  let driveFileId = input.driveFileId;
  if (input.sessionUri) {
    let uploadComplete = false;
    try {
      const result = await getDriveUploadOffset(input.sessionUri, input.sizeBytes);
      if (result.complete) {
        driveFileId = result.file.id ?? driveFileId;
        uploadComplete = true;
      }
    } catch (error) {
      if (!(error instanceof ResponseError && error.code === "UPLOAD_SESSION_EXPIRED")) throw error;
    }
    if (!uploadComplete) {
      await cancelDriveUploadSession(input.sessionUri);
      try {
        const result = await getDriveUploadOffset(input.sessionUri, input.sizeBytes);
        if (result.complete) driveFileId = result.file.id ?? driveFileId;
        else throw new ResponseError("STORAGE_UNAVAILABLE", "Sesi Drive masih menerima unggahan.");
      } catch (error) {
        if (!(error instanceof ResponseError && error.code === "UPLOAD_SESSION_EXPIRED")) throw error;
      }
    }
  }
  if (driveFileId) await deleteDriveFile(driveFileId);
}
