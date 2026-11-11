import { ItemView, Menu, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type EbookLibraryPlugin from "../main";
import {
	Book,
	CardSize,
	CATEGORY_META,
	CATEGORY_ORDER,
	CategoryFilter,
	ReadingStatus,
	SortKey,
	STATUS_META,
	StatusFilter,
} from "../types";
import { BookModal } from "../modals/BookModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import { debounce, formatDate, formatRelativeDate, placeholderGradient } from "../utils";

export const VIEW_TYPE_LIBRARY = "ebook-library-view";

const SORT_OPTIONS: [SortKey, string][] = [
	["dateAdded", "Date added"],
	["title", "Title"],
	["author", "Author"],
	["lastOpened", "Recently opened"],
	["progress", "Progress"],
	["finishedBy", "Finished by"],
	["dateFinished", "Date finished"],
];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "unread", label: "Unread" },
	{ value: "reading", label: "Reading" },
	{ value: "completed", label: "Completed" },
];

const CARD_SIZES: { value: CardSize; label: string; aria: string }[] = [
	{ value: "small", label: "S", aria: "Small cards" },
	{ value: "medium", label: "M", aria: "Medium cards" },
	{ value: "large", label: "L", aria: "Large cards" },
];

export class LibraryView extends ItemView {
	private plugin: EbookLibraryPlugin;

	private searchQuery = "";
	private statusFilter: StatusFilter = "all";
	private categoryFilter: CategoryFilter = "all";
	private tagFilter = "all";

