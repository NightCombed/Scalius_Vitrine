import React, { useRef, useState, useEffect } from "react";
import { useScroll, useTransform, motion } from "framer-motion";

interface ContainerScrollProps {
  titleComponent: React.ReactNode;
}

export const ContainerScroll: React.FC<ContainerScrollProps> = ({ titleComponent }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // offset: começa a contar quando o topo do container chega ao centro da tela
  //         termina quando o fundo do container sai pelo topo da tela
  // Isso faz a animação durar mais enquanto o celular está visível e centralizado
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.85", "end 0.1"]
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Rotação 3D: inclina ao entrar, endireita enquanto centra
  const rotateX = useTransform(scrollYProgress, [0.0, 0.35], [18, 0], { clamp: true });

  // Escala
  const scale = useTransform(
    scrollYProgress,
    [0.0, 0.35],
    isMobile ? [0.85, 0.95] : [1.08, 1],
    { clamp: true }
  );

  // Sobe levemente ao entrar
  const translateY = useTransform(scrollYProgress, [0.0, 0.35], [60, 0], { clamp: true });

  // Imagem: rola inteiramente durante a fase "lenta" do celular no centro (0.30 a 0.82)
  const imageY = useTransform(
    scrollYProgress,
    [0.30, 0.46, 0.64, 0.82],
    ["0%", "-6%", "-18%", "-29%"],
    { clamp: true }
  );

  // Celular quase gruda de forma não linear:
  // - 0.0 a 0.25: entra em velocidade normal (y = 0)
  // - 0.25 a 0.82: desacelera muito no meio da tela (y vai de 0 a 410px, neutralizando o scroll geral)
  // - 0.82 a 1.0: sai em velocidade normal (mantém y = 410px)
  const phoneY = useTransform(
    scrollYProgress,
    [0.0, 0.25, 0.82, 1.0],
    [0, 0, isMobile ? 220 : 410, isMobile ? 220 : 410],
    { clamp: true }
  );

  // Badge "Rolar para navegar" some após começar a rolar imagem
  const badgeOpacity = useTransform(scrollYProgress, [0.30, 0.42], [0.9, 0], { clamp: true });

  return (
    <div
      ref={containerRef}
      className="relative pt-16 pb-[250px] md:pt-24 md:pb-[440px] px-4 overflow-visible"
      style={{ perspective: "1200px" }}
    >
      {/* Cabeçalho da seção */}
      <motion.div
        style={{ translateY }}
        className="max-w-4xl mx-auto text-center mb-10 md:mb-14 px-4"
      >
        {titleComponent}
      </motion.div>

      {/* Mockup do iPhone 3D */}
      <motion.div
        style={{
          rotateX,
          scale,
          y: phoneY,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 40px rgba(255,94,0,0.05)",
        }}
        className="max-w-[310px] md:max-w-[340px] mx-auto h-[580px] md:h-[640px] w-full border-[10px] border-[#1e2022] bg-[#1e2022] rounded-[48px] relative overflow-hidden ring-4 ring-[#2d3135] ring-opacity-50"
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90px] h-[25px] bg-black rounded-full z-30 flex items-center justify-end px-2.5">
          <div className="w-2 h-2 rounded-full bg-[#111] border border-[#222]"></div>
        </div>

        {/* Speaker */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-[40px] h-[3px] bg-[#333] rounded-full z-30"></div>

        {/* Tela */}
        <div className="h-full w-full overflow-hidden rounded-[38px] bg-white relative">

          {/* Reflexo de vidro */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 pointer-events-none z-20 rounded-[38px]" />

          {/* Imagem da vitrine (rola por dentro da tela) */}
          <div className="w-full h-full overflow-hidden bg-[#fafafa]">
            <motion.img
              src="/store_print.png"
              alt="Vitrine da sua Loja no Celular"
              style={{ y: imageY }}
              className="w-full h-auto block select-none pointer-events-none"
            />
          </div>

          {/* Badge "Rolar para navegar" */}
          <motion.div
            style={{ opacity: badgeOpacity }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-white text-xs font-semibold shadow-lg z-25 border border-white/10 whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-[#FF5E00] animate-pulse"></span>
            Rolar página para navegar
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};
