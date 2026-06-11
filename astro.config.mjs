import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://kaitori.hakobu-family.com';

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  // 管理用ページ /list/ /tools/ はサイトマップから除外（検索に出さない）
  integrations: [sitemap({ filter: (page) => !page.includes('/list/') && !page.includes('/tools/') })],
});
