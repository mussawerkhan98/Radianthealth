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
    home:        { title: 'Physiotherapy at Home & in Clinic — Radiant Health Alliance', description: 'Expert physiotherapy at home or in our clinic: back and neck pain, sports injuries, post-surgery and stroke rehabilitation, elderly mobility. Book a home physio visit online.' },
    about:       { title: 'About Us — Radiant Health Alliance', description: 'A physiotherapy-led medical center: home and clinic physiotherapy backed by specialist doctors, with compassionate, coordinated care for the whole family.' },
    departments: { title: 'Physiotherapy & Medical Departments — Radiant Health Alliance', description: 'Physiotherapy at home and in clinic, plus specialist medical departments working as one coordinated team.' },
    doctors:     { title: 'Physiotherapists & Doctors — Radiant Health Alliance', description: 'Meet our physiotherapists and specialist doctors. View profiles and book a home, clinic or video visit online.' },
    contact:     { title: 'Contact Us — Radiant Health Alliance', description: 'Call or WhatsApp us to book home physiotherapy or a clinic visit. Find our clinic and get directions.' },
    book:        { title: 'Book Physiotherapy at Home or in Clinic — Radiant Health Alliance', description: 'Book a home physiotherapy visit, a clinic session or a video call in under two minutes — no account needed.' },
    blog:        { title: 'Health Insights — Radiant Health Alliance', description: 'Physiotherapy tips, recovery advice and health guidance from the team at Radiant Health Alliance.' }
  },

  home: {
    status: 'Home physiotherapy visits available',
    heroTitle: 'Expert physiotherapy, *at home* or in our clinic',
    heroLead: 'Licensed physiotherapists who come to your door — or see you at our center. Recover from pain, injury and surgery with a plan built around you, backed by specialist doctors when you need them.',
    heroImage: '/assets/home/hero.jpg',
    heroImageAlt: 'A doctor listening attentively to a patient during a consultation',
    heroBtnHome: 'Book Home Physio',
    heroBtnClinic: 'Book at the Clinic',
    chips: ['Physiotherapist comes to you', 'Personal recovery plan', 'Book online in 2 minutes'],

    // "Physiotherapy at home" feature section
    physioEyebrow: 'Physiotherapy at home',
    physioTitle: 'Rehab that comes *to your door*',
    physioLead: "No traffic, no waiting rooms. Your physiotherapist treats you where you're most comfortable — ideal after surgery, for older family members, or when moving is painful.",
    physioConditions: [
      'Back & neck pain', 'Sports injuries', 'Post-surgery rehab (knee, hip, shoulder)', 'Stroke & neurological rehab',
      'Arthritis & joint pain', 'Elderly mobility & fall prevention', 'Posture & work-related pain', 'Sprains, strains & fractures'
    ],
    physioStepsTitle: 'How a home session works',
    physioSteps: [
      { title: 'Book online or on WhatsApp', text: 'Choose "Home visit", pick a time and add your address.' },
      { title: 'Assessment at home', text: 'Your physiotherapist assesses you and agrees clear goals with you.' },
      { title: 'Treatment & exercise plan', text: 'Hands-on treatment plus simple exercises to do between sessions.' }
    ],
    physioNote: "Not sure if home or clinic is right for you? Message us on WhatsApp and we'll help you choose.",

    showGallery: true,
    galleryEyebrow: 'Atmosphere of healing',
    galleryTitle: 'Designed for unhurried comfort',
    gallery: [
      { image: '/assets/home/reception.jpg', caption: 'Reception', alt: 'Bright reception lobby with warm wood panels and plants' },
      { image: '/assets/home/consultation.jpg', caption: 'Consultation rooms', alt: 'Modern consultation room with a desk and examination area' },
      { image: '/assets/home/family-wing.jpg', caption: 'Family care', alt: "Family care room with a children's examination area" }
    ],

    aboutTitle: 'Physiotherapy first, *whole-person* care',
    aboutText: 'Radiant Health Alliance is built around physiotherapy — at home and in our clinic — with specialist doctors on the same team, so your recovery, tests and follow-ups are coordinated in one reassuring place.',

    whyTitle: 'Recovery that feels *personal*',
    whyLead: 'Every session is one-to-one, unhurried and centred on getting you moving again.',
    why: [
      { title: 'Licensed physiotherapists', text: 'Experienced therapists for pain, injury, post-surgery and neurological rehabilitation.' },
      { title: 'We come to you', text: 'Home physiotherapy across the city — no travel, no waiting room, no stairs to worry about.' },
      { title: 'One-to-one sessions', text: 'Your therapist focuses only on you for the whole session, with a plan built for your goals.' },
      { title: 'Doctors on the same team', text: 'Orthopedic and specialist doctors work alongside our physiotherapists when you need them.' },
      { title: 'Progress you can see', text: 'Clear goals, simple home exercises and your history kept in one secure patient portal.' },
      { title: 'Here when you need us', text: 'Call or message us on WhatsApp — our front desk will find a home or clinic slot for you.' }
    ],

    stepsTitle: 'Start your recovery in *four* simple steps',
    steps: [
      { title: 'Choose home or clinic', text: 'Pick a home visit, a clinic session or a video consultation.' },
      { title: 'Pick a time', text: 'See live availability and choose the slot that fits your day.' },
      { title: 'Assessment & plan', text: 'Your physiotherapist assesses you and sets clear goals together with you.' },
      { title: 'Recover & follow up', text: 'Treatment plus home exercises, with every visit tracked in your patient portal.' }
    ],

    vaultTitle: 'Your care, *at your fingertips*',
    vaultLead: "Create a free account to manage everything about your family's visits in one secure place.",
    vaultImage: '/assets/home/patient-portal.jpg',

    showTestimonials: false,
    insuranceTitle: 'Check your *coverage* before you visit',
    insuranceText: "Coverage depends on your plan. Send us a photo of your insurance card and our front desk will confirm what's covered before your appointment.",

    ctaTitle: 'Ready to start your recovery?',
    ctaText: 'Book a home physiotherapy visit or a clinic session in under two minutes. No waiting on hold, no paperwork.'
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
    { q: 'Do you offer physiotherapy at home?', a: 'Yes. Choose "Home visit" when you book, pick a time and add your address — a physiotherapist comes to you. You can also book by phone or WhatsApp.' },
    { q: 'Which areas do you cover for home visits?', a: "Send us your area by WhatsApp or phone and we'll confirm straight away whether a home visit is available where you are." },
    { q: 'What happens in the first physiotherapy session?', a: 'Your physiotherapist asks about your symptoms and history, assesses how you move, explains what is going on and agrees a treatment plan with you — usually starting treatment the same day.' },
    { q: 'Do I need a doctor’s referral for physiotherapy?', a: 'You can book physiotherapy directly. Some insurance plans ask for a referral — check with us and our doctors can help if one is needed.' },
    { q: 'How do I book an appointment?', a: 'Use our online booking: choose a department and doctor, pick an available time, and enter your details. You can also call or message us on WhatsApp.' },
    { q: 'Do I need an account to book?', a: 'No — you can book as a guest. A free account lets you see upcoming and past visits and your medical history in the patient portal.' },
    { q: 'How do I cancel or reschedule?', a: "Log in to your patient portal to cancel an upcoming appointment, or message our front desk and we'll help you reschedule." },
    { q: 'Which insurance plans do you accept?', a: "Coverage depends on your plan. Please contact us with your insurance details before your visit and we'll confirm for you." },
    { q: 'What should I bring to my first visit?', a: 'Please bring a photo ID (Emirates ID or passport), your insurance card if you have one, a list of current medications, and any recent test results or reports.' }
  ],

  about: {
    heroTitle: 'Compassionate care, *redefining* health',
    heroLead: 'Radiant Health Alliance is a physiotherapy-led medical center: expert physiotherapy at home and in clinic, with specialist doctors on the same team — so your family gets the right care in one place.',
    heroImage: '/assets/home/reception.jpg',
    storyTitle: 'Our *story*',
    storyText: 'We started Radiant Health Alliance with a simple idea: getting good care should not be complicated.\n\nToday our doctors work side by side across departments, sharing your history so every visit picks up where the last one left off.',
    storyImage: '/assets/home/consultation.jpg',
    teamTitle: 'The specialists behind your *care*',
    teamLead: 'Experienced doctors and a caring front-desk team, working together for you.'
  },

  departments: {
    heroTitle: 'Physiotherapy first, *one* coordinated team',
    heroLead: 'Start with physiotherapy at home or in our clinic — and see specialist doctors from the same team whenever you need them.'
  },

  doctors: {
    heroTitle: 'Meet the team *behind* your care',
    heroLead: 'Our physiotherapists and doctors see patients at home, in our clinic and by video. Filter by department, then book directly.'
  },

  contact: {
    heroTitle: "We'd love to *hear* from you",
    heroLead: 'Call, message us on WhatsApp, or send a note below — our front desk team will get back to you.',
    hours: ''  // free text, one line per day range, e.g. "Mon – Fri: 8:00 AM – 8:00 PM"
  },

  book: {
    heroTitle: "Book physiotherapy *at home* or in clinic",
    heroLead: "Choose a home visit, clinic session or video call, pick a time that works, and you're booked."
  },

  blog: {
    heroTitle: 'Health *insights*',
    heroLead: 'Physiotherapy tips, recovery advice and clinic news from our team.'
  },

  footer: {
    tagline: 'Physiotherapy at home and in our clinic, backed by a multi-specialty medical team. Compassionate care, stronger together.'
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

// Only fields the admin actually changed are stored, so improving a default
// (e.g. new wording) reaches every site that kept the default.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
function diff(def, val) {
  if (same(def, val)) return undefined;
  if (isPlain(def) && isPlain(val)) {
    const out = {};
    for (const k of Object.keys(val)) { const d = diff(def[k], val[k]); if (d !== undefined) out[k] = d; }
    return Object.keys(out).length ? out : undefined;
  }
  return val;
}

// Earlier saves stored a full copy of the content. A saved value that still
// equals a *previous* default was never edited, so the current default wins.
const LEGACY = require('./content-legacy.json');
function dropLegacy(saved) {
  if (!isPlain(saved)) return saved;
  const copy = JSON.parse(JSON.stringify(saved));
  for (const [p, oldDefault] of Object.entries(LEGACY)) {
    const keys = p.split('.'), last = keys.pop();
    const parent = keys.reduce((o, k) => (isPlain(o) ? o[k] : undefined), copy);
    if (isPlain(parent) && last in parent && same(parent[last], oldDefault)) delete parent[last];
  }
  return copy;
}

async function get(prisma) {
  const row = await prisma.setting.findUnique({ where: { key: 'siteContent' } });
  return normalize(row ? dropLegacy(row.value) : null);
}

async function save(prisma, value) {
  const clean = normalize(value);
  const stored = diff(DEFAULTS, clean) || {};
  await prisma.setting.upsert({ where: { key: 'siteContent' }, update: { value: stored }, create: { key: 'siteContent', value: stored } });
  return clean;
}

module.exports = { DEFAULTS, normalize, get, save, diff, dropLegacy };
