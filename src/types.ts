export type BookCategory =
	| "book"
	| "manga"
	| "magazine"
	| "comic"
	| "document"
	| "article"
	| "audiobook"
	| "other";

export type ReadingStatus = "unread" | "reading" | "completed";

export type CoverType = "vault" | "url" | "none";

/** "manual": added by hand. "note": a Markdown note in the book folder, kept in sync with its properties. */
export type BookSource = "manual" | "note";

export interface Book {
	id: string;
	source: BookSource;
	/** Vault-relative path to the underlying file this entry represents. */
	filePath: string;
	title: string;
	author: string;
	coverType: CoverType;
	/** Vault-relative path or external URL, depending on coverType. */
	cover: string;
	/** True when the cover currently comes from the note's properties. */
	coverFromNote?: boolean;
	/** The book was added by hand before it became note-backed; it goes back to manual if it leaves the folder. */
	addedManually?: boolean;
	description: string;
	tags: string[];
	category: BookCategory;
	/** Reading state of each reader (reader id -> state). Missing readers are "unread". */
	readerStates: Record<string, ReaderState>;
	/** 0-5, 0 = unrated */
	rating: number;
	dateAdded: number;
	dateModified: number;
	lastOpened: number | null;
	totalPages: number | null;
}

export interface ReaderState {
	status: ReadingStatus;
	/** 0-100 */
	progress: number;
	/** When the reader finished the book; null if unknown or not finished. */
	finishedAt: number | null;
}

export const DEFAULT_READER_STATE: ReaderState = { status: "unread", progress: 0, finishedAt: null };

export interface Reader {
	id: string;
	name: string;
	/** Note property holding the date this reader finished a book. Defaults to the reader's name. */
	property?: string;
}

export type NewBookInput = Omit<Book, "id" | "dateAdded" | "dateModified">;

export type SortKey = "title" | "author" | "dateAdded" | "lastOpened" | "progress" | "dateFinished";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | ReadingStatus;
export type CategoryFilter = "all" | BookCategory;
export type CardSize = "small" | "medium" | "large";

export interface EbookLibrarySettings {
	books: Book[];
	libraryTitle: string;
	cardSize: CardSize;
	sortKey: SortKey;
	sortDirection: SortDirection;
	openOnStartup: boolean;
	readers: Reader[];
	/** Folder whose Markdown notes are books ("" = off). */
	sourceFolder: string;
	propAuthor: string;
	/** Comma-separated: the first one that has a value is used. */
	propCover: string;
	propStatus: string;
	/** Comma-separated accepted values; the first one is written. */
	statusCompleted: string;
	statusReading: string;
	statusUnread: string;
}

export const DEFAULT_SETTINGS: EbookLibrarySettings = {
	books: [],
	libraryTitle: "Library",
	cardSize: "medium",
	sortKey: "dateAdded",
	sortDirection: "desc",
	openOnStartup: false,
	readers: [
		{ id: "reader-1", name: "Reader 1" },
		{ id: "reader-2", name: "Reader 2" },
	],
	sourceFolder: "",
	propAuthor: "Author",
	propCover: "cover, banner, image",
	propStatus: "Status",
	statusCompleted: "Letto",
	statusReading: "In corso, In lettura",
	statusUnread: "Da leggere",
};

export interface CategoryMeta {
	label: string;
	icon: string;
}

export const CATEGORY_META: Record<BookCategory, CategoryMeta> = {
	book: { label: "Book", icon: "book" },
	manga: { label: "Manga", icon: "book-open" },
	magazine: { label: "Magazine", icon: "newspaper" },
	comic: { label: "Comic", icon: "image" },
	document: { label: "Document", icon: "file-text" },
	article: { label: "Article", icon: "file" },
	audiobook: { label: "Audiobook", icon: "headphones" },
	other: { label: "Other", icon: "bookmark" },
};

export const CATEGORY_ORDER: BookCategory[] = [
	"book",
	"manga",
	"magazine",
	"comic",
	"document",
	"article",
	"audiobook",
	"other",
];

export const STATUS_META: Record<ReadingStatus, { label: string; icon: string }> = {
	unread: { label: "Unread", icon: "circle" },
	reading: { label: "Reading", icon: "book-open" },
	completed: { label: "Completed", icon: "check-circle" },
};
