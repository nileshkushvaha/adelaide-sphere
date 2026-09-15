# Blog demonstration content — articles, photography and licences

`apps/api/scripts/seed-blog.ts` loads six articles into a **development**
database so the blog can be reviewed as a real editorial surface rather than an
empty list. It refuses any database whose name does not end in `_dev`, `_test`
or `_e2e`: the SRS forbids sample content in production (CFG 002), and this is
sample content.

Run it with the API's environment loaded, and the worker running:

```bash
pnpm dev:worker                                   # produces the image renditions
pnpm --filter api exec tsx scripts/seed-blog.ts
```

Re-running is safe. Articles are matched on their slug and images on their
source name, so a run that failed part-way continues rather than duplicating.

## The articles

The copy in `apps/api/scripts/blog-seed-content.ts` is original, written for this
project. It is demonstration content: accurate as general orientation, but it
has not been fact-checked to publication standard and carries no byline beyond
the seeded "Adelaide Sphere editors" author.

## The photographs

All six are Creative Commons **Attribution** or **Attribution-ShareAlike** files from
Wikimedia Commons (share-alike permitted by the user on 15 September 2026, the
same terms as the Adelaide hero and About photography). Non-commercial and
no-derivatives files are never used.

The seeder does not trust this table: it resolves each file through the Commons
API at run time and **refuses any file whose recorded licence is not CC0, public domain, CC BY or
CC BY-SA (2.0, 2.5, 3.0 or 4.0)**. It also requests a 2400px rendition rather than
the original, which is both lighter and kinder to Commons.

| Article | Commons file | Author | Licence |
| --- | --- | --- | --- |
| A first-timer’s guide to Adelaide’s East End | `Rundle Street looking east.jpg` | Piero Damiani | CC BY-SA 2.0 |
| Adelaide Central Market, without the queue | `Interior of Central Market, Adelaide 01.jpg` | Pangalau | CC BY-SA 4.0 |
| Getting around Adelaide by tram | `Citadis and Flexity trams cross on North Terrace, Adelaide, 14 Oct 2018 (Henk Graalman).jpg` | Henk Graalman | CC BY 4.0 |
| A morning in the Adelaide Botanic Garden | `Adelaide (AU), Botanic Garden -- 2019 -- 0668.jpg` | Dietmar Rabich | CC BY-SA 4.0 |
| The Parade, Norwood, after dark | `The Parade at Norwood, South Australia in June 2026 (DSCF7814).jpg` | Yu Chu Chin | CC BY-SA 4.0 |
| North Adelaide on foot | `Heritage-listed building on Pennington Terrace, North Adelaide (028A8518).jpg` | Yu Chu Chin | CC BY-SA 4.0 |

The articles are original Adelaide copy written on 15 September 2026. Facts that change (tram routes and the free city tram zone, market hours, garden opening times) are worded cautiously and point readers to the official timetable or site; they have not been fact-checked to publication standard.

## Where attribution is satisfied

Each credit is stored on the media asset itself (`credit`, with the licence in
`rightsNote`), so it travels with the image rather than with one article. The
public article page renders it under the cover image, which is what the
Attribution licences require. Because it lives on the asset, an image reused on
another article stays credited.

## Replacing this with the client's own content

Delete the six articles from the admin and upload the client's photography
through the media library. Nothing in the application depends on this content;
it exists so the blog, the editor and the share previews can be judged with
something real in them.
