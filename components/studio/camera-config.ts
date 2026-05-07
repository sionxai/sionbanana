export const CAMERA_MODE_BASE_PROMPT =
  "Cinematic capture of the supplied scene. Preserve the exact subject, outfit, pose, facial expression, lighting, and background environment. Only adjust camera movement, framing, and focal length to realize the requested shot.";

export const CAMERA_MODE_PROMPT_GUIDELINE =
  "Keep the original background and subject pose unchanged. Move the camera instead of repositioning or reposing the subject, and avoid replacing the scene with abstract or blank backdrops.";

export const CAMERA_MODE_NEGATIVE_GUARD =
  "empty background, plain white background, blank backdrop, white void, isolated subject, cutout silhouette, studio cyclorama, different facial expression, changed expression, new pose, different pose, rotated subject, replaced subject, missing background";

export const CAMERA_MODE_DEFAULT_DIRECTIVE =
  "Use the default camera angle. Position the camera directly in front of the subject. Keep the subject facing forward. Maintain a neutral zoom level.";

export const generateCombinedCameraPrompt = (settings: {
  angle?: string;
  aperture?: string;
  subjectDirection?: string;
  cameraDirection?: string;
  zoom?: string;
}): string => {
  const prompts: string[] = [];

  // Camera angle
  if (settings.angle && settings.angle !== "기본값") {
    const anglePrompts: Record<string, string> = {
      "로우앵글": "Position camera low, shooting upward for a dramatic low-angle perspective.",
      "웜즈아이": "Use an extreme close-up worm's eye view from ground level looking up.",
      "하이앵글": "Elevate camera high above subject for a commanding high-angle view.",
      "버드아이": "Shoot from bird's eye view directly overhead for aerial perspective.",
      "더치앵글": "Tilt camera at an angle to create dynamic, off-kilter Dutch angle composition.",
      "아이레벨": "Position camera at eye level for natural, direct perspective.",
      "반대방향": "Position camera behind or to the opposite side of the subject."
    };
    if (anglePrompts[settings.angle]) {
      prompts.push(anglePrompts[settings.angle]);
    }
  }

  // Aperture settings - skip if "기본값" is selected
  if (settings.aperture && settings.aperture.trim().length > 0) {
    const normalizedAperture = settings.aperture.trim().toLowerCase();

    // Skip aperture prompt entirely if user selected "기본값" (no aperture)
    if (normalizedAperture === "기본값") {
      // Do nothing - no aperture prompt
    } else if (normalizedAperture.includes("f1.2") || normalizedAperture.includes("f1.4") || normalizedAperture.includes("f1.8") || normalizedAperture.includes("f2.8") || normalizedAperture.includes("f3.5") || normalizedAperture.includes("f4.0") || normalizedAperture.includes("f5.6")) {
      prompts.push("Use wide aperture for shallow depth of field and bokeh effect.");
    } else if (normalizedAperture.includes("f8") || normalizedAperture.includes("f11") || normalizedAperture.includes("f16") || normalizedAperture.includes("f22")) {
      prompts.push("Use narrow aperture for deep focus and sharp background detail.");
    }
  }

  // Subject direction
  if (settings.subjectDirection && settings.subjectDirection !== "default") {
    const directionPrompts: Record<string, string> = {
      "정면": "Subject faces forward directly toward camera.",
      "좌측면": "Subject turns to show left profile to camera.",
      "우측면": "Subject turns to show right profile to camera.",
      "후면": "Subject turns away showing back to camera.",
      "위에서": "Subject looks upward toward sky or ceiling.",
      "아래에서": "Subject looks downward toward ground or floor."
    };
    if (directionPrompts[settings.subjectDirection]) {
      prompts.push(directionPrompts[settings.subjectDirection]);
    }
  }

  // Camera direction
  if (settings.cameraDirection && settings.cameraDirection !== "default") {
    const cameraPrompts: Record<string, string> = {
      "정면": "Position camera directly in front of subject.",
      "좌측면": "Position camera to left side of subject.",
      "우측면": "Position camera to right side of subject.",
      "후면": "Position camera behind subject for rear view.",
      "위에서": "Elevate camera above subject looking down.",
      "아래에서": "Lower camera below subject looking up."
    };
    if (cameraPrompts[settings.cameraDirection]) {
      prompts.push(cameraPrompts[settings.cameraDirection]);
    }
  }

  // Zoom level
  if (settings.zoom && settings.zoom !== "default") {
    const zoomPrompts: Record<string, string> = {
      "줌인": "Move closer for tighter framing and more intimate composition.",
      "줌아웃": "Pull back for wider framing showing more environment.",
      "확대": "Use telephoto lens for compressed perspective and background isolation.",
      "익스트림 롱샷": "Use an extreme long shot / ELS where the subject appears very small against a vast, dominant environment, emphasizing location, era, scale, or isolation.",
      "롱샷 / 와이드샷": "Use a long shot / wide shot showing the full body and broad surrounding space to clarify the relationship between the subject and environment.",
      "풀샷": "Use a full shot / FS framing the subject from head to toe, clearly showing posture, wardrobe, and body movement.",
      "니샷": "Use a knee shot / KS framing the subject from the knees upward, balancing body movement with facial expression.",
      "미디엄 롱샷": "Use a medium long shot / MLS framing from the thighs or knees upward, balancing dialogue and physical action.",
      "미디엄샷": "Use a medium shot / MS framing from the waist upward, suitable for dialogue, interview, or explanatory scenes.",
      "미디엄 클로즈업": "Use a medium close-up / MCU framing from the chest or upper torso upward, emphasizing facial expression and spoken emotion.",
      "클로즈업": "Use a close-up / CU centered on the full face, emphasizing emotion, reaction, and immersion.",
      "빅 클로즈업": "Use a big close-up / BCU filling the frame with part of the face, emphasizing tension, tears, or subtle micro-emotions.",
      "익스트림 클로즈업": "Use an extreme close-up / ECU isolating only the eyes, mouth, hands, or a small object detail to emphasize clues, unease, symbolism, or fine texture."
    };
    if (zoomPrompts[settings.zoom]) {
      prompts.push(zoomPrompts[settings.zoom]);
    }
  }

  return prompts.join(' ');
};
