import { App, Notice, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type EbookLibraryPlugin from "../main";
import { ConfirmModal } from "../modals/ConfirmModal";

/** Settings that change how notes are read: re-sync the folder when they change. */
const NOTE_KEYS = [
	"sourceFolder",
	"propAuthor",
	"propCover",
	"propStatus",
	"statusCompleted",
	"statusReading",
	"statusUnread",
];

export class EbookLibrarySettingTab extends PluginSettingTab {
	plugin: EbookLibraryPlugin;

	constructor(app: App, plugin: EbookLibraryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Library title",
				desc: "The big title shown at the top of your library view.",
				control: {
					type: "text",
					key: "libraryTitle",
					placeholder: "Library",
				},
			},
			{
				name: "Card size",
				desc: "Size of book covers in the library grid.",
				control: {
					type: "dropdown",
					key: "cardSize",
					options: { small: "Small", medium: "Medium", large: "Large" },
				},
			},
			{
				name: "Open library on startup",
				desc: "Automatically open your library when Obsidian starts.",
				control: {
					type: "toggle",
					key: "openOnStartup",
				},
			},
			{
				type: "group",
				heading: "Book notes",
				items: [
					{
						name: "Book folder",
						desc: "Every note in this folder (and its subfolders) is a book. Leave empty to only add books by hand.",
						control: { type: "text", key: "sourceFolder", placeholder: "e.g. Libri" },
					},
					{
						name: "Author property",
						desc: "Links like [[Alessandro Robecchi]] are shown as plain names.",
						control: { type: "text", key: "propAuthor", placeholder: "Author" },
					},
					{
						name: "Cover properties",
						desc: "Comma-separated; the first one with an image or URL wins. Without one, the first image in the note is used.",
						control: { type: "text", key: "propCover", placeholder: "cover, banner, image" },
					},
					{
						name: "Status property",
						desc: "Overall status of the book. A date in a reader's property means that reader finished it; for the others, this status decides.",
						control: { type: "text", key: "propStatus", placeholder: "Status" },
					},
					{
						name: "Status values: finished",
						desc: "Comma-separated values that mean finished. The first one is written.",
						control: { type: "text", key: "statusCompleted", placeholder: "Letto" },
					},
					{
						name: "Status values: reading",
						control: { type: "text", key: "statusReading", placeholder: "In lettura" },
					},
					{
						name: "Status values: to read",
						control: { type: "text", key: "statusUnread", placeholder: "Da leggere" },
					},
				],
			},
			{
				type: "list",
				heading: "Readers",
				emptyState: "No readers yet. Add one to track who finished each book.",
				addItem: {
					name: "Add reader",
					action: () => {
						const n = this.plugin.settings.readers.length + 1;
						void this.plugin.addReader(`Reader ${n}`).then(() => this.update());
					},
				},
				onDelete: (index: number) => {
					const reader = this.plugin.settings.readers[index];
					if (!reader) return;
					void this.plugin.removeReader(reader.id).then(() => this.update());
				},
				items: this.plugin.settings.readers.map((reader) => ({
					name: reader.name,
					render: (setting: Setting) => {
						setting.setName("");
						setting.addText((text) =>
							text
								.setPlaceholder("Reader name")
								.setValue(reader.name)
								.onChange(async (value) => {
									const name = value.trim();
									if (!name) return;
									reader.name = name;
									await this.plugin.saveSettings();
									this.plugin.refreshViews();
									if (!reader.property) this.plugin.requestNoteSync();
								})
						);
						// Note property with this reader's finish date (defaults to the name).
						setting.addText((text) => {
							text
								.setPlaceholder(`Date property: ${reader.name}`)
								.setValue(reader.property ?? "")
								.onChange(async (value) => {
									reader.property = value.trim() || undefined;
									await this.plugin.saveSettings();
									this.plugin.requestNoteSync();
								});
							text.inputEl.setAttribute("aria-label", "Note property with this reader's finish date");
						});
					},
				})),
			},
			{
				type: "group",
				heading: "Backup",
				items: [
					{
						name: "Export library data",
						desc: "Save all your book entries as a JSON file in the vault.",
						render: (setting) => {
							setting.addButton((btn) =>
								btn.setButtonText("Export").onClick(() => {
									void this.exportLibrary();
								})
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Danger zone",
				items: [
					{
						name: "Clear all books",
						desc: "Remove every book from your library. This cannot be undone.",
						render: (setting) => {
							setting.addButton((btn) =>
								btn
									.setButtonText("Clear library")
									.setDestructive()
									.onClick(() => {
										new ConfirmModal(this.app, {
											title: "Clear library",
											message: "Remove all books from your library? This cannot be undone.",
											confirmText: "Clear library",
											onConfirm: async () => {
												this.plugin.settings.books = [];
												await this.plugin.saveSettings();
												this.plugin.refreshViews();
												new Notice("Library cleared");
											},
										}).open();
									})
							);
						},
					},
				],
			},
		];
	}

	/** Persist via the default behavior, then keep any open library view in sync. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		await super.setControlValue(key, value);
		this.plugin.refreshViews();
		if (NOTE_KEYS.includes(key)) this.plugin.requestNoteSync();
	}

	private async exportLibrary(): Promise<void> {
		const json = JSON.stringify(this.plugin.settings.books, null, 2);
		const path = `Ebook Library Backup ${new Date().toISOString().slice(0, 10)}.json`;
		try {
			await this.app.vault.create(path, json);
			new Notice(`Exported to "${path}"`);
		} catch (e) {
			new Notice(`Export failed: ${(e as Error).message}`);
		}
	}
}
