  /*
   * Finds radial-gradient washes that are clipped by their own box.
   *
   * The hero's legibility wash drew a visible rectangle at 2560x1440 because its
   * ellipse reached zero 484px past its own left edge, so the box cut it at alpha
   * 0.68 — a straight line. That is measurable rather than eyeballable: parse the
   * gradient's radii and centre, evaluate its alpha at the eight points where the
   * box boundary is closest to the centre, and report anything still opaque there.
   */
  await new Promise((r) => setTimeout(r, 2200));

  const parseStops = (image) => {
    const stops = [];
    const re = /rgba?\(([^)]*)\)\s*([\d.]+)%/g;
    let m;
    while ((m = re.exec(image))) {
      const parts = m[1].split(',').map((v) => parseFloat(v));
      stops.push({ alpha: parts.length > 3 ? parts[3] : 1, at: parseFloat(m[2]) / 100 });
    }
    return stops;
  };

  const alphaAt = (stops, d) => {
    if (!stops.length) return null;
    if (d <= stops[0].at) return stops[0].alpha;
    for (let i = 1; i < stops.length; i += 1) {
      if (d <= stops[i].at) {
        const span = stops[i].at - stops[i - 1].at || 1;
        const t = (d - stops[i - 1].at) / span;
        return stops[i - 1].alpha + (stops[i].alpha - stops[i - 1].alpha) * t;
      }
    }
    return stops[stops.length - 1].alpha;
  };

  const findings = [];
  const masked = [];
  const nodes = [document.documentElement, ...document.querySelectorAll('*')];
  for (const el of nodes) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const image = cs.backgroundImage;
      if (!image || !image.includes('radial-gradient')) continue;
      if (pseudo && cs.content === 'none') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const opacity = parseFloat(cs.opacity);
      if (!(opacity > 0.02)) continue;

      /*
       * Only washes, not plates.
       *
       * A card surface is *supposed* to be filled to its own edge — that edge is
       * a border or a radius, and the gradient is a tint on an opaque ground.
       * The defect is the opposite thing: an element whose only paint is a
       * gradient the author ended at alpha 0, meaning it was meant to vanish
       * before the box did. Four signals separate them, and the decisive one is
       * that final stop: it is the author's own statement of intent.
       */
      const flat = cs.borderRadius === '0px' || cs.borderRadius === '';
      const bare = /rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
      const unbordered = parseFloat(cs.borderTopWidth) === 0 && parseFloat(cs.borderLeftWidth) === 0;
      if (!flat || !bare || !unbordered) continue;

      /* Chrome resolves used width/height for a rendered pseudo, so the box is
         readable without reconstructing it from the inset values. */
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!(w > 0) || !(h > 0)) continue;

      /* Only the explicit `<rx>% <ry>% at <cx>% <cy>%` form is decidable from
         style alone; anything else is reported so it is never silently skipped. */
      /* `at <x> <y>` is optional; omitted, the centre is the box centre. Without
         this branch a perfectly safe `radial-gradient(50% 50%, ...)` — whose
         ellipse touches the edge midpoints exactly at its zero stop — is
         reported forever as undecidable, which trains the reader to ignore the
         scan. */
      const shape = image.match(/radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%/)
        ?? image.match(/radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s*,/)?.concat(['50', '50']);
      const label = (el.className && typeof el.className === 'string'
        ? `.${el.className.split(' ').slice(0, 2).join('.')}`
        : el.tagName.toLowerCase()) + (pseudo || '');
      if (!shape) {
        if (/radial-gradient\(\s*\d+(\.\d+)?%\s/.test(image)) findings.push({ el: label, unparsed: image.slice(0, 70) });
        continue;
      }

      const [rx, ry, cx, cy] = shape.slice(1, 5).map(Number).map((v) => v / 100);
      const stops = parseStops(image);
      const ends = stops.length ? stops[stops.length - 1] : null;
      if (!ends || ends.alpha > 0.02) continue;
      const RX = rx * w, RY = ry * h, CX = cx * w, CY = cy * h;
      /* Four edge midpoints and four corners: the boundary samples nearest the
         centre are where a clip becomes a visible straight line. */
      const points = [
        [0, CY], [w, CY], [CX, 0], [CX, h],
        [0, 0], [w, 0], [0, h], [w, h],
      ];
      let worst = 0;
      for (const [x, y] of points) {
        const d = Math.hypot((x - CX) / RX, (y - CY) / RY);
        worst = Math.max(worst, (alphaAt(stops, Math.min(d, 1)) ?? 0) * opacity);
      }
      if (worst > 0.03) {
        /*
         * A mask is the other legitimate way to end a wash, and it is invisible
         * to the geometry above: `.pricing-aura` clips three gradients at its
         * own edges and then fades those edges out with
         * `mask-image: linear-gradient(180deg, transparent, #000 14%, ...)`.
         * Reported separately rather than dropped, because "masked" is a claim
         * about the element that a reader may want to check, while silence would
         * hide it.
         */
        const mask = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage;
        const entry = { el: label, box: [Math.round(w), Math.round(h)], edgeAlpha: Number(worst.toFixed(3)) };
        if (mask && mask !== 'none') masked.push({ ...entry, mask: mask.slice(0, 60) });
        else findings.push(entry);
      }
    }
  }
  return { vw: innerWidth, vh: innerHeight, findings, masked };
