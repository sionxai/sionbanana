// Firebase Storage 의존이 제거되었지만 호출처가 점진적으로 정리되는 동안 stub만 유지.

export function userImagePath(userId: string, imageId: string): string {
  return `users/${userId}/images/${imageId}.png`;
}

export async function uploadUserImage(
  userId: string,
  imageId: string,
  _data: Blob | Buffer | ArrayBuffer
): Promise<{ url: string; storagePath: string }> {
  return { url: "", storagePath: userImagePath(userId, imageId) };
}

export async function deleteUserImage(_userId: string, _imageId: string): Promise<void> {
  // noop
}
