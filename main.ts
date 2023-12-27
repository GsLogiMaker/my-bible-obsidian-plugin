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

interface ProceduralNotesSettings {
	translation: string;
	bible_folder: string;
	book_name_format: string;
	chapter_name_format: string;
	padded_order: boolean;
	padded_chapter: boolean;
	verse_body_format: string;
	chapter_body_format: string;
	store_locally: boolean;
}

const DEFAULT_SETTINGS: ProceduralNotesSettings = {
	translation: "BBE",
	bible_folder: "/Bible/",
	book_name_format: "{order} {book}",
	chapter_name_format: "{book} {chapter}",
	padded_order: false,
	padded_chapter: false,
	verse_body_format: "###### {verse}\n"
		+ "``` verse\n"
		+ "{book} {chapter}:{verse}"
		+ "```",
	chapter_body_format: "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]\n"
		+ "\n"
		+ "{verses}\n"
		+ "\n"
		+ "###### [[{last_chapter_name}]] | [[{book}]] | [[{next_chapter_name}]]"
		+ "\n",
	store_locally: false,
	
}

function httpGet(theUrl: string):Promise<string> {
	console.log(theUrl);
	return new Promise(async (ok, err) => {
		ok(await requestUrl(theUrl).text);
	});
}




export default class ProceduralNotes extends Plugin {
	bible_api: BibleAPI;
	settings: ProceduralNotesSettings;

