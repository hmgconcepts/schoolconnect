# School Connect v9 — Deployment Guide

This guide provides clear, unambiguous steps to deploy your sophisticated school management platform.

## 🚀 Step 1: Backend Setup (Supabase)
1.  **Create a Project**: Visit [supabase.com](https://supabase.com) and create a free project.
2.  **Run SQL Schemas**: Go to the **SQL Editor** in your Supabase dashboard and run the following files from the `database/` folder in order:
    -   `schema.sql` (Main tables & RLS)
    -   `voting-schema.sql` (Elections & Polls)
    -   `cbt-schema.sql` (Examination engine)
    -   `reportcard-schema.sql` (Academic reporting)
    -   `enterprise-schema.sql` (Advanced modules)
3.  **Get API Keys**: Go to **Settings → API** and copy your **Project URL** and **Anon Public Key**.

## 🛠️ Step 2: Configuration
1.  Open `assets/js/config.js` in your code editor.
2.  Paste your **Supabase URL** and **Anon Key** into the designated variables.
3.  Customize the `SCHOOL` object with your institution's details.

## 🌐 Step 3: Frontend Deployment (GitHub Pages)
1.  **Create a Repository**: Create a new repository on [GitHub](https://github.com).
2.  **Upload Files**: Upload all files from your unzipped package (ensure `index.html` is at the root).
3.  **Enable Pages**: Go to **Settings → Pages** and set the source to the `main` branch.
4.  **SEO**: Ensure you fill the `siteUrl` in `assets/js/config.js` so search engines can index your site correctly.

## 🎓 Step 4: Admin Access
1.  Sign up on your live site's **Login** page.
2.  Your account will start as **Pending**.
3.  Go to your **Supabase Dashboard → Table Editor → profiles** table.
4.  Change your account's `role` to `admin` and `status` to `active`.
5.  Refresh your site and sign in to access the full **Admin Command Centre**.

## 🤝 Lead Generation
Every site generated includes a link to the **HMG Concepts Ecosystem**. This helps generate leads for your EdTech business while providing a free service to the community.

---
*Built with ❤️ by Adewale Samson Adeagbo · Powered by HMG Concepts*
