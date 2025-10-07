import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FALLBACK_STORYBOARD_STYLES, DEFAULT_STORYBOARD_STYLE_ID } from "@/data/storyboard-styles";
import { serverEnv } from "@/lib/env";
import {
  getStoryboardStyleByIdAdmin
} from "@/lib/storyboard/firestore-admin";
import type { StoryboardStyle } from "@/lib/storyboard/types";

const generationModeSchema = z.enum(["auto", "none"]);
const outputModeSchema = z.enum(["json", "natural"]);
const languageSchema = z.enum(["ko", "en"]);
const soraTemplateModeSchema = z.enum(["concise", "detailed"]);

const soraOptionsSchema = z
  .object({
    formatLook: z.string().optional(),
    lensesFiltration: z.string().optional(),
    gradePalette: z.string().optional(),
    lightingAtmosphere: z.string().optional(),
    locationFraming: z.string().optional(),
    wardrobePropsExtras: z.string().optional(),
    sound: z.string().optional()
  })
  .optional();

const requestSchema = z.object({
  durationSec: z.number().int().min(5).max(120),
  sceneCount: z.number().int().min(1).max(12),
  style: z.string().optional(),
  idea: z.string().min(5).max(500),
  dialogueMode: generationModeSchema.optional(),
  audioPreferences: z
    .object({
      bgm: generationModeSchema.optional(),
      sfx: generationModeSchema.optional(),
      voice: generationModeSchema.optional()
    })
    .optional(),
  outputMode: outputModeSchema.optional(),
  language: languageSchema.optional(),
  maxCharacters: z.number().int().min(100).max(1500).optional(),
  soraMode: z.boolean().optional(),
  soraTemplateMode: soraTemplateModeSchema.optional(),
  soraOptions: soraOptionsSchema,
  animeHeader: z.boolean().optional()
});

type ScenePayload = {
  visual: string;
  dialogue: string;
  sfx: string[];
  transition: string;
};

type AudioPreferenceSelection = {
  bgm: "auto" | "none";
  sfx: "auto" | "none";
  voice: "auto" | "none";
};

const MAX_ATTEMPTS = 3;

const formatNumber = (value: number) => {
  return Number(value.toFixed(2)).toString().replace(/\.0+$/, "");
};

function toFixed2(n: number) {
  return n.toFixed(2);
}

function replaceShotHeaderNumbers(text: string, sceneCount: number, durationSec: number): string {
  const headerPattern = /Optimized Shot List\s*\([^)]*\):/;
  const computed = `Optimized Shot List (${sceneCount} shots / ${toFixed2(durationSec)}s):`;
  if (headerPattern.test(text)) {
    return text.replace(headerPattern, computed);
  }
  return text;
}

function countShotLines(text: string): number {
  const shotLineRegex = /^\s*\d{1,3}\.\d{2}\s*[–-]\s*\d{1,3}\.\d{2}\s*—/gm;
  const matches = text.match(shotLineRegex);
  return matches ? matches.length : 0;
}

function removeUndesiredHeadings(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (/^Project brief:/i.test(trimmed)) return false;
    if (/^Preferences\s*\(apply silently\):/i.test(trimmed)) return false;
    if (/^Guidelines:/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n");
}

function hasPlaceholders(text: string): boolean {
  return /\[|\]|\{|\}/.test(text);
}

function hasRequiredDetailedSections(text: string): boolean {
  const required = [
    'Format & Look:',
    'Lenses & Filtration:',
    'Grade/Palette:',
    'Lighting & Atmosphere:',
    'Location & Framing:',
    'Wardrobe/Props/Extras:',
    'Sound:',
    'Optimized Shot List',
    'Continuity Rules:'
  ];
  return required.every(label => text.includes(label));
}

function validateAndCleanSoraDetailed({
  text,
  sceneCount,
  durationSec
}: {
  text: string;
  sceneCount: number;
  durationSec: number;
}): { ok: boolean; cleaned: string; reasons: string[] } {
  const reasons: string[] = [];
  let cleaned = text;
  cleaned = removeUndesiredHeadings(cleaned);
  cleaned = replaceShotHeaderNumbers(cleaned, sceneCount, durationSec);

  if (hasPlaceholders(cleaned)) {
    reasons.push('placeholders-present');
  }
  if (!hasRequiredDetailedSections(cleaned)) {
    reasons.push('missing-sections');
  }
  const shotLines = countShotLines(cleaned);
  if (shotLines !== Math.max(sceneCount, 1)) {
    reasons.push(`invalid-shot-count:${shotLines}`);
  }

  return { ok: reasons.length === 0, cleaned, reasons };
}

function pick<T>(arr: T[], n: number): T[] {
  return arr.slice(0, Math.max(0, n));
}

function deriveFormatLook(style: StoryboardStyle, language: "ko" | "en"): string {
  const label = style.label?.trim();
  const grading = style.grading?.trim();
  const isKo = language === "ko";
  if (isKo) {
    return [
      label ? `영화적 ${label} 무드` : null,
      grading ? grading : null,
      "은은한 필름 그레인과 소프트 할레이션"
    ].filter(Boolean).join(", ");
  }
  return [
    label ? `cinematic ${label} mood` : null,
    grading ? grading : null,
    "subtle film grain and gentle halation"
  ].filter(Boolean).join(", ");
}

function deriveLensesFiltration(style: StoryboardStyle, language: "ko" | "en"): string {
  // 기본 합리적 세트. style.prompt에 렌즈 힌트가 있으면 그대로 사용 (간단 탐지)
  const hint = style.prompt?.match(/\b(\d{2,3}mm[^,)]*|Pro-?Mist\s*[1\/]?\d)/i)?.[0];
  if (hint) {
    return hint;
  }
  return "32/50mm set, Pro-Mist 1/4";
}

function deriveGradePalette(style: StoryboardStyle, language: "ko" | "en"): string {
  const isKo = language === "ko";
  const g = style.grading?.trim();
  if (isKo) {
    return g ? `${g}; 부드러운 하이라이트, 균형 잡힌 미드, 깊은 블랙` : "부드러운 하이라이트, 균형 잡힌 미드, 깊은 블랙";
  }
  return g ? `${g}; soft highlights, balanced mids, rich blacks` : "soft highlights, balanced mids, rich blacks";
}

