"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { loadCharacters, type Character } from "@/lib/characters";
import {
  MOTION_ACTION_PRESETS,
  motionActionPresetValues,
  type MotionActionPreset
} from "@/lib/motion/prompt";
import { motionSetSchema, type MotionSet, type MotionSetOverrides } from "@/lib/motion/set-types";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACTION_OPTIONS = motionActionPresetValues.map(value => ({
  value,
  ...MOTION_ACTION_PRESETS[value]
}));

type MotionSetDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (set: MotionSet) => void | Promise<void>;
};

type MemberDraft = {
  cols: string;
  rows: string;
  fps: string;
  loop: MotionSetOverrides["loop"] | "";
  prompt: string;
};

const EMPTY_MEMBER_DRAFT: MemberDraft = {
  cols: "",
  rows: "",
  fps: "",
  loop: "",
  prompt: ""
};

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

function parseBoundedInteger(value: string, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("참조 이미지를 읽지 못했습니다."));
      }
    };
    reader.onerror = () => reject(new Error("참조 이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

function validateReferenceImage(blob: Blob): void {
  if (blob.type !== "image/png" && blob.type !== "image/jpeg") {
    throw new Error("PNG 또는 JPEG 파일만 참조할 수 있습니다.");
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("참조 이미지는 20MB 이하여야 합니다.");
  }
}

export function MotionSetDialog({ open, onClose, onCreated }: MotionSetDialogProps) {
  const [name, setName] = useState("새 모션 세트");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [facing, setFacing] = useState<"right" | "left">("right");
  const [allowMirror, setAllowMirror] = useState(true);
  const [subjectType, setSubjectType] = useState<"character" | "object">("character");
  const [common, setCommon] = useState({ cols: "4", rows: "2", fps: "12" });
  const [selectedActions, setSelectedActions] = useState<MotionActionPreset[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<Partial<Record<MotionActionPreset, MemberDraft>>>({});
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referencePreview, setReferencePreview] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const referenceRequestRef = useRef(0);
  const openRef = useRef(open);
  const mountedRef = useRef(true);

  openRef.current = open;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      referenceRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    referenceRequestRef.current += 1;
    if (open) {
      setCharacters(loadCharacters());
    } else {
      setIsLoadingReference(false);
      setIsCreating(false);
    }
  }, [open]);

  if (!open) return null;

  const updateMember = (action: MotionActionPreset, patch: Partial<MemberDraft>) => {
    setMemberDrafts(current => ({
      ...current,
      [action]: { ...(current[action] ?? EMPTY_MEMBER_DRAFT), ...patch }
    }));
  };

  const toggleAction = (action: MotionActionPreset, checked: boolean) => {
    setSelectedActions(current => {
      if (checked) return motionActionPresetValues.filter(value => value === action || current.includes(value));
      return current.filter(value => value !== action);
    });
  };

  const setReferenceFromBlob = async (
    blob: Blob,
    source: { name: string; characterId?: string },
    requestId: number
  ) => {
    validateReferenceImage(blob);
    const dataUrl = await readBlobAsDataUrl(blob);
    if (referenceRequestRef.current !== requestId || !openRef.current || !mountedRef.current) return;
    setReferenceImage(dataUrl);
    setReferencePreview(dataUrl);
    setReferenceName(source.name);
    setSelectedCharacterId(source.characterId ?? "");
  };

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const requestId = ++referenceRequestRef.current;
    setIsLoadingReference(true);
    void setReferenceFromBlob(file, { name: file.name }, requestId)
      .catch(error => {
        if (referenceRequestRef.current === requestId && openRef.current && mountedRef.current) {
          toast.error(error instanceof Error ? error.message : "참조 이미지를 읽지 못했습니다.");
        }
      })
      .finally(() => {
        if (referenceRequestRef.current === requestId && openRef.current && mountedRef.current) setIsLoadingReference(false);
      });
  };

  const handleCharacterSelect = (character: Character) => {
    const requestId = ++referenceRequestRef.current;
    setIsLoadingReference(true);
    void (async () => {
      const response = await fetch(character.primaryImageUrl);
      if (!response.ok) throw new Error("캐릭터 이미지를 불러오지 못했습니다.");
      await setReferenceFromBlob(await response.blob(), { name: character.name, characterId: character.id }, requestId);
    })()
      .catch(error => {
        if (referenceRequestRef.current === requestId && openRef.current && mountedRef.current) {
          toast.error(error instanceof Error ? error.message : "캐릭터 이미지를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (referenceRequestRef.current === requestId && openRef.current && mountedRef.current) setIsLoadingReference(false);
      });
  };

  const handleCreate = async () => {
    const parsedCommon = {
      cols: parseBoundedInteger(common.cols, 1, 8),
      rows: parseBoundedInteger(common.rows, 1, 8),
      fps: parseBoundedInteger(common.fps, 1, 60)
    };
    if (!name.trim()) {
      toast.error("세트 이름을 입력해주세요.");
      return;
    }
    if (!description.trim()) {
      toast.error("베이스 설명을 입력해주세요.");
      return;
    }
    if (!parsedCommon.cols || !parsedCommon.rows || !parsedCommon.fps) {
      toast.error("공통 열·행은 1~8, FPS는 1~60의 정수여야 합니다.");
      return;
    }
    if (!selectedActions.length) {
      toast.error("생성할 동작을 하나 이상 선택해주세요.");
      return;
    }

    const members: Array<{
      action: MotionActionPreset;
      prompt?: string;
      overrides?: MotionSetOverrides;
    }> = [];
    for (const action of selectedActions) {
      const draft = memberDrafts[action] ?? EMPTY_MEMBER_DRAFT;
      const parsedCols = draft.cols ? parseBoundedInteger(draft.cols, 1, 8) : undefined;
      const parsedRows = draft.rows ? parseBoundedInteger(draft.rows, 1, 8) : undefined;
      const parsedFps = draft.fps ? parseBoundedInteger(draft.fps, 1, 60) : undefined;
      if ((draft.cols && parsedCols === null) || (draft.rows && parsedRows === null) || (draft.fps && parsedFps === null)) {
        toast.error(`${MOTION_ACTION_PRESETS[action].label} 예외 값이 허용 범위를 벗어났습니다.`);
        return;
      }
      const cols = parsedCols ?? undefined;
      const rows = parsedRows ?? undefined;
      const fps = parsedFps ?? undefined;
      const effectiveCols = cols ?? parsedCommon.cols;
      const effectiveRows = rows ?? parsedCommon.rows;
      if (effectiveCols * effectiveRows > 12) {
        toast.error(`${MOTION_ACTION_PRESETS[action].label}은 열×행이 최대 12장이어야 합니다.`);
        return;
      }
      const prompt = draft.prompt.trim();
      if (action === "custom" && !prompt) {
        toast.error("직접 입력 동작의 설명을 입력해주세요.");
        return;
      }
      const overrides: MotionSetOverrides = {
        ...(cols === undefined ? {} : { cols }),
        ...(rows === undefined ? {} : { rows }),
        ...(fps === undefined ? {} : { fps }),
        ...(draft.loop ? { loop: draft.loop } : {})
      };
      members.push({
        action,
        ...(prompt ? { prompt } : {}),
        ...(Object.keys(overrides).length ? { overrides } : {})
      });
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/motion/sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          base: {
            description: description.trim(),
            ...(style.trim() ? { style: style.trim() } : {}),
            facing,
            allowMirror,
            subjectType,
            ...(selectedCharacterId ? { characterId: selectedCharacterId } : {}),
            ...(referenceImage ? { referenceImage } : {})
          },
          common: parsedCommon,
          members,
          start: true
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; set?: unknown; reason?: string }
        | null;
      const parsedSet = motionSetSchema.safeParse(body?.set);
      if (!response.ok || body?.ok !== true || !parsedSet.success) {
        throw new Error(responseReason(body, "모션 세트를 만들지 못했습니다."));
      }
      if (!mountedRef.current || !openRef.current) return;
      await onCreated(parsedSet.data);
      if (!mountedRef.current || !openRef.current) return;
      toast.success("새 모션 세트를 만들었습니다.");
      onClose();
    } catch (error) {
      if (mountedRef.current && openRef.current) {
        toast.error(error instanceof Error ? error.message : "모션 세트를 만들지 못했습니다.");
      }
    } finally {
      if (mountedRef.current && openRef.current) setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isCreating) onClose();
      }}
    >
      <Card className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xl">새 모션 세트</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isCreating} aria-label="닫기">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="motion-set-name">이름</Label>
            <Input
              id="motion-set-name"
              value={name}
              maxLength={200}
              disabled={isCreating}
              onChange={event => setName(event.target.value)}
            />
          </div>

          <section className="space-y-4 rounded-lg border p-4" aria-labelledby="motion-set-base-title">
            <div>
              <h3 id="motion-set-base-title" className="text-sm font-medium">베이스</h3>
              <p className="mt-1 text-xs text-muted-foreground">모든 동작에 공통으로 적용할 외형과 방향입니다.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motion-set-reference-upload">참조 이미지</Label>
              <Input
                id="motion-set-reference-upload"
                type="file"
                accept="image/png,image/jpeg"
                disabled={isCreating || isLoadingReference}
                onChange={handleReferenceFileChange}
              />
              <p className="text-xs text-muted-foreground">PNG·JPEG, 최대 20MB</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4" aria-hidden />
                또는 캐릭터 라이브러리에서 선택
              </div>
              {characters.length ? (
                <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-4">
                  {characters.map(character => (
                    <button
                      key={character.id}
                      type="button"
                      disabled={isCreating || isLoadingReference}
                      aria-pressed={selectedCharacterId === character.id}
                      className={`rounded-md border p-2 text-left transition-colors hover:bg-muted ${
                        selectedCharacterId === character.id ? "border-primary bg-primary/5" : ""
                      }`}
                      onClick={() => handleCharacterSelect(character)}
                    >
                      <Image
                        src={character.thumbnailUrl || character.primaryImageUrl}
                        alt={character.name}
                        width={96}
                        height={96}
                        unoptimized
                        className="aspect-square w-full rounded object-cover"
                      />
                      <span className="mt-1 block truncate text-xs">{character.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  저장된 캐릭터가 없습니다. 위에서 이미지 파일을 선택할 수 있습니다.
                </p>
              )}
            </div>

            {isLoadingReference ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                참조 이미지를 준비하는 중…
              </div>
            ) : null}
            {referencePreview ? (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Image
                  src={referencePreview}
                  alt="선택한 참조 이미지 미리보기"
                  width={80}
                  height={80}
                  unoptimized
                  className="h-20 w-20 rounded object-cover"
                />
                <p className="min-w-0 truncate text-sm">{referenceName}</p>
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-xs text-amber-700 dark:text-amber-400">
                참조 없이 생성하면 동작 간 외형이 달라질 수 있습니다.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="motion-set-description">설명</Label>
              <Textarea
                id="motion-set-description"
                value={description}
                maxLength={4000}
                disabled={isCreating}
                onChange={event => setDescription(event.target.value)}
                placeholder="캐릭터 또는 오브젝트의 외형과 특징을 설명해주세요."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motion-set-style">화풍 (선택)</Label>
              <Input
                id="motion-set-style"
                value={style}
                maxLength={400}
                disabled={isCreating}
                onChange={event => setStyle(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>기본 방향</Label>
                <ToggleGroup
                  type="single"
                  value={facing}
                  disabled={isCreating}
                  onValueChange={value => {
                    if (value === "right" || value === "left") setFacing(value);
                  }}
                >
                  <ToggleGroupItem value="right">오른쪽</ToggleGroupItem>
                  <ToggleGroupItem value="left">왼쪽</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <Label>피사체 유형</Label>
                <ToggleGroup
                  type="single"
                  value={subjectType}
                  disabled={isCreating}
                  onValueChange={value => {
                    if (value === "character" || value === "object") setSubjectType(value);
                  }}
                >
                  <ToggleGroupItem value="character">캐릭터</ToggleGroupItem>
                  <ToggleGroupItem value="object">오브젝트</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor="motion-set-allow-mirror">좌우 반전 허용</Label>
                <p className="mt-1 text-xs text-muted-foreground">필요할 때 생성 결과를 좌우로 보정합니다.</p>
              </div>
              <Switch
                id="motion-set-allow-mirror"
                checked={allowMirror}
                disabled={isCreating}
                onCheckedChange={setAllowMirror}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border p-4" aria-labelledby="motion-set-common-title">
            <div>
              <h3 id="motion-set-common-title" className="text-sm font-medium">공통 설정</h3>
              <p className="mt-1 text-xs text-muted-foreground">동작별 예외를 비워두면 이 값을 사용합니다.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="motion-set-common-cols">열</Label>
                <Input
                  id="motion-set-common-cols"
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  value={common.cols}
                  disabled={isCreating}
                  onChange={event => setCommon(current => ({ ...current, cols: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="motion-set-common-rows">행</Label>
                <Input
                  id="motion-set-common-rows"
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  value={common.rows}
                  disabled={isCreating}
                  onChange={event => setCommon(current => ({ ...current, rows: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>FPS {common.fps}</Label>
                <Slider
                  min={1}
                  max={60}
                  step={1}
                  value={[parseBoundedInteger(common.fps, 1, 60) ?? 12]}
                  disabled={isCreating}
                  onValueChange={value => setCommon(current => ({ ...current, fps: String(value[0] ?? 12) }))}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="motion-set-actions-title">
            <div>
              <h3 id="motion-set-actions-title" className="text-sm font-medium">생성할 동작</h3>
              <p className="mt-1 text-xs text-muted-foreground">하나 이상 선택하고 필요한 동작만 예외를 설정하세요.</p>
            </div>
            <div className="space-y-3">
              {ACTION_OPTIONS.map(option => {
                const checked = selectedActions.includes(option.value);
                const draft = memberDrafts[option.value] ?? EMPTY_MEMBER_DRAFT;
                return (
                  <Card key={option.value} className={checked ? "border-primary bg-primary/5" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <input
                          id={`motion-set-action-${option.value}`}
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-primary"
                          checked={checked}
                          disabled={isCreating}
                          onChange={event => toggleAction(option.value, event.target.checked)}
                        />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`motion-set-action-${option.value}`} className="cursor-pointer">
                            {option.label}
                          </Label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {option.defaultLoop === "loop" ? "반복" : "단발"} · 권장 {option.recommendedFrames}장
                          </p>
                        </div>
                        {checked ? <Badge variant="secondary">선택됨</Badge> : null}
                      </div>

                      {checked && option.value === "custom" ? (
                        <div className="mt-4 space-y-2">
                          <Label htmlFor="motion-set-custom-prompt">동작 설명</Label>
                          <Textarea
                            id="motion-set-custom-prompt"
                            value={draft.prompt}
                            maxLength={4000}
                            disabled={isCreating}
                            onChange={event => updateMember("custom", { prompt: event.target.value })}
                            placeholder="직접 만들 동작을 설명해주세요."
                          />
                        </div>
                      ) : null}

                      {checked ? (
                        <details className="mt-4 rounded-md border bg-background/60 p-3">
                          <summary className="cursor-pointer text-sm font-medium">예외 설정</summary>
                          <div className="mt-4 space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <Label htmlFor={`motion-set-${option.value}-cols`}>열</Label>
                                <Input
                                  id={`motion-set-${option.value}-cols`}
                                  type="number"
                                  min={1}
                                  max={8}
                                  placeholder="공통"
                                  value={draft.cols}
                                  disabled={isCreating}
                                  onChange={event => updateMember(option.value, { cols: event.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`motion-set-${option.value}-rows`}>행</Label>
                                <Input
                                  id={`motion-set-${option.value}-rows`}
                                  type="number"
                                  min={1}
                                  max={8}
                                  placeholder="공통"
                                  value={draft.rows}
                                  disabled={isCreating}
                                  onChange={event => updateMember(option.value, { rows: event.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`motion-set-${option.value}-fps`}>FPS</Label>
                                <Input
                                  id={`motion-set-${option.value}-fps`}
                                  type="number"
                                  min={1}
                                  max={60}
                                  placeholder="공통"
                                  value={draft.fps}
                                  disabled={isCreating}
                                  onChange={event => updateMember(option.value, { fps: event.target.value })}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>재생 방식</Label>
                              <ToggleGroup
                                type="single"
                                value={draft.loop}
                                disabled={isCreating}
                                onValueChange={value => {
                                  if (value === "" || value === "loop" || value === "pingpong" || value === "once") {
                                    updateMember(option.value, { loop: value });
                                  }
                                }}
                              >
                                <ToggleGroupItem value="loop">반복</ToggleGroupItem>
                                <ToggleGroupItem value="pingpong">왕복</ToggleGroupItem>
                                <ToggleGroupItem value="once">단발</ToggleGroupItem>
                              </ToggleGroup>
                              <p className="text-xs text-muted-foreground">선택하지 않으면 프리셋 기본값을 사용합니다.</p>
                            </div>
                            {option.value !== "custom" ? (
                              <div className="space-y-2">
                                <Label htmlFor={`motion-set-${option.value}-prompt`}>동작 설명 문장 (선택)</Label>
                                <Textarea
                                  id={`motion-set-${option.value}-prompt`}
                                  value={draft.prompt}
                                  maxLength={4000}
                                  disabled={isCreating}
                                  onChange={event => updateMember(option.value, { prompt: event.target.value })}
                                />
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <Button className="w-full" disabled={isCreating || isLoadingReference} onClick={() => void handleCreate()}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-2 h-4 w-4" aria-hidden />}
            {isCreating ? "세트 생성 중…" : "모션 세트 생성"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
