export const DEFAULT_CAMERA_ANGLE = "default";

export const DEFAULT_SUBJECT_DIRECTION = "default";
export const DEFAULT_CAMERA_DIRECTION = "default";
export const DEFAULT_ZOOM_LEVEL = "default";

export const APERTURE_DEFAULT = 12; // f/1.2 (leftmost position)
export const APERTURE_MIN = 12; // f/1.2
export const APERTURE_MAX = 220; // f/22

export function formatAperture(rawValue: number): string {
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
