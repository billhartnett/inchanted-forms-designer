import { useEffect } from "react";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";

export type PdfBackgroundProps = {
  src: string;
  onLoaded?: (size: { width: number; height: number }) => void;
};

export function PdfBackground({ src, onLoaded }: PdfBackgroundProps) {
  const [image] = useImage(src);

  useEffect(() => {
    if (!image || !onLoaded) return;
    onLoaded({ width: image.width, height: image.height });
  }, [image, onLoaded, src]);

  if (!image) return null;

  // Render PDF at full resolution, don't scale here
  // The Stage handles zoom/pan, fields use normalized coordinates
  return (
    <KonvaImage
      key={src}
      image={image}
      x={0}
      y={0}
      width={image.width}
      height={image.height}
      listening={false}
    />
  );
}

export default PdfBackground;
