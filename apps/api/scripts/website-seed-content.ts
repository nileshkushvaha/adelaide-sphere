/**
 * Demonstration content for the website surfaces that have none: the FAQ page,
 * the testimonials on the home page, the clients-and-partners strip, and the
 * comments under the seeded articles.
 *
 * Written out rather than composed, because there are a few dozen of each and
 * every one is read closely — an FAQ answer that does not answer anything, or
 * a comment that does not sound like a person, is worse than an empty list.
 *
 * Fictional on the same terms as the rest: invented people, invented
 * organisations, addresses on domains that belong to nobody.
 */

export interface SeedFaq {
  question: string;
  /** Markdown; rendered and sanitised on the way in, as the editor's would be. */
  answer: string;
  group: string;
  published?: boolean;
}

export const SEED_FAQS: SeedFaq[] = [
  // Listings
  { group: 'Listings', question: 'How do I add my business to Adelaide Sphere?', answer: 'Send us the details through the contact page and we will get back to you. Every listing is checked by an editor before it appears: we confirm the business is in Inner Adelaide, that the contact details work, and that you are happy with the wording and images.' },
  { group: 'Listings', question: 'Does it cost anything to be listed?', answer: 'No. A standard listing is free, and there is no paid placement in search results. Featured placements appear in a separate, labelled block above results and never change the order of the results themselves.' },
  { group: 'Listings', question: 'Which suburbs do you cover?', answer: 'Inner Adelaide only — the City of Adelaide, which takes in the city centre and North Adelaide, plus the Norwood Payneham & St Peters, Unley, Prospect, Walkerville, Burnside and West Torrens council areas. That is 108 suburbs in all, each with a page of its own, and a business must be in one of them to be listed. We are not planning to expand to other cities.' },
  { group: 'Listings', question: 'How do I change my opening hours or contact details?', answer: 'Email the editors from the address on your listing and tell us what has changed. Hours are supplied by the business, so we only change them when the business asks us to. All hours on the site are shown in Adelaide time, and daylight saving is handled for you.' },
  { group: 'Listings', question: 'Can I have my listing removed?', answer: 'Yes, at any time, and without giving a reason. Write to the editors from an address we can connect to the business and we will unpublish it the same day. The public page is then removed and the old address returns a "not found".' },
  { group: 'Listings', question: 'Why does my listing say "hours not published"?', answer: 'Because we have not been given them. A listing without hours is still published — it just does not claim to know when you are open, which is better than guessing. Send them through and they will appear.' },
  { group: 'Listings', question: 'How long does it take for a new listing to appear?', answer: 'Usually two to three working days. Most of that is the editorial check: confirming the address, trying the phone number and reading the description. We will tell you if anything is holding it up.' },
  // Reviews
  { group: 'Reviews', question: 'Are reviews checked before they appear?', answer: 'Yes. Every review is read by a moderator before it is published. We check it describes a real experience of the business and that it does not name individual staff, repeat hearsay or contain personal information.' },
  { group: 'Reviews', question: 'Can a business pay to have a review removed?', answer: 'No. Reviews are removed only when they break the guidelines — and if we remove one, the reason is recorded. A business owner can reply to us about a review, but paying for its removal is not something we offer.' },
  { group: 'Reviews', question: 'Why has my review not appeared?', answer: 'It may still be waiting for a moderator, or it may not have met the guidelines. The most common reasons are naming an individual, describing something that happened to somebody else, or including a phone number or email address.' },
  { group: 'Reviews', question: 'Is my email address published with my review?', answer: 'No. We ask for it so we can contact you about the review if we need to, and it is stored encrypted. It is never shown on the site and never given to the business.' },
  { group: 'Reviews', question: 'Can I edit or delete a review I left?', answer: 'Write to us and we will remove it. We do not offer editing: a review that changes after people have read it is not much use to anybody, so we take the old one down instead.' },
  // Enquiries
  { group: 'Enquiries', question: 'What happens when I send an enquiry?', answer: 'It is relayed straight to the business by email. We do not see a copy beyond what is needed to deliver it and to tell you if the delivery failed, and we do not pass your address to anyone else.' },
  { group: 'Enquiries', question: 'How long should I wait for a reply?', answer: 'That is up to the business — most reply within a day or two. If your message could not be delivered at all, we will know about it, and you can tell us through the contact page so the listing can be corrected.' },
  { group: 'Enquiries', question: 'Why can I not send an enquiry to some businesses?', answer: 'Because they have not given us an address to deliver it to. Those listings show a phone number or a website instead, which is more honest than a form that goes nowhere.' },
  // Your details
  { group: 'Your details', question: 'What do you do with my personal information?', answer: 'We keep as little as we can and only for as long as it is useful. Contact details you send with a review or an enquiry are stored encrypted and are not sold, shared or used for marketing. The privacy policy sets out the detail.' },
  { group: 'Your details', question: 'Do you use tracking cookies?', answer: 'Only if you agree to them. Nothing that tracks you loads until you choose "accept" on the banner, and you can change your mind at any time. The site works exactly the same if you decline.' },
  { group: 'Your details', question: 'How do I ask for my information to be deleted?', answer: 'Write to us through the contact page and say what you would like removed. We will confirm what we hold, delete what we can, and tell you plainly if something has to be kept and why.' },
  // About
  { group: 'About Adelaide Sphere', question: 'Who writes the guides and the category pages?', answer: 'A small, independent editorial team in Adelaide. The guides are written by people who have been to the places they describe, and nothing in them is paid for by the businesses mentioned.' },
  { group: 'About Adelaide Sphere', question: 'How do you decide what appears first in search results?', answer: 'Results are ordered by how well they match what you searched for, and then by rating and how recently the listing was updated. No business can pay to move up. Featured placements are shown separately and labelled.' },
  { group: 'About Adelaide Sphere', question: 'I have found a mistake. How do I report it?', answer: 'Use the contact page, or the "report" link on a review or comment. Tell us what is wrong and where you saw it — a link helps enormously — and we will correct it and say so.' },
  { group: 'About Adelaide Sphere', question: 'Do you have an app?', answer: 'No, and we have no plans for one. The site is built to work properly on a phone browser, which is the same thing without asking you to install anything.', published: false },
];

