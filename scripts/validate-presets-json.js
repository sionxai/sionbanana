const fs = require('fs');

const data = JSON.parse(fs.readFileSync('presets-migration-data.json', 'utf8'));

// Simulate server-side validation (from app/api/admin/presets/import/route.ts)
const presets = data.presets;
const errors = [];

presets.forEach((row, index) => {
  // Check required fields (line 60)
  if (!row.id || !row.category || !row.groupId || !row.label || !row.prompt) {
    errors.push({
      row: index + 1,
      error: '필수 필드 누락 (id, category, groupId, label, prompt)',
      preset: row
    });
    return;
  }

  // Check category (line 69)
  if (!['camera', 'lighting', 'pose', 'external'].includes(row.category)) {
    errors.push({
      row: index + 1,
      error: `잘못된 카테고리: ${row.category}`,
      preset: row
    });
    return;
  }

  // Check for labelKo (line 83 - uses fallback but let's warn)
  if (!row.labelKo) {
    console.warn(`Warning: Row ${index + 1} (${row.id}) missing labelKo, will use label as fallback`);
  }
});

if (errors.length > 0) {
  console.log('❌ 검증 실패:', errors.length, '개');
  console.log(JSON.stringify(errors.slice(0, 5), null, 2));
  process.exit(1);
} else {
  console.log('✅ 모든 프리셋이 유효합니다!');
  console.log('총', presets.length, '개의 프리셋이 import 준비되었습니다.');
  console.log('\n카테고리별:');
  const byCategory = {};
  presets.forEach(p => {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  });
  Object.entries(byCategory).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count}개`);
  });
}