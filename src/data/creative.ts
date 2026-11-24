export interface CreativePractice {
  name: string;
  url: string;
  description: string;
  awards: string[];
  originLine: string;
  artworkUrl: string;
  artworkAlt: string;
}

export const creative: CreativePractice = {
  name: 'The Basement Paintings',
  url: 'https://www.thebasementpaintings.com',
  description:
    'Long-form instrumental music with a Saskatchewan ambient/post-rock band, since 2011. Collaboration, patience, and scale, practised for a long time.',
  awards: [
    'Saskatchewan Music Awards Metal/Loud Artist of the Year (2020)',
    'Western Canadian Music Award nominee, loud/heavy category (2020)',
    'BreakOut West official showcase (2022)',
  ],
  originLine: '“Future Describer” began as a song title on our first album before it became my online name.',
  artworkUrl: '/assets/basement-paintings-artwork-primary.jpg',
  artworkAlt: 'Dark album artwork with mirrored angular figures drawn in fine red lines',
};
