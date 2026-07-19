"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";
import { ImageIcon, Loader2, Sparkles, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { loadCharacters, type Character } from "@/lib/characters";
import type { MotionActionPreset } from "@/lib/motion/prompt";
import type { MotionProject } from "@/lib/motion/types";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACTION_OPTIONS: { value: MotionActionPreset; label: string }[] = [
  { value: "walk", label: "걷기" },
  { value: "run", label: "달리기" },
  { value: "idle", label: "대기" },
  { value: "jump", label: "점프" },
  { value: "attack", label: "공격" },
  { value: "custom", label: "직접 입력" }
];

type MotionCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (project: MotionProject) => void | Promise<void>;
};

function responseReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "reason" in body) {
    const reason = (body as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return fallback;
}

export function MotionCreateDialog({ open, onClose, onCreated }: MotionCreateDialogProps) {
  const [name, setName] = useState("새 모션");
  const [sourceType, setSourceType] = useState<"reference" | "generate" | "upload">("reference");
  const [prompt, setPrompt] = useState("");
  const [referencePrompt, setReferencePrompt] = useState("");
  const [referenceAction, setReferenceAction] = useState<MotionActionPreset>("walk");
  const [referenceImage, setReferenceImage] = useState("");
  const [referencePreview, setReferencePreview] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadDataUrl, setUploadDataUrl] = useState("");
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(2);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open) setCharacters(loadCharacters());
  }, [open]);

  if (!open) return null;

  const handleReferenceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("PNG 또는 JPEG 파일만 참조할 수 있습니다.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("참조 이미지는 20MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        toast.error("참조 이미지를 읽지 못했습니다.");
        return;
      }
      setReferenceImage(reader.result);
      setReferencePreview(reader.result);
      setReferenceName(file.name);
      setSelectedCharacterId("");
    };
    reader.onerror = () => toast.error("참조 이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("PNG 또는 JPEG 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("업로드 파일은 20MB 이하여야 합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        toast.error("이미지 파일을 읽지 못했습니다.");
        return;
      }
      setUploadName(file.name);
      setUploadDataUrl(reader.result);
    };
    reader.onerror = () => toast.error("이미지 파일을 읽지 못했습니다.");
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const normalizedCols = Math.max(1, Math.floor(cols));
    const normalizedRows = Math.max(1, Math.floor(rows));
    if (!trimmedName) {
      toast.error("모션 이름을 입력해주세요.");
      return;
    }
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      toast.error("격자 열과 행은 1 이상의 정수여야 합니다.");
      return;
    }
    if (sourceType === "generate" && !prompt.trim()) {
      toast.error("생성할 동작을 설명해주세요.");
      return;
    }
    if (sourceType === "reference" && !referenceImage) {
      toast.error("참조 이미지를 선택해주세요.");
      return;
    }
    if (sourceType === "reference" && !referencePrompt.trim()) {
      toast.error("참조 캐릭터가 수행할 동작을 설명해주세요.");
      return;
    }
    if (sourceType === "upload" && !uploadDataUrl) {
      toast.error("업로드할 PNG 또는 JPEG 파일을 선택해주세요.");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/motion/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          grid: {
            cols: normalizedCols,
            rows: normalizedRows,
            gutter: 0,
            remainderPolicy: "distribute"
          },
          source:
            sourceType === "reference"
              ? {
                  type: "reference",
                  prompt: referencePrompt.trim(),
                  action: referenceAction,
                  referenceImage
                }
              : sourceType === "generate"
              ? { type: "generate", prompt: prompt.trim() }
              : { type: "upload", dataUrl: uploadDataUrl }
        })
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; project?: MotionProject; reason?: string }
        | null;
      if (!response.ok || body?.ok !== true || !body.project) {
        throw new Error(responseReason(body, "모션을 만들지 못했습니다."));
      }
      await onCreated(body.project);
      toast.success("새 모션을 만들었습니다.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "모션을 만들지 못했습니다.");
    } finally {
      setIsCreating(false);
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
      <Card className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xl">새 모션</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isCreating} aria-label="닫기">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="motion-name">이름</Label>
            <Input
              id="motion-name"
              value={name}
              maxLength={200}
              disabled={isCreating}
              onChange={event => setName(event.target.value)}
            />
          </div>

          <Tabs
            value={sourceType}
            onValueChange={value => {
              if (value === "reference" || value === "generate" || value === "upload") {
                setSourceType(value);
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="reference" disabled={isCreating}>
                <ImageIcon className="mr-2 h-4 w-4" aria-hidden />
                참조 이미지
              </TabsTrigger>
              <TabsTrigger value="generate" disabled={isCreating}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                생성
              </TabsTrigger>
              <TabsTrigger value="upload" disabled={isCreating}>
                <Upload className="mr-2 h-4 w-4" aria-hidden />
                업로드
              </TabsTrigger>
            </TabsList>
            <TabsContent value="reference" className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="motion-reference-upload">참조 이미지 파일</Label>
                <Input
                  id="motion-reference-upload"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={isCreating}
                  onChange={handleReferenceFileChange}
                />
                <p className="text-xs text-muted-foreground">{referenceName || "PNG·JPEG, 최대 20MB"}</p>
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
                        disabled={isCreating}
                        aria-pressed={selectedCharacterId === character.id}
                        className={`rounded-md border p-2 text-left transition-colors hover:bg-muted ${
                          selectedCharacterId === character.id ? "border-primary bg-primary/5" : ""
                        }`}
                        onClick={() => {
                          setSelectedCharacterId(character.id);
                          setReferenceImage(character.primaryImageUrl);
                          setReferencePreview(character.thumbnailUrl || character.primaryImageUrl);
                          setReferenceName(character.name);
                        }}
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
                  <div className="min-w-0">
                    <p className="text-sm font-medium">선택한 참조</p>
                    <p className="truncate text-xs text-muted-foreground">{referenceName}</p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>동작 프리셋</Label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="동작 프리셋">
                  {ACTION_OPTIONS.map(option => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={referenceAction === option.value ? "default" : "outline"}
                      disabled={isCreating}
                      aria-pressed={referenceAction === option.value}
                      onClick={() => setReferenceAction(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="motion-reference-prompt">동작 설명</Label>
                <Textarea
                  id="motion-reference-prompt"
                  value={referencePrompt}
                  maxLength={20_000}
                  disabled={isCreating}
                  onChange={event => setReferencePrompt(event.target.value)}
                  placeholder='짧게 써도 됩니다. 예: "천천히 걷는다"'
                />
              </div>
            </TabsContent>
            <TabsContent value="generate" className="space-y-2">
              <Label htmlFor="motion-prompt">동작 설명</Label>
              <Textarea
                id="motion-prompt"
                value={prompt}
                maxLength={20_000}
                disabled={isCreating}
                onChange={event => setPrompt(event.target.value)}
                placeholder="무엇이 어떤 동작을 하는지 자유롭게 설명해주세요."
              />
            </TabsContent>
            <TabsContent value="upload" className="space-y-2">
              <Label htmlFor="motion-upload">스프라이트 시트</Label>
              <Input
                id="motion-upload"
                type="file"
                accept="image/png,image/jpeg"
                disabled={isCreating}
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                {uploadName || "PNG·JPEG, 최대 20MB"}
              </p>
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="motion-cols">열</Label>
              <Input
                id="motion-cols"
                type="number"
                min={1}
                step={1}
                value={cols}
                disabled={isCreating}
                onChange={event => setCols(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motion-rows">행</Label>
              <Input
                id="motion-rows"
                type="number"
                min={1}
                step={1}
                value={rows}
                disabled={isCreating}
                onChange={event => setRows(Number(event.target.value))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            총 {Number.isFinite(cols * rows) && cols > 0 && rows > 0 ? Math.floor(cols) * Math.floor(rows) : 0}프레임
          </p>

          {isCreating ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              <span>시트 생성 중… 최대 3분</span>
            </div>
          ) : null}

          <Button className="w-full" disabled={isCreating} onClick={() => void handleCreate()}>
            {isCreating ? "생성 중…" : "모션 생성"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
