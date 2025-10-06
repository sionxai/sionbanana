export interface StoryboardStyleDocument {
  label: string;
  description: string;
  grading: string;
  bgm: string;
  sfx: string[];
  voTone: string;
  previewGradient?: string;
  referenceImageUrl?: string;
  prompt?: string;
  order: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface StoryboardStyle extends StoryboardStyleDocument {
  id: string;
}

export type StoryboardStyleInput = Omit<StoryboardStyleDocument, "createdAt" | "updatedAt" | "createdBy" | "updatedBy">;

