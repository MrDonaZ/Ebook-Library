import { App, Notice, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type EbookLibraryPlugin from "../main";
import { ConfirmModal } from "../modals/ConfirmModal";

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
								})
						);
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
