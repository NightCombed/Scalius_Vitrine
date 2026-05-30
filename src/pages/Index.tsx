import React, { useEffect, useRef, useState } from 'react';
import '../scalius-landing.css';
import { ContainerScroll } from '../components/ContainerScroll';

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // Reveal on scroll
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

      // Magnetic Buttons
      const magneticBtns = document.querySelectorAll('.btn');
      magneticBtns.forEach(btn => {
        const el = btn as HTMLElement;
        el.addEventListener('mousemove', (e: Event) => {
          const me = e as MouseEvent;
          const rect = el.getBoundingClientRect();
          const x = me.clientX - rect.left - rect.width / 2;
          const y = me.clientY - rect.top - rect.height / 2;
          el.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = 'translate(0px, 0px)'; });
      });

      // Bento Hover Glow
      const bentoItems = document.querySelectorAll('.bento-item');
      bentoItems.forEach(item => {
        const el = item as HTMLElement;
        el.addEventListener('mousemove', (e: Event) => {
          const me = e as MouseEvent;
          const rect = el.getBoundingClientRect();
          el.style.setProperty('--mouse-x', `${me.clientX - rect.left}px`);
          el.style.setProperty('--mouse-y', `${me.clientY - rect.top}px`);
        });
      });

      // Problem cards glow
      const syncPointer = (e: PointerEvent) => {
        document.querySelectorAll('.problem-card[data-glow]').forEach(card => {
          const el = card as HTMLElement;
          const rect = el.getBoundingClientRect();
          el.style.setProperty('--x', (e.clientX - rect.left).toFixed(2));
          el.style.setProperty('--xp', (e.clientX / window.innerWidth).toFixed(2));
          el.style.setProperty('--y', (e.clientY - rect.top).toFixed(2));
          el.style.setProperty('--yp', (e.clientY / window.innerHeight).toFixed(2));
        });
      };
      document.addEventListener('pointermove', syncPointer);

      // Rotating word in Hero
      const palavras = ['independente.', 'automatizada.', 'profissional.', 'inteligente.', 'escalável.'];
      const elemento = document.querySelector('.palavra-rotativa .palavra') as HTMLElement;
      let index = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      if (elemento) {
        intervalId = setInterval(() => {
          elemento.style.animation = 'slideOutUp 0.3s ease forwards';
          setTimeout(() => {
            index = (index + 1) % palavras.length;
            elemento.textContent = palavras[index];
            elemento.style.animation = 'slideInUp 0.3s ease forwards';
          }, 300);
        }, 3000);
      }

      // Tabs
      const tabBtns = document.querySelectorAll('.tab-btn');
      const tabPanes = document.querySelectorAll('.tab-pane');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          tabPanes.forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          const targetId = btn.getAttribute('data-tab');
          if (targetId) document.getElementById(targetId)?.classList.add('active');
        });
      });

      // FAQ Accordion
      const faqQuestions = document.querySelectorAll('.faq-question');
      faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
          const item = question.parentElement;
          const answer = question.nextElementSibling as HTMLElement;
          const isActive = item?.classList.contains('active');
          document.querySelectorAll('.faq-item').forEach(faq => {
            faq.classList.remove('active');
            const ans = faq.querySelector('.faq-answer') as HTMLElement;
            if (ans) ans.style.maxHeight = '';
          });
          if (!isActive && item && answer) {
            item.classList.add('active');
            answer.style.maxHeight = answer.scrollHeight + 'px';
          }
        });
      });

      return () => {
        document.removeEventListener('pointermove', syncPointer);
        if (intervalId) clearInterval(intervalId);
      };
    } catch (e) {
      console.error('Error executing landing scripts', e);
    }
  }, []);

  return (
    <div className="scalius-landing-wrapper" ref={containerRef}>

      {/* NAVBAR */}
      <div className="navbar-wrapper">
        <nav className="navbar">
          <a href="#" className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            Scalius
          </a>
          <div className="nav-links">
            <a href="#problema">Vantagens</a>
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como Funciona</a>
            <a href="#depoimentos">Depoimentos</a>
            <a href="#precos">Planos</a>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <a href="#" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>Login</a>
            <a href="#precos" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>Criar Loja</a>
          </div>
        </nav>
      </div>

      {/* HERO SECTION */}
      <section className="hero">
        <div className="container hero-container">
          {/* Esquerda: Textos e CTA */}
          <div className="hero-content reveal">
            <div className="hero-badge">✦ Plataforma all-in-one para lojistas</div>
            <h1>
              Venda mais com sua loja online completa e{' '}
              <span className="palavra-rotativa"><span className="palavra">independente.</span></span>
            </h1>
            <p>Catálogo, Pix automático, frete inteligente e notificações em tempo real. Tudo em um só lugar, sem depender do WhatsApp.</p>

            <div className="hero-btns">
              <a href="#precos" className="btn btn-brand">Criar minha loja grátis</a>
            </div>

            {/* Integration logos com SVGs reais */}
            <div className="integration-logos-wrapper">
              <span className="integration-logos-label">INTEGRADO COM:</span>
              <div className="integration-logos">
                {/* Mercado Pago */}
                <div className="integration-card">
                  <img src="/svg/mercado-pago-wordmark.svg" alt="Mercado Pago" style={{ height: '20px', width: 'auto' }} />
                </div>
                {/* Melhor Envio */}
                <div className="integration-card">
                  <img src="/svg/melhor-envio.png" alt="Melhor Envio" style={{ height: '20px', width: 'auto' }} />
                </div>
                {/* AWS */}
                <div className="integration-card">
                  <img src="/svg/aws.png" alt="AWS" style={{ height: '20px', width: 'auto' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Direita: Composição Flutuante */}
          <div className="hero-visual reveal" style={{ transitionDelay: '0.2s' }}>
            <div className="composition-wrapper">
              <div className="screenshots-stack">
                <div className="stack-card card-back-left">
                  <div className="browser-mini-header"></div>
                  <img src="/pedidos_print.png" alt="Gestão de Pedidos" className="stack-img" />
                </div>
                <div className="stack-card card-back-right">
                  <div className="browser-mini-header"></div>
                  <img src="/produtos_print.png" alt="Gestão de Produtos" className="stack-img" />
                </div>
                <div className="stack-card card-main">
                  <div className="browser-frame">
                    <div className="browser-header">
                      <div className="dots"><span></span><span></span><span></span></div>
                      <div className="url-bar">admin.scalius.com.br</div>
                    </div>
                    <img src="/admin_print.png" alt="Scalius Dashboard" className="main-screenshot" />
                  </div>
                </div>
                <div className="stack-mobile">
                  <div className="iphone-frame">
                    <img src="/store_print.png" alt="Scalius Storefront" className="mobile-screenshot" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTAINER SCROLL - Vitrine no Celular */}
      <ContainerScroll
        titleComponent={
          <>
            <div className="inline-flex items-center gap-2 bg-[#FF5E00]/10 text-[#FF5E00] px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-4">
              ✦ Vitrine Ultra-Rápida
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-[#1D2939] tracking-tight leading-none mb-6">
              Sua loja inteira otimizada <br />
              <span className="text-[#FF5E00]">para vender mais no celular</span>
            </h2>
            <p className="text-[#667085] text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              Diga adeus aos PDFs e ao atendimento manual. Com a Scalius, seus clientes navegam por categorias, selecionam variações e fecham a compra em segundos.
            </p>
          </>
        }
      />

      {/* RECURSOS EXTRAS - BENTO GRID */}
      <section className="section" id="recursos-extras" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="bento-header reveal">
            <h2>Pequenos detalhes que fazem gigante diferença.</h2>
            <p>A experiência SaaS premium da Scalius também brilha nos pequenos detalhes administrativos.</p>
          </div>
          <div className="bento-grid">
            <div className="bento-item bento-large reveal">
              <div className="bento-icon-wrapper">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
              </div>
              <div style={{ maxWidth: '350px', position: 'relative', zIndex: 2 }}>
                <h3>Dashboard de Faturamento</h3>
                <p>Seus números importam. Acompanhe a receita diária, verifique as transações de múltiplos usuários e controle a operação de perto.</p>
              </div>
              <div className="bento-img" style={{ background: 'white', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Métricas Hoje</div>
                  <div style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: '10px', padding: '4px 8px', borderRadius: '4px' }}>Atualizado</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f0f0f0', paddingBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#f5f5f5', borderRadius: '8px' }}></div>
                  <div>
                    <div style={{ width: '80px', height: '10px', background: '#e0e0e0', marginBottom: '6px', borderRadius: '2px' }}></div>
                    <div style={{ width: '40px', height: '8px', background: '#f0f0f0', borderRadius: '2px' }}></div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '40px', height: '40px', background: '#f5f5f5', borderRadius: '8px' }}></div>
                  <div>
                    <div style={{ width: '60px', height: '10px', background: '#e0e0e0', marginBottom: '6px', borderRadius: '2px' }}></div>
                    <div style={{ width: '30px', height: '8px', background: '#f0f0f0', borderRadius: '2px' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bento-item reveal" style={{ transitionDelay: '0.1s' }}>
              <div className="bento-icon-wrapper" style={{ color: 'var(--success)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
              </div>
              <h3>Customização da Vitrine</h3>
              <p>Adicione Banner de Capa (Hero), Avatar da Loja, Redes Sociais e personalize sua loja com poucos cliques e veja as edições salvando na hora.</p>
            </div>

            <div className="bento-item reveal" style={{ transitionDelay: '0.2s' }}>
              <div className="bento-icon-wrapper" style={{ color: 'var(--primary)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <h3>100% Mobile Optimized</h3>
              <p>Tanto a Vitrine para seus clientes, quanto o Painel Admin foram desenhados com "Mobile-first" para não engasgar no 4G.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT SHOWCASE ZIG-ZAG */}
      <section className="section" id="recursos">
        <div className="container">
          <div className="bento-header reveal" style={{ marginBottom: '100px' }}>
            <h2>Um arsenal completo.<br />Nenhum detalhe de fora.</h2>
            <p>Abaixo detalhamos a artilharia pesada desenvolvida na Scalius para você focar apenas em faturar e escalar.</p>
          </div>

          {/* Row 1 */}
          <div className="showcase-row reveal">
            <div className="showcase-text">
              <div className="hero-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>Catálogo Sem Limites</div>
              <h2>Seu estoque sempre certo. Nunca mais passe vergonha.</h2>
              <p>Vendeu a última blusa tamanho G? Ela some da vitrine automaticamente. Nosso motor de variantes rastreia tamanhos e cores e bloqueia a venda do que você não tem em mãos.</p>
              <ul className="showcase-feature-list">
                {['Produtos e pedidos 100% ilimitados', 'Criação de Variações dinâmicas (Tamanho, Cor, Material)', 'Rastreio e controle de estoque independente por variação', 'Carrinho nativo robusto e Categorias com filtros', 'Upload avançado de imagens por produto'].map(item => (
                  <li key={item}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {item}</li>
                ))}
              </ul>
            </div>
            <div className="showcase-image"></div>
          </div>

          {/* Row 2 */}
          <div className="showcase-row reveal">
            <div className="showcase-text">
              <div className="hero-badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>Checkout de Alta Conversão</div>
              <h2>Como funciona o Pix Automático da Scalius?</h2>
              <p>1. Cliente fecha a compra na vitrine.<br />2. Sistema gera QR Code na hora.<br />3. Mercado Pago aprova em segundos.<br />4. Você escuta o PLIM e o status atualiza.<br /><strong>Tudo isso sem você dar UM "bom dia".</strong></p>
              <ul className="showcase-feature-list">
                {['Integração Oficial Transparente com Mercado Pago', 'Aceita Pix nativo com verificação automática de baixa', 'InfinitePay Nativo: Receba Pix com 0% de Taxa (Plano Pro)', 'Opção de Pix Manual (Cliente digita sua chave estática)', 'Mudança de Status do Pedido no exato segundo pago'].map(item => (
                  <li key={item}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {item}</li>
                ))}
              </ul>
            </div>
            <div className="showcase-image"></div>
          </div>

          {/* Row 3 */}
          <div className="showcase-row reveal">
            <div className="showcase-text">
              <div className="hero-badge" style={{ background: '#E0E7FF', color: '#4F46E5' }}>Central Logística</div>
              <h2>Cálculo de Frete Real e Etiqueta em 1 Clique</h2>
              <p>Chega de ficar cotando PAC ou Sedex para clientes na mão. Sua vitrine já calcula o frete exato conectada na tecnologia do Melhor Envio (Correios e +).</p>
              <ul className="showcase-feature-list">
                {['Cálculo automático: Correios, Jadlog, Azul Cargo e etc', 'Lógica avançada de "Caixa Única" para múltiplos produtos', 'Geração de Etiqueta com 1 clique (Plano Pro)', 'Entrega local por KM (Dinâmico) ou Taxa Fixa (Bairro)', 'Opção nativa de "Retirada na Loja Física"'].map(item => (
                  <li key={item}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {item}</li>
                ))}
              </ul>
            </div>
            <div className="showcase-image"></div>
          </div>

          {/* Row 4 */}
          <div className="showcase-row reveal">
            <div className="showcase-text">
              <div className="hero-badge" style={{ background: '#FEF3C7', color: '#D97706' }}>Retenção de Clientes</div>
              <h2>Portal B2C com Histórico de Compras</h2>
              <p>Uma loja de verdade possui Login e Senha. Aumente sua recompra dando aos clientes um perfil para acompanhar o status do pedido e os envios passados.</p>
              <ul className="showcase-feature-list">
                {['Fluxo de Autenticação Segura (Login / Cadastro)', 'Histórico visual de todos os pedidos já feitos pelo cliente', 'Link público de acompanhamento do andamento do pacote', 'Vinculação automática de pedidos anônimos à conta criada', 'Autopreenchimento de endereços em compras futuras'].map(item => (
                  <li key={item}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {item}</li>
                ))}
              </ul>
            </div>
            <div className="showcase-image"></div>
          </div>

          {/* Row 5 */}
          <div className="showcase-row reveal">
            <div className="showcase-text">
              <div className="hero-badge" style={{ background: '#FCE7F3', color: '#DB2777' }}>Operação & Notificações</div>
              <h2>Centro de Comando "Pulse" e Alertas em Tempo Real</h2>
              <p>Você nunca mais vai perder um pedido novo. Nosso painel administrativo envia notificações como mágica, além de garantir o controle total sobre a loja.</p>
              <ul className="showcase-feature-list">
                {['Som de Alerta (Caixa Registradora) para novo pedido gerado', 'Aba do navegador pisca visualmente para não perder vendas', 'Emails automáticos para os clientes em cada mudança de status', 'Painel para alterar, cancelar e visualizar pedidos com extrema facilidade', 'Controle de múltiplos usuários (Dono, Gerente, Staff)'].map(item => (
                  <li key={item}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DB2777" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {item}</li>
                ))}
              </ul>
            </div>
            <div className="showcase-image"></div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA - TABS */}
      <section className="section" id="como-funciona" style={{ background: 'var(--bg-surface)' }}>
        <div className="container">
          <div className="bento-header reveal">
            <h2>Seu negócio rodando no piloto automático.</h2>
            <p>Veja como é simples iniciar e escalar suas vendas com a Scalius.</p>
          </div>
          <div className="tabs-wrapper reveal" style={{ transitionDelay: '0.1s' }}>
            <div className="tabs-list">
              <button className="tab-btn active" data-tab="tab-1">
                <h3>1. Crie seu Catálogo</h3>
                <p>Adicione fotos, preços e variações em poucos cliques. Sua vitrine fica pronta em minutos e otimizada para celular.</p>
              </button>
              <button className="tab-btn" data-tab="tab-2">
                <h3>2. Configure Pagamentos</h3>
                <p>Ative o recebimento via Pix e Cartão. Todo o fluxo de checkout e aprovação acontece de forma automática, sem sua intervenção.</p>
              </button>
              <button className="tab-btn" data-tab="tab-3">
                <h3>3. Envie com Desconto</h3>
                <p>Imprima etiquetas com integração nativa do Melhor Envio ou gerencie taxas locais. Cliente acompanha o pedido em tempo real.</p>
              </button>
            </div>
            <div className="tab-content-wrapper">
              <div className="tab-pane active" id="tab-1">
                <div style={{ background: 'white', borderRadius: '12px', width: '80%', height: '80%', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[{ w: 120, w2: 60 }, { w: 100, w2: 80 }].map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', ...(i === 0 ? { borderBottom: '1px solid #eee', paddingBottom: '12px' } : {}) }}>
                      <div style={{ width: '48px', height: '48px', background: '#f0f0f0', borderRadius: '8px' }}></div>
                      <div>
                        <div style={{ width: `${r.w}px`, height: '12px', background: '#e0e0e0', marginBottom: '8px', borderRadius: '4px' }}></div>
                        <div style={{ width: `${r.w2}px`, height: '10px', background: 'var(--success)', borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="tab-pane" id="tab-2">
                <div style={{ background: 'white', borderRadius: '12px', width: '70%', height: '70%', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '18px' }}>Pagamento Confirmado</div>
                  <div style={{ width: '80%', height: '10px', background: '#eee', borderRadius: '4px' }}></div>
                </div>
              </div>
              <div className="tab-pane" id="tab-3">
                <div style={{ background: 'white', borderRadius: '12px', width: '80%', height: '70%', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Etiqueta Gerada</div>
                  <div style={{ flex: 1, border: '2px dashed #e0e0e0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS MARQUEE */}
      <section className="section" id="depoimentos" style={{ paddingBottom: 0 }}>
        <div className="container">
          <div className="bento-header reveal" style={{ marginBottom: '40px' }}>
            <h2>Amado por lojas que não param de crescer.</h2>
            <p>Junte-se aos negócios que abandonaram o WhatsApp e automatizaram suas vendas.</p>
          </div>
        </div>
        <div className="marquee-wrapper reveal" style={{ transitionDelay: '0.1s' }}>
          <div className="marquee">
            {[
              { nome: 'Mariana Souza', tipo: 'Moda Fitness', texto: '"Depois da Scalius, parei de perder madrugadas respondendo clientes. Acordo e os pedidos já estão pagos."', init: 'M' },
              { nome: 'Carlos Oliveira', tipo: 'Eletrônicos Express', texto: '"A integração de frete mudou meu jogo. Meus clientes de outro estado agora compram sem ficar me perguntando preço de PAC."', init: 'C' },
              { nome: 'Patricia Lima', tipo: 'Cosméticos Naturais', texto: '"Pensei que seria difícil montar a loja. Em 20 minutos coloquei meus 30 produtos e já recebi minha primeira venda."', init: 'P' },
              { nome: 'Lucas Mendes', tipo: 'Streetwear Oficial', texto: '"O melhor custo benefício de longe. O dashboard é super limpo e direto ao ponto. Exatamente o que eu precisava."', init: 'L' },
              { nome: 'Ana Clara', tipo: 'Acessórios Finos', texto: '"Adeus catálogo em PDF! Agora só mando o link da minha vitrine e os clientes acham tudo lindo e profissional."', init: 'A' },
              // duplicates for loop
              { nome: 'Mariana Souza', tipo: 'Moda Fitness', texto: '"Depois da Scalius, parei de perder madrugadas respondendo clientes. Acordo e os pedidos já estão pagos."', init: 'M' },
              { nome: 'Carlos Oliveira', tipo: 'Eletrônicos Express', texto: '"A integração de frete mudou meu jogo. Meus clientes de outro estado agora compram sem ficar me perguntando preço de PAC."', init: 'C' },
            ].map((t, i) => (
              <div key={i} className="testimonial-card">
                <div className="stars">★★★★★</div>
                <p className="testimonial-text">{t.texto}</p>
                <div className="testimonial-author">
                  <div className="author-avatar">{t.init}</div>
                  <div className="author-info"><h4>{t.nome}</h4><p>{t.tipo}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="precos">
        <div className="container">
          <div className="bento-header reveal">
            <h2>Simples, justo e escalável.</h2>
            <p>Sem taxas abusivas por venda. Assine e tenha previsibilidade financeira.</p>
          </div>
          <div className="pricing-grid">
            {/* Essencial */}
            <div className="pricing-card reveal">
              <div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Essencial</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1rem' }}>Para quem está dando o primeiro passo digital com a loja.</p>
                <div className="price">R$ 89<span>/mês</span></div>
              </div>
              <ul className="pricing-features">
                {['Produtos e Pedidos Ilimitados', 'Pix Manual e Mercado Pago', 'Área do Cliente e Histórico', 'Etiqueta Melhor Envio (Manual)', '1 Usuário Administrador'].map(f => (
                  <li key={f}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> {f}</li>
                ))}
              </ul>
              <a href="#" className="btn" style={{ width: '100%', justifyContent: 'center', background: 'white', border: '1px solid var(--border-light)', color: 'var(--text-main)' }}>Assinar Essencial</a>
            </div>

            {/* Pro */}
            <div className="pricing-card pro reveal" style={{ transitionDelay: '0.1s' }}>
              <div className="price-badge">O Poder Completo</div>
              <div>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Pro</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1rem' }}>Automação total para escalar sua operação B2B e B2C.</p>
                <div className="price">R$ 159<span>/mês</span></div>
              </div>
              <ul className="pricing-features">
                <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <strong style={{ color: 'var(--primary)' }}>Tudo do Essencial, mais:</strong></li>
                {['InfinitePay (0% taxa Pix)', 'Etiqueta em 1-Clique', 'Múltiplos Usuários (Gerente/Staff)', 'E-mails Automáticos para Clientes', 'Sem "Powered by Scalius"'].map(f => (
                  <li key={f}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <strong>{f}</strong></li>
                ))}
              </ul>
              <a href="#" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Assinar Pro</a>
            </div>
          </div>

          {/* Tabela de Comparação */}
          <div className="compare-section reveal">
            <h2 className="compare-title">Compare todos os recursos</h2>
            <div className="compare-table-wrapper">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Recurso</th>
                    <th style={{ width: '25%' }}>Essencial</th>
                    <th style={{ width: '25%' }}>Pro</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="category-row"><td colSpan={3}>Vendas e Checkout</td></tr>
                  {[['Pedidos ilimitados','✓','✓'],['Produtos ilimitados','✓','✓'],['Carrinho e checkout na loja','✓','✓'],['Estoque em tempo real','✓','✓'],['Categorias e filtros','✓','✓'],['Upload de imagens de produtos','✓','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Métodos de Pagamento</td></tr>
                  {[['Pix Manual (cliente digita chave)','✓','✓'],['Mercado Pago QR Code automático','✓','✓'],['InfinitePay (0% taxa Pix)','✕','✓'],['Cartão de Crédito','✕','✕']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Entrega e Logística</td></tr>
                  {[['Retirada na loja','✓','✓'],['Entrega local por bairro (taxa fixa)','✓','✓'],['Entrega local por km (distância dinâmica)','✓','✓'],['Rastreamento de entrega','✕','✕']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr key="frete"><td>Frete nacional (Melhor Envio)</td><td>Cliente vê preço, gera etiqueta manual</td><td>Cliente vê preço, gera etiqueta 1-clique</td></tr>
                  <tr className="category-row"><td colSpan={3}>Notificações - Loja</td></tr>
                  {[['Som alerta em tempo real (novo pedido)','✓','✓'],['Customizar volume/desativar som','✓','✓'],['Notificação visual (aba piscando)','✓','✓'],['Email alertas loja (novo pedido/status)','✕','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Notificações - Cliente</td></tr>
                  {[['Botão WhatsApp manual (loja envia)','✓','✓'],['Email automático (criado, pronto, entregue)','✕','✓'],['SMS automático','✕','✕']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Autenticação Cliente (B2C)</td></tr>
                  {[['Login opcional','✓','✓'],['Histórico de pedidos do cliente','✓','✓'],['Endereços salvos para recompra','✓','✓'],['Acompanhar pedido (link público)','✓','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Admin - Operação e Gestão</td></tr>
                  {[['Painel de pedidos e mudança de status','✓','✓'],['Painel 100% responsivo no Mobile','✓','✓'],['Dashboard Básico (vendas do dia)','✓','✓'],['Gerenciar produtos e estoque em tempo real','✓','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr><td>Dashboard Completo (gráficos, tendências)</td><td className="icon-cross">✕</td><td><span className="icon-soon">Em breve</span></td></tr>
                  <tr><td>Cupons de Desconto</td><td className="icon-cross">✕</td><td><span className="icon-soon">Em breve</span></td></tr>
                  <tr className="category-row"><td colSpan={3}>Usuários e Permissões</td></tr>
                  {[['1 usuário (dono da loja)','✓','✓'],['Múltiplos usuários (gerente, staff)','✕','✓'],['Permissões por perfil','✕','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr className="category-row"><td colSpan={3}>Identidade Visual da Loja</td></tr>
                  {[['Customizar Logo, Banner e Cores','✓','✓']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':'icon-cross'}>{e}</td><td className={p==='✓'?'icon-check':'icon-cross'}>{p}</td></tr>
                  ))}
                  <tr><td>"Powered by Scalius" no rodapé</td><td className="icon-check">✓</td><td className="icon-cross">✕ (Selo Removido)</td></tr>
                  <tr><td>Remover marca Scalius completamente</td><td className="icon-cross">✕</td><td className="icon-cross">✕</td></tr>
                  <tr className="category-row"><td colSpan={3}>Integrações</td></tr>
                  {[['Mercado Pago','✓','✓'],['Melhor Envio','✓','✓'],['InfinitePay','✕','✓'],['Suporte via WhatsApp','Melhor esforço','Melhor esforço']].map(([r,e,p])=>(
                    <tr key={r}><td>{r}</td><td className={e==='✓'?'icon-check':e==='✕'?'icon-cross':''}>{e}</td><td className={p==='✓'?'icon-check':p==='✕'?'icon-cross':''}>{p}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <div className="bento-header reveal">
            <h2>Perguntas Frequentes</h2>
            <p>Tudo que você precisa saber para dar o próximo passo.</p>
          </div>
          <div className="faq-container reveal" style={{ transitionDelay: '0.1s' }}>
            {[
              { q: 'Preciso ter CNPJ para criar minha loja?', a: 'Não! Você pode começar a vender utilizando apenas o seu CPF. Caso seu negócio cresça, você pode alterar para um CNPJ a qualquer momento direto no painel da sua conta integrada do Mercado Pago.' },
              { q: 'Como funciona o pagamento via Pix?', a: 'A integração é nativa. Quando o cliente finaliza o pedido com Pix, o QR Code é gerado. Assim que ele paga, o sistema reconhece o pagamento automaticamente e muda o status do pedido, sem você precisar checar comprovantes.' },
              { q: 'Existe limite de vendas ou cobrança de taxa por pedido?', a: 'Nossa plataforma não cobra taxa por transação ou limite de pedidos! Você paga apenas o valor fixo da sua assinatura. As únicas taxas de transação são as cobradas pelo próprio gateway de pagamento (Mercado Pago).' },
              { q: 'Consigo usar meu próprio domínio (site)?', a: 'Sim, em planos suportados você poderá conectar seu próprio domínio (ex: www.sualoja.com.br) para dar ainda mais credibilidade ao seu negócio.' },
            ].map(({ q, a }) => (
              <div key={q} className="faq-item">
                <button className="faq-question">{q}<span className="faq-icon">+</span></button>
                <div className="faq-answer"><div className="faq-answer-inner">{a}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="section" style={{ background: 'var(--bg-surface)', textAlign: 'center' }}>
        <div className="container">
          <div className="reveal">
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, marginBottom: '16px' }}>Pronto para automatizar sua loja?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1.1rem' }}>Crie sua vitrine digital hoje e comece a vender sem depender do WhatsApp.</p>
            <a href="#precos" className="btn btn-brand" style={{ fontSize: '1rem', padding: '16px 32px' }}>Criar minha loja grátis</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#0f1117', color: '#aaa', padding: '40px 24px', textAlign: 'center', fontSize: '14px' }}>
        <div style={{ marginBottom: '16px' }}>
          <a href="#" style={{ color: '#fff', fontWeight: 700, fontSize: '18px', textDecoration: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            Scalius
          </a>
        </div>
        <p>© {new Date().getFullYear()} Scalius Vitrine. Todos os direitos reservados.</p>
      </footer>

    </div>
  );
};

export default Index;
