/**
 * Search synonyms for the service taxonomy.
 *
 * A synonym earns its place by containing a word the service name does not:
 * search matches `name LIKE %term%` OR `synonym LIKE %term%`, so "plumbing
 * adelaide" helps nobody, while "plumber", "sparkie" and "aircon" are what
 * people actually type. Padding a list to a number would make search worse,
 * not better, so this is in two parts:
 *
 *  * a written list for the trades where the customer's word differs from
 *    ours, which is most of the useful ones; and
 *  * rules that derive the honest variants of any name — singular and plural,
 *    the head noun on its own, hyphens as spaces, an apostrophe dropped, and
 *    each half of "X and Y" — which apply to every service including the ones
 *    an editor adds later.
 *
 * Where the two together still come to fewer than five, that is reported
 * rather than invented.
 */

/** Terms a searcher uses that the service name does not contain. */
export const CURATED: Record<string, string[]> = {
  // Plumbing
  Plumbing: ['plumber', 'plumbers', 'pipework', 'leaking tap', 'water leak'],
  'Blocked drains': ['drain', 'clogged drain', 'drain unblocking', 'drain clearing', 'blocked toilet', 'blocked sink'],
  'Burst pipes': ['leaking pipe', 'water leak', 'pipe repair', 'flooding', 'broken pipe'],
  'Hot water systems': ['hot water', 'water heater', 'hot water repair', 'instant gas', 'heat pump'],
  'Gas fitting': ['gas fitter', 'gasfitter', 'gas plumber', 'gas leak', 'gas appliance'],
  'Bathroom plumbing': ['toilet', 'shower', 'vanity', 'tapware', 'bathroom leak'],
  // Electrical
  Electrical: ['electrician', 'sparky', 'sparkie', 'wiring', 'power'],
  'Switchboard upgrades': ['switchboard', 'fuse box', 'fusebox', 'meter box', 'electrical panel'],
  'Safety switches': ['rcd', 'circuit breaker', 'earth leakage', 'safety switch', 'trip switch'],
  'EV charger installation': ['ev charger', 'electric car charger', 'wallbox', 'car charger', 'home charger'],
  Lighting: ['lights', 'downlights', 'led', 'light fitting', 'ceiling light'],
  'Power points': ['power point', 'gpo', 'socket', 'outlet', 'double adapter'],
  'Fault finding': ['electrical fault', 'tripping', 'no power', 'short circuit', 'diagnostic'],
  // Roofing
  'Roof repairs': ['roofer', 'roof leak', 'leaking roof', 'tile repair', 'roof patch'],
  'Roof restoration': ['roof painting', 'repointing ridge', 'roof coating', 'roof spray', 'roof clean'],
  'Gutters and downpipes': ['gutter', 'guttering', 'downpipe', 'gutter cleaning', 'gutter guard'],
  Skylights: ['skylight', 'roof window', 'sun tunnel', 'velux', 'roof light'],
  'Storm damage': ['emergency roof', 'tarp', 'hail damage', 'wind damage', 'fallen branch'],
  // Painting
  'Interior painting': ['house painter', 'painter', 'repaint', 'wall painting', 'ceiling painting'],
  'Exterior painting': ['house painter', 'weatherboard painting', 'render painting', 'outside painting', 'fence painting'],
  'Plaster repair': ['plasterer', 'gyprock', 'plasterboard', 'crack repair', 'cornice'],
  Wallpapering: ['wallpaper', 'wall covering', 'feature wall', 'paper hanging', 'mural'],
  'Heritage colours': ['heritage paint', 'period colours', 'victorian colours', 'national trust colours', 'conservation paint'],
  // Flooring
  'Timber flooring': ['wooden floor', 'hardwood', 'floorboards', 'engineered timber', 'parquet'],
  'Floor sanding': ['sand and polish', 'floor sander', 'sanding boards', 'refinishing', 'floor restoration'],
  Polishing: ['polish', 'floor finish', 'buffing', 'sealing', 'lacquer'],
  'Laminate and vinyl': ['laminate', 'vinyl plank', 'lvp', 'hybrid flooring', 'floating floor'],
  Carpet: ['carpets', 'carpet laying', 'underlay', 'broadloom', 'carpet tiles'],
  // Heating and cooling
  'Split system installation': ['split system', 'air conditioning', 'aircon', 'reverse cycle', 'wall unit'],
  'Ducted heating': ['ducted', 'gas heater', 'central heating', 'heating repair', 'furnace'],
  'Evaporative cooling': ['evaporative', 'evap cooling', 'roof cooler', 'swamp cooler', 'cooling repair'],
  // Locksmiths
  'Emergency lockouts': ['locked out', 'lockout', 'locksmith', 'key locked in', 'open door'],
  Rekeying: ['rekey', 'change locks', 'new keys', 'lock change', 'key cutting'],
  Deadlocks: ['deadlock', 'deadbolt', 'door lock', 'security lock', 'mortice lock'],
  'Restricted key systems': ['restricted keys', 'master key', 'key system', 'patented key', 'apartment keys'],
  Safes: ['safe', 'strongbox', 'safe opening', 'safe installation', 'gun safe'],
  // Handyman and building
  'Odd jobs': ['handyman', 'small jobs', 'home repairs', 'maintenance man', 'jobs list'],
  'Flat-pack assembly': ['flat pack', 'ikea assembly', 'furniture assembly', 'flatpack', 'assembly'],
  'Picture hanging': ['hang pictures', 'mirror hanging', 'tv mounting', 'shelf hanging', 'wall fixing'],
  'Door adjustments': ['door sticking', 'door repair', 'hinge', 'door planing', 'door not closing'],
  Kitchens: ['kitchen renovation', 'new kitchen', 'kitchen fitting', 'benchtop', 'cabinetry'],
  Bathrooms: ['bathroom renovation', 'new bathroom', 'ensuite', 'waterproofing', 'tiling'],
  Extensions: ['extension', 'addition', 'second storey', 'rear extension', 'knock through'],
  // Masonry and fencing
  Repointing: ['repoint', 'mortar', 'tuckpointing', 'brick pointing', 'lime mortar'],
  'Brick repairs': ['bricklayer', 'brickwork', 'brick replacement', 'cracked brick', 'rebuild wall'],
  'Retaining walls': ['retaining wall', 'garden wall', 'sleeper wall', 'besser block', 'soil retention'],
  'Bluestone work': ['bluestone', 'stonemason', 'stonework', 'basalt', 'cobbles'],
  'Timber fencing': ['paling fence', 'wooden fence', 'fence builder', 'fence replacement', 'treated pine'],
  'Colorbond fencing': ['colorbond', 'metal fence', 'steel fence', 'sheet fence', 'fencing contractor'],
  'Picket fencing': ['picket fence', 'heritage fence', 'front fence', 'timber picket', 'garden fence'],
  Gates: ['gate', 'gate repair', 'automatic gate', 'side gate', 'driveway gate'],
  // Glass
  'Emergency board-up': ['broken window', 'smashed window', 'board up', 'glass emergency', 'window boarded'],
  'Window replacement': ['glazier', 'new window', 'window glass', 'reglaze', 'sash window'],
  'Double glazing': ['double glazed', 'secondary glazing', 'insulated glass', 'noise reduction window', 'thermal window'],
  'Shower screens': ['shower screen', 'frameless shower', 'glass shower', 'shower door', 'splashback'],
  Mirrors: ['mirror', 'wall mirror', 'mirror cut', 'bathroom mirror', 'mirror installation'],
  // Appliances
  'Washing machines': ['washing machine', 'washer', 'laundry repair', 'front loader', 'top loader'],
  Dishwashers: ['dishwasher', 'dish washer', 'dishwasher repair', 'not draining', 'kitchen appliance'],
  'Ovens and cooktops': ['oven', 'cooktop', 'stove', 'rangehood', 'element'],
  Fridges: ['fridge', 'refrigerator', 'freezer', 'not cooling', 'fridge repair'],
  Dryers: ['dryer', 'clothes dryer', 'tumble dryer', 'dryer repair', 'condenser dryer'],
  // Garden
  'Garden design': ['landscaper', 'landscape design', 'garden plan', 'courtyard design', 'garden makeover'],
  Paving: ['paver', 'pavers', 'patio', 'path', 'crazy paving'],
  Decking: ['deck', 'deck builder', 'merbau', 'composite decking', 'verandah'],
  Irrigation: ['sprinkler', 'dripline', 'watering system', 'reticulation', 'garden watering'],
  Pruning: ['tree pruning', 'trimming', 'hedge', 'lopping', 'canopy reduction'],
  'Tree removal': ['tree felling', 'cut down tree', 'tree lopper', 'remove tree', 'dangerous tree'],
  'Stump grinding': ['stump removal', 'stump grinder', 'tree stump', 'grind stump', 'root removal'],
  'Arborist reports': ['arborist report', 'tree report', 'council permit tree', 'tree assessment', 'vta'],
  // Pest
  'Termite inspections': ['termite inspection', 'white ants', 'termites', 'timber pest', 'borer'],
  'Termite treatment': ['termite barrier', 'white ant treatment', 'termite baiting', 'chemical barrier', 'termidor'],
  Rodents: ['rats', 'mice', 'rodent', 'mouse', 'rat removal'],
  'Ants and spiders': ['ants', 'spiders', 'cockroach', 'silverfish', 'general pest'],
  Wasps: ['wasp nest', 'european wasp', 'bees', 'hornet', 'nest removal'],
  // Pool and cleaning
  'Green pool recovery': ['green pool', 'algae', 'pool clean up', 'pool recovery', 'cloudy water'],
  'Water testing': ['pool water test', 'chlorine', 'ph test', 'chemical balance', 'water chemistry'],
  'Pump and filter repair': ['pool pump', 'filter', 'sand filter', 'cartridge filter', 'pool equipment'],
  'Regular cleaning': ['house cleaner', 'domestic cleaning', 'weekly clean', 'fortnightly clean', 'home cleaning'],
  'End of lease': ['bond clean', 'vacate clean', 'exit clean', 'move out clean', 'end of lease clean'],
  'Spring cleans': ['deep clean', 'once off clean', 'spring clean', 'big clean', 'detailed clean'],
  'Oven cleaning': ['oven clean', 'bbq clean', 'rangehood clean', 'degrease', 'grill clean'],
  'Carpet steam cleaning': ['carpet cleaning', 'steam clean', 'rug cleaning', 'stain removal', 'upholstery clean'],
  'High windows': ['second storey windows', 'water fed pole', 'hard to reach windows', 'upstairs windows', 'high access'],
  // Security
  'Alarm systems': ['burglar alarm', 'home alarm', 'security alarm', 'alarm install', 'back to base'],
  Cameras: ['cctv', 'security camera', 'surveillance', 'camera install', 'doorbell camera'],
  Intercoms: ['intercom', 'door station', 'video intercom', 'buzzer', 'entry phone'],
  Monitoring: ['alarm monitoring', 'back to base', 'security monitoring', 'patrol response', 'monitored alarm'],
  'Access control': ['fob', 'swipe card', 'keypad entry', 'door controller', 'building access'],
  // Auto
  'Logbook servicing': ['car service', 'logbook service', 'major service', 'minor service', 'mechanic'],
  Brakes: ['brake pads', 'brake repair', 'rotors', 'discs', 'squeaking brakes'],
  Batteries: ['car battery', 'flat battery', 'battery replacement', 'jump start', 'new battery'],
  Diagnostics: ['engine light', 'check engine', 'scan tool', 'fault code', 'car diagnostic'],
  'Roadworthy certificates': ['roadworthy', 'rwc', 'safety certificate', 'vehicle inspection', 'registration check'],
  Tyres: ['tyre', 'tires', 'wheel alignment', 'puncture', 'tyre fitting'],
  'Hand wash': ['car wash', 'wash and vac', 'exterior wash', 'car cleaning', 'hand car wash'],
  'Interior detailing': ['interior clean', 'car vacuum', 'seat cleaning', 'car shampoo', 'inside clean'],
  'Paint correction': ['cut and polish', 'swirl removal', 'machine polish', 'scratch removal', 'buff'],
  'Ceramic coating': ['ceramic', 'paint protection', 'nano coating', 'sealant', 'graphene coating'],
  'Breakdown recovery': ['tow truck', 'towing', 'roadside', 'broken down', 'recovery'],
  'Accident towing': ['tow truck', 'crash tow', 'accident tow', 'smash recovery', 'insurance tow'],
  'Tilt tray': ['flatbed', 'tilt tray truck', 'car transport', 'low clearance tow', 'prestige tow'],
  'House moves': ['removalist', 'movers', 'house removal', 'moving house', 'furniture removal'],
  'Office moves': ['office relocation', 'commercial move', 'business move', 'office removalist', 'workplace move'],
  Packing: ['packers', 'packing service', 'boxes', 'wrapping', 'unpacking'],
  'Piano moves': ['piano removal', 'piano transport', 'heavy item move', 'upright piano', 'grand piano'],
  // Health
  'Check-ups and cleans': ['dentist', 'scale and clean', 'dental check up', 'hygienist', 'teeth cleaning'],
  Fillings: ['filling', 'cavity', 'tooth decay', 'white filling', 'composite'],
  Crowns: ['crown', 'cap', 'bridge', 'onlay', 'tooth crown'],
  'Teeth whitening': ['whitening', 'zoom whitening', 'bleaching', 'white teeth', 'take home whitening'],
  'Emergency appointments': ['emergency dentist', 'toothache', 'broken tooth', 'dental emergency', 'same day dentist'],
  'Back and neck pain': ['back pain', 'neck pain', 'lower back', 'sciatica', 'sore back'],
  Headaches: ['headache', 'migraine', 'tension headache', 'head pain', 'cervicogenic'],
  'Sports injuries': ['sports injury', 'sprain', 'strain', 'running injury', 'shoulder injury'],
  'Dry needling': ['needling', 'acupuncture', 'trigger point', 'myofascial', 'muscle needling'],
  'Eye tests': ['eye test', 'optometrist', 'vision test', 'eye exam', 'prescription check'],
  Glasses: ['spectacles', 'frames', 'prescription glasses', 'reading glasses', 'eyewear'],
  'Contact lenses': ['contacts', 'contact lens', 'dailies', 'monthlies', 'lens fitting'],
  'Retinal imaging': ['retina scan', 'eye photo', 'fundus', 'macula check', 'optomap'],
  'Gym membership': ['gym', 'membership', 'weights', 'fitness centre', 'training'],
  'Personal training': ['personal trainer', 'pt', 'one on one training', 'coach', 'private session'],
  Pilates: ['reformer', 'mat pilates', 'clinical pilates', 'core strength', 'pilates class'],
  'Yoga classes': ['yoga', 'vinyasa', 'yin', 'hatha', 'beginners yoga'],
  Massage: ['massage therapist', 'relaxation massage', 'deep tissue', 'sports massage', 'bodywork'],
  'Remedial massage': ['remedial', 'deep tissue', 'myotherapy', 'muscle therapy', 'trigger point massage'],
  Facials: ['facial', 'skin treatment', 'peel', 'hydrafacial', 'skincare'],
  Waxing: ['wax', 'hair removal', 'brazilian', 'leg wax', 'threading'],
  // Personal care and shops
  Haircuts: ['haircut', 'barber', 'mens cut', 'trim', 'hair cut'],
  'Skin fades': ['fade', 'skin fade', 'clipper cut', 'taper', 'buzz cut'],
  'Beard trims': ['beard trim', 'beard shape', 'moustache', 'beard tidy', 'facial hair'],
  'Hot towel shaves': ['wet shave', 'cut throat shave', 'straight razor', 'traditional shave', 'hot towel'],
  'Dry cleaning': ['dry cleaner', 'dry clean', 'suit cleaning', 'coat cleaning', 'garment cleaning'],
  Laundry: ['wash and fold', 'shirt service', 'ironing', 'laundromat', 'washing service'],
  Alterations: ['tailor', 'hemming', 'taking in', 'clothing repair', 'seamstress'],
  'Wedding dresses': ['wedding dress cleaning', 'bridal gown', 'dress preservation', 'gown cleaning', 'dress boxing'],
  'Full grooms': ['dog groomer', 'pet grooming', 'dog wash', 'clip', 'puppy groom'],
  'Nail trims': ['nail clipping', 'claw trim', 'dog nails', 'pet nails', 'nail cut'],
  'Hand stripping': ['hand strip', 'wire coat', 'terrier grooming', 'stripping', 'plucking'],
  'De-shedding': ['deshed', 'undercoat removal', 'shedding', 'furminator', 'coat blowout'],
  Vaccinations: ['vaccination', 'vaccine', 'shots', 'c5', 'puppy vaccination'],
  Microchipping: ['microchip', 'chipping', 'pet id', 'chip scan', 'registration chip'],
  // Food and drink
  Coffee: ['espresso', 'latte', 'flat white', 'cappuccino', 'barista'],
  Breakfast: ['brekkie', 'brunch', 'eggs', 'morning food', 'breakfast menu'],
  Lunch: ['lunches', 'midday meal', 'sandwiches', 'salads', 'lunch menu'],
  Sourdough: ['sourdough bread', 'loaf', 'artisan bread', 'rye', 'levain'],
  Pastries: ['pastry', 'croissant', 'danish', 'bun', 'baked goods'],
  Pies: ['pie', 'meat pie', 'sausage roll', 'pastie', 'savoury'],
  'Celebration cakes': ['birthday cake', 'wedding cake', 'custom cake', 'cake order', 'celebration cake'],
  Cocktails: ['cocktail', 'mixed drinks', 'spirits', 'negroni', 'martini'],
  'Wine list': ['wine', 'wines', 'by the glass', 'cellar', 'sommelier'],
  'Bar snacks': ['snacks', 'small plates', 'share plates', 'bar food', 'nibbles'],
  'Live music': ['gigs', 'bands', 'dj', 'live band', 'music night'],
  'Set menu': ['banquet', 'tasting menu', 'degustation', 'fixed menu', 'group menu'],
  'Dine-in': ['eat in', 'sit down', 'restaurant', 'table booking', 'dining'],
  Takeaway: ['take away', 'takeout', 'pick up', 'to go', 'collection'],
  Delivery: ['home delivery', 'deliver', 'drop off', 'courier', 'delivered'],
  'Office catering': ['work catering', 'corporate catering', 'boardroom lunch', 'meeting catering', 'business catering'],
  'Grazing tables': ['grazing table', 'platter', 'charcuterie', 'antipasto', 'share table'],
  'Fresh seafood': ['fish', 'fishmonger', 'seafood', 'prawns', 'oysters'],
  'Fruit and vegetables': ['fruit', 'vegetables', 'greengrocer', 'produce', 'veg'],
  // Shops and services
  Books: ['bookshop', 'bookstore', 'novels', 'reading', 'titles'],
  'Vinyl records': ['records', 'vinyl', 'lp', 'record shop', 'albums'],
  Gifts: ['gift', 'presents', 'homewares', 'gift shop', 'giftware'],
  Flowers: ['florist', 'bouquet', 'blooms', 'flower delivery', 'posy'],
  'Wedding arrangements': ['wedding flowers', 'bridal bouquet', 'ceremony flowers', 'wedding florist', 'reception flowers'],
  Accounting: ['accountant', 'bookkeeper', 'cpa', 'financial statements', 'accounts'],
  'Tax returns': ['tax return', 'tax agent', 'income tax', 'bas', 'tax help'],
  Bookkeeping: ['bookkeeper', 'payroll', 'xero', 'myob', 'accounts payable'],
  Conveyancing: ['conveyancer', 'property settlement', 'section 32', 'title transfer', 'buying a house'],
  'Wills and estates': ['will', 'estate planning', 'probate', 'power of attorney', 'testament'],
  'Business advice': ['business consultant', 'advisory', 'structuring', 'strategy', 'business planning'],
  Weddings: ['wedding photographer', 'wedding photos', 'bridal photography', 'ceremony photos', 'wedding shoot'],
  Portraits: ['portrait', 'family photos', 'studio portrait', 'headshot', 'photo session'],
  Headshots: ['headshot', 'corporate photo', 'linkedin photo', 'profile photo', 'business portrait'],
  'Emergency call-out': ['emergency', 'urgent', 'after hours', '24 hour', 'same day'],
  'Same-day delivery': ['same day', 'urgent delivery', 'express', 'today delivery', 'rush delivery'],
  'Pre-purchase inspections': ['pre purchase inspection', 'building inspection', 'buyers inspection', 'inspection report', 'before buying'],

  // Written after a dry run listed every service the rules alone left under
  // five: each of these needed a word a searcher would type that the name and
  // its variants do not contain.
  'Antique restoration': ['antique repair', 'restoration', 'french polishing', 'heirloom furniture', 'period furniture'],
  Bar: ['bar service', 'drinks', 'licensed bar', 'cocktail bar', 'public bar'],
  Baths: ['bath', 'dog wash', 'pet wash', 'shampoo', 'bathing'],
  'Beginner programs': ['beginners', 'new to the gym', 'starter program', 'intro program', 'first timers'],
  Boarding: ['pet boarding', 'kennel', 'cattery', 'pet sitting', 'overnight stay'],
  'Body treatments': ['body scrub', 'body wrap', 'exfoliation', 'spa treatment', 'massage treatment'],
  'Boundary fences': ['boundary fence', 'dividing fence', 'neighbour fence', 'shared fence', 'fence line'],
  Bread: ['loaf', 'loaves', 'bakery bread', 'sourdough', 'rolls'],
  'Canapés': ['canapes', 'finger food', 'hors doeuvres', 'party food', 'bites'],
  'Car and marine trim': ['car seats', 'boat trim', 'motor trim', 'seat repair', 'vehicle upholstery'],
  Catering: ['caterer', 'catered', 'food service', 'event food', 'buffet'],
  'Children’s cuts': ['kids haircut', 'childrens haircut', 'first haircut', 'boys cut', 'girls cut'],
  'Children’s dentistry': ['kids dentist', 'childrens dentist', 'paediatric dental', 'child dental', 'school dental'],
  'Children’s vision': ['kids eye test', 'childrens eyes', 'school vision', 'child eye exam', 'myopia control'],
  'Chimney repairs': ['chimney', 'flue', 'chimney rebuild', 'fireplace repair', 'chimney flashing'],
  Chlorinators: ['chlorinator', 'salt cell', 'chlorine generator', 'salt water pool', 'cell replacement'],
  Commercial: ['commercial work', 'business premises', 'shop fitout', 'office work', 'trade work'],
  'Commercial painting': ['shop painting', 'office painting', 'strata painting', 'commercial painter', 'warehouse painting'],
  'Couples packages': ['couples massage', 'his and hers', 'two person package', 'couples treatment', 'pair package'],
  'Curtains and doonas': ['curtain cleaning', 'doona cleaning', 'quilt cleaning', 'blinds cleaning', 'drapes'],
  'Dental care': ['dentist', 'dental', 'oral health', 'teeth', 'dental treatment'],
  'Dental check-ups': ['dental check up', 'dentist visit', 'scale and clean', 'oral exam', 'six month check'],
  'Design and drafting': ['plans', 'drawings', 'architectural drafting', 'concept design', 'permit drawings'],
  'Dining chairs': ['chair recover', 'kitchen chairs', 'seat pads', 'chair upholstery', 'recovering chairs'],
  'Dry eye treatment': ['dry eyes', 'ipl eye', 'meibomian', 'eye drops', 'irritated eyes'],
  Events: ['event', 'party', 'function', 'celebration', 'gathering'],
  'Fabric supply': ['fabric', 'upholstery fabric', 'material', 'textiles', 'swatches'],
  'Foam replacement': ['new foam', 'cushion foam', 'seat foam', 'sagging cushions', 'foam cut'],
  'Function room': ['private room', 'event space', 'venue hire', 'room hire', 'party room'],
  Functions: ['function', 'events', 'private events', 'group booking', 'celebrations'],
  'Gift hampers': ['hamper', 'gift basket', 'corporate gift', 'christmas hamper', 'gift box'],
  'Gift vouchers': ['gift voucher', 'gift card', 'gift certificate', 'present voucher', 'e-voucher'],
  'Gift wrapping': ['wrapping', 'gift wrap', 'present wrapping', 'wrapped gift', 'bow and paper'],
  Grooming: ['dog groomer', 'pet groom', 'clipping', 'wash and clip', 'groomer'],
  'Head shaves': ['head shave', 'bald shave', 'razor shave', 'shaved head', 'number zero'],
  'Headlight restoration': ['headlight', 'foggy headlights', 'headlight polish', 'yellow headlights', 'lens restoration'],
  Homes: ['house', 'residential', 'domestic', 'home visit', 'houses'],
  'Interstate transport': ['interstate', 'sydney transport', 'long distance', 'interstate move', 'state to state'],
  'Leak detection': ['find leak', 'water leak', 'hidden leak', 'leak tracing', 'damp detection'],
  'Lounge reupholstery': ['sofa recover', 'couch reupholstery', 'lounge recover', 'sofa repair', 'settee'],
  'Machinery transport': ['machine move', 'plant transport', 'forklift move', 'equipment transport', 'heavy haulage'],
  Maintenance: ['upkeep', 'servicing', 'regular maintenance', 'maintenance visit', 'preventative'],
  'Mobile mechanic': ['come to you mechanic', 'on site mechanic', 'mobile car service', 'roadside mechanic', 'mechanic at home'],
  Mulching: ['mulch', 'wood chip', 'garden mulch', 'chipping', 'bark'],
  'Nutrition guidance': ['nutrition', 'diet advice', 'eating plan', 'macros', 'food coaching'],
  'Outdoor seating': ['outside tables', 'courtyard', 'alfresco', 'beer garden', 'terrace'],
  Parties: ['party', 'birthday', 'celebration', 'private party', 'group booking'],
  Permits: ['permit', 'council permit', 'planning permit', 'building permit', 'approval'],
  Physiotherapy: ['physio', 'physical therapy', 'rehab', 'sports physio', 'musculoskeletal'],
  Planting: ['plants', 'garden planting', 'new garden', 'shrubs', 'natives'],
  'Posture assessment': ['posture', 'desk posture', 'spinal assessment', 'alignment check', 'ergonomic assessment'],
  'Pre-sale detail': ['pre sale detail', 'sale preparation', 'presentation detail', 'selling my car', 'dealer detail'],
  'Prints and albums': ['prints', 'photo album', 'photo book', 'enlargements', 'framed print'],
  'Project management': ['site management', 'builder coordination', 'trade coordination', 'job management', 'build management'],
  'Puppy introductions': ['puppy groom', 'first groom', 'puppy visit', 'socialisation', 'young dog'],
  'Regular schedules': ['recurring', 'scheduled visit', 'weekly service', 'fortnightly service', 'ongoing'],
  'Regular servicing': ['scheduled service', 'routine service', 'pool service', 'ongoing servicing', 'regular visit'],
  Rehabilitation: ['rehab', 'recovery', 'post surgery', 'return to sport', 'exercise therapy'],
  Rendering: ['render', 'cement render', 'acrylic render', 'wall render', 'rendered finish'],
  Repairs: ['repair', 'fixing', 'mend', 'broken', 'restoration'],
  'Roadside assistance': ['roadside', 'breakdown help', 'flat tyre', 'jump start', 'stranded'],
  'Same-day service': ['same day', 'today', 'urgent', 'express', 'quick turnaround'],
  Servicing: ['service', 'tune up', 'maintenance', 'scheduled service', 'check over'],
  Shelving: ['shelves', 'shelf', 'bookshelf', 'floating shelf', 'storage shelf'],
  'Shopfront glass': ['shop window', 'retail glass', 'store front glass', 'display window', 'commercial glazing'],
  'Shopfront locks': ['shop lock', 'retail lock', 'store security', 'commercial lock', 'roller door lock'],
  Shopfronts: ['shop front', 'retail', 'store', 'commercial premises', 'shop window'],
  'Single items': ['one item', 'single piece', 'one off delivery', 'item move', 'small move'],
  'Small group classes': ['group class', 'small class', 'semi private', 'group training', 'class'],
  'Solar panels': ['solar', 'panel cleaning', 'pv panels', 'solar cleaning', 'rooftop solar'],
  'Special orders': ['order in', 'request a title', 'bring it in', 'custom order', 'out of stock order'],
  'Staff and hire': ['waitstaff', 'equipment hire', 'glassware hire', 'staffing', 'service staff'],
  Storage: ['store', 'self storage', 'storage unit', 'warehousing', 'keep my things'],
  'Strength programs': ['strength training', 'weights program', 'lifting program', 'powerlifting', 'barbell'],
  Surgery: ['operation', 'desexing', 'vet surgery', 'procedure', 'theatre'],
  'Takeaway bottles': ['bottle shop', 'take home wine', 'retail bottles', 'buy a bottle', 'off premise'],
  'Tiling repairs': ['tile repair', 'cracked tile', 'regrout', 'loose tiles', 'tiling'],
  'Tracks and sills': ['window track', 'sill cleaning', 'runner cleaning', 'window channel', 'sliding door track'],
  'Warranty repairs': ['warranty', 'under warranty', 'authorised repair', 'manufacturer repair', 'warranty claim'],
  Whitening: ['teeth whitening', 'bleaching', 'white teeth', 'zoom', 'take home kit'],
  Wholesale: ['trade supply', 'bulk', 'trade prices', 'wholesale order', 'supply'],
  'Wholesale supply': ['wholesale', 'trade supply', 'bulk supply', 'restaurant supply', 'trade order'],
  Windows: ['window', 'glass', 'window cleaning', 'glazing', 'panes'],};

