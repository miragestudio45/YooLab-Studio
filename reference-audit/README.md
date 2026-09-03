# Reference & audit material

Files here are development references only. Nothing in this directory is fetched
at runtime, and keeping it outside `public/` stops ~55 MB of capture data from
shipping as website assets.

| Path | What it is | Why it is kept |
| --- | --- | --- |
| `har/bee.har` | 22-request capture of the source bee demo | Verifies model, clips, textures and the optical pipeline |
| `har/peachweb.io.har` | 99-request capture | Verifies the Fish/Jelly models, material names, clips and scene state |
| `har/Car.har` | 112-entry capture | Verifies the protected loader, Formula textures, props and transforms |
| `design/figma.png` | Screenshot of the shipped YooStudio product UI | Source of the official YooLab mark, the brand teal, and the timeline track colours reproduced in `StudioDemo` |
| `design/ezgif-1b0b7f3260a94a.webp` | Reference raster | Unused by the site |
| `design/Background/1.jpg` | Earlier background candidate | Superseded by the liquid shader |

The YooLab mark **used to be** traced from `design/figma.png`. It no longer is:
`public/brand/yoolab-logo.svg` and `public/brand/yoolab-icon.svg` are the
official vectors, and `app/components/BrandMark.tsx` is generated from them by
`scripts/build-brand-mark.mjs`. Nothing about the mark is read off this
screenshot any more — only the YooStudio timeline colours still are.
