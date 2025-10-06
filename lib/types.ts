import type { PlanId } from "@/lib/constants";

export type GenerationMode =
  | "create"
  | "remix"
  | "camera"
  | "crop"
  | "prompt-adapt"
  | "lighting"
  | "pose"
  | "style"
  | "external"
  | "upscale"
  | "sketch";

export type AspectRatioPreset = "original" | "16:9" | "9:16" | "1:1" | "4:3";

export interface PromptMetadata {
  refinedPrompt: string;
  rawPrompt: string;
  camera?: {
    angle?: string;
    aperture?: string;
    focalLength?: string;
    subjectDirection?: string;
    cameraDirection?: string;
    zoom?: string;
  };
  aspectRatio?: AspectRatioPreset;
  referenceGallery?: string[];
  lighting?: Record<string, string[]>;
  pose?: Record<string, string[]>;
  externalPresets?: string[];
  guidance?: string[];
  negativePrompt?: string;
}

export interface ImageDiffMeta {
  beforeUrl?: string;
  afterUrl?: string;
  sliderLabelBefore?: string;
  sliderLabelAfter?: string;
}

export interface GeneratedImageDocument {
  id: string;
  userId: string;
  mode: GenerationMode;
  promptMeta: PromptMetadata;
  status: "pending" | "completed" | "failed";
  imageUrl?: string;
  thumbnailUrl?: string;
  originalImageUrl?: string;
  diff?: ImageDiffMeta;
  metadata?: Record<string, unknown>;
  model: string;
  costCredits?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptHistoryDocument {
  id: string;
  userId: string;
  prompt: string;
  refinedPrompt: string;
  mode: GenerationMode;
  createdAt: string;
}

export interface UserPlanSnapshot {
  id: PlanId;
  activated: boolean;
  requestedId?: PlanId | null;
  requestedAt?: string | null;
  requestReason?: string | null;
  requestUsage?: string | null;
  changedAt?: string | null;
  changedBy?: string | null;
}

export interface UserProfileDocument {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan?: UserPlanSnapshot | null;
  credits?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  readBy: Record<string, string>;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}
