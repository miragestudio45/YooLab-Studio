# Where these files came from

The twenty models and the panorama in this directory were generated with
[Mint MCP](https://mcp.mint.gg/) for the **Quadrotor Sandbox** experience in
[mintdotgg/mint-playground](https://github.com/mintdotgg/mint-playground/tree/main/experiences/quadrotor-sandbox),
and are served from `cdn.mint.gg`. The URL for each one is in that experience's
`mint-assets.json`.

**Their terms are not stated.** They are not in that repository — its
`asset-manifest.json` declares `"assets": []` — so its MIT licence, which covers
"the Software and associated documentation files", does not reach them, and Mint
publishes no separate terms for the CDN artifacts. They are used here on the
project owner's explicit decision. See `THIRD_PARTY_ASSETS.md` at the repository
root for the full record.

Modifications: vertex buffers de-interleaved and embedded textures re-encoded to
WebP by `scripts/build-drone-assets.mjs`. No geometry was altered — every
triangle count is unchanged, and the four airframe parts were re-measured
afterwards against the bounds the sandbox's own `assets/drone.ts` records.
