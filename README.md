# TinyLink - Modern URL Shortener

TinyLink is a full-stack URL shortener built with Next.js 14, Drizzle ORM, PostgreSQL (Neon), and Tailwind CSS. It features a clean, modern dashboard for managing links and tracking click statistics.

![TinyLink Dashboard](https://via.placeholder.com/800x400?text=TinyLink+Dashboard+Preview)

## Features

- 🔗 **Create Short Links**: Instantly shorten long URLs.
- ✏️ **Custom Aliases**: Choose your own custom short codes (e.g., `tinylink/my-custom-name`).
- 📊 **Analytics**: Track total clicks and last clicked timestamps.
- 📱 **Responsive UI**: Beautiful, mobile-friendly interface built with Tailwind CSS.
- 🚀 **Fast Redirects**: Optimized server-side redirects.

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via [Neon](https://neon.tech/))
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A PostgreSQL database (we recommend [Neon](https://neon.tech/))

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/tinylink.git
   cd tinylink
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**

   Create a `.env` file in the root directory and add your database connection string:

   ```env
   DATABASE_URL="postgres://user:password@host:port/dbname?sslmode=require"
   ```

4. **Database Migration**

   Push the schema to your database:

   ```bash
   npm run push
   ```

5. **Run the Development Server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

### Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

1. Push your code to a GitHub repository.
2. Import the project into Vercel.
3. Add the `DATABASE_URL` environment variable in the Vercel project settings.
4. Deploy!

## Project Structure

```
src/
├── app/              # Next.js App Router pages and API routes
│   ├── [code]/       # Dynamic route for redirects
│   ├── api/          # API endpoints
│   └── page.tsx      # Main dashboard
├── db/               # Database configuration and schema
│   ├── index.ts      # DB connection
│   └── schema.ts     # Table definitions
└── lib/              # Utility functions
```

## License

This project is open source and available under the [MIT License](LICENSE).