function deriveLightingAtmosphere(style: StoryboardStyle, language: "ko" | "en"): string {
  const isKo = language === "ko";
  const text = `${style.label || ""} ${style.description || ""} ${style.prompt || ""}`.toLowerCase();
  const hasSunset = /sunset|석양|golden\s*hour/.test(text);
  const hasRain = /rain|비\s|비오는|장마/.test(text);
  const hasNight = /night|야간|neon|noir/.test(text);
  if (isKo) {
    if (hasRain && hasSunset) return "젖은 거리 반사 + 따뜻한 석양 역광, 소프트 볼류메트릭";
    if (hasRain) return "젖은 거리 반사 + 로우 키 조명, 미세한 비안개";
    if (hasSunset) return "따뜻한 석양 역광 + 소프트 림, 은은한 볼류메트릭";
    if (hasNight) return "네온 반사 혼합의 로우 키 조명, 가벼운 헤이즈";
    return "소프트 키 + 림, 약한 헤이즈";
  }
  if (hasRain && hasSunset) return "wet street reflections with warm sunset backlight, soft volumetrics";
  if (hasRain) return "wet reflections and low-key contrast, light rain haze";
  if (hasSunset) return "warm sunset backlight with soft rim, subtle volumetrics";
  if (hasNight) return "low-key with neon bounce, light haze";
  return "soft key and rim light, light haze";
}

function deriveLocationFraming(style: StoryboardStyle, language: "ko" | "en"): string {
  const isKo = language === "ko";
  const text = `${style.label || ""} ${style.description || ""}`.toLowerCase();
  const street = /street|거리|골목/.test(text);
  const indoor = /indoor|실내|studio|스튜디오/.test(text);
  if (isKo) {
    if (street) return "전경: 젖은 아스팔트, 중경: 인물, 후경: 도시 실루엣";
    if (indoor) return "전경: 소품, 중경: 인물, 후경: 단색 배경";
    return "전경/중경/후경 구분이 명확한 안정된 프레이밍";
  }
  if (street) return "foreground: wet asphalt, mid: subject, background: city silhouette";
  if (indoor) return "foreground: props, mid: subject, background: plain backdrop";
  return "clear separation of foreground/mid/background";
}

function deriveSound(style: StoryboardStyle, language: "ko" | "en"): string {
  const isKo = language === "ko";
  const cues = Array.isArray(style.sfx) ? pick(style.sfx, 3) : [];
  if (cues.length) {
    return isKo ? `다이어제틱: ${cues.join(", ")}` : `diegetic: ${cues.join(", ")}`;
  }
  return isKo ? "다이어제틱 앰비언스; 과도한 BGM 지양" : "diegetic ambience; minimal BGM";
}

function replaceAutoValuesDetailedSections({
  text,
  style,
  language
}: {
  text: string;
  style: StoryboardStyle;
  language: "ko" | "en";
}): string {
  const lines = text.split(/\r?\n/);
  const autoToken = (s: string) => /\bauto\b|자동/.test(s.toLowerCase());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const replaceIfAuto = (label: string, value: string) => {
      const re = new RegExp(`^(\\s*)${label}:(.*)$`, 'i');
      const m = line.match(re);
      if (m) {
        const head = `${m[1]}${label}: `;
        const rest = m[2].trim();
        if (autoToken(rest)) {
          lines[i] = head + value;
        }
      }
    };
    replaceIfAuto('Format & Look', deriveFormatLook(style, language));
    replaceIfAuto('Lenses & Filtration', deriveLensesFiltration(style, language));
    replaceIfAuto('Grade/Palette', deriveGradePalette(style, language));
    replaceIfAuto('Lighting & Atmosphere', deriveLightingAtmosphere(style, language));
    replaceIfAuto('Location & Framing', deriveLocationFraming(style, language));
    replaceIfAuto('Sound', deriveSound(style, language));
  }
  return lines.join("\n");
}

function buildJsonPrompt({
  durationSec,
  sceneCount,
  style,
  idea,
  dialogueMode,
  sfxMode,
  language,
  maxCharacters
}: {
  durationSec: number;
  sceneCount: number;
  style: StoryboardStyle;
  idea: string;
  dialogueMode: "auto" | "none";
  sfxMode: "auto" | "none";
  language: "ko" | "en";
  maxCharacters: number;
}) {
  const isEnglish = language === "en";
  const stylePrompt = style.prompt?.trim();
  const baseDescription = stylePrompt || style.description || style.grading || style.label;
  const englishGuidance = `${baseDescription}. Use cinematic language.`;
  const koreanGuidance = `${baseDescription} 분위기를 유지하고 영화적인 묘사로 작성해.`;

  if (isEnglish) {
    return `You are a professional storyboard writer. Produce structured JSON for AI video generation.\n\nInput details:\n- Theme: ${idea.trim()}\n- Visual style: ${style.label}\n- Scene count: ${sceneCount}\n- Total duration: ${durationSec} seconds\n- Style guidance: ${englishGuidance}\n\nRequirements:\n- Return exactly ${sceneCount} scenes.\n- Each scene must include the fields visual, dialogue, sfx, and transition.\n- Dialogue field must ${dialogueMode === "auto" ? "contain a short in-character sentence." : "always be an empty string (\"\")."}\n- SFX field must ${sfxMode === "auto" ? "contain an array of specific English sound effect phrases (at least one)." : "be an empty array []."}\n- Transition should clearly describe how the story moves to the next scene.\n- Keep the wording concise so the entire JSON stays within roughly ${maxCharacters} characters.\n\nOutput format (strictly follow this structure):\n{\n  "scenes": [\n    { "visual": "...", "dialogue": "...", "sfx": ["..."], "transition": "..." }\n  ]\n}\n\nRespond in English only.`;
  }

  return `너는 전문 스토리보드 작가야. 다음 조건에 맞춰 AI 영상 생성을 위한 상세한 씬(Scene)별 스크립트를 JSON으로 작성해줘.\n\n- 전체 테마: ${idea.trim()}\n- 영상 스타일: ${style.label}\n- 총 씬 개수: ${sceneCount}\n- 총 길이: ${durationSec}초\n- 스타일 지침: ${koreanGuidance}\n\n출력 조건:\n- 응답은 반드시 ${sceneCount}개의 씬만 포함해야 해.\n- 각 씬은 visual, dialogue, sfx, transition 4가지 항목을 포함해야 해.\n- dialogue ${dialogueMode === "auto" ? "항목에는 장면에 어울리는 짧은 대사를 1문장 내외로 작성해." : "항목은 모두 빈 문자열(\"\")로 두고 어떠한 대사도 작성하지 마."}\n- sfx ${sfxMode === "auto" ? "항목은 구체적인 효과음을 1개 이상 포함하도록 해." : "항목은 빈 배열([])로 두고 어떤 효과음도 포함하지 마."}\n- transition에는 다음 장면으로 넘어가는 구체적인 연출을 적어.\n- 전체 JSON 분량이 약 ${maxCharacters}자를 넘지 않도록 간결하게 작성해.\n\n출력 형식(꼭 지켜줘):\n{\n  "scenes": [\n    { "visual": "...", "dialogue": "...", "sfx": ["..."], "transition": "..." }\n  ]\n}\n\n한국어로 작성해.`;
}

type SoraOptions = {
  formatLook?: string;
  lensesFiltration?: string;
  gradePalette?: string;
  lightingAtmosphere?: string;
  locationFraming?: string;
  wardrobePropsExtras?: string;
  sound?: string;
};

