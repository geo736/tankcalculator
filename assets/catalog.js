// The list of calculators shown on the home page.
// status: 'live' links to calculators/<slug>.html, 'soon' shows a disabled tile.
// cat: tile color (aquaculture | aquaponics | hydroponics); tags: which filters show it.
// uses: task filters from CALC_USES below.
// icon: inner markup of a 24×24 stroke icon.

// What people are trying to do. Each calculator lists one or more of these in `uses`.
window.CALC_USES = [
  { id: 'design', label: 'System design' },
  { id: 'plumbing', label: 'Plumbing & pumps' },
  { id: 'filtration', label: 'Filtration' },
  { id: 'water', label: 'Water quality' },
  { id: 'fish', label: 'Fish care & feeding' },
  { id: 'plants', label: 'Plant nutrition' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'power', label: 'Power & backup' },
  { id: 'money', label: 'Costs & planning' }
];

window.CALCULATORS = [
  { slug: 'tank-volume', name: 'Tank Volume', blurb: 'Any tank, any shape', cat: 'aquaponics', tags: ['aquaponics', 'aquaculture', 'hydroponics'], uses: ['design'], status: 'live',
    icon: '<path d="M4 5v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5"/><path d="M4 11c2.7 1.3 5.3-1.3 8 0s5.3 1.3 8 0"/>' },

  { slug: 'fish-stocking-density', name: 'Fish Stocking Density', blurb: 'Biomass, density and capacity', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['fish', 'design'], status: 'live',
    icon: '<path d="M3 12c3-5 10-6 14 0-4 6-11 5-14 0z"/><path d="M17 12l4-3v6z"/><circle cx="8" cy="11" r="0.8" fill="currentColor"/>' },
  { slug: 'feeding-rate', name: 'Feeding Rate', blurb: 'Daily fish feed and growth', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['fish'], status: 'live',
    icon: '<circle cx="7" cy="16" r="2"/><circle cx="13" cy="18" r="1.5"/><circle cx="16" cy="12" r="2"/><path d="M10 4h8l-2 5h-4z"/>' },
  { slug: 'grow-bed-ratio', name: 'Grow Bed Ratio', blurb: 'Fish tank to grow bed', cat: 'aquaponics', tags: ['aquaponics'], uses: ['design', 'plants'], status: 'live',
    icon: '<path d="M3 5h7v14H3z"/><path d="M14 13h7v6h-7z"/><path d="M17.5 13V9m0 1.5-2-1.5m2 0 2-1.5"/>' },
  { slug: 'pump-turnover', name: 'Pump & Turnover', blurb: 'Size pumps by turnover', cat: 'aquaponics', tags: ['aquaponics', 'aquaculture', 'hydroponics'], uses: ['plumbing', 'design', 'power', 'money'], status: 'live',
    icon: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>' },
  { slug: 'nutrient-ec', name: 'Nutrient EC', blurb: 'Predict EC from nutrient ions', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['plants', 'water'], status: 'live',
    icon: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>' },
  { slug: 'ph-adjustment', name: 'pH Adjustment', blurb: 'Acid dose from alkalinity', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['water', 'plants'], status: 'live',
    icon: '<path d="M9 3h6"/><path d="M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 15h9"/>' },
  { slug: 'daily-light-integral', name: 'Daily Light Integral', blurb: 'Plant light per day vs crop', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['lighting', 'plants'], status: 'live',
    icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  { slug: 'dissolved-oxygen', name: 'Dissolved Oxygen', blurb: 'Oxygen saturation and % DO', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['water', 'fish'], status: 'live',
    icon: '<circle cx="8" cy="15" r="4"/><circle cx="16" cy="9" r="3"/><circle cx="17" cy="18" r="2"/>' },
  { slug: 'hydrostatic-pressure', name: 'Hydrostatic Pressure', blurb: 'Water pressure and wall force', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['design', 'plumbing'], status: 'live',
    icon: '<path d="M5 4v16h14"/><path d="M5 4l14 16"/><path d="M9 14h4"/>' },
  { slug: 'growing-media-fill', name: 'Growing Media Fill', blurb: 'Media bags, weight and cost', cat: 'aquaponics', tags: ['aquaponics', 'hydroponics'], uses: ['design', 'money'], status: 'live',
    icon: '<path d="M3 9h18l-2 11H5z"/><circle cx="9" cy="14" r="1.5"/><circle cx="14" cy="15" r="1.5"/>' },
  { slug: 'iron-addition', name: 'Iron Addition', blurb: 'Chelated iron dose and pH', cat: 'aquaponics', tags: ['aquaponics', 'hydroponics'], uses: ['plants', 'water'], status: 'live',
    icon: '<path d="M7 3h10l-1 6H8z"/><path d="M12 13v4"/><circle cx="12" cy="19" r="2"/>' },
  { slug: 'biological-surface-area', name: 'Biofilter Surface Area', blurb: 'Size biofilter media from feed', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['filtration', 'design'], status: 'live',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/>' },
  { slug: 'fish-hauling', name: 'Fish Hauling', blurb: 'Safe transport loads and trip needs', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['fish'], status: 'live',
    icon: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>' },
  { slug: 'water-velocity', name: 'Pipe Water Velocity', blurb: 'Flow speed and pipe sizing', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['plumbing'], status: 'live',
    icon: '<path d="M3 8h18M3 16h18"/><path d="M7 12h8l-2-2M15 12l-2 2"/>' },
  { slug: 'grow-bed-volume', name: 'Grow Bed Volume', blurb: 'Bed water, area, plant sites', cat: 'aquaponics', tags: ['aquaponics', 'hydroponics'], uses: ['design', 'plants'], status: 'live',
    icon: '<path d="M3 10h18v8H3z"/><path d="M8 10V6M12 10V5M16 10V6"/>' },
  { slug: 'salt-addition', name: 'Salt Addition', blurb: 'Salt dose for fish health', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['water', 'fish'], status: 'live',
    icon: '<path d="M8 3h8v4H8z"/><path d="M7 7h10v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M10 12h4"/>' },
  { slug: 'feed-rate-to-grow-space', name: 'Feed Rate to Grow Space', blurb: 'Balance fish feed and plants', cat: 'aquaponics', tags: ['aquaponics'], uses: ['design', 'plants', 'fish'], status: 'live',
    icon: '<path d="M3 20h18"/><path d="M7 20v-6M12 20v-9M17 20v-4"/><circle cx="12" cy="5" r="2"/>' },
  { slug: 'tan-conversion', name: 'TAN Conversion', blurb: 'Ammonia units and NH₃ toxicity', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['water', 'fish'], status: 'live',
    icon: '<path d="M4 8h12l-3-3M20 16H8l3 3"/>' },
  { slug: 'mineralization-tank', name: 'Mineralization Tank', blurb: 'Size a solids digester tank', cat: 'aquaponics', tags: ['aquaponics'], uses: ['filtration', 'plants'], status: 'live',
    icon: '<path d="M6 4h12v16H6z"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="11" r="1"/><circle cx="12" cy="17" r="1"/>' },
  { slug: 'light-conversions', name: 'Light Conversions', blurb: 'Lux, PPFD, W/m² converter', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['lighting'], status: 'live',
    icon: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>' },
  { slug: 'head-loss', name: 'Head Loss', blurb: 'Pipe friction and pump head', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['plumbing'], status: 'live',
    icon: '<path d="M3 6h7v12h11"/><path d="M17 15l4 3-4 3"/>' },
  { slug: 'internal-tank-velocity', name: 'Internal Tank Velocity', blurb: 'Jet-driven rotation, self-cleaning', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['plumbing', 'fish', 'design'], status: 'live',
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7a5 5 0 1 1-5 5"/><path d="M7 9v3h3"/>' },
  { slug: 'sump-drainback', name: 'Sump Drain-Back', blurb: 'Will your sump catch drain-back?', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['design', 'plumbing', 'power'], status: 'live',
    icon: '<path d="M3 4h7v5H3zM14 4h7v5h-7z"/><path d="M6.5 9v4l3 2M17.5 9v4l-3 2"/><path d="M5 15v6h14v-6"/>' },
  { slug: 'battery-life', name: 'Battery Life Estimator', blurb: 'Backup runtime for pumps', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['power'], status: 'live',
    icon: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2"/><path d="M7 10v4M10 10v4"/>' },
  { slug: 'uv-sterilizer-sizing', name: 'UV Filtration Sizing', blurb: 'UV-C dose for target pathogens', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics', 'hydroponics'], uses: ['filtration', 'water', 'fish'], status: 'live',
    icon: '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M8 5v2M12 4v3M16 5v2M8 17v2M12 17v3M16 17v2"/>' },
  { slug: 'drum-filter-sizing', name: 'Drum Filter Sizing', blurb: 'Size a drum microscreen', cat: 'aquaculture', tags: ['aquaculture', 'aquaponics'], uses: ['filtration', 'design'], status: 'live',
    icon: '<ellipse cx="7" cy="12" rx="3" ry="7"/><path d="M7 5h10M7 19h10"/><ellipse cx="17" cy="12" rx="3" ry="7"/>' },
  { slug: 'cost-benefit', name: 'Cost Benefit Analysis', blurb: 'Compare farm decisions: NPV, payback', cat: 'aquaponics', tags: ['aquaponics', 'aquaculture', 'hydroponics'], uses: ['money'], status: 'live',
    icon: '<path d="M12 4v16M8 20h8"/><path d="M4 8h16"/><path d="M4 8l-2 6a3 2 0 0 0 4 0zM20 8l-2 6a3 2 0 0 0 4 0z"/>' },
  { slug: 'light-fixture-layout', name: 'Light Fixture Layout', blurb: 'How many grow lights, and where', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['lighting', 'design', 'power', 'money'], status: 'soon',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h4M13 8h4M7 16h4M13 16h4"/>' },
];

// Guided walkthroughs: step-by-step designs that chain several calculators.
// status: 'live' links to guides/<slug>.html; 'soon' shows a disabled card.
window.GUIDES = [
  { slug: 'ras-design', name: 'Engineer a recirculating aquaculture system', blurb: 'From production goal to tanks, feed, oxygen, biofilter, solids, flow, pumps and backup power.', cat: 'aquaculture', tags: ['aquaculture'], uses: ['design', 'plumbing', 'filtration', 'water', 'fish', 'power'], status: 'soon',
    icon: '<circle cx="7" cy="14" r="4"/><path d="M11 14h4l2-4h4M17 10v8"/><path d="M5 6h4M7 4v4"/>' },
  { slug: 'lighting-design', name: 'Design a grow light system', blurb: 'From crop light needs to PPFD, fixture count and layout, power and running cost.', cat: 'hydroponics', tags: ['hydroponics', 'aquaponics'], uses: ['lighting', 'design', 'power', 'money'], status: 'soon',
    icon: '<path d="M4 5h16"/><path d="M7 5l-2 5h14l-2-5"/><path d="M8 14l-1 2M12 14v3M16 14l1 2"/><path d="M5 21h14"/>' }
];
