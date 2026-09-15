/**
 * The six articles and their photographs, kept apart from the script that
 * loads them so the writing can be read and edited on its own.
 *
 * The articles are about Adelaide, and the copy is original. The photographs
 * are Creative Commons Zero, public domain, Attribution or Attribution-
 * ShareAlike files from Wikimedia Commons — share-alike is now permitted — and
 * each carries its credit into the media library, where it is shown on the
 * media asset and the licence's attribution requirement is satisfied.
 */

export interface SeedImage {
  /**
   * The file's title on Wikimedia Commons. The download address is resolved
   * from this at seed time rather than written here: Commons derives the path
   * from a hash of the name, so a hand-written URL is a guess that breaks.
   * Resolving it also lets the seeder re-check the licence before using the
   * file, instead of trusting a note in this table.
   */
  file: string;
  alt: string;
  credit: string;
  rightsNote: string;
}

export interface SeedPost {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  body: string;
  image: SeedImage;
}

export const SEED_CATEGORIES = [
  { name: 'City guides', slug: 'city-guides', description: 'Where to go and what to expect, neighbourhood by neighbourhood.' },
  { name: 'Food and drink', slug: 'food-and-drink', description: 'Coffee, markets, kitchens and the people running them.' },
  { name: 'Getting around', slug: 'getting-around', description: 'Trams, trains, buses, walking and parking, explained plainly.' },
];

export const SEED_TAGS = ['cbd', 'coffee', 'heritage', 'markets', 'north-adelaide', 'norwood', 'parks', 'trams'];

