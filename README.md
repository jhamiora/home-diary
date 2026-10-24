# Home Diary

A small phone app for jobs around the house, modelled on the Titus PM site diary.

- **Today**: pick the day's jobs, work through them in priority order, and get one combined materials list (only what you don't already have). Send the list by text or email.
- **Jobs**: High, Medium, Low. Each job has a place (Kitchen, Deck), notes, photos, materials and its own diary notes.
- **Diary**: notes with photos, optionally linked to a job.
- **Photo markup**: draw, arrows, boxes and labels. The original photo is kept, so markup can be redone.
- **More**: backup to one file (photos included) and restore on any phone.

## No server, no database

Everything is stored on the phone in the browser's own storage (IndexedDB). Each person who opens the app gets their own private copy. Backups are the only way data leaves the phone.

## Run it

    npm install
    npm run dev      # local, open the network URL on your phone
    npm run check    # type check and build
    npm run build    # static site in dist/, host anywhere (HTTPS needed for install)
