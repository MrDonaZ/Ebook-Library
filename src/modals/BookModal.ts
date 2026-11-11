import { Menu, Modal, Notice, TFile, setIcon } from "obsidian";
import type EbookLibraryPlugin from "../main";
import {
	Book,
	BookCategory,
	CATEGORY_META,
	CATEGORY_ORDER,
	CoverType,
	NewBookInput,
	ReaderState,
	ReadingStatus,
} from "../types";
import {
	clamp,
	fromDateInputValue,
	getBasename,
	nextReaderState,
	placeholderGradient,
	readerInitial,
	toDateInputValue,
} from "../utils";
import { ConfirmModal } from "./ConfirmModal";
import { FileSuggestModal } from "./FileSuggestModal";
import { PromptModal } from "./PromptModal";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

export class BookModal extends Modal {
	private plugin: EbookLibraryPlugin;
	private existing: Book | null;
	private onSubmit: (data: NewBookInput) => void | Promise<void>;

	// Form state
	private filePath: string;
	private title: string;
	private author: string;
	private category: BookCategory;
	private rating: number;
	private description: string;
	private tags: string[];
	private totalPages: number | null;
	private readerStates: Record<string, ReaderState>;
	private coverType: CoverType;
	private cover: string;

	// Element refs updated after initial render
	private filePathInputEl!: HTMLInputElement;
	private titleInputEl!: HTMLInputElement;
	private coverPreviewEl!: HTMLElement;
	private tagsChipsEl!: HTMLElement;
	private tagsInputEl?: HTMLInputElement;
	private starsEl!: HTMLElement;

