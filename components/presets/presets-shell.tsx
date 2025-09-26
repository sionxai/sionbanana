"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import { callGenerateApi } from "@/hooks/use-generate-image";
import type { AspectRatioPreset, GeneratedImageDocument, GenerationMode } from "@/lib/types";
import { DEFAULT_ASPECT_RATIO, getAspectRatioDimensions, getAspectRatioLabel } from "@/lib/aspect";
import { APERTURE_DEFAULT, formatAperture } from "@/lib/camera";
import { deleteGeneratedImageDoc, saveGeneratedImageDoc, updateGeneratedImageDoc } from "@/lib/firebase/firestore";
import { deleteUserImage, uploadUserImage } from "@/lib/firebase/storage";
import { shouldUseFirestore } from "@/lib/env";
import {
  CHARACTER_BASE_PROMPT_FALLBACK,
  CHARACTER_NEGATIVE_ENFORCEMENT,
  CHARACTER_SINGLE_VIEW_GUIDELINE,
  CHARACTER_VIEWS,
  TURNAROUND_BASE_PROMPT_FALLBACK,
  TURNAROUND_NEGATIVE_ENFORCEMENT,
  TURNAROUND_SINGLE_VIEW_GUIDELINE,
  TURNAROUND_VIEWS
} from "@/components/studio/preset-config";
import {
  INITIAL_REFERENCE_SLOT_COUNT,
  LOCAL_STORAGE_KEY,
  MAX_REFERENCE_SLOT_COUNT,
  REFERENCE_GALLERY_STORAGE_KEY,
  REFERENCE_IMAGE_DOC_ID,
  ReferenceSlotState,
  createReferenceSlot
} from "@/components/studio/constants";
import type { ViewSpec } from "@/components/studio/types";
import {
  REFERENCE_SYNC_EVENT,
  REFERENCE_SYNC_STORAGE_KEY,
  broadcastReferenceUpdate,
  readStoredReference,
  type ReferenceSyncPayload
} from "@/components/studio/reference-sync";
import { HISTORY_SYNC_EVENT, broadcastHistoryUpdate, mergeHistoryRecords, type HistorySyncPayload } from "@/components/studio/history-sync";
import { cn } from "@/lib/utils";
import { Download, Image as ImageIcon, Sparkles, Stars, Zap } from "lucide-react";

const PHOTO_DUMP_VIEWS: ViewSpec[] = [
  { id: "style-film", label: "필름 감성", instruction: "Apply warm film photography look with subtle grain and soft highlights" },
  { id: "style-vintage", label: "빈티지", instruction: "Vintage portrait with muted colors and gentle vignetting" },
  { id: "style-anime", label: "애니메", instruction: "High-quality anime illustration style, cel shading" },
  { id: "style-comic", label: "코믹", instruction: "Bold comic-book ink lines with halftone shading" },
  { id: "style-oil", label: "유화", instruction: "Oil painting on canvas, expressive brush strokes" },
  { id: "style-watercolor", label: "수채화", instruction: "Delicate watercolor illustration with soft edges" },
  { id: "style-pencil", label: "연필 스케치", instruction: "Detailed pencil sketch with cross-hatching" },
  { id: "style-synthwave", label: "신스웨이브", instruction: "Synthwave neon lighting with magenta and cyan palette" },
  { id: "style-cyberpunk", label: "사이버펑크", instruction: "Cyberpunk city lighting, neon reflections" },
  { id: "style-fantasy", label: "판타지", instruction: "High fantasy painting with dramatic lighting" },
  { id: "style-sci-fi", label: "SF", instruction: "Futuristic sci-fi render with holographic overlays" },
  { id: "style-fashion", label: "패션 화보", instruction: "Editorial fashion photoshoot lighting" },
  { id: "style-blackwhite", label: "흑백", instruction: "High contrast black and white portrait" },
  { id: "style-highkey", label: "하이키", instruction: "High-key studio lighting with bright background" },
  { id: "style-lowkey", label: "로우키", instruction: "Low-key moody lighting with strong shadows" },
  { id: "style-pastel", label: "파스텔", instruction: "Pastel color palette with soft gradients" },
  { id: "style-popart", label: "팝아트", instruction: "Pop art with bold flat colors and graphic outlines" },
  { id: "style-80s", label: "80's", instruction: "1980s retro portrait with film grain" },
  { id: "style-90s", label: "90's", instruction: "1990s magazine cover aesthetic" },
  { id: "style-desert", label: "사막톤", instruction: "Golden desert color grading with warm highlights" },
  { id: "style-winter", label: "윈터", instruction: "Cool winter palette with soft blues" },
  { id: "style-forest", label: "포레스트", instruction: "Forest-inspired greens with dappled light" },
  { id: "style-portrait-studio", label: "스튜디오", instruction: "Classic studio portrait with beauty dish lighting" },
  { id: "style-hdr", label: "HDR", instruction: "High dynamic range portrait with crisp details" },
  { id: "style-bokeh", label: "보케", instruction: "Shallow depth-of-field with large bokeh highlights" },
  { id: "style-cinematic", label: "시네마틱", instruction: "Cinematic lighting with anamorphic flares" }
];

