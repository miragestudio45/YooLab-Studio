'use client';

import { ModelThumbnail } from './ModelThumbnail';
import { BEE_THUMBNAIL } from '../lib/three/thumbnailRequests';

/**
 * The bridge from wonder to product.
 *
 * Everything above this point is an experience; everything below it is the tool
 * that makes one. This section is the hinge, so it deliberately starts
 * transparent — the creature world is still visible through its top edge — and
 * ends in the exact background colour of the YooStudio section beneath it, which
 * makes the hand-off read as one continuous move rather than two websites glued
 * together.
 *
 * Both frames show the same asset on purpose. The bee the visitor just explored
 * is the bee sitting in the editor, which is the whole claim of the section.
 */
export function BridgeSection() {
  return (
    <section className="bridge" id="tu-kham-pha-den-tao" data-snap aria-labelledby="bridge-title">
      <div className="bridge-veil" aria-hidden="true" />
      <div className="shell-editorial bridge-inner">
        <div className="bridge-copy" data-reveal>
          <p className="section-kicker">Vừa rồi không phải một đoạn phim</p>
          <h2 id="bridge-title">
            Bạn vừa khám phá một bài học trong YooLab.
            <br />
            <em>Và chính bạn cũng có thể tạo ra nó.</em>
          </h2>
        </div>

        <div className="bridge-flow" data-reveal>
          <figure className="bridge-frame bridge-frame--lesson">
            <span className="bridge-tag">Bài học · Học sinh xem</span>
            <div className="bridge-stage">
              <ModelThumbnail request={BEE_THUMBNAIL} alt="Mô hình ong mật trong một bài học YooLab" />
              <i className="bridge-pin bridge-pin--a" aria-hidden="true">Ngực</i>
              <i className="bridge-pin bridge-pin--b" aria-hidden="true">Cánh</i>
              <i className="bridge-pin bridge-pin--c" aria-hidden="true">Bụng</i>
            </div>
            <figcaption>Xoay mô hình, đọc chú thích, đổi trạng thái chuyển động.</figcaption>
          </figure>

          <div className="bridge-arrow" aria-hidden="true">
            <i />
            <span>Mở trong YooStudio</span>
          </div>

          <figure className="bridge-frame bridge-frame--editor">
            <span className="bridge-tag">Biên soạn · Giáo viên dựng</span>
            <div className="bridge-editor">
              <div className="bridge-editor-rail">
                <i /><i /><i /><i /><i />
              </div>
              <div className="bridge-editor-stage">
                <ModelThumbnail request={BEE_THUMBNAIL} alt="Cùng mô hình ong mật trong không gian biên soạn" />
              </div>
              <div className="bridge-editor-side">
                <b>Lớp</b>
                <i>Đầu</i>
                <i>Ngực</i>
                <i>Bụng</i>
                <i>Ghi chú 01</i>
              </div>
              <div className="bridge-editor-timeline">
                <span style={{ background: '#A852FC' }}>Model</span>
                <span style={{ background: '#2B7FFF' }}>Văn bản</span>
                <span style={{ background: '#00C950' }}>Âm thanh</span>
                <span style={{ background: '#F6339A' }}>Hiệu ứng</span>
              </div>
            </div>
            <figcaption>Cùng mô hình đó: thêm ghi chú, âm thanh và nhịp trình bày.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
