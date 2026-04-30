// 로컬 단일 사용자 도구로 전환되면서 Firebase Admin SDK 의존을 제거.
// 호출처가 점진적으로 정리되는 동안 컴파일을 깨뜨리지 않기 위해 stub만 유지.
// 호출 시 즉시 throw하므로, 잘못된 경로에서 사용하면 명확한 에러로 노출된다.

class MissingServiceAccountKeyError extends Error {
  constructor() {
    super("Firebase Admin SDK는 더 이상 사용되지 않습니다. 호출을 제거하세요.");
    this.name = "MissingServiceAccountKeyError";
  }
}

function fail(): never {
  throw new MissingServiceAccountKeyError();
}

export function getAdminAuth(): never {
  return fail();
}

export function getAdminDb(): never {
  return fail();
}

export function getAdminStorage(): never {
  return fail();
}

export function getAdminRealtimeDb(): never {
  return fail();
}

export { MissingServiceAccountKeyError };
