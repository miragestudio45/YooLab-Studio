'use client';

import { useState } from 'react';
import { useConsult } from './ConsultModal';
import { StartWithYooLabButton } from './StartWithYooLabButton';
import {
  ANNUAL_DISCOUNT,
  PRICING_CURRENCY,
  PRICING_TIERS,
  PRICING_UNIT,
  formatPrice,
  monthlyOn,
  type BillingCycle,
  type PricingGlyph,
  type PricingTier,
} from '../lib/pricing';

/**
 * The pricing section, built from Figma `46718:170645`.
 *
 * DOM and CSS only — deliberately. The page already carries a full-viewport
 * WebGL hero, an editor and a Library stage, and the other headline report from
 * testing was that the machine gets hot, so a pricing table that costs a canvas
 * would be answering one complaint by worsening the other. The wash behind the
 * cards is two static radial gradients, which the compositor draws once.
 *
 * All content comes from `lib/pricing.ts`. Nothing here knows a price.
 */

/**
 * The tier badges, drawn rather than set in a font.
 *
 * ## Why these four are not the four the Figma draws
 *
 * The frame's marks were traced literally at first — a spark, a crown, a
 * rosette, a case — and the row failed a 4× capture. Three of the four were
 * built from two stacked paths, a solid silhouette under a 18–20% ghost of a
 * larger one, which is a technique that needs about forty pixels to read. These
 * sit at twenty-four inside a forty-four tile: the spark's ghost swallowed its
 * own bolt, and the rosette — a twelve-point cog behind a five-point star — came
 * out as a teal blob with a texture. The case was worse, because its two cut
 * lines were painted in a hard-coded near-white through a custom property, so
 * the "handle" only existed while the tile behind it stayed that exact colour.
 *
 * All four are now ONE path each, no stacking, no knockout, no second colour.
 * The silhouettes are chosen for what survives at this size: a four-point
 * sparkle rather than a five-point star with a bolt in it, a crown reduced to
 * three peaks on a bar, a cut gem instead of a rosette (it also says "premium"
 * without needing to be read as an award), and a case whose handle is a gap in
 * the outline rather than a line drawn over the top of it.
 *
 * They are filled rather than stroked because a 1.3 stroke closes up inside a
 * 22 px box, and because the tinted tile they sit in is already the light shape
 * in the composition — a hairline mark inside it reads as an empty chip.
 */
function TierGlyph({ glyph }: { glyph: PricingGlyph }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': true as const,
  };
  if (glyph === 'spark') {
    return (
      <svg {...common}>
        <path d="M12 2.2c.36 3.3.94 5.5 2.02 6.7 1.09 1.2 3.1 1.84 6.1 2.24-3 .4-5.01 1.04-6.1 2.24-1.08 1.2-1.66 3.4-2.02 6.7-.36-3.3-.94-5.5-2.02-6.7-1.09-1.2-3.1-1.84-6.1-2.24 3-.4 5.01-1.04 6.1-2.24C11.06 7.7 11.64 5.5 12 2.2Z" />
        <path d="M18.9 15.4c.18 1.5.47 2.5 1 3.06.55.55 1.53.83 3 1.02-1.47.19-2.45.47-3 1.02-.53.56-.82 1.56-1 3.06-.18-1.5-.47-2.5-1-3.06-.55-.55-1.53-.83-3-1.02 1.47-.19 2.45-.47 3-1.02.53-.56.82-1.56 1-3.06Z" opacity=".55" />
      </svg>
    );
  }
  if (glyph === 'crown') {
    return (
      <svg {...common}>
        <path d="M3.1 7.6a1.5 1.5 0 0 1 2.44.3L7.9 12.3l2.75-5.68a1.5 1.5 0 0 1 2.7 0L16.1 12.3l2.36-4.4a1.5 1.5 0 0 1 2.77 1.05l-2.05 8.2a1.5 1.5 0 0 1-1.46 1.14H6.28a1.5 1.5 0 0 1-1.46-1.14l-2.05-8.2a1.5 1.5 0 0 1 .33-1.35Z" />
        <rect x="5.9" y="19.4" width="12.2" height="2.2" rx="1.1" opacity=".55" />
      </svg>
    );
  }
  if (glyph === 'rosette') {
    /*
     * A cut gem — crown and pavilion drawn as two SEPARATE shapes with a girdle
     * of bare tile between them, not one silhouette with facet lines over it.
     *
     * The first attempt did draw the lines, in a translucent white, and they
     * were invisible: they sat on top of a fill of the same colour, and alpha
     * over an identical colour is that colour. Only a shape that touches the
     * tile can be a second tone, which is why the two halves do not meet and why
     * the crown is at 55% — over the teal wash it reads a step lighter, over the
     * featured card's solid teal it reads a step darker than the white below it.
     */
    return (
      <svg {...common}>
        <path d="M7.9 3.5h8.2l4.5 4.9H3.4z" opacity=".55" />
        <path d="M3.6 9.8h16.8l-8.4 10.7z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {/* The handle is a bracket with real thickness. Drawn as a 2-unit stem it
          read as the stalk of a trophy and the whole mark stopped being a case. */}
      <path d="M9.7 3.1h4.6a2.4 2.4 0 0 1 2.4 2.4v1.7h-2.1V5.8a.75.75 0 0 0-.75-.75h-3.7a.75.75 0 0 0-.75.75v1.4H7.3V5.5a2.4 2.4 0 0 1 2.4-2.4Z" />
      <path d="M2.4 9.4a2.6 2.6 0 0 1 2.6-2.6h14a2.6 2.6 0 0 1 2.6 2.6v1.8l-8.2 2.35a4 4 0 0 1-2.2 0L2.4 11.2V9.4Z" />
      <path d="M2.4 13.6l7.4 2.1v.75c0 .5.4.9.9.9h2.6c.5 0 .9-.4.9-.9v-.75l7.4-2.1v5.1a2.6 2.6 0 0 1-2.6 2.6H5a2.6 2.6 0 0 1-2.6-2.6v-5.1Z" />
    </svg>
  );
}

