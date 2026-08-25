'use client';

import { useEffect, useRef, useState } from 'react';
import { ExploreCanvas } from './ExploreCanvas';
import { FlowerValleyLayer } from './FlowerValleyLayer';
import { EXPLORE_SCENES } from '../lib/exploreScenes';

const beeStates = [
  { label: 'Đứng yên', hint: 'Cánh gập lại, sáu chân bám mặt phẳng.' },
  { label: 'Bay tại chỗ', hint: 'Cánh đập nhanh, cơ thể giữ nguyên một điểm.' },
  { label: 'Bay đi', hint: 'Ngực nghiêng về trước, cánh tạo lực đẩy.' },
];

/**
 * Hero + explore story.
 *
 * The hero has two jobs at once and cannot trade one for the other: it has to
 * land the 3D world in the first second, and it has to say what YooLab is in the
 * first five. So the copy column stays on the left where the bee is not — the
 * `bee-hero` shot places the creature at x = +1.62 — and it states the
 * proposition outright instead of a mood line.
 *
 * The bee leads because it can *arrive*. It is the only one of the three with a
 * skeleton and authored flight clips, so the page can open on an empty studio
 * and have the hero object fly into it, which no amount of camera work on a
 * static model imitates.
 *
 * Scroll drives the stage as a single continuous value rather than as four
 * panels taking turns. The old version watched the panels with an
 * IntersectionObserver and handed the canvas a *current scene*, so the camera
 * only started moving once a threshold was crossed and the change always
 * arrived as a step the eye could catch. Here the position of the viewport
 * centre between panel centres is the animation clock: the camera, the lights,
 * the backdrop and the three creature weights are all read from it every frame,
 * and nothing in the stage ever switches.
 *
 * It is written to a ref rather than to state on purpose. This value changes on
 * every scroll frame; putting it in state would re-render the whole story on
 * each one, and the canvas would still only read it inside its own loop.
 */
