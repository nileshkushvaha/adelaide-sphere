# About page photography — sources, licences and attribution

`/about` is a product route (client instruction, 13 September 2026), so its
photographs are project files rather than media-library assets: they are
stored in `apps/web/public/about/`, served locally and never hot-linked (SRS
ABT 006). They are Adelaide photographs from Wikimedia Commons, stored as WebP with metadata removed. The credit for each is printed beside it on the
page, in `apps/web/src/app/about/page.tsx` (`PHOTOS`).

| File | Subject | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `adelaide-skyline-torrens.webp` (2400×960) | The city skyline across the River Torrens | Yu Chu Chin | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Adelaide_CBD_skyline_across_the_River_Torrens,_July_2026_(028A8459).jpg) |
| `adelaide-leigh-street.webp` (1600×1200) | Leigh Street, a laneway of cafés and small bars | Pangalau | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Leigh_Street,_Adelaide_01.jpg) |
| `adelaide-central-market.webp` (1600×1200) | Fruit and vegetable stalls inside the Adelaide Central Market | Pangalau | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Interior_of_Central_Market,_Adelaide_01.jpg) |

These were added on 15 September 2026 (downloads approved by the user). The originals were cropped (skyline 5:2 across the buildings; laneway 4:3 from the left, removing an advertising panel; market 4:3 centred), resized and re-encoded as WebP with all metadata removed.

Replacing a photograph means replacing the file and its `PHOTOS` entry
(alternative text, credit and dimensions). The client's commissioned Adelaide
photography remains outstanding content (D10).