const PHOTO_DUMP_VARIATION_VIEWS: ViewSpec[] = [
  {
    id: "dynamic-look-01",
    label: "룩 01",
    instruction:
      "Keep the character identity but switch to a casual street outfit, wind-swept hair, lively mid-step pose, cheerful smile, neon night backdrop"
  },
  {
    id: "dynamic-look-02",
    label: "룩 02",
    instruction:
      "Keep the identity while showcasing a formal suit, slicked-back hair, confident stance with hands in pockets, composed expression, modern office interior"
  },
  {
    id: "dynamic-look-03",
    label: "룩 03",
    instruction:
      "Maintain likeness wearing sporty activewear, high ponytail, dynamic running pose, focused expression, sunrise park background"
  },
  {
    id: "dynamic-look-04",
    label: "룩 04",
    instruction:
      "Preserve identity in a flowing evening dress, loose curls, gentle spin pose, joyful laugh, gala ballroom setting"
  },
  {
    id: "dynamic-look-05",
    label: "룩 05",
    instruction:
      "Retain facial features with edgy leather outfit, asymmetrical haircut, leaning forward pose, intense gaze, cyberpunk alley backdrop"
  },
  {
    id: "dynamic-look-06",
    label: "룩 06",
    instruction:
      "Keep the character recognizable in cozy knitwear, messy bun, seated relaxed pose, warm smile, rustic coffee shop interior"
  },
  {
    id: "dynamic-look-07",
    label: "룩 07",
    instruction:
      "Maintain identity wearing summer resort attire, wavy hair, playful jumping pose, laughing expression, tropical beach at golden hour"
  },
  {
    id: "dynamic-look-08",
    label: "룩 08",
    instruction:
      "Keep likeness with futuristic techwear, sleek bob haircut, action-ready stance, serious expression, holographic city plaza"
  },
  {
    id: "dynamic-look-09",
    label: "룩 09",
    instruction:
      "Preserve the face in bohemian outfit, braided hair, gentle hand-on-chest pose, serene smile, sunlit field of flowers"
  },
  {
    id: "dynamic-look-10",
    label: "룩 10",
    instruction:
      "Maintain character identity in winter coat and scarf, tousled hair with snowflakes, mid-stride pose, surprised expression, snow-covered city street"
  },
  {
    id: "dynamic-look-11",
    label: "룩 11",
    instruction:
      "Keep the same face with stage performance outfit, voluminous hairstyle, microphone-in-hand pose, energetic expression, concert lights background"
  },
  {
    id: "dynamic-look-12",
    label: "룩 12",
    instruction:
      "Retain identity wearing minimalist monochrome fashion, sleek straight hair, seated profile pose, calm expression, modern art gallery backdrop"
  }
];

const TILE_LIMIT = 24;
const FOUR_THREE_RATIO_CLASS = "aspect-[4/3]";
const PRESET_ACTION_MODE: GenerationMode = "create";

async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("파일을 읽을 수 없습니다."));
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    reader.readAsDataURL(file);
  });
}

const EMOTION_STUDY_VIEWS: ViewSpec[] = [
  {
    id: "emotion-joyful",
    label: "기쁜 웃음",
    instruction:
      "Maintain the exact character likeness and pose while lifting the cheeks into a radiant joyful smile, eyes sparkling with happiness."
  },
  {
    id: "emotion-serious",
    label: "진지함",
    instruction:
      "Keep the same composition and outfit while transitioning facial muscles into a composed, serious expression with focused eyes and a firm mouth."
  },
  {
    id: "emotion-surprised",
    label: "놀란",
    instruction:
      "Preserve the pose but widen the eyes and slightly open the mouth to convey a natural look of surprise without exaggerating the features."
  },
  {
    id: "emotion-confident",
    label: "자신감",
    instruction:
      "Hold the current framing while adding a subtle confident smirk, lifted chin, and steady gaze that communicates assurance."
  },
  {
    id: "emotion-shy",
    label: "수줍은",
    instruction:
      "Maintain the pose while softening the eyes, adding a gentle closed-lip smile, and a slight head tilt that feels shy yet endearing."
  },
  {
    id: "emotion-thoughtful",
    label: "사색적인/명상적인",
    instruction:
      "Keep the same posture while relaxing the face into a contemplative, meditative expression with softened gaze and calm breathing."
  },
  {
    id: "emotion-peaceful",
    label: "평화로운",
    instruction:
      "Preserve the original stance while presenting a serene, peaceful expression with relaxed eyelids and a faint content smile."
  },
  {
    id: "emotion-blank",
    label: "멍한",
    instruction:
      "Keep all body details identical while loosening the facial muscles into a spaced-out, absent-minded stare with parted lips."
  },
  {
    id: "emotion-playful",
    label: "장난스러움",
    instruction:
      "Maintain the same pose and lighting while adding a mischievous grin, raised eyebrow, and lively eyes that suggest playfulness."
  },
  {
    id: "emotion-angry",
    label: "화난",
    instruction:
      "Preserve the framing while knitting the brows, tightening the jaw, and narrowing the eyes to portray a controlled, angry glare."
  },
  {
    id: "emotion-afraid",
    label: "두려워하는",
    instruction:
      "Keep the body unchanged while widening the eyes, tensing the lips, and adding subtle brow lift to communicate fear or anxiety."
  },
  {
    id: "emotion-ecstatic",
    label: "황홀한/결연한",
    instruction:
      "Retain the pose while brightening the face with an awe-struck, ecstatic glow and resolute gaze that feels inspired and determined."
  }
];

function dataUrlToBlob(dataUrl: string) {
  return fetch(dataUrl).then(res => res.blob());
}

interface RunBatchOptions {
  views: ViewSpec[];
  batchLabel: string;
  basePrompt: string;
  singleViewGuideline: string;
  negativePrompt: string;
  referenceImageForRequest: string | null;
  uniqueGalleryReferences: string[];
  aspectRatioValue: AspectRatioPreset;
  aspectRatioLabel: string;
  shouldApplyAspectRatio: boolean;
  actionLabel: string;
  targetModel: string;
  setPending: (value: boolean) => void;
  cameraPayload: { angle?: string; aperture: string };
  apertureLabel: string;
  effectiveCameraAngle: string | undefined;
  mergeLocalRecord: (
    record: GeneratedImageDocument,
    options?: { promoteToReference?: boolean; broadcast?: boolean }
  ) => void;
  referenceRecord: GeneratedImageDocument | null;
  referenceMetadata: { referenceId?: string | null };
  fallbackCandidate: GeneratedImageDocument | null;
  user: ReturnType<typeof useAuth>["user"];
  shouldUseFirestore: boolean;
  onProgress?: (view: ViewSpec, index: number, total: number) => void;
  onResult?: (view: ViewSpec, index: number, total: number, outcome: "success" | "error") => void;
  interRequestDelayMs?: number;
  cancelRef?: MutableRefObject<boolean>;
  onCancelled?: () => void;
}