export interface SeedTestimonial {
  name: string;
  relationship: string;
  quote: string;
  /** Stars this person gave. Omitted where they gave none, which is a real case. */
  rating?: 4 | 5;
  /** Slug of a seeded listing, when the quote is from one of them. */
  business?: string;
  published?: boolean;
}

export const SEED_TESTIMONIALS: SeedTestimonial[] = [
  { rating: 5, name: 'Marika Stevens', relationship: 'Owner', business: 'wakefield-lane-espresso', quote: 'We are tucked down a lane off Wakefield Street, so half the city walks past without knowing we exist. Within a month of being on Adelaide Sphere we had office workers coming in who said they found us here. The editors checked our hours with us before anything went up, which nobody else has ever bothered to do.' },
  { rating: 5, name: 'Daniel Okonkwo', relationship: 'Owner', business: 'thebarton-plumbing-and-gas', quote: 'Most directories sell you a package and then sell your competitor a better one. This one just lists you properly. When the hot water systems started giving out in June, half our new calls came through the listing.' },
  { rating: 5, name: 'Sophie Tran', relationship: 'Visitor, Unley', quote: 'I moved to Unley in February and used the area page to find a vet, a bakery and somebody to service the evaporative cooler before the next heatwave. All three were exactly what the listings said they were, which sounds like a low bar until you have used the alternatives.' },
  { rating: 5, name: 'Reuben Clarke', relationship: 'Owner', business: 'mile-end-fish-market', quote: 'My father ran this shop for thirty years without a website. The listing was written in an afternoon, the photographs are honest, and it has brought us a new generation of customers from the eastern suburbs who had never had a reason to drive out to Mile End.' },
  { rating: 4, name: 'Anita Bose', relationship: 'Visitor, Prospect', quote: 'The opening hours are right, including over daylight saving. I know that is a strange thing to praise, but I have been caught out enough times to notice when a directory keeps them current.' },
  { rating: 5, name: 'Tom Whelan', relationship: 'Owner', business: 'o-connell-street-barbers', quote: 'A customer told me she picked us because the review said we were good with nervous kids. That review went up because somebody read it first and checked it was fair. That matters to a small shop on a street full of them.' },
  { rating: 5, name: 'Grace Mbeki', relationship: 'Visitor, North Adelaide', quote: 'I wanted a physio who did clinical Pilates and was open before work. Two filters and I had three options, all of them real and all within a short ride. That is all I wanted a directory to do.' },
  { rating: 4, name: 'Peter Lawson', relationship: 'Owner', business: 'east-end-books', quote: 'We have been in the East End since 1998 and have watched a lot of listing sites come and go. This is the first one that asked what we actually stock before writing about us.' },
  { rating: 5, name: 'Hannah Reid', relationship: 'Visitor, Norwood', quote: 'The enquiry form went straight to the business and they rang me back within the hour. No sales calls afterwards from anybody else, which is more than I can say for the last site I used.' },
  { rating: 5, name: 'Julian Marsh', relationship: 'Owner', business: 'torrens-bank-kitchen', quote: 'People think of North Adelaide as a Friday-night street and forget there is a riverbank at the bottom of the hill. Having a proper area page with our listing on it has genuinely changed who walks in on a Tuesday.' },
  { name: 'Elif Demir', relationship: 'Visitor, Walkerville', quote: 'I like that featured listings are in their own labelled box. I know what I am looking at, and the rest of the results are in the order the site says they are in.', published: false },
];