export function ExploreStory() {
  const progressRef = useRef(0);
  /*
   * Starts on hover, not idle.
   *
   * The bee arrives by flying in, so whatever it crossfades into is what the
   * hero holds — and `Đứng yên` folds the wings and puts the legs down, which on
   * a creature suspended in mid-air reads as a bee that has been paused rather
   * than one that is hovering. Hover is the honest resting state here; the three
   * buttons in the study panel still own it from that point on.
   */
  const [beeMode, setBeeMode] = useState(1);

  useEffect(() => {
    const panels = EXPLORE_SCENES
      .map((scene) => document.querySelector<HTMLElement>(`[data-scene="${scene}"]`))
      .filter((element): element is HTMLElement => Boolean(element));
    if (panels.length < 2) return;

    let frame = 0;
    let centres: number[] = [];

    const measure = () => {
      const offset = window.scrollY;
      centres = panels.map((panel) => {
        const rect = panel.getBoundingClientRect();
        return offset + rect.top + rect.height * 0.5;
      });
    };

    const sample = () => {
      frame = 0;
      if (!centres.length) return;
      const focus = window.scrollY + window.innerHeight * 0.5;
      const last = centres.length - 1;
      if (focus <= centres[0]) { progressRef.current = 0; return; }
      if (focus >= centres[last]) { progressRef.current = last; return; }
      for (let index = 0; index < last; index += 1) {
        const from = centres[index];
        const to = centres[index + 1];
        if (focus >= from && focus <= to) {
          progressRef.current = index + (focus - from) / Math.max(1, to - from);
          return;
        }
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(sample);
    };
    const onResize = () => { measure(); sample(); };

    measure();
    sample();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // The panels are sized in `svh`, and the sticky stage above them changes
    // height when the mobile browser chrome collapses; re-measure on that too.
    const resizeObserver = new ResizeObserver(onResize);
    for (const panel of panels) resizeObserver.observe(panel);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="explore-story" id="kham-pha">
      <div className="explore-stage" aria-hidden="true">
        <ExploreCanvas progressRef={progressRef} beeMode={beeMode} />
        {/* Between the bee's canvas and the grain, reading the same scroll ref as
            the camera above it. See `FlowerValleyLayer`. */}
        <FlowerValleyLayer progressRef={progressRef} />
        <div className="hero-noise" />
      </div>

      <section className="hero story-panel" data-snap data-scene="bee-hero" aria-labelledby="hero-title">
        <div className="story-grid">
          <div className="hero-copy story-content">
            <p className="eyebrow"><span aria-hidden="true" /> YooLab · 3D/XR Learning</p>
            <h1 id="hero-title">
              Biến kiến thức
              <br />
              <em>thành trải nghiệm 3D/XR.</em>
            </h1>
            <p className="hero-lede">
              YooLab giúp giáo viên xây dựng bài học với mô hình 3D, học sinh khám
              phá, tương tác và sáng tạo nội dung số trên cùng một nền tảng.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#thu-vien">
                Khám phá bài học <span aria-hidden="true">→</span>
              </a>
              <a className="text-button" href="#cong-cu">
                <span className="play-icon" aria-hidden="true">▶</span>
                Mở YooStudio
              </a>
            </div>
          </div>
          <div className="hero-spec">
            <span>Sinh học</span>
            <strong>Ong mật</strong>
            <small>Cấu tạo · Chuyển động · Cơ chế bay</small>
          </div>
        </div>
        <a className="scroll-cue" href="#ong-mat" aria-label="Cuộn để khám phá">
          <span>Cuộn để khám phá</span><i aria-hidden="true" />
        </a>
      </section>

      <section className="story-panel story-panel--bee" id="ong-mat" data-snap data-scene="bee-study" aria-labelledby="bee-title">
        <div className="story-grid">
          <div className="story-copy story-copy--right story-content" data-reveal="soft">
            <p className="section-kicker">01 — Sinh học · Giải phẫu côn trùng</p>
            <h2 id="bee-title">Ba phần cơ thể,<br /><em>một cơ chế bay.</em></h2>
            <p>
              Ong mật chia thành đầu, ngực và bụng. Cánh và cả sáu chân đều gắn
              vào ngực — nơi tập trung toàn bộ cơ bay. Đổi trạng thái để thấy cơ
              chế đó làm việc.
            </p>
            <dl className="study-readout study-readout--compact">
              <div><dt>Đầu</dt><dd>Râu và mắt kép — cơ quan nhận biết</dd></div>
              <div><dt>Ngực</dt><dd>Nơi gắn cánh và sáu chân</dd></div>
              <div><dt>Cánh</dt><dd>Hai đôi mỏng, đập rất nhanh</dd></div>
              <div><dt>Bụng</dt><dd>Nhiều đốt, chứa nội quan</dd></div>
            </dl>
            <div className="bee-modes" role="group" aria-label="Trạng thái chuyển động của ong">
              {beeStates.map((state, index) => (
                <button
                  type="button"
                  className={beeMode === index ? 'is-active' : ''}
                  onClick={() => setBeeMode(index)}
                  aria-pressed={beeMode === index}
                  key={state.label}
                >
                  <span>0{index + 1}</span>{state.label}
                </button>
              ))}
            </div>
            <p className="bee-hint">{beeStates[beeMode].hint}</p>
        </div>
        <div className="annotation annotation--bee-a"><i />Cánh gắn vào ngực</div>
        <div className="annotation annotation--flip annotation--bee-b"><i />Ngực — trung tâm cơ bay</div>
        <div className="annotation annotation--bee-c"><i />Bụng chia thành nhiều đốt</div>
        </div>
      </section>

      <section className="story-panel story-panel--fish" id="ca-canh-bien" data-snap data-scene="fish" aria-labelledby="fish-title">
        <div className="story-grid">
          <div className="story-copy story-copy--right story-content" data-reveal="soft">
            <p className="section-kicker">02 — Sinh học · Hệ vây và chuyển động</p>
            <h2 id="fish-title">Học bằng cách<br /><em>quan sát chuyển động.</em></h2>
            <p>
              Thân cá dẹp hai bên để len qua khe hẹp, còn mỗi vây làm một việc
              khác nhau. Quan sát vòng bơi để thấy vây nào giữ thăng bằng và vây
              nào tạo lực đẩy.
            </p>
            <dl className="study-readout">
              <div><dt>Thân</dt><dd>Dẹp hai bên để len qua khe hẹp</dd></div>
              <div><dt>Vây lưng</dt><dd>Giữ thân không lật khi bơi</dd></div>
              <div><dt>Vây ngực</dt><dd>Đổi hướng và phanh lại</dd></div>
              <div><dt>Vây đuôi</dt><dd>Tạo lực đẩy chính</dd></div>
            </dl>
        </div>
        <div className="annotation annotation--flip annotation--fish-a"><i />Vây lưng giữ thăng bằng</div>
        <div className="annotation annotation--flip annotation--fish-b"><i />Vây đuôi tạo lực đẩy</div>
        </div>
      </section>

      <section className="story-panel story-panel--jelly" id="sinh-vat-bien" data-snap data-scene="jelly" aria-labelledby="jelly-title">
        <div className="story-grid">
          <div className="story-copy story-content" data-reveal="soft">
            <p className="section-kicker">03 — Sinh học · Cấu tạo cơ thể</p>
            <h2 id="jelly-title">Nhìn xuyên qua<br /><em>một cơ thể sống.</em></h2>
            <p>
              Cơ thể sứa gần như trong suốt. Trên cùng một mô hình, học sinh thấy
              được cả ba lớp một lúc: màng keo ngoài, tầng mô co bóp và khoang
              tiêu hoá nằm giữa thân.
            </p>
            <dl className="study-readout">
              <div><dt>Màng ngoài</dt><dd>Lớp keo trong suốt bảo vệ cơ thể</dd></div>
              <div><dt>Tầng giữa</dt><dd>Cơ co bóp đẩy nước để di chuyển</dd></div>
              <div><dt>Khoang giữa</dt><dd>Nơi tiêu hoá thức ăn bắt được</dd></div>
              <div><dt>Xúc tu</dt><dd>Bắt và đưa thức ăn vào khoang</dd></div>
            </dl>
        </div>
        <div className="annotation annotation--jelly-a"><i />Màng keo trong suốt</div>
        <div className="annotation annotation--jelly-b"><i />Xúc tu bắt thức ăn</div>
        </div>
      </section>
    </div>
  );
}
