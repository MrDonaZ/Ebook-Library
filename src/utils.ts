import type { ReaderState, ReadingStatus } from "./types";

export function generateId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getBasename(path: string): string {
	const parts = path.split("/");
	const last = parts[parts.length - 1] ?? path;
	const dot = last.lastIndexOf(".");
	return dot > 0 ? last.slice(0, dot) : last;
}

export function getExtension(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

/** Deterministically maps a string to a hue (0-359) so covers get a stable color. */
export function stringToHue(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
		hash |= 0;
	}
	return Math.abs(hash) % 360;
}

export function placeholderGradient(seed: string): string {
	const hue = stringToHue(seed || "book");
	const hue2 = (hue + 38) % 360;
	return `linear-gradient(150deg, hsl(${hue}, 62%, 46%), hsl(${hue2}, 58%, 26%))`;
}

export function formatRelativeDate(timestamp: number | null): string {
	if (!timestamp) return "Never opened";
	const diff = Date.now() - timestamp;
	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;
	if (diff < minute) return "Just now";
	if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
	if (diff < day) return `${Math.floor(diff / hour)}h ago`;
	if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Timestamp -> "YYYY-MM-DD" in local time, for <input type="date">. */
export function toDateInputValue(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> timestamp at local midnight, or null if invalid. */
export function fromDateInputValue(value: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return null;
	return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function debounce<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timer: number | undefined;
	return (...args: Parameters<T>) => {
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(() => fn(...args), delay);
	};
}

/** Builds the new state for a reader moving to `status`. */
export function nextReaderState(prev: ReaderState, status: ReadingStatus): ReaderState {
	switch (status) {
		case "unread":
			return { status, progress: 0, finishedAt: null };
		case "reading":
			return { status, progress: prev.status === "completed" ? 0 : prev.progress, finishedAt: null };
		case "completed":
			return {
				status,
				progress: 100,
				finishedAt: prev.status === "completed" && prev.finishedAt ? prev.finishedAt : Date.now(),
			};
	}
}