function buildSoraPromptV2({
  durationSec,
  sceneCount,
  style,
  idea,
  dialogueMode,
  audioPrefs,
  language,
  maxCharacters,
  templateMode,
  soraOptions,
  animeHeader
}: {
  durationSec: number;
  sceneCount: number;
  style: StoryboardStyle;
  idea: string;
  dialogueMode: "auto" | "none";
  audioPrefs: AudioPreferenceSelection;
  language: "ko" | "en";
  maxCharacters: number;
  templateMode: "concise" | "detailed";
  soraOptions?: SoraOptions;
  animeHeader?: boolean;
}) {
  const isEnglish = language === "en";
  const stylePrompt = style.prompt?.trim();
  const finalDuration = durationSec;
  const formatSec = (v: number) => v.toFixed(2);

  const projectInfo = [
    isEnglish ? `- Theme: ${idea.trim()}` : `- 테마: ${idea.trim()}`,
    isEnglish ? `- Visual style: ${style.label}` : `- 영상 스타일: ${style.label}`,
    isEnglish ? `- Tone & grading: ${style.grading}` : `- 톤 & 그레이딩: ${style.grading}`,
    isEnglish ? `- Duration target: ${formatSec(finalDuration)}s` : `- 목표 길이: ${formatSec(finalDuration)}초`,
    isEnglish ? `- Shots requested: ${sceneCount}` : `- 요청 샷 수: ${sceneCount}`
  ];
  if (stylePrompt) {
    projectInfo.push(isEnglish ? `- Style prompt reference: ${stylePrompt}` : `- 스타일 프롬프트 참고: ${stylePrompt}`);
  }

  const opt = soraOptions || {};
  const optionLine = (labelKo: string, labelEn: string, value?: string) => {
    if (!value || value === "auto") return isEnglish ? `${labelEn}: (auto)` : `${labelKo}: (자동)`;
    if (value === "none") return isEnglish ? `${labelEn}: (none)` : `${labelKo}: (없음)`;
    return `${isEnglish ? labelEn : labelKo}: ${value}`;
  };

  const animeHeaderLine =
    animeHeader
      ? (isEnglish
          ? "STYLE: anime cel-shade fixed, 2–3 tone shadows, clean lineart (0.8pt), painterly BG with soft volumetric light, restrained bloom, fine grain."
          : "STYLE: anime cel-shade fixed, 2–3 tone shadows, clean lineart (0.8pt), painterly BG with soft volumetric light, restrained bloom, fine grain.")
      : "";

  const dialogueNote = dialogueMode === "auto"
    ? (isEnglish ? "Include a short character line if appropriate." : "필요 시 짧은 캐릭터 대사를 1줄 포함해.")
    : (isEnglish ? "No dialogue; mark as '(none)'." : "대사는 없음으로 처리해('없음').");

  const step = Math.max(finalDuration / Math.max(sceneCount, 1), 0);
  const shotLines: string[] = [];
  for (let i = 0; i < Math.max(sceneCount, 1); i++) {
    const start = formatSec(step * i);
    const end = formatSec(Math.min(step * (i + 1), finalDuration));
    const line = isEnglish
      ? `${start}–${end} — [shot name] ([lens/move]): [action & intent].`
      : `${start}–${end} — [샷명] ([렌즈/무브]): [행동·목적].`;
    shotLines.push(line);
  }

  if (templateMode === "concise") {
    const styleLine = isEnglish ? "STYLE: [era/medium/look in one line]." : "STYLE: [시대/매체/룩 한 줄].";
    const sceneLine = isEnglish
      ? "SCENE: [Describe space/props/characters in one paragraph. Time of day/weather optional.]"
      : "SCENE: [공간·소품·인물 묘사 한 문단. 시간대/날씨 선택적.]";
    const dialogueLine = dialogueMode === "auto"
      ? (isEnglish ? `DIALOGUE (optional):\n- [speaker]: "[one short line]"` : `DIALOGUE (optional):\n- [화자]: "[짧은 한 줄]"`)
      : (isEnglish ? "" : "");

    const intro = isEnglish
      ? "You are a cinematic prompt writer preparing Sora-style prompts. Fill the following concise template with vivid, precise language."
      : "너는 Sora 스타일의 시네마틱 프롬프트를 작성하는 전문가야. 아래 간결형 템플릿을 생생하고 정확한 문장으로 채워줘.";

    const infoHeading = isEnglish ? "Project brief:" : "프로젝트 개요:";
    const guidelineHeading = isEnglish ? "Guidelines:" : "작성 지침:";

    // Preferences guide (do not echo in output)
    const preferencesHeading = isEnglish ? "Preferences (apply silently):" : "선호 설정(출력에 직접 표기하지 말 것):";
    const preferences = [
      opt.formatLook && opt.formatLook !== "auto" ? `${isEnglish ? "Format & Look" : "Format & Look"}: ${opt.formatLook}` : null,
      opt.lensesFiltration && opt.lensesFiltration !== "auto" ? `${isEnglish ? "Lenses & Filtration" : "Lenses & Filtration"}: ${opt.lensesFiltration}` : null,
      opt.gradePalette && opt.gradePalette !== "auto" ? `${isEnglish ? "Grade/Palette" : "Grade/Palette"}: ${opt.gradePalette}` : null,
      opt.lightingAtmosphere && opt.lightingAtmosphere !== "auto" ? `${isEnglish ? "Lighting & Atmosphere" : "Lighting & Atmosphere"}: ${opt.lightingAtmosphere}` : null,
      opt.locationFraming && opt.locationFraming !== "auto" ? `${isEnglish ? "Location & Framing" : "Location & Framing"}: ${opt.locationFraming}` : null,
      opt.wardrobePropsExtras && opt.wardrobePropsExtras !== "auto" ? `${isEnglish ? "Wardrobe/Props/Extras" : "Wardrobe/Props/Extras"}: ${opt.wardrobePropsExtras}` : null,
      opt.sound && opt.sound !== "auto" ? `${isEnglish ? "Sound" : "Sound"}: ${opt.sound}` : null
    ].filter(Boolean) as string[];

    const guidelines = [
      isEnglish
        ? "- Keep wording concrete; avoid vague terms."
        : "- 모호한 표현 대신 구체적인 명사를 사용해.",
      isEnglish ? `- Duration: ${formatSec(finalDuration)}s; target ~${sceneCount} shots.` : `- 길이: ${formatSec(finalDuration)}초; 목표 샷 ~${sceneCount}개.`,
      dialogueNote,
      isEnglish ? `- Language: English.` : `- 언어: 한국어.`,
      isEnglish ? `- Limit ~${maxCharacters} characters.` : `- 분량은 약 ${maxCharacters}자 이내.`,
      isEnglish
        ? "- Replace every placeholder with concrete wording; never include square brackets [] or curly braces {} in the final answer."
        : "- 모든 플레이스홀더를 실제 문구로 교체하고, 최종 출력에 대괄호/중괄호를 절대 남기지 마.",
      isEnglish
        ? "- Never output the literal words 'auto' or '자동'."
        : "- 'auto'나 '자동'이라는 단어를 출력하지 마.",
      isEnglish
        ? "- Output only the final filled template (STYLE/SCENE[/DIALOGUE]); do not include Project brief, Preferences or Guidelines headings."
        : "- 최종 템플릿(STYLE/SCENE[/DIALOGUE])만 출력하고, Project brief/Preferences/Guidelines 제목은 출력하지 마.",
      preferences.length
        ? (isEnglish
            ? "- Apply the following preferences when writing (do not echo them):"
            : "- 다음 선호 설정을 글에 반영하되 직접 출력하지 마:")
        : ""
    ].join("\n");

    const lines = [
      intro,
      "",
      infoHeading,
      ...projectInfo,
      "",
      animeHeaderLine && animeHeaderLine,
      styleLine,
      "",
      sceneLine,
      dialogueLine,
      "",
      guidelineHeading,
      guidelines,
      preferences.length ? preferences.join("\n") : ""
    ].filter(Boolean);

    return lines.join("\n");
  }

  const shotsHeader = isEnglish
    ? `Optimized Shot List (${sceneCount} shots / ${formatSec(finalDuration)}s):`
    : `Optimized Shot List (${sceneCount} shots / ${formatSec(finalDuration)}s):`;

  const sections = [
    isEnglish
      ? "Format & Look: [shutter/film feel/grain/halation]."
      : "Format & Look: [셔터/필름감/그레인/할레이션].",
    isEnglish
      ? "Lenses & Filtration: [32/50mm, Pro-Mist 1/4 …]."
      : "Lenses & Filtration: [32/50mm, Pro-Mist 1/4 …].",
    isEnglish
      ? "Grade/Palette: [highlight/mid/black tone guide]."
      : "Grade/Palette: [하이라이트/미드/블랙 톤 가이드].",
    isEnglish
      ? "Lighting & Atmosphere: [light direction/intensity, volumetric/fog]."
      : "Lighting & Atmosphere: [광원 방향·강도, 볼류메트릭/안개].",
    isEnglish
      ? "Location & Framing: [foreground/mid/background], [banned: signage/brands]."
      : "Location & Framing: [전/중/후경], [금지: 간판/브랜드].",
    isEnglish ? "Wardrobe/Props/Extras: [only essentials]." : "Wardrobe/Props/Extras: [핵심만].",
    isEnglish ? "Sound: [diegetic cues/levels]." : "Sound: [다이어제틱 큐/레벨]."
  ];

  const intro = isEnglish
    ? "You are a cinematic prompt writer preparing Sora-style prompts. Fill the following detailed template with precise language."
    : "너는 Sora 스타일의 시네마틱 프롬프트를 작성하는 전문가야. 아래 디테일형 템플릿을 정확한 언어로 채워줘.";

  const infoHeading = isEnglish ? "Project brief:" : "프로젝트 개요:";
  const guidelineHeading = isEnglish ? "Guidelines:" : "작성 지침:";

  const guidelines = [
    isEnglish ? `- Language: English.` : `- 언어: 한국어.`,
    isEnglish ? `- Limit ~${maxCharacters} characters.` : `- 분량은 약 ${maxCharacters}자 이내.`,
    dialogueNote,
    isEnglish
      ? "- Keep section headers exactly as shown."
      : "- 섹션 제목은 그대로 유지해.",
    isEnglish
      ? "- Time-code each shot as provided and keep continuity consistent."
      : "- 제공된 타임코드에 맞춰 샷을 작성하고 연속성을 유지해.",
    isEnglish
      ? "- Replace every placeholder with concrete wording; do not include [] or {} in the final answer."
      : "- 모든 플레이스홀더를 실제 문구로 교체하고, 최종 출력에 대괄호/중괄호를 남기지 마.",
    isEnglish
      ? "- Use selected options: if 'auto', choose fitting values from the style; if 'none', write 'none'."
      : "- 선택 옵션 반영: '자동'이면 스타일에서 자연스러운 값을 선택하고, '없음'이면 '없음'으로 표기해.",
    isEnglish
      ? "- Never output the literal words 'auto' or '자동' in any section."
      : "- 어떤 섹션에도 'auto'나 '자동'이라는 단어를 출력하지 마.",
    isEnglish
      ? "- For lenses/moves in each shot, pick plausible values (use provided lenses when specified)."
      : "- 각 샷의 렌즈/무브는 합리적으로 선택하고(제공된 렌즈 지정 시 이를 사용), 나머지는 스타일에 맞게 결정해.",
    isEnglish
      ? "- Output only the final filled template sections; do not include Project brief, Preferences or Guidelines in your final answer."
      : "- 최종 출력에는 템플릿 섹션만 포함하고 Project brief/Preferences/Guidelines는 출력하지 마."
  ].join("\n");

  // Provide preferences to the model as guidance, but do NOT echo them in the final output
  const preferencesHeading = isEnglish ? "Preferences (apply silently):" : "선호 설정(출력에 직접 표기하지 말 것):";
  const preferences = [
    optionLine("Format & Look", "Format & Look", opt.formatLook),
    optionLine("Lenses & Filtration", "Lenses & Filtration", opt.lensesFiltration),
    optionLine("Grade/Palette", "Grade/Palette", opt.gradePalette),
    optionLine("Lighting & Atmosphere", "Lighting & Atmosphere", opt.lightingAtmosphere),
    optionLine("Location & Framing", "Location & Framing", opt.locationFraming),
    optionLine("Wardrobe/Props/Extras", "Wardrobe/Props/Extras", opt.wardrobePropsExtras),
    optionLine("Sound", "Sound", opt.sound)
  ];

  const parts = [
    intro,
    "",
    infoHeading,
    ...projectInfo,
    "",
    animeHeaderLine && animeHeaderLine,
    preferencesHeading,
    ...preferences,
    "",
    sections[0],
    sections[1],
    sections[2],
    sections[3],
    sections[4],
    sections[5],
    sections[6],
    "",
    shotsHeader,
    ...shotLines,
    "",
    isEnglish
      ? "Continuity Rules: [lock states (prop positions/handle direction/light logic)]."
      : "Continuity Rules: [상태 고정(소품 위치/손잡이 방향/광원 논리)].",
    "",
    guidelineHeading,
    guidelines
  ].filter(Boolean);

  return parts.join("\n");
}

