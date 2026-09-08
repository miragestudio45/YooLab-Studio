/**
 * YooLab pricing, in one place.
 *
 * Every price, tier name, feature line and CTA on the pricing section comes from
 * this file and nothing is written in JSX. That is the whole point: a price is
 * the one number on the site that a non-engineer will need to change under time
 * pressure, and hunting it through a component is how a stale price ships.
 *
 * ## Source of truth
 *
 * Figma `gNiA73XdPHkMVBCyB6dKTH`, node `46718:170645` ("Bảng Giá Dịch Vụ").
 * Tier names, monthly prices, audience lines, the feature lists and the billing
 * toggle all come from that frame.
 *
 * **This supersedes an earlier written brief** that had Pro at 190.000đ,
 * Premium at 699.000đ and Enterprise at 2.500.000đ. The Figma is the later
 * instruction and is what ships; the discrepancy is worth confirming once with
 * whoever owns the price list, because three of the four numbers moved.
 *
 * ## The annual toggle
 *
 * The design ships a Tháng / Năm switch with a "Tiết kiệm 20%" flag, so the
 * annual figure is derived rather than invented: twelve months less twenty per
 * cent, rounded to the nearest thousand đồng the way Vietnamese price lists are
 * quoted. `ANNUAL_DISCOUNT` is the single knob. If finance publishes explicit
 * annual figures instead, give each tier a `perYear` and prefer it.
 */

export type PricingCta =
  /** Opens the real product entry (register, or the visitor's project). */
  | { kind: 'product'; label: string }
  /** Opens the shared consultation dialog. */
  | { kind: 'consult'; label: string }
  /** An in-page destination. */
  | { kind: 'anchor'; label: string; href: string };

/** The badge drawn above each tier name. Rendered by `PricingGlyph`. */
export type PricingGlyph = 'spark' | 'crown' | 'rosette' | 'case';

export type PricingTier = {
  id: string;
  name: string;
  /** One line on who the tier is for, under the price. */
  audience: string;
  glyph: PricingGlyph;
  /** Monthly price in đồng, or null for the free tier. */
  perMonth: number | null;
  /** Replaces the figure entirely when `perMonth` is null. */
  freeLabel?: string;
  features: string[];
  cta: PricingCta;
  /** At most one. Draws the emphasised card. */
  featured?: boolean;
};

export const PRICING_CURRENCY = 'đ';
export const PRICING_UNIT = 'tháng / user';

/** The saving the design advertises on the annual switch. */
export const ANNUAL_DISCOUNT = 0.2;

export type BillingCycle = 'month' | 'year';

/** `299000` -> `299.000`. Vietnamese grouping, no currency symbol. */
export function formatPrice(value: number): string {
  return value.toLocaleString('vi-VN');
}

/**
 * What one seat costs per month on a given cycle.
 *
 * Annual is quoted per month too, because the card's unit line stays
 * "tháng / user" on both sides of the switch — comparing a monthly figure with
 * an annual total is the oldest way to make a pricing table unreadable.
 */
export function monthlyOn(tier: PricingTier, cycle: BillingCycle): number | null {
  if (tier.perMonth === null) return null;
  if (cycle === 'month') return tier.perMonth;
  const discounted = tier.perMonth * (1 - ANNUAL_DISCOUNT);
  return Math.round(discounted / 1000) * 1000;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'basic',
    name: 'Free Trial / Basic',
    audience: 'Miễn phí cho tất cả',
    glyph: 'spark',
    perMonth: null,
    freeLabel: 'Miễn phí',
    features: [
      '20 dự án / tháng',
      'Tối đa 5 không gian VR360 cho mỗi dự án',
      'Render chất lượng 720p',
      '1GB lưu trữ trên cloud',
      'Bộ công cụ Decor cơ bản: ảnh, video, âm thanh',
      'Kho dữ liệu mẫu giới hạn',
      '1 thiết bị cho mỗi tài khoản',
    ],
    cta: { kind: 'product', label: 'Bắt đầu miễn phí' },
  },
  {
    id: 'pro',
    name: 'Gói Pro',
    audience: 'Dành cho chuyên gia',
    glyph: 'crown',
    perMonth: 299_000,
    features: [
      '50 dự án / tháng',
      'Tối đa 50 không gian VR360 cho mỗi dự án',
      'Render 4K chất lượng cao',
      '5GB lưu trữ trên cloud',
      'Bộ Decor nâng cao: ánh sáng, texture, vật liệu, hiệu ứng màu',
      'Truy cập model 3D miễn phí trong kho dữ liệu',
      'Hỗ trợ AI Tool nâng cao',
    ],
    /*
     * The Figma labels this button "Gói hiện tại" — a state, not an action, and
     * true only for someone already subscribed. This site has no billing and no
     * plan state to read, so shipping it would tell every anonymous visitor they
     * are on Pro. Same treatment, honest verb.
     */
    cta: { kind: 'product', label: 'Nâng cấp gói Pro' },
  },
  {
    id: 'premium',
    name: 'Gói Premium',
    audience: 'Dành cho nhà phát triển nội dung',
    glyph: 'rosette',
    perMonth: 599_000,
    features: [
      'Không giới hạn dự án',
      'Tối đa 100 không gian VR360 cho mỗi dự án',
      'Render 4K – 8K chất lượng cao',
      '20GB lưu trữ trên cloud',
      'Truy cập toàn bộ kho dữ liệu 3D và VR360 cao cấp, cập nhật liên tục',
      'Decor toàn diện: vật liệu, texture, ánh sáng, hiệu ứng môi trường (Environment FX)',
    ],
    cta: { kind: 'product', label: 'Nâng cấp gói Premium' },
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Gói Enterprise',
    audience: 'Dành cho doanh nghiệp',
    glyph: 'case',
    perMonth: 990_000,
    features: [
      'Không giới hạn dự án, dung lượng và thiết bị',
      'Không giới hạn số dự án VR360',
      'Render 8K siêu phân giải',
      'Lưu trữ không giới hạn',
      'API tích hợp với hệ thống nội bộ',
      'Custom branding theo thương hiệu riêng',
      'AR/MR nâng cao',
    ],
    /* The one tier whose next step is a conversation, not a signup. */
    cta: { kind: 'consult', label: 'Trao đổi Enterprise' },
  },
];
