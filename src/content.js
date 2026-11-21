// src/content.js — editable website content (texts, images, FAQs, testimonials,
// insurers, SEO titles). Stored as one JSON document in the Setting table under
// the key "siteContent" and edited in Admin → Website Content.
//
// Text fields may use *asterisks* to mark the highlighted (italic) words in a
// heading, e.g. "Care that feels *personal*".
// Image fields hold a URL: either a bundled file (/assets/…) or an uploaded
// image (/api/media/<id>).

const DEFAULTS = {
  seo: {
    home:        { title: 'Radiant Health Alliance — Elevated Clinical Care', description: 'A multi-specialty medical center. Book appointments online, meet our doctors, and manage your care with Radiant Health Alliance.' },
    about:       { title: 'About Us — Radiant Health Alliance', description: 'Our mission, approach and promise: compassionate, coordinated care for every member of the family.' },
    departments: { title: 'Departments — Radiant Health Alliance', description: 'Explore our clinical departments and find the right specialist for your visit.' },
    doctors:     { title: 'Our Doctors — Radiant Health Alliance', description: 'Meet our specialist doctors. View profiles and book an appointment online in minutes.' },
    contact:     { title: 'Contact Us — Radiant Health Alliance', description: 'Call, email or message us on WhatsApp. Find our clinic and get directions.' },
    book:        { title: 'Book an Appointment — Radiant Health Alliance', description: 'Choose a department and doctor, pick a time that works, and you are booked — no account needed.' },
    blog:        { title: 'Health Insights — Radiant Health Alliance', description: 'Practical health advice and clinic news from the doctors at Radiant Health Alliance.' }
  },

  home: {
    status: 'Now accepting consultations',
    heroTitle: 'Elevated clinical care, designed for *peace of mind*',
    heroLead: 'Specialist care across our clinical departments, experienced physicians and fast online scheduling — all in one calm, modern medical center.',
    heroImage: '/assets/home/hero.jpg',
    heroImageAlt: 'A doctor listening attentively to a patient during a consultation',
    chips: ['Book online in under 2 minutes', 'Family care under one roof', 'Your records in one portal'],

    showGallery: true,
    galleryEyebrow: 'Atmosphere of healing',
    galleryTitle: 'Designed for unhurried comfort',
    gallery: [
      { image: '/assets/home/reception.jpg', caption: 'Reception', alt: 'Bright reception lobby with warm wood panels and plants' },
      { image: '/assets/home/consultation.jpg', caption: 'Consultation rooms', alt: 'Modern consultation room with a desk and examination area' },
      { image: '/assets/home/family-wing.jpg', caption: 'Family care', alt: "Family care room with a children's examination area" }
    ],

    aboutTitle: 'Compassionate care, *redefining* the medical standard',
    aboutText: 'Radiant Health Alliance brings together specialists across many disciplines so your whole family can find the right clinical guidance in one reassuring place — and get stronger together.',

    whyTitle: 'Care that feels *personal*',
    whyLead: 'Everything about your visit is designed to be simple, unhurried and centred on you.',
    why: [
      { title: 'Experienced specialists', text: 'A multi-disciplinary team of doctors working together across departments.' },
      { title: 'Family-centred care', text: 'From infants to grandparents — care for every generation in one place.' },
      { title: 'Easy online booking', text: 'See real availability and lock in your consultation in about two minutes.' },
      { title: 'Your records, connected', text: 'Your history follows you between departments, so you never have to repeat your story.' },
      { title: 'Privacy first', text: 'Your health information is kept secure and shared only with the people caring for you.' },
      { title: 'Here when you need us', text: 'Call, email or message us on WhatsApp — our front desk is happy to help.' }
    ],

    stepsTitle: 'Your visit in *four* simple steps',
    steps: [
      { title: 'Choose a department', text: 'Pick the type of care you need, or select a preferred specialist.' },
      { title: 'Pick a time', text: 'Review live slots and choose the morning, afternoon or evening that fits your life.' },
      { title: 'Get instant confirmation', text: 'Your appointment is confirmed straight away, with the details sent to you.' },
      { title: 'Visit & follow up', text: 'Meet your doctor, then track visits and history in your patient portal.' }
    ],

    vaultTitle: 'Your care, *at your fingertips*',
    vaultLead: "Create a free account to manage everything about your family's visits in one secure place.",
    vaultImage: '/assets/home/patient-portal.jpg',

    showTestimonials: false,
    insuranceTitle: 'Check your *coverage* before you visit',
    insuranceText: "Coverage depends on your plan. Send us a photo of your insurance card and our front desk will confirm what's covered before your appointment.",

    ctaTitle: 'Ready to consult with a specialist?',
    ctaText: 'Online booking takes under two minutes. No waiting on hold, no paperwork.'
  },

  // Shared by the home page and the About page.
  values: [
    { title: 'Our mission', text: 'Thoughtful, compassionate healthcare that is easy to access, transparent and simple to navigate.' },
    { title: 'Our approach', text: 'Coordinated care, so your history, tests and treatment plans travel with you between specialists.' },
    { title: 'Our promise', text: 'Every patient is welcomed with dignity, unhurried listening and clear communication.' }
  ],

  // Real, consented patient reviews only. Shown when home.showTestimonials is on.
  testimonials: [],

  // Insurers you have a contract with (one name each).
  insurers: [],

  // Shared FAQ (home page + contact page).
  faqs: [
    { q: 'How do I book an appointment?', a: 'Use our online booking: choose a department and doctor, pick an available time, and enter your details. You can also call or message us on WhatsApp.' },
    { q: 'Do I need an account to book?', a: 'No — you can book as a guest. A free account lets you see upcoming and past visits and your medical history in the patient portal.' },
    { q: 'How do I cancel or reschedule?', a: "Log in to your patient portal to cancel an upcoming appointment, or message our front desk and we'll help you reschedule." },
    { q: 'Which insurance plans do you accept?', a: "Coverage depends on your plan. Please contact us with your insurance details before your visit and we'll confirm for you." },
    { q: 'What should I bring to my first visit?', a: 'Please bring a photo ID (Emirates ID or passport), your insurance card if you have one, a list of current medications, and any recent test results or reports.' }
  ],

  about: {
    heroTitle: 'Compassionate care, *redefining* health',
    heroLead: 'Radiant Health Alliance brings together specialists across many departments so your family can find the right care in one place — and get stronger together.',
    heroImage: '/assets/home/reception.jpg',
    storyTitle: 'Our *story*',
    storyText: 'We started Radiant Health Alliance with a simple idea: getting good care should not be complicated.\n\nToday our doctors work side by side across departments, sharing your history so every visit picks up where the last one left off.',
    storyImage: '/assets/home/consultation.jpg',
    teamTitle: 'The specialists behind your *care*',
    teamLead: 'Experienced doctors and a caring front-desk team, working together for you.'
  },

  departments: {
    heroTitle: 'Every department, *one* coordinated team',
    heroLead: 'Browse our departments to find the right specialist for your visit.'
  },

  doctors: {
    heroTitle: 'Meet the team *behind* your care',
    heroLead: 'Our doctors see patients in person and by video. Filter by department or country, then book directly.'
  },

  contact: {
    heroTitle: "We'd love to *hear* from you",
    heroLead: 'Call, message us on WhatsApp, or send a note below — our front desk team will get back to you.',
    hours: ''  // free text, one line per day range, e.g. "Mon – Fri: 8:00 AM – 8:00 PM"
  },

  book: {
    heroTitle: "Let's find you a *time*",
    heroLead: "Choose a department and doctor, pick a time that works, and you're booked."
  },

  blog: {
    heroTitle: 'Health *insights*',
    heroLead: 'Practical health advice and clinic news from our doctors.'
  },

  footer: {
    tagline: 'Compassionate care, redefining health, stronger together. A multi-specialty medical center for the whole family.'
  }
};

