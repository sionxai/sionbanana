import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

export function userImagePath(userId: string, imageId: string) {
  return `users/${userId}/images/${imageId}.png`;
}

export async function uploadUserImage(
  userId: string,
  imageId: string,
  file: Blob | ArrayBuffer
) {
  const storageRef = ref(storage(), userImagePath(userId, imageId));
  const data = file instanceof Blob ? file : new Blob([file]);
  const result = await uploadBytes(storageRef, data, {
    contentType: "image/png",
    cacheControl: "public,max-age=31536000"
  });

  const url = await getDownloadURL(result.ref);
  return { url, metadata: result.metadata };
}

export async function deleteUserImage(userId: string, imageId: string) {
  const storageRef = ref(storage(), userImagePath(userId, imageId));
  try {
    await deleteObject(storageRef);
  } catch (error) {
    console.warn("Failed to delete user image", error);
  }
}