	private headerTitleEl!: HTMLElement;
	private statsEl!: HTMLElement;
	private searchInputEl!: HTMLInputElement;
	private categorySelectEl!: HTMLSelectElement;
	private tagSelectEl!: HTMLSelectElement;
	private readerSelectEl!: HTMLSelectElement;
	private sortSelectEl!: HTMLSelectElement;
	private sortDirBtn!: HTMLElement;
	private densityGroupEl!: HTMLElement;
	private tabsEl!: HTMLElement;
	private continueSectionEl!: HTMLElement;
	private allBooksHeaderEl!: HTMLElement;
	private resultsCountEl!: HTMLElement;
	private gridEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: EbookLibraryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_LIBRARY;
	}

	getDisplayText(): string {
		return this.plugin?.settings?.libraryTitle || "Library";
	}

	getIcon(): string {
		return "library";
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("ebook-library-view");
		this.buildLayout();
		this.render();
	}

	async onClose() {
		this.contentEl.empty();
	}

	// ---------- Static layout (built once) ----------

	private buildLayout() {
		const root = this.contentEl;

		// Header top row
		const header = root.createDiv({ cls: "el-header" });
		const headerTop = header.createDiv({ cls: "el-header-top" });

		const titleGroup = headerTop.createDiv({ cls: "el-header-title-group" });
		this.headerTitleEl = titleGroup.createEl("h1", {
			cls: "el-title",
			text: this.plugin.settings.libraryTitle,
		});
		this.statsEl = titleGroup.createDiv({ cls: "el-stats" });

		const addBtn = headerTop.createEl("button", { cls: "el-add-btn" });
		setIcon(addBtn.createSpan({ cls: "el-add-btn-icon" }), "plus");
		addBtn.createSpan({ text: "Add Book" });
		addBtn.addEventListener("click", () => this.openAddModal());

		// Toolbar
		const toolbar = root.createDiv({ cls: "el-toolbar" });

		const searchWrap = toolbar.createDiv({ cls: "el-search" });
		setIcon(searchWrap.createSpan({ cls: "el-search-icon" }), "search");
		this.searchInputEl = searchWrap.createEl("input", {
			type: "text",
			placeholder: "Search books...",
			cls: "el-search-input",
		});
		this.searchInputEl.addEventListener(
			"input",
			debounce(() => {
				this.searchQuery = this.searchInputEl.value.trim().toLowerCase();
				this.render();
			}, 150)
		);

		const filters = toolbar.createDiv({ cls: "el-filters" });

		this.categorySelectEl = filters.createEl("select", { cls: "el-select" });
		this.categorySelectEl.createEl("option", { value: "all", text: "All categories" });
		for (const cat of CATEGORY_ORDER) {
			this.categorySelectEl.createEl("option", { value: cat, text: CATEGORY_META[cat].label });
		}
		this.categorySelectEl.addEventListener("change", () => {
			this.categoryFilter = this.categorySelectEl.value as CategoryFilter;
			this.render();
		});

		this.tagSelectEl = filters.createEl("select", { cls: "el-select" });
		this.tagSelectEl.addEventListener("change", () => {
			this.tagFilter = this.tagSelectEl.value;
			this.render();
		});

		this.readerSelectEl = filters.createEl("select", {
			cls: "el-select el-reader-select",
			attr: { "aria-label": "Show reading status of", title: "Show reading status of" },
		});
		this.readerSelectEl.addEventListener("change", () => {
			this.plugin.settings.activeReader = this.readerSelectEl.value;
			void this.plugin.saveSettings();
			this.render();
		});

		this.sortSelectEl = filters.createEl("select", { cls: "el-select" });
		for (const [key, label] of SORT_OPTIONS) {
			this.sortSelectEl.createEl("option", { value: key, text: label });
		}
		this.sortSelectEl.value = this.plugin.settings.sortKey;
		this.sortSelectEl.addEventListener("change", () => {
			this.plugin.settings.sortKey = this.sortSelectEl.value as SortKey;
			void this.plugin.saveSettings();
			this.render();
		});

		this.sortDirBtn = filters.createEl("button", {
			cls: "el-sort-dir-btn",
			attr: { "aria-label": "Toggle sort direction" },
		});
		setIcon(this.sortDirBtn, "arrow-up-down");
		this.sortDirBtn.addEventListener("click", () => {
			this.plugin.settings.sortDirection = this.plugin.settings.sortDirection === "asc" ? "desc" : "asc";
			void this.plugin.saveSettings();
			this.render();
		});

		this.densityGroupEl = filters.createDiv({
			cls: "el-density-toggle",
			attr: { role: "group", "aria-label": "Card size" },
		});
		for (const size of CARD_SIZES) {
			const btn = this.densityGroupEl.createEl("button", {
				cls: "el-density-btn",
				text: size.label,
				attr: { "aria-label": size.aria, title: size.aria },
			});
			btn.dataset.size = size.value;
			btn.addEventListener("click", () => {
				if (this.plugin.settings.cardSize === size.value) return;
				this.plugin.settings.cardSize = size.value;
				void this.plugin.saveSettings();
				this.render();
			});
		}

		// Status tabs
		this.tabsEl = root.createDiv({ cls: "el-tabs" });
		for (const tab of STATUS_TABS) {
			const btn = this.tabsEl.createEl("button", { cls: "el-tab" });
			btn.dataset.value = tab.value;
			btn.createSpan({ cls: "el-tab-label", text: tab.label });
			btn.createSpan({ cls: "el-tab-count" });
			btn.addEventListener("click", () => {
				this.statusFilter = tab.value;
				this.render();
			});
		}

		// Continue reading section container
		this.continueSectionEl = root.createDiv({ cls: "el-continue-section" });

		// All books section header & results count
		this.allBooksHeaderEl = root.createDiv({ cls: "el-all-books-header" });
		this.resultsCountEl = root.createDiv({ cls: "el-results-count" });

		// Main book grid
		this.gridEl = root.createDiv({ cls: "el-grid" });
	}

	// ---------- Rendering ----------

	render() {
		this.headerTitleEl.setText(this.plugin.settings.libraryTitle);
		this.populateTagOptions();
		this.populateReaderOptions();
		this.updateActiveTab();
		this.updateSortDirButton();
		this.updateDensityToggle();
		this.renderStats();
		this.renderContinueReading();

		this.gridEl.empty();
		this.gridEl.removeClass("card-size-small", "card-size-medium", "card-size-large");
		this.gridEl.addClass(`card-size-${this.plugin.settings.cardSize}`);

		const totalBooks = this.plugin.settings.books.length;
		const books = this.getFilteredSortedBooks();

		this.renderAllBooksHeader();
		this.renderResultsCount(totalBooks, books.length);

		if (totalBooks === 0) {
			this.renderEmptyState(true);
			return;
		}
		if (books.length === 0) {
			this.renderEmptyState(false);
			return;
		}
		books.forEach((book, index) => {
			this.gridEl.appendChild(this.buildCard(book, index));
		});
	}

	private renderAllBooksHeader() {
		this.allBooksHeaderEl.empty();
		this.allBooksHeaderEl.createDiv({ cls: "el-all-books-title", text: "ALL BOOKS" });
	}

	private renderContinueReading() {
		this.continueSectionEl.empty();

		const active = this.plugin.getActiveReaderId();
		const readingBooks = this.plugin.settings.books.filter((b) => this.plugin.bookHasStatus(b, "reading", active));

		// Hide if no book is in reading status
		if (readingBooks.length === 0) {
			this.continueSectionEl.setCssStyles({ display: "none" });
			return;
		}

		this.continueSectionEl.setCssStyles({ display: "block" });

		const sortedReading = readingBooks.slice().sort((a, b) => {
			const timeA = a.lastOpened ?? a.dateAdded;
			const timeB = b.lastOpened ?? b.dateAdded;
			return timeB - timeA;
		});

		const featured = sortedReading[0];

		// Header
		const header = this.continueSectionEl.createDiv({ cls: "el-continue-header" });
		const titleWrap = header.createDiv({ cls: "el-continue-header-left" });
		setIcon(titleWrap.createSpan({ cls: "el-continue-icon" }), "book-open");
		titleWrap.createSpan({ cls: "el-continue-title-text", text: "Continue reading" });

		header.createDiv({ cls: "el-continue-header-note", text: "Pick up where you left off" });

		// Featured Card
		const card = this.continueSectionEl.createDiv({ cls: "el-continue-card" });
		card.setAttribute("tabindex", "0");
		card.setAttribute("role", "button");
		card.setAttribute("aria-label", `Continue reading ${featured.title}`);

		const cover = card.createDiv({ cls: "el-continue-cover" });
		this.renderCover(cover, featured);

		const info = card.createDiv({ cls: "el-continue-info" });
		const readingPill = active
			? "READING"
			: `READING · ${this.readersWithStatus(featured, "reading").join(", ").toUpperCase()}`;
		info.createDiv({ cls: "el-badge-reading-pill", text: readingPill });
		info.createDiv({ cls: "el-continue-book-title", text: featured.title });
		if (featured.author) {
			info.createDiv({ cls: "el-continue-book-author", text: featured.author });
		}
		info.createDiv({
			cls: "el-continue-last-opened",
			text: featured.lastOpened ? `Opened ${formatRelativeDate(featured.lastOpened)}` : "Not opened yet",
		});
		info.createSpan({ cls: "el-continue-action", text: "Open book" });

		card.addEventListener("click", () => {
			void this.plugin.openBook(featured);
		});
		card.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				void this.plugin.openBook(featured);
			}
		});
	}

	private populateTagOptions() {
		const current = this.tagFilter;
		this.tagSelectEl.empty();
		this.tagSelectEl.createEl("option", { value: "all", text: "All tags" });
		for (const tag of this.plugin.getAllTags()) {
			this.tagSelectEl.createEl("option", { value: tag, text: tag });
		}
		const values = Array.from(this.tagSelectEl.options).map((o) => o.value);
		this.tagFilter = values.includes(current) ? current : "all";
		this.tagSelectEl.value = this.tagFilter;
	}

	private populateReaderOptions() {
		this.readerSelectEl.empty();
		this.readerSelectEl.createEl("option", { value: "all", text: "Everyone" });
		for (const reader of this.plugin.settings.readers) {
			this.readerSelectEl.createEl("option", { value: reader.id, text: reader.name });
		}
		this.readerSelectEl.value = this.plugin.getActiveReaderId() ?? "all";
		this.readerSelectEl.toggle(this.plugin.settings.readers.length > 1);
	}

	/** Names of the readers whose state for this book is `status`. */
	private readersWithStatus(book: Book, status: ReadingStatus): string[] {
		return this.plugin.settings.readers
			.filter((r) => this.plugin.getReaderState(book, r.id).status === status)
			.map((r) => r.name);
	}

	private updateActiveTab() {
		const counts = this.getStatusCounts();
		this.tabsEl.querySelectorAll(".el-tab").forEach((el) => {
			const btn = el as HTMLElement;
			const value = (btn.dataset.value ?? "all") as StatusFilter;
			btn.toggleClass("is-active", value === this.statusFilter);
			const countEl = btn.querySelector(".el-tab-count");
			if (countEl) countEl.textContent = String(counts[value] ?? 0);
		});
	}

	private updateSortDirButton() {
		const desc = this.plugin.settings.sortDirection === "desc";
		const label = desc ? "Sorted descending" : "Sorted ascending";
		this.sortDirBtn.setAttribute("aria-label", label);
		this.sortDirBtn.setAttribute("title", label);
		this.sortDirBtn.toggleClass("is-desc", desc);
	}

	private updateDensityToggle() {
		this.densityGroupEl.querySelectorAll(".el-density-btn").forEach((el) => {
			const btn = el as HTMLElement;
			const isActive = btn.dataset.size === this.plugin.settings.cardSize;
			btn.toggleClass("is-active", isActive);
			btn.setAttribute("aria-pressed", String(isActive));
		});
	}

	private addStatChip(icon: string, value: string, label: string) {
		const chip = this.statsEl.createDiv({ cls: "el-stat-chip" });
		setIcon(chip.createSpan({ cls: "el-stat-chip-icon" }), icon);
		chip.createEl("span", { cls: "el-stat-chip-value", text: value });
		chip.createSpan({ cls: "el-stat-chip-label", text: label });
		return chip;
	}

	private renderStats() {
		this.statsEl.empty();
		const books = this.plugin.settings.books;
		const total = books.length;
		if (total === 0) return;

		this.addStatChip("library", String(total), total === 1 ? "book" : "books");

		const active = this.plugin.getActiveReaderId();
		if (!active && this.plugin.settings.readers.length > 1) {
			// Everyone: one chip per reader with how many books they finished.
			for (const reader of this.plugin.settings.readers) {
				const done = books.filter((b) => this.plugin.bookHasStatus(b, "completed", reader.id)).length;
				this.addStatChip("check-circle", String(done), `${reader.name} completed`);
			}
			return;
		}

		const reader = active ?? this.plugin.settings.readers[0]?.id ?? null;
		const reading = books.filter((b) => this.plugin.bookHasStatus(b, "reading", reader)).length;
		const completed = books.filter((b) => this.plugin.bookHasStatus(b, "completed", reader)).length;
		const pct = Math.round((completed / total) * 100);

		this.addStatChip("book-open", String(reading), "reading");
		this.addStatChip("check-circle", String(completed), "completed");

		const pctChip = this.statsEl.createDiv({ cls: "el-stat-chip" });
		setIcon(pctChip.createSpan({ cls: "el-stat-chip-icon" }), "percent");
		pctChip.createEl("span", { cls: "el-stat-chip-value", text: `${pct}%` });
		pctChip.createSpan({ cls: "el-stat-chip-label", text: "complete" });
	}

	private renderResultsCount(total: number, shown: number) {
		const filtersActive =
			this.statusFilter !== "all" ||
			this.categoryFilter !== "all" ||
			this.tagFilter !== "all" ||
			!!this.searchQuery;

		if (total === 0 || !filtersActive) {
			this.resultsCountEl.setText("");
			this.resultsCountEl.removeClass("is-visible");
			return;
		}
		this.resultsCountEl.setText(`Showing ${shown} of ${total} ${total === 1 ? "book" : "books"}`);
		this.resultsCountEl.addClass("is-visible");
	}

	/** Applies every filter except reading status — used both for the grid and for tab counts. */
	private getBooksMatchingNonStatusFilters(): Book[] {
		let books = this.plugin.settings.books.slice();

		if (this.categoryFilter !== "all") {
			books = books.filter((b) => b.category === this.categoryFilter);
		}
		if (this.tagFilter !== "all") {
			books = books.filter((b) => b.tags.includes(this.tagFilter));
		}
		if (this.searchQuery) {
			const q = this.searchQuery;
			books = books.filter(
				(b) =>
					b.title.toLowerCase().includes(q) ||
					b.author.toLowerCase().includes(q) ||
					b.description.toLowerCase().includes(q) ||
					b.tags.some((t) => t.toLowerCase().includes(q))
			);
		}
		return books;
	}

	private getStatusCounts(): Record<StatusFilter, number> {
		const books = this.getBooksMatchingNonStatusFilters();
		const active = this.plugin.getActiveReaderId();
		const count = (status: ReadingStatus) =>
			books.filter((b) => this.plugin.bookHasStatus(b, status, active)).length;
		return {
			all: books.length,
			unread: count("unread"),
			reading: count("reading"),
			completed: count("completed"),
		};
	}

	private getFilteredSortedBooks(): Book[] {
		let books = this.getBooksMatchingNonStatusFilters();

		const active = this.plugin.getActiveReaderId();
		const statusFilter = this.statusFilter;
		if (statusFilter !== "all") {
			books = books.filter((b) => this.plugin.bookHasStatus(b, statusFilter, active));
		}

		const dir = this.plugin.settings.sortDirection === "asc" ? 1 : -1;
		const key = this.plugin.settings.sortKey;
		const finishedLabel = (book: Book) =>
			this.readersWithStatus(book, "completed")
				.sort((x, y) => x.localeCompare(y))
				.join(", ");
		// With a reader selected, use that reader's date/progress; otherwise the latest/highest one.
		const finishedDate = (book: Book) => this.plugin.getFinishedAt(book, active);
		books.sort((a, b) => {
			switch (key) {
				case "dateFinished": {
					const da = finishedDate(a);
					const db = finishedDate(b);
					// Books without a finish date always go last.
					if (da === null || db === null) return da === db ? 0 : da !== null ? -1 : 1;
					return (da - db) * dir;
				}
				case "finishedBy": {
					const la = finishedLabel(a);
					const lb = finishedLabel(b);
					// Books finished by nobody always go last.
					if (!la || !lb) return la === lb ? 0 : la ? -1 : 1;
					return la.localeCompare(lb) * dir || a.title.localeCompare(b.title);
				}
				case "title":
					return a.title.localeCompare(b.title) * dir;
				case "author":
					return a.author.localeCompare(b.author) * dir;
				case "progress":
					return (this.plugin.getProgress(a, active) - this.plugin.getProgress(b, active)) * dir;
				case "lastOpened":
					return ((a.lastOpened ?? 0) - (b.lastOpened ?? 0)) * dir;
				case "dateAdded":
				default:
					return (a.dateAdded - b.dateAdded) * dir;
			}
		});

		return books;
	}

	private renderEmptyState(isLibraryEmpty: boolean) {
		const empty = this.gridEl.createDiv({ cls: "el-empty" });
		setIcon(empty.createDiv({ cls: "el-empty-icon" }), isLibraryEmpty ? "library" : "search");
		empty.createDiv({
			cls: "el-empty-title",
			text: isLibraryEmpty ? "Your library is empty" : "No books match your filters",
		});
		empty.createDiv({
			cls: "el-empty-subtitle",
			text: isLibraryEmpty
				? "Add your first book, manga, magazine or document to get started."
				: "Try a different search term, or clear your filters.",
		});
		if (isLibraryEmpty) {
			const btn = empty.createEl("button", { cls: "el-add-btn", text: "Add your first book" });
			btn.addEventListener("click", () => this.openAddModal());
		} else {
			const btn = empty.createEl("button", { cls: "el-add-btn", text: "Clear filters" });
			btn.addEventListener("click", () => {
				this.searchQuery = "";
				this.statusFilter = "all";
				this.categoryFilter = "all";
				this.tagFilter = "all";
				this.searchInputEl.value = "";
				this.categorySelectEl.value = "all";
				this.tagSelectEl.value = "all";
				this.render();
			});
		}
	}

	// ---------- Card ----------

	private buildCard(book: Book, index: number): HTMLElement {
		const card = createDiv({ cls: "el-card" });
		card.setAttribute("tabindex", "0");
		card.setAttribute("role", "button");
		card.setAttribute("aria-label", `Open ${book.title}`);
		card.setCssStyles({ animationDelay: `${Math.min(index * 25, 400)}ms` });

		const cover = card.createDiv({ cls: "el-card-cover" });
		this.renderCover(cover, book);

		const fileExists = !!this.plugin.app.vault.getAbstractFileByPath(book.filePath);
		if (!fileExists) {
			const badge = cover.createDiv({ cls: "el-badge el-badge-missing" });
			setIcon(badge, "alert-triangle");
			badge.setAttribute("aria-label", "File not found in vault");
		} else {
			// Selected reader: their status. Everyone: DONE once all readers finished, READING if anyone is.
			const active = this.plugin.getActiveReaderId();
			const allDone = this.plugin.settings.readers.every(
				(r) => this.plugin.getReaderState(book, r.id).status === "completed"
			);
			const done = active ? this.plugin.bookHasStatus(book, "completed", active) : allDone;
			if (done) {
				cover.createDiv({ cls: "el-badge-completed-top", text: "DONE" });
			} else if (this.plugin.bookHasStatus(book, "reading", active)) {
				cover.createDiv({ cls: "el-badge-reading-top", text: "READING" });
			}
		}

		setIcon(cover.createDiv({ cls: "el-card-hover-open", attr: { "aria-hidden": "true" } }), "book-open");

		const moreBtn = card.createEl("button", { cls: "el-card-more", attr: { "aria-label": "More options" } });
		moreBtn.setText("⋮");
		moreBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.showCardMenu(evt, book);
		});

		const info = card.createDiv({ cls: "el-card-info" });
		info.createDiv({ cls: "el-card-title", text: book.title });
		if (book.author) info.createDiv({ cls: "el-card-author", text: book.author });

		const tagsRow = info.createDiv({ cls: "el-card-tags" });
		const categoryPill = tagsRow.createSpan({ cls: "el-tag-pill el-tag-pill-category" });
		categoryPill.appendText(CATEGORY_META[book.category]?.label ?? book.category);
		for (const reader of this.plugin.settings.readers) {
			const state = this.plugin.getReaderState(book, reader.id);
			if (state.status === "unread") continue;
			const completed = state.status === "completed";
			const tooltip = completed
				? `${reader.name}: completed${state.finishedAt ? ` on ${formatDate(state.finishedAt)}` : ""}`
				: `${reader.name}: reading`;
			const pill = tagsRow.createSpan({
				cls: `el-tag-pill el-tag-pill-reader ${completed ? "is-completed" : "is-reading"}`,
				attr: { "aria-label": tooltip, title: tooltip },
			});
			setIcon(pill.createSpan({ cls: "el-tag-pill-reader-icon" }), completed ? "check" : "book-open");
			pill.appendText(reader.name);
			if (completed && state.finishedAt) {
				pill.createSpan({ cls: "el-tag-pill-reader-date", text: formatDate(state.finishedAt) });
			}
		}
		if (book.lastOpened) {
			tagsRow.createSpan({ cls: "el-card-last-opened", text: formatRelativeDate(book.lastOpened) });
		}

		card.addEventListener("click", () => {
			void this.plugin.openBook(book);
		});
		card.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				void this.plugin.openBook(book);
			}
		});
		card.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			this.showCardMenu(evt, book);
		});

		return card;
	}

	private renderCover(container: HTMLElement, book: Book) {
		const src = this.resolveCoverSrc(book);
		if (src) {
			const img = container.createEl("img", { cls: "el-card-cover-img" });
			img.alt = book.title;
			img.onerror = () => {
				img.remove();
				this.renderPlaceholderCover(container, book);
			};
			img.src = src;
			return;
		}
		this.renderPlaceholderCover(container, book);
	}

	private resolveCoverSrc(book: Book): string | null {
		if (book.coverType === "url" && book.cover) return book.cover;
		if (book.coverType === "vault" && book.cover) {
			const file = this.plugin.app.vault.getAbstractFileByPath(book.cover);
			if (file instanceof TFile) return this.plugin.app.vault.getResourcePath(file);
		}
		return null;
	}

	private renderPlaceholderCover(container: HTMLElement, book: Book) {
		container.empty();
		container.addClass("el-cover-placeholder");
		container.setCssStyles({ background: placeholderGradient(book.title || book.filePath) });
		const iconWrap = container.createDiv({ cls: "el-cover-placeholder-icon" });
		setIcon(iconWrap, CATEGORY_META[book.category]?.icon ?? "book");
		container.createDiv({ cls: "el-cover-placeholder-title", text: book.title });
	}

	private showCardMenu(evt: MouseEvent, book: Book) {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Open")
				.setIcon("book-open")
				.onClick(() => {
					void this.plugin.openBook(book);
				})
		);
		menu.addItem((item) =>
			item.setTitle("Edit details").setIcon("pencil").onClick(() => this.openEditModal(book))
		);

		menu.addSeparator();

		// Status actions: for the selected reader, or for each reader when viewing everyone.
		const active = this.plugin.getActiveReaderId();
		const readers = this.plugin.settings.readers.filter((r) => !active || r.id === active);
		const statuses: ReadingStatus[] = ["unread", "reading", "completed"];
		readers.forEach((reader, i) => {
			if (i > 0) menu.addSeparator();
			const state = this.plugin.getReaderState(book, reader.id);
			for (const status of statuses) {
				const action = `Mark as ${STATUS_META[status].label.toLowerCase()}`;
				menu.addItem((item) =>
					item
						.setTitle(readers.length > 1 ? `${reader.name}: ${action.toLowerCase()}` : action)
						.setIcon(STATUS_META[status].icon)
						.setChecked(state.status === status)
						.onClick(() => {
							void this.plugin.setReaderStatus(book, reader.id, status);
						})
				);
			}
		});

		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Remove from library")
				.setIcon("trash-2")
				.onClick(() => {
					new ConfirmModal(this.plugin.app, {
						title: "Remove from library",
						message: `Remove "${book.title}" from your library? The file itself will not be deleted.`,
						confirmText: "Remove",
						onConfirm: () => this.plugin.removeBook(book.id),
					}).open();
				})
		);

		menu.showAtMouseEvent(evt);
	}

	// ---------- Modals ----------

	private openAddModal() {
		new BookModal(this.plugin, null, async (data) => {
			await this.plugin.addBook(data);
		}).open();
	}

	private openEditModal(book: Book) {
		new BookModal(this.plugin, book, async (data) => {
			await this.plugin.updateBook(book.id, data);
		}).open();
	}
}
