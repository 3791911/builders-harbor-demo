# Builders Harbor

The private platform for builders: log in, add your team, keep every property's plans, site plans, quotes, permits and photos in one place, run a searchable sub directory, schedule subs on jobs, and rate every sub so your record grows with every job.

## Run it

Needs Node.js 22+.

    npm install
    npm start

Open http://localhost:3000

Demo login: demo@buildersharbor.com / demo1234

## What's inside

- Company accounts: the builder owns the account and adds employees with their own logins (employees can view and upload; deleting is owner-only)
- Dashboard: every property as a card with file count, open jobs and status
- Property pages: files organized by category (plans, site plans, quotes, permits, photos, inspections, budget), upload up to 50 MB, download, delete
- Sub directory: searchable and filterable by trade, with average star ratings
- Scheduling: assign any sub to any property with a date, move it through Scheduled / In progress / Done
- Ratings: 1-5 stars plus a comment on every sub, averaged on their profile
- Data isolation: each company sees only its own properties, subs, files and ratings

## Stack

Node.js + Express, SQLite (built into Node), session auth with bcrypt-hashed passwords, multer file uploads, vanilla JS single-page frontend.

## Configuration notes

- Change the session secret in server.js before real use
- Files are stored on disk in data/uploads; back that folder up along with data/app.db
- Set PORT to change the port