function buildSoraPrompt({
  durationSec,
  style,
  idea,
  dialogueMode,
  audioPrefs,
  language,
  maxCharacters
}: {
  durationSec: number;
  style: StoryboardStyle;
  idea: string;
  dialogueMode: "auto" | "none";
  audioPrefs: AudioPreferenceSelection;
  language: "ko" | "en";
  maxCharacters: number;
}) {
  const isEnglish = language === "en";
  const segment = durationSec / 3;
  const firstEnd = formatNumber(segment);
  const secondEnd = formatNumber(segment * 2);
  const finalEnd = formatNumber(durationSec);
  const stylePrompt = style.prompt?.trim();
  const projectInfo = [
    isEnglish ? `- Theme: ${idea.trim()}` : `- 테마: ${idea.trim()}`,
    isEnglish ? `- Visual style: ${style.label}` : `- 영상 스타일: ${style.label}`,
    isEnglish
      ? `- Tone & grading: ${style.grading}`
      : `- 톤 & 그레이딩: ${style.grading}`,
    isEnglish ? `- Duration target: ${finalEnd} seconds` : `- 목표 길이: ${finalEnd}초`
  ];
  if (stylePrompt) {
    projectInfo.push(isEnglish ? `- Style prompt reference: ${stylePrompt}` : `- 스타일 프롬프트 참고: ${stylePrompt}`);
  }

  const template = isEnglish
    ? `[Logline]\n{main character + core action + location + tone, in up to 2 sentences}\n\n[Shot Plan | total ${finalEnd}s]\n- [0–${firstEnd}s] {shot size} / {camera move} / {action}\n- [${firstEnd}–${secondEnd}s] {shot size} / {camera move} / {action}\n- [${secondEnd}–${finalEnd}s] {shot size} / {camera move} / {action}\n\n[Visual Grammar]\nstyle: {e.g. cinematic anime, painterly texture}\nlighting: {e.g. sunset backlight, volumetric light}\nlens: {e.g. 50mm, shallow depth of field}\ngrade/texture: {e.g. subtle film grain, high contrast}\n\n[Physics & Continuity]\n{e.g. wind hits hair first, scarf follows with 0.2s delay; keep props, costume, and hair consistent}\n\n[Audio]\nbgm: {e.g. warm ambient pads}\nsfx: {e.g. soft breeze, fabric rustle}\ndialogue: "{short line}" (lip-sync ready)\n\n[Constraints]\nno subtitles, no on-screen text, no logos, stable character design`
    : `[Logline]\n{주인공+핵행동+장소+톤, 2문장 이내}\n\n[Shot Plan | total ${finalEnd}s]\n- [0–${firstEnd}s] {샷사이즈} / {카메라무브} / {행동}\n- [${firstEnd}–${secondEnd}s] {샷사이즈} / {카메라무브} / {행동}\n- [${secondEnd}–${finalEnd}s] {샷사이즈} / {카메라무브} / {행동}\n\n[Visual Grammar]\nstyle: {예: cinematic anime, painterly texture}\nlighting: {예: sunset backlight, volumetric light}\nlens: {예: 50mm, shallow depth of field}\ngrade/texture: {예: subtle film grain, high contrast}\n\n[Physics & Continuity]\n{예: 바람→의복 지연, 스카프 관성; 소품·의상·헤어 일관 유지}\n\n[Audio]\nbgm: {예: 따뜻한 앰비언트 패드}\nsfx: {예: 부드러운 바람, 천섬김 소리}\ndialogue: "{짧은 대사 1줄}" (입모양 동기화)\n\n[Constraints]\nno subtitles, no on-screen text, no logos, stable character design`;

  const dialogueGuideline = dialogueMode === "auto"
    ? (isEnglish
        ? "- Dialogue line: write a short, in-character quote inside quotation marks."
        : "- Dialogue 줄에는 캐릭터의 짧은 대사를 따옴표로 작성해.")
    : (isEnglish
        ? "- Dialogue line must be exactly `dialogue: \"(none)\" (lip-sync off)`." 
        : "- Dialogue 줄은 `dialogue: \"(없음)\" (립싱크 없음)` 형태로 작성해.");

  const bgmGuideline = audioPrefs.bgm === "auto"
    ? (() => {
        const base = style.bgm?.trim();
        if (isEnglish) {
          return base
            ? `- BGM line: recommend music that fits "${base}".`
            : `- BGM line: recommend background music that matches the ${style.label} mood.`;
        }
        return base
          ? `- bgm 줄에는 "${base}" 분위기의 음악을 추천해.`
          : `- bgm 줄에는 ${style.label} 분위기에 어울리는 음악을 제안해.`;
      })()
    : (isEnglish ? "- BGM line must read `bgm: none`." : "- bgm 줄은 `bgm: 없음`으로 작성해.");

  const sfxGuideline = audioPrefs.sfx === "auto"
    ? (() => {
        if (isEnglish) {
          const base = style.sfx.length ? ` ${style.sfx.join(", ")}` : "";
          return `- SFX line: list specific sound cues in concise phrases.${base ? ` Reference example cues:${base}.` : ""}`;
        }
        const base = style.sfx.length ? ` 참고 예시: ${style.sfx.join(", ")}.` : "";
        return `- sfx 줄에는 구체적인 효과음을 쉼표로 구분해 작성해.${base}`;
      })()
    : (isEnglish ? "- SFX line must read `sfx: none`." : "- sfx 줄은 `sfx: 없음`으로 작성해.");

  const voiceGuideline = (() => {
    if (dialogueMode === "none") {
      return isEnglish
        ? "- With dialogue disabled, do not add extra voice notes beyond `(lip-sync off)`."
        : "- 대사가 없을 때는 '(립싱크 없음)' 외의 보이스 설명을 추가하지 마.";
    }
    if (audioPrefs.voice === "auto") {
      if (isEnglish) {
        return style.voTone?.trim()
          ? `- After the dialogue quote, add parentheses describing the voice tone (e.g. ${style.voTone}).`
          : "- After the dialogue quote, add parentheses describing the intended voice tone.";
      }
      return style.voTone?.trim()
        ? `- 대사 뒤 괄호에는 추천 보이스 톤(예: ${style.voTone})을 적어.`
        : "- 대사 뒤 괄호에는 어울리는 보이스 톤을 간단히 안내해.";
    }
    return isEnglish
      ? "- If voice is off, append `(voice off)` after the dialogue line."
      : "- 보이스가 꺼진 경우 대사 뒤에 '(보이스 없음)'을 덧붙여.";
  })();

  const charLimitGuideline = isEnglish
    ? `- Keep the final answer within roughly ${maxCharacters} characters.`
    : `- 최종 분량은 약 ${maxCharacters}자 이내로 유지해.`;

  const languageGuideline = isEnglish
    ? "- Write in natural English without code fences or additional explanations."
    : "- 자연스러운 한국어로 작성하고 코드블록이나 추가 설명은 넣지 마.";

  const replaceGuideline = isEnglish
    ? "- Replace every {placeholder} with concrete wording and keep the section headers exactly as shown."
    : "- 중괄호 안의 예시는 실제 묘사로 교체하고, 섹션 제목은 그대로 유지해.";

  const physicsGuideline = isEnglish
    ? "- Physics & Continuity should describe motion timing (e.g., wind → fabric delay) and consistency notes."
    : "- Physics & Continuity에는 움직임 간 시간차와 일관성 유지 팁을 적어.";

  const guidelines = [replaceGuideline, dialogueGuideline, voiceGuideline, bgmGuideline, sfxGuideline, physicsGuideline, charLimitGuideline, languageGuideline]
    .filter(Boolean)
    .join("\n");

  const intro = isEnglish
    ? "You are a cinematic prompt writer preparing material for Sora 2. Fill the following template with vivid, precise language."
    : "너는 Sora 2용 시네마틱 프롬프트를 작성하는 전문가야. 아래 템플릿을 생생한 묘사로 채워줘.";

  const infoHeading = isEnglish ? "Project brief:" : "프로젝트 개요:";
  const guidelineHeading = isEnglish ? "Guidelines:" : "작성 지침:";

  return `${intro}\n\n${infoHeading}\n${projectInfo.join("\n")}\n\n출력 형식 (중괄호는 실제 내용으로 교체):\n${template}\n\n${guidelineHeading}\n${guidelines}`;
}

