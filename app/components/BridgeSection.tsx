'use client';

import { useEffect, useState } from 'react';
import {
  CreatureStage,
  type BeePartKey,
  type CreatureStageMode,
} from './library/CreatureStage';
import { LibraryIcon } from './library/LibraryIcons';

type FeatureIconName = 'rotate' | 'structure' | 'motion' | 'annotation';
type ToolIconName = 'model' | 'text' | 'audio' | 'effects';

const PARTS: Array<{
  name: 'Đầu' | 'Ngực' | 'Cánh' | 'Bụng';
  key: BeePartKey;
  title: string;
  summary: string;
  detail: string;
}> = [
  {
    name: 'Đầu',
    key: 'head',
    title: 'Trung tâm cảm giác',
    summary: 'Mang mắt kép, râu và bộ phận miệng.',
    detail: 'Mắt kép giúp ong nhận biết chuyển động; đôi râu cảm nhận mùi, độ ẩm và những tín hiệu quan trọng khi tìm thức ăn.',
  },
  {
    name: 'Ngực',
    key: 'thorax',
    title: 'Trung tâm vận động',
    summary: 'Nơi gắn cánh và ba đôi chân.',
    detail: 'Các bó cơ lớn trong ngực điều khiển nhịp cánh và phối hợp chân, giúp ong cất cánh, giữ thăng bằng và tiếp đất.',
  },
  {
    name: 'Cánh',
    key: 'wing',
    title: 'Bộ phận tạo lực nâng',
    summary: 'Hai đôi cánh mỏng liên kết khi bay.',
    detail: 'Cánh trước và cánh sau phối hợp như một bề mặt nâng. Thay đổi góc và nhịp đập giúp ong tiến, lùi hoặc đứng tại chỗ.',
  },
  {
    name: 'Bụng',
    key: 'abdomen',
    title: 'Khoang cơ quan chính',
    summary: 'Cấu tạo nhiều đốt nối linh hoạt.',
    detail: 'Bụng chứa phần lớn hệ tiêu hóa, tuần hoàn và sinh sản. Các đốt co giãn giúp cơ thể chuyển động mềm mại khi bay.',
  },
];

type PartName = (typeof PARTS)[number]['name'];

const FEATURES: Array<{
  id: CreatureStageMode;
  icon: FeatureIconName;
  title: string;
  body: string;
  viewerTitle: string;
  context: string;
}> = [
  {
    id: 'rotate', icon: 'rotate', title: 'Xoay 360°', body: 'Quan sát mọi góc',
    viewerTitle: 'Xoay 360° · Ong mật', context: 'Kéo · cuộn · tự xoay',
  },
  {
    id: 'structure', icon: 'structure', title: 'Cấu tạo', body: 'Khám phá các bộ phận',
    viewerTitle: 'Cấu tạo cơ thể', context: '4 bộ phận chính',
  },
  {
    id: 'motion', icon: 'motion', title: 'Chuyển động', body: 'Xem cơ chế hoạt động',
    viewerTitle: 'Cơ chế chuyển động', context: '3 hoạt ảnh thật',
  },
  {
    id: 'annotation', icon: 'annotation', title: 'Chú thích', body: 'Đọc thông tin chi tiết',
    viewerTitle: 'Chú thích tương tác', context: 'Chọn để tách bộ phận',
  },
];

const ANIMATIONS = [
  { title: 'Đứng yên', note: 'Quan sát tư thế nghỉ', icon: 'rest' as const },
  { title: 'Bay tại chỗ', note: 'Theo dõi nhịp cánh', icon: 'hover' as const },
  { title: 'Bay tiến', note: 'Xem cơ thể phối hợp', icon: 'fly' as const },
];

const TOOLS: Array<{ id: ToolIconName; icon: ToolIconName; label: string; note: string }> = [
  { id: 'model', icon: 'model', label: 'Model', note: 'Xoay 3D' },
  { id: 'text', icon: 'text', label: 'Văn bản', note: 'Chú thích' },
  { id: 'audio', icon: 'audio', label: 'Âm thanh', note: 'Nghe mô tả' },
  { id: 'effects', icon: 'effects', label: 'Hiệu ứng', note: 'Lưới 3D' },
];