export const SEED_POSTS: SeedPost[] = [
  {
    title: 'A first-timer’s guide to Adelaide’s East End',
    slug: 'first-timers-guide-to-the-east-end',
    category: 'city-guides',
    tags: ['cbd', 'coffee'],
    excerpt: 'Rundle Street, the old market blocks and the park at the end of it all. How the East End fits together, and how to spend a day there without rushing.',
    seoTitle: 'Adelaide’s East End: a first-timer’s guide',
    seoDescription: 'What the East End is, where it starts and stops, when it is at its best, and how to walk it — written for someone arriving at the top of Rundle Street for the first time.',
    seoKeywords: 'adelaide east end, rundle street, east terrace, adelaide cbd',
    body: `The East End is the north-eastern corner of Adelaide's city grid, and Rundle Street is its spine. When locals say they are heading to the East End, they usually mean the half-kilometre of Rundle Street between Pulteney Street and East Terrace, plus the lanes and side streets that run off it.

## Where it starts

Walk east along Rundle Mall and, once you cross Pulteney Street, the pedestrian mall gives way to a working street with traffic, wide verandahs and outdoor tables. The change is abrupt and it is the easiest way to find your bearings: the chain stores are behind you, and the street ahead is mostly independent shops, kitchens and bars in nineteenth-century buildings.

## Reading the buildings

Much of the street's character comes from the old commercial frontages above shop level — look up rather than at the windows. The blocks towards East Terrace were once the city's wholesale fruit and vegetable market, and several of the market-era buildings survive with new uses inside. The lanes running north and south, such as Ebenezer Place and Vardon Avenue, are quieter and worth a detour.

## Coffee and timing

Mornings are the East End at its most relaxed: footpath tables fill with people on their way to work or the university a block away, and it is easy to find a seat. Evenings are busier, and in late summer, during the Fringe and festival season, the whole precinct is crowded well past midnight. If you want the street to yourself, go early on a weekday.

## Where to go next

Cross East Terrace and you are in the Park Lands, at Rundle Park. One block north, North Terrace has the Art Gallery, the South Australian Museum and the State Library within a few minutes' walk of each other, and the Botanic Garden is at its eastern end. All of it is flat, and none of it needs a car.`,
    image: {
      file: 'File:Rundle Street looking east.jpg',
      alt: 'Rundle Street, Adelaide, looking east at dusk, with two- and three-storey heritage shopfronts and a large mural on the left',
      credit: 'Piero Damiani',
      rightsNote: 'CC BY-SA 2.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Rundle_Street_looking_east.jpg',
    },
  },
  {
    title: 'Adelaide Central Market, without the queue',
    slug: 'central-market-without-the-queue',
    category: 'food-and-drink',
    tags: ['cbd', 'markets'],
    excerpt: 'One roof, dozens of stalls and a lot of people on a Saturday morning. How the market is laid out, when to go, and how to shop it like a regular.',
    seoTitle: 'Adelaide Central Market: how to shop it properly',
    seoDescription: 'Trading days, how the halls are laid out between Gouger and Grote Streets, and the timing that decides whether you queue or walk straight up to the counter.',
    seoKeywords: 'adelaide central market, gouger street, grote street, produce, adelaide markets',
    body: `Adelaide Central Market has traded on its site in the middle of the city since 1870. It sits between Gouger Street and Grote Street, a short walk west of King William Street, and everything is under one roof — which makes it easier to cover than most big markets, but no less crowded at the wrong time.

## How it is laid out

The main aisles run between the two streets, so you can walk in on Gouger Street and out on Grote Street without doubling back. Fruit and vegetable stalls take up a large share of the floor, with butchers, fishmongers, bakers, delis, cheese counters and coffee stalls mixed in among them. The arcade and the streets around the market, including Chinatown on Moonta Street, extend the precinct well beyond the hall itself.

## Timing

The market does not trade every day: it is closed on Sundays and Mondays, and has a late trading night towards the end of the week. Opening times change from time to time, so check the current hours before you make a special trip. Saturday morning is the busiest session of the week. For the widest choice with the least jostling, a weekday morning is hard to beat; late on a trading day, some stalls reduce prices on produce that will not keep.

## Practical things

Bring your own bags, and a trolley or basket if you are doing a full week's shop. Most stalls take cards, but not every one, so a little cash is still useful. There is paid parking above the market, and the King William Street tram stops are a few minutes' walk to the east.

## Shopping like a regular

Walk one full lap before you buy anything: the same fruit can be priced quite differently a few stalls apart, and seasonal produce is easy to spot once you have seen it all. The stallholders are the best guide to what is good this week, and most are happy to tell you if you ask.`,
    image: {
      file: 'File:Interior of Central Market, Adelaide 01.jpg',
      alt: 'An aisle inside Adelaide Central Market lined with fruit and vegetable stalls, with grapes and greens stacked in the foreground',
      credit: 'Pangalau',
      rightsNote: 'CC BY-SA 4.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Interior_of_Central_Market,_Adelaide_01.jpg',
    },
  },
  {
    title: 'Getting around Adelaide by tram',
    slug: 'getting-around-adelaide-by-tram',
    category: 'getting-around',
    tags: ['cbd', 'trams'],
    excerpt: 'One line to the beach, a branch along North Terrace, and free travel through the city. Everything a visitor needs to know to use Adelaide’s trams with confidence.',
    seoTitle: 'Adelaide trams explained: routes, free travel and tickets',
    seoDescription: 'Where Adelaide’s trams go, which part of the network is free, when you need a ticket, and a few habits that make the trip to Glenelg easy.',
    seoKeywords: 'adelaide trams, glenelg tram, free city tram, metrocard, adelaide metro',
    body: `Adelaide's tram network is small and simple, which is exactly what makes it useful. There is one main line, running from the beach at Glenelg through the city, with branches that carry it along North Terrace and out to the west. Once you know that shape, you know most of what you need.

## Where the trams go

From Glenelg, trams run through the southern suburbs and into the city along King William Street, the main north–south street of the grid. In the city, the network splits: one branch continues west past the railway station towards the Entertainment Centre, and another turns east along North Terrace, past the cultural institutions, to the Botanic Garden. Route patterns change from time to time, so check the destination on the front of the tram before you board.

## Free travel in the city

Tram travel through the city centre is free, with no ticket needed, and a free section also runs along Jetty Road at the Glenelg end. It covers the stops most visitors use — King William Street, North Terrace and the stops towards the Entertainment Centre. The exact limits of the free section are shown on stop signs and on the Adelaide Metro website; if your trip goes beyond them, you need a valid ticket for the whole journey.

## Tickets outside the free section

Beyond the free section, you pay with a metroCARD or another ticket option accepted by Adelaide Metro, and you validate it each time you board — including when you change services. Fares and ticket options are revised periodically, so check the current details with Adelaide Metro rather than relying on an old guide.

## Small habits

Trams stop only at marked platforms, and several city stops sit in the middle of the road: cross at the lights. Move down the carriage rather than crowding the doors, and give up the priority seats when someone needs them. The trip to Glenelg takes a little over half an hour from the city, so allow for it if you are heading to the beach for sunset.`,
    image: {
      file: 'File:Citadis and Flexity trams cross on North Terrace, Adelaide, 14 Oct 2018 (Henk Graalman).jpg',
      alt: 'A red-fronted Citadis tram and a yellow Flexity tram passing each other on North Terrace, Adelaide, in front of a sandstone building',
      credit: 'Henk Graalman',
      rightsNote: 'CC BY 4.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Citadis_and_Flexity_trams_cross_on_North_Terrace,_Adelaide,_14_Oct_2018_(Henk_Graalman).jpg',
    },
  },
  {
    title: 'A morning in the Adelaide Botanic Garden',
    slug: 'morning-in-the-botanic-garden',
    category: 'city-guides',
    tags: ['parks', 'heritage'],
    excerpt: 'Glasshouses old and new, a museum of useful plants and a lake at the heart of it. A practical route through the Botanic Garden for a slow morning.',
    seoTitle: 'Adelaide Botanic Garden: a morning route',
    seoDescription: 'The Palm House, the Bicentennial Conservatory, the Museum of Economic Botany and the Main Lake — how to see the Adelaide Botanic Garden in a morning.',
    seoKeywords: 'adelaide botanic garden, palm house, bicentennial conservatory, north terrace, adelaide parks',
    body: `The Adelaide Botanic Garden fills around fifty hectares at the eastern end of North Terrace, and it has been open to the public since the 1850s. It is free to enter, a short walk or tram ride from the city centre, and at its best in the cool of the morning.

## Getting in

The main North Terrace entrance is the easiest if you are coming from the city on foot or by tram — the North Terrace tram branch stops close by. There is also an entrance on Hackney Road, on the eastern side. Opening times vary by day and season, with closing times moving earlier in winter, so check the current hours before you set out.

## The heritage core

Start with the Palm House, a glasshouse from 1877 whose iron and glass frame was made in Germany and shipped out in pieces. Close by is the Museum of Economic Botany, a nineteenth-century building devoted to the plants people eat, wear, build with and use as medicine. It is small, quiet and one of the most unusual interiors in the city. The formal beds and old trees around both give a good sense of what the garden looked like in its early decades.

## The lake and the conservatory

From there, wander past the Main Lake and its lawns before heading towards the eastern side of the garden. The Bicentennial Conservatory, opened in 1989, is a vast curved glasshouse for tropical rainforest plants — step inside on a cold morning and the humidity is immediate. Nearby, the Amazon Waterlily Pavilion holds the giant waterlilies, and the Rose Garden is at its best in spring and again in autumn.

## Practical things

The paths are mostly flat and suit prams and wheelchairs. There are cafés and toilets inside the garden, and plenty of shade in summer. The garden is on Kaurna land, and interpretive signs through the grounds note plants and places of significance to the Kaurna people.`,
    image: {
      file: 'File:Adelaide (AU), Botanic Garden -- 2019 -- 0668.jpg',
      alt: 'The white iron-and-glass Palm House in the Adelaide Botanic Garden, seen across a green lawn with palms and garden beds around it',
      credit: 'Dietmar Rabich',
      rightsNote: 'CC BY-SA 4.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Adelaide_(AU),_Botanic_Garden_--_2019_--_0668.jpg',
    },
  },
  {
    title: 'The Parade, Norwood, after dark',
    slug: 'the-parade-after-dark',
    category: 'food-and-drink',
    tags: ['norwood', 'coffee'],
    excerpt: 'A tree-lined main street a few kilometres east of the city, busy from breakfast until well after dinner. How to spend an evening on The Parade.',
    seoTitle: 'The Parade, Norwood: an evening guide',
    seoDescription: 'Where The Parade is, how the Norwood strip changes from day to night, how to choose where to eat, and how to get there and back from the city.',
    seoKeywords: 'the parade norwood, norwood, eastern suburbs, adelaide dining',
    body: `The Parade is Norwood's main street, about four kilometres east of the city centre, and one of Adelaide's best-known places to eat out. The shopping and dining strip runs for several blocks, shaded by large trees, with the Norwood Town Hall at its heart on the corner of George Street.

## From day to night

By day The Parade is a neighbourhood high street: supermarkets, bookshops, boutiques and a steady stream of people walking between coffee stops. As the shops close, the balance shifts to kitchens, wine bars and dessert places, and the footpath tables fill up again. Weeknights are relaxed; Friday and Saturday evenings are busy enough that booking ahead is sensible.

## Choosing a table

The strip is long enough that you can walk its whole length before deciding, and it is worth doing. Kitchens here cover a wide range, from quick casual meals to long, formal dinners. A useful rule is to look for places full of people who clearly live nearby — on a street this competitive, the neighbourhood regulars are a better guide than any sign on the footpath.

## After dinner

Late coffee and dessert are part of the Norwood routine, and plenty of places stay open after the main dinner rush. The side streets are worth a short walk too: they are lined with old stone villas and cottages that give the suburb its character. On football nights, crowds heading to Norwood Oval, right on The Parade, make the strip noticeably busier, so check the fixture list if you want a quieter evening.

## Getting there and back

Several Adelaide Metro bus routes run between the city and The Parade, and the trip takes around fifteen minutes outside peak hour; check the current timetable for late services. It is also a pleasant walk of under an hour from the East End, and a short taxi or rideshare trip if you would rather not.`,
    image: {
      file: 'File:The Parade at Norwood, South Australia in June 2026 (DSCF7814).jpg',
      alt: 'The Parade in Norwood, a main street lined with tall gum trees, low shopfronts and parked cars',
      credit: 'Yu Chu Chin',
      rightsNote: 'CC BY-SA 4.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:The_Parade_at_Norwood,_South_Australia_in_June_2026_(DSCF7814).jpg',
    },
  },
  {
    title: 'North Adelaide on foot',
    slug: 'north-adelaide-on-foot',
    category: 'city-guides',
    tags: ['north-adelaide', 'heritage'],
    excerpt: 'Across the river from the city, a village of stone villas, wide terraces and a main street of pubs and cafés. A walking route through North Adelaide.',
    seoTitle: 'North Adelaide walking guide: O’Connell Street and beyond',
    seoDescription: 'A walking route through North Adelaide — from the riverbank and St Peter’s Cathedral to O’Connell Street and the quiet heritage streets around Wellington Square.',
    seoKeywords: 'north adelaide, o’connell street, st peter’s cathedral, adelaide heritage walk',
    body: `North Adelaide sits just across the River Torrens from the city centre, surrounded by the Park Lands, and it was laid out as part of Colonel William Light's 1837 plan for Adelaide. It feels like a separate town: quieter streets, large stone houses and its own main street, all within a comfortable walk of the city.

## Start at the river

Cross the Torrens from the city side — the footbridge by Adelaide Oval is the most scenic way — and climb the gentle rise to Montefiore Hill. The statue of Colonel Light there, known as Light's Vision, points back over the river towards the city he planned, and the view explains the layout of Adelaide better than any map.

## St Peter's Cathedral and the terraces

A short walk away, St Peter's Cathedral stands on the corner of Pennington Terrace and King William Road. The Anglican cathedral was built in stages from the 1860s and completed in the early twentieth century, and its Gothic Revival towers are one of the city's best-known outlines. From there, the terraces along the edge of the Park Lands are lined with grand nineteenth-century homes; many are heritage-listed, and they are best appreciated from the footpath.

## O'Connell Street

Head north to O'Connell Street, North Adelaide's main street. It is wide and busy, with old hotels with deep iron-lace verandahs, shops, bakeries and places to eat. The streets that cross it, including Tynte Street with its civic buildings and old institute, are worth a detour before you turn into the residential blocks.

## The quiet streets

The real pleasure of North Adelaide is in the blocks around Wellington Square and the lanes off the main streets: bluestone and sandstone villas, row cottages and small corner buildings, many of them more than a century old. Please remember these are private homes and keep to the footpath. The whole loop takes about two hours at an unhurried pace, and several bus routes run back to the city along O'Connell Street and King William Road.`,
    image: {
      file: 'File:Heritage-listed building on Pennington Terrace, North Adelaide (028A8518).jpg',
      alt: 'A single-storey heritage building with a verandah on Pennington Terrace, North Adelaide, behind a low stone wall and plane trees',
      credit: 'Yu Chu Chin',
      rightsNote: 'CC BY-SA 4.0 via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Heritage-listed_building_on_Pennington_Terrace,_North_Adelaide_(028A8518).jpg',
    },
  },
];
