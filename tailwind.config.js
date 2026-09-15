/** @type {import('tailwindcss').Config} */
// Loop by Zak Cricket — design tokens straight from the brand book / design handoff.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Super Kings Academy UAE — navy + yellow (powered by Loop by Zak Cricket).
        // `brand` keeps its token names so the whole app re-themes from here.
        brand: {
          red: '#14387F', // PRIMARY (navy) — actions, active nav, key accents
          deep: '#0C2657', // deep navy — gradients, depth, avatars
        },
        gold: {
          DEFAULT: '#FFC72C', // Super Kings yellow — accent / achievements
          light: '#FFE083', // top of yellow gradients
          dark: '#C9971E', // yellow-gold text on light, gradient bottoms
        },
        ink: '#141414', // text, sidebars, dark cards
        paper: '#FAF7F4', // app background / surfaces
        canvas: '#E7E4DF', // behind device frames / page gray
        cardborder: '#ECE7E1', // default 1px borders
        hairline: '#F3EEE8', // row dividers, inset fills
        success: '#1F8A4C', // present, paid, healthy
        amber: {
          DEFAULT: '#C9A84C',
          text: '#A9791B', // late, low, pending-confirm
        },
        danger: '#B3261E', // exhausted, overdue (NOTE: no "absent" state exists)
        info: '#2563EB', // policy notes, info callouts
        whatsapp: {
          DEFAULT: '#25D366',
          bubble: '#075E54',
        },
      },
      // State chip backgrounds from the handoff.
      backgroundColor: {
        'chip-green': '#E7F4EC',
        'chip-amber': '#FBF1DD',
        'chip-red': '#FBE9E8',
        'chip-blue': '#EAF1FB',
        'chip-gold': '#FFF3D1',
        'chip-comp': '#F1EAFE',
      },
      fontFamily: {
        // Display / numbers — wordmark, big stat numbers, screen titles.
        display: ['"Bebas Neue"', 'sans-serif'],
        // UI / body — all labels, buttons, body.
        sans: ['Jost', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        pill: '12px',
        chip: '8px',
      },
      boxShadow: {
        card: '0 10px 24px -20px rgba(20,20,20,0.5)',
        'card-lg': '0 20px 44px -30px rgba(20,20,20,0.5)',
        btn: '0 14px 26px -12px rgba(20,56,127,0.55)',
      },
      letterSpacing: {
        eyebrow: '0.25em',
        tag: '0.3em',
      },
      backgroundImage: {
        // 48° cricket-ball seam texture for dark hero/login surfaces.
        seam:
          'repeating-linear-gradient(48deg, transparent 0 13px, rgba(255,199,44,0.9) 14px 16px, transparent 16px 17px)',
        'brand-panel':
          'radial-gradient(125% 90% at 32% 6%, #1c3f82 0%, #112a58 52%, #0a1c3d 100%)',
      },
    },
  },
  plugins: [],
};