const FEATURE_PATHS: Record<FeatureIconName, string[]> = {
  rotate: [
    'M17.2 7.6a6.6 6.6 0 1 1-1.8-2.5',
    'M17.4 3.1v4.7h-4.7',
    'M7 9.4 10 7l3 2.4M10 7v7',
  ],
  structure: [
    'M10 3.2v4.1M5.2 16.8v-4.1M14.8 16.8v-4.1',
    'M10 7.3 5.2 10v2.7M10 7.3l4.8 2.7v2.7',
    'M8.1 3.2h3.8M3.3 16.8h3.8M12.9 16.8h3.8',
  ],
  motion: [
    'M3.2 11h3l1.8-5 3.4 9 1.9-5h3.5',
    'M15.2 4.1h2.1M16.25 3v2.2',
  ],
  annotation: [
    'M4.1 4.4h11.8v8.2H9l-3.6 3v-3H4.1z',
    'M7 7.2h6M7 9.7h4.2',
  ],
};

const TOOL_PATHS: Record<ToolIconName, string[]> = {
  model: ['M10 2.8 16 6.2v7.1L10 17l-6-3.7V6.2z', 'M4.2 6.3 10 9.7l5.8-3.4M10 9.7V17'],
  text: ['M4 4.2h12M10 4.2v11.6M6.8 15.8h6.4'],
  audio: ['M4.1 8v4M7 5.8v8.4M9.9 3.6v12.8M12.8 6.5v7M15.7 8.2v3.6'],
  effects: [
    'M10 2.6v2.1M10 15.3v2.1M2.6 10h2.1M15.3 10h2.1',
    'M4.8 4.8l1.5 1.5M13.7 13.7l1.5 1.5M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5',
    'M10 7.1 11 9l1.9 1-1.9 1-1 1.9L9 11l-1.9-1L9 9z',
  ],
};

function StrokeIcon({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {paths.map((path) => (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
          key={path}
        />
      ))}
    </svg>
  );
}

