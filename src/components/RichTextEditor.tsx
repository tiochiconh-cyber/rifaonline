import React, { useRef, useEffect, useState } from "react";
import { 
  Bold as BoldIcon, 
  Italic as ItalicIcon, 
  Underline as UnderlineIcon, 
  Strikethrough as StrokeIcon, 
  List, 
  ListOrdered, 
  Link as LinkIcon, 
  Image as ImageIcon, 
  Film, 
  Smile, 
  Type, 
  Paintbrush, 
  ChevronDown,
  Upload,
  Sparkles,
  RefreshCw,
  Eye
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

const TEXT_SIZES = [
  { label: "Normal", value: "p", style: "font-size: 14px;" },
  { label: "Título 1", value: "h1", style: "font-size: 24px; font-weight: 800; margin-top: 8px; margin-bottom: 4px;" },
  { label: "Título 2", value: "h2", style: "font-size: 20px; font-weight: 700; margin-top: 6px; margin-bottom: 4px;" },
  { label: "Título 3", value: "h3", style: "font-size: 16px; font-weight: 600; margin-top: 4px; margin-bottom: 4px;" },
  { label: "Pequeno", value: "small", style: "font-size: 11px; font-weight: 500; color: #64748b;" },
];

const TEXT_COLORS = [
  { name: "Preto", hex: "#1e293b" },
  { name: "Cinza", hex: "#64748b" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Azul", hex: "#2563eb" },
  { name: "Verde", hex: "#16a34a" },
  { name: "Laranja", hex: "#ea580c" },
  { name: "Vermelho", hex: "#dc2626" },
  { name: "Roxo", hex: "#9333ea" },
  { name: "Rosa", hex: "#db2777" },
  { name: "Dourado", hex: "#ca8a04" },
];

const HIGHLIGHT_COLORS = [
  { name: "Sem fundo", hex: "transparent" },
  { name: "Amarelo", hex: "#fef08a" },
  { name: "Verde Light", hex: "#bbf7d0" },
  { name: "Azul Light", hex: "#bfdbfe" },
  { name: "Rosa Light", hex: "#fbcfe8" },
  { name: "Roxo Light", hex: "#e9d5ff" },
  { name: "Laranja Light", hex: "#fed7aa" },
  { name: "Cinza Light", hex: "#f1f5f9" },
];

const EMOJIS = [
  "🎓", "⭐", "🎉", "🔥", "🏆", "👀", "💬", "❤️", "📱", "💳", 
  "💸", "🎧", "🚀", "📢", "📅", "🎁", "💥", "👇", "✨", "📌"
];

export default function RichTextEditor({ value, onChange, placeholder = "Digite seu texto aqui...", id }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeSize, setActiveSize] = useState("p");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // Modais
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFileLoading, setImageFileLoading] = useState(false);

  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  // Sync internal state with prop value on initial render, or if external values change
  useEffect(() => {
    if (editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html === "<br>" ? "" : html);
    }
  };

  const executeCommand = (command: string, value: string = "") => {
    // Restore focus if lost
    if (editorRef.current && document.activeElement !== editorRef.current) {
      editorRef.current.focus();
    }
    
    document.execCommand(command, false, value);
    handleInput();
  };

  const handleTextSize = (sizeOption: typeof TEXT_SIZES[0]) => {
    executeCommand("formatBlock", `<${sizeOption.value}>`);
    setDropdownOpen(false);
    setActiveSize(sizeOption.value);
  };

  // Base64 file selector helper
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecione uma imagem válida (png, jpg, etc).");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Imagem muito grande! O limite para imagens incorporadas é de 2MB.");
      return;
    }

    setImageFileLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        executeCommand("insertImage", reader.result);
        setImageModalOpen(false);
        setImageUrl("");
      }
      setImageFileLoading(false);
    };
    reader.onerror = () => {
      alert("Erro ao ler o arquivo.");
      setImageFileLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleInsertLink = () => {
    if (!linkUrl) return;
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : "";
    const displayText = linkText || selectedText || linkUrl;
    
    const htmlToInsert = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">${displayText}</a>`;
    executeCommand("insertHTML", htmlToInsert);
    setLinkModalOpen(false);
    setLinkUrl("");
    setLinkText("");
  };

  const handleInsertImageUrl = () => {
    if (!imageUrl) return;
    executeCommand("insertImage", imageUrl);
    setImageModalOpen(false);
    setImageUrl("");
  };

  const handleInsertVideo = () => {
    if (!videoUrl) return;
    let embedUrl = videoUrl;

    // Convert regular YouTube link to embed link
    if (videoUrl.includes("youtube.com/watch?v=")) {
      const vidId = videoUrl.split("v=")[1]?.split("&")[0];
      if (vidId) embedUrl = `https://www.youtube.com/embed/${vidId}`;
    } else if (videoUrl.includes("youtu.be/")) {
      const vidId = videoUrl.split("youtu.be/")[1]?.split("?")[0];
      if (vidId) embedUrl = `https://www.youtube.com/embed/${vidId}`;
    }

    const htmlToInsert = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 10px 0; border-radius: 8px;" contenteditable="false">
        <iframe src="${embedUrl}" style="position: absolute; top:0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
      </div>
      <p>&nbsp;</p>
    `;

    executeCommand("insertHTML", htmlToInsert);
    setVideoModalOpen(false);
    setVideoUrl("");
  };

  return (
    <div id={id} className="relative border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/40 shadow-xs flex flex-col">
      {/* 1. Editor Toolbar */}
      <div className="flex flex-wrap items-center bg-white border-b border-slate-200/80 p-1.5 gap-1 text-slate-700 select-none">
        
        {/* Style Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            <span>{TEXT_SIZES.find(s => s.value === activeSize)?.label || "Texto"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          
          {dropdownOpen && (
            <div className="absolute left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 min-w-[120px] flex flex-col gap-0.5">
              {TEXT_SIZES.map((size) => (
                <button
                  key={size.value}
                  type="button"
                  onClick={() => handleTextSize(size)}
                  className={`text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 rounded-lg font-medium transition cursor-pointer ${
                    activeSize === size.value ? "bg-indigo-50 text-indigo-700 font-bold" : ""
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        {/* Action icons */}
        <button
          type="button"
          onClick={() => executeCommand("bold")}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          title="Negrito (Ctrl+B)"
        >
          <BoldIcon className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand("italic")}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          title="Itálico (Ctrl+I)"
        >
          <ItalicIcon className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand("underline")}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          title="Sublinhado (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand("strikeThrough")}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          title="Riscado"
        >
          <StrokeIcon className="w-4 h-4 text-slate-600" />
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        {/* Text Color Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setTextColorOpen(!textColorOpen);
              setBgColorOpen(false);
              setEmojiOpen(false);
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-0.5 justify-center cursor-pointer"
            title="Cor da Fonte"
          >
            <Type className="w-4 h-4 text-slate-600" />
            <span className="w-3 h-1 bg-indigo-600 block mt-3 -ml-2 rounded-sm"></span>
          </button>
          
          {textColorOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 min-w-[130px]">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Cor da Fonte</p>
              <div className="grid grid-cols-5 gap-1.5">
                {TEXT_COLORS.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => {
                      executeCommand("foreColor", col.hex);
                      setTextColorOpen(false);
                    }}
                    className="w-5 h-5 rounded-md border border-slate-250 transition transform hover:scale-110 cursor-pointer"
                    style={{ backgroundColor: col.hex }}
                    title={col.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Background Color Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setBgColorOpen(!bgColorOpen);
              setTextColorOpen(false);
              setEmojiOpen(false);
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-0.5 justify-center cursor-pointer"
            title="Destaque de Fundo"
          >
            <Paintbrush className="w-4 h-4 text-slate-600" />
            <span className="w-3 h-1 bg-yellow-300 block mt-3 -ml-2 rounded-sm"></span>
          </button>
          
          {bgColorOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 min-w-[130px]">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Fundo Destaque</p>
              <div className="grid grid-cols-4 gap-1.5">
                {HIGHLIGHT_COLORS.map((col) => (
                  <button
                    key={col.hex}
                    type="button"
                    onClick={() => {
                      executeCommand("hiliteColor", col.hex);
                      setBgColorOpen(false);
                    }}
                    className="w-5 h-5 rounded-md border border-slate-200/80 transition transform hover:scale-110 cursor-pointer flex items-center justify-center"
                    style={{ backgroundColor: col.hex }}
                    title={col.name}
                  >
                    {col.hex === "transparent" && <span className="text-[10px] text-slate-400">X</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        {/* Lists */}
        <button
          type="button"
          onClick={() => executeCommand("insertOrderedList")}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Lista Numérica"
        >
          <ListOrdered className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => executeCommand("insertUnorderedList")}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Lista de Marcadores"
        >
          <List className="w-4 h-4 text-slate-600" />
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        {/* Interactive additions */}
        <button
          type="button"
          onClick={() => setLinkModalOpen(true)}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Inserir Link"
        >
          <LinkIcon className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => setImageModalOpen(true)}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Inserir Imagem"
        >
          <ImageIcon className="w-4 h-4 text-slate-600" />
        </button>

        <button
          type="button"
          onClick={() => setVideoModalOpen(true)}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Inserir Vídeo"
        >
          <Film className="w-4 h-4 text-slate-600" />
        </button>

        {/* Emoji Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setEmojiOpen(!emojiOpen);
              setTextColorOpen(false);
              setBgColorOpen(false);
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Inserir Figurinha / Emoji"
          >
            <Smile className="w-4 h-4 text-slate-600" />
          </button>
          
          {emojiOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 w-[180px]">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Inserir Emoji</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      executeCommand("insertHTML", emoji);
                      setEmojiOpen(false);
                    }}
                    className="text-base hover:scale-125 transition duration-150 p-1 cursor-pointer hover:bg-slate-50 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-slate-200 mx-1"></div>

        {/* Toggle Mode button for Preview */}
        <button
          type="button"
          onClick={() => setIsPreview(!isPreview)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition ml-auto cursor-pointer ${
            isPreview ? "bg-indigo-600 text-white shadow-xs" : "hover:bg-slate-100 text-slate-500"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{isPreview ? "Editar" : "Visualizar"}</span>
        </button>
      </div>

      {/* 2. Modais Popups para Link, Imagem, Vídeo */}
      {linkModalOpen && (
        <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-xs p-4 flex flex-col justify-center items-center gap-3">
          <div className="w-full max-w-sm space-y-3 bg-white border border-slate-200 p-4 rounded-xl shadow-xl">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <LinkIcon className="w-4 h-4 text-indigo-500" /> Inserir Link de Hipertexto
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Texto para exibir (Opcional)"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
              />
              <input
                type="url"
                placeholder="https://exemplo.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setLinkModalOpen(false);
                  setLinkUrl("");
                  setLinkText("");
                }}
                className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-750 transition shadow-xs cursor-pointer"
              >
                Inserir
              </button>
            </div>
          </div>
        </div>
      )}

      {imageModalOpen && (
        <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-xs p-4 flex flex-col justify-center items-center gap-3">
          <div className="w-full max-w-sm space-y-3.5 bg-white border border-slate-200 p-4 rounded-xl shadow-xl">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-indigo-550" /> Adicionar Imagem ao Texto
            </h4>
            
            {/* Duas alternativas: Upload ou Link */}
            <div className="space-y-2.5">
              <div className="relative border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 rounded-lg p-3 text-center flex flex-col items-center justify-center min-h-[70px] cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition mb-1" />
                <span className="text-slate-600 font-bold text-[9px]">Fazer upload local de imagem</span>
                <span className="text-indigo-600 font-bold text-[8px] mt-0.5">Limite de 2MB</span>
                {imageFileLoading && (
                  <div className="absolute inset-0 bg-white/90 flex items-center justify-center rounded-lg">
                    <span className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full"></span>
                  </div>
                )}
              </div>

              <div className="text-center font-bold text-[9px] text-slate-350 my-1">— OU USE UM LINK DE WEB —</div>

              <input
                type="url"
                placeholder="https://site.com/foto.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setImageModalOpen(false);
                  setImageUrl("");
                }}
                className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!imageUrl}
                onClick={handleInsertImageUrl}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-750 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer"
              >
                Inserir
              </button>
            </div>
          </div>
        </div>
      )}

      {videoModalOpen && (
        <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-xs p-4 flex flex-col justify-center items-center gap-3">
          <div className="w-full max-w-sm space-y-3 bg-white border border-slate-200 p-4 rounded-xl shadow-xl">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Film className="w-4 h-4 text-indigo-500" /> Incorporar Vídeo (YouTube/Vimeo/Direto)
            </h4>
            <div className="space-y-2">
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
              />
              <span className="text-[9px] text-slate-400 block">* Suporta links diretos do YouTube ou vídeos públicos .mp4</span>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setVideoModalOpen(false);
                  setVideoUrl("");
                }}
                className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInsertVideo}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-750 transition shadow-xs cursor-pointer"
              >
                Incorporar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Editor Content Area */}
      <div className="relative flex-1 bg-white flex flex-col">
        {isPreview ? (
          <div 
            className="flex-1 p-3.5 min-h-[140px] text-slate-750 font-sans leading-relaxed text-xs overflow-y-auto max-h-[400px]"
            dangerouslySetInnerHTML={{ __html: value || `<p className="text-slate-400 italic">Nenhum texto formatado disponível para exibição.</p>` }}
          />
        ) : (
          <>
            <div
              ref={editorRef}
              contentEditable={true}
              onInput={handleInput}
              className="flex-1 p-3.5 min-h-[140px] max-h-[400px] text-slate-800 font-sans leading-relaxed text-xs outline-none overflow-y-auto prose prose-xs"
              style={{ minHeight: "140px" }}
            />
            {(!value || value === "<br>") && (
              <span className="absolute left-3.5 top-3.5 text-slate-400 font-medium text-xs pointer-events-none select-none">
                {placeholder}
              </span>
            )}
          </>
        )}
      </div>

      {/* 4. Help tooltip footer */}
      <div className="flex justify-between items-center bg-slate-50 border-t border-slate-150 px-3 py-1 text-[9px] text-slate-400 font-bold tracking-wide">
        <span className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-indigo-500/80">
          <Sparkles className="w-3 h-3 animate-pulse" /> Suporte avançado WYSIWYG
        </span>
        <span>HTML Habilitado</span>
      </div>
    </div>
  );
}