export interface SeedPartner {
  name: string;
  relationship: string;
  website: string;
  note: string;
  /** Two letters for the generated wordmark, and the colour behind them. */
  initials: string;
  colour: string;
  published?: boolean;
}

export const SEED_PARTNERS: SeedPartner[] = [
  { name: 'Norwood Parade Traders Group', relationship: 'Local business association', website: 'https://paradetraders.example.org', note: 'Logo and name supplied by their communications officer, 4 March 2026, for use on the partners strip.', initials: 'NP', colour: '#0B1F3A' },
  { name: 'Thebarton Chamber of Commerce', relationship: 'Local business association', website: 'https://thebartonchamber.example.org', note: 'Written permission from the chamber secretary, 12 March 2026.', initials: 'TC', colour: '#0369A1' },
  { name: 'West Torrens Business Network', relationship: 'Business network', website: 'https://wtbusiness.example.org', note: 'Permission by email from the network coordinator, 2 April 2026.', initials: 'WT', colour: '#155E75' },
  { name: 'Torrens Small Business Advisory', relationship: 'Advisory service', website: 'https://torrenssmallbusiness.example.org', note: 'Brand usage agreed with their partnerships team, 19 April 2026, current for twelve months.', initials: 'TS', colour: '#065F46' },
  { name: 'Park Lands Makers Collective', relationship: 'Makers and traders collective', website: 'https://parklandsmakers.example.org', note: 'Logo supplied with the partnership pack, 7 May 2026.', initials: 'PM', colour: '#7C2D12' },
  { name: 'Inner East Food Alliance', relationship: 'Hospitality group', website: 'https://innereastfood.example.org', note: 'Permission recorded in the partnership email thread, 21 May 2026.', initials: 'IE', colour: '#9D174D' },
  { name: 'Rundle Street Retail Forum', relationship: 'Retail forum', website: 'https://rundleretail.example.org', note: 'Approved by the forum chair on a call, 3 June 2026; confirmation email on file.', initials: 'RR', colour: '#4C1D95' },
  { name: 'Adelaide Hills Growers Co-op', relationship: 'Produce supplier network', website: 'https://hillsgrowers.example.org', note: 'Logo pack received from the co-op office, 15 June 2026.', initials: 'AH', colour: '#3F6212', published: false },
];