/** A live YooLab lesson surface: each learning mode owns one clear interaction. */
export function BridgeSection() {
  const [activeStep, setActiveStep] = useState<CreatureStageMode>('rotate');
  const [selectedPart, setSelectedPart] = useState<PartName | null>(null);
  const [selectedAnimation, setSelectedAnimation] = useState(1);
  const [autoSpin, setAutoSpin] = useState(true);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const activeFeature = FEATURES.find((feature) => feature.id === activeStep) ?? FEATURES[0];
  const activePart = PARTS.find((part) => part.name === selectedPart) ?? null;
  const viewerTitle = activeStep === 'motion'
    ? `${activeFeature.viewerTitle} · ${ANIMATIONS[selectedAnimation].title}`
    : activeFeature.viewerTitle;

  const stopNarration = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const activateFeature = (feature: (typeof FEATURES)[number]) => {
    stopNarration();
    setActiveStep(feature.id);
    setSelectedPart(null);
    if (feature.id === 'rotate') setAutoSpin(true);
    if (feature.id === 'motion') setSelectedAnimation(1);
  };

  const selectPart = (part: PartName) => {
    setSelectedPart(part);
    setAutoSpin(false);
  };

  const toggleNarration = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speaking) {
      stopNarration();
      return;
    }
    const text = activePart
      ? `${activePart.name}. ${activePart.summary} ${activePart.detail}`
      : 'Ong mật có cơ thể chia thành đầu, ngực và bụng. Hai đôi cánh cùng ba đôi chân gắn với phần ngực.';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.94;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const activateTool = (tool: ToolIconName) => {
    if (tool === 'model') {
      activateFeature(FEATURES[0]);
      return;
    }
    if (tool === 'text') {
      activateFeature(FEATURES[3]);
      return;
    }
    if (tool === 'audio') {
      toggleNarration();
      return;
    }
    setEffectsEnabled((value) => !value);
  };

  const toolIsActive = (tool: ToolIconName) => {
    if (tool === 'model') return activeStep === 'rotate' || activeStep === 'structure';
    if (tool === 'text') return activeStep === 'annotation';
    if (tool === 'audio') return speaking;
    return effectsEnabled;
  };

  const showHotspots = activeStep === 'structure' || activeStep === 'annotation';
  const isolatePart = activeStep === 'annotation' ? activePart?.key ?? null : null;

  return (
    <section className="bridge" id="tu-kham-pha-den-tao" data-snap aria-labelledby="bridge-title">
      <div className="bridge-veil" aria-hidden="true" />

      <div className="shell bridge-layout">
        <div className="bridge-copy" data-reveal>
          <div className="bridge-intro">
            <p className="bridge-eyebrow">Bài học · Học sinh xem</p>
            <h2 id="bridge-title">
              <span>Bạn vừa khám phá một bài học trong YooLab.</span>
              <em>Và chính bạn cũng có thể tạo ra nó.</em>
            </h2>
            <p className="bridge-lede">
              Xoay mô hình, đọc chú thích và đổi trạng thái chuyển động để hiểu sâu hơn.
              Mỗi thao tác trong YooLab biến kiến thức thành một trải nghiệm trực quan.
            </p>
          </div>

          <div className="bridge-features" aria-labelledby="bridge-features-title">
            <p id="bridge-features-title" className="bridge-group-label">Khám phá mô hình</p>
            <div className="bridge-feature-grid">
              {FEATURES.map((feature) => (
                <button
                  type="button"
                  className={activeStep === feature.id ? 'is-active' : undefined}
                  aria-pressed={activeStep === feature.id}
                  onClick={() => activateFeature(feature)}
                  key={feature.id}
                >
                  <span className="bridge-feature-icon"><StrokeIcon paths={FEATURE_PATHS[feature.icon]} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bridge-cta-wrap">
            <p className="bridge-group-label">Tiếp tục trong YooLab</p>
            <a className="bridge-cta" href="#thu-vien">
              <span className="bridge-cta-mark" aria-hidden="true">
                <svg viewBox="0 0 28 28">
                  <path d="m14 3 9 5.2-9 5.2-9-5.2zM5 13.2l9 5.2 9-5.2M5 18.4l9 5.2 9-5.2" />
                </svg>
              </span>
              <span className="bridge-cta-copy">
                <b>Mở trong YooLab</b>
                <small>Khám phá thêm mô hình, bài học và hoạt động tương tác.</small>
              </span>
              <span className="bridge-cta-button">Mở YooLab <i aria-hidden="true">↗</i></span>
            </a>
          </div>
        </div>

        <div className={`bridge-viewer${effectsEnabled ? ' is-effects-on' : ''}`} data-reveal>
          <header className="bridge-viewer-head">
            <div>
              <p><span>Model:</span> Ong mật</p>
              <h3>{viewerTitle}</h3>
            </div>
            <span className={`bridge-viewer-context is-${activeStep}`}>
              <StrokeIcon paths={FEATURE_PATHS[activeFeature.icon]} />
              {activeFeature.context}
            </span>
          </header>

          <div className="bridge-viewport">
            <CreatureStage
              appearance="bridge"
              autoSpin={autoSpin}
              creature="bee"
              gridVisible={effectsEnabled}
              framing={{ yaw: 0.62, pitch: 0.16, fill: 0.94, animate: true }}
              initialSpin={false}
              isolatedPart={isolatePart}
              label="Ong mật · Mô hình 3D tương tác"
              mode={activeStep}
              motionState={selectedAnimation}
            >
              {showHotspots && (
                <div
                  className={`bridge-hotspots is-${activeStep}${activeStep === 'annotation' && selectedPart ? ' is-isolated' : ''}`}
                  role="group"
                  aria-label="Các bộ phận của ong mật"
                >
                  {PARTS.map((part) => (
                    <button
                      type="button"
                      className={`bridge-hotspot bridge-hotspot--${part.key}${selectedPart === part.name ? ' is-active' : ''}`}
                      aria-pressed={selectedPart === part.name}
                      onClick={() => selectPart(part.name)}
                      key={part.name}
                    >
                      <i aria-hidden="true" />
                      <b>{part.name}</b>
                    </button>
                  ))}
                </div>
              )}
            </CreatureStage>

            {activeStep === 'rotate' && (
              <>
                <button
                  type="button"
                  className={`bridge-orbit-control${autoSpin ? ' is-active' : ''}`}
                  aria-pressed={autoSpin}
                  onClick={() => setAutoSpin((value) => !value)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4.8 9.2a7.5 7.5 0 0 1 12.8-3.1L20 8.5M20 4.8v3.7h-3.7M19.2 14.8a7.5 7.5 0 0 1-12.8 3.1L4 15.5M4 19.2v-3.7h3.7" />
                  </svg>
                  <span>Tự xoay</span>
                  <i aria-hidden="true" />
                </button>
                <p className="bridge-orbit-hint">Kéo để xoay · Cuộn để phóng</p>
              </>
            )}

            {activeStep === 'structure' && (
              <aside className="bridge-layers" aria-label="Các bộ phận của ong mật">
                <p>Bộ phận</p>
                <div>
                  {PARTS.map((part) => (
                    <button
                      type="button"
                      className={selectedPart === part.name ? 'is-active' : undefined}
                      aria-pressed={selectedPart === part.name}
                      onClick={() => selectPart(part.name)}
                      key={part.name}
                    >
                      <i aria-hidden="true" />{part.name}
                    </button>
                  ))}
                </div>
              </aside>
            )}

            {activeStep === 'motion' && (
              <aside className="bridge-animation-panel" aria-label="Chọn hoạt ảnh của ong mật">
                <p>Hoạt ảnh</p>
                <div>
                  {ANIMATIONS.map((animation, index) => (
                    <button
                      type="button"
                      className={selectedAnimation === index ? 'is-active' : undefined}
                      aria-pressed={selectedAnimation === index}
                      onClick={() => setSelectedAnimation(index)}
                      key={animation.title}
                    >
                      <span><LibraryIcon name={animation.icon} /></span>
                      <b>{animation.title}</b>
                      <small>{animation.note}</small>
                    </button>
                  ))}
                </div>
              </aside>
            )}

            {activeStep === 'annotation' && (
              <aside className={`bridge-annotation-panel${activePart ? ' has-selection' : ''}`} aria-live="polite">
                <header>
                  <div>
                    <p>Chú thích bộ phận</p>
                    <b>{activePart?.name ?? 'Chọn trên mô hình'}</b>
                  </div>
                  {activePart && (
                    <button type="button" onClick={() => setSelectedPart(null)}>Hiện toàn bộ</button>
                  )}
                </header>
                <div className="bridge-annotation-parts" role="group" aria-label="Chọn bộ phận để đọc chú thích">
                  {PARTS.map((part) => (
                    <button
                      type="button"
                      className={selectedPart === part.name ? 'is-active' : undefined}
                      aria-pressed={selectedPart === part.name}
                      onClick={() => selectPart(part.name)}
                      key={part.name}
                    >
                      {part.name}
                    </button>
                  ))}
                </div>
                {activePart ? (
                  <div className="bridge-annotation-copy">
                    <h4>{activePart.title}</h4>
                    <p>{activePart.summary}</p>
                    <p>{activePart.detail}</p>
                  </div>
                ) : (
                  <p className="bridge-annotation-empty">Bấm vào một nhãn trên con ong hoặc chọn bộ phận phía trên để tách riêng và đọc nội dung chi tiết.</p>
                )}
              </aside>
            )}
          </div>

          <div className="bridge-toolbar" role="group" aria-label="Công cụ bài học YooLab">
            {TOOLS.map((tool) => (
              <button
                type="button"
                className={toolIsActive(tool.id) ? 'is-active' : undefined}
                aria-label={`${tool.label}: ${tool.note}`}
                aria-pressed={toolIsActive(tool.id)}
                onClick={() => activateTool(tool.id)}
                key={tool.id}
              >
                <StrokeIcon paths={TOOL_PATHS[tool.icon]} />
                <span><b>{tool.label}</b><small>{tool.note}</small></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