function buildNaturalPrompt({
  durationSec,
  sceneCount,
  style,
  idea,
  dialogueMode,
  audioPrefs,
  language,
  maxCharacters,
  soraMode,
  soraTemplateMode,
  soraOptions,
  animeHeader
}: {
  durationSec: number;
  sceneCount: number;
  style: StoryboardStyle;
  idea: string;
  dialogueMode: "auto" | "none";
  audioPrefs: AudioPreferenceSelection;
  language: "ko" | "en";
  maxCharacters: number;
  soraMode: boolean;
  soraTemplateMode?: "concise" | "detailed";
  soraOptions?: SoraOptions;
  animeHeader?: boolean;
}) {
  if (soraMode) {
    return buildSoraPromptV2({
      durationSec,
      sceneCount,
      style,
      idea,
      dialogueMode,
      audioPrefs,
      language,
      maxCharacters,
      templateMode: soraTemplateMode ?? "detailed",
      soraOptions,
      animeHeader: !!animeHeader
    });
  }

  const segment = durationSec / Math.max(sceneCount, 1);
  const timeLines = Array.from({ length: sceneCount }, (_, index) => {
    const start = formatNumber(segment * index);
    const end = formatNumber(segment * (index + 1));
    if (language === "en") {
      return `Scene ${index + 1}: ${start}-${end} seconds`;
    }
    return `Scene ${index + 1}: ${start}-${end}초`;
  }).join("\n");

  const isEnglish = language === "en";
  const languagePrompt = isEnglish
    ? "You are an expert storyboard writer who writes in fluent English."
    : "너는 한국어로 작문하는 전문 스토리보드 작가야.";
  const dialogueInstruction = dialogueMode === "auto"
    ? (isEnglish
        ? "- For the Dialogue line, include a concise in-character sentence when appropriate."
        : "- Dialogue 항목에는 장면에 어울리는 짧은 대사를 1문장 내외로 작성해.")
    : (isEnglish ? "- For the Dialogue line, write '(none)'." : "- Dialogue 항목에는 '(없음)'이라고만 적어.");
  const bgmText = style.bgm?.trim();
  const voToneText = style.voTone?.trim();
  const sfxInstruction = audioPrefs.sfx === "auto"
    ? (isEnglish
        ? "- For the SFX line, list one or more specific sound effects using concise English phrases."
        : "- SFX 항목에는 구체적인 효과음을 1개 이상 제시해. 효과음은 한국어로 묘사해.")
    : (isEnglish ? "- For the SFX line, write '(none)'." : "- SFX 항목에는 '(없음)'이라고만 적어.");
  const bgmInstruction = audioPrefs.bgm === "auto"
    ? (isEnglish
        ? bgmText
          ? `- On the "Overall BGM" line, recommend music that fits "${bgmText}".`
          : `- On the "Overall BGM" line, recommend background music that matches the ${style.label} mood.`
        : bgmText
          ? `- "Overall BGM" 줄에는 "${bgmText}" 분위기의 음악을 추천해.`
          : `- "Overall BGM" 줄에는 스타일 분위기에 어울리는 음악을 추천해.`)
    : (isEnglish ? "- On the \"Overall BGM\" line, write '(none)'." : "- \"Overall BGM\" 줄에는 '(없음)'이라고 적어.");
  const voiceInstruction = audioPrefs.voice === "auto"
    ? (isEnglish
        ? voToneText
          ? `- On the "Voice Tone" line, recommend a tone similar to "${voToneText}".`
          : `- On the "Voice Tone" line, recommend a tone that matches the ${style.label} mood.`
        : voToneText
          ? `- "Voice Tone" 줄에는 "${voToneText}" 느낌을 추천해.`
          : `- "Voice Tone" 줄에는 스타일 분위기에 어울리는 나레이션 톤을 추천해.`)
    : (isEnglish ? "- On the \"Voice Tone\" line, write '(none)'." : "- \"Voice Tone\" 줄에는 '(없음)'이라고 적어.");
  const sfxExamples = audioPrefs.sfx === "auto" && style.sfx.length
    ? isEnglish
      ? `- Example style SFX for reference: ${style.sfx.join(", ")}.`
      : `- 참고용 스타일 효과음 예시: ${style.sfx.join(", ")}.`
    : "";
  const charLimitInstruction = isEnglish
    ? `- Keep the entire response within approximately ${maxCharacters} characters.`
    : `- 전체 응답은 약 ${maxCharacters}자 이내로 간결하게 작성해.`;
  const finalLanguageInstruction = isEnglish
    ? "- Write the entire response in English and avoid code blocks or quote wrappers."
    : "- 한국어 자연어로 작성하고 코드블록이나 따옴표는 사용하지 마.";
  const visualInstruction = isEnglish
    ? "- In each Visual line, vividly describe the scene while highlighting the chosen style's signature look."
    : "- Visual에는 장면을 생생하게 묘사하고 선택한 스타일 특유의 색감/분위기를 반영해.";
  const transitionInstruction = isEnglish
    ? "- Transition should clearly describe how the story moves to the next scene."
    : "- Transition에는 다음 씬으로 넘어가는 연출을 구체적으로 적어.";
  const sceneLabelInstruction = isEnglish
    ? "- Each Scene heading must include its time range."
    : "- 씬 제목에는 반드시 해당 시간 범위를 포함해.";
  const sectionIntro = isEnglish
    ? `- Begin the introduction with the phrase "${style.label} style" and emphasize ${style.grading}.`
    : `- 첫 문단은 "${style.label} 스타일"이라는 표현으로 시작하고, ${style.grading} 분위기를 강조해.`;
  const stylePromptInstruction = style.prompt
    ? isEnglish
      ? `- Incorporate this style guidance: ${style.prompt}`
      : `- 다음 스타일 프롬프트를 참고해 묘사해: ${style.prompt}`
    : "";

  const inputHeading = isEnglish ? "Input details:" : "입력 정보:";
  const outputHeading = isEnglish ? "Output format:" : "출력 형식:";
  const followStructure = isEnglish ? "- Follow this structure exactly." : "- 다음 구조를 정확히 따르도록 작성해.";
  const sceneExample = isEnglish ? "Scene 1 (start-end seconds)" : "Scene 1 (시작-종료초)";
  const sceneExample2 = isEnglish ? "Scene 2 (start-end seconds)" : "Scene 2 (시작-종료초)";
  const detailHeading = isEnglish ? "Detailed guidelines:" : "세부 지침:";

  return `${languagePrompt} 아래 조건에 맞춰 자연어 스토리보드를 작성해.

${inputHeading}
- ${isEnglish ? "Theme" : "전체 테마"}: ${idea.trim()}
- ${isEnglish ? "Visual style" : "영상 스타일"}: ${style.label}
- ${isEnglish ? "Scene count" : "총 씬 개수"}: ${sceneCount}
- ${isEnglish ? "Total duration" : "총 길이"}: ${isEnglish ? `${durationSec} seconds` : `${durationSec}초`}
- ${isEnglish ? "Mood & grading" : "스타일 색감과 분위기"}: ${style.grading}
- ${isEnglish ? "Timeline per scene" : "씬별 시간 범위"}:
${timeLines}

${outputHeading}
${followStructure}
Overall BGM: ...
Voice Tone: ...
${sceneExample}
- Visual: ...
- Dialogue: ...
- SFX: ...
- Transition: ...
${sceneExample2}
...

${detailHeading}
${sectionIntro}
${bgmInstruction}
${voiceInstruction}
${dialogueInstruction}
${sfxInstruction}
${visualInstruction}
${transitionInstruction}
${sfxExamples}
${sceneLabelInstruction}
${finalLanguageInstruction}
${charLimitInstruction}
${stylePromptInstruction}`;
}