	async onload() {
		await this.loadSettings();

		this.bible_api = new BollsLifeBibleAPI();
		this.bible_api.plugin = this;
		let translation_data = await this.bible_api
			.get_books(this.settings.translation);
		
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'create_bible_files',
			name: 'Generate Bible',
			callback: async () => {
				// Bible path
				let bible_path = normalizePath(this.settings.bible_folder);
				this.app.vault.adapter.mkdir(bible_path);

				for (let book_meta of translation_data) {
					// Loop over books
					let book_id = book_meta["bookid"];

					// Book path
					let book_path = bible_path;
					if (this.settings.book_name_format.length != 0) {
						book_path += "/" + this.format_book_name(book_meta["name"], book_meta["bookid"]);
						this.app.vault.adapter.mkdir(normalizePath(book_path));
					}

					for (const chapter_i of Array(book_meta["chapters"]).keys()) {
						
						// Wrap last and next chapter indecies
						var last_chapter = chapter_i; // Don't need to subtract, because chapter index is already -1 the current chapter
						if (last_chapter < 1) last_chapter += book_meta["chapters"];
						var next_chapter = chapter_i+2;
						if (next_chapter > book_meta["chapters"]) next_chapter -= book_meta["chapters"];

						console.log(book_meta["name"], chapter_i);

						// Assemble verses
						let verses = "";
						for (let verse_i of Array(VERSE_COUNTS[book_meta["name"]][chapter_i]).keys()) {
							verses += this.format_verse_body(
								book_meta["name"],
								book_meta["bookid"],
								chapter_i+1,
								last_chapter,
								next_chapter,
								verse_i+1,
							);
							if (verse_i+1 != VERSE_COUNTS[book_meta["name"]][chapter_i]) {
								verses += "\n";
							}
						}
						
						// Chapter name
						let chapter_note_name = this.format_chapter_name(
							book_meta["name"],
							book_meta["bookid"],
							chapter_i+1,
						);

						// Chapter body
						let note_body = this.format_chapter_body(
							book_meta["name"],
							book_meta["bookid"],
							chapter_i+1,
							last_chapter,
							next_chapter,
							verses,
						);

						// Save file
						let file = this.app.vault.getAbstractFileByPath(
							book_path+"/"+chapter_note_name+".md"
						);
						if (file instanceof TFile) {
							await this.app.vault.modify(file, note_body);
						} else if (file === null) {
							this.app.vault.create(
								book_path+"/"+chapter_note_name+".md",
								note_body,
							);
						}
					}
				}
			}
		});

		this.addCommand({
			id: 'clear_cache',
			name: 'Clear Local Cache',
			callback: async () => {
				this.bible_api.clear_cache();
			}
		});
		
		this.registerMarkdownCodeBlockProcessor("verse", async (source, element, context) => {
			const ref = source.replace(":", " ").split(" ");
			const verse_body = element.createSpan({
				text: await this.bible_api.get_verse(
					this.settings.translation,
					ref[0],
					Number(ref[1]),
					Number(ref[2]),
				),
			});
		  });


		  this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {

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

interface BollsLifeBookData {
	bookid: number;
	chapters: number;
	chronorder: number;
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

interface BibleAPI {
	plugin: ProceduralNotes;

	clear_cache(): void;

	get_books(translation:string,): Promise<Array<BollsLifeBookData>>;

	get_translations(): Promise<Translations>;

	get_verse(
		translation:string,
		book:string,
		chapter:Number,
		verse:number,
	): Promise<string>;
}

type ChapterKey = string;

type Translations = Record<string, Translation>;
interface Translation {
	display_name: string,
	abbreviated_name: string,
	language: string,
}


const CHAPTER_CACHE_SIZE = 25;
class BollsLifeBibleAPI implements BibleAPI {
	plugin: ProceduralNotes;
	chapter_cache: Record<ChapterKey, BollsLifeChapterCache> = {};
	translations: Translations = {};
	translation_map: Array<BollsLifeBookData> = [];
	_cache_clear_timer:Promise<null>|null = null;

	_chapter_key(translation:string, book:string, chapter:Number) {
		return "{0}.{1}.{2}".format(translation, book, String(chapter));
	}

	async _generate_translation_map(translation:string) {
		this.translation_map = JSON.parse(await httpGet(
			"https://bolls.life/get-books/{0}/".format(translation
		)));
	}
	
	async _book_to_id(translation: string, book: string): Promise<number> {
		let book_ = book.toLocaleLowerCase();
		let map = await this._get_translation_map(translation);
		for (let i in map) {
			let book_data = map[i];
			if (book_ == book_data["name"].toLocaleLowerCase()) {
				return Number(i)+1;
			}
		}
		throw new Error('No chapter exists by name {0}.'.format(book));
	}
	
	async _cache_chapter(translation:string, book:string, chapter:Number, bolls_chapter_data: BollsLifeChapterData|null) {
		let key = this._chapter_key(translation, book, chapter);
		this.chapter_cache[key] = {
			translation: translation,
			book: book,
			chapter: chapter,
			chapter_data: bolls_chapter_data,
			mutex: new Mutex,
		};

		if (this._cache_clear_timer === null) {
			// Start cache clear timer
			this._cache_clear_timer = new Promise((ok, err) => {
				setTimeout(ok, 60000*60*24) // Timeout after 24 hours
			});

			await this._cache_clear_timer;
			this.clear_cache();
		}
	}

	async _get_chapter_cached(translation:string, book:string, chapter:Number): Promise<BollsLifeChapterData> {
		let book_id = await this._book_to_id(translation, book);
		let chapter_key = this._chapter_key(translation, book, chapter);

		if (!(chapter_key in this.chapter_cache)) {
			this._cache_chapter(translation, book, chapter, null);
		}

		var cached = this.chapter_cache[chapter_key];

		if (cached.chapter_data === null && this.plugin.settings.store_locally) {
			
		}


		if (cached.chapter_data === null) {
			// Fetch chapter from the web
			await cached.mutex
				.acquire()
				.then(async () => {
					if (this.plugin.settings.store_locally) {
						// Attempt to load chapter locally
						let cached_file_name = "{0} {1} {2}.txt"
							.format(translation, book, String(chapter));
						let cached_file_path = normalizePath("/.mybiblecache/"+cached_file_name);
						this.plugin.app.vault.adapter.mkdir("/.mybiblecache");
						if (await this.plugin.app.vault.adapter.exists(cached_file_path)) {
							cached.chapter_data = JSON.parse(
								await this.plugin.app.vault.adapter.read(cached_file_path)
							);
							console.log("LOADED", cached_file_path);
						}
					}

					if (cached.chapter_data === null) {
						// Fetch chapter from endpoint
						cached.chapter_data = JSON.parse(await httpGet(
							"https://bolls.life/get-chapter/{0}/{1}/{2}/"
								.format(translation, String(book_id), String(chapter))
						)).map((x:BollsLifeVerseData) => x.text);

						if (this.plugin.settings.store_locally) {
							// Save chapter locally
							let cached_file_name = "{0} {1} {2}.txt"
								.format(translation, book, String(chapter));
							let cached_file_path = "/.mybiblecache/"+cached_file_name;
							this.plugin.app.vault.adapter.mkdir(".mybiblecache");
							await this.plugin.app.vault.adapter.write(
								cached_file_path,
								JSON.stringify(cached.chapter_data),
							);
						}
					}

					cached.mutex.cancel();
					cached.mutex.release();
				})
				.catch(err => {
					if (err === E_CANCELED) {
	
					}
				});
		}

		if (cached.chapter_data === null || cached.chapter_data.length == 0) {
			throw new Error('Chapter data is null.');
		}

		return cached.chapter_data;
	}

	async _get_translation_map(translation:string): Promise<Array<BollsLifeBookData>> {
		if (this.translation_map.length == 0) {
			this.translation_map = JSON.parse(await httpGet(
				"https://bolls.life/get-books/{0}/".format(translation)
			));
		}
		return this.translation_map;
	}

	async clear_cache() {
		this.chapter_cache = {};
		this._cache_clear_timer = null;
		if (this.plugin.app.vault.getAbstractFileByPath("/.mybiblecache") !== null) {
			await this.plugin.app.vault.adapter.rmdir("/.mybiblecache", true);
		}
	}

	async get_books(translation: string): Promise<BollsLifeBookData[]> {
		if (this.translation_map.length == 0) {
			await this._generate_translation_map(translation);
		}
		return this.translation_map;
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
		let chapter_data = await this._get_chapter_cached(
			translation,
			book,
			chapter,
		);
		
		return chapter_data[verse-1];
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
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
						"{0} - {1} - {2}".format(translations[key].language, key, translations[key].display_name)
					);
				}
				drop.setValue(DEFAULT_SETTINGS.translation);
				drop.onChange(async value => {
					this.plugin.settings.translation = value;
					await this.plugin.saveSettings();
				})
			});

		new Setting(containerEl)
			.setName('Bible Folder')
			.setDesc('A path to the folder where all the files for the bible will be placed. If the path does not exist it will be created.')
			.addText(text => text
				.setPlaceholder("")
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
				.setPlaceholder("")
				.setValue(this.plugin.settings.book_name_format)
				.onChange(async (value) => {
					this.plugin.settings.book_name_format = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Chapter Name Format')
			.setDesc('Formatting for the names of the notes of each chapter of a book. For example, "{book} {chapter}" would become "Psalms 23".')
			.addText(text => text
				.setPlaceholder(this.plugin.settings.chapter_name_format)
				.setValue(this.plugin.settings.chapter_name_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_name_format = value;
					await this.plugin.saveSettings();
				}))

		new Setting(containerEl)
			.setName('Padded Bible Order Numbers')
			.setDesc('When *ON*, changes "{order}" in the names of book folders to be padded with extra zeros. For example, "1 Genesis" would become "01 Gensis" when turned *ON*.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.padded_order)
				.onChange(async (value) => {
					this.plugin.settings.padded_order = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Padded Chapter Numbers')
			.setDesc('When *ON*, changes "{chapter}" (and related) in the names of chapters to be padded with extra zeros. For example, "Psalms 5" would become "Psalms 005" when turned *ON*.')
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
				.setPlaceholder("")
				.setValue(this.plugin.settings.verse_body_format)
				.onChange(async (value) => {
					this.plugin.settings.verse_body_format = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Chapter Body Format')
			.setDesc('Formatting for the body of chapter notes.')
			.addTextArea(text => text
				.setPlaceholder("")
				.setValue(this.plugin.settings.chapter_body_format)
				.onChange(async (value) => {
					this.plugin.settings.chapter_body_format = value;
					await this.plugin.saveSettings();
				}))
		
		new Setting(containerEl)
			.setName('Save Bible Locally')
			.setDesc('When *ON*, saves every downloaded chapter in a local file, so that it can be accessed without an internet connection.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.store_locally)
				.onChange(async (value) => {
					this.plugin.settings.store_locally = value;
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