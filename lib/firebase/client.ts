// Firebase 의존이 제거되었지만 일부 호출처가 점진적으로 정리되는 동안 stub만 유지.
// shouldUseFirestore=false 분기와 함께 사용되므로 실제로 호출되지 않는 게 정상.

export const clientEnv = {} as Record<string, string | undefined>;

export function getFirebaseApp(): null {
  return null;
}

export const firebaseAuth = () => null;
export const firestore = () => null;
export const db = firestore;
export const storage = () => null;
export const realtimeDatabase = () => null;

export function enableFirebaseEmulators(): void {
  // noop
}

export async function ensureFirebaseConnection(): Promise<boolean> {
  return false;
}

export async function retryFirebaseOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  return operation();
}
