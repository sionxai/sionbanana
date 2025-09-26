"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiffSlider } from "@/components/studio/diff-slider";
import { PromptPanel } from "@/components/studio/prompt-panel";
import type { AspectRatioPreset, GenerationMode } from "@/lib/types";
import {
  APERTURE_DEFAULT,
  DEFAULT_CAMERA_ANGLE,
  DEFAULT_CAMERA_DIRECTION,
  DEFAULT_SUBJECT_DIRECTION,
  DEFAULT_ZOOM_LEVEL,
  formatAperture
} from "@/lib/camera";
import { DEFAULT_ASPECT_RATIO } from "@/lib/aspect";
import type {
  LightingSelections,
  PoseSelections,
  LightingPresetCategory,
  PosePresetCategory
} from "@/components/studio/types";
import { callGenerateApi } from "@/hooks/use-generate-image";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { uploadUserImage } from "@/lib/firebase/storage";
import { saveGeneratedImageDoc } from "@/lib/firebase/firestore";
import { shouldUseFirestore } from "@/lib/env";
import { useGeneratedImages } from "@/hooks/use-generated-images";
import Image from "next/image";
import type { GeneratedImageDocument } from "@/lib/types";
import { LOCAL_STORAGE_KEY } from "@/components/studio/constants";
import { mergeHistoryRecords } from "@/components/studio/history-sync";

const MAX_BATCH_ITEMS = 30;

const BATCH_MODES: Array<{
  id: GenerationMode | "presets";
  label: string;
  description: string;
  href?: string;
}> = [
  { id: "create", label: "편집", description: "기본 프롬프트 기반 이미지 생성" },
  { id: "camera", label: "카메라", description: "화각 및 렌즈 스타일 변경" },
  { id: "lighting", label: "조명 및 배색", description: "조명과 컬러그레이딩 프리셋 적용" },
  { id: "pose", label: "포즈", description: "표정과 자세 프리셋 적용" },
  { id: "external", label: "외부 프리셋", description: "예시 기반 프롬프트 컬렉션" },
  { id: "crop", label: "크롭", description: "이미지 구도 및 비율 변경" },
  { id: "upscale", label: "업스케일", description: "고해상도로 업스케일" },
  { id: "sketch", label: "스케치", description: "스케치를 이미지로 변환" },
  { id: "prompt-adapt", label: "T2I", description: "타 툴용 프롬프트 변환" },
  {
    id: "presets",
    label: "프리셋",
    description: "자주 쓰는 시나리오 모음",
    href: "/studio/presets"
  }
];

interface BatchItem {
  id: string;
  name: string;
  sizeLabel: string;
  src: string;
  file: File;
  status: "대기" | "진행 중" | "완료" | "실패";
  result?: {
    image?: string;
    completedAt?: string;
  };
  errorMessage?: string;
}

