/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FALLBACK_STORYBOARD_STYLES, DEFAULT_STORYBOARD_STYLE_ID } from "@/data/storyboard-styles";
import type { StoryboardStyle } from "@/lib/storyboard/types";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type StoryboardAudioInfo = {
  bgm: string | null;
  sfx: string[];
  vo_tone: string | null;
};

type StoryboardResponse =
  | {
      ok: true;
      format: "json";
      storyboard: Record<string, unknown>;
      audio?: StoryboardAudioInfo;
    }
  | {
      ok: true;
      format: "natural";
      storyboardText: string;
      audio?: StoryboardAudioInfo;
    }
  | {
      ok: false;
      reason?: string;
      issues?: unknown;
    };

type GeneratorResult =
  | { format: "json"; storyboard: Record<string, unknown>; audio: StoryboardAudioInfo }
  | { format: "natural"; text: string; audio: StoryboardAudioInfo };

const DURATION_OPTIONS = [5, 10, 15];
const MIN_SCENES = 1;
const MAX_SCENES = 10;
const LANGUAGE_OPTIONS = [
  { value: "ko" as const, label: "한국어" },
  { value: "en" as const, label: "영어" }
];
const MIN_CHAR_COUNT = 100;
const MAX_CHAR_COUNT = 1500;
const CHAR_STEP = 50;

function clampSceneCount(value: number) {
  return Math.min(Math.max(Math.round(value), MIN_SCENES), MAX_SCENES);
}

function normalizeAudio(raw?: unknown): StoryboardAudioInfo {
  const source = (raw ?? {}) as Partial<StoryboardAudioInfo> & Record<string, unknown>;
  const bgm = typeof source.bgm === "string" && source.bgm.trim().length > 0 ? source.bgm : null;
  const sfx = Array.isArray(source.sfx)
    ? source.sfx.map(item => String(item)).filter(item => item.trim().length > 0)
    : [];
  const vo_tone = typeof source.vo_tone === "string" && source.vo_tone.trim().length > 0 ? source.vo_tone : null;
  return { bgm, sfx, vo_tone };
}

