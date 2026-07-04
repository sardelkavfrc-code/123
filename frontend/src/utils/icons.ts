export interface IconDef {
  viewBox?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
  strokeLinecap?: "round" | "square" | "butt" | "inherit";
  strokeLinejoin?: "round" | "bevel" | "miter" | "inherit";
  content: string;
}

export type IconName =
  | "home"
  | "library"
  | "friends"
  | "search"
  | "queue"
  | "settings"
  | "shuffle"
  | "prev"
  | "play"
  | "pause"
  | "next"
  | "repeat"
  | "volume_high"
  | "volume_mute"
  | "equalizer"
  | "uncensored"
  | "similar"
  | "queue_add"
  | "queue_list"
  | "dislike"
  | "plus"
  | "check"
  | "cross"
  | "edit"
  | "drag_handle"
  | "chevron_left"
  | "chevron_right";

export const ICONS: Record<"line" | "flat" | "rounded", Record<IconName, IconDef>> = {
  line: {
    home: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />`,
    },
    library: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />`,
    },
    friends: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
    },
    search: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />`,
    },
    queue: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M21 15V6" /><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path d="M12 12H3" /><path d="M16 6H3" /><path d="M12 18H3" />`,
    },
    settings: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />`,
    },
    shuffle: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />`,
    },
    prev: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M6 5h2v14H6zM20 5v14L8 12z" />`,
    },
    play: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M8 5v14l11-7z" />`,
    },
    pause: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />`,
    },
    next: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M16 5h2v14h-2zM4 5v14l12-7z" />`,
    },
    repeat: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />`,
    },
    volume_high: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M3 9v6h4l5 5V4L7 9zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM18.5 12c0-2.97-1.9-5.5-4.5-6.5v13c2.6-1 4.5-3.53 4.5-6.5z" />`,
    },
    volume_mute: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M16.5 12 22 6.5l-1.4-1.4L15 10.6 9.4 5 8 6.4 13.6 12 8 17.6 9.4 19 15 13.4l5.6 5.6 1.4-1.4z" />`,
    },
    equalizer: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M4 22v-8M4 10V2M12 22v-4M12 14V2M20 22v-12M20 6V2" /><line x1="2" y1="14" x2="6" y2="14" /><line x1="10" y1="18" x2="14" y2="18" /><line x1="18" y1="10" x2="22" y2="10" />`,
    },
    uncensored: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />`,
    },
    similar: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />`,
    },
    queue_add: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M3 6h18M3 12h12M3 18h8M18 14v6M15 17h6" />`,
    },
    queue_list: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />`,
    },
    dislike: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />`,
    },
    plus: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      content: `<path d="M12 5v14M5 12h14" />`,
    },
    check: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z" />`,
    },
    cross: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      content: `<path d="M6 6l12 12M18 6 6 18" />`,
    },
    edit: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />`,
    },
    drag_handle: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      content: `<circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />`,
    },
    chevron_left: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<polyline points="15 18 9 12 15 6" />`,
    },
    chevron_right: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<polyline points="9 18 15 12 9 6" />`,
    },
  },
  flat: {
    home: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />`,
    },
    library: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h6V3h-8z" />`,
    },
    friends: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />`,
    },
    search: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />`,
    },
    queue: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M4 5h10a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2zm0 6h8a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm0 6h6a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm15-10h2v10h-2V7zm.5 10a3 2 0 1 1-6 0 3 2 0 0 1 6 0z" />`,
    },
    settings: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />`,
    },
    shuffle: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.04 5.41 19.5 17.91 7l2.09 2.09V4h-5.5zm.38 9.58l-1.41 1.41 3.44 3.44L14.88 20h5.5v-5.5l-2.04 2.04-3.46-3.5z" />`,
    },
    prev: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />`,
    },
    play: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M8 5v14l11-7z" />`,
    },
    pause: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />`,
    },
    next: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M6 18l8.5-6L6 6v12zm9-12v12h2V6h-2z" />`,
    },
    repeat: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />`,
    },
    volume_high: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />`,
    },
    volume_mute: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M16.5 12 22 6.5l-1.4-1.4L15 10.6 9.4 5 8 6.4 13.6 12 8 17.6 9.4 19 15 13.4l5.6 5.6 1.4-1.4z" />`,
    },
    equalizer: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />`,
    },
    uncensored: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path fill-rule="evenodd" d="M6 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" /><path d="M19.5 4.5L9 15M9 9l10.5 10.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" />`,
    },
    similar: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M12 2l2.4 7.2 7.6 2.4-7.6 2.4-2.4 7.2-2.4-7.2-7.6-2.4 7.6-2.4z" />`,
    },
    queue_add: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M3 6h12v2H3V6zm0 5h12v2H3v-2zm0 5h8v2H3v-2zm16-4v4h-4v2h4v4h2v-4h4v-2h-4v-4h-2z" />`,
    },
    queue_list: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zm4-10h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z" />`,
    },
    dislike: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M9 18.12 10 14H4.17L2.25 11.44 4.58 3.44 6.5 2H20l2 2v8l-2 2h-2.76L15.45 15.11 12 22 9 18.12Z" />`,
    },
    plus: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />`,
    },
    check: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />`,
    },
    cross: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />`,
    },
    edit: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />`,
    },
    drag_handle: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M20 9H4v2h16V9zm0 4H4v2h16v-2z" />`,
    },
    chevron_left: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />`,
    },
    chevron_right: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />`,
    },
  },
  rounded: {
    home: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M3.75 9.75L11 3.9a1.5 1.5 0 0 1 2 0l7.25 5.85a2 2 0 0 1 .75 1.5v7.75a2.5 2.5 0 0 1-2.5 2.5h-13a2.5 2.5 0 0 1-2.5-2.5V11.25a2 2 0 0 1 .75-1.5z" /><path d="M9.5 21V12.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V21" />`,
    },
    library: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M9 17V5.5c0-.6.5-1 1-.9l10-1.6c.6-.1 1.1.4 1.1 1V14.5" /><circle cx="6" cy="17" r="3" /><circle cx="18" cy="14" r="3" />`,
    },
    friends: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
    },
    search: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<circle cx="10.5" cy="10.5" r="7.5" /><path d="m21 21-5.2-5.2" />`,
    },
    queue: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M20.5 14.5V6" /><path d="M18 17.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M13 12H3.5" /><path d="M16 6.5H3.5" /><path d="M11 17.5H3.5" />`,
    },
    settings: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />`,
    },
    shuffle: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M16 3h5v5" /><path d="M4 20c3.5-3.5 4.5-3.5 8-7s4.5-3.5 8-7" /><path d="M21 16v5h-5" /><path d="M4 4c3.5 3.5 4.5 3.5 8 7m4 4c2.5 2.5 3.5 2.5 5 4" />`,
    },
    prev: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M6 6c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1s-1-.4-1-1V7c0-.6.4-1 1-1zm11.7.4c.4-.3 1 0 1 .6v10c0 .6-.6.9-1 .6l-7-5c-.4-.3-.4-.9 0-1.2z" />`,
    },
    play: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M8.5 5.3c-.8-.5-1.8.1-1.8 1v11.4c0 .9 1 1.5 1.8 1l9.3-5.7c.7-.4.7-1.5 0-1.9z" />`,
    },
    pause: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<rect x="6" y="5" width="4" height="14" rx="2" /><rect x="14" y="5" width="4" height="14" rx="2" />`,
    },
    next: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M17 6c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1s-1-.4-1-1V7c0-.6.4-1 1-1zm-11.7.4c-.4-.3-1 0-1 .6v10c0 .6.6.9 1 .6l7-5c.4-.3.4-.9 0-1.2z" />`,
    },
    repeat: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<polyline points="16 2 20 5 16 8" /><path d="M4 11V9.5a3.5 3.5 0 0 1 3.5-3.5h12" /><polyline points="8 22 4 19 8 16" /><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5h-12" />`,
    },
    volume_high: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M4 9c-.6 0-1 .4-1 1v4c0 .6.4 1 1 1h2.3l4.2 3.8c.4.3.9.1.9-.4V5.6c0-.5-.5-.7-.9-.4L6.3 9H4zm11.2 3c0-1.2-.7-2.3-1.7-2.8v5.6c1-.5 1.7-1.6 1.7-2.8zm2.8 0c0-2.4-1.4-4.5-3.5-5.5v11c2.1-1 3.5-3.1 3.5-5.5z" />`,
    },
    volume_mute: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M4 9c-.6 0-1 .4-1 1v4c0 .6.4 1 1 1h2.3l4.2 3.8c.4.3.9.1.9-.4V5.6c0-.5-.5-.7-.9-.4L6.3 9H4zm14.1 3l2.8-2.8c.3-.3.3-.8 0-1.1s-.8-.3-1.1 0l-2.8 2.8-2.8-2.8c-.3-.3-.8-.3-.1.1 0l2.8 2.8-2.8 2.8c-.3.3-.3.8 0 1.1s.8.3 1.1 0l2.8-2.8 2.8 2.8c.3.3.8.3 1.1 0s.3-.8 0-1.1l-2.8-2.8z" />`,
    },
    equalizer: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      content: `<path d="M4 21v-7M4 9V3M12 21v-4M12 12V3M20 21v-10M20 6V3" /><circle cx="4" cy="11.5" r="2" fill="currentColor" /><circle cx="12" cy="14.5" r="2" fill="currentColor" /><circle cx="20" cy="8.5" r="2" fill="currentColor" />`,
    },
    uncensored: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M20 4L8.5 15.5M14.5 14.5L20 20M8.5 8.5L11.5 11.5" />`,
    },
    similar: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<path d="M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10z" />`,
    },
    queue_add: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      content: `<path d="M3 6.5h17.5M3 12h11M3 17.5h8M18.5 14.5v6M15.5 17.5h6" />`,
    },
    queue_list: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      content: `<path d="M8 6h12.5M8 12h12.5M8 18h12.5" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" />`,
    },
    dislike: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "butt",
      strokeLinejoin: "round",
      content: `<path d="M19 3H8a2 2 0 0 0-1.9 1.4l-2.6 7A3 3 0 0 0 6.3 15H10l-.7 3.4A2.2 2.2 0 0 0 13 20.6L16.5 15H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" /><path d="M16.5 14.5V3.5" />`,
    },
    plus: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      content: `<path d="M12 5v14M5 12h14" />`,
    },
    check: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M20 6L9 17l-5-5" />`,
    },
    cross: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      content: `<path d="M18 6L6 18M6 6l12 12" />`,
    },
    edit: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M13.5 6.5l4 4M16.24 4.24a2.12 2.12 0 0 1 3 3L7 19.5H4v-3L16.24 4.24z" />`,
    },
    drag_handle: {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      content: `<circle cx="9" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="19" r="1.5" />`,
    },
    chevron_left: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M15 18l-6-6 6-6" />`,
    },
    chevron_right: {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      content: `<path d="M9 18l6-6-6-6" />`,
    },
  },
};
