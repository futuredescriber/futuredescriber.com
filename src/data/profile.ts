export interface ProfileLink {
  label: string;
  href: string;
}

export interface Profile {
  name: string;
  callsign: string;
  location: string;
  headline: string;
  intro: string;
  proofLine: string;
  ownershipLine: string;
  linkedIn: string;
  x: string;
  upwork: string;
  availability: string;
  showPortrait: boolean;
  portraitUrl: string;
  portraitAlt: string;
  showResume: boolean;
  resumeUrl: string;
  links: ProfileLink[];
}

export const profile: Profile = {
  name: 'Justin Thompson',
  callsign: 'Future Describer',
  location: 'Saskatoon, Saskatchewan, Canada',
  headline: 'Operational systems for the next industrial age.',
  intro:
    'I’m Justin Thompson. I build the software that runs a physical business: production scheduling, product catalogues, inventory, and the reporting around them, with AI where it earns its place. Thirteen years inside manufacturing and ecommerce. Saskatoon, Canada.',
  proofLine: 'Built from inside the work, not from the outside looking in.',
  ownershipLine:
    'AI makes the build faster. Deciding what to build, how it fits the operation, and whether it is safe to ship stays with me.',
  linkedIn: 'https://www.linkedin.com/in/futuredescriber/',
  x: 'https://x.com/futuredescriber',
  upwork: 'https://www.upwork.com/freelancers/futuredescriber?mp_source=share',
  availability:
    'I take on a few systems, analytics, and automation projects at a time, the kind where real operations and software have to meet.',
  showPortrait: true,
  portraitUrl: '/assets/justin-thompson-profile.jpg',
  portraitAlt: 'Justin Thompson seated in a studio workspace',
  showResume: false,
  resumeUrl: '',
  links: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/futuredescriber/' },
    { label: 'X', href: 'https://x.com/futuredescriber' },
    {
      label: 'Upwork',
      href: 'https://www.upwork.com/freelancers/futuredescriber?mp_source=share',
    },
  ],
};
