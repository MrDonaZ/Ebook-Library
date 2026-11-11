import { CachedMetadata, TAbstractFile, TFile, getAllTags } from "obsidian";
import type EbookLibraryPlugin from "./main";
import { Book, CoverType, Reader, ReaderState, ReadingStatus } from "./types";
import { fromDateInputValue, generateId, toDateInputValue } from "./utils";

type Frontmatter = Record<string, unknown>;

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

/** Property keys are matched case-insensitively ("Status" == "status"). */
function findKey(fm: Frontmatter | undefined, name: string): string | undefined {
	if (!fm || !name.trim()) return undefined;
	const wanted = name.trim().toLowerCase();
	return Object.keys(fm).find((k) => k.toLowerCase() === wanted);
}

function getProp(fm: Frontmatter | undefined, name: string): unknown {
	const key = findKey(fm, name);
	return key === undefined ? undefined : fm?.[key];
}

function toText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
	if (typeof value === "object") return "";
	return String(value);
}

/** "[[Folder/Alessandro Robecchi|Robecchi]]" -> "Robecchi", "[[Alessandro Robecchi]]" -> "Alessandro Robecchi". */
function stripLinks(text: string): string {
	return text
		.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, path: string, alias?: string) =>
			alias ?? path.split("/").pop() ?? path
		)
		.trim();
}

/** Accepts "2026-08-28", "2026-08-28T10:00" and the like. */
function parseDate(value: unknown): number | null {
	const m = /^(\d{4}-\d{2}-\d{2})/.exec(toText(value).trim());
	return m ? fromDateInputValue(m[1]) : null;
}

/**
 * Keeps library entries in sync with the Markdown notes in the book folder,
 * and writes reading progress back into the notes' properties.
 *
 * Per-reader logic: the reader's date property set = they finished it. For
 * everyone else the note's Status decides: "reading" means they are reading
 * it; "completed" with no dates at all means everyone finished it.
 */
export class NoteSync {
	constructor(private plugin: EbookLibraryPlugin) {}

	private get settings() {
		return this.plugin.settings;
	}

	private get app() {
		return this.plugin.app;
	}

	get folder(): string {
		return this.settings.sourceFolder.trim().replace(/^\/+|\/+$/g, "");
	}

	isBookNote(file: TAbstractFile | null): file is TFile {
		const folder = this.folder;
		return !!folder && file instanceof TFile && file.extension === "md" && file.path.startsWith(`${folder}/`);
	}

	readerProperty(reader: Reader): string {
		return reader.property?.trim() || reader.name;
	}

	private parseStatus(value: unknown): ReadingStatus | null {
		const text = toText(value).trim().toLowerCase();
		if (!text) return null;
		const matches = (list: string) => splitList(list).some((v) => v.toLowerCase() === text);
		if (matches(this.settings.statusCompleted)) return "completed";
		if (matches(this.settings.statusReading)) return "reading";
		if (matches(this.settings.statusUnread)) return "unread";
		return null;
	}

	/** Re-reads every note in the folder. Returns true if the library changed. */
	syncAll(): boolean {
		const files = this.folder ? this.app.vault.getMarkdownFiles().filter((f) => this.isBookNote(f)) : [];
		const paths = new Set(files.map((f) => f.path));
		let changed = false;

		// Notes that left the folder (or the folder setting changed) leave the library,
		// except books first added by hand: those simply become manual entries again.
		const kept: Book[] = [];
		for (const book of this.settings.books) {
			if (book.source !== "note" || paths.has(book.filePath)) {
				kept.push(book);
			} else if (book.addedManually) {
				book.source = "manual";
				book.coverFromNote = false;
				delete book.addedManually;
				kept.push(book);
				changed = true;
			} else {
				changed = true;
			}
		}
		this.settings.books = kept;
		for (const file of files) {
			if (this.syncFile(file)) changed = true;
		}
		return changed;
	}

	/** Creates or refreshes the entry for one note. Returns true if it changed. */
	syncFile(file: TFile): boolean {
		const books = this.settings.books;
		const existing = books.find((b) => b.filePath === file.path);
		const data = this.readNote(file, existing);

		if (!existing) {
			books.push({
				id: generateId(),
				source: "note",
				filePath: file.path,
				title: file.basename,
				author: "",
				coverType: "none",
				cover: "",
				description: "",
				tags: [],
				category: "book",
				readerStates: {},
				rating: 0,
				dateAdded: file.stat.ctime,
				dateModified: Date.now(),
				lastOpened: null,
				totalPages: null,
				...data,
			});
			return true;
		}

		const before = JSON.stringify(existing);
		// A book added by hand that lives in the folder becomes a note-backed book;
		// its description, rating, category, etc. are kept.
		if (existing.source !== "note") existing.addedManually = true;
		Object.assign(existing, data, { source: "note" });
		return JSON.stringify(existing) !== before;
	}

