# leothesen.com

## Intro

My personal website / digital garden, powered by [Notion](https://www.notion.so/) as a CMS.

Built with [Next.js](https://nextjs.org/), the [official Notion API](https://developers.notion.com/) (`@notionhq/client`), and deployed on [Vercel](https://vercel.com).

Originally based on [nextjs-notion-starter-kit](https://github.com/transitive-bullshit/nextjs-notion-starter-kit) by Travis Fischer, but has been customized significantly.

## Setup

**All site config is defined in [site.config.ts](./site.config.ts).**

This project requires Node.js >= 18.

### 1. Clone the repo

```bash
git clone https://github.com/leothesen/leothesen.com
cd leothesen.com
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Notion Integration

This site uses the **official Notion API** (not the unofficial one). You need to create a Notion integration and share your pages with it.

1. Go to [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click **"New integration"**
3. Fill in:
   - **Name**: e.g. "leothesen.com"
   - **Associated workspace**: select your Notion workspace
   - **Type**: Internal
4. Click **Submit** and copy the **Internal Integration Secret** (starts with `ntn_...`)
5. **Share your Notion pages with the integration**:
   - Open your root Notion page in the browser
   - Click **"..."** (top right) → **"Add connections"** → select your integration
   - This grants the integration access to that page and all its sub-pages/databases

### 4. Configure environment variables

Create a `.env` file (or set these in Vercel):

```bash
# Required — Notion API integration token
NOTION_TOKEN=ntn_your_token_here

# Optional (for Fathom analytics)
#NEXT_PUBLIC_FATHOM_ID=

# Optional (for PostHog analytics)
#NEXT_PUBLIC_POSTHOG_ID=

# Optional (for caching preview images in Redis)
# NOTE: also set isRedisEnabled to true in site.config.ts
#REDIS_HOST=
#REDIS_PASSWORD=
```

### 5. Configure your site

Edit [site.config.ts](./site.config.ts) to set:

- `rootNotionPageId` — the ID of your root Notion page (extract the 32-character hex string from the page URL)
- `name`, `domain`, `author` — basic site info
- `description` — Open Graph description
- Social links: `github`, `linkedin`, `newsletter`, etc.
- `isPreviewImageSupportEnabled` — LQIP preview images (enabled by default)
- `isRedisEnabled` — Redis caching for preview images (disabled by default)
- `navigationStyle` — `'default'` uses Notion nav, `'custom'` lets you define `navigationLinks`

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### 7. Deploy to Vercel

```bash
npm run deploy
```

Or connect the GitHub repo to Vercel for automatic deployments. Make sure to add `NOTION_TOKEN` as an environment variable in your Vercel project settings (Settings → Environment Variables), applied to Production, Preview, and Development.

## Project Structure

```
├── site.config.ts      # Main site configuration
├── lib/
│   ├── notion-api.ts   # Notion API client and helpers
│   ├── site-config.ts  # Site config type definitions
│   └── map-page-url.ts # URL slug generation
├── pages/              # Next.js pages
├── components/         # React components
├── styles/             # CSS styles (notion.css for Notion content styling)
└── public/             # Static assets
```

## Styles

All CSS styles that customize Notion content are in [styles/notion.css](./styles/notion.css). You can target individual Notion blocks by their unique classname:

```css
.notion-block-260baa77f1e1428b97fb14ac99c7c385 {
  display: none;
}
```

## Dark Mode

Dark mode is fully supported and can be toggled via the sun/moon icon in the footer.

## Analytics

Optional analytics can be enabled by setting environment variables:

- **Fathom**: Set `NEXT_PUBLIC_FATHOM_ID`
- **PostHog**: Set `NEXT_PUBLIC_POSTHOG_ID`
- **Vercel Analytics**: Included via `@vercel/analytics`
