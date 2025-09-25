export const ADMIN_UID = "ACHNkfU8GNT5u8AtGNP0UsszqIR2";
export const CREDITS_PER_IMAGE = 10 as const;

export type PlanId = "guest" | "basic" | "deluxe" | "premium";

export const PLANS: Record<PlanId, {
  id: PlanId;
  name: string;
  monthlyCredits: number;
  monthlyImages: number;
}> = {
  guest:   { id: "guest",   name: "게스트",   monthlyCredits: 50,   monthlyImages: 5 },
  basic:   { id: "basic",   name: "베이직",   monthlyCredits: 1000, monthlyImages: 100 },
  deluxe:  { id: "deluxe",  name: "디럭스",   monthlyCredits: 3300, monthlyImages: 330 },
  premium: { id: "premium", name: "프리미엄", monthlyCredits: 12000, monthlyImages: 1200 },
};
