#!/bin/bash

# Firebase 관리자 토큰이 필요합니다.
# 브라우저 개발자 도구 > Application > Local Storage에서 firebase auth token을 복사하세요.

echo "브라우저에서 Firebase 인증 토큰을 가져오는 방법:"
echo "1. http://localhost:3000/admin 에서 로그인"
echo "2. 개발자 도구 열기 (F12)"
echo "3. Console 탭에서 다음 실행:"
echo "   firebase.auth().currentUser.getIdToken().then(token => console.log(token))"
echo ""
echo "토큰을 복사한 후, 다음 명령어 실행:"
echo ""
echo "curl -X POST http://localhost:3000/api/admin/presets/import \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \\"
echo "  -d @presets-migration-data.json"
