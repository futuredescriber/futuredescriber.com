/*
 * The background music: twelve four-minute chunks cut from Dub Element's
 * "Deep Progressive Techno #14" mix (81 minutes), used with the artist's
 * permission (granted to Justin, October 2026) and self-hosted under
 * public/audio/mix/. Each chunk starts on a section or track change in the
 * mix, carries a short fade-in and a six-second fade-out, and is matched in
 * loudness to the others. `from` is where the chunk starts in the full mix.
 * Title, artist, thumbnail and links credit the original video.
 */
export interface MusicChunk {
  src: string;
  from: string;
}

export interface BackgroundMusic {
  title: string;
  artist: string;
  videoUrl: string;
  artistUrl: string;
  thumbnailUrl: string;
  chunks: MusicChunk[];
}

export const music: BackgroundMusic = {
  title: 'Deep Progressive Techno #14',
  artist: 'Dub Element',
  videoUrl: 'https://www.youtube.com/watch?v=YW13MaI69L0',
  artistUrl: 'https://www.youtube.com/@DubElementMusic',
  thumbnailUrl: 'https://i.ytimg.com/vi/YW13MaI69L0/mqdefault.jpg',
  chunks: [
    { src: '/audio/mix/dpt14-01.mp3', from: '1:14.60' }, // the kick arrives under the opening pads
    { src: '/audio/mix/dpt14-02.mp3', from: '6:14.21' }, // the first track at full drive
    { src: '/audio/mix/dpt14-03.mp3', from: '15:06.50' }, // the second track comes in
    { src: '/audio/mix/dpt14-04.mp3', from: '21:50.56' }, // mids open up, chords forward
    { src: '/audio/mix/dpt14-05.mp3', from: '29:55.46' }, // the groove returns after the breakdown
    { src: '/audio/mix/dpt14-06.mp3', from: '35:27.97' }, // a new bassline
    { src: '/audio/mix/dpt14-07.mp3', from: '42:22.05' }, // a darker, stripped stretch
    { src: '/audio/mix/dpt14-08.mp3', from: '49:01.57' }, // melodic mids
    { src: '/audio/mix/dpt14-09.mp3', from: '57:14.30' }, // a fresh track, lighter bass
    { src: '/audio/mix/dpt14-10.mp3', from: '63:40.48' }, // hard kick, bright hats
    { src: '/audio/mix/dpt14-11.mp3', from: '69:44.48' }, // heavy kick, dark top end
    { src: '/audio/mix/dpt14-12.mp3', from: '74:29.95' }, // the closing run
  ],
};
