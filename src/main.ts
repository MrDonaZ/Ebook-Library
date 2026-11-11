import { Notice, Plugin, TFile } from "obsidian";
import { Book, DEFAULT_SETTINGS, EbookLibrarySettings, NewBookInput } from "./types";
import { LibraryView, VIEW_TYPE_LIBRARY } from "./view/LibraryView";
import { EbookLibrarySettingTab } from "./settings/SettingsTab";
import { BookModal } from "./modals/BookModal";
import { generateId } from "./utils";

export default class EbookLibraryPlugin extends Plugin {
	settings!: EbookLibrarySettings;

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
		for (const book of this.settings.books) {
			if (!Array.isArray(book.finishedBy)) book.finishedBy = [];
			if (!book.finishedDates || typeof book.finishedDates !== "object") book.finishedDates = {};
		}
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

	/** Toggles whether a reader finished a book. Marking as finished also marks the book completed. */
	async toggleFinishedBy(book: Book, readerId: string): Promise<void> {
		const has = book.finishedBy.includes(readerId);
		const finishedBy = has ? book.finishedBy.filter((id) => id !== readerId) : [...book.finishedBy, readerId];
		const finishedDates = { ...book.finishedDates };
		if (has) delete finishedDates[readerId];
		else finishedDates[readerId] = Date.now();
		const changes: Partial<Book> = { finishedBy, finishedDates };
		if (!has && book.status !== "completed") {
			changes.status = "completed";
			changes.progress = 100;
		}
		await this.updateBook(book.id, changes);
	}

	async addReader(name: string): Promise<void> {
		this.settings.readers.push({ id: generateId(), name });
		await this.saveSettings();
		this.refreshViews();
	}

	async removeReader(id: string): Promise<void> {
		this.settings.readers = this.settings.readers.filter((r) => r.id !== id);
		for (const book of this.settings.books) {
			book.finishedBy = book.finishedBy.filter((r) => r !== id);
			delete book.finishedDates[id];
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
		await this.updateBook(book.id, {
			lastOpened: Date.now(),
			status: book.status === "unread" ? "reading" : book.status,
		});
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}
}