const MAX_TEXT = 4000;
const MAX_LIST = 40;

// Merge saved content over the defaults, keeping only keys and types the
// defaults define (so old or malformed data can't break the pages).
function merge(def, saved) {
  if (Array.isArray(def)) {
    if (!Array.isArray(saved)) return def;
    const proto = def[0];
    return saved.slice(0, MAX_LIST).map(item => {
      if (proto === undefined) return typeof item === 'string' ? item.slice(0, MAX_TEXT) : (item && typeof item === 'object' ? cleanObject(item) : '');
      return merge(proto, item);
    });
  }
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], saved && typeof saved === 'object' ? saved[k] : undefined);
    return out;
  }
  if (typeof def === 'boolean') return typeof saved === 'boolean' ? saved : def;
  // Image paths are absolute so they work at any URL depth (older saves used "assets/…").
  if (typeof def === 'string') return typeof saved === 'string' ? saved.slice(0, MAX_TEXT).replace(/^assets\//, '/assets/') : def;
  return saved === undefined ? def : saved;
}

// Lists with no prototype item (testimonials, insurers) accept flat objects of strings.
function cleanObject(o) {
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, 12)) if (typeof v === 'string') out[k] = v.slice(0, MAX_TEXT);
  return out;
}

// Item shapes for lists that start empty.
const LIST_SHAPES = {
  testimonials: { quote: '', name: '', detail: '' },
  insurers: ''
};

function normalize(saved) {
  const out = merge(DEFAULTS, saved || {});
  out.testimonials = (Array.isArray(saved && saved.testimonials) ? saved.testimonials : [])
    .slice(0, MAX_LIST).map(t => merge(LIST_SHAPES.testimonials, t)).filter(t => t.quote && t.name);
  out.insurers = (Array.isArray(saved && saved.insurers) ? saved.insurers : [])
    .slice(0, MAX_LIST).map(s => String(s || '').trim().slice(0, 80)).filter(Boolean);
  out.faqs = out.faqs.filter(f => f.q && f.a);
  return out;
}

async function get(prisma) {
  const row = await prisma.setting.findUnique({ where: { key: 'siteContent' } });
  return normalize(row ? row.value : null);
}

async function save(prisma, value) {
  const clean = normalize(value);
  await prisma.setting.upsert({ where: { key: 'siteContent' }, update: { value: clean }, create: { key: 'siteContent', value: clean } });
  return clean;
}

module.exports = { DEFAULTS, normalize, get, save };
