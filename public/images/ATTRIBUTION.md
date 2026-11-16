# Reporting workflow forest

`workflow-forest.webp` is a fictional illustrated forest generated with the built-in OpenAI image generation tool on 16 November 2026. It is a separate decorative layer behind the reporting character; report steps, icons, buttons and privacy information are native page content. It is not a photograph, location record or environmental observation.

- Asset preparation: resized to 1000 × 1250 px and compressed to WebP; alpha transparency is preserved. The page adds responsive positioning and edge masks.
- Final generation prompt:

> Use case: illustration-story. Asset type: a decorative illustrated tropical forest environment layer for a web section; it will sit BEHIND an existing separate transparent cartoon person using a phone, with real HTML text to its right. Create only the environment, NO PEOPLE, no phones, no UI, no lettering. Portrait 4:5 composition. Tasteful hand-drawn 2D flat editorial illustration with clean restrained shapes, matching a simple dark-green outlined cartoon character. Pale muted sage and forest-green palette, warm ivory light, professional and calm rather than a children's game. A large tree trunk cropped by the far LEFT edge with a few branches entering upper left; layered tropical broadleaf shrubs and fern-like leaves along left and bottom edges; softly drawn distant rounded forest hills; a small clear warm cream walking path in lower center, leaving central area uncluttered for the separately composited person. Richer forest detail in left and bottom thirds. The RIGHT THIRD and TOP RIGHT gradually become empty ACTUAL transparent alpha, a smooth airy fade to full transparency, no solid rectangle or abrupt border. No sky rectangle, no watermark, no icons, no data, no text. No birds or extra animals. Render on transparent background with alpha so the environment blends into an ivory webpage.

# Reporting workflow character

`reporting-character.webp` is a fictional cartoon character generated with the built-in OpenAI image generation tool on 16 November 2026. Its alpha channel is preserved; there is no rectangular photo background. It illustrates community reporting and does not depict a real reporter or an AI result.

- Used in `app/components/landing/ReportingWorkflow.vue` with a single entrance animation, disabled for reduced-motion preferences. The surrounding steps are native page content, not text baked into the image.
- Asset preparation: transparent outer padding trimmed, resized to 371 × 1200 px, and compressed to WebP with transparency preserved.
- Final generation prompt:

> Use case: illustration-story. Asset type: a standalone transparent-background character illustration for a professional Indonesian forest community-reporting website. Primary request: one approachable adult community member using a smartphone, drawn as a clean modern 2D animated/cartoon character, NOT a photograph and NOT 3D clay. Full body visible from head to shoes. Standing naturally in a relaxed three-quarter pose facing slightly right, one hand holding a small smartphone and the other index finger touching it, looking attentively at the phone. Friendly mature adult about 40, short dark hair, sage green plain long-sleeved shirt, warm cream trousers, simple dark forest-green shoes. Style: tasteful flat editorial vector-like illustration, confident smooth dark-green outlines, simple facial features, few flat color areas, minimal restrained shading, softly rounded forms, clear silhouette, accessible and dignified for a wide age range, not childish or exaggerated. Palette: dark forest green #173D32, muted sage greens, warm ivory, natural medium tan skin. Center the whole character with modest transparent padding. Actual alpha transparency everywhere outside the character. No backdrop, no scenery, no floor, no pedestal, no shadow ellipse, no background circle, no decorative plants, no floating symbols, no panels, no text, no watermark, no brand logos. The phone screen has no legible UI or results. This is a fictional explanatory character asset, not an actual reporter.

# Landing panorama

`rainforest-panorama-768.webp`, `rainforest-panorama-1280.webp`, and `rainforest-panorama-2172.webp` are responsive WebP derivatives of an image generated with OpenAI image generation on 16 November 2026 for RimbaGuard.

- Brief: a horizontal panorama of tropical broadleaf forest, a winding river, and misty hills, with natural colors and no people, text, or incident claims.
- This is an AI illustration of a fictional landscape. It does not depict a named real location and is not environmental evidence, satellite data, or a report photograph.
- The asset is used as a decorative landing background and in the split-screen authentication layout. Its AI provenance is documented here and in README; at the user's request, asset captions are omitted from the page. No external photographer attribution or Creative Commons license is claimed for this asset.
- Changes after generation: resized and compressed to WebP; narrower screens use a landscape display crop.

# Previously used forest photograph

`lempuyang-forest.webp` is derived from **Mount Lempuyang, Tropical forest, Jungle, Bali, Indonesia.jpg** by **Vyacheslav Argenberg / http://www.vascoplanet.com/**.

- Source: https://commons.wikimedia.org/wiki/File:Mount_Lempuyang,_Tropical_forest,_Jungle,_Bali,_Indonesia.jpg
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Changes: resized to 1440 px width, rotated according to original metadata, metadata removed, compressed to WebP. The page uses a responsive display crop.
- `lempuyang-forest-768.webp` and `lempuyang-forest-1080.webp` are smaller copies of the same derivative (768 px and 1080 px wide), served to narrower screens through `srcset`. The same license and attribution apply.
- This is an editorial forest photograph, not evidence of any reported incident. No endorsement by the photographer is implied.