export interface SeedComment {
  /** Slug of the seeded article this belongs under. */
  post: string;
  name: string;
  text: string;
  status: 'approved' | 'pending' | 'rejected';
  daysAgo: number;
  /** Set for a comment an editor has redacted; replaces the public text. */
  redactedTo?: string;
  redactionReason?: string;
  moderationReason?: string;
}

/**
 * Comments across the seeded articles, in every state the moderation queue has
 * to deal with: published, waiting, refused, and one that was published after
 * a personal detail was taken out of it.
 */
export const SEED_COMMENTS: SeedComment[] = [
  // East End
  { post: 'first-timers-guide-to-the-east-end', name: 'Bianca R.', status: 'approved', daysAgo: 4, text: 'Went on a Sunday morning as suggested and had Rundle Street almost to myself. Coffee, a lap of Rymill Park, and back before the brunch crowd arrived.' },
  { post: 'first-timers-guide-to-the-east-end', name: 'Duc N.', status: 'approved', daysAgo: 11, text: 'Good point about the laneway murals changing. I photographed one in March that had been painted over by May — that is the whole point of it really.' },
  { post: 'first-timers-guide-to-the-east-end', name: 'Steph M.', status: 'approved', daysAgo: 26, text: 'Would add: a couple of the cafés on Ebenezer Place open at seven, which makes an early walk through to the Botanic Garden much more appealing.' },
  { post: 'first-timers-guide-to-the-east-end', name: 'Anon', status: 'rejected', daysAgo: 19, text: 'This is rubbish, the East End is overpriced and anyone who actually enjoys it has no taste whatsoever.', moderationReason: 'Abusive toward other readers rather than about the article' },
  { post: 'first-timers-guide-to-the-east-end', name: 'Martin K.', status: 'pending', daysAgo: 1, text: 'Can you still hire the rowboats on the Rymill Park lake? A friend said they had stopped over winter.' },
  // Central Market
  { post: 'central-market-without-the-queue', name: 'Leila F.', status: 'approved', daysAgo: 6, text: 'The advice about going mid-morning on a Wednesday is correct and I am now slightly annoyed that everyone knows it.' },
  { post: 'central-market-without-the-queue', name: 'Ivan P.', status: 'approved', daysAgo: 15, text: 'One thing to add — most of the deli stalls will vacuum-pack cheese and smallgoods if you ask, which makes the bus home in February a lot less of a gamble.' },
  { post: 'central-market-without-the-queue', name: 'Rosa T.', status: 'approved', daysAgo: 33, text: 'I have shopped here for twenty years and still learned something about the Saturday timings. And yes, lunch in Chinatown afterwards is the only sensible way to finish.' },
  { post: 'central-market-without-the-queue', name: 'Greg H.', status: 'approved', daysAgo: 48, redactedTo: 'Great guide. The fish stall near the Gouger Street entrance is the one I always use — ask for the whole fish and they will fillet it while you wait.', redactionReason: 'A stallholder was named alongside a personal remark', text: 'Great guide. The fish stall near the Gouger Street entrance is the one I always use — ask for Vince, he will fillet it while you wait and he owes me a favour anyway.' },
  { post: 'central-market-without-the-queue', name: 'Priya S.', status: 'pending', daysAgo: 2, text: 'Is the market open on Mondays at all, or only Tuesday to Saturday?' },
  // Trams
  { post: 'getting-around-adelaide-by-tram', name: 'Callum W.', status: 'approved', daysAgo: 3, text: 'The bit about where the free city section ends is the thing every visitor gets wrong. Clearest explanation I have read.' },
  { post: 'getting-around-adelaide-by-tram', name: 'Yui T.', status: 'approved', daysAgo: 9, text: 'Tapping your Metrocard inside the free section does not charge you anything — worth saying, because people panic about it and hold up the doors.' },
  { post: 'getting-around-adelaide-by-tram', name: 'Ahmed B.', status: 'approved', daysAgo: 21, text: 'Would have loved this article when I arrived. Took me two weeks to realise the tram only covers one line and the buses do the rest.' },
  { post: 'getting-around-adelaide-by-tram', name: 'Jenny L.', status: 'approved', daysAgo: 40, text: 'The tram to Glenelg on a hot evening, fish and chips on the sand at Moseley Square, tram home. Still the best value night out in town.' },
  { post: 'getting-around-adelaide-by-tram', name: 'Unknown', status: 'rejected', daysAgo: 30, text: 'Buy cheap metrocards here www.example-scam-site.test cheapest in australia click now', moderationReason: 'Advertising an unrelated site' },
  // Botanic Garden
  { post: 'morning-in-the-botanic-garden', name: 'Margot D.', status: 'approved', daysAgo: 5, text: 'The early start is the right call in summer. The paths along First Creek were shady and almost empty before nine.' },
  { post: 'morning-in-the-botanic-garden', name: 'Sanjay K.', status: 'approved', daysAgo: 17, text: 'Botanic Park next door is busier than the article suggests on weekends, but the garden paths themselves are quiet enough.' },
  { post: 'morning-in-the-botanic-garden', name: 'Fiona A.', status: 'approved', daysAgo: 29, text: 'Took my mother, who uses a walking frame. The main paths and the Bicentennial Conservatory were all manageable — good to know for anyone wondering.' },
  { post: 'morning-in-the-botanic-garden', name: 'Oliver M.', status: 'pending', daysAgo: 1, text: 'Is the Museum of Economic Botany open on weekends? The article mentions it but not the days.' },
  // The Parade
  { post: 'the-parade-after-dark', name: 'Carla V.', status: 'approved', daysAgo: 7, text: 'Finally an article about The Parade that does not just list the same four places. The bit about the eastern end past Osmond Terrace is spot on.' },
  { post: 'the-parade-after-dark', name: 'Ben S.', status: 'approved', daysAgo: 14, text: 'Went last Friday on the strength of this. The gelato queue at eleven at night is a genuinely Norwood sight.' },
  { post: 'the-parade-after-dark', name: 'Nadine O.', status: 'approved', daysAgo: 38, text: 'Parking is the one thing I would add — the side streets are mostly resident permit zones and they do check. The council car parks behind the shops are the easier option.' },
  { post: 'the-parade-after-dark', name: 'Hamish G.', status: 'pending', daysAgo: 3, text: 'Any recommendations for somewhere still serving after midnight midweek?' },
  // North Adelaide
  { post: 'north-adelaide-on-foot', name: 'Tessa L.', status: 'approved', daysAgo: 8, text: 'Did the whole walk on Saturday. About two hours with stops, and the order of it works — you finish on O’Connell Street, right where you want to sit down.' },
  { post: 'north-adelaide-on-foot', name: 'Raf M.', status: 'approved', daysAgo: 20, text: 'Good to see the bluestone cottages around Wellington Square get a mention rather than just the shops on O’Connell Street.' },
  { post: 'north-adelaide-on-foot', name: 'Priyanka N.', status: 'approved', daysAgo: 31, text: 'The map would be even better with the bus stops marked, but the directions were clear enough to follow on foot.' },
  { post: 'north-adelaide-on-foot', name: 'Dan W.', status: 'approved', daysAgo: 55, text: 'Went with two kids, aged six and nine. The lookout over the Park Lands was a hit, but the second half was too long for them — worth splitting it if you have small legs.' },
  { post: 'north-adelaide-on-foot', name: 'Kate B.', status: 'pending', daysAgo: 2, text: 'Is the walk doable with a pram? Some of those footpaths outside the old cottages looked narrow in the photos.' },
];