interface GenerateScenesResult {
  scenes: ScenePayload[];
  attempts: number;
}

async function generateScenes({
  apiKey,
  messages,
  sceneCount,
  sfxMode
}: {
  apiKey: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  sceneCount: number;
  sfxMode: "auto" | "none";
}): Promise<GenerateScenesResult> {
  let attempts = 0;
  let currentMessages = [...messages];
  const sfxMinItems = sfxMode === "none" ? 0 : 1;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: currentMessages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "storyboard_scenes",
            strict: true,
            schema: {
              type: "object",
              properties: {
                scenes: {
                  type: "array",
                  minItems: sceneCount,
                  maxItems: sceneCount,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      visual: { type: "string" },
                      dialogue: { type: "string" },
                      sfx: {
                        type: "array",
                        minItems: sfxMinItems,
                        items: { type: "string" }
                      },
                      transition: { type: "string" }
                    },
                    required: ["visual", "dialogue", "sfx", "transition"]
                  }
                }
              },
              required: ["scenes"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI storyboard API error", response.status, errorText);
      throw new Error("Failed to reach OpenAI API.");
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI 응답이 비어 있습니다.");
    }

    let parsedScenes: ScenePayload[];
    try {
      const parsed = JSON.parse(content) as { scenes: ScenePayload[] };
      if (!Array.isArray(parsed.scenes)) {
        throw new Error("scenes is not an array");
      }
      parsedScenes = parsed.scenes.map(scene => ({
        visual: scene?.visual ?? "",
        dialogue: typeof scene?.dialogue === "string" ? scene.dialogue : "",
        sfx: Array.isArray(scene?.sfx) ? scene.sfx.map(item => String(item)) : [],
        transition: scene?.transition ?? ""
      }));
    } catch (error) {
      console.error("Failed to parse storyboard response", content, error);
      throw new Error("OpenAI 응답을 해석하지 못했습니다.");
    }

    if (parsedScenes.length === sceneCount) {
      return { scenes: parsedScenes, attempts };
    }

    if (attempts >= MAX_ATTEMPTS) {
      return { scenes: parsedScenes.slice(0, sceneCount), attempts };
    }

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content },
      {
        role: "user",
        content: `You returned ${parsedScenes.length} scenes but I need exactly ${sceneCount} scenes. Regenerate the entire response strictly following the schema with ${sceneCount} scene entries.`
      }
    ];
  }

  return { scenes: [], attempts };
}

