(function () {
  const core = window.TutorlyChatbot;
  if (window.TutorlyGeography) return;

  const STORAGE_KEY = "tutorly_map_provider";

  function clean(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.'"]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function mapUrl(level, layer = "political") {
    const span = level.span || 18;
    const lat = Number(level.lat || 0);
    const lon = Number(level.lon || 0);
    const bbox = [
      lon - span,
      lat - span * 0.62,
      lon + span,
      lat + span * 0.62
    ].map((value) => Number(value).toFixed(4)).join("%2C");
    const marker = `${lat.toFixed(5)}%2C${lon.toFixed(5)}`;
    const layerName = "mapnik";
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=${layerName}&marker=${marker}`;
  }

  const REGION_CENTERS = {
    world: { lat: 20, lon: 0, span: 150 },
    asia: { lat: 34, lon: 92, span: 70 },
    "south asia": { lat: 23, lon: 78, span: 28 },
    "north america": { lat: 48, lon: -100, span: 58 },
    "south america": { lat: -15, lon: -60, span: 45 },
    europe: { lat: 52, lon: 15, span: 35 },
    africa: { lat: 1, lon: 20, span: 52 },
    oceania: { lat: -25, lon: 135, span: 42 }
  };

  const INDIAN_STATE_CONTEXT = {
    "andaman and nicobar islands": { lat: 11.7401, lon: 92.6586, span: 4 },
    "andhra pradesh": { lat: 15.9129, lon: 79.74, span: 5.5 },
    "arunachal pradesh": { lat: 28.218, lon: 94.7278, span: 5.5 },
    assam: { lat: 26.2006, lon: 92.9376, span: 5 },
    bihar: { lat: 25.0961, lon: 85.3131, span: 5 },
    chandigarh: { lat: 30.7333, lon: 76.7794, span: 1 },
    chhattisgarh: { lat: 21.2787, lon: 81.8661, span: 5 },
    delhi: { lat: 28.7041, lon: 77.1025, span: 1.2 },
    goa: { lat: 15.2993, lon: 74.124, span: 1.4 },
    gujarat: { lat: 22.2587, lon: 71.1924, span: 6 },
    haryana: { lat: 29.0588, lon: 76.0856, span: 3.8 },
    "himachal pradesh": { lat: 31.1048, lon: 77.1734, span: 3.8 },
    "jammu and kashmir": { lat: 33.7782, lon: 76.5762, span: 5 },
    jharkhand: { lat: 23.6102, lon: 85.2799, span: 4 },
    karnataka: { lat: 15.3173, lon: 75.7139, span: 6 },
    kerala: { lat: 10.8505, lon: 76.2711, span: 4 },
    ladakh: { lat: 34.1526, lon: 77.5771, span: 5 },
    lakshadweep: { lat: 10.5667, lon: 72.6417, span: 3 },
    "madhya pradesh": { lat: 22.9734, lon: 78.6569, span: 7 },
    maharashtra: { lat: 19.7515, lon: 75.7139, span: 7 },
    manipur: { lat: 24.6637, lon: 93.9063, span: 2.4 },
    meghalaya: { lat: 25.467, lon: 91.3662, span: 2.4 },
    mizoram: { lat: 23.1645, lon: 92.9376, span: 2.4 },
    nagaland: { lat: 26.1584, lon: 94.5624, span: 2.4 },
    odisha: { lat: 20.9517, lon: 85.0985, span: 5 },
    puducherry: { lat: 11.9416, lon: 79.8083, span: 1.2 },
    punjab: { lat: 31.1471, lon: 75.3412, span: 3 },
    rajasthan: { lat: 27.0238, lon: 74.2179, span: 8 },
    sikkim: { lat: 27.533, lon: 88.5122, span: 1.4 },
    "tamil nadu": { lat: 11.1271, lon: 78.6569, span: 5 },
    telangana: { lat: 18.1124, lon: 79.0193, span: 3.8 },
    tripura: { lat: 23.9408, lon: 91.9882, span: 1.8 },
    "uttar pradesh": { lat: 26.8467, lon: 80.9462, span: 6.5 },
    uttarakhand: { lat: 30.0668, lon: 79.0193, span: 3.7 },
    "west bengal": { lat: 22.9868, lon: 87.855, span: 5 }
  };

  const PLACES = [
    {
      id: "india",
      aliases: ["india", "bharat", "hindustan"],
      name: "India",
      type: "country",
      lat: 20.5937,
      lon: 78.9629,
      region: "South Asia",
      continent: "Asia",
      capital: "New Delhi",
      population: "about 1.4 billion",
      hierarchy: ["India", "South Asia", "Asia", "World"],
      facts: [
        ["Capital", "New Delhi"],
        ["Continent", "Asia"],
        ["Region", "South Asia"],
        ["Neighbouring countries", "Pakistan, China, Nepal, Bhutan, Bangladesh, Myanmar"],
        ["Major cities", "Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata"]
      ],
      memoryTip: "Think of India as the central country of the Indian subcontinent.",
      levels: [
        { label: "World", focus: "India highlighted in Asia", lat: 20.5937, lon: 78.9629, span: 105 },
        { label: "Asia", focus: "South Asia highlighted", lat: 23, lon: 78, span: 34 },
        { label: "India", focus: "India political map", lat: 22, lon: 79, span: 15 }
      ]
    },
    {
      id: "united-states",
      aliases: ["usa", "us", "united states", "united states of america", "america", "u s a"],
      name: "United States",
      type: "country",
      lat: 39.8283,
      lon: -98.5795,
      region: "Northern America",
      continent: "North America",
      capital: "Washington, D.C.",
      population: "about 335 million",
      hierarchy: ["United States", "Northern America", "North America", "World"],
      facts: [
        ["Capital", "Washington, D.C."],
        ["Continent", "North America"],
        ["Region", "Northern America"],
        ["Neighbouring countries", "Canada and Mexico"],
        ["Major cities", "New York City, Los Angeles, Chicago, Houston"]
      ],
      memoryTip: "Find North America first, then look between Canada in the north and Mexico in the south.",
      levels: [
        { label: "World", focus: "USA highlighted in North America", lat: 39.8283, lon: -98.5795, span: 120 },
        { label: "North America", focus: "United States region", lat: 45, lon: -100, span: 45 },
        { label: "USA", focus: "Country center", lat: 39.8283, lon: -98.5795, span: 22 }
      ]
    },
    {
      id: "brazil",
      aliases: ["brazil", "brasil"],
      name: "Brazil",
      type: "country",
      lat: -14.235,
      lon: -51.9253,
      region: "South America",
      continent: "South America",
      capital: "Brasilia",
      population: "about 215 million",
      hierarchy: ["Brazil", "South America", "World"],
      facts: [
        ["Capital", "Brasilia"],
        ["Continent", "South America"],
        ["Region", "Eastern South America"],
        ["Neighbouring countries", "Most South American countries except Chile and Ecuador"],
        ["Major cities", "Sao Paulo, Rio de Janeiro, Brasilia, Salvador"]
      ],
      memoryTip: "Brazil occupies a large eastern part of South America.",
      levels: [
        { label: "World", focus: "Brazil highlighted in South America", lat: -14.235, lon: -51.9253, span: 105 },
        { label: "South America", focus: "Brazil within the continent", lat: -15, lon: -58, span: 34 },
        { label: "Brazil", focus: "Country center", lat: -14.235, lon: -51.9253, span: 18 }
      ]
    },
    {
      id: "hyderabad",
      aliases: ["hyderabad", "hyderabad india", "hyderabad telangana"],
      name: "Hyderabad",
      type: "city",
      lat: 17.385,
      lon: 78.4867,
      state: "Telangana",
      country: "India",
      region: "South India",
      continent: "Asia",
      hierarchy: ["Hyderabad", "Telangana", "India", "Asia", "World"],
      facts: [
        ["State", "Telangana"],
        ["Country", "India"],
        ["Region", "South India"],
        ["Known for", "Technology, culture, Charminar, and historic trade"],
        ["Nearby cities", "Secunderabad, Warangal, Vijayawada"]
      ],
      memoryTip: "Hyderabad is in Telangana; remember it as a major city of south-central India.",
      levels: [
        { label: "World", focus: "India highlighted", lat: 20.5937, lon: 78.9629, span: 105 },
        { label: "India", focus: "Telangana area", lat: 18, lon: 79, span: 13 },
        { label: "Hyderabad", focus: "City marker", lat: 17.385, lon: 78.4867, span: 1.2 }
      ]
    },
    {
      id: "telangana",
      aliases: ["telangana"],
      name: "Telangana",
      type: "state",
      lat: 18.1124,
      lon: 79.0193,
      country: "India",
      continent: "Asia",
      hierarchy: ["Telangana", "India", "Asia", "World"],
      facts: [
        ["Country", "India"],
        ["Capital", "Hyderabad"],
        ["Region", "South-central India"],
        ["Neighbouring states", "Maharashtra, Chhattisgarh, Karnataka, Andhra Pradesh"]
      ],
      memoryTip: "Telangana is the Indian state with Hyderabad as its capital.",
      levels: [
        { label: "World", focus: "India highlighted", lat: 20.5937, lon: 78.9629, span: 105 },
        { label: "India", focus: "Telangana highlighted", lat: 18.1124, lon: 79.0193, span: 13 },
        { label: "Telangana", focus: "State center", lat: 18.1124, lon: 79.0193, span: 3.5 }
      ]
    },
    {
      id: "mount-everest",
      aliases: ["mount everest", "everest", "mt everest"],
      name: "Mount Everest",
      type: "mountain",
      lat: 27.9881,
      lon: 86.925,
      range: "Himalayas",
      countries: "Nepal and China",
      elevation: "8,849 m",
      hierarchy: ["Mount Everest", "Himalayas", "Nepal/China border", "Asia", "World"],
      facts: [
        ["Mountain range", "Himalayas"],
        ["Countries involved", "Nepal and China"],
        ["Elevation", "8,849 m"],
        ["Region", "South Asia"]
      ],
      memoryTip: "Everest is in the Himalayas on the Nepal-China border.",
      levels: [
        { label: "World", focus: "Asia highlighted", lat: 28, lon: 87, span: 105 },
        { label: "Himalayas", focus: "Nepal-China border", lat: 28.3, lon: 85.8, span: 8 },
        { label: "Everest", focus: "Mountain marker", lat: 27.9881, lon: 86.925, span: 0.8 }
      ]
    },
    {
      id: "ganga-river",
      aliases: ["ganga", "ganges", "ganga river", "ganges river"],
      name: "Ganga River",
      type: "river",
      lat: 25.3,
      lon: 83.0,
      source: "Gangotri Glacier, Himalayas",
      mouth: "Bay of Bengal",
      hierarchy: ["Ganga River", "North India", "India/Bangladesh", "Asia", "World"],
      facts: [
        ["Source", "Gangotri Glacier in the Himalayas"],
        ["Countries crossed", "India and Bangladesh"],
        ["Major states/regions", "Uttarakhand, Uttar Pradesh, Bihar, West Bengal"],
        ["Mouth", "Bay of Bengal"]
      ],
      memoryTip: "The Ganga flows from the Himalayas toward the Bay of Bengal.",
      levels: [
        { label: "World", focus: "South Asia highlighted", lat: 24, lon: 84, span: 105 },
        { label: "River basin", focus: "North Indian plains", lat: 25.3, lon: 83, span: 10 },
        { label: "Path", focus: "Middle Ganga region", lat: 25.3, lon: 83, span: 4 }
      ]
    },
    {
      id: "new-delhi",
      aliases: ["new delhi", "delhi"],
      name: "New Delhi",
      type: "capital",
      lat: 28.6139,
      lon: 77.209,
      country: "India",
      continent: "Asia",
      hierarchy: ["New Delhi", "Delhi", "India", "Asia", "World"],
      facts: [
        ["Country", "India"],
        ["Role", "Capital city of India"],
        ["Region", "North India"],
        ["Nearby feature", "Yamuna River"]
      ],
      memoryTip: "New Delhi is the capital of India in the northern part of the country.",
      levels: [
        { label: "World", focus: "India highlighted", lat: 20.5937, lon: 78.9629, span: 105 },
        { label: "India", focus: "North India", lat: 25, lon: 78, span: 14 },
        { label: "New Delhi", focus: "Capital marker", lat: 28.6139, lon: 77.209, span: 1.2 }
      ]
    },
    {
      id: "sahara",
      aliases: ["sahara", "sahara desert"],
      name: "Sahara Desert",
      type: "desert",
      lat: 23.4162,
      lon: 25.6628,
      continent: "Africa",
      hierarchy: ["Sahara Desert", "North Africa", "Africa", "World"],
      facts: [
        ["Continent", "Africa"],
        ["Region", "North Africa"],
        ["Type", "Hot desert"],
        ["Countries", "Spans several countries including Egypt, Libya, Algeria, Mali, Niger, Chad, and Sudan"]
      ],
      memoryTip: "The Sahara stretches across North Africa.",
      levels: [
        { label: "World", focus: "Africa highlighted", lat: 15, lon: 20, span: 105 },
        { label: "Africa", focus: "North Africa", lat: 20, lon: 20, span: 34 },
        { label: "Sahara", focus: "Desert region", lat: 23.4162, lon: 25.6628, span: 16 }
      ]
    },
    {
      id: "indian-ocean",
      aliases: ["indian ocean"],
      name: "Indian Ocean",
      type: "ocean",
      lat: -20,
      lon: 80,
      hierarchy: ["Indian Ocean", "Between Africa, Asia, Australia, and Antarctica", "World Ocean"],
      facts: [
        ["Type", "Ocean"],
        ["Located near", "Africa, Asia, Australia, and Antarctica"],
        ["Important for", "Monsoon systems, trade routes, and coastal climates"],
        ["Connected seas", "Arabian Sea, Bay of Bengal, Andaman Sea"]
      ],
      memoryTip: "The Indian Ocean is south of India and between Africa, Asia, and Australia.",
      levels: [
        { label: "World", focus: "Indian Ocean highlighted", lat: -20, lon: 80, span: 105 },
        { label: "Ocean basin", focus: "Central Indian Ocean", lat: -20, lon: 80, span: 38 }
      ]
    }
  ];

  const EXTRA_COUNTRIES = [
    ["china", "China", 35.8617, 104.1954, "East Asia", "Asia", "Beijing"],
    ["russia", "Russia", 61.524, 105.3188, "Eastern Europe and Northern Asia", "Europe and Asia", "Moscow"],
    ["australia", "Australia", -25.2744, 133.7751, "Australia and New Zealand", "Oceania", "Canberra"],
    ["canada", "Canada", 56.1304, -106.3468, "Northern America", "North America", "Ottawa"],
    ["united kingdom", "United Kingdom", 55.3781, -3.436, "Northern Europe", "Europe", "London", ["uk", "britain", "great britain"]],
    ["france", "France", 46.2276, 2.2137, "Western Europe", "Europe", "Paris"],
    ["germany", "Germany", 51.1657, 10.4515, "Western Europe", "Europe", "Berlin"],
    ["japan", "Japan", 36.2048, 138.2529, "East Asia", "Asia", "Tokyo"],
    ["south africa", "South Africa", -30.5595, 22.9375, "Southern Africa", "Africa", "Pretoria, Cape Town, Bloemfontein"],
    ["egypt", "Egypt", 26.8206, 30.8025, "North Africa", "Africa", "Cairo"],
    ["nepal", "Nepal", 28.3949, 84.124, "South Asia", "Asia", "Kathmandu"],
    ["pakistan", "Pakistan", 30.3753, 69.3451, "South Asia", "Asia", "Islamabad"],
    ["bangladesh", "Bangladesh", 23.685, 90.3563, "South Asia", "Asia", "Dhaka"],
    ["sri lanka", "Sri Lanka", 7.8731, 80.7718, "South Asia", "Asia", "Sri Jayawardenepura Kotte"],
    ["united arab emirates", "United Arab Emirates", 23.4241, 53.8478, "Western Asia", "Asia", "Abu Dhabi", ["uae"]],
    ["mexico", "Mexico", 23.6345, -102.5528, "Central America/Northern America", "North America", "Mexico City"],
    ["argentina", "Argentina", -38.4161, -63.6167, "South America", "South America", "Buenos Aires"],
    ["indonesia", "Indonesia", -0.7893, 113.9213, "Southeast Asia", "Asia", "Jakarta"]
  ].map(([id, name, lat, lon, region, continent, capital, aliases = []]) => ({
    id,
    aliases: [id].concat(aliases),
    name,
    type: "country",
    lat,
    lon,
    region,
    continent,
    capital,
    hierarchy: [name, region, continent, "World"],
    facts: [
      ["Capital", capital],
      ["Continent", continent],
      ["Region", region]
    ],
    memoryTip: `Find ${continent} first, then locate ${name} in ${region}.`,
    levels: [
      { label: "World", focus: `${name} highlighted`, lat, lon, span: 105 },
      { label: continent, focus: region, ...(REGION_CENTERS[clean(continent)] || { lat, lon, span: 35 }) },
      { label: name, focus: "Country marker", lat, lon, span: 16 }
    ]
  }));

  const INDIAN_CITIES = [
    ["mumbai", "Mumbai", 19.076, 72.8777, "Maharashtra", ["bombay"]],
    ["pune", "Pune", 18.5204, 73.8567, "Maharashtra"],
    ["nagpur", "Nagpur", 21.1458, 79.0882, "Maharashtra"],
    ["nashik", "Nashik", 19.9975, 73.7898, "Maharashtra", ["nasik"]],
    ["thane", "Thane", 19.2183, 72.9781, "Maharashtra"],
    ["navi-mumbai", "Navi Mumbai", 19.033, 73.0297, "Maharashtra"],
    ["kolhapur", "Kolhapur", 16.705, 74.2433, "Maharashtra"],
    ["solapur", "Solapur", 17.6599, 75.9064, "Maharashtra"],
    ["aurangabad", "Aurangabad", 19.8762, 75.3433, "Maharashtra", ["chhatrapati sambhajinagar", "sambhajinagar"]],
    ["bengaluru", "Bengaluru", 12.9716, 77.5946, "Karnataka", ["bangalore"]],
    ["mysuru", "Mysuru", 12.2958, 76.6394, "Karnataka", ["mysore"]],
    ["mangaluru", "Mangaluru", 12.9141, 74.856, "Karnataka", ["mangalore"]],
    ["hubballi", "Hubballi", 15.3647, 75.124, "Karnataka", ["hubli", "hubballi dharwad", "hubli dharwad"]],
    ["belagavi", "Belagavi", 15.8497, 74.4977, "Karnataka", ["belgaum"]],
    ["chennai", "Chennai", 13.0827, 80.2707, "Tamil Nadu", ["madras"]],
    ["coimbatore", "Coimbatore", 11.0168, 76.9558, "Tamil Nadu"],
    ["madurai", "Madurai", 9.9252, 78.1198, "Tamil Nadu"],
    ["tiruchirappalli", "Tiruchirappalli", 10.7905, 78.7047, "Tamil Nadu", ["trichy"]],
    ["salem", "Salem", 11.6643, 78.146, "Tamil Nadu"],
    ["tirunelveli", "Tirunelveli", 8.7139, 77.7567, "Tamil Nadu"],
    ["vellore", "Vellore", 12.9165, 79.1325, "Tamil Nadu"],
    ["warangal", "Warangal", 17.9689, 79.5941, "Telangana"],
    ["karimnagar", "Karimnagar", 18.4386, 79.1288, "Telangana"],
    ["nizamabad", "Nizamabad", 18.6725, 78.0941, "Telangana"],
    ["khammam", "Khammam", 17.2473, 80.1514, "Telangana"],
    ["visakhapatnam", "Visakhapatnam", 17.6868, 83.2185, "Andhra Pradesh", ["vizag", "vishakhapatnam"]],
    ["vijayawada", "Vijayawada", 16.5062, 80.648, "Andhra Pradesh"],
    ["guntur", "Guntur", 16.3067, 80.4365, "Andhra Pradesh"],
    ["tirupati", "Tirupati", 13.6288, 79.4192, "Andhra Pradesh"],
    ["kurnool", "Kurnool", 15.8281, 78.0373, "Andhra Pradesh"],
    ["nellore", "Nellore", 14.4426, 79.9865, "Andhra Pradesh"],
    ["rajahmundry", "Rajahmundry", 17.0005, 81.804, "Andhra Pradesh", ["rajamahendravaram"]],
    ["kakinada", "Kakinada", 16.9891, 82.2475, "Andhra Pradesh"],
    ["bhubaneswar", "Bhubaneswar", 20.2961, 85.8245, "Odisha", ["bubenaeshwar", "bubaneshwar", "bhubaneshwar"]],
    ["cuttack", "Cuttack", 20.4625, 85.883, "Odisha"],
    ["rourkela", "Rourkela", 22.2604, 84.8536, "Odisha"],
    ["puri", "Puri", 19.8135, 85.8312, "Odisha"],
    ["sambalpur", "Sambalpur", 21.4669, 83.9812, "Odisha"],
    ["kolkata", "Kolkata", 22.5726, 88.3639, "West Bengal", ["calcutta"]],
    ["howrah", "Howrah", 22.5958, 88.2636, "West Bengal"],
    ["durgapur", "Durgapur", 23.5204, 87.3119, "West Bengal"],
    ["siliguri", "Siliguri", 26.7271, 88.3953, "West Bengal"],
    ["asansol", "Asansol", 23.6739, 86.9524, "West Bengal"],
    ["ahmedabad", "Ahmedabad", 23.0225, 72.5714, "Gujarat"],
    ["surat", "Surat", 21.1702, 72.8311, "Gujarat"],
    ["vadodara", "Vadodara", 22.3072, 73.1812, "Gujarat", ["baroda"]],
    ["rajkot", "Rajkot", 22.3039, 70.8022, "Gujarat"],
    ["gandhinagar", "Gandhinagar", 23.2156, 72.6369, "Gujarat"],
    ["jamnagar", "Jamnagar", 22.4707, 70.0577, "Gujarat"],
    ["jaipur", "Jaipur", 26.9124, 75.7873, "Rajasthan"],
    ["jodhpur", "Jodhpur", 26.2389, 73.0243, "Rajasthan"],
    ["udaipur", "Udaipur", 24.5854, 73.7125, "Rajasthan"],
    ["kota", "Kota", 25.2138, 75.8648, "Rajasthan"],
    ["ajmer", "Ajmer", 26.4499, 74.6399, "Rajasthan"],
    ["bikaner", "Bikaner", 28.0229, 73.3119, "Rajasthan"],
    ["lucknow", "Lucknow", 26.8467, 80.9462, "Uttar Pradesh"],
    ["kanpur", "Kanpur", 26.4499, 80.3319, "Uttar Pradesh"],
    ["varanasi", "Varanasi", 25.3176, 82.9739, "Uttar Pradesh", ["banaras", "kashi"]],
    ["agra", "Agra", 27.1767, 78.0081, "Uttar Pradesh"],
    ["prayagraj", "Prayagraj", 25.4358, 81.8463, "Uttar Pradesh", ["allahabad"]],
    ["noida", "Noida", 28.5355, 77.391, "Uttar Pradesh"],
    ["ghaziabad", "Ghaziabad", 28.6692, 77.4538, "Uttar Pradesh"],
    ["meerut", "Meerut", 28.9845, 77.7064, "Uttar Pradesh"],
    ["gorakhpur", "Gorakhpur", 26.7606, 83.3732, "Uttar Pradesh"],
    ["patna", "Patna", 25.5941, 85.1376, "Bihar"],
    ["gaya", "Gaya", 24.7955, 85.0002, "Bihar"],
    ["muzaffarpur", "Muzaffarpur", 26.1197, 85.391, "Bihar"],
    ["bhagalpur", "Bhagalpur", 25.2425, 86.9842, "Bihar"],
    ["ranchi", "Ranchi", 23.3441, 85.3096, "Jharkhand"],
    ["jamshedpur", "Jamshedpur", 22.8046, 86.2029, "Jharkhand"],
    ["dhanbad", "Dhanbad", 23.7957, 86.4304, "Jharkhand"],
    ["bokaro", "Bokaro", 23.6693, 86.1511, "Jharkhand"],
    ["bhopal", "Bhopal", 23.2599, 77.4126, "Madhya Pradesh"],
    ["indore", "Indore", 22.7196, 75.8577, "Madhya Pradesh"],
    ["gwalior", "Gwalior", 26.2183, 78.1828, "Madhya Pradesh"],
    ["jabalpur", "Jabalpur", 23.1815, 79.9864, "Madhya Pradesh"],
    ["ujjain", "Ujjain", 23.1765, 75.7885, "Madhya Pradesh"],
    ["raipur", "Raipur", 21.2514, 81.6296, "Chhattisgarh"],
    ["bhilai", "Bhilai", 21.1938, 81.3509, "Chhattisgarh"],
    ["bilaspur", "Bilaspur", 22.0797, 82.1391, "Chhattisgarh"],
    ["guwahati", "Guwahati", 26.1445, 91.7362, "Assam"],
    ["dibrugarh", "Dibrugarh", 27.4728, 94.912, "Assam"],
    ["silchar", "Silchar", 24.8333, 92.7789, "Assam"],
    ["shillong", "Shillong", 25.5788, 91.8933, "Meghalaya"],
    ["imphal", "Imphal", 24.817, 93.9368, "Manipur"],
    ["aizawl", "Aizawl", 23.7271, 92.7176, "Mizoram"],
    ["kohima", "Kohima", 25.6751, 94.1086, "Nagaland"],
    ["agartala", "Agartala", 23.8315, 91.2868, "Tripura"],
    ["itanagar", "Itanagar", 27.0844, 93.6053, "Arunachal Pradesh"],
    ["gangtok", "Gangtok", 27.3314, 88.6138, "Sikkim"],
    ["dehradun", "Dehradun", 30.3165, 78.0322, "Uttarakhand"],
    ["haridwar", "Haridwar", 29.9457, 78.1642, "Uttarakhand"],
    ["rishikesh", "Rishikesh", 30.0869, 78.2676, "Uttarakhand"],
    ["nainital", "Nainital", 29.3919, 79.4542, "Uttarakhand"],
    ["shimla", "Shimla", 31.1048, 77.1734, "Himachal Pradesh"],
    ["dharamshala", "Dharamshala", 32.219, 76.3234, "Himachal Pradesh"],
    ["srinagar", "Srinagar", 34.0837, 74.7973, "Jammu and Kashmir"],
    ["jammu", "Jammu", 32.7266, 74.857, "Jammu and Kashmir"],
    ["leh", "Leh", 34.1526, 77.5771, "Ladakh"],
    ["chandigarh", "Chandigarh", 30.7333, 76.7794, "Chandigarh"],
    ["amritsar", "Amritsar", 31.634, 74.8723, "Punjab"],
    ["ludhiana", "Ludhiana", 30.901, 75.8573, "Punjab"],
    ["jalandhar", "Jalandhar", 31.326, 75.5762, "Punjab"],
    ["patiala", "Patiala", 30.3398, 76.3869, "Punjab"],
    ["gurugram", "Gurugram", 28.4595, 77.0266, "Haryana", ["gurgaon"]],
    ["faridabad", "Faridabad", 28.4089, 77.3178, "Haryana"],
    ["panipat", "Panipat", 29.3909, 76.9635, "Haryana"],
    ["kochi", "Kochi", 9.9312, 76.2673, "Kerala", ["cochin"]],
    ["thiruvananthapuram", "Thiruvananthapuram", 8.5241, 76.9366, "Kerala", ["trivandrum"]],
    ["kozhikode", "Kozhikode", 11.2588, 75.7804, "Kerala", ["calicut"]],
    ["thrissur", "Thrissur", 10.5276, 76.2144, "Kerala"],
    ["kollam", "Kollam", 8.8932, 76.6141, "Kerala"],
    ["panaji", "Panaji", 15.4909, 73.8278, "Goa"],
    ["margao", "Margao", 15.2832, 73.9862, "Goa"],
    ["puducherry", "Puducherry", 11.9416, 79.8083, "Puducherry", ["pondicherry"]],
    ["port-blair", "Port Blair", 11.6234, 92.7265, "Andaman and Nicobar Islands"]
  ].map(([id, name, lat, lon, state, aliases = []]) => ({
    id: `india-city-${id}`,
    aliases: [id.replace(/-/g, " "), name].concat(aliases),
    name,
    type: "city",
    lat,
    lon,
    state,
    country: "India",
    region: `${state}, India`,
    continent: "Asia",
    hierarchy: [name, state, "India", "Asia", "World"],
    facts: [
      ["State/UT", state],
      ["Country", "India"],
      ["Region", `${state}, India`]
    ],
    memoryTip: `${name} is in ${state}, India. Zoom to the state first, then the city marker.`
  }));

  const INDIAN_STATE_ALIASES = {
    "andaman and nicobar islands": ["andaman", "nicobar", "andaman islands"],
    "andhra pradesh": ["andhra"],
    "arunachal pradesh": ["arunachal"],
    "jammu and kashmir": ["j and k", "j&k"],
    "madhya pradesh": ["madhya"],
    maharashtra: ["maharastra"],
    odisha: ["orissa"],
    puducherry: ["pondicherry"],
    "tamil nadu": ["tamilnadu"],
    telangana: ["telengana"],
    "uttar pradesh": ["uttar"],
    uttarakhand: ["uttrakhand"],
    "west bengal": ["bengal"]
  };

  function titlePlaceName(value) {
    return String(value || "").split(" ").map((part, index) => {
      if (index > 0 && ["and", "of"].includes(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" ");
  }

  const INDIAN_STATES = Object.entries(INDIAN_STATE_CONTEXT).map(([key, center]) => {
    const name = titlePlaceName(key);
    const aliases = [key, name].concat(INDIAN_STATE_ALIASES[key] || []);
    return {
      id: `india-state-${key.replace(/\s+/g, "-")}`,
      aliases,
      name,
      type: "state",
      lat: center.lat,
      lon: center.lon,
      country: "India",
      region: "India",
      continent: "Asia",
      hierarchy: [name, "India", "Asia", "World"],
      facts: [
        ["Country", "India"],
        ["Type", "State/Union Territory"],
        ["Region", "India"]
      ],
      memoryTip: `${name} is in India. Start with the India map, then zoom into ${name}.`
    };
  });

  const CATALOG = PLACES.concat(INDIAN_STATES, INDIAN_CITIES, EXTRA_COUNTRIES);
  const GEO_QUESTION_TERMS = [
    "where", "located", "location", "continent", "country", "capital", "state", "province", "city",
    "river", "mountain", "desert", "ocean", "sea", "lake", "map", "border", "near", "neighbour", "neighbor"
  ];

  function isGeographyQuestion(text) {
    const value = clean(text);
    return GEO_QUESTION_TERMS.some((term) => value.includes(term));
  }

  function findPlace(text) {
    const value = ` ${clean(text)} `;
    const matches = [];
    CATALOG.forEach((place) => {
      place.aliases.forEach((alias) => {
        const key = clean(alias);
        if (key && value.includes(` ${key} `)) {
          matches.push({ place, score: key.length + (place.type === "country" ? 2 : 5) });
        }
      });
    });
    matches.sort((a, b) => b.score - a.score);
    return matches[0]?.place || null;
  }

  function quickAnswer(place, model) {
    if (place.type === "city") return `${place.name} is located in ${place.state || place.region}, ${place.country}.`;
    if (place.type === "state") return `${place.name} is located in ${place.country}.`;
    if (place.type === "country") return `${place.name} is located in ${place.region || place.continent}.`;
    if (place.type === "river") return `${place.name} flows through ${place.facts.find((fact) => fact[0] === "Countries crossed")?.[1] || "its river basin"}.`;
    if (place.type === "mountain") return `${place.name} is in the ${place.range}, around ${place.countries}.`;
    if (place.type === "desert") return `${place.name} is located in ${place.region || place.continent}.`;
    if (place.type === "ocean") return `${place.name} lies near ${place.facts.find((fact) => fact[0] === "Located near")?.[1] || "major continents"}.`;
    return `${place.name} is a ${place.type} in ${place.region || place.continent || "the world"}.`;
  }

  function dedupeLevels(levels) {
    const seen = new Set();
    return levels.filter((level) => {
      if (!level) return false;
      const key = clean(`${level.label} ${level.focus} ${level.lat} ${level.lon} ${level.span}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findCountryPlace(place) {
    const countryName = clean(place.country || (place.type === "country" ? place.name : ""));
    if (!countryName) return null;
    return CATALOG.find((item) => item.type === "country" && clean(item.name) === countryName) || null;
  }

  function findWorldLevel(levels, place) {
    return levels.find((level) => clean(level.label).includes("world")) || {
      label: "World",
      focus: `${place.name} in the world`,
      lat: place.lat,
      lon: place.lon,
      span: 105
    };
  }

  function findContinentLevel(levels, place) {
    const continent = clean(place.continent);
    return levels.find((level) => continent && clean(level.label).includes(continent)) ||
      (continent && REGION_CENTERS[continent] ? {
        label: place.continent,
        focus: `${place.name} region`,
        ...REGION_CENTERS[continent]
      } : null);
  }

  function findCountryLevel(place) {
    const country = findCountryPlace(place);
    const countryName = place.country || place.name;
    const countryLevel = country?.levels?.find((level) => {
      const label = clean(level.label);
      return label === clean(country.name) || label.includes(clean(country.name));
    });
    if (countryLevel) {
      return {
        ...countryLevel,
        focus: place.type === "country" ? countryLevel.focus : `${place.name} within ${country.name}`
      };
    }
    return {
      label: countryName || "Country",
      focus: place.type === "country" ? "Country map" : `${place.name} within ${countryName}`,
      lat: country?.lat || place.lat,
      lon: country?.lon || place.lon,
      span: country?.type === "country" ? 16 : 14
    };
  }

  function localContextLevel(place) {
    if (place.type === "city" || place.type === "capital") {
      const label = place.state || place.region || "Local area";
      const stateContext = INDIAN_STATE_CONTEXT[clean(label)];
      return {
        label,
        focus: `${place.name} in ${label}`,
        lat: stateContext?.lat || place.lat,
        lon: stateContext?.lon || place.lon,
        span: stateContext?.span || (place.state ? 3.8 : 2.8)
      };
    }
    if (place.type === "state" || place.type === "province") {
      const stateContext = INDIAN_STATE_CONTEXT[clean(place.name)];
      return {
        label: place.name,
        focus: `${place.name} close-up`,
        lat: stateContext?.lat || place.lat,
        lon: stateContext?.lon || place.lon,
        span: stateContext?.span || 3.8
      };
    }
    return {
      label: place.name,
      focus: `${place.name} close-up`,
      lat: place.lat,
      lon: place.lon,
      span: place.type === "river" ? 5.5 : place.type === "mountain" ? 1.2 : place.type === "ocean" ? 45 : 8
    };
  }

  function buildLearningLevels(place) {
    const originalLevels = Array.isArray(place.levels) ? place.levels : [];
    const world = findWorldLevel(originalLevels, place);
    const continent = findContinentLevel(originalLevels, place);
    const country = findCountryLevel(place);
    const local = localContextLevel(place);
    const nonWorldLevels = originalLevels.filter((level) => !clean(level.label).includes("world"));

    if (place.type === "country") {
      return dedupeLevels([world, continent, country, ...originalLevels]);
    }

    if (place.type === "state" || place.type === "province") {
      return dedupeLevels([country, local, continent, world, ...originalLevels]);
    }

    if (place.type === "city" || place.type === "capital") {
      const cityCloseUp = {
        label: place.name,
        focus: `${place.name} city marker`,
        lat: place.lat,
        lon: place.lon,
        span: 1.1
      };
      return dedupeLevels([local, cityCloseUp, country, continent, world, ...originalLevels]);
    }

    return dedupeLevels([local, ...nonWorldLevels, country, continent, world]);
  }

  function analyze(question, options = {}) {
    const place = findPlace(question);
    if (!place || (!isGeographyQuestion(question) && place.type === "country" && clean(question).split(" ").length < 2)) return null;
    const mode = options.model || "prime";
    return {
      id: `geo_${place.id}`,
      mode,
      place,
      provider: getProviderName(),
      quickAnswer: quickAnswer(place, mode),
      hierarchy: place.hierarchy || [place.name, place.region || place.continent || "World"],
      facts: place.facts || [],
      levels: buildLearningLevels(place),
      memoryTip: place.memoryTip || "Locate the largest region first, then zoom into the smaller place.",
      spark: mode === "spark"
    };
  }

  function getProviderName() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return MapProviders.has(stored) ? stored : "openstreetmap";
    } catch (error) {
      return "openstreetmap";
    }
  }

  const MapProviders = new Map();

  function registerProvider(name, provider) {
    if (!name || !provider || typeof provider.render !== "function") return;
    MapProviders.set(name, provider);
  }

  registerProvider("openstreetmap", {
    name: "OpenStreetMap",
    render(level, state = {}) {
      return `
        <iframe
          title="${escapeHtml(level.focus || level.label)}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          src="${mapUrl(level, state.layer || "political")}">
        </iframe>
      `;
    }
  });

  registerProvider("educationalSvg", {
    name: "Educational SVG",
    render(level) {
      const x = Math.max(8, Math.min(92, 50 + Number(level.lon || 0) / 2.2));
      const y = Math.max(10, Math.min(88, 50 - Number(level.lat || 0) / 1.55));
      return `
        <svg class="geo-svg-map" viewBox="0 0 100 62" role="img" aria-label="${escapeHtml(level.focus || level.label)}">
          <defs>
            <radialGradient id="geoGlow" cx="50%" cy="45%" r="65%">
              <stop offset="0" stop-color="#dff7ff" />
              <stop offset="1" stop-color="#e9e4ff" />
            </radialGradient>
          </defs>
          <rect width="100" height="62" rx="8" fill="url(#geoGlow)" />
          <path d="M8 22 C20 10 34 13 45 20 C56 27 70 18 90 23" fill="none" stroke="#9db7ff" stroke-width="1.4" opacity=".75" />
          <path d="M10 44 C28 37 40 46 55 39 C67 34 78 39 92 34" fill="none" stroke="#b9a7ff" stroke-width="1.2" opacity=".7" />
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#5f6bff" />
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="none" stroke="#31c8ff" stroke-width="1.5" opacity=".7" />
          <text x="50" y="57" text-anchor="middle" fill="#22386f" font-size="4" font-weight="700">${escapeHtml(level.label)}</text>
        </svg>
      `;
    }
  });

  function renderLevelButtons(levels) {
    return levels.map((level, index) => `
      <button class="geo-level-btn ${index === 0 ? "active" : ""}" type="button" data-geo-level="${index}">
        ${escapeHtml(level.label)}
      </button>
    `).join("");
  }

  function renderHierarchy(items) {
    return items.map((item, index) => `
      <span>${escapeHtml(item)}</span>${index < items.length - 1 ? "<b>&darr;</b>" : ""}
    `).join("");
  }

  function renderFacts(facts, compact) {
    return facts.slice(0, compact ? 3 : 7).map(([label, value]) => `
      <li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>
    `).join("");
  }

  function renderMap(context, activeIndex = 0, state = {}) {
    const provider = MapProviders.get(context.provider) || MapProviders.get("educationalSvg");
    const level = context.levels[activeIndex] || context.levels[0];
    return provider.render(level, state);
  }

  function renderPanel(context) {
    const compact = context.spark;
    const firstMap = renderMap(context, 0, { layer: "political" });
    return `
      <section class="geo-visual-panel" data-geo-context="${escapeHtml(JSON.stringify(context))}" data-geo-level="0" data-geo-layer="political">
        <header class="geo-panel-head">
          <span class="geo-kicker">Visual geography</span>
          <h2>${compact ? "Quick Geography Answer" : escapeHtml(context.place.name)}</h2>
          <p>${escapeHtml(context.quickAnswer)}</p>
        </header>
        <div class="geo-hierarchy" aria-label="Geographic hierarchy">
          ${renderHierarchy(context.hierarchy)}
        </div>
        <div class="geo-map-shell">
          <div class="geo-map-stage" data-geo-map-stage>${firstMap}</div>
          <div class="geo-map-caption" data-geo-caption>${escapeHtml(context.levels[0]?.focus || "Location map")}</div>
        </div>
      </section>
    `;
  }

  function hydrate(panel) {
    if (!panel || panel.dataset.geoHydrated === "true") return;
    panel.dataset.geoHydrated = "true";
    const context = JSON.parse(panel.dataset.geoContext || "{}");
    const stage = panel.querySelector("[data-geo-map-stage]");
    const caption = panel.querySelector("[data-geo-caption]");

    function renderActive() {
      const activeIndex = Number(panel.dataset.geoLevel || 0);
      const layer = panel.dataset.geoLayer || "political";
      const provider = MapProviders.get(context.provider) || MapProviders.get("educationalSvg");
      if (stage && provider) {
        stage.innerHTML = provider.render(context.levels[activeIndex] || context.levels[0], { layer });
      }
      if (caption) {
        const level = context.levels[activeIndex] || context.levels[0];
        const notes = [];
        if (panel.classList.contains("show-borders")) notes.push("borders highlighted");
        if (panel.classList.contains("show-capitals")) notes.push("capitals highlighted");
        caption.textContent = `${level.focus || level.label}${notes.length ? ` (${notes.join(", ")})` : ""}`;
      }
    }

    panel.querySelectorAll("[data-geo-level]").forEach((button) => {
      button.addEventListener("click", () => {
        panel.dataset.geoLevel = button.dataset.geoLevel || "0";
        panel.querySelectorAll("[data-geo-level]").forEach((item) => item.classList.toggle("active", item === button));
        renderActive();
      });
    });

    panel.querySelectorAll("[data-geo-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const toggle = button.dataset.geoToggle;
        if (toggle === "political" || toggle === "physical") {
          panel.dataset.geoLayer = toggle;
          panel.querySelectorAll("[data-geo-toggle='political'], [data-geo-toggle='physical']").forEach((item) => {
            item.classList.toggle("active", item === button);
          });
        }
        if (toggle === "borders") {
          button.classList.toggle("active");
          panel.classList.toggle("show-borders", button.classList.contains("active"));
        }
        if (toggle === "capitals") {
          button.classList.toggle("active");
          panel.classList.toggle("show-capitals", button.classList.contains("active"));
        }
        renderActive();
      });
    });
  }

  function setProvider(name) {
    if (!MapProviders.has(name)) return false;
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch (error) {
      return false;
    }
    return true;
  }

  window.TutorlyGeography = {
    analyze,
    renderPanel,
    hydrate,
    registerProvider,
    setProvider,
    providers: () => Array.from(MapProviders.keys())
  };
})();