export function BatchStudioShell() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const [activeMode, setActiveMode] = useState<GenerationMode>("create");
  const [prompt, setPrompt] = useState("");
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [cameraAngle, setCameraAngle] = useState(DEFAULT_CAMERA_ANGLE);
  const [aperture, setAperture] = useState(APERTURE_DEFAULT);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>(DEFAULT_ASPECT_RATIO);
  const [subjectDirection, setSubjectDirection] = useState(DEFAULT_SUBJECT_DIRECTION);
  const [cameraDirection, setCameraDirection] = useState(DEFAULT_CAMERA_DIRECTION);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM_LEVEL);
  const [lightingSelections, setLightingSelections] = useState<LightingSelections>({
    illumination: [],
    atmosphere: [],
    time: [],
    cinematic: [],
    artistic: [],
    harmony: [],
    mood: []
  });
  const [poseSelections, setPoseSelections] = useState<PoseSelections>({
    expression: ["default"],
    posture: ["default"]
  });
  const [useGptPrompt, setUseGptPrompt] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });

  // 로컬 스토리지 키
  const BATCH_STORAGE_KEY = 'batch-studio-items';
  const BATCH_SETTINGS_KEY = 'batch-studio-settings';

  // 프리셋 페이지와 동일한 히스토리 구조 사용
  const { records, loading } = useGeneratedImages();
  const [localRecords, setLocalRecords] = useState<GeneratedImageDocument[]>([]);

  const mergedRecords = useMemo(() => {
    const merged = mergeHistoryRecords(localRecords, records);
    const uid = user?.uid ?? null;
    return uid ? merged.filter(record => record.userId === uid) : [];
  }, [localRecords, records, user?.uid]);

  const historyRecords = useMemo(() => mergedRecords.filter(record =>
    record.id !== 'reference-image' &&
    !record.id.startsWith('reference-slot-')
  ), [mergedRecords]);

  const historyRecordsLimited = useMemo(() => historyRecords.slice(0, 30), [historyRecords]);

  useEffect(() => {
    if (!user?.uid) return;

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GeneratedImageDocument[];
        const filtered = user?.uid ? parsed.filter(record => record.userId === user.uid) : [];
        setLocalRecords(filtered);
      }
    } catch (error) {
      console.warn("Failed to read local history", error);
    }
  }, [user?.uid]);

  // 컴포넌트 마운트 시 저장된 배치 데이터 복원
  useEffect(() => {
    console.log('🔄 [Batch Storage] 배치 스튜디오 마운트, 데이터 복원 시작');

    try {
      // 로컬 스토리지 상태 확인
      console.log('📱 [Batch Storage] 로컬 스토리지 키들:', Object.keys(localStorage));

      // 배치 아이템 복원
      const savedItems = localStorage.getItem(BATCH_STORAGE_KEY);
      console.log('📦 [Batch Storage] 저장된 아이템:', savedItems ? 'found' : 'not found', savedItems?.length);

      if (savedItems) {
        const parsedItems: BatchItem[] = JSON.parse(savedItems);
        console.log('📦 [Batch Storage] 파싱된 아이템 개수:', parsedItems.length);

        // 파일 객체는 복원할 수 없고, 이미지 데이터도 저장되지 않음 - 메타데이터만 복원
        const completedItems = parsedItems.filter(item =>
          item.status === "완료"
        ).map(item => ({
          ...item,
          file: new File([], item.name, { type: 'image/*' }), // 더미 파일 객체
          result: {
            ...item.result,
            image: undefined // 이미지는 undefined로 설정 (Firebase에서만 가져옴)
          }
        }));

        console.log('📦 [Batch Storage] 복원할 완료된 아이템 개수:', completedItems.length);

        if (completedItems.length > 0) {
          setBatchItems(completedItems);
          console.log(`✅ [Batch Storage] ${completedItems.length}개 완료된 항목 복원 완료`);

          // 복원 시에는 메타데이터만 있고 이미지는 없으므로 히스토리에 추가하지 않음
          // Firebase에 저장된 기록은 useGeneratedImages를 통해 자동으로 가져올 것임
          console.log('📦 [Batch Storage] 복원된 항목들은 이미지 데이터 없음 - Firebase 기록 대기 중');
        }
      }

      // 설정 복원
      const savedSettings = localStorage.getItem(BATCH_SETTINGS_KEY);
      console.log('⚙️ [Batch Storage] 저장된 설정:', savedSettings ? 'found' : 'not found');

      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        console.log('⚙️ [Batch Storage] 복원할 설정:', Object.keys(settings));

        if (settings.activeMode) setActiveMode(settings.activeMode);
        if (settings.prompt) setPrompt(settings.prompt);
        if (settings.refinedPrompt) setRefinedPrompt(settings.refinedPrompt);
        if (settings.negativePrompt) setNegativePrompt(settings.negativePrompt);
        if (settings.cameraAngle) setCameraAngle(settings.cameraAngle);
        if (settings.aperture) setAperture(settings.aperture);
        if (settings.aspectRatio) setAspectRatio(settings.aspectRatio);
        if (settings.subjectDirection) setSubjectDirection(settings.subjectDirection);
        if (settings.cameraDirection) setCameraDirection(settings.cameraDirection);
        if (settings.zoomLevel) setZoomLevel(settings.zoomLevel);
        if (settings.lightingSelections) setLightingSelections(settings.lightingSelections);
        if (settings.poseSelections) setPoseSelections(settings.poseSelections);
        if (typeof settings.useGptPrompt === 'boolean') setUseGptPrompt(settings.useGptPrompt);
        console.log(`✅ [Batch Storage] 설정 복원 완료`);
      }
    } catch (error) {
      console.error('❌ [Batch Storage] 데이터 복원 실패:', error);
    }

    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // 설정 변경 시 자동 저장 (초기 로드 후에만)
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return; // 초기 로드 시에는 저장하지 않음
    }

    try {
      const settings = {
        activeMode,
        prompt,
        refinedPrompt,
        negativePrompt,
        cameraAngle,
        aperture,
        aspectRatio,
        subjectDirection,
        cameraDirection,
        zoomLevel,
        lightingSelections,
        poseSelections,
        useGptPrompt
      };
      localStorage.setItem(BATCH_SETTINGS_KEY, JSON.stringify(settings));
      console.log('💾 [Batch Storage] 설정 자동 저장 완료');
    } catch (error) {
      console.error('❌ [Batch Storage] 설정 저장 실패:', error);
    }
  }, [
    activeMode,
    prompt,
    refinedPrompt,
    negativePrompt,
    cameraAngle,
    aperture,
    aspectRatio,
    subjectDirection,
    cameraDirection,
    zoomLevel,
    lightingSelections,
    poseSelections,
    useGptPrompt
  ]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setBatchItems(prev => {
      const availableSlots = MAX_BATCH_ITEMS - prev.length;
      if (availableSlots <= 0) {
        toast.warning(`최대 ${MAX_BATCH_ITEMS}개까지만 업로드할 수 있습니다.`);
        return prev;
      }

      const selected = files.slice(0, availableSlots);
      const nextItems: BatchItem[] = selected.map(file => {
        const objectUrl = URL.createObjectURL(file);
        objectUrlsRef.current.push(objectUrl);
        const sizeLabel = formatFileSize(file.size);
        return {
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          sizeLabel,
          src: objectUrl,
          file,
          status: "대기"
        };
      });

      if (selected.length < files.length) {
        toast.info(`${availableSlots}개의 이미지만 추가되었습니다.`);
      }

      return [...prev, ...nextItems];
    });

    event.target.value = "";
  };

  const handleResetPresets = useCallback(() => {
    setCameraAngle(DEFAULT_CAMERA_ANGLE);
    setAperture(APERTURE_DEFAULT);
    setAspectRatio(DEFAULT_ASPECT_RATIO);
    setSubjectDirection(DEFAULT_SUBJECT_DIRECTION);
    setCameraDirection(DEFAULT_CAMERA_DIRECTION);
    setZoomLevel(DEFAULT_ZOOM_LEVEL);
    setLightingSelections({
      illumination: [],
      atmosphere: [],
      time: [],
      cinematic: [],
      artistic: [],
      harmony: [],
      mood: []
    });
    setPoseSelections({ expression: ["default"], posture: ["default"] });
    toast.success("프리셋을 초기화했습니다.");
  }, []);

  const handleLightingSelectionsChange = useCallback(
    (category: LightingPresetCategory, values: string[]) => {
      setLightingSelections(prev => ({
        ...prev,
        [category]: values
      }));
    },
    []
  );

  const handlePoseSelectionsChange = useCallback(
    (category: PosePresetCategory, values: string[]) => {
      setPoseSelections(prev => ({
        ...prev,
        [category]: values.length ? values : ["default"]
      }));
    },
    []
  );

  const handleRefinePrompt = () => {
    toast.info("프롬프트 보정 기능은 준비 중입니다.");
  };

  const handleToggleGpt = () => {
    setUseGptPrompt(prev => !prev);
  };

  const handleClearAll = () => {
    if (batchItems.length === 0) {
      toast.info("삭제할 이미지가 없습니다.");
      return;
    }
    setBatchItems([]);
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];

    // 로컬 스토리지에서도 제거
    try {
      localStorage.removeItem(BATCH_STORAGE_KEY);
    } catch (error) {
      console.warn('로컬 스토리지 삭제 실패:', error);
    }

    toast.success("모든 업로드 이미지를 삭제했습니다.");
  };

  const handleDownloadAll = () => {
    const completedItems = batchItems.filter(item => item.status === "완료" && item.result?.image);

    if (completedItems.length === 0) {
      toast.info("다운로드할 완성된 이미지가 없습니다.");
      return;
    }

    completedItems.forEach((item, index) => {
      if (!item.result?.image) return;

      // Create download link
      const link = document.createElement('a');
      const fileName = `${item.name.split('.')[0]}_변형.png`;

      link.href = item.result.image;
      link.download = fileName;
      link.style.display = 'none';

      // Add to DOM, click, and remove
      document.body.appendChild(link);

      // Delay each download slightly to avoid browser blocking
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
      }, index * 100);
    });

    toast.success(`${completedItems.length}개의 변형 이미지를 다운로드합니다.`);
  };

  const handleGenerate = useCallback(async () => {
    console.log("🚀 [Batch Generate] 변형 생성 시작!", {
      prompt: prompt.trim(),
      refinedPrompt: refinedPrompt.trim(),
      batchItemsCount: batchItems.length,
      isProcessing,
      activeMode
    });

    const basePrompt = refinedPrompt.trim() || prompt.trim();
    if (!basePrompt) {
      console.warn("⚠️ [Batch Generate] 프롬프트가 비어있음");
      toast.error("프롬프트를 입력해주세요.");
      return;
    }
    if (batchItems.length === 0) {
      console.warn("⚠️ [Batch Generate] 업로드된 이미지 없음");
      toast.info("업로드된 이미지가 없습니다.");
      return;
    }
    if (isProcessing) {
      console.warn("⚠️ [Batch Generate] 이미 처리 중");
      toast.info("이미 변환 작업이 진행 중입니다.");
      return;
    }

    console.log("✅ [Batch Generate] 유효성 검사 통과, 처리 시작");

    setIsProcessing(true);
    setCurrentProcessingIndex(-1);
    setProcessingProgress({ current: 0, total: batchItems.length });
    setBatchItems(prev =>
      prev.map(item => ({
        ...item,
        status: "대기",
        result: undefined,
        errorMessage: undefined
      }))
    );

    const cameraPayload = {
      angle: cameraAngle,
      aperture: formatAperture(aperture),
      subjectDirection,
      cameraDirection,
      zoom: zoomLevel
    };

    const lightingPayload = Object.fromEntries(
      Object.entries(lightingSelections).filter(([, values]) => values.length > 0)
    );
    const posePayload = Object.fromEntries(
      Object.entries(poseSelections).filter(([, values]) => values.some(value => value !== "default"))
    );

    const items = batchItems.slice();

    for (const [index, item] of items.entries()) {
      setCurrentProcessingIndex(index);
      setProcessingProgress({ current: index + 1, total: items.length });
      console.log(`🖼️ [Batch Generate] 이미지 처리 시작: ${index + 1}/${items.length} - ${item.name}`);

      const dataUrl = await readFileAsDataURL(item.file).catch(error => {
        console.error("failed to read file", error);
        toast.error(`${item.name} 읽기에 실패했습니다.`);
        setBatchItems(prev =>
          prev.map(upload =>
            upload.id === item.id
              ? { ...upload, status: "실패", result: undefined, errorMessage: "파일을 읽을 수 없습니다." }
              : upload
          )
        );
        return null;
      });

      if (!dataUrl) {
        continue;
      }

      setBatchItems(prev =>
        prev.map(upload =>
          upload.id === item.id
            ? { ...upload, status: "진행 중", result: undefined, errorMessage: undefined }
            : upload
        )
      );

      const generationOptions: Record<string, unknown> = {
        referenceImage: dataUrl,
        aspectRatio,
        batchItemId: item.id,
        batchItemName: item.name
      };

      if (Object.keys(lightingPayload).length > 0) {
        generationOptions.lighting = lightingPayload;
      }
      if (Object.keys(posePayload).length > 0) {
        generationOptions.pose = posePayload;
      }

      try {
        console.log(`🚀 [Batch Generate] API 호출 시작: ${item.name}`, {
          prompt: basePrompt,
          mode: activeMode,
          hasCamera: !!cameraPayload,
          hasLighting: Object.keys(lightingPayload).length > 0,
          hasPose: Object.keys(posePayload).length > 0
        });

        const response = await callGenerateApi({
          prompt: basePrompt,
          refinedPrompt: refinedPrompt.trim() || undefined,
          negativePrompt: negativePrompt.trim() || undefined,
          mode: activeMode,
          camera: cameraPayload,
          options: generationOptions
        });

        console.log(`📝 [Batch Generate] API 응답: ${item.name}`, {
          ok: response.ok,
          reason: response.reason,
          hasBase64Image: !!response.base64Image,
          hasImageUrl: !!response.imageUrl,
          model: (response as any).model || "gemini-nano-banana"
        });

        if (!response.ok) {
          const errorMsg = response.reason || "알 수 없는 오류가 발생했습니다.";
          console.error(`❌ [Batch Generate] API 실패: ${item.name}`, {
            reason: response.reason,
            status: (response as any).status,
            fullResponse: response
          });

          setBatchItems(prev =>
            prev.map(upload =>
              upload.id === item.id
                ? {
                    ...upload,
                    status: "실패",
                    result: undefined,
                    errorMessage: errorMsg
                  }
                : upload
            )
          );

          toast.error(`${item.name} 변환 실패`, {
            description: errorMsg,
            action: {
              label: "다시 시도",
              onClick: () => {
                console.log(`🔄 [Batch Generate] 재시도: ${item.name}`);
                // TODO: 개별 아이템 재시도 기능 추후 구현
              }
            }
          });
          continue;
        }

        const base64 = response.base64Image ?? response.imageUrl;
        if (!base64) {
          const errorMsg = "이미지 데이터를 찾을 수 없습니다.";
          console.error(`❌ [Batch Generate] 이미지 데이터 없음: ${item.name}`, {
            hasBase64: !!response.base64Image,
            hasImageUrl: !!response.imageUrl,
            response
          });

          setBatchItems(prev =>
            prev.map(upload =>
              upload.id === item.id
                ? {
                    ...upload,
                    status: "실패",
                    result: undefined,
                    errorMessage: errorMsg
                  }
                : upload
            )
          );

          toast.error(`${item.name} 변환 실패`, {
            description: errorMsg
          });
          continue;
        }

        console.log(`✅ [Batch Generate] 성공: ${item.name}`);

        // Firebase에 저장 (백그라운드에서 비동기로 처리)
        let finalImageUrl = base64;

        // Firebase 저장을 백그라운드에서 처리하고 메인 루프는 계속 진행
        if (user && shouldUseFirestore) {
          // 백그라운드에서 Firebase 저장 (await 없이)
          Promise.resolve().then(async () => {
            try {
              console.log(`💾 [Batch Generate] Firebase 저장 시작 (백그라운드): ${item.name}`);

              // 30초 타임아웃 설정 (큰 이미지 고려)
              const uploadWithTimeout = Promise.race([
                (async () => {
                  const fetchResponse = await fetch(base64);
                  const blob = await fetchResponse.blob();
                  const recordId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                  const uploadResult = await uploadUserImage(user.uid, recordId, blob);

                  const promptMeta: any = { rawPrompt: basePrompt };
                  if (refinedPrompt.trim()) promptMeta.refinedPrompt = refinedPrompt.trim();
                  if (negativePrompt.trim()) promptMeta.negativePrompt = negativePrompt.trim();

                  const metadata: any = {
                    batchItem: true,
                    batchItemName: item.name,
                    batchItemId: item.id,
                    camera: cameraPayload,
                    aspectRatio
                  };
                  if (Object.keys(lightingPayload).length > 0) metadata.lighting = lightingPayload;
                  if (Object.keys(posePayload).length > 0) metadata.pose = posePayload;

                  const firestorePayload: any = {
                    mode: activeMode,
                    status: "completed",
                    promptMeta,
                    imageUrl: uploadResult.url,
                    thumbnailUrl: uploadResult.url,
                    originalImageUrl: dataUrl,
                    metadata,
                    model: (response as any).model || "gemini-nano-banana" || "gemini-unknown",
                    createdAtIso: new Date().toISOString(),
                    updatedAtIso: new Date().toISOString()
                  };
                  if (response.costCredits !== undefined) firestorePayload.costCredits = response.costCredits;

                  await saveGeneratedImageDoc(user.uid, recordId, firestorePayload);
                  console.log(`💾 [Batch Generate] Firebase 저장 완료 (백그라운드): ${item.name} -> ${recordId}`);
                })(),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Firebase 업로드 타임아웃 (30초)')), 30000)
                )
              ]);

              await uploadWithTimeout;
            } catch (firebaseError) {
              const errorMsg = firebaseError instanceof Error ? firebaseError.message : "Firebase 저장 오류";
              // Firebase 저장 실패는 조용히 처리 (배치 생성 자체는 성공했으므로)
              if (errorMsg.includes('타임아웃')) {
                console.log(`⏱️ [Batch Generate] ${item.name} Firebase 업로드 시간 초과 (로컬 결과는 정상)`);
              } else {
                console.warn(`⚠️ [Batch Generate] ${item.name} Firebase 저장 실패: ${errorMsg}`);
              }
            }
          });
        } else {
          console.log(`⚠️ [Batch Generate] Firebase 미설정 - 로컬에만 저장: ${item.name}`);
        }

        setBatchItems(prev => {
          const updated = prev.map(upload =>
            upload.id === item.id
              ? {
                  ...upload,
                  status: "완료" as const,
                  result: {
                    image: finalImageUrl,
                    completedAt: new Date().toISOString()
                  },
                  errorMessage: undefined
                }
              : upload
          );

          // 로컬 스토리지에 저장 (base64 이미지 제외하여 용량 절약)
          try {
            const completedItems = updated.filter(item =>
              item.status === "완료" && item.result?.image
            );

            // base64 이미지를 제외하고 메타데이터만 저장
            const itemsToSave = completedItems.map(({ file, result, ...rest }) => ({
              ...rest,
              result: {
                completedAt: result?.completedAt,
                // 이미지 데이터는 저장하지 않음 (용량 절약)
              }
            }));

            localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify(itemsToSave));
            console.log(`💾 [Batch Storage] ${completedItems.length}개 완료된 항목 저장 완료 (이미지 제외)`);

            // 로컬 히스토리도 업데이트 (Firebase에 저장된 것만 - base64 이미지 제외)
            const historyRecords: GeneratedImageDocument[] = completedItems
              .filter(item => item.result?.image && !item.result.image.startsWith('data:')) // Firebase URL만
              .map(item => ({
                id: item.id,
                userId: user?.uid ?? "local",
                mode: 'remix' as const,
                status: 'completed' as const,
                imageUrl: item.result?.image || '',
                thumbnailUrl: item.result?.image || '',
                originalImageUrl: item.src,
                promptMeta: {
                  rawPrompt: '배치 변형 생성',
                  refinedPrompt: item.name
                },
                metadata: {
                  batchItem: true,
                  batchItemName: item.name
                },
                model: 'gemini-batch',
                createdAt: item.result?.completedAt || new Date().toISOString(),
                updatedAt: item.result?.completedAt || new Date().toISOString(),
                createdAtIso: item.result?.completedAt || new Date().toISOString(),
                updatedAtIso: item.result?.completedAt || new Date().toISOString()
              }));

            // 기존 로컬 기록과 합치기 (중복 제거)
            setLocalRecords(prev => {
              const existingIds = prev.map(r => r.id);
              const newRecords = historyRecords.filter(r => !existingIds.includes(r.id));
              return [...prev, ...newRecords];
            });
          } catch (error) {
            if (error instanceof Error && error.name === 'QuotaExceededError') {
              console.error('❌ [Batch Storage] 로컬 스토리지 용량 초과:', error.message);
              // 용량 초과 시 기존 데이터 정리 후 재시도
              try {
                localStorage.removeItem(BATCH_STORAGE_KEY);
                console.log('🧹 [Batch Storage] 기존 배치 데이터 정리 완료');
              } catch (cleanupError) {
                console.error('❌ [Batch Storage] 데이터 정리 실패:', cleanupError);
              }
            } else {
              console.error('❌ [Batch Storage] 배치 아이템 저장 실패:', error);
            }
          }

          // 상태 업데이트 확인 (간단한 로그)
          console.log(`✅ [Batch Generate] ${item.name} 완료 및 UI 업데이트`);

          return updated;
        });
      } catch (error) {
        console.error(`❌ [Batch Generate] 오류: ${item.name}`, error);
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        setBatchItems(prev =>
          prev.map(upload =>
            upload.id === item.id
              ? { ...upload, status: "실패", result: undefined, errorMessage: message }
              : upload
          )
        );
        toast.error(`${item.name} 변환 실패`, {
          description: message
        });

        // 오류가 발생해도 다음 이미지 계속 처리
        console.log(`⚠️ [Batch Generate] ${item.name} 실패 후 다음 이미지 계속 처리`);
      }

      // 각 이미지 처리 후 잠시 대기 (과부하 방지)
      console.log(`✅ [Batch Generate] ${item.name} 처리 완료 - 다음으로 이동 (${index + 1}/${items.length})`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const finalStats = {
      total: items.length,
      completed: items.filter((_, i) => i < items.length).length, // 처리 시도한 모든 항목
      failed: 0 // 실제 실패 개수는 상태에서 계산
    };

    console.log("🏁 [Batch Generate] 모든 처리 완료", finalStats);
    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
    setProcessingProgress({ current: 0, total: 0 });

    // 완료 후 결과 요약 토스트
    setTimeout(() => {
      const currentItems = batchItems;
      const completedCount = currentItems.filter(item => item.status === "완료").length;
      const failedCount = currentItems.filter(item => item.status === "실패").length;

      if (completedCount > 0) {
        toast.success(`배치 변형 생성 완료: ${completedCount}개 성공, ${failedCount}개 실패`);
      } else {
        toast.error(`배치 변형 생성 실패: 모든 이미지 처리에 실패했습니다.`);
      }
    }, 1000);
  }, [
    activeMode,
    aperture,
    aspectRatio,
    cameraAngle,
    cameraDirection,
    lightingSelections,
    negativePrompt,
    poseSelections,
    prompt,
    refinedPrompt,
    subjectDirection,
    batchItems,
    zoomLevel,
    isProcessing
  ]);

  const results = useMemo(
    () => {
      const mapped = batchItems.map(item => {
        const result = {
          id: `result-${item.id}`,
          name: item.name,
          beforeSrc: item.src,
          afterSrc: item.result?.image,
          status: item.status,
          completedAt: item.result?.completedAt,
          errorMessage: item.errorMessage
        };

        // 완료된 항목 확인 (간소화된 로그)
        if (item.status === "완료" && !item.result?.image) {
          console.warn(`⚠️ [Results] 완료된 항목에 이미지 없음: ${item.name}`);
        }

        return result;
      });

      // 결과 요약 (필요시에만 로그)
      const completedWithImages = mapped.filter(r => r.status === "완료" && r.afterSrc).length;
      if (completedWithImages > 0) {
        console.log(`✅ [Results] 배치 결과: ${completedWithImages}개 완료`);
      }

      return mapped;
    },
    [batchItems]
  );

  const completedCount = results.filter(item => item.status === "완료").length;
  const pendingCount = results.filter(item => item.status === "대기" || item.status === "진행 중").length;
  const failedCount = results.filter(item => item.status === "실패").length;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <section className="border-b bg-muted/60 backdrop-blur-sm">
        <Tabs value={activeMode} onValueChange={value => setActiveMode(value as GenerationMode)}>
          <div className="flex flex-wrap gap-2 px-6 py-4">
            <TabsList className="flex flex-wrap gap-1 rounded-lg border bg-background/80 p-1 shadow-sm">
              {BATCH_MODES.map(mode =>
                mode.href ? (
                  <Link
                    key={mode.id}
                    href={mode.href}
                    className={cn(
                      "rounded-lg border border-transparent px-4 py-3 text-xs transition-all duration-200",
                      "bg-background/70 text-foreground hover:bg-primary/10 hover:border-primary/20",
                      "flex flex-col text-left shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                    )}
                  >
                    <span className="font-medium leading-none">{mode.label}</span>
                    <span className="text-[11px] text-muted-foreground">{mode.description}</span>
                  </Link>
                ) : (
                  <TabsTrigger
                    key={mode.id}
                    value={mode.id}
                    className={cn(
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg",
                      "rounded-lg border border-transparent px-4 py-3 text-xs transition-all duration-200",
                      "bg-background/50 text-muted-foreground hover:bg-background/70 hover:text-foreground",
                      "data-[state=active]:border-primary/30 hover:shadow-sm transform hover:-translate-y-0.5"
                    )}
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-medium leading-none">{mode.label}</span>
                      <span className="text-[11px] text-muted-foreground">{mode.description}</span>
                    </div>
                  </TabsTrigger>
                )
              )}
            </TabsList>
          </div>
        </Tabs>
      </section>

      <div className="flex flex-col gap-6 px-4 lg:flex-row lg:gap-8 lg:px-6">
        <aside className="w-full shrink-0 space-y-6 lg:w-80">
          <PromptPanel
            mode={activeMode}
            prompt={prompt}
            refinedPrompt={refinedPrompt}
            negativePrompt={negativePrompt}
            cameraAngle={cameraAngle}
            aperture={aperture}
            aspectRatio={aspectRatio}
            subjectDirection={subjectDirection}
            cameraDirection={cameraDirection}
            zoomLevel={zoomLevel}
            useGpt={useGptPrompt}
            onToggleGpt={handleToggleGpt}
            gptLoading={false}
            onPromptChange={setPrompt}
            onRefinedPromptChange={setRefinedPrompt}
            onNegativePromptChange={setNegativePrompt}
            onCameraAngleChange={setCameraAngle}
            onApertureChange={setAperture}
            onAspectRatioChange={setAspectRatio}
            onSubjectDirectionChange={setSubjectDirection}
            onCameraDirectionChange={setCameraDirection}
            onZoomLevelChange={setZoomLevel}
            lightingSelections={lightingSelections}
            onLightingSelectionsChange={handleLightingSelectionsChange}
            poseSelections={poseSelections}
            onPoseSelectionsChange={handlePoseSelectionsChange}
            onResetPresets={handleResetPresets}
            onGenerate={action => {
              if (action === "primary" || action === "remix") {
                void handleGenerate();
              }
            }}
            onRefinePrompt={handleRefinePrompt}
            generating={isProcessing}
          />
        </aside>

        <section className="flex min-h-[70vh] flex-1 flex-col gap-6">
          <Card className="flex-1">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center justify-between text-lg">
                <span>업로드된 이미지</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {batchItems.length}/{MAX_BATCH_ITEMS}
                  </span>
                  <Button size="sm" onClick={handleUploadClick} disabled={isProcessing}>
                    이미지 업로드
                  </Button>
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                다수 이미지를 업로드해 순차적으로 변환할 수 있습니다. 업로드된 항목은 위에서 아래로 실행 순서가 결정됩니다.
              </p>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
              {batchItems.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
                  <p>아직 업로드된 이미지가 없습니다.</p>
                  <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isProcessing}>
                    이미지 선택하기
                  </Button>
                </div>
              ) : (
                <ScrollArea className="w-full">
                  <div className="flex gap-4 pb-4">
                    {batchItems.map(item => (
                      <div
                        key={item.id}
                        className="w-60 shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm"
                      >
                        <div className="aspect-square bg-muted">
                          <img
                            src={item.src}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground" title={item.name}>
                              {item.name}
                            </span>
                            <Badge
                              variant={
                                item.status === "실패"
                                  ? "destructive"
                                  : item.status === "완료"
                                    ? "default"
                                    : "secondary"
                              }
                              className="text-xs"
                            >
                              {item.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.sizeLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            배치 작업에 추가된 원본 이미지입니다.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">변환 결과</CardTitle>
              <p className="text-sm text-muted-foreground">
                생성된 결과는 전후 비교 슬라이더로 검토할 수 있습니다. 아직 생성되지 않은 항목은 플레이스홀더가 표시됩니다.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    console.log("🐆 [Button Click] 변형 생성 버튼 클릭!", {
                      batchItemsLength: batchItems.length,
                      isProcessing,
                      disabled: batchItems.length === 0 || isProcessing
                    });
                    handleGenerate();
                  }}
                  disabled={batchItems.length === 0 || isProcessing}
                >
                  {isProcessing
                    ? `변환 중... (${processingProgress.current}/${processingProgress.total})`
                    : "변형 생성"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadAll}
                  disabled={completedCount === 0 || isProcessing}
                >
                  전체 다운로드 ({completedCount})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={batchItems.length === 0 || isProcessing}
                >
                  전체 삭제
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>생성 완료 {completedCount}건</span>
                <span>대기/진행 {pendingCount}건</span>
                <span>실패 {failedCount}건</span>
                {isProcessing && processingProgress.total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">
                      {Math.round((processingProgress.current / processingProgress.total) * 100)}%
                    </span>
                  </div>
                )}
              </div>
              {results.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
                  <p>변환 결과가 아직 없습니다.</p>
                  <p className="text-xs text-muted-foreground">이미지를 업로드하면 결과가 여기에 표시됩니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {results.map(item => {
                    const isProcessingItem = item.status === "진행 중";
                    const isPendingItem = item.status === "대기";
                    const isFailedItem = item.status === "실패";
                    const statusVariant = isFailedItem ? "destructive" : item.status === "완료" ? "default" : "secondary";

                    return (
                      <div key={item.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-foreground" title={item.name}>
                              {item.name}
                            </h3>
                            {isProcessingItem ? (
                              <p className="text-xs text-primary">모델이 이미지를 생성 중입니다...</p>
                            ) : isPendingItem ? (
                              <p className="text-xs text-muted-foreground">대기 중인 작업입니다.</p>
                            ) : isFailedItem && item.errorMessage ? (
                              <p className="text-xs text-destructive">{item.errorMessage}</p>
                            ) : item.completedAt ? (
                              <p className="text-xs text-muted-foreground">완료 시각: {new Date(item.completedAt).toLocaleString()}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground">업로드 이미지와 변환 결과를 비교합니다.</p>
                            )}
                          </div>
                          <Badge variant={statusVariant}>{item.status}</Badge>
                        </div>
                        <DiffSlider
                          beforeSrc={item.beforeSrc}
                          afterSrc={item.afterSrc}
                          labelBefore="원본"
                          labelAfter="결과"
                        />
                        <Separator />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* 통합된 최근 생성 기록 (프리셋 페이지와 동일한 형태) */}
      <section className="mx-4 lg:mx-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">최근 생성 기록</CardTitle>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                1개 생성, 프리셋, 배치 생성의 모든 기록이 통합되어 표시됩니다.
              </p>
              <div className="text-xs text-muted-foreground">
                {loading ? "기록 동기화 중" : `${historyRecordsLimited.length}개 표시 중`}
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                    className="group relative overflow-hidden rounded-lg border bg-card aspect-[4/3]"
                    role="button"
                    tabIndex={0}
                  >
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt="generated"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16.67vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        이미지 없음
                      </div>
                    )}
                    <div className="absolute inset-0 flex flex-col justify-between bg-black/0 transition group-hover:bg-black/60">
                      <div className="flex items-start justify-between p-2 opacity-0 transition group-hover:opacity-100">
                        <div className="rounded bg-black/80 px-2 py-1 text-xs text-white">
                          {record.metadata?.batchItem ? "배치" :
                           record.mode === "create" ? "생성" :
                           record.mode === "remix" ? "변형" : "기타"}
                        </div>
                        <div className="rounded bg-black/80 px-2 py-1 text-xs text-white">
                          {new Date(record.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="p-2 opacity-0 transition group-hover:opacity-100">
                        <div className="rounded bg-black/80 px-2 py-1 text-xs text-white line-clamp-2">
                          {recordLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {historyRecordsLimited.length === 0 && (
                <div className="col-span-full flex h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
                  {loading ? "기록을 불러오는 중..." : "아직 생성된 이미지가 없습니다."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value > 100 ? 0 : value > 10 ? 1 : 2)} ${sizes[i]}`;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("파일을 읽을 수 없습니다."));
      }
    };
    reader.onerror = () => {
      reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    };
    reader.readAsDataURL(file);
  });
}
