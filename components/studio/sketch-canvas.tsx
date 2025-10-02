"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Eraser, Paintbrush, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface SketchCanvasProps {
  onSaveSketch?: (dataUrl: string) => void;
  width?: number;
  height?: number;
}

export function SketchCanvas({ onSaveSketch, width = 512, height = 512 }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState("#000000");
  const [tool, setTool] = useState<"brush" | "eraser">("brush");

  // 캔버스 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 흰색 배경으로 초기화
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, []);

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColor;
      }

      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, brushSize, brushColor, tool]
  );

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

  const saveSketch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSaveSketch?.(dataUrl);
  }, [onSaveSketch]);

  const downloadSketch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `sketch-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, []);

  const colors = [
    "#000000", // 검정
    "#ffffff", // 흰색
    "#ff0000", // 빨강
    "#00ff00", // 초록
    "#0000ff", // 파랑
    "#ffff00", // 노랑
    "#ff00ff", // 마젠타
    "#00ffff", // 시안
    "#808080", // 회색
    "#ffa500", // 주황
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>스케치 캔버스</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 도구 선택 */}
        <div className="flex items-center gap-2">
          <Button
            variant={tool === "brush" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("brush")}
          >
            <Paintbrush className="h-4 w-4 mr-2" />
            브러시
          </Button>
          <Button
            variant={tool === "eraser" ? "default" : "outline"}
            size="sm"
            onClick={() => setTool("eraser")}
          >
            <Eraser className="h-4 w-4 mr-2" />
            지우개
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            <Trash2 className="h-4 w-4 mr-2" />
            전체 지우기
          </Button>
        </div>

        {/* 색상 선택 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">색상</label>
          <div className="flex gap-2 flex-wrap">
            {colors.map((color) => (
              <button
                key={color}
                className={cn(
                  "w-8 h-8 rounded border-2 transition-all",
                  brushColor === color ? "border-primary scale-110" : "border-muted"
                )}
                style={{ backgroundColor: color }}
                onClick={() => setBrushColor(color)}
              />
            ))}
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-8 h-8 rounded border-2 border-muted cursor-pointer"
            />
          </div>
        </div>

        {/* 브러시 크기 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">브러시 크기: {brushSize}px</label>
          <Slider
            value={[brushSize]}
            onValueChange={(value) => setBrushSize(value[0])}
            min={1}
            max={50}
            step={1}
          />
        </div>

        {/* 캔버스 */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <Button onClick={saveSketch} className="flex-1">
            참조이미지로 설정
          </Button>
          <Button variant="outline" onClick={downloadSketch}>
            <Download className="h-4 w-4 mr-2" />
            다운로드
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