/** Words whose shorter form people type instead. */
const SHORTHAND: [RegExp, string][] = [
  [/repairs?\b/i, 'fix'],
  [/installations?\b/i, 'install'],
  [/cleaning\b/i, 'clean'],
  [/servicing\b/i, 'service'],
  [/replacements?\b/i, 'replace'],
  [/inspections?\b/i, 'check'],
];

const singular = (word: string): string | null => {
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/i.test(word)) return word.slice(0, -2);
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return null;
};

/**
 * The honest variants of a name: no new meaning, only the other ways the same
 * words get typed.
 */
export function deriveSynonyms(name: string): string[] {
  const out: string[] = [];
  const lower = name.toLowerCase();
  const add = (value: string) => {
    const term = value.trim().replace(/\s+/g, ' ');
    if (term.length >= 2 && term.length <= 80 && term !== lower && !out.includes(term)) out.push(term);
  };

  const words = lower.split(/\s+/);
  const last = words[words.length - 1]!;
  const single = singular(last);
  if (single) add([...words.slice(0, -1), single].join(' '));
  else add(`${lower}s`);

  // The head noun on its own: someone searching "drains" should find "Blocked drains".
  if (words.length > 1) {
    add(last);
    if (single) add(single);
  }
  if (lower.includes('-')) add(lower.replace(/-/g, ' '));
  if (lower.includes('’') || lower.includes("'")) add(lower.replace(/['’]/g, ''));
  // "X and Y" is two things people search for separately.
  const parts = lower.split(/\s+and\s+/);
  if (parts.length === 2) for (const part of parts) add(part);
  for (const [pattern, short] of SHORTHAND) if (pattern.test(lower)) add(lower.replace(pattern, short));
  return out;
}

/** Everything worth storing for one service, longest-standing first. */
export function synonymsFor(name: string): string[] {
  const curated = (CURATED[name] ?? []).map((term) => term.toLowerCase());
  const merged: string[] = [];
  for (const term of [...curated, ...deriveSynonyms(name)]) {
    if (term.length >= 2 && term.length <= 80 && !merged.includes(term)) merged.push(term);
  }
  // The API allows twenty.
  return merged.slice(0, 20);
}
