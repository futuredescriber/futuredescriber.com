export {};

const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const nav = document.querySelector<HTMLElement>('[data-site-nav]');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
const mobile = window.matchMedia('(max-width: 760px)');

function setMenu(open: boolean): void {
  if (!toggle || !nav) return;
  toggle.setAttribute('aria-expanded', String(open));
  nav.dataset.open = String(open);
}

toggle?.addEventListener('click', () => {
  setMenu(toggle.getAttribute('aria-expanded') !== 'true');
});

links.forEach((link) => link.addEventListener('click', () => setMenu(false)));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    toggle.focus();
  }
});

mobile.addEventListener('change', () => setMenu(false));

/* Mark the section whose top has passed a reading line a third of the way down the viewport. */

const sections = links
  .map((link) => ({ link, element: document.getElementById(link.hash.slice(1)) }))
  .filter((entry): entry is { link: HTMLAnchorElement; element: HTMLElement } => entry.element !== null);

let frame = 0;

function syncCurrentSection(): void {
  frame = 0;
  const line = window.innerHeight * 0.33;
  let current: HTMLElement | null = null;
  sections.forEach(({ element }) => {
    if (element.getBoundingClientRect().top <= line) current = element;
  });
  sections.forEach(({ link, element }) => {
    if (element === current) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

function scheduleSync(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(syncCurrentSection);
}

if (sections.length) {
  syncCurrentSection();
  window.addEventListener('scroll', scheduleSync, { passive: true });
  window.addEventListener('resize', scheduleSync, { passive: true });
}