export function StoryboardGenerator() {
  const [duration, setDuration] = useState<number>(DURATION_OPTIONS[1]);
  const [sceneCount, setSceneCount] = useState<number>(4);
  const [styles, setStyles] = useState<StoryboardStyle[]>(FALLBACK_STORYBOARD_STYLES);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [styleKey, setStyleKey] = useState<string>(DEFAULT_STORYBOARD_STYLE_ID);
  const [idea, setIdea] = useState<string>("");
  const [dialogueMode, setDialogueMode] = useState<"auto" | "none">("none");
  const [bgmMode, setBgmMode] = useState<"auto" | "none">("auto");
  const [sfxMode, setSfxMode] = useState<"auto" | "none">("auto");
  const [voiceMode, setVoiceMode] = useState<"auto" | "none">("auto");
  const [outputFormat, setOutputFormat] = useState<"json" | "natural">("natural");
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [charCount, setCharCount] = useState<number>(500);
  const [soraEnabled, setSoraEnabled] = useState(true);
  const [soraTemplateMode, setSoraTemplateMode] = useState<"concise" | "detailed">("detailed");
  const [animeHeader, setAnimeHeader] = useState(false);

  // Sora detailed options: 'auto' | 'none' | samples
  const FORMAT_LOOK_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "soft anamorphic bloom, subtle halation", label: "soft anamorphic bloom, subtle halation" },
    { value: "high-contrast macro, fine grain", label: "high-contrast macro, fine grain" },
    { value: "neutral film emulation, gentle contrast", label: "neutral film emulation, gentle contrast" },
    { value: "handheld docu, high ISO texture", label: "handheld docu, high ISO texture" },
    { value: "dreamy soft focus, mild glow", label: "dreamy soft focus, mild glow" }
  ] as const;
  const LENSES_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "32/50mm set, Pro-Mist 1/4", label: "32/50mm set, Pro-Mist 1/4" },
    { value: "35/85mm, Hollywood Black Magic 1/8", label: "35/85mm, Hollywood Black Magic 1/8" },
    { value: "50mm only, no filter", label: "50mm only, no filter" },
    { value: "24/35mm wide + CPL", label: "24/35mm wide + CPL" },
    { value: "70–200mm telephoto, no filter", label: "70–200mm telephoto, no filter" }
  ] as const;
  const GRADE_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "warm highs, cool mids, rich blacks", label: "warm highs, cool mids, rich blacks" },
    { value: "cool mids, warm rim; clean whites", label: "cool mids, warm rim; clean whites" },
    { value: "pastel palette, lifted blacks", label: "pastel palette, lifted blacks" },
    { value: "deep teal–orange, cinematic contrast", label: "deep teal–orange, cinematic contrast" },
    { value: "neutral, film-like roll-off", label: "neutral, film-like roll-off" }
  ] as const;
  const LIGHTING_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "single hard spotlight + soft fill", label: "single hard spotlight + soft fill" },
    { value: "backlight + volumetric fog", label: "backlight + volumetric fog" },
    { value: "soft key + practicals; low haze", label: "soft key + practicals; low haze" },
    { value: "overcast softbox look", label: "overcast softbox look" },
    { value: "hard noon sun; deep shadows", label: "hard noon sun; deep shadows" }
  ] as const;
  const LOCATION_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "charcoal slate tabletop; avoid logos/labels", label: "charcoal slate tabletop; avoid logos/labels" },
    { value: "neon alley; mid-wide framing", label: "neon alley; mid-wide framing" },
    { value: "office desk; inserts/close-ups", label: "office desk; inserts/close-ups" },
    { value: "sunset beach; wide→medium", label: "sunset beach; wide→medium" },
    { value: "kitchen counter; macro CUs", label: "kitchen counter; macro CUs" }
  ] as const;
  const WARDROBE_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "hero product only; clean surfaces", label: "hero product only; clean surfaces" },
    { value: "brand-neutral props; no labels", label: "brand-neutral props; no labels" },
    { value: "casual outfit; no logos", label: "casual outfit; no logos" },
    { value: "period-accurate props only", label: "period-accurate props only" },
    { value: "minimal props", label: "minimal props" }
  ] as const;
  const SOUND_OPTIONS = [
    { value: "auto", label: "자동" },
    { value: "none", label: "없음" },
    { value: "diegetic sear crackle, knife whisper; no VO/music", label: "diegetic sear crackle, knife whisper; no VO/music" },
    { value: "soft breeze, fabric rustle; low BGM", label: "soft breeze, fabric rustle; low BGM" },
    { value: "city hum, distant traffic; no SFX", label: "city hum, distant traffic; no SFX" },
    { value: "room tone + footsteps; subtle VO", label: "room tone + footsteps; subtle VO" },
    { value: "rain patter, glass ping; ambient pad", label: "rain patter, glass ping; ambient pad" }
  ] as const;

  const [formatLook, setFormatLook] = useState<string>("auto");
  const [lensesFiltration, setLensesFiltration] = useState<string>("auto");
  const [gradePalette, setGradePalette] = useState<string>("auto");
  const [lightingAtmosphere, setLightingAtmosphere] = useState<string>("auto");
  const [locationFraming, setLocationFraming] = useState<string>("auto");
  const [wardrobePropsExtras, setWardrobePropsExtras] = useState<string>("auto");
  const [sound, setSound] = useState<string>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const currentStyle = useMemo(() => {
    if (!styles.length) {
      return FALLBACK_STORYBOARD_STYLES[0];
    }
    return styles.find(style => style.id === styleKey) ?? styles[0];
  }, [styles, styleKey]);

  useEffect(() => {
    let cancelled = false;
    async function fetchStyles() {
      try {
        setStylesLoading(true);
        const response = await fetch("/api/storyboard/styles");
        if (!response.ok) {
          throw new Error("failed to load styles");
        }
        const data = await response.json();
        if (!cancelled && Array.isArray(data.styles) && data.styles.length) {
          setStyles(data.styles);
        }
      } catch (error) {
        console.warn("[StoryboardGenerator] failed to load styles, using fallback", error);
        setStyles(FALLBACK_STORYBOARD_STYLES);
      } finally {
        if (!cancelled) {
          setStylesLoading(false);
        }
      }
    }
    fetchStyles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!styles.length) {
      return;
    }
    if (!styles.some(style => style.id === styleKey)) {
      setStyleKey(styles[0].id);
    }
  }, [styles, styleKey]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGenerate = async () => {
    if (!idea.trim()) {
      setError("아이디어를 입력해주세요.");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationSec: duration,
          sceneCount,
          style: styleKey,
          idea: idea.trim(),
          dialogueMode,
          audioPreferences: {
            bgm: bgmMode,
            sfx: sfxMode,
            voice: voiceMode
          },
          outputMode: outputFormat,
          language,
          maxCharacters: charCount,
          soraMode: soraEnabled,
          soraTemplateMode,
          animeHeader,
          soraOptions: {
            formatLook,
            lensesFiltration,
            gradePalette,
            lightingAtmosphere,
            locationFraming,
            wardrobePropsExtras,
            sound
          }
        })
      });

      const data = (await response.json()) as StoryboardResponse;

      if (!response.ok) {
        const reason = !data.ok ? data.reason : undefined;
        setError(reason ?? "스토리보드를 생성하지 못했습니다.");
        return;
      }

      if (!data.ok) {
        setError(data.reason ?? "스토리보드를 생성하지 못했습니다.");
        return;
      }

      if (data.format === "json" && "storyboard" in data) {
        const audio = normalizeAudio(data.audio ?? (data.storyboard as Record<string, unknown>)?.audio);
        setResult({ format: "json", storyboard: data.storyboard, audio });
      } else if (data.format === "natural" && "storyboardText" in data) {
        const audio = normalizeAudio(data.audio);
        setResult({ format: "natural", text: data.storyboardText, audio });
      } else {
        setError("응답 형식을 해석하지 못했습니다.");
      }
    } catch (err) {
      console.error("Failed to generate storyboard", err);
      setError("스토리보드 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      if (result.format === "json") {
        await navigator.clipboard.writeText(JSON.stringify(result.storyboard, null, 2));
      } else {
        await navigator.clipboard.writeText(result.text);
      }
    } catch (err) {
      console.warn("Failed to copy storyboard", err);
    }
  };

  const renderedText = useMemo(() => {
    if (!result) {
      return "";
    }
    return result.format === "json"
      ? JSON.stringify(result.storyboard, null, 2)
      : result.text;
  }, [result]);

  return (
    <>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
      <header className="space-y-5 text-center">
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <div className="flex justify-center">
            <Badge variant="secondary" className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider shadow-sm">
              JSON Storyboard Generator
            </Badge>
          </div>
          <div className="flex flex-1 justify-end">
            <Button asChild variant="outline" size="default">
              <Link href="/studio">스튜디오로 이동</Link>
            </Button>
          </div>
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-foreground">프롬프트 기반 스토리보드 생성</h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground">
          영상 길이, 씬 개수, 스타일, 아이디어를 입력하면 선택한 출력 형식에 맞춰 스토리보드를 자동으로 생성합니다.
        </p>
      </header>

      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-6">
          <CardTitle className="text-xl font-semibold">기본 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <Label className="text-sm font-semibold">영상 길이</Label>
              <ToggleGroup
                type="single"
                value={String(duration)}
                onValueChange={value => {
                  if (!value) return;
                  setDuration(Number(value));
                }}
                className="flex flex-wrap gap-2"
              >
                {DURATION_OPTIONS.map(option => (
                  <ToggleGroupItem key={option} value={String(option)} className="min-w-[80px] font-medium">
                    {option}초
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold">씬 개수</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[sceneCount]}
                  max={MAX_SCENES}
                  min={MIN_SCENES}
                  step={1}
                  onValueChange={value => setSceneCount(clampSceneCount(value[0] ?? sceneCount))}
                  className="w-full"
                />
                <Input
                  type="number"
                  min={MIN_SCENES}
                  max={MAX_SCENES}
                  value={sceneCount}
                  onChange={event => setSceneCount(clampSceneCount(Number(event.target.value)))}
                  className="w-20 text-center font-medium"
                />
              </div>
              <p className="text-xs text-muted-foreground">1~10개 사이에서 선택하세요.</p>
            </div>

            <div className="space-y-4 md:col-span-2">
              <Label className="text-sm font-semibold">영상 스타일</Label>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {styles.map(style => {
                  const isActive = style.id === styleKey;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setStyleKey(style.id)}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border p-0 text-left transition-all duration-200",
                        isActive
                          ? "border-primary ring-2 ring-primary/50 shadow-lg scale-[1.02]"
                          : "border-border/50 hover:border-primary/60 hover:shadow-md hover:scale-[1.01]"
                      )}
                    >
                      <div className="relative h-40 w-full overflow-hidden rounded-t-xl">
                        {style.referenceImageUrl ? (
                          <>
                            <img
                              src={style.referenceImageUrl}
                              alt={style.label}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 space-y-1 px-4 py-3">
                              <p className="text-base font-bold text-white drop-shadow-lg">{style.label}</p>
                              <p className="text-xs leading-tight text-white/90 drop-shadow-md line-clamp-2">{style.description}</p>
                            </div>
                          </>
                        ) : (
                          <div
                            className={`flex h-full w-full items-end justify-between bg-gradient-to-br px-4 py-3 text-white transition-transform duration-300 group-hover:scale-105 ${style.previewGradient ?? "from-slate-700 via-slate-900 to-black"}`}
                          >
                            <div className="space-y-1">
                              <p className="text-base font-semibold drop-shadow">{style.label}</p>
                              <p className="text-xs leading-tight text-white/80 drop-shadow">{style.description}</p>
                            </div>
                          </div>
                        )}
                        {isActive ? (
                          <Badge variant="secondary" className="absolute right-2 top-2 bg-white/95 text-xs font-semibold text-foreground shadow-sm">
                            선택됨
                          </Badge>
                        ) : null}
                      </div>
                      <div className="space-y-1 px-4 py-3 text-xs text-muted-foreground bg-card/30">
                        <p className="font-medium">색감: {style.grading}</p>
                        {style.prompt ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground/80">{style.prompt}</p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                {!stylesLoading && styles.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-border/50 bg-muted/30 py-8 text-center text-sm text-muted-foreground">
                    사용할 수 있는 영상 스타일이 없습니다.
                  </div>
                ) : null}
                {stylesLoading && styles.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-border/50 bg-muted/30 py-8 text-center text-sm text-muted-foreground">
                    스타일을 불러오는 중입니다...
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 md:col-span-2">
              <Label className="text-sm font-semibold" htmlFor="idea-input">
                핵심 아이디어
              </Label>
              <Textarea
                id="idea-input"
                value={idea}
                onChange={event => setIdea(event.target.value)}
                placeholder="예: 미래 도시에서 형사가 비를 맞으며 범인을 추격한다."
                rows={5}
                className="resize-none text-base"
              />
            </div>
          </section>

          <section className="grid gap-6 rounded-xl border border-dashed border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 p-6 md:grid-cols-2">
            <div className="space-y-4">
              <Label className="text-sm font-semibold">대사 생성</Label>
              <ToggleGroup
                type="single"
                value={dialogueMode}
                onValueChange={value => setDialogueMode((value as typeof dialogueMode) || dialogueMode)}
                className="flex gap-2"
                aria-label="대사 생성 모드"
              >
                <ToggleGroupItem value="none" className="flex-1 font-medium">없음</ToggleGroupItem>
                <ToggleGroupItem value="auto" className="flex-1 font-medium">자동 생성</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">기본값은 대사 없이 시각 연출만 생성합니다.</p>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold">출력 형식</Label>
              <ToggleGroup
                type="single"
                value={outputFormat}
                onValueChange={value => setOutputFormat((value as typeof outputFormat) || outputFormat)}
                className="flex gap-2"
                aria-label="출력 형식"
              >
                <ToggleGroupItem value="json" className="flex-1 font-medium">JSON</ToggleGroupItem>
                <ToggleGroupItem value="natural" className="flex-1 font-medium">자연어</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">JSON은 구조화된 결과, 자연어는 읽기 쉬운 문단 형태로 제공됩니다.</p>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold">출력 언어</Label>
              <ToggleGroup
                type="single"
                value={language}
                onValueChange={value => setLanguage((value as typeof language) || language)}
                className="flex gap-2"
                aria-label="출력 언어"
              >
                {LANGUAGE_OPTIONS.map(option => (
                  <ToggleGroupItem key={option.value} value={option.value} className="flex-1 font-medium">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">자연어/JSON 모두 선택한 언어로 작성됩니다.</p>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold">문자 수 제한</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[charCount]}
                  min={MIN_CHAR_COUNT}
                  max={MAX_CHAR_COUNT}
                  step={CHAR_STEP}
                  onValueChange={value => {
                    const next = value[0] ?? charCount;
                    setCharCount(Math.min(Math.max(next, MIN_CHAR_COUNT), MAX_CHAR_COUNT));
                  }}
                  className="w-full"
                />
                <Input
                  type="number"
                  min={MIN_CHAR_COUNT}
                  max={MAX_CHAR_COUNT}
                  step={CHAR_STEP}
                  value={charCount}
                  onChange={event => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) {
                      return;
                    }
                    setCharCount(Math.min(Math.max(next, MIN_CHAR_COUNT), MAX_CHAR_COUNT));
                  }}
                  className="w-24 text-center font-medium"
                />
              </div>
              <p className="text-xs text-muted-foreground">100~1500자 범위에서 선택하세요. 기본값 500자.</p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-5 py-4 shadow-sm md:col-span-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">소라2 ver</p>
                <p className="text-xs text-muted-foreground">소라2 지향 출력 (기본 ON)</p>
              </div>
              <Switch checked={soraEnabled} onCheckedChange={setSoraEnabled} aria-label="소라2 모드" />
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-semibold">템플릿 모드</Label>
              <ToggleGroup
                type="single"
                value={soraTemplateMode}
                onValueChange={value => setSoraTemplateMode((value as typeof soraTemplateMode) || soraTemplateMode)}
                className="flex gap-2"
                aria-label="Sora 템플릿 모드"
              >
                <ToggleGroupItem value="concise" className="flex-1 font-medium">간결형</ToggleGroupItem>
                <ToggleGroupItem value="detailed" className="flex-1 font-medium">디테일형</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-5 py-4 shadow-sm">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">애니메이션 헤더 고정</p>
                <p className="text-xs text-muted-foreground">anime cel-shade 고정 한 줄(기본 OFF)</p>
              </div>
              <Switch checked={animeHeader} onCheckedChange={setAnimeHeader} aria-label="애니메이션 헤더" />
            </div>

            {/* Sora 상세 옵션 */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm font-semibold">Sora 상세 옵션</Label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Format & Look</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={formatLook}
                    onChange={e => setFormatLook(e.target.value)}
                  >
                    {FORMAT_LOOK_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Lenses & Filtration</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={lensesFiltration}
                    onChange={e => setLensesFiltration(e.target.value)}
                  >
                    {LENSES_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Grade/Palette</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={gradePalette}
                    onChange={e => setGradePalette(e.target.value)}
                  >
                    {GRADE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Lighting & Atmosphere</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={lightingAtmosphere}
                    onChange={e => setLightingAtmosphere(e.target.value)}
                  >
                    {LIGHTING_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Location & Framing</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={locationFraming}
                    onChange={e => setLocationFraming(e.target.value)}
                  >
                    {LOCATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Wardrobe/Props/Extras</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={wardrobePropsExtras}
                    onChange={e => setWardrobePropsExtras(e.target.value)}
                  >
                    {WARDROBE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Sound</Label>
                  <select className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm"
                    value={sound}
                    onChange={e => setSound(e.target.value)}
                  >
                    {SOUND_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">각 항목은 '자동' 또는 '없음'을 선택할 수 있고, 제시된 예시를 사용할 수 있습니다.</p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold" htmlFor="bgm-mode">
                배경음악
              </Label>
              <select
                id="bgm-mode"
                value={bgmMode}
                onChange={event => setBgmMode(event.target.value as typeof bgmMode)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="auto">자동 생성 (스타일 프리셋)</option>
                <option value="none">없음</option>
              </select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold" htmlFor="sfx-mode">
                효과음 프리셋
              </Label>
              <select
                id="sfx-mode"
                value={sfxMode}
                onChange={event => setSfxMode(event.target.value as typeof sfxMode)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="auto">자동 생성 (씬별 효과음 / 스타일 프리셋)</option>
                <option value="none">없음</option>
              </select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold" htmlFor="voice-mode">
                보이스 톤
              </Label>
              <select
                id="voice-mode"
                value={voiceMode}
                onChange={event => setVoiceMode(event.target.value as typeof voiceMode)}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="auto">자동 추천 (스타일 프리셋)</option>
                <option value="none">없음</option>
              </select>
            </div>
          </section>

          {error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              16:9, 24fps, 1920x1080 포맷은 고정이며 선택한 옵션에 맞춰 결과가 생성됩니다.
            </p>
            <Button onClick={handleGenerate} disabled={loading} size="lg" className="font-semibold">
              {loading ? "생성 중..." : "스토리보드 생성"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-6">
          <CardTitle className="text-xl font-semibold">생성 결과</CardTitle>
          {result ? (
            <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wide">
              {result.format === "json" ? "JSON" : "자연어"}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {result ? (
            <>
              {result.format === "json" ? (
                <ScrollArea className="h-[500px] w-full rounded-xl border border-border/50 bg-muted/40 p-6 text-sm shadow-inner">
                  <pre className="whitespace-pre-wrap text-left font-mono text-muted-foreground">
                    {JSON.stringify(result.storyboard, null, 2)}
                  </pre>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-[500px] w-full rounded-xl border border-border/50 bg-muted/40 p-6 text-sm shadow-inner">
                  <div className="whitespace-pre-wrap text-left leading-relaxed text-muted-foreground">
                    {result.text}
                  </div>
                </ScrollArea>
              )}

              <div className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 p-5 shadow-sm">
                <p className="text-sm font-semibold text-foreground mb-3">오디오 설정</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="font-medium min-w-[100px]">배경음악:</span>
                    <span>{result.audio.bgm ?? "없음"}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium min-w-[100px]">효과음 프리셋:</span>
                    <span>{result.audio.sfx.length ? result.audio.sfx.join(", ") : "없음"}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium min-w-[100px]">보이스 톤:</span>
                    <span>{result.audio.vo_tone ?? "없음"}</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/30 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                결과는 이곳에 표시됩니다. 옵션을 설정하고 생성 버튼을 눌러보세요.
              </p>
            </div>
          )}
          {result ? (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">
                문자수: {renderedText.length.toLocaleString()}
              </span>
              <Button size="default" variant="outline" onClick={handleCopy} className="font-medium">
                {result.format === "json" ? "JSON 복사" : "텍스트 복사"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>

    {showScrollTop && (
      <button
        onClick={scrollToTop}
        className="fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-card/95 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-xl hover:bg-primary hover:text-primary-foreground"
        aria-label="맨 위로 이동"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    )}
    </>
  );
}
