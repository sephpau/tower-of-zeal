/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When "1", restrict sign-in to wallets in DEV_TESTERS (see auth/devBuild.ts). */
  readonly VITE_DEV_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
