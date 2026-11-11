import { Notice, Plugin, TFile } from "obsidian";
import {
	Book,
	DEFAULT_READER_STATE,
	DEFAULT_SETTINGS,
	EbookLibrarySettings,
	NewBookInput,
	ReaderState,
	ReadingStatus,
} from "./types";
import { LibraryView, VIEW_TYPE_LIBRARY } from "./view/LibraryView";
import { EbookLibrarySettingTab } from "./settings/SettingsTab";
import { BookModal } from "./modals/BookModal";
import { generateId, nextReaderState, readerColor } from "./utils";

/** Stored per device (not synced), so each person's phone remembers who is using it. */
const ACTIVE_READER_KEY = "ebook-library-active-reader";

export default class EbookLibraryPlugin extends Plugin {
	settings!: EbookLibrarySettings;
	/** Reader this device is viewing as; null = everyone. */
	private activeReader: string | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, this));

		this.addRibbonIcon("library", "Open ebook library", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-library",
			name: "Open library",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "add-new-book",
			name: "Add a new book",
			callback: () => this.openAddBookModal(),
		});

		this.addSettingTab(new EbookLibrarySettingTab(this.app, this));

		// Keep book entries pointed at the right file when things move around in the vault.
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				let changed = false;
				for (const book of this.settings.books) {
					if (book.filePath === oldPath) {
						book.filePath = file.path;
						changed = true;
					}
					if (book.coverType === "vault" && book.cover === oldPath) {
						book.cover = file.path;
						changed = true;
					}
				}
				if (changed) {
					void this.saveSettings();
					this.refreshViews();
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.openOnStartup) {
				void this.activateView();
			}
		});
	}

	onunload() {
		// Nothing to tear down explicitly; Obsidian detaches leaves on its own.
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<EbookLibrarySettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		if (!Array.isArray(this.settings.books)) this.settings.books = [];
		// Clone the defaults so mutations never touch DEFAULT_SETTINGS.
		this.settings.readers = Array.isArray(data?.readers)
			? data.readers
			: DEFAULT_SETTINGS.readers.map((r) => ({ ...r }));
		if (this.settings.readers.length === 0) {
			this.settings.readers = DEFAULT_SETTINGS.readers.map((r) => ({ ...r }));
		}
		for (const book of this.settings.books) this.migrateBook(book);

		// Older builds kept these in the synced data; the view reader now lives on the device.
		const legacy = this.settings as EbookLibrarySettings & { activeReader?: string };
		const legacyActive = legacy.activeReader;
		delete legacy.activeReader;
		if ((this.settings.sortKey as string) === "finishedBy") this.settings.sortKey = "dateFinished";

		const stored = this.app.loadLocalStorage(ACTIVE_READER_KEY) as string | null;
		const candidate = stored ?? legacyActive ?? null;
		this.activeReader = this.settings.readers.some((r) => r.id === candidate) ? candidate : null;
	}

	/**
	 * Older versions stored a single status/progress per book (and, briefly,
	 * finishedBy/finishedDates). Convert those into per-reader states.
	 */
	private migrateBook(book: Book) {
		const legacy = book as Book & {
			status?: ReadingStatus;
			progress?: number;
			finishedBy?: string[];
			finishedDates?: Record<string, number>;
		};
		if (!legacy.readerStates || typeof legacy.readerStates !== "object") {
			const states: Record<string, ReaderState> = {};
			const finishedBy = Array.isArray(legacy.finishedBy) ? legacy.finishedBy : [];
			if (finishedBy.length > 0) {
				for (const id of finishedBy) {
					states[id] = { status: "completed", progress: 100, finishedAt: legacy.finishedDates?.[id] ?? null };
				}
			} else if (legacy.status && legacy.status !== "unread") {
				// We can't know who it was: apply the old status to every reader.
				for (const reader of this.settings.readers) {
					states[reader.id] = {
						status: legacy.status,
						progress: legacy.status === "completed" ? 100 : legacy.progress ?? 0,
						finishedAt: null,
					};
				}
			}
			legacy.readerStates = states;
		}
		delete legacy.status;
		delete legacy.progress;
		delete legacy.finishedBy;
		delete legacy.finishedDates;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	openAddBookModal() {
		new BookModal(this, null, async (data) => {
			await this.addBook(data);
			await this.activateView();
		}).open();
	}

	refreshViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)) {
			const view = leaf.view;
			if (view instanceof LibraryView) view.render();
		}
	}

	async addBook(partial: NewBookInput): Promise<Book> {
		const now = Date.now();
		const book: Book = {
			...partial,
			id: generateId(),
			dateAdded: now,
			dateModified: now,
		};
		this.settings.books.push(book);
		await this.saveSettings();
		this.refreshViews();
		new Notice(`Added "${book.title}" to your library`);
		return book;
	}

	async updateBook(id: string, changes: Partial<Book>): Promise<void> {
		const book = this.settings.books.find((b) => b.id === id);
		if (!book) return;
		Object.assign(book, changes, { dateModified: Date.now() });
		await this.saveSettings();
		this.refreshViews();
	}

	async removeBook(id: string): Promise<void> {
		const idx = this.settings.books.findIndex((b) => b.id === id);
		if (idx === -1) return;
		const [removed] = this.settings.books.splice(idx, 1);
		await this.saveSettings();
		this.refreshViews();
		new Notice(`Removed "${removed.title}" from your library`);
	}

	getAllTags(): string[] {
		const set = new Set<string>();
		for (const book of this.settings.books) {
			for (const tag of book.tags) set.add(tag);
		}
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}

	getReaderName(id: string): string {
		return this.settings.readers.find((r) => r.id === id)?.name ?? "";
	}

	/** The reader whose states the library shows, or null for everyone. */
	getActiveReaderId(): string | null {
		const id = this.activeReader;
		return id && this.settings.readers.some((r) => r.id === id) ? id : null;
	}

	getReaderColor(id: string): string {
		return readerColor(this.settings.readers.findIndex((r) => r.id === id));
	}

	setActiveReader(id: string | null) {
		this.activeReader = id;
		this.app.saveLocalStorage(ACTIVE_READER_KEY, id);
		this.refreshViews();
	}

	getReaderState(book: Book, readerId: string): ReaderState {
		return book.readerStates[readerId] ?? DEFAULT_READER_STATE;
	}

	/**
	 * Whether a book is in `status` for the given reader. With no reader (everyone):
	 * "unread" means nobody started it, "reading"/"completed" mean at least one reader is.
	 */
	bookHasStatus(book: Book, status: ReadingStatus, readerId: string | null): boolean {
		if (readerId) return this.getReaderState(book, readerId).status === status;
		const readers = this.settings.readers;
		if (status === "unread") return readers.every((r) => this.getReaderState(book, r.id).status === "unread");
		return readers.some((r) => this.getReaderState(book, r.id).status === status);
	}

	/** Progress for a reader, or the highest progress among readers. */
	getProgress(book: Book, readerId: string | null): number {
		if (readerId) return this.getReaderState(book, readerId).progress;
		return Math.max(0, ...this.settings.readers.map((r) => this.getReaderState(book, r.id).progress));
	}

	/** Finish date for a reader, or the most recent finish date among readers. */
	getFinishedAt(book: Book, readerId: string | null): number | null {
		const dates = (readerId ? [readerId] : this.settings.readers.map((r) => r.id))
			.map((id) => this.getReaderState(book, id))
			.filter((s) => s.status === "completed" && s.finishedAt !== null)
			.map((s) => s.finishedAt as number);
		return dates.length > 0 ? Math.max(...dates) : null;
	}

	async setReaderStatus(book: Book, readerId: string, status: ReadingStatus): Promise<void> {
		const prev = this.getReaderState(book, readerId);
		const readerStates = { ...book.readerStates, [readerId]: nextReaderState(prev, status) };
		await this.updateBook(book.id, { readerStates });
	}

	async addReader(name: string): Promise<void> {
		this.settings.readers.push({ id: generateId(), name });
		await this.saveSettings();
		this.refreshViews();
	}

	async removeReader(id: string): Promise<void> {
		if (this.settings.readers.length <= 1) {
			new Notice("The library needs at least one reader");
			return;
		}
		this.settings.readers = this.settings.readers.filter((r) => r.id !== id);
		if (this.activeReader === id) this.setActiveReader(null);
		for (const book of this.settings.books) {
			delete book.readerStates[id];
		}
		await this.saveSettings();
		this.refreshViews();
	}

	async openBook(book: Book): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(book.filePath);
		if (!(file instanceof TFile)) {
			new Notice(`Could not find "${book.filePath}" in the vault`);
			return;
		}
		// Opening a book starts it for the active reader (or the only reader, if there is just one).
		const readers = this.settings.readers;
		const readerId = this.getActiveReaderId() ?? (readers.length === 1 ? readers[0].id : null);
		const changes: Partial<Book> = { lastOpened: Date.now() };
		if (readerId && this.getReaderState(book, readerId).status === "unread") {
			changes.readerStates = {
				...book.readerStates,
				[readerId]: { status: "reading", progress: 0, finishedAt: null },
			};
		}
		await this.updateBook(book.id, changes);
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}
}
