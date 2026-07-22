export const subjectTypeValues = ["character", "object"] as const;
export type SubjectType = (typeof subjectTypeValues)[number];

// 단일 진실 원천. character=초록(피부 안전), object=마젠타.
export function keyColorForSubject(subjectType: SubjectType): { hex: string; name: string } {
  return subjectType === "object"
    ? { hex: "#FF00FF", name: "magenta" }
    : { hex: "#00FF00", name: "green" };
}
