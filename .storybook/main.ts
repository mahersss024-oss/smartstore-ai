import type { StorybookConfig } from '@storybook/nextjs-vite';

process.env.CLERK_SECRET_KEY ??= ['sk', 'test', 'storybook'].join('_');
process.env.DATABASE_URL ??= 'postgresql://storybook.test/storybook';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= ['pk', 'test', 'storybook'].join('_');

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  staticDirs: [
    '../public',
  ],
  features: {
    experimentalRSC: true,
  },
  core: {
    disableTelemetry: true,
  },
};
export default config;
