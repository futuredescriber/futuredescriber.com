export {};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const schematics = Array.from(document.querySelectorAll<HTMLElement>('.schematic'));

function setRunning(schematic: HTMLElement, running: boolean): void {
  const svg = schematic.querySelector<SVGSVGElement>('svg');
  const active = running && !reducedMotion.matches;
  schematic.classList.toggle('is-visible', active);
  if (!svg) return;
  if (active) svg.unpauseAnimations();
  else {
    svg.pauseAnimations();
    if (reducedMotion.matches) svg.setCurrentTime(2.4);
  }
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => setRunning(entry.target as HTMLElement, entry.isIntersecting));
    },
    { rootMargin: '60px 0px', threshold: 0.1 },
  );
  schematics.forEach((schematic) => {
    setRunning(schematic, false);
    observer.observe(schematic);
  });
} else {
  schematics.forEach((schematic) => setRunning(schematic, true));
}

reducedMotion.addEventListener('change', () => {
  schematics.forEach((schematic) => setRunning(schematic, schematic.classList.contains('is-visible') || !reducedMotion.matches));
});