	private readNote(file: TFile, existing: Book | undefined): Partial<Book> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Frontmatter | undefined;

		const data: Partial<Book> = {
			title: stripLinks(toText(getProp(fm, "title"))) || file.basename,
			author: stripLinks(toText(getProp(fm, this.settings.propAuthor))),
			tags: cache ? Array.from(new Set((getAllTags(cache) ?? []).map((t) => t.replace(/^#/, "")))) : [],
			readerStates: this.readStates(fm, existing),
		};

		const cover = this.resolveCover(file, cache, fm);
		if (cover) {
			data.coverType = cover.coverType;
			data.cover = cover.cover;
			data.coverFromNote = true;
		} else if (existing?.coverFromNote) {
			// The note's cover was removed.
			data.coverType = "none";
			data.cover = "";
			data.coverFromNote = false;
		}
		return data;
	}

	private readStates(fm: Frontmatter | undefined, existing: Book | undefined): Record<string, ReaderState> {
		const status = this.parseStatus(getProp(fm, this.settings.propStatus));
		const readers = this.settings.readers;
		const dates = readers.map((r) => parseDate(getProp(fm, this.readerProperty(r))));
		const anyDate = dates.some((d) => d !== null);

		const states: Record<string, ReaderState> = {};
		readers.forEach((reader, i) => {
			const date = dates[i];
			const prev = existing?.readerStates[reader.id];
			if (date !== null) {
				states[reader.id] = { status: "completed", progress: 100, finishedAt: date };
			} else if (status === "reading") {
				states[reader.id] = { status: "reading", progress: prev?.status === "reading" ? prev.progress : 0, finishedAt: null };
			} else if (status === "completed" && !anyDate) {
				states[reader.id] = { status: "completed", progress: 100, finishedAt: null };
			}
			// otherwise: unread (no entry)
		});
		return states;
	}

	private resolveCover(
		file: TFile,
		cache: CachedMetadata | null,
		fm: Frontmatter | undefined
	): { coverType: CoverType; cover: string } | null {
		for (const name of splitList(this.settings.propCover)) {
			const raw = getProp(fm, name);
			const value = toText(Array.isArray(raw) ? raw[0] : raw).trim();
			if (!value) continue;
			if (/^https?:\/\//i.test(value)) return { coverType: "url", cover: value };
			const link = (/\[\[([^\]|#]+)/.exec(value)?.[1] ?? value.replace(/^!/, "")).trim();
			const dest = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
			if (dest) return { coverType: "vault", cover: dest.path };
		}
		// No cover property: use the first image embedded in the note.
		for (const embed of cache?.embeds ?? []) {
			const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link.split("#")[0], file.path);
			if (dest && IMAGE_EXTENSIONS.includes(dest.extension.toLowerCase())) {
				return { coverType: "vault", cover: dest.path };
			}
		}
		return null;
	}

	/** Writes the readers' dates and the overall Status back into the note. */
	async writeStates(book: Book, states: Record<string, ReaderState>): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(book.filePath);
		if (!(file instanceof TFile)) return;
		const settings = this.settings;

		await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
			for (const reader of settings.readers) {
				const name = this.readerProperty(reader);
				const existingKey = findKey(fm, name);
				const state = states[reader.id];
				if (state?.status === "completed" && state.finishedAt) {
					fm[existingKey ?? name] = toDateInputValue(state.finishedAt);
				} else if (existingKey !== undefined && state?.status !== "completed") {
					// Keep the property in place, just empty it.
					fm[existingKey] = null;
				}
			}

			const statusProp = settings.propStatus.trim();
			if (!statusProp) return;
			const all = settings.readers.map((r) => states[r.id]?.status ?? "unread");
			const overall: ReadingStatus = all.includes("reading")
				? "reading"
				: all.includes("completed")
					? "completed"
					: "unread";
			const value = splitList(
				overall === "completed"
					? settings.statusCompleted
					: overall === "reading"
						? settings.statusReading
						: settings.statusUnread
			)[0];
			const statusKey = findKey(fm, statusProp);
			// Don't add a Status property just to say "unread".
			if (value && (overall !== "unread" || statusKey !== undefined)) {
				fm[statusKey ?? statusProp] = value;
			}
		});
	}
}
