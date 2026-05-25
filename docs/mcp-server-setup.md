# Sion Banana MCP Beta Server

이 MCP 서버는 실험용 beta wrapper입니다. Sion Banana 앱을 MCP로 풀 전환하지 않고, repo-local stdio 서버가 기존 `scripts/agent-generate.mjs` helper와 `data/agent-runs/` 산출물을 감싸는 PoC입니다.

## Claude Desktop 설정

Claude Desktop 설정 파일의 `mcpServers`에 아래 항목을 추가합니다.

```json
{
  "mcpServers": {
    "sionbanana": {
      "command": "node",
      "args": ["/Users/nohshinhee/Documents/2. coding/sionbanana/scripts/mcp-server.mjs"]
    }
  }
}
```

설정 후 Claude Desktop을 재시작하면 `sionbanana` MCP 서버의 도구가 노출됩니다.

## 전제 조건

- 의존성 설치: `npm install`
- `health_check`, `generate`, `upscale_from`은 로컬 Sion Banana 앱의 `/api/health`와 `/api/generate`가 필요합니다.
- 기본 health 포트는 `3002`입니다. 앱이 다른 포트에서 실행 중이면 `health_check` 입력의 `port` 또는 `baseUrl`을 사용합니다.
- 생성 계열 도구는 기존 `scripts/agent-generate.mjs`를 실행하며, 결과는 기존 방식대로 `data/agent-runs/`에 저장됩니다.

## 도구 목록과 호출 예시

### `health_check`

로컬 앱의 `/api/health`를 확인합니다.

자연어 예시:

- "Sion Banana health_check로 로컬 앱 상태 확인해줘."
- "sionbanana health_check를 port 3000으로 호출해줘."
- "baseUrl http://localhost:3002 로 health_check 실행해줘."

### `generate`

`scripts/agent-generate.mjs`를 `--prompt`, `--reference`, `--category`, `--slug`, `--count`, `--quality`, `--size`, `--batch`, `--concurrency` 인자로 감싸 실행합니다.

`batch`는 같은 prompt로 만들 독립 run 수이며 기본값은 `1`입니다. `concurrency`는 batch 실행 시 동시에 처리할 run 수이며 기본값은 `4`입니다. `batch`가 `1`이거나 미지정이면 기존 단건 helper 출력 형식을 유지하고, `batch`가 `2` 이상이면 `{ ok, total, succeeded, failed, runs, indexPath? }` 형식의 통합 결과를 반환합니다.

자연어 예시:

- "sionbanana generate로 prompt 'banana milk package hero shot' 생성해줘. category는 packaging, slug는 banana-milk-hero."
- "reference 이미지를 넣어서 generate 실행해줘. count 2, quality high, size 1024x1024."
- "category character로 prompt를 생성하고 결과 manifest 경로를 알려줘."
- "sionbanana generate로 같은 prompt를 batch 10, concurrency 4로 병렬 생성해줘. category는 character-locations, slug는 cafe-arrival."

### `upscale_from`

기존 run 디렉터리를 `--upscale-from`으로 넘겨 upscale 생성을 실행합니다.

자연어 예시:

- "sionbanana upscale_from으로 data/agent-runs/2026...-sample-run을 업스케일해줘."
- "upscale_from에 기존 run을 넣고 size 2048x2048로 실행해줘."
- "이 run을 quality high로 다시 upscale해줘."

### `build_index`

`scripts/agent-generate.mjs --build-index <category>`를 실행해 카테고리 index HTML을 만듭니다.

자연어 예시:

- "sionbanana build_index로 packaging 카테고리 인덱스를 만들어줘."
- "category character의 agent run index를 갱신해줘."

### `list_runs`

`data/agent-runs/`를 스캔하고 manifest 기준으로 카테고리별 run 목록을 반환합니다.

자연어 예시:

- "sionbanana list_runs로 전체 run을 카테고리별로 보여줘."
- "packaging 카테고리 run만 list_runs로 찾아줘."

### `read_manifest`

특정 run의 `manifest.json`을 반환합니다.

자연어 예시:

- "sionbanana read_manifest로 2026...-banana-milk-hero manifest를 읽어줘."
- "이 run의 prompt와 생성 이미지 경로를 manifest에서 확인해줘."

### `list_images`

특정 run의 `images/` 폴더 파일 목록을 반환합니다.

자연어 예시:

- "sionbanana list_images로 2026...-banana-milk-hero의 이미지 파일을 보여줘."
- "이 run에서 생성된 이미지 파일명과 크기를 확인해줘."

## 주의

- 이 서버는 beta/experimental입니다. 안정 API로 간주하지 않습니다.
- 앱 코드와 생성 로직은 변경하지 않고 기존 helper를 감싸는 용도입니다.
- stdio MCP 서버이므로 stdout은 MCP 메시지 전용입니다. 디버깅 출력은 stderr를 사용해야 합니다.
