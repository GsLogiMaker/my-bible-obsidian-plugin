import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	RequestUrlResponsePromise,
	Setting,
	TFile,
	TextAreaComponent,
	normalizePath,
	requestUrl,
} from 'obsidian';

import {
	ViewUpdate,
	PluginValue,
	EditorView,
	ViewPlugin,
  } from "@codemirror/view";
import { assert } from 'console';
import { wrap } from 'module';

import {E_CANCELED, Mutex, MutexInterface, Semaphore, SemaphoreInterface, withTimeout} from 'async-mutex';


// Remember to rename these classes and interfaces!

class ProceduralNotesSettings {
	translation: string;
	bible_folder: string;
	book_name_format: string;
	chapter_name_format: string;
	padded_order: boolean;
	padded_chapter: boolean;
	verse_body_format: string;
	chapter_body_format: string;
	store_locally: boolean;

	async set_translation(val:string, plugin:ProceduralNotes) {
		let has_translation = false;
		let translations = (await plugin.bible_api.get_translations());
		if (!(val in translations)) {
			for (let translation in translations) {
				this.translation = translation
			}
		} else {
			this.translation = val;
		}
	}
}

const DEFAULT_SETTINGS: ProceduralNotesSettings = {
	translation: "",
	bible_folder: "/Bible/",
	book_name_format: "{order} {book}",
	chapter_name_format: "{book} {chapter}",
	padded_order: true,
	padded_chapter: false,
	verse_body_format: "###### {verse}\n"
		+ "``` verse\n"
		+ "{book} {chapter}:{verse}\n"
		+ "```",
	chapter_body_format: "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]\n"
		+ "\n"
		+ "{verses}\n"
		+ "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]"
		+ "\n",
	store_locally: false,

	set_translation: async function (val: string, plugin: ProceduralNotes): Promise<void> {
		let has_translation = false;
		let translations = (await plugin.bible_api.get_translations());
		if (!(val in translations)) {
			this.translation = await plugin.bible_api.get_default_translation();
		} else {
			this.translation = val;
		}
	}
}

function httpGet(theUrl: string):Promise<string> {
	console.log(theUrl);
	return new Promise(async (ok, err) => {
		ok(await requestUrl(theUrl).text);
	});
}

function is_alpha(string:string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if ((char > 64 && char < 91) || (char > 96 && char < 123)) {
			// Character is a capital or lowercase letter, continue
			continue;
		}
		// Character is not a capital or lowercase letter, return false
		return false;
	}
	// All characters were uppercase or lowercase letters, return true
	return true;
}

function is_alphanumeric(string:string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if ((char > 64 && char < 91) || (char > 96 && char < 123) || (char > 47 && char < 58)) {
			// Character is a capital or lowercase letter, continue
			continue;
		}
		// Character is not a capital or lowercase letter, return false
		return false;
	}
	// All characters were uppercase or lowercase letters, return true
	return true;
}

function is_numeric(string:string): boolean {
	for (let char_str of string) {
		let char = char_str.charCodeAt(0);
		if (char > 47 && char < 58) {
			// Character is a number, continue
			continue;
		}
		// Character is not number, return false
		return false;
	}
	// All characters were numbers, return true
	return true;
}



export default class ProceduralNotes extends Plugin {
	bible_api: BibleAPI;
	settings: ProceduralNotesSettings;

