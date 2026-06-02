# Grok 영상 생성 설정

시온바나나는 `progrok`을 레포에 포함하지 않고, 실행 중인 로컬 xAI 프록시만 사용합니다.

## 1. progrok 준비

```bash
npm install -g progrok
progrok login
progrok proxy --host 127.0.0.1 --port 18645
```

기본 프록시 URL은 다음과 같습니다.

```bash
SIONBANANA_GROK_PROXY=http://127.0.0.1:18645/v1
```

Next 서버를 다른 값으로 실행하려면 서버 시작 전에 환경변수를 지정하세요.

```bash
SIONBANANA_GROK_PROXY=http://127.0.0.1:18645/v1 npm run dev
```

## 2. API 사용

영상 소스는 반드시 시온바나나에 저장된 로컬 이미지 ID만 사용할 수 있습니다. 외부 URL이나 data URL은 `/api/video` 입력으로 받지 않습니다.

```bash
curl -X POST http://localhost:3002/api/video \
  -H 'Content-Type: application/json' \
  -d '{
    "sourceImageId": "이미지_ID",
    "prompt": "A gentle camera push-in with subtle wind movement",
    "duration": 5,
    "resolution": "720p",
    "aspectRatio": "16:9"
  }'
```

성공 응답은 `/api/videos/<id>` 형식의 MP4 URL을 반환합니다.

## 3. CLI 사용

```bash
node scripts/agent-video.mjs \
  --source-id 이미지_ID \
  --prompt "A gentle camera push-in with subtle wind movement" \
  --duration 5 \
  --resolution 720p \
  --aspect 16:9 \
  --port 3002
```

`--proxy`는 CLI 프로세스가 아니라 실행 중인 Next 서버의 환경변수에 적용되어야 합니다. 프록시를 바꾸려면 서버를 `SIONBANANA_GROK_PROXY=... npm run dev`로 실행하세요.

## 4. 보안 정책

- `/api/video`는 `sourceImageId`로 읽은 로컬 이미지만 Grok에 전달합니다.
- Grok 결과 MP4 다운로드는 `https` URL만 허용합니다.
- 다운로드 크기 상한은 100MB입니다.
- 저장 전 MP4 `ftyp` 시그니처를 검사합니다.