export async function POST(request: NextRequest) {
  const apiKey = serverEnv.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  try {
    const body = requestSchema.parse(await request.json());
    const outputMode = body.outputMode ?? "json";
    const language = body.language ?? "ko";
    const maxCharacters = body.maxCharacters ?? 500;
    const soraMode = body.soraMode ?? true;
    const requestedStyleId = body.style ?? DEFAULT_STORYBOARD_STYLE_ID;
    let style: StoryboardStyle | null = await getStoryboardStyleByIdAdmin(requestedStyleId);
    if (!style) {
      style =
        FALLBACK_STORYBOARD_STYLES.find(item => item.id === requestedStyleId) ??
        FALLBACK_STORYBOARD_STYLES[0] ??
        null;
    }

    if (!style) {
      throw new Error("사용 가능한 영상 스타일을 찾을 수 없습니다.");
    }
    const dialogueMode: "auto" | "none" = body.dialogueMode ?? "none";
    const audioPrefs: AudioPreferenceSelection = {
      bgm: body.audioPreferences?.bgm ?? "auto",
      sfx: body.audioPreferences?.sfx ?? "auto",
      voice: body.audioPreferences?.voice ?? "auto"
    };

    const baseBgm = style.bgm?.trim() || null;
    const baseVo = style.voTone?.trim() || null;
    const baseSfx = Array.isArray(style.sfx) ? style.sfx : [];

    const storyboardAudio = {
      bgm: audioPrefs.bgm === "auto" ? baseBgm : null,
      sfx: audioPrefs.sfx === "auto" ? baseSfx : [],
      vo_tone: audioPrefs.voice === "auto" ? baseVo : null
    };

    if (outputMode === "natural") {
      const naturalMessages = [
        {
          role: "system" as const,
          content:
            language === "en"
              ? "You are a seasoned cinematic storyteller who replies in English. Produce vivid natural-language storyboards following the requested structure. Return only the final filled template content; do not include instructions, 'Project brief', 'Preferences', or 'Guidelines' headings in the final answer."
              : "You are a seasoned cinematic storyteller who replies in Korean. Produce vivid natural-language storyboards following the requested structure. 최종 채워진 템플릿 내용만 출력하고, 지시문/Project brief/Preferences/Guidelines 제목은 최종 답변에 포함하지 마."
        },
        {
          role: "user" as const,
          content: buildNaturalPrompt({
            durationSec: body.durationSec,
            sceneCount: body.sceneCount,
            style,
            idea: body.idea,
            dialogueMode,
            audioPrefs,
            language,
            maxCharacters,
            soraMode,
            soraTemplateMode: body.soraTemplateMode,
            soraOptions: body.soraOptions,
            animeHeader: body.animeHeader
          })
        }
      ];

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: naturalMessages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI storyboard natural API error", response.status, errorText);
        return NextResponse.json({ ok: false, reason: "Failed to reach OpenAI API." }, { status: 502 });
      }

      const data = await response.json();
      let text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return NextResponse.json({ ok: false, reason: "OpenAI 응답이 비어 있습니다." }, { status: 502 });
      }

      // Post-validate and clean for Sora detailed/concise templates
      if (soraMode) {
        const isDetailed = (body.soraTemplateMode ?? "detailed") === "detailed";
        if (isDetailed) {
          const firstPass = validateAndCleanSoraDetailed({
            text,
            sceneCount: body.sceneCount,
            durationSec: body.durationSec
          });

          if (!firstPass.ok) {
            // One regeneration attempt with stricter instructions
            const retryMessages = [
              ...naturalMessages,
              { role: "assistant" as const, content: text },
              {
                role: "user" as const,
                content:
                  `Rewrite strictly as follows:\n` +
                  `- Replace all placeholders with concrete wording; do NOT include [] or {} anywhere.\n` +
                  `- Output only the final filled template sections (no Project brief / Preferences / Guidelines headings).\n` +
                  `- Ensure these sections exist verbatim: \n` +
                  `  Format & Look:, Lenses & Filtration:, Grade/Palette:, Lighting & Atmosphere:, Location & Framing:, Wardrobe/Props/Extras:, Sound:, Optimized Shot List (${body.sceneCount} shots / ${toFixed2(body.durationSec)}s):, Continuity Rules:.\n` +
                  `- Use exactly ${body.sceneCount} time-coded shot lines with this format: 0.00–T — [shot] ([lens/move]): [action & intent].\n` +
                  `- Time-codes must evenly partition ${toFixed2(body.durationSec)} seconds across ${body.sceneCount} shots.\n` +
                  `- Never write the literal words 'auto' or '자동' in any section; if the option is auto, infer and fill a concrete phrase from the style.\n` +
                  `- Apply preferences silently; do not echo instruction headings.\n`
              }
            ];

            const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: retryMessages })
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              const retryText = retryData?.choices?.[0]?.message?.content?.trim();
              if (retryText) {
                text = retryText;
              }
            }

            // Validate again (best-effort). Even if invalid, clean header and strip headings.
            let secondClean = validateAndCleanSoraDetailed({
              text,
              sceneCount: body.sceneCount,
              durationSec: body.durationSec
            });
            // Replace 'auto/자동' tokens with style-derived values
            secondClean.cleaned = replaceAutoValuesDetailedSections({ text: secondClean.cleaned, style, language });
            text = secondClean.cleaned;
          } else {
            // Ensure auto tokens are replaced even if initial validation passed
            text = replaceAutoValuesDetailedSections({ text: firstPass.cleaned, style, language });
          }
        } else {
          // Concise: remove headings if accidentally included and ensure no placeholders
          let cleaned = removeUndesiredHeadings(text);
          cleaned = replaceShotHeaderNumbers(cleaned, body.sceneCount, body.durationSec);
          if (hasPlaceholders(cleaned)) {
            // Soft attempt: ask to rewrite without placeholders
            const retryMessages = [
              ...naturalMessages,
              { role: "assistant" as const, content: text },
              { role: "user" as const, content: "Remove all placeholders ([] and {}) and output only the filled STYLE/SCENE(/DIALOGUE) content." }
            ];
            const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`
              },
              body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: retryMessages })
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              const retryText = retryData?.choices?.[0]?.message?.content?.trim();
              if (retryText) cleaned = removeUndesiredHeadings(retryText);
            }
          }
          text = cleaned;
        }
      }

      return NextResponse.json(
        { ok: true, format: "natural", storyboardText: text, audio: storyboardAudio },
        { status: 200 }
      );
    }

    const jsonMessages = [
      {
        role: "system" as const,
        content:
          "You are a seasoned cinematic storyboard writer who produces structured JSON suitable for downstream AI video generation. Respond strictly with JSON that matches the supplied schema."
      },
      {
        role: "user" as const,
        content: buildJsonPrompt({
          durationSec: body.durationSec,
          sceneCount: body.sceneCount,
          style,
          idea: body.idea,
          dialogueMode,
          sfxMode: audioPrefs.sfx,
          language,
          maxCharacters
        })
      }
    ];

    let generatedScenes: ScenePayload[] = [];
    try {
      const result = await generateScenes({
        apiKey,
        messages: jsonMessages,
        sceneCount: body.sceneCount,
        sfxMode: audioPrefs.sfx
      });
      generatedScenes = result.scenes;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Failed to generate scenes.";
      return NextResponse.json({ ok: false, reason }, { status: 502 });
    }

    if (generatedScenes.length < body.sceneCount) {
      const fallback = generatedScenes[generatedScenes.length - 1] ?? {
        visual: "",
        dialogue: "",
        sfx: [],
        transition: ""
      };
      while (generatedScenes.length < body.sceneCount) {
        generatedScenes.push({
          visual: fallback.visual,
          dialogue: fallback.dialogue,
          sfx: [...fallback.sfx],
          transition: fallback.transition
        });
      }
    }

    const segment = body.durationSec / Math.max(body.sceneCount, 1);
    const scenes = generatedScenes.slice(0, body.sceneCount).map((scene, index) => {
      const start = segment * index;
      const end = segment * (index + 1);
      return {
        id: `scene${index + 1}`,
        time: `${formatNumber(start)}-${formatNumber(end)}`,
        visual: scene.visual,
        dialogue: dialogueMode === "none" ? "" : scene.dialogue,
        sfx: audioPrefs.sfx === "none" ? [] : scene.sfx,
        transition: scene.transition
      };
    });

    const storyboard = {
      title: body.idea.trim(),
      duration_sec: body.durationSec,
      format: {
        aspect: "16:9",
        fps: 24,
        resolution: "1920x1080",
        grading: style.grading
      },
      audio: storyboardAudio,
      scenes
    };

    return NextResponse.json({ ok: true, format: "json", storyboard, audio: storyboardAudio }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, reason: "유효하지 않은 입력입니다.", issues: error.issues }, { status: 400 });
    }
    console.error("/api/storyboard error", error);
    return NextResponse.json({ ok: false, reason: "스토리보드 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