	async onload() {
		await this.loadSettings();

		this.bible_api = new BollsLifeBibleAPI();
		this.bible_api.plugin = this;

		await this.settings.set_translation(this.settings.translation, this);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create_bible_files',
			name: 'Build Bible',
			callback: async () => {
				let bible_path = normalizePath(this.settings.bible_folder);
				this.app.vault.adapter.mkdir(bible_path);
				let folders_and_files = await this.app.vault.adapter.list(bible_path);
				if (folders_and_files.files.length+folders_and_files.folders.length != 0) {
					new ClearOldBibleFilesModal(this.app, this).open();
				} else {
					await this.build_bible(bible_path);
					new Notice("Bible build completed!");
				}
			}
		});

		this.addCommand({
			id: 'clear_cache',
			name: 'Clear Cache',
			callback: async () => {
				new ClearCacheFilesModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'download_bible',
			name: 'Download Translation',
			callback: async () => {
				// TODO: Open a dialogue to confirm downloading an entire bible
				new DownloadBibleModal(
					this.app,
					this,
				).open();
			}
		});
		
		this.registerMarkdownCodeBlockProcessor("verse", async (source, element, context) => {
			const ref = source.replace(/[:-]/g, " ").split(" ");

			let book = "";
			let chapter = -1;
			let verse = -1;
			let verse_end = -1;
			let maybe_translation:string|null = null;
			let i = 0;

			while (i != ref.length) {
				// Compose book name
				if (i == 0) {
					// Always add first item, no matter what it is
					book += ref[i];
				} else {
					// Only add items that are words, and not numbers
					if (!is_alpha(ref[i])) {
						break;
					}
					book += " " + ref[i]
				}

				i += 1;
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose chapter
				chapter = Number(ref[i]);
				i += 1;
			}

			if (i != ref.length && is_numeric(ref[i])) {
				// Compose verse
				verse = Number(ref[i]);
				i += 1;
			}

			console.log(ref[i]);
			if (i != ref.length && is_numeric(ref[i])) {
				// Compose range
				verse_end = Number(ref[i]);
				i += 1;
				console.log(ref[i]);
			}

			if (i != ref.length && is_alphanumeric(ref[i])) {
				// Compose translation
				maybe_translation = ref[i];
				i += 1;
			}

			let translation = maybe_translation || this.settings.translation;

			if (book.length === 0) {
				element.createSpan({
					text: "[Book and chapter must be provided]",
				});
			} else if (chapter === -1) {
				element.createSpan({
					text: "[Chapter must be provided]",
				});
			} else if (verse === -1) {
				let verses = await this.bible_api.get_chapter_cached(
					translation,
					book,
					chapter,
				);
				let text = "";
				for (let verse_i of verses.keys()) {
					let verse = verses[verse_i];
					text += ""+(verse_i+1)+" "+verse;
					if (verse_i != verses.length-1) {
						text += "\n";
					}
				}
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{2}', chapter {0}]"
						.format(String(chapter), book, translation)
				}
				element.createSpan({
					text: text,
				});
			} else if (verse_end < verse) {
				let text = await this.bible_api.get_verse(
					translation,
					book,
					chapter,
					verse,
				);
				console.log(text);
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{3}', chapter {0}, verse {2}]"
						.format(String(chapter), book, String(verse), translation)
				}
				element.createSpan({
					text: text,
				});
			} else {
				let verses = await this.bible_api.get_chapter_cached(
					translation,
					book,
					chapter,
				);
				let text = "";
				let j = verse;
				while (j < verse_end+1 && j < verses.length) {
					text += "" + j + " " + verses[j-1];
					if (j != verse_end) {
						text += "\n";
					}
					j += 1;
				}
				if (text.length === 0) {
					text = "[Could not find text for the book '{1}', translation '{4}', chapter {0}, verses {2}-{3}]"
						.format(String(chapter), book, String(verse), String(verse_end), translation)
				}
				element.createSpan({
					text: text,
				});
			}
			
		  });


		  this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {

	}

	async build_bible(bible_path:string) {
		// TODO: Build bibles according to translation in settings
		let books = await this.bible_api.get_books("YLT");

		for (let book_meta of books) {
			// Loop over books
			let book_id = book_meta.order;

			// Book path
			let book_path = bible_path;
			if (this.settings.book_name_format.length != 0) {
				book_path += "/" + this.format_book_name(book_meta.name, book_meta.order);
				this.app.vault.adapter.mkdir(normalizePath(book_path));
			}

			for (const chapter_i of Array(book_meta.chapters).keys()) {
				
				// Wrap last and next chapter indecies
				var last_chapter = chapter_i; // Don't need to subtract, because chapter index is already -1 the current chapter
				if (last_chapter < 1) last_chapter += book_meta.chapters;
				var next_chapter = chapter_i+2;
				if (next_chapter > book_meta.chapters) next_chapter -= book_meta.chapters;

				// Assemble verses
				let verses = "";
				for (let verse_i of Array(VERSE_COUNTS[book_meta.name][chapter_i]).keys()) {
					verses += this.format_verse_body(
						book_meta.name,
						book_meta.order,
						chapter_i+1,
						last_chapter,
						next_chapter,
						verse_i+1,
					);
					if (verse_i+1 != VERSE_COUNTS[book_meta.name][chapter_i]) {
						verses += "\n";
					}
				}
				
				// Chapter name
				let chapter_note_name = this.format_chapter_name(
					book_meta.name,
					book_meta.order,
					chapter_i+1,
				);

				// Chapter body
				let note_body = this.format_chapter_body(
					book_meta.name,
					book_meta.order,
					chapter_i+1,
					last_chapter,
					next_chapter,
					verses,
				);

				// Save file
				let file_path = normalizePath(book_path+"/"+chapter_note_name+".md");
				let file = this.app.vault.getAbstractFileByPath(file_path);
				if (file instanceof TFile) {
					this.app.vault.modify(file, note_body);
				} else if (file === null) {
					this.app.vault.create(
						file_path,
						note_body,
					);
				}
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	format_book_name(book:string, order:number):string {
		return this.settings.book_name_format
			.replace(
				/{order}/g,
				String(order)
					.padStart(2*Number(this.settings.padded_order), "0")
			)
			.replace(/{book}/g, book)
	}

	format_chapter_body(book:string, order:Number, chapter:number, last_chapter:number, next_chapter:number, verses:string):string {
		return this.settings.chapter_body_format
			.replace(/{verses}/g, verses)
			.replace(/{book}/g, book)
			.replace(
				/{order}/g,
				String(order)
					.padStart(2*Number(this.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name(book, order, chapter))
			.replace(/{last_chapter}/g, String(last_chapter))
			.replace(/{last_chapter_name}/g, this.format_chapter_name(book, order, last_chapter))
			.replace(/{next_chapter}/g, String(next_chapter))
			.replace(/{next_chapter_name}/g, this.format_chapter_name(book, order, next_chapter));
	}

	format_chapter_name(book_name:string, order:Number, chapter:number):string {
		let format = this.settings.chapter_name_format;
		if (format.length == 0) {
			format = DEFAULT_SETTINGS.chapter_name_format;
		}
		let pad_by = 3;
		if (VERSE_COUNTS[book_name].length < 10) {
			pad_by = 1;
		} else if (VERSE_COUNTS[book_name].length < 100) {
			pad_by = 2;
		}
		return format
			.replace(/{book}/g, book_name)
			.replace(
				/{order}/g,
				String(order)
					.padStart(2*Number(this.settings.padded_order), "0")
			)
			.replace(
				/{chapter}/g,
				String(chapter)
					.padStart(pad_by*Number(this.settings.padded_chapter), "0",
				),
			);
	}

	format_verse_body(book:string, order:Number, chapter:number, last_chapter:number, next_chapter:number, verse:number):string {
		return this.settings.verse_body_format
			.replace(/{verse}/g, String(verse))
			.replace(/{book}/g, book)
			.replace(
				/{order}/g,
				String(order)
					.padStart(2*Number(this.settings.padded_order), "0")
			)
			.replace(/{chapter}/g, String(chapter))
			.replace(/{chapter_name}/g, this.format_chapter_name(book, order, chapter))
			.replace(/{last_chapter}/g, String(last_chapter))
			.replace(/{last_chapter_name}/g, this.format_chapter_name(book, order, last_chapter))
			.replace(/{next_chapter}/g, String(next_chapter))
			.replace(/{next_chapter_name}/g, this.format_chapter_name(book, order, next_chapter));
	}
}

interface BollsLifeBibleData {
	translation: string;
	books: Record<string, Array<BollsLifeChapterData>>;
}

interface BollsLifeBookData {
	order: number;
	chapters: number;
	name: string;
}

interface BollsLifeChapterCache {
	translation: String;
	book: String;
	chapter: Number;
	chapter_data: BollsLifeChapterData|null;
	mutex: Mutex;
}

type BollsLifeChapterData = Array<string>;

interface BollsLifeVerseData {
	pk: string,
	text: string,
	verse: number,
};

class BibleAPI {
	cache_clear_timer:Promise<null>|null = null;
	cache_clear_timer_promise_err:(reason?:any) => void;
	chapter_cache: Record<ChapterKey, BollsLifeChapterCache> = {};
	plugin: ProceduralNotes;
	
	async cache_chapter(
		translation:string,
		book:string,
		chapter:Number,
		chapter_data: BollsLifeChapterData|null,
		save_locally:boolean,
	): Promise<void> {
		let key = this.make_chapter_key(translation, book, chapter);
		this.chapter_cache[key] = {
			translation: translation,
			book: book,
			chapter: chapter,
			chapter_data: chapter_data,
			mutex: new Mutex,
		};

		// Save chapter to local file sytem
		if (save_locally) {
			let cache_path = this.get_cache_path();
			this.plugin.app.vault.adapter.mkdir(cache_path);
			let cached_file_name = "{0} {1} {2}.txt"
				.format(translation, book, String(chapter));
			let cached_file_path = normalizePath(
				cache_path + "/" + cached_file_name,
			);
			if (
				chapter_data != null
				&& !await this.plugin.app.vault.adapter.exists(cached_file_path)
			) {
				await this.plugin.app.vault.adapter.write(
					cached_file_path,
					JSON.stringify(chapter_data),
				);
			}
		}

		// Start/refresh cache clear timer
		if (this.cache_clear_timer !== null && this.cache_clear_timer_promise_err !== null) {
			// Clear out old promise
			this.cache_clear_timer_promise_err(null);
		}
		this.cache_clear_timer = new Promise((ok, err) => {
			this.cache_clear_timer_promise_err = err;
			setTimeout(ok, 60000*60) // Timeout after 1 hour
		});
		this.cache_clear_timer
			.then(() => this.clear_cache())
			.catch(err => {});
	}

	async clear_cache() {
		this.chapter_cache = {};
		this.cache_clear_timer = null;

		let cache_path = this.get_cache_path();
		if (await this.plugin.app.vault.adapter.exists(cache_path)) {
			if (!await this.plugin.app.vault.adapter.trashSystem(cache_path)) {
				await this.plugin.app.vault.adapter.trashLocal(cache_path);
			}
		}
	}


	async get_bible(translation:string): Promise<BollsLifeBibleData> {
		throw new Error("unimplemented")
	}

	get_books(translation:string,): Promise<Array<BollsLifeBookData>> {
		throw new Error("unimplemented")
	}

	get_cache_path(): string {
		return normalizePath(this.plugin.manifest.dir + "/.mybiblecache");
	}

	async get_chapter_cached(
		translation:string,
		book:string,
		chapter:Number,
	): Promise<BollsLifeChapterData> {
		let chapter_key = this.make_chapter_key(translation, book, chapter);

		if (!(chapter_key in this.chapter_cache)) {
			this.cache_chapter(
				translation,
				book,
				chapter,
				null,
				false,
			);
		}

		var cached = this.chapter_cache[chapter_key];

		if (cached.chapter_data === null) {
			await cached.mutex
				.acquire()
				.then(async () => {
					if (this.plugin.settings.store_locally) {
						// Attempt to load chapter locally
						let cached_file_name = "{0} {1} {2}.txt"
							.format(translation, book, String(chapter));
						let cache_path = this.get_cache_path();
						this.plugin.app.vault.adapter.mkdir(cache_path);
						let cached_file_path = normalizePath(
							cache_path + "/" + cached_file_name
						);
						if (
							await this.plugin.app.vault.adapter
								.exists(cached_file_path)
						) {
							cached.chapter_data = JSON.parse(
								await this.plugin.app.vault.adapter
									.read(cached_file_path)
							);
							console.log("LOADED", cached_file_path);
						}
					}

					if (cached.chapter_data === null) {
						// Fetch chapter from the web
						cached.chapter_data = await this.get_chapter_uncached(
							translation,
							book,
							chapter,
						);
					}

					cached.mutex.cancel();
					cached.mutex.release();
				})
				.catch(err => {
					if (err === E_CANCELED) {
	
					} else {
						throw new Error(err)
					}
				});
		}

		if (cached.chapter_data === null || cached.chapter_data.length == 0) {
			return [];
		}

		await this.cache_chapter(
			translation,
			book,
			chapter,
			cached.chapter_data,
			this.plugin.settings.store_locally,
		);

		return cached.chapter_data;
	}

	async get_chapter_uncached(
		translation:string,
		book:string,
		chapter:Number,
	): Promise<BollsLifeChapterData> {
		throw new Error("unimplemented")
	}

	async get_default_translation(): Promise<string> {
		throw new Error("unimplemented")
	}

	get_translations(): Promise<Translations> {
		throw new Error("unimplemented")
	}

	get_verse(
		translation:string,
		book:string,
		chapter:Number,
		verse:number,
	): Promise<string> {
		throw new Error("unimplemented")
	}

	make_chapter_key(translation:string, book:string, chapter:Number) {
		return "{0}.{1}.{2}".format(translation, book, String(chapter));
	}
}

type ChapterKey = string;

type Translations = Record<string, Translation>;
interface Translation {
	display_name: string,
	abbreviated_name: string,
	language: string,
}


class BollsLifeBibleAPI extends BibleAPI {
	plugin: ProceduralNotes;
	chapter_cache: Record<ChapterKey, BollsLifeChapterCache> = {};
	translations: Translations = {};
	translation_maps: Record<string, Array<BollsLifeBookData>> = {};
	cache_clear_timer:Promise<null>|null = null;

	_chapter_key(translation:string, book:string, chapter:Number) {
		return "{0}.{1}.{2}".format(translation, book, String(chapter));
	}

	async _generate_translation_map(translation:string) {
		let map:Array<Record<string, any>> = JSON.parse(await httpGet(
			"https://bolls.life/get-books/{0}/".format(translation
		)));
		let book_data:Array<BollsLifeBookData> = [];
		for (let item of map) {
			book_data.push({
				name: item["name"],
				chapters: item["chapters"],
				order: item["bookid"],
			});
		}
		this.translation_maps[translation] = book_data;
	}
	
	async _book_to_id(translation: string, book: string): Promise<number> {
		let book_ = book.toLocaleLowerCase();
		let map = await this._get_translation_map("YLT"); // TODO: Make translation according to user settings
		for (let i in map) {
			let book_data = map[i];
			if (book_ == book_data["name"].toLocaleLowerCase()) {
				return Number(i)+1;
			}
		}
		throw new Error('No book exists by name {0}.'.format(book));
	}

	async _id_to_book(translation:string, book_id: number): Promise<string> {
		let map = await this._get_translation_map("YLT"); // TODO: Make translation according to user settings
		return map[book_id-1]["name"];
	}

	async get_chapter_uncached(
		translation:string,
		book:string,
		chapter:Number,
	): Promise<BollsLifeChapterData> {
		// Fetch chapter from the web
		try {
			let book_id = await this._book_to_id(translation, book);

			let chapter_data = JSON.parse(await httpGet(
				"https://bolls.life/get-chapter/{0}/{1}/{2}/"
					.format(translation, String(book_id), String(chapter))
			)).map((x:BollsLifeVerseData) => x.text);
	
			return chapter_data;
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("No book exists by name")) {
				console.log(
					"Failed to find chapter {0} in translation {1}, returning empty."
						.format(book, translation)
				)
				return [];
			}
			throw e;
		}
	}

	async _get_translation_map(translation:string): Promise<Array<BollsLifeBookData>> {
		if (!(translation in this.translation_maps)) {
			await this._generate_translation_map(translation);
		}
		return this.translation_maps[translation];
	}

	async get_bible(translation:string): Promise<BollsLifeBibleData> {
		let verses = JSON.parse(
			await httpGet(
				"https://bolls.life/static/translations/{0}.json".format(translation)
			)
		);

		let bible:BollsLifeBibleData = {
			translation: translation,
			books: {},
		};

		await new Promise(async (ok, err) => {
			let i = 0;
			let curr_book = "";
			let curr_book_id = -1;
			let curr_chapter = -1;
			while (i != verses.length) {
				let verse_json = verses[i];
				if (curr_book_id != verse_json["book"]) {
					curr_book_id = verse_json["book"]
					curr_book = await this
						._id_to_book(translation, verse_json["book"]);
					bible.books[curr_book] = [];
					curr_chapter = -1
				}
				if (curr_chapter != verse_json["chapter"]) {
					curr_chapter = verse_json["chapter"];
					let book_data = bible.books[curr_book];
					book_data.push([]);
				}
				bible.books[curr_book][curr_chapter-1].push(verse_json["text"]);
				i += 1;
			}
			ok(null);
		})

		return bible;
	}

	async get_books(translation: string): Promise<BollsLifeBookData[]> {
		return await this._get_translation_map(translation);
	}

	async get_default_translation(): Promise<string> {
		return "YLT";
	}

	async get_translations(): Promise<Translations> {
		if (Object.keys(this.translations).length === 0) {
			let list = JSON.parse(await httpGet(
				"https://bolls.life/static/bolls/app/views/languages.json"
			));
			for (let language of list) {
				for (let item of language["translations"]) {
					if (item["short_name"] in this.translations) {
						throw new Error("Translation already added to map");
					}
					this.translations[item["short_name"]] = {
						abbreviated_name: item["short_name"],
						display_name: item["full_name"],
						language: language["language"],
					};
				}
			}
		}
		return this.translations;
	}

	async get_verse(
		translation:string,
		book:string,
		chapter:Number,
		verse:number,
	): Promise<string> {
		let chapter_data = await this.get_chapter_cached(
			translation,
			book,
			chapter,
		);
		
		return chapter_data[verse-1] || "";
	}
}

class ClearCacheFilesModal extends Modal {
	plugin: ProceduralNotes;

	constructor(app: App, plugin:ProceduralNotes) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		
		let bible_path = this.plugin.settings.bible_folder;
		
		contentEl.createEl("h1", { text: "Clear Cache?" });
		contentEl.createEl("span", {
			text: "You are about to clear out all cached chapters from your file system. This includes translations you manually downloaded."
				.format(bible_path)
		});
		contentEl.createEl("p", {
			text: "Do you want to clear the cache?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
				.setButtonText("Cancel")
				.onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn
				.setButtonText("Clear Cache")
				.setCta()
				.onClick(async () => {
					this.close();
					await this.plugin.bible_api.clear_cache();
					new Notice("Cache cleared!");
				})
			);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ClearOldBibleFilesModal extends Modal {
	plugin: ProceduralNotes;

	constructor(app: App, plugin:ProceduralNotes) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		
		let bible_path = this.plugin.settings.bible_folder;
		
		contentEl.createEl("h1", { text: "Bible Folder is Not Empty" });
		contentEl.createEl("span", {
			text: "The Bible folder in your settings is not empty. If you built a Bible in this folder before the new bible may be interlaced with the old one."
				.format(bible_path)
		});
		contentEl.createEl("p", {
			text: "Do you want to clear the folder before building your Bible?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
				.setButtonText("Cancel")
				.onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn
				.setButtonText("Build Without Clearing")
				.setCta()
				.onClick(async () => {
					this.close();
					await this.plugin.build_bible(bible_path);
					new Notice("Bible build completed!");
				})
			)
			.addButton((btn) =>
				btn
				.setButtonText("Clear and Build")
				.setCta()
				.onClick(async () => {
					this.close();
					let list = await this.app.vault.adapter.list(bible_path);
					for (let path of list.files) {
						let abstract = this.app.vault.getAbstractFileByPath(
							path,
						);
						if (abstract != null) {
							await this.app.vault.delete(abstract, true);
						}
					}
					for (let path of list.folders) {
						let abstract = this.app.vault.getAbstractFileByPath(
							path,
						);
						if (abstract != null) {
							await this.app.vault.delete(abstract, true);
						}
					}
					await this.plugin.build_bible(bible_path);
					new Notice("Bible build completed!");
				})
			);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	async downloadBible(translation:string) {
		let bible = await this.plugin.bible_api.get_bible(translation);
		for (let book_name in bible.books) {
			for (let chapter of Array(bible.books[book_name].length).keys()) {
				await this.plugin.bible_api.cache_chapter(
					translation,
					book_name,
					chapter+1,
					bible.books[book_name][chapter],
					true,
				);
			}
		}

		new Notice(
			'Completed download of {0} bible!'
				.format(translation)
		);
	}
}

class DownloadBibleModal extends Modal {
	plugin: ProceduralNotes;

	constructor(app: App, plugin:ProceduralNotes) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		
		let translation = this.plugin.settings.translation;
		
		contentEl.createEl("h1", { text: "Download Bible?" });
		contentEl.createEl("span", {
			text: "You are about to download the entire {0} version of the Bible, according to your settings."
				.format(translation)
		});
		contentEl.createEl("p", {
			text: "Do you want to continue?"
		});
		contentEl.createEl("p", {});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
				.setButtonText("Cancel")
				.onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn
				.setButtonText("Download")
				.setCta()
				.onClick(() => {
					this.close();
					this.downloadBible(translation);
				})
			);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	async downloadBible(translation:string) {
		let bible = await this.plugin.bible_api.get_bible(translation);
		for (let book_name in bible.books) {
			for (let chapter of Array(bible.books[book_name].length).keys()) {
				await this.plugin.bible_api.cache_chapter(
					translation,
					book_name,
					chapter+1,
					bible.books[book_name][chapter],
					true,
				);
			}
		}

		new Notice(
			'Completed download of {0} bible!'
				.format(translation)
		);
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: ProceduralNotes;

	constructor(app: App, plugin: ProceduralNotes) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		


		new Setting(containerEl)
			.setName('Translation')
			.setDesc('The version of the Bible to display.')
			.addDropdown(async drop => {
				let translations = await this.plugin.bible_api.get_translations();
				for (const key in translations) {
					drop.addOption(
						key,
						"{0} - {1} - {2}".format(
							translations[key].language,
							key,
							translations[key].display_name,
						)
					);
				}
				drop.onChange(async value => {
					this.plugin.settings.translation = value;
					await this.plugin.saveSettings();
				})
				drop.setValue(DEFAULT_SETTINGS.translation);
			});
		
		new Setting(containerEl)
			.setHeading()
			.setName("Data")

		new Setting(containerEl)
			.setName('Save Bible Locally')
			.setDesc('When ON, caches viewed chapters on the local file system, so that they can be accessed without an internet connection.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.store_locally)
				.onChange(async (value) => {
					this.plugin.settings.store_locally = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setHeading()
			.setName("Formatting")

		new Setting(containerEl)
			.setName('Bible Folder')
			.setDesc('A path to the folder where all the files for the bible will be placed. If the path does not exist it will be created.')
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.bible_folder)
				.setValue(this.plugin.settings.bible_folder)
				.onChange(async (value) => {
					this.plugin.settings.bible_folder = value;
					await this.plugin.saveSettings();
				})
			);
		
		new Setting(containerEl)
			.setName('Book Name Format')
			.setDesc('Formatting for the names of the folders of each book of the bible. For example, "{order} {name}" would become "2 Exodus". Leave blank to not have folders for each book.')
			.addText(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.book_name_format)
				.setValue(this.plugin.settings.book_name_format)
				.onChange(async (value) => {
					this.plugin.settings.book_name_format = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Chapter Name Format')
			.setDesc('Formatting for the names of the notes of each chapter of a book. For example, "{book} {chapter}" would become "Psalms 23.md".')
			.addText(text => text
				.setPlaceholder(this.plugin.settings.chapter_name_format)
				.setValue(this.plugin.settings.chapter_name_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_name_format = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Padded Bible Order Numbers')
			.setDesc('When ON, changes "{order}" in the names of book folders to be padded with extra zeros. For example, "1 Genesis" would become "01 Gensis" when turned ON.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.padded_order)
				.onChange(async (value) => {
					this.plugin.settings.padded_order = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Padded Chapter Numbers')
			.setDesc('When ON, changes "{chapter}" (and related) in the names of chapters to be padded with extra zeros. For example, "Psalms 5" would become "Psalms 005" when turned ON.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.padded_chapter)
				.onChange(async (value) => {
					this.plugin.settings.padded_chapter = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Verse Body Format')
			.setDesc('Formatting for the body of verses in chapters.')
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.verse_body_format)
				.setValue(this.plugin.settings.verse_body_format)
				.onChange(async (value) => {
					this.plugin.settings.verse_body_format = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Chapter Body Format')
			.setDesc('Formatting for the body of chapter notes.')
			.addTextArea(text => text
				.setPlaceholder("Example: " + DEFAULT_SETTINGS.chapter_body_format)
				.setValue(this.plugin.settings.chapter_body_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_body_format = value;
					await this.plugin.saveSettings();
				}))
		
		
	}
}

const VERSE_COUNTS:Record<string, Array<Number>> = {
	"Genesis":[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
	"Exodus":[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
	"Leviticus":[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
	"Numbers":[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
	"Deuteronomy":[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
	"Joshua":[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
	"Judges":[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
	"Ruth":[22,23,18,22],
	"1 Samuel":[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
	"2 Samuel":[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
	"1 Kings":[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
	"2 Kings":[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
	"1 Chronicles":[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
	"2 Chronicles":[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
	"Ezra":[11,70,13,24,17,22,28,36,15,44],
	"Nehemiah":[11,20,32,23,19,19,73,18,38,39,36,47,31],
	"Esther":[22,23,15,17,14,14,10,17,32,3],
	"Job":[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
	"Psalm":[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
	"Proverbs":[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
	"Ecclesiastes":[18,26,22,16,20,12,29,17,18,20,10,14],
	"Song of Solomon":[17,17,11,16,16,13,13,14],
	"Isaiah":[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
	"Jeremiah":[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
	"Lamentations":[22,22,66,22,22],
	"Ezekiel":[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
	"Daniel":[21,49,30,37,31,28,28,27,27,21,45,13],
	"Hosea":[11,23,5,19,15,11,16,14,17,15,12,14,16,9],
	"Joel":[20,32,21],
	"Amos":[15,16,15,13,27,14,17,14,15],
	"Obadiah":[21],
	"Jonah":[17,10,10,11],
	"Micah":[16,13,12,13,15,16,20],
	"Nahum":[15,13,19],
	"Habakkuk":[17,20,19],
	"Zephaniah":[18,15,20],
	"Haggai":[15,23],
	"Zechariah":[21,13,10,14,11,15,14,23,17,12,17,14,9,21],
	"Malachi":[14,17,18,6],
	"Matthew":[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
	"Mark":[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
	"Luke":[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
	"John":[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
	"Acts":[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
	"Romans":[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],
	"1 Corinthians":[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
	"2 Corinthians":[24,17,18,18,21,18,16,24,15,18,33,21,14],
	"Galatians":[24,21,29,31,26,18],
	"Ephesians":[23,22,21,32,33,24],
	"Philippians":[30,30,21,23],
	"Colossians":[29,23,25,18],
	"1 Thessalonians":[10,20,13,18,28],
	"2 Thessalonians":[12,17,18],
	"1 Timothy":[20,15,16,16,25,21],
	"2 Timothy":[18,26,17,22],
	"Titus":[16,15,15],
	"Philemon":[25],
	"Hebrews":[14,18,19,16,14,20,28,13,28,39,40,29,25],
	"James":[27,26,18,17,20],
	"1 Peter":[25,25,22,19,14],
	"2 Peter":[21,22,18],
	"1 John":[10,29,24,21,21],
	"2 John":[13],
	"3 John":[14],
	"Jude":[25],
	"Revelation":[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]
};