async function runBatchSequence(options: RunBatchOptions) {
  const {
    views,
    batchLabel,
    basePrompt,
    singleViewGuideline,
    negativePrompt,
    referenceImageForRequest,
    uniqueGalleryReferences,
    aspectRatioValue,
    aspectRatioLabel,
    shouldApplyAspectRatio,
    actionLabel,
    targetModel,
    setPending,
    cameraPayload,
    apertureLabel,
    effectiveCameraAngle,
    mergeLocalRecord,
    referenceRecord,
    referenceMetadata,
    fallbackCandidate,
    user,
    shouldUseFirestore,
    onProgress,
    onResult,
    interRequestDelayMs = 1500,
    cancelRef,
    onCancelled
  } = options;

  const targetDimensions = shouldApplyAspectRatio ? getAspectRatioDimensions(aspectRatioValue) : null;

  setPending(true);
  let successCount = 0;
  let cancelled = false;

  try {
    for (let index = 0; index < views.length; index++) {
      if (cancelRef?.current) {
        cancelled = true;
        onCancelled?.();
        break;
      }

      const view = views[index];
      onProgress?.(view, index, views.length);

      const viewInstructionSegments = [
        `${view.instruction}.`,
        singleViewGuideline,
        "Keep design consistent with the supplied references. Background must be pure white, even lighting."
      ];
      const viewPrompt = `${basePrompt}
${viewInstructionSegments.join(" ")}`;

      const generationOptions: Record<string, unknown> = {
        action: actionLabel,
        model: targetModel,
        outputMimeType: "image/png",
        characterView: view.id,
        characterViewLabel: view.label
      };
      if (referenceImageForRequest) {
        generationOptions.referenceImageUrl = referenceImageForRequest;
      }
      if (shouldApplyAspectRatio) {
        generationOptions.aspectRatio = aspectRatioValue;
      }
      if (uniqueGalleryReferences.length) {
        generationOptions.referenceGallery = uniqueGalleryReferences;
      }
      if (targetDimensions) {
        generationOptions.dimensions = targetDimensions;
      }

      let result;
      try {
        result = await callGenerateApi({
          prompt: basePrompt,
          refinedPrompt: viewPrompt,
          negativePrompt,
          mode: PRESET_ACTION_MODE,
          camera: cameraPayload,
          options: generationOptions
        });
      } catch (error) {
        console.error("preset view request failed", view.id, error);
        toast.error(`${view.label} 뷰 생성 실패`, {
          description: "네트워크 환경을 확인한 후 다시 시도해주세요."
        });
        onResult?.(view, index, views.length, "error");
        if (cancelRef?.current) {
          cancelled = true;
          onCancelled?.();
          break;
        }
        continue;
      }

      if (!result.ok) {
        toast.error(`${view.label} 뷰 생성 실패`, {
          description: result.reason ?? "잠시 후 다시 시도해주세요."
        });
        onResult?.(view, index, views.length, "error");
        if (cancelRef?.current) {
          cancelled = true;
          onCancelled?.();
          break;
        }
        continue;
      }

      const baseImage = result.base64Image ?? result.imageUrl;
      if (!baseImage) {
        toast.error(`${view.label} 뷰 생성 실패`, {
          description: "이미지 데이터를 찾을 수 없습니다."
        });
        onResult?.(view, index, views.length, "error");
        if (cancelRef?.current) {
          cancelled = true;
          onCancelled?.();
          break;
        }
        continue;
      }

      let storedImageUrl = baseImage;
      const beforeUrl = referenceImageForRequest ?? undefined;

      const referenceSourceId = referenceRecord
        ? referenceMetadata.referenceId ?? (referenceRecord.id !== REFERENCE_IMAGE_DOC_ID ? referenceRecord.id : null)
        : fallbackCandidate?.id ?? null;

      const metadataPayload: Record<string, unknown> = {
        action: `${actionLabel}-${view.id}`,
        referenceId: referenceSourceId,
        characterView: view.id,
        characterViewLabel: view.label,
        cameraAperture: apertureLabel,
        cameraAngle: effectiveCameraAngle,
        aspectRatio: aspectRatioLabel,
        sequenceIndex: index + 1,
        sequenceTotal: views.length
      };

      if (shouldUseFirestore && user) {
        try {
          const blob = storedImageUrl.startsWith("data:")
            ? await dataUrlToBlob(storedImageUrl)
            : await fetch(storedImageUrl).then(res => res.blob());
          const uploadResult = await uploadUserImage(user.uid, `${actionLabel}-${view.id}-${Date.now()}`, blob);
          storedImageUrl = uploadResult.url;
        } catch (error) {
          console.error("preset upload error", error);
        }
      }

      const now = new Date().toISOString();
      const newRecord: GeneratedImageDocument = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${actionLabel}-${view.id}-${Date.now()}`,
        userId: user?.uid ?? "local",
        mode: PRESET_ACTION_MODE,
        promptMeta: {
          rawPrompt: basePrompt,
          refinedPrompt: viewPrompt,
          negativePrompt,
          camera: cameraPayload,
          aspectRatio: aspectRatioValue,
          referenceGallery: uniqueGalleryReferences
        },
        status: "completed",
        imageUrl: storedImageUrl,
        thumbnailUrl: storedImageUrl,
        originalImageUrl: beforeUrl ?? storedImageUrl,
        diff: beforeUrl
          ? {
              beforeUrl,
              afterUrl: storedImageUrl,
              sliderLabelBefore: "기준 이미지",
              sliderLabelAfter: "생성 결과"
            }
          : undefined,
        metadata: metadataPayload,
        model: targetModel,
        createdAt: now,
        updatedAt: now
      };

      mergeLocalRecord(newRecord, { promoteToReference: false, broadcast: false });
      successCount += 1;
      onResult?.(view, index, views.length, "success");

      if (cancelRef?.current) {
        cancelled = true;
        onCancelled?.();
        break;
      }

      if (interRequestDelayMs > 0 && index < views.length - 1) {
        await new Promise(resolve => setTimeout(resolve, interRequestDelayMs));
        if (cancelRef?.current) {
          cancelled = true;
          onCancelled?.();
          break;
        }
      }
    }

    if (cancelled) {
      toast.info(`${batchLabel} 작업을 중지했습니다.`);
    } else if (successCount === 0) {
      toast.error(`${batchLabel} 생성에 실패했습니다.`);
    } else {
      toast.success(`${batchLabel} ${successCount}장 생성 완료`);
    }
  } finally {
    setPending(false);
    if (cancelRef) {
      cancelRef.current = false;
    }
  }
}


export function PresetsShell() {
  const { user } = useAuth();
  const router = useRouter();
  const { records, loading } = useGeneratedImages();
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [referenceSlots, setReferenceSlots] = useState<ReferenceSlotState[]>(() =>
    Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot())
  );
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<GeneratedImageDocument | null>(null);
  const [referenceImageUploading, setReferenceImageUploading] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const historySyncSourceRef = useRef<string | null>(null);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  // Clear local history/reference caches on user change to prevent cross-account leakage
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const prevUid = lastUidRef.current;
    const shouldReset = Boolean(prevUid && prevUid !== currentUid);

    if (shouldReset) {
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_GALLERY_STORAGE_KEY);
        window.localStorage.removeItem(REFERENCE_SYNC_STORAGE_KEY);
      } catch {}
      setLocalRecords([]);
      setSelectedImageId(null);
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
      broadcastReferenceUpdate(null, "presets");
    }

    if (!currentUid && prevUid) {
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }

    lastUidRef.current = currentUid;
  }, [user?.uid]);


  const cameraAngle = undefined;
  const apertureLabel = formatAperture(APERTURE_DEFAULT);
  const aspectRatioValue = DEFAULT_ASPECT_RATIO;
  const shouldApplyAspectRatio = false;
  const aspectRatioLabel = getAspectRatioLabel(aspectRatioValue);
  const cameraPayload = { aperture: apertureLabel } as { angle?: string; aperture: string };

  const collectReferenceGalleryUrls = () =>
    Array.from(
      new Set(
        referenceSlots
          .map(slot => slot.imageUrl)
          .filter((url): url is string => Boolean(url && url.trim().length))
      )
    );

  const openPreview = (record: GeneratedImageDocument) => {
    setSelectedImageId(record.id);
    setPreviewRecord(record);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GeneratedImageDocument[];
        if (Array.isArray(parsed)) {
          const uid = user?.uid ?? null;
          const filtered = uid ? parsed.filter(record => record.userId === uid) : [];
          setLocalRecords(filtered);
        }
      }
    } catch (error) {
      console.warn("Failed to read local history", error);
    } finally {
      setHistoryHydrated(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(REFERENCE_GALLERY_STORAGE_KEY);
      if (!raw) {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .slice(0, MAX_REFERENCE_SLOT_COUNT)
          .map((item: { id?: unknown; imageUrl?: unknown; updatedAt?: unknown }) => ({
            id:
              typeof item?.id === "string"
                ? (item.id as string)
                : (typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            imageUrl: typeof item?.imageUrl === "string" ? (item.imageUrl as string) : null,
            updatedAt: typeof item?.updatedAt === "string" ? (item.updatedAt as string) : new Date().toISOString()
          }));

        const currentUid = user?.uid ?? null;
        const normalizedFiltered = normalized.filter(slot => {
          if (!slot.imageUrl) return true;
          if (!currentUid) return false;
          const url = slot.imageUrl;
          return url.startsWith("data:") || url.includes(`/users/${currentUid}/`);
        });

        const ensured = normalizedFiltered.length
          ? normalizedFiltered
          : Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot());
        setReferenceSlots(ensured);
      } else {
        setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
      }
    } catch (error) {
      console.warn("Failed to load reference slots", error);
      setReferenceSlots(Array.from({ length: INITIAL_REFERENCE_SLOT_COUNT }, () => createReferenceSlot()));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const payload = referenceSlots.map(slot => ({
        id: slot.id,
        imageUrl: slot.imageUrl,
        updatedAt: slot.updatedAt
      }));
      window.localStorage.setItem(REFERENCE_GALLERY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist reference slots", error);
    }
  }, [referenceSlots]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HistorySyncPayload>).detail;
      if (!detail || detail.source === "presets") {
        return;
      }

      const currentUid = user?.uid ?? null;
      const incoming = Array.isArray(detail.records)
        ? detail.records.filter(record => record.userId && record.userId === currentUid)
        : [];
      if (!incoming.length) {
        return;
      }

      historySyncSourceRef.current = detail.source ?? null;

      setLocalRecords(prev => {
        const incomingMap = new Map(incoming.map(record => [record.id, record]));
        const merged = [...incoming];
        for (const record of prev) {
          if (!incomingMap.has(record.id)) {
            merged.push(record);
          }
        }
        return merged;
      });
    };

    window.addEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(HISTORY_SYNC_EVENT, handler as EventListener);
  }, [user?.uid]);

  const mergedRecords = useMemo(() => {
    const merged = mergeHistoryRecords(localRecords, records);
    const uid = user?.uid ?? null;
    return uid ? merged.filter(record => record.userId === uid) : [];
  }, [localRecords, records, user?.uid]);

  const historyRecords = useMemo(() => mergedRecords.filter(record => record.id !== REFERENCE_IMAGE_DOC_ID), [mergedRecords]);
  const historyRecordsLimited = useMemo(() => historyRecords.slice(0, TILE_LIMIT), [historyRecords]);
  const emptyHistoryMessage = user ? "아직 생성된 이미지가 없습니다." : "로그인하여 생성 기록을 확인하세요.";

  useEffect(() => {
    if (!historyHydrated || typeof window === "undefined") {
      return;
    }
    try {
      const historySnapshot = historyRecords.slice(0, 50);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(historySnapshot));
      if (historySyncSourceRef.current && historySyncSourceRef.current !== "presets") {
        historySyncSourceRef.current = null;
      } else {
        broadcastHistoryUpdate(historySnapshot, "presets");
      }
    } catch (error) {
      console.warn("Failed to persist local history", error);
    }
  }, [historyHydrated, historyRecords]);

  const previewImageUrl =
    previewRecord?.imageUrl ?? previewRecord?.originalImageUrl ?? previewRecord?.thumbnailUrl ?? null;
  const previewPromptLabel =
    previewRecord?.promptMeta?.refinedPrompt ??
    previewRecord?.promptMeta?.rawPrompt ??
    (previewRecord?.metadata?.characterViewLabel as string | undefined) ??
    "";

  useEffect(() => {
    if (!historyRecordsLimited.length) {
      setSelectedImageId(null);
      return;
    }

    if (!selectedImageId) {
      setSelectedImageId(historyRecordsLimited[0].id);
    } else if (!historyRecordsLimited.some(record => record.id === selectedImageId)) {
      setSelectedImageId(historyRecordsLimited[0].id);
    }
  }, [historyRecordsLimited, selectedImageId]);

  useEffect(() => {
    if (previewRecord && !historyRecords.some(record => record.id === previewRecord.id)) {
      setPreviewRecord(null);
    }
  }, [historyRecords, previewRecord]);

type ReferenceImageState = {
  url: string | null;
  signature: number;
  source: "override" | "derived";
};

  const referenceRecord = useMemo(() => {
    const byId = mergedRecords.find(record => record.id === REFERENCE_IMAGE_DOC_ID);
    if (byId) {
      return byId;
    }
    return mergedRecords.find(record => record.metadata?.isReference === true) ?? null;
  }, [mergedRecords]);

  const derivedReferenceImageUrl = referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;

  const [referenceImageState, setReferenceImageState] = useState<ReferenceImageState>({
    url: null,
    signature: 0,
    source: "derived"
  });
  const setReferenceImageOverride = useCallback((url: string | null) => {
    setReferenceImageState(prev => ({
      url,
      signature: prev.signature + 1,
      source: "override"
    }));
  }, []);
  const hasReference = Boolean(referenceImageState.url ?? derivedReferenceImageUrl);

  const mergeLocalRecord = useCallback(
    (
      record: GeneratedImageDocument,
      { promoteToReference = false, broadcast = true }: { promoteToReference?: boolean; broadcast?: boolean } = {}
    ) => {
      const newReferenceEntry = promoteToReference ? { ...record, id: REFERENCE_IMAGE_DOC_ID } : null;

      setLocalRecords(prev => {
        const existingReference = promoteToReference ? null : prev.find(item => item.id === REFERENCE_IMAGE_DOC_ID) ?? null;
        const others = prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID && item.id !== record.id);
        const referenceEntry = promoteToReference ? newReferenceEntry : existingReference;
        return referenceEntry ? [referenceEntry, record, ...others] : [record, ...others];
      });

      if (promoteToReference && newReferenceEntry && broadcast) {
        broadcastReferenceUpdate(newReferenceEntry, "presets");
      }

      return newReferenceEntry;
    },
    [setLocalRecords]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = readStoredReference();
    if (stored) {
      mergeLocalRecord(stored, { promoteToReference: true, broadcast: false });
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReferenceSyncPayload>).detail;
      if (!detail || detail.source === "presets") {
        return;
      }
      if (!detail.record) {
        setLocalRecords(prev => prev.filter(item => item.id !== REFERENCE_IMAGE_DOC_ID));
        setSelectedImageId(null);
        return;
      }
      const currentUid = user?.uid;
      if (detail.record.userId && detail.record.userId !== currentUid) {
        return;
      }
      mergeLocalRecord(detail.record, { promoteToReference: true, broadcast: false });
  };

    window.addEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
    return () => window.removeEventListener(REFERENCE_SYNC_EVENT, handler as EventListener);
  }, [mergeLocalRecord, setLocalRecords]);

  useEffect(() => {
    if (!derivedReferenceImageUrl) {
      return;
    }

    setReferenceImageState(prev => {
      if (prev.source === "override" && prev.url && prev.url !== derivedReferenceImageUrl) {
        return prev;
      }
      if (prev.source === "derived" && prev.url === derivedReferenceImageUrl) {
        return prev;
      }
      const sameUrl = prev.url === derivedReferenceImageUrl;
      return {
        url: derivedReferenceImageUrl,
        signature: sameUrl ? prev.signature : prev.signature + 1,
        source: "derived"
      };
    });
  }, [derivedReferenceImageUrl]);


  const persistReferenceEntry = async (entry: GeneratedImageDocument, nowIso: string) => {
    if (!user || !shouldUseFirestore) {
      return;
    }

    const imageUrl = entry.imageUrl ?? entry.originalImageUrl;
    if (!imageUrl) {
      return;
    }

    try {
      await saveGeneratedImageDoc(user.uid, REFERENCE_IMAGE_DOC_ID, {
        mode: entry.mode,
        status: entry.status,
        promptMeta: entry.promptMeta,
        imageUrl,
        thumbnailUrl: entry.thumbnailUrl ?? imageUrl,
        originalImageUrl: entry.originalImageUrl ?? imageUrl,
        metadata: { ...(entry.metadata ?? {}), isReference: true },
        model: entry.model,
        costCredits: entry.costCredits,
        createdAtIso: entry.createdAt ?? nowIso,
        updatedAtIso: nowIso
      });
    } catch (error) {
      console.error("기준 이미지 동기화 실패", error);
    }
  };

  const promoteReferenceImage = async (
    imageUrl: string,
    { recordId, metadata }: { recordId?: string; metadata?: Record<string, unknown> } = {}
  ) => {
    const id =
      recordId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const now = new Date().toISOString();
    const baseRecord: GeneratedImageDocument = {
      id,
      userId: user?.uid ?? "local",
      mode: PRESET_ACTION_MODE,
      promptMeta: {
        rawPrompt: "프리셋 기준 이미지",
        refinedPrompt: "프리셋 기준 이미지"
      },
      status: "completed",
      imageUrl,
      thumbnailUrl: imageUrl,
      originalImageUrl: imageUrl,
      metadata: { ...(metadata ?? {}), isReference: true },
      model: "reference-upload",
      createdAt: now,
      updatedAt: now
    };

  const referenceEntry = mergeLocalRecord(baseRecord, { promoteToReference: true });
  if (referenceEntry) {
    await persistReferenceEntry(referenceEntry, now);
  }
  setSelectedImageId(id);
};

  const handleReferenceUpload = async (file: File) => {
    setReferenceImageUploading(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      let storedUrl = dataUrl;

      if (user && shouldUseFirestore) {
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const uploadResult = await uploadUserImage(user.uid, `preset-reference-${Date.now()}`, blob);
          storedUrl = uploadResult.url;
        } catch (error) {
          console.error("reference upload error", error);
          toast.error("기준 이미지 업로드에 실패했습니다.");
          return;
        }
      }

      const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
      setReferenceImageOverride(storedUrl);

      try {
        await promoteReferenceImage(storedUrl, { metadata: { source: "preset" } });
        toast.success("기준 이미지를 추가했습니다.");
      } catch (error) {
        console.error(error);
        setReferenceImageOverride(previousReferenceUrl);
        toast.error("기준 이미지 업로드에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      toast.error("기준 이미지 업로드에 실패했습니다.");
    } finally {
      setReferenceImageUploading(false);
    }
  };

  const handleReferenceRemove = async () => {
    if (!referenceRecord) {
      toast.info("삭제할 기준 이미지가 없습니다.");
      return;
    }

    if (user && shouldUseFirestore) {
      try {
        await deleteGeneratedImageDoc(user.uid, REFERENCE_IMAGE_DOC_ID);
        await deleteUserImage(user.uid, REFERENCE_IMAGE_DOC_ID);
      } catch (error) {
        console.warn("기준 이미지 삭제 실패", error);
      }
    }

    setLocalRecords(prev => prev.filter(record => record.id !== REFERENCE_IMAGE_DOC_ID));
    broadcastReferenceUpdate(null, "presets");
    setReferenceImageOverride(null);
    toast.success("기준 이미지를 삭제했습니다.");
  };

  const handleReferenceSlotAdd = () => {
    setReferenceSlots(prev => {
      if (prev.length >= MAX_REFERENCE_SLOT_COUNT) {
        toast.error(`참조 이미지는 최대 ${MAX_REFERENCE_SLOT_COUNT}개까지 추가할 수 있습니다.`);
        return prev;
      }
      return [...prev, createReferenceSlot()];
    });
  };

  const handleReferenceSlotUpload = async (slotId: string, file: File) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot) {
      toast.error("참조 슬롯을 찾을 수 없습니다.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      let storedUrl = dataUrl;

      if (user && shouldUseFirestore) {
        try {
          const blob = await dataUrlToBlob(dataUrl);
          const uploadResult = await uploadUserImage(user.uid, `preset-reference-slot-${slotId}`, blob);
          storedUrl = uploadResult.url;
        } catch (error) {
          console.error("reference slot upload error", error);
          toast.error("참조 이미지를 업로드하지 못했습니다.");
          return;
        }
      }

      setReferenceSlots(prev =>
        prev.map(item =>
          item.id === slotId
            ? { ...item, imageUrl: storedUrl, updatedAt: new Date().toISOString() }
            : item
        )
      );
      // Do not auto-promote on upload; promotion happens on "사용" click
      toast.success("참조 이미지를 추가했습니다.");
    } catch (error) {
      console.error("reference slot upload error", error);
      toast.error("참조 이미지 업로드에 실패했습니다.");
    }
  };

  const handleReferenceSlotClear = (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.info("삭제할 참조 이미지가 없습니다.");
      return;
    }

    setReferenceSlots(prev =>
      prev.map(item =>
        item.id === slotId
          ? { ...item, imageUrl: null, updatedAt: new Date().toISOString() }
          : item
      )
    );
    toast.success("참조 이미지를 삭제했습니다.");
  };

  const handleReferenceSlotSelect = async (slotId: string) => {
    const slot = referenceSlots.find(item => item.id === slotId);
    if (!slot?.imageUrl) {
      toast.error("먼저 이미지를 업로드해주세요.");
      return;
    }

    const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
    setReferenceImageOverride(slot.imageUrl);

    try {
      await promoteReferenceImage(slot.imageUrl, { metadata: { referenceSlotId: slotId, source: "preset-slot" } });
      setReferenceSlots(prev =>
        prev.map(item => (item.id === slotId ? { ...item, updatedAt: new Date().toISOString() } : item))
      );
      toast.success("기준 이미지를 설정했습니다.");
    } catch (error) {
      console.error("preset reference slot select error", error);
      setReferenceImageOverride(previousReferenceUrl);
      toast.error("기준 이미지를 설정하지 못했습니다.");
    }
  };

  const handleCancelBatch = () => {
    if (!batchPending) {
      return;
    }
    cancelRef.current = true;
    setCancelRequested(true);
    toast.info("생성 중지를 요청했습니다.");
  };

  const handleSetReferenceFromHistory = async (recordId: string) => {
    const candidate = historyRecords.find(record => record.id === recordId);
    if (!candidate) {
      toast.error("선택한 기록을 찾을 수 없습니다.");
      return;
    }

    const now = new Date().toISOString();
    const newUrl = candidate.imageUrl ?? candidate.originalImageUrl ?? null;
    const previousReferenceUrl = referenceImageState.url ?? referenceRecord?.imageUrl ?? referenceRecord?.originalImageUrl ?? null;
    if (newUrl) {
      setReferenceImageOverride(newUrl);
    }

    try {
      mergeLocalRecord(candidate, { promoteToReference: true });
      await persistReferenceEntry(candidate, now);
    } catch (error) {
      console.error("preset history reference select error", error);
      if (newUrl) {
        setReferenceImageOverride(previousReferenceUrl);
      }
      toast.error("기준 이미지를 업데이트하지 못했습니다.");
      return;
    }

    toast.success("기준 이미지를 업데이트했습니다.");
  };

  const handleToggleFavorite = async (recordId: string) => {
    const target = historyRecords.find(record => record.id === recordId);
    if (!target) {
      toast.error("기록을 찾을 수 없습니다.");
      return;
    }

    const nextFavorite = target.metadata?.favorite !== true;
    const updatedRecord: GeneratedImageDocument = {
      ...target,
      metadata: { ...(target.metadata ?? {}), favorite: nextFavorite }
    };

    setLocalRecords(prev => {
      const exists = prev.some(record => record.id === recordId);
      if (exists) {
        return prev.map(record => (record.id === recordId ? updatedRecord : record));
      }
      return [updatedRecord, ...prev];
    });

    if (user && shouldUseFirestore) {
      try {
        await updateGeneratedImageDoc(user.uid, recordId, {
          metadata: { ...(target.metadata ?? {}), favorite: nextFavorite }
        });
      } catch (error) {
        console.warn("favorite update error", error);
      }
    }
  };

  const handleDownloadRecord = async (record: GeneratedImageDocument) => {
    const url = record.imageUrl ?? record.thumbnailUrl ?? record.originalImageUrl;
    if (!url) {
      toast.error("다운로드할 이미지를 찾을 수 없습니다.");
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const filename = `${record.id}.png`;

    if (url.startsWith("data:")) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const mediaUrl = url.includes("alt=media") ? url : `${url}${url.includes('?') ? '&' : '?'}alt=media`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
    window.location.assign(downloadUrl);
  };

  const handlePresetCharacterSet = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: CHARACTER_VIEWS,
        batchLabel: "캐릭터셋",
        basePrompt: CHARACTER_BASE_PROMPT_FALLBACK,
        singleViewGuideline: CHARACTER_SINGLE_VIEW_GUIDELINE,
        negativePrompt: CHARACTER_NEGATIVE_ENFORCEMENT,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "character",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetView360 = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: TURNAROUND_VIEWS,
        batchLabel: "360도 뷰",
        basePrompt: TURNAROUND_BASE_PROMPT_FALLBACK,
        singleViewGuideline: TURNAROUND_SINGLE_VIEW_GUIDELINE,
        negativePrompt: TURNAROUND_NEGATIVE_ENFORCEMENT,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "view-360",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetPhotoDump = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: PHOTO_DUMP_VIEWS,
        batchLabel: "포토 덤프",
        basePrompt: "High fidelity portrait of the supplied reference character",
        singleViewGuideline:
          "Keep the same pose and expression as the reference image while adapting to the requested style.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, different facial expression, different pose, extra limbs, distorted anatomy`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "photo-dump",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        interRequestDelayMs: 1200,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetTealOrange = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: [
          {
            id: "teal-orange",
            label: "틸 & 오렌지",
            instruction:
              "Apply professional teal and orange feature film color grading while maintaining the original pose and composition"
          }
        ],
        batchLabel: "틸 & 오렌지",
        basePrompt: "High fidelity portrait of the supplied reference character",
        singleViewGuideline: TURNAROUND_SINGLE_VIEW_GUIDELINE,
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, altered pose, different expression`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "teal-orange",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        interRequestDelayMs: 0,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 3000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetPhotoDumpDynamic = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: PHOTO_DUMP_VARIATION_VIEWS,
        batchLabel: "포토 덤프 12",
        basePrompt: "High fidelity portrait of the supplied reference character, same art style as reference",
        singleViewGuideline:
          "Preserve character likeness while adapting outfit, hairstyle, body pose, facial expression, and scene backdrop exactly as described for each view.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, identity swap, duplicate person, deformed body, severe distortion`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "photo-dump-dynamic",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        interRequestDelayMs: 1200,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 5000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const handlePresetEmotionStudy = async () => {
    if (!referenceRecord) {
      toast.error("먼저 기준 이미지를 설정해주세요.");
      return;
    }

    const referenceImageForRequest =
    referenceRecord.imageUrl ??
    referenceRecord.originalImageUrl ??
    referenceImageState.url ??
    (historyRecords.find(record => record.id === selectedImageId)?.originalImageUrl ?? historyRecords.find(record => record.id === selectedImageId)?.imageUrl) ?? null;

    const uniqueGalleryReferences = collectReferenceGalleryUrls().filter(url => url !== referenceImageForRequest);

    cancelRef.current = false;
    setCancelRequested(false);

    try {
      await runBatchSequence({
        views: EMOTION_STUDY_VIEWS,
        batchLabel: "감정 프리셋 12컷",
        basePrompt: "High fidelity portrait of the supplied reference character, identical styling and camera framing, adjust only the facial expression per instruction.",
        singleViewGuideline:
          "Keep the subject's pose, outfit, and camera angle unchanged. Modify only the facial muscles to match the requested emotion with natural nuance.",
        negativePrompt: `${CHARACTER_NEGATIVE_ENFORCEMENT}, different pose, head swapped, extra limbs, distorted face, exaggerated cartoon expression`,
        referenceImageForRequest,
        uniqueGalleryReferences,
        aspectRatioValue,
        aspectRatioLabel,
        shouldApplyAspectRatio,
        actionLabel: "emotion-preset",
        targetModel: "gemini-2.5-flash-image-preview",
        setPending: setBatchPending,
        cameraPayload,
        apertureLabel,
        effectiveCameraAngle: cameraAngle,
        mergeLocalRecord,
        referenceRecord,
        referenceMetadata: (referenceRecord.metadata ?? {}) as { referenceId?: string | null },
        fallbackCandidate: historyRecords[0] ?? null,
        user,
        shouldUseFirestore,
        interRequestDelayMs: 1000,
        cancelRef,
        onCancelled: () => setCancelRequested(false),
        onProgress: (view, index, total) => {
          toast.loading(`${view.label} (${index + 1}/${total}) 생성 중...`, {
            duration: 4000
          });
        }
      });
    } finally {
      cancelRef.current = false;
      setCancelRequested(false);
    }
  };

  const referenceImageUrl = referenceImageState.url ?? derivedReferenceImageUrl ?? null;
  const cacheBustedReferenceImageUrl = useMemo(() => {
    if (!referenceImageUrl) {
      return null;
    }
    if (referenceImageUrl.startsWith("data:")) {
      return referenceImageUrl;
    }
    if (!referenceImageState.signature) {
      return referenceImageUrl;
    }
    try {
      const url = new URL(referenceImageUrl);
      url.searchParams.set("_cb", referenceImageState.signature.toString());
      return url.toString();
    } catch {
      return `${referenceImageUrl}${referenceImageUrl.includes("?") ? "&" : "?"}_cb=${referenceImageState.signature}`;
    }
  }, [referenceImageState.signature, referenceImageUrl]);

  return (
    <>
      <div className="flex min-h-screen flex-col gap-8 bg-background p-6">
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>기준 이미지</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              className={cn(
                "relative overflow-hidden rounded-xl border bg-muted",
                FOUR_THREE_RATIO_CLASS,
                referenceImageUrl ? "" : "flex items-center justify-center"
              )}
            >
              {cacheBustedReferenceImageUrl ? (
                <img
                  key={cacheBustedReferenceImageUrl}
                  src={cacheBustedReferenceImageUrl}
                  alt="reference"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <span>기준 이미지를 업로드하세요</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleReferenceUpload(file);
                  }
                  if (event.target.value) {
                    event.target.value = "";
                  }
                }}
                disabled={batchPending}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={referenceImageUploading || batchPending}>
                기준 이미지 추가
              </Button>
              <Button variant="secondary" onClick={() => router.push("/")}>
                편집 열기
              </Button>
              <Button variant="destructive" onClick={() => void handleReferenceRemove()} disabled={!hasReference || batchPending}>
                삭제
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>참조 이미지</span>
                <Button variant="ghost" size="sm" onClick={handleReferenceSlotAdd} disabled={referenceSlots.length >= MAX_REFERENCE_SLOT_COUNT || batchPending}>
                  슬롯 추가
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {referenceSlots.map(slot => (
                  <div key={slot.id} className="group relative overflow-hidden rounded-lg border">
                    {slot.imageUrl ? (
                      <>
                        <Image src={slot.imageUrl} alt="reference slot" width={160} height={120} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition group-hover:opacity-100">
                          <Button size="icon" variant="secondary" onClick={() => void handleReferenceSlotSelect(slot.id)} disabled={batchPending}>
                            <Stars className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="destructive" onClick={() => handleReferenceSlotClear(slot.id)} disabled={batchPending}>
                            <Download className="h-4 w-4 rotate-180" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <label className="flex h-full w-full cursor-pointer items-center justify-center text-xs text-muted-foreground">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleReferenceSlotUpload(slot.id, file);
                            }
                            if (event.target.value) {
                              event.target.value = "";
                            }
                          }}
                          disabled={batchPending}
                        />
                        업로드
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>프리셋</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <Button className="h-20 text-lg" onClick={() => void handlePresetCharacterSet()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" /> 캐릭터셋 생성
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetView360()} disabled={batchPending}>
                <Stars className="mr-2 h-5 w-5" /> 360도 뷰
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetPhotoDump()} disabled={batchPending}>
                <Zap className="mr-2 h-5 w-5" /> 포토 덤프 (26컷)
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetPhotoDumpDynamic()} disabled={batchPending}>
                <Zap className="mr-2 h-5 w-5" /> 포토 덤프 12컷 (스타일 변주)
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetEmotionStudy()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" /> 감정 프리셋 12컷
              </Button>
              <Button className="h-20 text-lg" onClick={() => void handlePresetTealOrange()} disabled={batchPending}>
                <Sparkles className="mr-2 h-5 w-5" /> 틸 & 오렌지 컬러그레이딩
              </Button>
              {batchPending && (
                <Button
                  className="col-span-full h-12 text-sm"
                  variant="destructive"
                  onClick={handleCancelBatch}
                  disabled={cancelRequested}
                >
                  {cancelRequested ? "중지 요청 처리 중..." : "생성 중지"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 생성 기록</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {loading ? "기록 동기화 중" : `${historyRecordsLimited.length}개 표시 중`}
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
              스튜디오 열기
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {historyRecordsLimited.map(record => {
            const imageUrl = record.imageUrl ?? record.thumbnailUrl ?? record.originalImageUrl;
            const recordLabel =
              (record.metadata?.characterViewLabel as string | undefined) ??
              (record.promptMeta?.refinedPrompt as string | undefined) ??
              (record.promptMeta?.rawPrompt as string | undefined) ??
              "";
            return (
              <div
                key={record.id}
                className={cn(
                  "group relative overflow-hidden rounded-lg border bg-card",
                  FOUR_THREE_RATIO_CLASS,
                  selectedImageId === record.id ? "ring-2 ring-primary" : ""
                )}
                role="button"
                tabIndex={0}
                onClick={() => openPreview(record)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPreview(record);
                  }
                }}
              >
                {imageUrl ? (
                  <Image src={imageUrl} alt="generated" fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">이미지 없음</div>
                )}
                <div className="absolute inset-0 flex flex-col justify-between bg-black/0 transition group-hover:bg-black/60">
                  <div className="flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleToggleFavorite(record.id);
                      }}
                      className={record.metadata?.favorite ? "text-amber-500" : ""}
                      disabled={batchPending}
                    >
                      <Stars className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleSetReferenceFromHistory(record.id);
                      }}
                      disabled={batchPending}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={event => {
                        event.stopPropagation();
                        void handleDownloadRecord(record);
                      }}
                      disabled={batchPending}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                  <button
                    className="flex items-center justify-between px-3 py-2 text-left text-xs text-white opacity-0 transition group-hover:opacity-100"
                    onClick={event => {
                      event.stopPropagation();
                      openPreview(record);
                    }}
                  >
                    <span className="line-clamp-2">{recordLabel}</span>
                    <span>{new Date(record.createdAt ?? record.updatedAt ?? "").toLocaleDateString()}</span>
                  </button>
                </div>
              </div>
            );
          })}
          {historyRecordsLimited.length === 0 && (
            <div className="col-span-full flex h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
              {emptyHistoryMessage}
            </div>
          )}
        </div>
      </div>
      </div>
      {previewRecord ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewRecord(null)}
        >
          <div
            className="relative h-full w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl border border-white/20 bg-black/90 shadow-lg"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs text-white backdrop-blur"
              onClick={event => {
                event.stopPropagation();
                setPreviewRecord(null);
              }}
            >
              닫기
            </button>
            {previewImageUrl ? (
              <img src={previewImageUrl} alt={previewPromptLabel || "preview"} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-white/80">이미지를 불러올 수 없습니다.</div>
            )}
            {previewPromptLabel ? (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-xs text-white/90 line-clamp-2">
                {previewPromptLabel}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
