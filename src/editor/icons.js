const NS = "http://www.w3.org/2000/svg";

// 24×24 stroke icons. Names match the editor button ids.
export const ICON_MARKUP = {
  download: `
    <path d="M12 3.5v10"/>
    <path d="m7.75 9.75 4.25 4.25 4.25-4.25"/>
    <path d="M4.75 16.75V19a1.75 1.75 0 0 0 1.75 1.75h11A1.75 1.75 0 0 0 19.25 19v-2.25"/>
  `,
  copy: `
    <rect x="8.25" y="8.25" width="11.5" height="11.5" rx="2"/>
    <path d="M15.75 8.25V6.25a2 2 0 0 0-2-2H6.25a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2"/>
  `,
  print: `
    <path d="M6.5 8.5V4h11v4.5"/>
    <path d="M6.5 17H5a2 2 0 0 1-2-2v-4.5A2 2 0 0 1 5 8.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-1.5"/>
    <path d="M7.5 14h9v6h-9z"/>
  `,
  undo: `
    <path d="M9 14 4 9l5-5"/>
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12"/>
  `,
  redo: `
    <path d="m15 14 5-5-5-5"/>
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H12"/>
  `,
  resize: `
    <path d="M15 4h5v5"/>
    <path d="M9 20H4v-5"/>
    <path d="m20 4-7 7"/>
    <path d="m4 20 7-7"/>
  `,
  crop: `
    <path d="M6.5 3.5V16a2 2 0 0 0 2 2h12"/>
    <path d="M17.5 20.5V8a2 2 0 0 0-2-2H3.5"/>
  `,
  move: `
    <path d="M12 4.5v15"/>
    <path d="M4.5 12h15"/>
    <path d="m9 7.5 3-3 3 3"/>
    <path d="m9 16.5 3 3 3-3"/>
    <path d="m7.5 9-3 3 3 3"/>
    <path d="m16.5 9 3 3-3 3"/>
  `,
  pen: `
    <path d="M13 20.5h8"/>
    <path d="m16.4 3.8 3.8 3.8L8.2 19.6 4 20.5l.9-4.2Z"/>
  `,
  highlight: `
    <rect x="3" y="9.2" width="18" height="5.6" rx="1.4" fill="currentColor" stroke="none" opacity="0.45"/>
    <path d="M4 6h16"/>
    <path d="M4 12h16"/>
    <path d="M4 18h11"/>
  `,
  rect: `
    <rect x="4.5" y="6.5" width="15" height="11" rx="1.5"/>
  `,
  ellipse: `
    <ellipse cx="12" cy="12" rx="7.5" ry="5.5"/>
  `,
  arrow: `
    <path d="M5 19 19 5"/>
    <path d="M9.5 5H19v9.5"/>
  `,
  text: `
    <path d="M5 5.5h14"/>
    <path d="M12 5.5V19"/>
  `,
  step: `
    <circle cx="12" cy="12" r="7.25"/>
    <text x="12" y="12.5" fill="currentColor" stroke="none" font-size="11" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">1</text>
  `,
  erase: `
    <path d="M13.2 5.2 19 11l-7.2 7.2H7.2L4 15.2Z"/>
    <path d="M8.4 9.4 11.6 12.6"/>
    <path d="M3.2 20.6h12"/>
  `,
  blur: `
    <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="4.8" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="19.2" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="4.8" cy="12" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="19.2" cy="12" r="1.35" fill="currentColor" stroke="none"/>
    <circle cx="6.9" cy="6.9" r="1.15" fill="currentColor" stroke="none" opacity="0.45"/>
    <circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none" opacity="0.45"/>
    <circle cx="6.9" cy="17.1" r="1.15" fill="currentColor" stroke="none" opacity="0.45"/>
    <circle cx="17.1" cy="17.1" r="1.15" fill="currentColor" stroke="none" opacity="0.45"/>
  `,
};

export function iconElement(name) {
  const markup = ICON_MARKUP[name];
  if (!markup) throw new Error(`Unknown icon: ${name}`);
  const template = document.createElement("template");
  template.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
  return template.content.firstElementChild;
}
