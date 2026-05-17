# Cleanup Center

`data/images` 정리는 삭제가 아니라 검토 가능한 단계 흐름으로만 진행합니다. 기본값은 conservative 모드입니다. agent run manifest 또는 사용자가 제공한 export JSON에서 보호 참조가 확인된 이미지만 `protected`로 분류하고, 그 외 디스크 이미지는 `unknown`으로 둡니다.

## 0. 보호 정책

반드시 보호해야 하는 참조 집합:

- `yesgem-local-records` history의 `imageUrl`, `thumbnailUrl`, `originalImageUrl`, `diff`, `metadata`
- `/api/images/<id>` 형태의 reference gallery slot
- `sionbanana-characters-v1`의 `primaryImageUrl`, `thumbnailUrl`, `sheetUrl`, `shots[].url`
- `sionbanana-story-references-v1`의 character/location `imageUrl`
- `data/agent-runs/**/manifest.json`의 `images[].id`, `storagePath`, `sourcePath`, `response.storagePath`

현실적 제약:

- 서버 스크립트는 브라우저 `localStorage`를 직접 읽을 수 없습니다.
- 기본 scan은 `data/agent-runs/**/manifest.json`과 디스크 파일만 정확히 압니다.
- history, characters, story refs, reference gallery는 사용자가 export JSON으로 제공할 때만 scan에 반영됩니다.
- 의심되면 삭제하지 않습니다. 기본 모드에서 manifest/export에 없는 이미지는 `orphan`이 아니라 `unknown`입니다.

## 1. Scan Only

모든 `data/images/**/*.png`를 스캔하고 보호 참조를 수집합니다. 파일 이동이나 삭제는 없습니다.

```bash
node scripts/cleanup-scan.mjs --out data/cleanup-scan.json
```

localStorage export JSON이 있으면 보호 참조로 추가합니다.

```bash
node scripts/cleanup-scan.mjs \
  --protect-json data/cleanup-localstorage-export.json \
  --out data/cleanup-scan.json
```

기본 출력 분류:

- `protected`: agent-runs manifest 또는 export JSON에서 참조가 확인된 이미지
- `unknown`: 보호 여부를 서버에서 확정할 수 없는 이미지
- `orphan`: 기본 conservative 모드에서는 생성하지 않음

명시적으로 export를 충분히 제공했고 미참조 파일을 orphan으로 보고 싶을 때만 아래 옵션을 사용합니다.

```bash
node scripts/cleanup-scan.mjs \
  --protect-json data/cleanup-localstorage-export.json \
  --classify-unreferenced orphan \
  --out data/cleanup-scan.json
```

## 2. Dry-run Report

scan JSON 자체가 dry-run 결과입니다. 요약만 빠르게 확인하려면:

```bash
node -e 'const s=require("./data/cleanup-scan.json"); console.log(s.counts)'
```

`unknown`은 삭제 대상이 아니라 검토 대상입니다.

## 3. HTML Report

검토용 정적 HTML을 만듭니다. 이 단계도 파일 이동이나 삭제가 없습니다.

```bash
node scripts/cleanup-report.mjs \
  --scan data/cleanup-scan.json \
  --out data/cleanup-report.html
```

생성된 `data/cleanup-report.html`에서 protected/orphan/unknown 개수, 용량, 썸네일, 참조 사유를 확인합니다.

## 4. Quarantine

quarantine은 `data/.quarantine/<batch>/images/...` 아래로 `rename`만 합니다. 즉시 삭제하지 않습니다. 기본 실행은 dry-run입니다.

```bash
node scripts/cleanup-quarantine.mjs --scan data/cleanup-scan.json
```

검토 후 실제 이동:

```bash
node scripts/cleanup-quarantine.mjs --scan data/cleanup-scan.json --apply
```

기본 category는 `orphan,unknown`입니다. protected는 이 스크립트로 이동할 수 없습니다.

이동 기록:

- 배치 manifest: `data/.quarantine/<batch>/manifest.json`
- 전체 index: `data/.quarantine/quarantine-manifest.json`

quarantine 후 문제가 발견되면 batch manifest의 `sourceRelativePath`와 `destinationAbsolutePath`를 보고 원래 `data/images/...` 위치로 되돌립니다.

## 5. Confirm Delete

영구 삭제는 별도 confirm이 있어야만 실행됩니다. confirm 없이 실행하면 dry-run입니다.

```bash
node scripts/cleanup-delete.mjs --older-than-days 14
```

명시 confirm:

```bash
node scripts/cleanup-delete.mjs --older-than-days 14 --confirm
```

규칙:

- `data/.quarantine/**/manifest.json`에 기록된 moved 파일만 후보입니다.
- `--older-than-days`보다 오래된 파일만 삭제합니다.
- `--confirm`이 없으면 `fs.unlink`를 호출하지 않습니다.
- manifest 파일은 감사 기록으로 남깁니다.

## localStorage Export 예시

브라우저 DevTools Console에서 아래 스니펫으로 cleanup 보호용 JSON을 만들 수 있습니다.

```js
(() => {
  const keys = [
    "yesgem-local-records",
    "sionbanana-characters-v1",
    "sionbanana-story-references-v1",
    "yesgem-reference-slots",
    "yesgem-reference-record"
  ];
  const payload = Object.fromEntries(
    keys.map(key => {
      const raw = window.localStorage.getItem(key);
      try {
        return [key, raw ? JSON.parse(raw) : null];
      } catch {
        return [key, raw];
      }
    })
  );
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cleanup-localstorage-export.json";
  a.click();
  URL.revokeObjectURL(url);
})();
```

다운로드한 JSON을 repo의 `data/cleanup-localstorage-export.json` 같은 경로에 둔 뒤 `--protect-json`으로 전달합니다. 민감한 프롬프트나 metadata가 포함될 수 있으므로 Git에 커밋하지 않습니다.
