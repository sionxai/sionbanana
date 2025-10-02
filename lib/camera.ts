export const DEFAULT_CAMERA_ANGLE = "default";

export const DEFAULT_SUBJECT_DIRECTION = "default";
export const DEFAULT_CAMERA_DIRECTION = "default";
export const DEFAULT_ZOOM_LEVEL = "default";

export const APERTURE_NONE = 0; // 기본값 (no aperture setting)
export const APERTURE_DEFAULT = 0; // 초기 기본값
export const APERTURE_MIN = 0; // 기본값
export const APERTURE_MAX = 220; // f/22

export function formatAperture(rawValue: number): string {
  if (rawValue === APERTURE_NONE) {
    return "기본값";
  }
  const value = rawValue / 10;
  const display = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `f${display}`;
}

export function getCameraAngleLabel(angle?: string | null): string {
  if (!angle || angle === DEFAULT_CAMERA_ANGLE) {
    return "기본값";
  }
  return angle;
}

export function getDirectionalLabel(
  value: string | null | undefined,
  defaultToken: string = DEFAULT_SUBJECT_DIRECTION
): string {
  if (!value || value === defaultToken) {
    return "기본값";
  }
  return value;
}