	constructor(
		plugin: EbookLibraryPlugin,
		existing: Book | null,
		onSubmit: (data: NewBookInput) => void | Promise<void>
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.existing = existing;
		this.onSubmit = onSubmit;

		this.filePath = existing?.filePath ?? "";
		this.title = existing?.title ?? "";
		this.author = existing?.author ?? "";
		this.category = existing?.category ?? "book";
		this.rating = existing?.rating ?? 0;
		this.description = existing?.description ?? "";
		this.tags = existing ? [...existing.tags] : [];
		this.totalPages = existing?.totalPages ?? null;
		this.readerStates = {};
		for (const [id, state] of Object.entries(existing?.readerStates ?? {})) {
			this.readerStates[id] = { ...state };
		}
		this.coverType = existing?.coverType ?? "none";
		this.cover = existing?.cover ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("el-book-modal");
		this.titleEl.setText(this.existing ? "Edit book" : "Add a new book");

		const layout = contentEl.createDiv({ cls: "el-modal-layout" });

		this.buildCoverSection(layout);
		this.buildFormSection(layout);
		this.buildButtons(contentEl);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ---------- Cover ----------

	private buildCoverSection(parent: HTMLElement) {
		const section = parent.createDiv({ cls: "el-modal-cover-section" });
		const frame = section.createDiv({ cls: "el-modal-cover-frame" });
		this.coverPreviewEl = frame.createDiv({ cls: "el-modal-cover-preview" });
		this.renderCoverPreview();

		if (this.existing?.coverFromNote) {
			section.createDiv({ cls: "el-modal-cover-hint", text: "Cover from the note's properties" });
			return;
		}

		const changeBtn = frame.createEl("button", {
			cls: "el-modal-cover-edit-btn",
			attr: { "aria-label": "Change cover" },
		});
		setIcon(changeBtn, "image");
		changeBtn.addEventListener("click", (evt) => this.showCoverMenu(evt));

		section.createDiv({ cls: "el-modal-cover-hint", text: "Click the icon to change the cover" });
	}

	private renderCoverPreview() {
		this.coverPreviewEl.empty();
		this.coverPreviewEl.removeClass("el-cover-placeholder");
		this.coverPreviewEl.setCssStyles({ background: "" });

		const src = this.resolveCoverSrc();
		if (src) {
			const img = this.coverPreviewEl.createEl("img", { cls: "el-modal-cover-img" });
			img.alt = this.title || "Cover";
			img.onerror = () => {
				this.coverType = "none";
				this.cover = "";
				this.renderCoverPreview();
			};
			img.src = src;
			return;
		}

		this.coverPreviewEl.addClass("el-cover-placeholder");
		this.coverPreviewEl.setCssStyles({ background: placeholderGradient(this.title || this.filePath) });
		const iconWrap = this.coverPreviewEl.createDiv({ cls: "el-cover-placeholder-icon" });
		setIcon(iconWrap, CATEGORY_META[this.category].icon);
		this.coverPreviewEl.createDiv({
			cls: "el-cover-placeholder-title",
			text: this.title || "Untitled",
		});
	}

	private resolveCoverSrc(): string | null {
		if (this.coverType === "url" && this.cover) return this.cover;
		if (this.coverType === "vault" && this.cover) {
			const file = this.plugin.app.vault.getAbstractFileByPath(this.cover);
			if (file instanceof TFile) return this.plugin.app.vault.getResourcePath(file);
		}
		return null;
	}

	private showCoverMenu(evt: MouseEvent) {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Choose image from vault")
				.setIcon("image")
				.onClick(() => {
					new FileSuggestModal(
						this.plugin.app,
						(file) => {
							this.coverType = "vault";
							this.cover = file.path;
							this.renderCoverPreview();
						},
						IMAGE_EXTENSIONS
					).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle("Use image URL")
				.setIcon("link")
				.onClick(() => {
					new PromptModal(this.plugin.app, {
						title: "Cover image URL",
						placeholder: "https://example.com/cover.jpg",
						initialValue: this.coverType === "url" ? this.cover : "",
						submitText: "Set cover",
						onSubmit: (value) => {
							if (value) {
								this.coverType = "url";
								this.cover = value;
								this.renderCoverPreview();
							}
						},
					}).open();
				})
		);
		if (this.coverType !== "none") {
			menu.addItem((item) =>
				item
					.setTitle("Remove cover")
					.setIcon("x")
					.onClick(() => {
						this.coverType = "none";
						this.cover = "";
						this.renderCoverPreview();
					})
			);
		}
		menu.showAtMouseEvent(evt);
	}

	// ---------- Form ----------

	private buildFormSection(parent: HTMLElement) {
		const form = parent.createDiv({ cls: "el-modal-form" });

		this.addSectionTitle(form, "Book details");
		if (this.isNote) {
			// Title, author, tags and reading dates come from the note itself.
			const info = form.createDiv({ cls: "el-note-info" });
			setIcon(info.createSpan({ cls: "el-note-info-icon" }), "file-text");
			info.createSpan({
				text: "This book is a note: title, author and tags come from its properties, and reading status is saved back into them.",
			});
			this.buildReadOnlyField(form, "Note", this.filePath);
			this.buildReadOnlyField(form, "Title", this.title);
			if (this.author) this.buildReadOnlyField(form, "Author", this.author);
			if (this.tags.length) this.buildReadOnlyField(form, "Tags", this.tags.join(", "));
			this.buildCategoryField(form);
			this.addSectionTitle(form, "Organize");
			this.buildDescriptionField(form);
		} else {
			this.buildFileField(form);
			this.buildTextField(form, "Title", this.title, "Book title", (v) => {
				this.title = v;
				this.renderCoverPreview();
			}, (inputEl) => (this.titleInputEl = inputEl));
			this.buildTextField(form, "Author", this.author, "Author name", (v) => (this.author = v));
			this.buildCategoryField(form);

			this.addSectionTitle(form, "Organize");
			this.buildTagsField(form);
			this.buildDescriptionField(form);
		}

		this.addSectionTitle(form, "Progress & rating");
		this.buildReaderStatesField(form);
		this.buildTotalPagesField(form);
		this.buildRatingField(form);
	}

	private get isNote(): boolean {
		return this.existing?.source === "note";
	}

	private buildReadOnlyField(form: HTMLElement, label: string, value: string) {
		const row = form.createDiv({ cls: "el-field el-field-readonly" });
		row.createDiv({ cls: "el-field-label", text: label });
		row.createDiv({ cls: "el-field-value", text: value });
	}

	private addSectionTitle(parent: HTMLElement, text: string) {
		parent.createDiv({ cls: "el-form-section-title", text });
	}

	private buildFileField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Book file" });
		row.createDiv({
			cls: "el-field-desc",
			text: "The file in your vault this entry points to.",
		});
		const controls = row.createDiv({ cls: "el-field-control el-field-control-row" });
		this.filePathInputEl = controls.createEl("input", {
			type: "text",
			cls: "el-text-input",
			placeholder: "path/to/book.pdf",
			value: this.filePath,
		});
		this.filePathInputEl.addEventListener("input", () => {
			this.filePath = this.filePathInputEl.value;
		});
		const browseBtn = controls.createEl("button", { cls: "el-icon-btn", attr: { "aria-label": "Browse vault" } });
		setIcon(browseBtn, "folder-open");
		browseBtn.addEventListener("click", () => {
			new FileSuggestModal(this.plugin.app, (file) => {
				this.filePath = file.path;
				this.filePathInputEl.value = file.path;
				if (!this.title.trim()) {
					this.title = getBasename(file.path);
					this.titleInputEl.value = this.title;
					this.renderCoverPreview();
				}
			}).open();
		});
	}

	private buildTextField(
		form: HTMLElement,
		label: string,
		initial: string,
		placeholder: string,
		onChange: (value: string) => void,
		captureEl?: (el: HTMLInputElement) => void
	) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: label });
		const input = row.createDiv({ cls: "el-field-control" }).createEl("input", {
			type: "text",
			cls: "el-text-input",
			placeholder,
			value: initial,
		});
		input.addEventListener("input", () => onChange(input.value));
		if (captureEl) captureEl(input);
	}

	private buildCategoryField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Category" });
		const select = row.createDiv({ cls: "el-field-control" }).createEl("select", { cls: "el-select" });
		for (const cat of CATEGORY_ORDER) {
			select.createEl("option", { value: cat, text: CATEGORY_META[cat].label });
		}
		select.value = this.category;
		select.addEventListener("change", () => {
			this.category = select.value as BookCategory;
			this.renderCoverPreview();
		});
	}

	private buildTagsField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Tags" });
		row.createDiv({ cls: "el-field-desc", text: "Press Enter or comma to add a tag." });
		const control = row.createDiv({ cls: "el-field-control" });
		const field = control.createDiv({ cls: "el-tags-field" });
		this.tagsChipsEl = field.createDiv({ cls: "el-tags-chips" });
		const tagsInput = field.createEl("input", {
			cls: "el-tags-input",
			type: "text",
			placeholder: "Add a tag...",
		});
		this.tagsInputEl = tagsInput;
		tagsInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === ",") {
				evt.preventDefault();
				this.addTag(tagsInput.value);
				tagsInput.value = "";
			} else if (evt.key === "Backspace" && tagsInput.value === "" && this.tags.length > 0) {
				this.tags.pop();
				this.renderTagChips();
			}
		});
		tagsInput.addEventListener("blur", () => {
			this.addTag(tagsInput.value);
			tagsInput.value = "";
		});
		this.renderTagChips();

		const suggestions = this.plugin.getAllTags().filter((t) => !this.tags.includes(t));
		if (suggestions.length > 0) {
			const presetWrap = control.createDiv({ cls: "el-tags-suggestions" });
			presetWrap.createSpan({ cls: "el-tags-suggestions-label", text: "Suggestions:" });
			for (const tag of suggestions.slice(0, 12)) {
				const pill = presetWrap.createEl("button", { cls: "el-tag-pill el-tag-suggestion", text: tag });
				pill.addEventListener("click", () => {
					this.addTag(tag);
					pill.remove();
				});
			}
		}
	}

	private addTag(raw: string) {
		const tag = raw.trim().replace(/,/g, "");
		if (!tag) return;
		if (this.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
		this.tags.push(tag);
		this.renderTagChips();
	}

	private renderTagChips() {
		this.tagsChipsEl.empty();
		for (const tag of this.tags) {
			const chip = this.tagsChipsEl.createDiv({ cls: "el-tag-chip" });
			chip.createSpan({ text: tag });
			const remove = chip.createSpan({ cls: "el-tag-chip-remove" });
			setIcon(remove, "x");
			remove.addEventListener("click", () => {
				this.tags = this.tags.filter((t) => t !== tag);
				this.renderTagChips();
			});
		}
	}

	private buildDescriptionField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Description" });
		const textarea = row.createDiv({ cls: "el-field-control" }).createEl("textarea", {
			cls: "el-textarea",
			placeholder: "What's this book about?",
		});
		textarea.rows = 4;
		textarea.value = this.description;
		textarea.addEventListener("input", () => (this.description = textarea.value));
	}

	private buildReaderStatesField(form: HTMLElement) {
		const readers = this.plugin.settings.readers;
		const multi = readers.length > 1;
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Reading status" });
		if (multi) {
			row.createDiv({ cls: "el-field-desc", text: "Each reader has their own status." });
		}
		const control = row.createDiv({ cls: "el-field-control el-reader-states" });
		const statuses: { value: ReadingStatus; label: string }[] = [
			{ value: "unread", label: "Unread" },
			{ value: "reading", label: "Reading" },
			{ value: "completed", label: "Done" },
		];

		for (const reader of readers) {
			const readerRow = control.createDiv({ cls: "el-reader-row" });
			if (multi) {
				const who = readerRow.createDiv({ cls: "el-reader-name" });
				const avatar = who.createSpan({ cls: "el-avatar", text: readerInitial(reader.name) });
				avatar.setCssStyles({ background: this.plugin.getReaderColor(reader.id) });
				who.createSpan({ text: reader.name });
			}

			const segmented = readerRow.createDiv({
				cls: "el-segmented",
				attr: { role: "group", "aria-label": `Reading status of ${reader.name}` },
			});
			const buttons = statuses.map((s) => {
				const btn = segmented.createEl("button", { cls: "el-segmented-btn", text: s.label });
				btn.dataset.status = s.value;
				return btn;
			});

			// Finish date appears only once the reader is done.
			const dateWrap = readerRow.createDiv({ cls: "el-reader-date-wrap" });
			dateWrap.createSpan({ cls: "el-reader-date-label", text: "Finished on" });
			const dateInput = dateWrap.createEl("input", {
				type: "date",
				cls: "el-text-input el-reader-date",
				attr: { "aria-label": `Date ${reader.name} finished this book` },
			});

			const sync = () => {
				const state = this.readerStates[reader.id];
				const status = state?.status ?? "unread";
				for (const btn of buttons) {
					const on = btn.dataset.status === status;
					btn.toggleClass("is-active", on);
					btn.setAttribute("aria-pressed", String(on));
				}
				dateWrap.toggle(status === "completed");
				dateInput.value = state?.finishedAt ? toDateInputValue(state.finishedAt) : "";
			};
			sync();

			for (const btn of buttons) {
				btn.addEventListener("click", (evt) => {
					evt.preventDefault();
					const prev = this.readerStates[reader.id] ?? { status: "unread", progress: 0, finishedAt: null };
					// Moving to "completed" defaults the finish date to today; the user can change it.
					this.readerStates[reader.id] = nextReaderState(prev, btn.dataset.status as ReadingStatus);
					sync();
				});
			}
			dateInput.addEventListener("change", () => {
				const state = this.readerStates[reader.id];
				if (state) state.finishedAt = fromDateInputValue(dateInput.value);
			});
		}
	}

	private buildTotalPagesField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Total pages" });
		row.createDiv({ cls: "el-field-desc", text: "Optional" });
		const input = row.createDiv({ cls: "el-field-control" }).createEl("input", {
			cls: "el-text-input",
			type: "number",
			placeholder: "e.g. 320",
		});
		if (this.totalPages) input.value = String(this.totalPages);
		input.addEventListener("input", () => {
			const n = parseInt(input.value, 10);
			this.totalPages = isNaN(n) || n <= 0 ? null : n;
		});
	}

	private buildRatingField(form: HTMLElement) {
		const row = form.createDiv({ cls: "el-field" });
		row.createDiv({ cls: "el-field-label", text: "Rating" });
		this.starsEl = row.createDiv({ cls: "el-field-control" }).createDiv({ cls: "el-star-rating" });
		this.renderStars();
	}

	private renderStars() {
		this.starsEl.empty();
		for (let i = 1; i <= 5; i++) {
			const star = this.starsEl.createSpan({ cls: "el-star", attr: { "aria-label": `${i} star` } });
			setIcon(star, "star");
			star.toggleClass("is-filled", i <= this.rating);
			star.addEventListener("click", () => {
				this.rating = this.rating === i ? 0 : i;
				this.renderStars();
			});
		}
	}

	// ---------- Buttons ----------

	private buildButtons(parent: HTMLElement) {
		const buttons = parent.createDiv({ cls: "el-modal-buttons" });

		// Note-backed books leave the library by moving the note out of the folder.
		if (this.existing && !this.isNote) {
			const deleteBtn = buttons.createEl("button", { cls: "el-btn-danger" });
			const deleteBtnLabel = deleteBtn.createSpan({ cls: "el-btn-icon-label" });
			setIcon(deleteBtnLabel.createSpan(), "trash-2");
			deleteBtnLabel.createSpan({ text: "Delete" });
			deleteBtn.addEventListener("click", () => {
				new ConfirmModal(this.plugin.app, {
					title: "Remove from library",
					message: `Remove "${this.existing!.title}" from your library? The underlying file is not deleted.`,
					confirmText: "Remove",
					onConfirm: async () => {
						await this.plugin.removeBook(this.existing!.id);
						this.close();
					},
				}).open();
			});
		}

		buttons.createDiv({ cls: "el-modal-buttons-spacer" });

		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = buttons.createEl("button", { cls: "mod-cta" });
		const saveBtnLabel = saveBtn.createSpan({ cls: "el-btn-icon-label" });
		setIcon(saveBtnLabel.createSpan(), this.existing ? "check" : "plus");
		saveBtnLabel.createSpan({ text: this.existing ? "Save changes" : "Add to library" });
		saveBtn.addEventListener("click", () => {
			void this.handleSave(saveBtn);
		});
	}

	private async handleSave(saveBtn: HTMLButtonElement) {
		if (this.tagsInputEl) this.addTag(this.tagsInputEl.value);

		if (!this.filePath.trim()) {
			new Notice("Please choose a book file");
			return;
		}
		if (!this.title.trim()) {
			new Notice("Please enter a title");
			return;
		}

		saveBtn.disabled = true;
		const data: NewBookInput = {
			source: this.existing?.source ?? "manual",
			coverFromNote: this.existing?.coverFromNote,
			filePath: this.filePath.trim(),
			title: this.title.trim(),
			author: this.author.trim(),
			coverType: this.coverType,
			cover: this.cover,
			description: this.description.trim(),
			tags: this.tags,
			category: this.category,
			readerStates: this.readerStates,
			rating: this.rating,
			totalPages: this.totalPages,
			lastOpened: this.existing?.lastOpened ?? null,
		};

		try {
			await this.onSubmit(data);
			this.close();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			new Notice(`Save failed: ${message}`);
		} finally {
			saveBtn.disabled = false;
		}
	}
}
