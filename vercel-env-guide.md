# Vercel 환경변수 설정 가이드

Vercel 대시보드에서 다음 환경변수들을 설정해야 합니다:

## Firebase 클라이언트 설정
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCO8jsRaN0KAk4hZ1qVO4YLzChtf3A4zek
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sionbanana.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sionbanana
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://sionbanana-default-rtdb.firebaseio.com/
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sionbanana.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=309643440962
NEXT_PUBLIC_FIREBASE_APP_ID=1:309643440962:web:285958c6382c94761a0edb
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-7PJLWZR0EH
NEXT_PUBLIC_FIREBASE_USE_FIRESTORE=true
NEXT_PUBLIC_FIREBASE_DATABASE_ID=(default)
```

## 서버 측 환경변수
```
FIRESTORE_DATABASE_ID=(default)
GEMINI_API_KEY=AIzaSyBehU6k3-mudHkJV1xQiSgMVUgZ-tBKHw4
FIREBASE_SERVICE_ACCOUNT_KEY=[JSON 문자열]
```

## Vercel 설정 방법
1. Vercel 대시보드 → 프로젝트 선택
2. Settings → Environment Variables
3. 위의 환경변수들을 하나씩 추가
4. Production, Preview, Development 모두 체크
5. Save 후 재배포

## 재배포 명령
```bash
vercel --prod
```