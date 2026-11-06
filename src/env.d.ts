declare const __DEV__: boolean;
// The sync server's URL, from the SYNC_URL environment variable at build time; empty turns sync off.
declare const __SYNC_URL__: string;
declare const __PRECACHE__: string[];
declare const __VERSION__: string;
// The font files, kept in a cache of their own that lasts until they change.
declare const __FONTS__: string[];
declare const __FONTS_VERSION__: string;
// The recordings, likewise.
declare const __AUDIO__: string[];
declare const __AUDIO_VERSION__: string;
