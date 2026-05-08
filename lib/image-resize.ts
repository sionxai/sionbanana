export type ResizeImageOptions = {
  maxSize: number;
  mime: string;
  quality: number;
};

export type ResizeImageResult = {
  dataUrl: string;
  mime: string;
};

export function resizeImageToDataUrl(
  file: File,
  options: ResizeImageOptions = { maxSize: 1920, mime: "image/jpeg", quality: 0.85 }
): Promise<ResizeImageResult> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const { width, height } = fitWithinMaxSize(image.naturalWidth, image.naturalHeight, options.maxSize);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("이미지 리사이즈를 준비하지 못했습니다."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve({
          dataUrl: canvas.toDataURL(options.mime, options.quality),
          mime: options.mime
        });
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 불러오지 못했습니다."));
    };

    image.src = objectUrl;
  });
}

function fitWithinMaxSize(width: number, height: number, maxSize: number): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const longestSide = Math.max(safeWidth, safeHeight);
  if (longestSide <= maxSize) {
    return { width: safeWidth, height: safeHeight };
  }

  const scale = maxSize / longestSide;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  };
}