function TierCta({ tier }: { tier: PricingTier }) {
  const consult = useConsult();
  const className = `pricing-cta${tier.featured ? ' pricing-cta--solid' : ''}`;

  if (tier.cta.kind === 'product') {
    return <StartWithYooLabButton className={className}>{tier.cta.label}</StartWithYooLabButton>;
  }
  if (tier.cta.kind === 'consult') {
    return (
      <button type="button" className={className} onClick={() => consult.open(`pricing:${tier.id}`)}>
        {tier.cta.label}
      </button>
    );
  }
  return <a className={className} href={tier.cta.href}>{tier.cta.label}</a>;
}

export function PricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>('month');

  return (
    <section className="pricing-section" id="bang-gia" aria-labelledby="pricing-title">
      {/* Two washes, drawn once and never animated. They are what stops four
          white cards on ivory from reading as a spreadsheet. */}
      <div className="pricing-aura" aria-hidden="true" />

      <div className="shell">
        <div className="pricing-head" data-reveal>
          <h2 id="pricing-title">Bảng giá dịch vụ</h2>
          <p>
            Chọn gói tháng hoặc năm để dùng thường xuyên, hoặc nạp Credits để dùng
            linh hoạt theo từng tác vụ.
          </p>

          {/*
            A radio group, not two buttons.
            The switch changes one value shown in four places, which is exactly
            what a radio group announces and what arrow keys already drive. Two
            independent buttons would leave a screen reader to infer the
            relationship from their labels.

            The saving flag is OUTSIDE the group. It used to be the third child
            of the `radiogroup`, which put a non-radio in a container whose whole
            contract is "these are the options" — and it looked like one too,
            being the only filled shape on the track. See `.pricing-save`.
          */}
          <div className="pricing-cycle">
            <div className="pricing-switch" role="radiogroup" aria-label="Chu kỳ thanh toán">
              <button
                type="button"
                role="radio"
                aria-checked={cycle === 'month'}
                className={cycle === 'month' ? 'is-on' : undefined}
                onClick={() => setCycle('month')}
              >
                Tháng
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cycle === 'year'}
                className={cycle === 'year' ? 'is-on' : undefined}
                onClick={() => setCycle('year')}
              >
                Năm
              </button>
            </div>
            <span className="pricing-save">Tiết kiệm {Math.round(ANNUAL_DISCOUNT * 100)}%</span>
          </div>
        </div>

        <ul className="pricing-grid" data-reveal>
          {PRICING_TIERS.map((tier) => {
            const price = monthlyOn(tier, cycle);
            return (
              <li key={tier.id} className={`pricing-card${tier.featured ? ' is-featured' : ''}`}>
                {/* The emphasised card carried nothing but a teal stroke, which
                    at a glance is a hover state rather than a recommendation.
                    The flag says which one and why, and it is real text so it is
                    read out with the tier's name rather than inferred from a
                    border colour. */}
                {tier.featured && <span className="pricing-flag">Phổ biến nhất</span>}
                <span className="pricing-glyph" aria-hidden="true"><TierGlyph glyph={tier.glyph} /></span>
                <h3>{tier.name}</h3>

                <p className="pricing-price">
                  {price === null ? (
                    <b>{tier.freeLabel}</b>
                  ) : (
                    <b>
                      {formatPrice(price)}
                      <i aria-hidden="true">{PRICING_CURRENCY}</i>
                    </b>
                  )}
                  <small>/{PRICING_UNIT}</small>
                </p>
                <p className="pricing-audience">{tier.audience}</p>

                <ul className="pricing-features">
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <span aria-hidden="true" className="pricing-tick" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <TierCta tier={tier} />
              </li>
            );
          })}
        </ul>

        <p className="pricing-foot" data-reveal>
          Giá chưa gồm VAT. Nhà trường và đơn vị đào tạo có thể <ConsultLink /> để
          nhận phương án triển khai riêng.
        </p>
      </div>
    </section>
  );
}

function ConsultLink() {
  const consult = useConsult();
  return (
    <button type="button" className="pricing-inline-link" onClick={() => consult.open('pricing:foot')}>
      trao đổi thêm
    </button>
  );
}
