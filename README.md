# Ebook Library

Turn the files in your Obsidian vault into a beautiful, personal reading library.

Ebook Library gives your books, manga, magazines, articles, comics, PDFs, and documents a polished cover-based home inside Obsidian. Organize everything in one place, see what you are reading, and open any title with a click.

Instantly create an issue on GitHub if you face any difficulty, UI issues or if you want new feature. Your reviews help me the most.

![Ebook Library in Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed)

<img width="1775" height="992" alt="image" src="https://github.com/user-attachments/assets/46900659-00ca-4b97-8efe-344a16562529" />

## Why you'll love it

- **A beautiful library view** - Browse your collection in a responsive cover grid inspired by modern reading apps.
- **Keep your files where they are** - Catalog files already in your vault without moving, copying, or modifying them.
- **Know what to read next** - A dedicated Continue Reading section brings your latest reading title to the front.
- **Organize your way** - Add categories, tags, descriptions, ratings, covers, and reading statuses to every title.
- **Find anything quickly** - Search by title, author, description, or tag, then filter by category, tag, or reading status.
- **Works with any reading collection** - Catalog PDFs, EPUBs, Markdown notes, CBZ/CBR comics, Word documents, plain text files, and more.
- **Looks at home in Obsidian** - Designed to work with light mode, dark mode, and community themes.

## Features

### Your collection, beautifully presented

Add a cover from your vault or use an image URL. If a book does not have a cover, Ebook Library creates an attractive gradient placeholder with a category icon, so your library never looks unfinished.

<img width="1015" height="520" alt="image" src="https://github.com/user-attachments/assets/ff26bc09-eed7-42f8-9200-66fe41ef5904" />

Each card shows the information you care about at a glance:

- Title and author
- Category and tags
- Reading or completed status
- Recently opened information

### Simple organization

Give each title the context it deserves with:

- Categories such as Book, Manga, Magazine, Comic, Document, Article, Audiobook, and Other
- Tags with suggestions from your existing library
- Descriptions and ratings
- Unread, Reading, and Completed statuses
- Optional total page counts
- Per-reader statuses for libraries shared between several people: each reader has their own Unread / Reading / Completed status and finish date (set up the readers in the plugin settings)

<img width="722" height="930" alt="image" src="https://github.com/user-attachments/assets/271b73f3-0b1a-4be9-ae2f-1a38e341c9f3" />

### Book notes (two-way sync with note properties)

Point the plugin at a folder (Settings → Book notes → Book folder) and every Markdown note in it becomes a book:

- Title, author (links like `[[Author]]` are shown as names), tags and cover come from the note's properties. The cover is read from `cover`, `banner` or `image` (configurable), falling back to the first image in the note.
- Each reader has a date property named after them (e.g. `Fabrizio: 2026-08-28`): a date means that reader finished the book.
- The `Status` property covers everyone else: "In corso" (or "In lettura") means they are reading it; "Letto" with no dates means everyone finished it. The accepted values are configurable.
- Everything can be edited from the library (Edit details): title (renames the note), author, tags, cover, the other note properties, and each reader's status and date. Changes are written into the note, and editing the note updates the library.
- On covers, each reader who started or finished a book appears as a small avatar; tap it to change that reader's status.

Books can still be added by hand (e.g. PDFs and EPUBs) as before.

### Fast browsing

Use the library toolbar to:

- Search across your entire collection
- Filter by category or tag
- Choose whose statuses to show with the "Reading as" switch (everyone or a single reader, remembered on each device)
- Switch between All, Unread, Reading, and Completed
- Sort by title, author, date added, recently opened, reading progress, or finish date
- Choose a compact, comfortable, or spacious card size

<img width="1727" height="971" alt="image" src="https://github.com/user-attachments/assets/0d1e2a50-2f8d-4d03-b0eb-b3ecb001dc9d" />
<img width="1727" height="982" alt="image" src="https://github.com/user-attachments/assets/e4606f1c-91d2-4675-a6eb-e3e149733a04" />


### Open and manage your books

Click a cover to open the file in Obsidian. For formats Obsidian cannot display, you can open the file in your operating system's default application. The card menu also lets you edit details, update reading status, reveal files on desktop, or remove an entry without deleting the original file.

<img width="600" height="257" alt="image" src="https://github.com/user-attachments/assets/a07a6150-1104-4bfe-8dd0-4b48185ed276" />
<img width="245" height="251" alt="image" src="https://github.com/user-attachments/assets/ac13f2d5-b933-4995-a768-975387bb56c6" />


### Safe and portable

Ebook Library stores its catalog metadata in Obsidian's normal plugin data. Your book files are not changed, and cover files are referenced rather than duplicated. If you move a cataloged book or cover inside your vault, the library updates its reference automatically.

You can also export your library metadata as a JSON backup from the plugin settings.

## Installation

### From the Obsidian Community Plugins store

1. Open **Settings** in Obsidian.
2. Go to **Community plugins** and make sure community plugins are enabled.
3. Select **Browse**.
4. Search for **Ebook Library**.
5. Select **Install**, then **Enable**.

Once enabled, open the library from the library icon in the ribbon or from the command palette.

### Manual installation

1. Download the latest release files: `main.js`, `manifest.json`, and `styles.css`.
2. Create this folder in your vault:

   ```text
   <your-vault>/.obsidian/plugins/ebook-library/
   ```

3. Copy the three downloaded files into that folder.
4. In Obsidian, open **Settings → Community plugins**.
5. Choose **Reload plugins**, then enable **Ebook Library**.

## Getting started

1. Open Ebook Library from the ribbon icon or the command palette.
2. Select **+ Add Book**.
3. Choose a file from your vault.
4. Add a title, author, cover, category, tags, and reading status.
5. Select **Add to library**.

After that, click any cover to open it, or use the search and filters to explore your collection.

## Settings

Open **Settings → Ebook Library** to:

- Rename your library
- Change the card size
- Open the library automatically when Obsidian starts
- Export a JSON backup of your library
- Clear the catalog when you want to start over

<img width="1150" height="901" alt="image" src="https://github.com/user-attachments/assets/c9d63451-8137-4246-b790-0b57129de672" />

Clearing the catalog removes entries from Ebook Library only. It does not delete the underlying files from your vault.

## Privacy and data

Ebook Library is designed to work with the files already in your vault. Book metadata is saved in the plugin's local `data.json` file. The plugin does not upload your library or modify your book files.

External cover URLs are only used when you choose to add a cover from a URL.

## Building from source

This section is for contributors and developers. Regular users do not need to build the plugin.

```bash
npm install
npm run build
```

Use `npm run dev` to rebuild while developing.

## Feedback and feature requests

If you find a bug or have an idea that would make your reading library better, please open an issue in the repository:

<https://github.com/swekizer/Ebook-Library/issues>

## Roadmap

Ideas being considered for future versions include:

- Automatic reading-progress tracking for PDFs
- Drag-and-drop adding
- Collections or shelves
- Cover lookup by ISBN or title
