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

The YooLab mark in `app/components/BrandMark.tsx` and `public/brand/yoolab-mark.svg`
is traced from `design/figma.png`. If an official vector logo ever arrives,
replace those two files rather than re-tracing.
