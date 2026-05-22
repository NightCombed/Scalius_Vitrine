import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Loader2, Scissors, ZoomIn, ZoomOut, X } from "lucide-react";
import { toast } from "sonner";
import Cropper from "react-easy-crop";
import { getCroppedImg } from "@/lib/imageUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ImageUploadProps {
  bucket: string;
  pathPrefix: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  id?: string;
  aspect?: number;
}

export function ImageUpload({ bucket, pathPrefix, value, onChange, placeholder = "https://...", id, aspect = 1 }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [fileName, setFileName] = useState("");
  const [isFullyOpen, setIsFullyOpen] = useState(false);

  useEffect(() => {
    if (showCropper) {
      const timer = setTimeout(() => {
        setIsFullyOpen(true);
      }, 350); // Delay rendering to let the dialog scale animation finish completely
      return () => clearTimeout(timer);
    } else {
      setIsFullyOpen(false);
    }
  }, [showCropper]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageSrc(reader.result as string);
      setShowCropper(true);
    });
    reader.readAsDataURL(file);
  };

  const onEditUrl = () => {
    if (!value) return;
    setFileName("image-from-url.jpg");
    setImageSrc(value);
    setShowCropper(true);
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    setShowCropper(false);
    
    try {
      const mimeType = "image/jpeg";
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, mimeType);
      if (!croppedImage) throw new Error("Falha ao processar imagem. Verifique se o link permite acesso externo (CORS).");

      const storagePath = `${pathPrefix}-${Date.now()}.jpg`;
      
      const { error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, croppedImage, {
          contentType: mimeType
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      onChange(publicUrlData.publicUrl);
      toast.success("Imagem enviada com sucesso!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro no processamento", { description: err.message });
    } finally {
      setUploading(false);
      setImageSrc(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <Input 
            id={id}
            placeholder={placeholder} 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            className="pr-8 w-full"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-colors"
              title="Limpar link"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={onSelectFile}
          disabled={uploading}
        />
        <Button 
          type="button" 
          variant="secondary" 
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload de arquivo"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </Button>
        {value && !uploading && (
          <Button 
            type="button" 
            variant="outline" 
            size="icon"
            onClick={onEditUrl}
            title="Ajustar imagem (Crop)"
          >
            <Scissors className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden">
          <div className="p-6 pb-0">
            <DialogHeader>
              <DialogTitle>Ajustar Imagem</DialogTitle>
            </DialogHeader>
          </div>
          
          <div className="flex-1 relative bg-black mt-4">
            {imageSrc && isFullyOpen && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                minZoom={0.1}
                restrictPosition={false}
              />
            )}
          </div>
          
          <div className="p-6 bg-background space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium">Zoom</label>
                <span className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setZoom(prev => Math.max(0.1, prev - 0.05))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <input
                  type="range"
                  value={zoom}
                  min={0.1}
                  max={3}
                  step={0.01}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setZoom(prev => Math.min(3, prev + 0.05))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Dica: O zoom abaixo de 1.0 permite ver a imagem inteira mesmo que não preencha o corte.
              </p>
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowCropper(false)}>Cancelar</Button>
              <Button onClick={handleUpload}>Confirmar e Salvar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {value && (
        <div className="mt-2 rounded-md overflow-hidden border border-border inline-block max-w-[200px] max-h-32 bg-muted relative">
          <img 
            src={value} 
            alt="Preview" 
            className="object-contain w-full h-full absolute inset-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            onLoad={(e) => {
              (e.target as HTMLImageElement).style.display = 'block';
            }}
          />
          <div className="w-full h-full min-h-[4rem] flex items-center justify-center text-xs text-muted-foreground opacity-50">
            Preview
          </div>
        </div>
      )}
    </div>
  );
}
